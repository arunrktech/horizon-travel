import { USE_MOCK } from "./config";
import { request } from "./http";
import { mock } from "./mock/mockBackend";
import type { ActivityOffer, ActivitySearchParams, FlightOffer, FlightSearchParams, HotelOffer, HotelSearchParams, Location, SearchResult } from "./types";

export interface SearchClient {
  locations(): Promise<Location[]>;
  flights(params: FlightSearchParams): Promise<SearchResult<FlightOffer>>;
  hotels(params: HotelSearchParams): Promise<SearchResult<HotelOffer>>;
  activities(params: ActivitySearchParams): Promise<SearchResult<ActivityOffer>>;
}

const real: SearchClient = {
  locations: () => request("GET", "/api/search/locations"),
  flights: (p) => request("GET", "/api/search/flights", { query: { ...p } }),
  hotels: (p) => request("GET", "/api/search/hotels", { query: { ...p } }),
  activities: (p) => request("GET", "/api/search/activities", { query: { ...p } }),
};

const fake: SearchClient = {
  locations: mock.locations,
  flights: mock.flights,
  hotels: mock.hotels,
  activities: mock.activities,
};

export const searchClient: SearchClient = USE_MOCK ? fake : real;
