/**
 * In browser stand in for the five microservices, used when VITE_API_BASE_URL
 * is empty. It follows the same rules as the real services (server side
 * pricing, idempotency keys, one live booking per supplier offer, ownership
 * checks) so the UI behaves the same in both modes. Data persists in
 * localStorage for this browser only.
 */
import { ApiError, getCurrentToken } from "../http";
import type {
  ActivityOffer, ActivitySearchParams, AuthUser, Booking, BookingItem, BookingListParams, BookingStats,
  CheckoutResponse, CreateBookingRequest, Customer, CustomerUpdate, FlightOffer, FlightSearchParams, HotelOffer,
  HotelSearchParams, Location, MockPaymentRequest, Page, SearchResult, TravelDocument,
} from "../types";

/* ---------------- identity (same dev tokens the real services accept) ---------------- */

export const MOCK_USERS: Record<string, AuthUser> = {
  "dev-customer": { sub: "dev-customer-1", name: "Priya Shah", email: "priya.shah@example.com", role: "customer" },
  "dev-staff": { sub: "dev-staff-1", name: "Dana Lopez", email: "dana.lopez@horizontravel.example", role: "staff" },
};

function principal(): AuthUser {
  const token = getCurrentToken();
  const user = token ? MOCK_USERS[token] : undefined;
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return user;
}

function requireStaff(): AuthUser {
  const p = principal();
  if (p.role !== "staff") throw new ApiError(403, "FORBIDDEN", "This area is for agency staff only.");
  return p;
}

const delay = (ms = 250 + Math.random() * 300) => new Promise((r) => setTimeout(r, ms));

/* ---------------- deterministic offers ---------------- */

export const LOCATIONS: Location[] = [
  ["BOS", "Boston", "United States", "Logan International"],
  ["JFK", "New York", "United States", "John F. Kennedy International"],
  ["ORD", "Chicago", "United States", "O'Hare International"],
  ["MIA", "Miami", "United States", "Miami International"],
  ["LAX", "Los Angeles", "United States", "Los Angeles International"],
  ["SFO", "San Francisco", "United States", "San Francisco International"],
  ["CUN", "Cancun", "Mexico", "Cancun International"],
  ["SJU", "San Juan", "Puerto Rico", "Luis Munoz Marin International"],
  ["LHR", "London", "United Kingdom", "Heathrow"],
  ["CDG", "Paris", "France", "Charles de Gaulle"],
  ["FCO", "Rome", "Italy", "Fiumicino"],
  ["BCN", "Barcelona", "Spain", "El Prat"],
  ["LIS", "Lisbon", "Portugal", "Humberto Delgado"],
  ["DXB", "Dubai", "United Arab Emirates", "Dubai International"],
  ["DEL", "Delhi", "India", "Indira Gandhi International"],
  ["NRT", "Tokyo", "Japan", "Narita International"],
].map(([code, city, country, airport]) => ({ code, city, country, airport }));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)],
    real: next,
  };
}
const ref = (prefix: string, ...parts: unknown[]) => `${prefix}-${hash(parts.join("|")).toString(16).toUpperCase().padStart(8, "0")}`;

const AIRLINES: [string, string][] = [["Delta", "DL"], ["JetBlue", "B6"], ["United", "UA"], ["American", "AA"], ["British Airways", "BA"], ["Air France", "AF"], ["TAP Air Portugal", "TP"], ["Emirates", "EK"]];
type Held = { type: BookingItem["type"]; title: string; priceCents: number; startAt: string | null; endAt: string | null; details: Record<string, unknown> };
/** Offers returned by searches, like the search service's 30 minute hold. Kept in sessionStorage so a reload keeps them. */
const HOLD_KEY = "horizon.mock.holds";
const offerHold = {
  read(): Record<string, Held> {
    try { return JSON.parse(sessionStorage.getItem(HOLD_KEY) ?? "{}") as Record<string, Held>; } catch { return memoryHolds; }
  },
  get(ref: string): Held | undefined { return this.read()[ref]; },
  set(ref: string, held: Held) {
    const all = this.read();
    all[ref] = held;
    memoryHolds = all;
    try { sessionStorage.setItem(HOLD_KEY, JSON.stringify(all)); } catch { /* storage blocked: memory only */ }
  },
};
let memoryHolds: Record<string, Held> = {};
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const pastDate = (d: string) => new Date(d + "T00:00:00Z") < today();
const cityOf = (name: string) => LOCATIONS.find((l) => l.city.toLowerCase() === name.trim().toLowerCase() || l.code === name.trim().toUpperCase());

function flights(origin: string, destination: string, day: string, pax: number, direction: "outbound" | "return"): FlightOffer[] {
  const r = rng(`fl|${origin}|${destination}|${day}|${pax}|${direction}`);
  const o = LOCATIONS.find((l) => l.code === origin)!;
  const d = LOCATIONS.find((l) => l.code === destination)!;
  const long = o.country !== d.country;
  const base = long ? r.int(380, 620) : r.int(110, 260);
  return Array.from({ length: r.int(7, 10) }, () => {
    const [airline, code] = r.pick(AIRLINES);
    const stops = r.pick([0, 0, 0, 1, 1, 2]);
    const duration = (long ? r.int(380, 720) : r.int(90, 330)) + stops * r.int(55, 140);
    const depart = new Date(`${day}T${String(r.int(5, 21)).padStart(2, "0")}:${r.pick(["00", "15", "30", "45"])}:00Z`);
    const fare = Math.max(89, base + r.int(-40, 220) - stops * 35) * 100;
    const flightNumber = `${code}${r.int(100, 2999)}`;
    const supplierRef = ref("FL", origin, destination, day, flightNumber, direction, pax);
    const offer: FlightOffer = {
      id: supplierRef, supplierRef, direction, airline, airlineCode: code, flightNumber, origin, destination,
      departAt: depart.toISOString(), arriveAt: new Date(depart.getTime() + duration * 60000).toISOString(),
      durationMinutes: duration, stops, cabin: "Economy", passengers: pax, priceCents: fare * pax, currency: "USD", seatsLeft: r.int(1, 9),
    };
    offerHold.set(supplierRef, { type: "flight", title: `${airline} ${flightNumber} ${origin} to ${destination}`, priceCents: offer.priceCents, startAt: offer.departAt, endAt: offer.arriveAt, details: { ...offer } });
    return offer;
  }).sort((a, b) => a.priceCents - b.priceCents);
}

const HOTEL_A = ["Harbor", "Grand", "Old Town", "Riverside", "Garden", "Central", "Bayview", "Courtyard", "Plaza", "Atlas"];
const HOTEL_B = ["Hotel", "Suites", "Inn", "Residences", "Boutique Hotel"];
const AMENITIES = ["Free wifi", "Breakfast included", "Pool", "Gym", "Airport shuttle", "Spa", "Parking", "Kitchenette"];

function hotels(city: string, checkIn: string, checkOut: string, guests: number): HotelOffer[] {
  const r = rng(`ht|${city}|${checkIn}|${checkOut}|${guests}`);
  const nights = Math.round((+new Date(checkOut) - +new Date(checkIn)) / 86400000);
  return Array.from({ length: r.int(8, 11) }, (_, i) => {
    const stars = r.pick([2, 3, 3, 3, 4, 4, 4, 5]);
    const name = `${r.pick(HOTEL_A)} ${r.pick(HOTEL_B)} ${city}`;
    const nightly = (60 + stars * 45 + r.int(-25, 90)) * 100;
    const supplierRef = ref("HT", city, checkIn, checkOut, guests, i, name);
    const amenities = AMENITIES.filter(() => r.real() > 0.5).slice(0, 5);
    const offer: HotelOffer = {
      id: supplierRef, supplierRef, name, city, neighbourhood: r.pick(["City centre", "Waterfront", "Old quarter", "Financial district", "Arts district"]),
      stars, reviewScore: Math.round((6.8 + r.real() * 2.8) * 10) / 10, reviewCount: r.int(80, 4200),
      roomType: r.pick(["Standard queen", "Deluxe king", "Twin room", "Junior suite", "Family room"]), checkIn, checkOut, nights, guests,
      pricePerNightCents: nightly, totalPriceCents: nightly * nights, currency: "USD", amenities: amenities.length ? amenities : ["Free wifi"], freeCancellation: r.real() > 0.35,
    };
    offerHold.set(supplierRef, { type: "accommodation", title: `${name}, ${nights} nights`, priceCents: offer.totalPriceCents, startAt: `${checkIn}T15:00:00.000Z`, endAt: `${checkOut}T11:00:00.000Z`, details: { ...offer } });
    return offer;
  }).sort((a, b) => a.totalPriceCents - b.totalPriceCents);
}

const ACTIVITIES: [string, string, number][] = [
  ["Walking food tour of {city}", "Food and drink", 180], ["{city} highlights by bike", "Outdoors", 150], ["Sunset boat cruise", "Sightseeing", 120],
  ["Museum skip the line pass", "Culture", 240], ["Cooking class with a local chef", "Food and drink", 210], ["Day trip to the countryside", "Day trips", 540],
  ["Street art and history walk", "Culture", 120], ["Guided kayak tour", "Outdoors", 180],
];

function activities(city: string, date: string): ActivityOffer[] {
  const r = rng(`ac|${city}|${date}`);
  return ACTIVITIES.filter(() => r.real() > 0.3).map(([t, category, minutes]) => {
    const name = t.replace("{city}", city);
    const supplierRef = ref("AC", city, date, name);
    const startTime = `${String(r.int(8, 18)).padStart(2, "0")}:${r.pick(["00", "30"])}`;
    const offer: ActivityOffer = { id: supplierRef, supplierRef, name, city, category, date, startTime, durationMinutes: minutes, rating: Math.round((4.1 + r.real() * 0.8) * 10) / 10, priceCents: r.int(29, 189) * 100, currency: "USD", spotsLeft: r.int(2, 20) };
    offerHold.set(supplierRef, { type: "activity", title: name, priceCents: offer.priceCents, startAt: `${date}T${startTime}:00.000Z`, endAt: null, details: { ...offer } });
    return offer;
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/* ---------------- persistent mock database ---------------- */

interface Db {
  bookings: (Booking & { customerSub: string; sessions: string[] })[];
  customers: (Customer & { sub: string })[];
  idempotency: Record<string, { sub: string; hash: string; bookingId: string }>;
}
const KEY = "horizon.mockdb.v1";

function seed(): Db {
  const people: [string, string, string, string][] = [
    ["dev-customer-1", "Priya Shah", "priya.shah@example.com", "+1 617 555 0142"],
    ["cust-2", "Marcus Bell", "marcus.bell@example.com", "+1 978 555 0187"],
    ["cust-3", "Elena Rossi", "elena.rossi@example.com", "+1 781 555 0119"],
    ["cust-4", "James O'Connor", "james.oconnor@example.com", "+1 508 555 0164"],
    ["cust-5", "Aisha Karim", "aisha.karim@example.com", "+1 978 555 0101"],
  ];
  const now = Date.now();
  const customers = people.map(([sub, name, email, phone], i) => ({
    sub, id: `c0000000-0000-4000-8000-00000000000${i + 1}`, name, email, phone, addressLine: null, city: i % 2 ? "Andover" : "Lowell",
    postalCode: null, country: "United States", passportLast4: null, createdAt: new Date(now - (40 - i * 6) * 86400000).toISOString(),
  }));
  const plans: [number, string, string, BookingItem["type"], number, Booking["status"], number][] = [
    [1, "HZ-K7M2QD", "Delta DL1184 BOS to CUN", "flight", 84200, "CONFIRMED", 4],
    [2, "HZ-P3WX9A", "Grand Suites Rome, 5 nights", "accommodation", 142500, "CONFIRMED", 9],
    [3, "HZ-T8RB4C", "TAP Air Portugal TP218 BOS to LIS", "flight", 131600, "CONFIRMED", 2],
    [4, "HZ-H2NE6V", "Harbor Inn Barcelona, 4 nights", "accommodation", 76800, "PENDING_PAYMENT", 20],
    [1, "HZ-Z5QJ8L", "Sunset boat cruise", "activity", 13800, "CANCELLED", 30],
    [3, "HZ-M4FA7K", "United UA902 BOS to LHR", "flight", 98700, "FAILED", 12],
  ];
  const bookings = plans.map(([ci, reference, title, type, cents, status, daysAhead], i) => {
    const c = customers[ci - 1];
    const created = new Date(now - (i + 1) * 36 * 3600000).toISOString();
    const start = new Date(now + daysAhead * 86400000).toISOString();
    const [first, ...rest] = c.name.split(" ");
    return {
      id: `b0000000-0000-4000-8000-00000000000${i + 1}`, reference, status, customerId: c.id, customerSub: c.sub, sessions: [],
      leadTraveller: { firstName: first, lastName: rest.join(" "), email: c.email, phone: c.phone ?? "" },
      items: [{ id: `i000000${i}`, type, supplierRef: `SEED-${i}`, title, startAt: start, endAt: null, priceCents: cents, details: {} }],
      totalCents: cents, currency: "USD",
      payment: status === "PENDING_PAYMENT" ? null : { provider: "mock" as const, status: status === "CONFIRMED" ? ("PAID" as const) : status === "CANCELLED" ? ("REFUND_PENDING" as const) : ("FAILED" as const), amountCents: cents, updatedAt: created },
      createdAt: created, updatedAt: created, confirmedAt: status === "CONFIRMED" ? created : null, cancelledAt: status === "CANCELLED" ? created : null,
    };
  });
  return { bookings, customers, idempotency: {} };
}

let db: Db = load();
function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* storage blocked: start fresh */ }
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ }
}
export function resetMockData() {
  db = seed();
  save();
}

const strip = ({ customerSub: _s, sessions: _x, ...b }: Db["bookings"][number]): Booking => b;
const stripCustomer = ({ sub: _s, ...c }: Db["customers"][number]): Customer => c;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const paginate = <T,>(xs: T[], page = 1, pageSize = 20): Page<T> => ({ items: xs.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: xs.length });

function ensureCustomer(p: AuthUser, phone?: string) {
  let c = db.customers.find((x) => x.sub === p.sub);
  if (!c) {
    c = { sub: p.sub, id: uuid(), name: p.name, email: p.email, phone: phone ?? null, addressLine: null, city: null, postalCode: null, country: null, passportLast4: null, createdAt: new Date().toISOString() };
    db.customers.unshift(c);
  }
  return c;
}

function owned(id: string) {
  const p = principal();
  const b = db.bookings.find((x) => x.id === id);
  if (!b) throw new ApiError(404, "NOT_FOUND", "Booking was not found.");
  if (p.role !== "staff" && b.customerSub !== p.sub) throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
  return b;
}

/* ---------------- the mock "services" ---------------- */

export const mock = {
  async locations(): Promise<Location[]> {
    await delay(80);
    return LOCATIONS;
  },
  async flights(q: FlightSearchParams): Promise<SearchResult<FlightOffer>> {
    await delay();
    if (q.from === q.to) throw new ApiError(422, "SAME_AIRPORT", "Origin and destination must be different.");
    if (pastDate(q.departDate)) throw new ApiError(422, "DATE_IN_PAST", "The departure date has already passed.");
    if (q.returnDate && q.returnDate < q.departDate) throw new ApiError(422, "RETURN_BEFORE_DEPART", "The return date must be on or after the departure date.");
    const items = flights(q.from, q.to, q.departDate, q.passengers, "outbound").concat(q.returnDate ? flights(q.to, q.from, q.returnDate, q.passengers, "return") : []);
    return { items, total: items.length, cached: false };
  },
  async hotels(q: HotelSearchParams): Promise<SearchResult<HotelOffer>> {
    await delay();
    const loc = cityOf(q.city);
    if (!loc) throw new ApiError(422, "UNKNOWN_CITY", `We do not have inventory for '${q.city}' yet.`);
    if (pastDate(q.checkIn)) throw new ApiError(422, "DATE_IN_PAST", "The check in date has already passed.");
    if (q.checkOut <= q.checkIn) throw new ApiError(422, "CHECKOUT_BEFORE_CHECKIN", "Check out must be after check in.");
    const items = hotels(loc.city, q.checkIn, q.checkOut, q.guests);
    return { items, total: items.length, cached: false };
  },
  async activities(q: ActivitySearchParams): Promise<SearchResult<ActivityOffer>> {
    await delay();
    const loc = cityOf(q.city);
    if (!loc) throw new ApiError(422, "UNKNOWN_CITY", `We do not have inventory for '${q.city}' yet.`);
    if (pastDate(q.date)) throw new ApiError(422, "DATE_IN_PAST", "That date has already passed.");
    const items = activities(loc.city, q.date);
    return { items, total: items.length, cached: false };
  },

  async createBooking(body: CreateBookingRequest, idempotencyKey: string): Promise<Booking> {
    await delay(500);
    const p = principal();
    const digest = String(hash(JSON.stringify(body)));
    const prior = db.idempotency[idempotencyKey];
    if (prior) {
      if (prior.sub !== p.sub || prior.hash !== digest) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
      return strip(db.bookings.find((b) => b.id === prior.bookingId)!);
    }
    const held = body.items.map((i) => {
      const o = offerHold.get(i.supplierRef);
      if (!o) throw new ApiError(409, "OFFER_EXPIRED", "One of the offers in your trip has expired. Search again for current prices.");
      return { ...o, supplierRef: i.supplierRef };
    });
    const live = new Set(db.bookings.filter((b) => b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED").flatMap((b) => b.items.map((i) => i.supplierRef)));
    if (held.some((h) => live.has(h.supplierRef))) throw new ApiError(409, "OFFER_ALREADY_BOOKED", "Someone has just booked one of these offers. Search again to pick another.");
    const c = ensureCustomer(p, body.leadTraveller.phone);
    const now = new Date().toISOString();
    const booking = {
      id: uuid(), reference: "HZ-" + Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(""),
      status: "PENDING_PAYMENT" as const, customerId: c.id, customerSub: p.sub, sessions: [], leadTraveller: body.leadTraveller,
      items: held.map((h) => ({ id: uuid(), type: h.type, supplierRef: h.supplierRef, title: h.title, startAt: h.startAt, endAt: h.endAt, priceCents: h.priceCents, details: h.details })),
      totalCents: held.reduce((s, h) => s + h.priceCents, 0), currency: "USD", payment: null, createdAt: now, updatedAt: now, confirmedAt: null, cancelledAt: null,
    };
    db.bookings.unshift(booking);
    db.idempotency[idempotencyKey] = { sub: p.sub, hash: digest, bookingId: booking.id };
    save();
    return strip(booking);
  },
  async getBooking(id: string): Promise<Booking> {
    await delay(150);
    return strip(owned(id));
  },
  async listBookings(q: BookingListParams): Promise<Page<Booking>> {
    await delay();
    const p = principal();
    const text = q.query?.trim().toLowerCase();
    const rows = db.bookings.filter((b) =>
      (p.role === "staff" ? !q.customerId || b.customerId === q.customerId : b.customerSub === p.sub) &&
      (!q.status || b.status === q.status) &&
      (!q.from || b.createdAt.slice(0, 10) >= q.from) && (!q.to || b.createdAt.slice(0, 10) <= q.to) &&
      (!text || b.reference.toLowerCase().includes(text) || `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}`.toLowerCase().includes(text) || b.leadTraveller.email.toLowerCase().includes(text)),
    );
    return paginate(rows.map(strip), q.page, q.pageSize);
  },
  async checkout(id: string): Promise<CheckoutResponse> {
    await delay(300);
    const b = owned(id);
    if (b.status !== "PENDING_PAYMENT") throw new ApiError(409, "NOT_PAYABLE", `This booking is ${b.status.toLowerCase().replace("_", " ")} and cannot be paid.`);
    const sessionId = `mock_${uuid().replace(/-/g, "")}`;
    b.sessions.push(sessionId);
    b.payment = { provider: "mock", status: "PENDING", amountCents: b.totalCents, updatedAt: new Date().toISOString() };
    save();
    return { sessionId, checkoutUrl: `${window.location.origin}/pay/mock?bookingId=${b.id}&sessionId=${sessionId}` };
  },
  async mockPayment(id: string, body: MockPaymentRequest): Promise<Booking> {
    await delay(700);
    const b = owned(id);
    if (!b.sessions.includes(body.sessionId)) throw new ApiError(404, "NOT_FOUND", "Payment session was not found.");
    const now = new Date().toISOString();
    if (b.status === "PENDING_PAYMENT") {
      if (body.outcome === "succeeded") Object.assign(b, { status: "CONFIRMED", confirmedAt: now, payment: { provider: "mock", status: "PAID", amountCents: b.totalCents, updatedAt: now } });
      else Object.assign(b, { status: "FAILED", payment: { provider: "mock", status: "FAILED", amountCents: b.totalCents, updatedAt: now } });
      b.updatedAt = now;
      save();
    }
    return strip(b);
  },
  async cancel(id: string): Promise<Booking> {
    await delay(400);
    const b = owned(id);
    if (b.status === "CANCELLED" || b.status === "FAILED") throw new ApiError(409, "NOT_CANCELLABLE", `This booking is already ${b.status.toLowerCase()}.`);
    const now = new Date().toISOString();
    Object.assign(b, { status: "CANCELLED", cancelledAt: now, updatedAt: now });
    if (b.payment?.status === "PAID") b.payment = { ...b.payment, status: "REFUND_PENDING", updatedAt: now };
    save();
    return strip(b);
  },
  async stats(): Promise<BookingStats> {
    await delay();
    requireStaff();
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const month = todayStr.slice(0, 7);
    const confirmed = db.bookings.filter((b) => b.status === "CONFIRMED");
    const departures = confirmed.flatMap((b) => b.items.filter((i) => i.startAt && +new Date(i.startAt) > now && +new Date(i.startAt) < now + 14 * 86400000)
      .map((i) => ({ bookingId: b.id, reference: b.reference, travellerName: `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}`, title: i.title, startAt: i.startAt! })))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      bookingsToday: db.bookings.filter((b) => b.createdAt.startsWith(todayStr) && (b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT")).length,
      revenueMonthCents: confirmed.filter((b) => (b.confirmedAt ?? "").startsWith(month)).reduce((s, b) => s + b.totalCents, 0),
      currency: "USD",
      upcomingDepartures: new Set(departures.map((d) => d.bookingId)).size,
      nextDepartures: departures.slice(0, 6),
      failedPaymentsLast30Days: db.bookings.filter((b) => b.status === "FAILED" && +new Date(b.createdAt) > now - 30 * 86400000).length,
      pendingPayment: db.bookings.filter((b) => b.status === "PENDING_PAYMENT").length,
    };
  },

  async me(): Promise<Customer> {
    await delay(150);
    const c = ensureCustomer(principal());
    save();
    return stripCustomer(c);
  },
  async updateMe(u: CustomerUpdate): Promise<Customer> {
    await delay(300);
    const c = ensureCustomer(principal());
    const { passportNumber, ...rest } = u;
    Object.assign(c, Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v?.trim() || null])));
    if (passportNumber) {
      const n = passportNumber.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z0-9]{6,12}$/.test(n)) throw new ApiError(422, "INVALID_PASSPORT", "Passport numbers are 6 to 12 letters and digits.");
      c.passportLast4 = n.slice(-4);
    }
    save();
    return stripCustomer(c);
  },
  async listCustomers(query?: string, page = 1, pageSize = 20): Promise<Page<Customer>> {
    await delay();
    requireStaff();
    const t = query?.trim().toLowerCase();
    return paginate(db.customers.filter((c) => !t || c.name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t) || (c.phone ?? "").includes(t)).map(stripCustomer), page, pageSize);
  },
  async getCustomer(id: string): Promise<Customer> {
    await delay(150);
    const p = principal();
    const c = db.customers.find((x) => x.id === id);
    if (!c) throw new ApiError(404, "NOT_FOUND", "Customer was not found.");
    if (p.role !== "staff" && c.sub !== p.sub) throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
    return stripCustomer(c);
  },

  async documents(bookingId: string): Promise<TravelDocument[]> {
    await delay(200);
    const b = owned(bookingId);
    if (b.status !== "CONFIRMED" && b.status !== "CANCELLED") return [];
    if (!b.confirmedAt || Date.now() - +new Date(b.confirmedAt) < 2500) return []; // the worker takes a moment
    return (["itinerary", "invoice"] as const).map((kind) => {
      const text = `Horizon Travel Services\n${kind.toUpperCase()} for booking ${b.reference}\n\n` +
        b.items.map((i) => `${i.title}  ${(i.priceCents / 100).toFixed(2)} ${b.currency}`).join("\n") +
        `\n\nTotal ${(b.totalCents / 100).toFixed(2)} ${b.currency}\n\n(Sample document from mock mode. The real service produces a PDF.)`;
      return {
        id: `${b.id}-${kind}`, bookingId: b.id, kind, fileName: `${kind}-${b.reference}.txt`, createdAt: b.confirmedAt!,
        downloadUrl: URL.createObjectURL(new Blob([text], { type: "text/plain" })),
      };
    });
  },
};
