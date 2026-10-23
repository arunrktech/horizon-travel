import { USE_MOCK } from "./config";
import { request } from "./http";
import { mock } from "./mock/mockBackend";
import type { Customer, CustomerUpdate, Page } from "./types";

export interface CustomerClient {
  me(): Promise<Customer>;
  updateMe(update: CustomerUpdate): Promise<Customer>;
  list(query?: string, page?: number, pageSize?: number): Promise<Page<Customer>>;
  get(id: string): Promise<Customer>;
}

const real: CustomerClient = {
  me: () => request("GET", "/api/customers/me"),
  updateMe: (body) => request("PUT", "/api/customers/me", { body }),
  list: (query, page = 1, pageSize = 20) => request("GET", "/api/customers", { query: { query, page, pageSize } }),
  get: (id) => request("GET", `/api/customers/${id}`),
};

const fake: CustomerClient = {
  me: mock.me,
  updateMe: mock.updateMe,
  list: mock.listCustomers,
  get: mock.getCustomer,
};

export const customerClient: CustomerClient = USE_MOCK ? fake : real;
