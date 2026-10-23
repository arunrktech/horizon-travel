"""Supplier adapters.

Real agencies reach airlines and hotels through a GDS (Amadeus, Sabre) or
aggregator APIs. Every adapter implements SupplierAdapter, so swapping the
mock for a real one is a configuration change, not a rewrite of the service.

MockSupplier is deterministic: the same query always returns the same offers,
which keeps demos and tests repeatable.
"""
import hashlib
import random
from abc import ABC, abstractmethod
from datetime import date, datetime, time, timedelta, timezone

from .schemas import ActivityOffer, FlightOffer, HotelOffer, Location

LOCATIONS: list[Location] = [
    Location(code=c, city=city, country=country, airport=airport)
    for c, city, country, airport in [
        ("BOS", "Boston", "United States", "Logan International"),
        ("JFK", "New York", "United States", "John F. Kennedy International"),
        ("ORD", "Chicago", "United States", "O'Hare International"),
        ("MIA", "Miami", "United States", "Miami International"),
        ("LAX", "Los Angeles", "United States", "Los Angeles International"),
        ("SFO", "San Francisco", "United States", "San Francisco International"),
        ("CUN", "Cancun", "Mexico", "Cancun International"),
        ("SJU", "San Juan", "Puerto Rico", "Luis Munoz Marin International"),
        ("LHR", "London", "United Kingdom", "Heathrow"),
        ("CDG", "Paris", "France", "Charles de Gaulle"),
        ("FCO", "Rome", "Italy", "Fiumicino"),
        ("BCN", "Barcelona", "Spain", "El Prat"),
        ("LIS", "Lisbon", "Portugal", "Humberto Delgado"),
        ("DXB", "Dubai", "United Arab Emirates", "Dubai International"),
        ("DEL", "Delhi", "India", "Indira Gandhi International"),
        ("NRT", "Tokyo", "Japan", "Narita International"),
    ]
]
BY_CODE = {l.code: l for l in LOCATIONS}
BY_CITY = {l.city.lower(): l for l in LOCATIONS}

AIRLINES = [("Delta", "DL"), ("JetBlue", "B6"), ("United", "UA"), ("American", "AA"), ("British Airways", "BA"),
            ("Air France", "AF"), ("TAP Air Portugal", "TP"), ("Emirates", "EK"), ("Lufthansa", "LH")]
HOTEL_PREFIX = ["Harbor", "Grand", "Old Town", "Riverside", "Garden", "Central", "Bayview", "Courtyard", "Plaza", "Atlas"]
HOTEL_SUFFIX = ["Hotel", "Suites", "Inn", "Residences", "Boutique Hotel"]
NEIGHBOURHOODS = ["City centre", "Waterfront", "Old quarter", "Financial district", "Arts district", "Near the airport"]
ROOMS = ["Standard queen", "Deluxe king", "Twin room", "Junior suite", "Family room"]
AMENITIES = ["Free wifi", "Breakfast included", "Pool", "Gym", "Airport shuttle", "Spa", "Parking", "Kitchenette"]
ACTIVITY_TEMPLATES = [
    ("Walking food tour of {city}", "Food and drink", 180), ("{city} highlights by bike", "Outdoors", 150),
    ("Sunset boat cruise", "Sightseeing", 120), ("Museum skip the line pass", "Culture", 240),
    ("Cooking class with a local chef", "Food and drink", 210), ("Day trip to the countryside", "Day trips", 540),
    ("Street art and history walk", "Culture", 120), ("Guided kayak tour", "Outdoors", 180),
]


def _rng(*parts: object) -> random.Random:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def _ref(prefix: str, *parts: object) -> str:
    return f"{prefix}-" + hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12].upper()


class SupplierAdapter(ABC):
    @abstractmethod
    def flights(self, origin: str, destination: str, day: date, passengers: int, direction: str) -> list[FlightOffer]: ...

    @abstractmethod
    def hotels(self, city: str, check_in: date, check_out: date, guests: int) -> list[HotelOffer]: ...

    @abstractmethod
    def activities(self, city: str, day: date) -> list[ActivityOffer]: ...


class MockSupplier(SupplierAdapter):
    def flights(self, origin, destination, day, passengers, direction):
        rng = _rng("flights", origin, destination, day, passengers, direction)
        long_haul = BY_CODE[origin].country != BY_CODE[destination].country
        base = rng.randint(380, 620) if long_haul else rng.randint(110, 260)
        offers = []
        for i in range(rng.randint(7, 11)):
            airline, code = rng.choice(AIRLINES)
            stops = rng.choices([0, 1, 2], weights=[5, 4, 1])[0]
            duration = (rng.randint(380, 720) if long_haul else rng.randint(90, 330)) + stops * rng.randint(55, 140)
            depart = datetime.combine(day, time(rng.randint(5, 21), rng.choice([0, 15, 30, 45])), tzinfo=timezone.utc)
            fare = int((base + rng.randint(-40, 220) - stops * 35) * 100)
            fare = max(fare, 8900)
            number = f"{code}{rng.randint(100, 2999)}"
            ref = _ref("FL", origin, destination, day, number, direction, passengers)
            offers.append(FlightOffer(
                id=ref, supplier_ref=ref, direction=direction, airline=airline, airline_code=code, flight_number=number,
                origin=origin, destination=destination, depart_at=depart, arrive_at=depart + timedelta(minutes=duration),
                duration_minutes=duration, stops=stops, cabin="Economy", passengers=passengers,
                price_cents=fare * passengers, currency="USD", seats_left=rng.randint(1, 9),
            ))
        return sorted(offers, key=lambda o: o.price_cents)

    def hotels(self, city, check_in, check_out, guests):
        rng = _rng("hotels", city.lower(), check_in, check_out, guests)
        nights = (check_out - check_in).days
        offers = []
        for i in range(rng.randint(8, 12)):
            stars = rng.choices([2, 3, 4, 5], weights=[1, 4, 4, 2])[0]
            name = f"{rng.choice(HOTEL_PREFIX)} {rng.choice(HOTEL_SUFFIX)} {city}"
            nightly = int((60 + stars * 45 + rng.randint(-25, 90)) * 100)
            ref = _ref("HT", city.lower(), check_in, check_out, guests, i, name)
            offers.append(HotelOffer(
                id=ref, supplier_ref=ref, name=name, city=city, neighbourhood=rng.choice(NEIGHBOURHOODS), stars=stars,
                review_score=round(rng.uniform(6.8, 9.6), 1), review_count=rng.randint(80, 4200),
                room_type=rng.choice(ROOMS), check_in=check_in, check_out=check_out, nights=nights, guests=guests,
                price_per_night_cents=nightly, total_price_cents=nightly * nights, currency="USD",
                amenities=sorted(rng.sample(AMENITIES, rng.randint(2, 5))), free_cancellation=rng.random() > 0.35,
            ))
        return sorted(offers, key=lambda o: o.total_price_cents)

    def activities(self, city, day):
        rng = _rng("activities", city.lower(), day)
        offers = []
        for i, (template, category, minutes) in enumerate(rng.sample(ACTIVITY_TEMPLATES, rng.randint(5, 8))):
            name = template.format(city=city)
            ref = _ref("AC", city.lower(), day, name)
            offers.append(ActivityOffer(
                id=ref, supplier_ref=ref, name=name, city=city, category=category, date=day,
                start_time=f"{rng.randint(8, 18):02d}:{rng.choice(['00', '30'])}", duration_minutes=minutes,
                rating=round(rng.uniform(4.1, 4.9), 1), price_cents=int(rng.randint(29, 189) * 100),
                currency="USD", spots_left=rng.randint(2, 20),
            ))
        return sorted(offers, key=lambda o: o.start_time)


def get_supplier() -> SupplierAdapter:
    return MockSupplier()
