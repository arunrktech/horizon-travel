/**
 * API contract between the frontend and the Horizon Travel microservices.
 *
 * This file is the single source of truth for request and response shapes.
 * The Python services mirror every type here as Pydantic models
 * (services/<service>/app/schemas.py) with camelCase JSON aliases.
 *
 * Conventions
 *  - JSON field names are camelCase.
 *  - Money is integer cents plus an ISO 4217 currency code.
 *  - Dates are "YYYY-MM-DD"; timestamps are ISO 8601 in UTC.
 *  - Errors are { error: { code, message } } with a matching HTTP status.
 */

export type ISODate = string;
export type ISODateTime = string;
export type UUID = string;

/** Every service: GET /health */
export interface Health {
  status: "ok";
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Paged lists return this envelope. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Search service, path prefix /api/search                             */
/* ------------------------------------------------------------------ */

/** GET /api/search/locations */
export interface Location {
  code: string; // IATA airport code
  city: string;
  country: string;
  airport: string;
}

/** GET /api/search/flights?from&to&departDate&returnDate&passengers */
export interface FlightSearchParams {
  from: string;
  to: string;
  departDate: ISODate;
  returnDate?: ISODate;
  passengers: number;
}

export interface FlightOffer {
  id: string;
  supplierRef: string;
  direction: "outbound" | "return";
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departAt: ISODateTime;
  arriveAt: ISODateTime;
  durationMinutes: number;
  stops: number;
  cabin: string;
  passengers: number;
  /** Total for all passengers */
  priceCents: number;
  currency: string;
  seatsLeft: number;
}

/** GET /api/search/hotels?city&checkIn&checkOut&guests */
export interface HotelSearchParams {
  city: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
}

export interface HotelOffer {
  id: string;
  supplierRef: string;
  name: string;
  city: string;
  neighbourhood: string;
  stars: number;
  reviewScore: number;
  reviewCount: number;
  roomType: string;
  checkIn: ISODate;
  checkOut: ISODate;
  nights: number;
  guests: number;
  pricePerNightCents: number;
  totalPriceCents: number;
  currency: string;
  amenities: string[];
  freeCancellation: boolean;
}

/** GET /api/search/activities?city&date */
export interface ActivitySearchParams {
  city: string;
  date: ISODate;
}

export interface ActivityOffer {
  id: string;
  supplierRef: string;
  name: string;
  city: string;
  category: string;
  date: ISODate;
  startTime: string; // "HH:MM" local to the destination
  durationMinutes: number;
  rating: number;
  priceCents: number;
  currency: string;
  spotsLeft: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  /** True when served from the ElastiCache result cache */
  cached: boolean;
}

/* ------------------------------------------------------------------ */
/* Booking service, path prefix /api/bookings                          */
/* ------------------------------------------------------------------ */

export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "FAILED";
export type ItemType = "flight" | "accommodation" | "activity";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUND_PENDING";

export interface LeadTraveller {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * POST /api/bookings
 * Header "Idempotency-Key: <uuid>" is required: one key per checkout attempt,
 * reused on retry. Only supplier references are sent; the server re-prices
 * every item from the search service, so prices never come from the browser.
 * 201 Created, or 200 with the original booking when the key is replayed.
 */
export interface CreateBookingRequest {
  leadTraveller: LeadTraveller;
  items: { type: ItemType; supplierRef: string }[];
}

export interface BookingItem {
  id: UUID;
  type: ItemType;
  supplierRef: string;
  title: string;
  startAt: ISODateTime | null;
  endAt: ISODateTime | null;
  priceCents: number;
  /** The offer as it was when booked (FlightOffer, HotelOffer or ActivityOffer) */
  details: Record<string, unknown>;
}

export interface PaymentSummary {
  provider: "stripe" | "mock";
  status: PaymentStatus;
  amountCents: number;
  updatedAt: ISODateTime;
}

/** GET /api/bookings/{id} */
export interface Booking {
  id: UUID;
  reference: string; // e.g. HZ-7K3QPD
  status: BookingStatus;
  customerId: UUID;
  leadTraveller: LeadTraveller;
  items: BookingItem[];
  totalCents: number;
  currency: string;
  payment: PaymentSummary | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
}

/** GET /api/bookings?customerId&status&from&to&query&page&pageSize (staff see all, customers see their own) */
export interface BookingListParams {
  customerId?: UUID;
  status?: BookingStatus;
  from?: ISODate;
  to?: ISODate;
  query?: string;
  page?: number;
  pageSize?: number;
}

/** POST /api/bookings/{id}/checkout. Redirect the browser to checkoutUrl (Stripe hosted checkout). */
export interface CheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

/** POST /api/bookings/{id}/mock-payment (local and demo mode only) */
export interface MockPaymentRequest {
  sessionId: string;
  outcome: "succeeded" | "failed";
}

export interface Departure {
  bookingId: UUID;
  reference: string;
  travellerName: string;
  title: string;
  startAt: ISODateTime;
}

/** GET /api/bookings/stats (staff only) */
export interface BookingStats {
  bookingsToday: number;
  revenueMonthCents: number;
  currency: string;
  upcomingDepartures: number;
  nextDepartures: Departure[];
  failedPaymentsLast30Days: number;
  pendingPayment: number;
}

/* ------------------------------------------------------------------ */
/* Customer service, path prefix /api/customers                        */
/* ------------------------------------------------------------------ */

/** GET /api/customers/me, GET /api/customers/{id}, GET /api/customers?query&page&pageSize (staff) */
export interface Customer {
  id: UUID;
  name: string;
  email: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  /** Only the last four characters are ever returned; the full number is encrypted at rest. */
  passportLast4: string | null;
  createdAt: ISODateTime;
}

/** PUT /api/customers/me */
export interface CustomerUpdate {
  name?: string;
  phone?: string;
  addressLine?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  passportNumber?: string;
}

/* ------------------------------------------------------------------ */
/* Document service, path prefix /api/documents                        */
/* ------------------------------------------------------------------ */

/** GET /api/documents?bookingId. downloadUrl is short lived (5 minutes). */
export interface TravelDocument {
  id: UUID;
  bookingId: UUID;
  kind: "itinerary" | "invoice";
  fileName: string;
  createdAt: ISODateTime;
  downloadUrl: string;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */

export type Role = "customer" | "staff";

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  role: Role;
}
