import { USE_MOCK } from "./config";
import { request } from "./http";
import { mock } from "./mock/mockBackend";
import type { Booking, BookingListParams, BookingStats, CheckoutResponse, CreateBookingRequest, MockPaymentRequest, Page } from "./types";

export interface BookingClient {
  /** idempotencyKey: one UUID per checkout attempt, reused when retrying the same attempt. */
  create(body: CreateBookingRequest, idempotencyKey: string): Promise<Booking>;
  get(id: string): Promise<Booking>;
  list(params: BookingListParams): Promise<Page<Booking>>;
  checkout(id: string): Promise<CheckoutResponse>;
  cancel(id: string): Promise<Booking>;
  mockPayment(id: string, body: MockPaymentRequest): Promise<Booking>;
  stats(): Promise<BookingStats>;
}

const real: BookingClient = {
  create: (body, key) => request("POST", "/api/bookings", { body, headers: { "Idempotency-Key": key } }),
  get: (id) => request("GET", `/api/bookings/${id}`),
  list: (p) => request("GET", "/api/bookings", { query: { ...p } }),
  checkout: (id) => request("POST", `/api/bookings/${id}/checkout`),
  cancel: (id) => request("POST", `/api/bookings/${id}/cancel`),
  mockPayment: (id, body) => request("POST", `/api/bookings/${id}/mock-payment`, { body }),
  stats: () => request("GET", "/api/bookings/stats"),
};

const fake: BookingClient = {
  create: mock.createBooking,
  get: mock.getBooking,
  list: mock.listBookings,
  checkout: mock.checkout,
  cancel: mock.cancel,
  mockPayment: mock.mockPayment,
  stats: mock.stats,
};

export const bookingClient: BookingClient = USE_MOCK ? fake : real;
