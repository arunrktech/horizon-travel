import { API_BASE_URL } from "./config";
import type { ApiErrorBody } from "./types";

/** Error carrying the service's { error: { code, message } } body. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let tokenProvider: () => string | null = () => null;

/** The AuthProvider registers how to get the current token. */
export function setTokenProvider(fn: () => string | null) {
  tokenProvider = fn;
}

export function getCurrentToken(): string | null {
  return tokenProvider();
}

type Query =Record<string, string | number | boolean | undefined | null>;

export function buildQuery(params?: Query): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  const token = tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "We could not reach Horizon Travel. Check your connection and try again.");
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* non JSON error page from a proxy */
  }
  throw new ApiError(
    response.status,
    body?.error?.code ?? "HTTP_ERROR",
    body?.error?.message ?? `The server returned ${response.status}. Please try again.`,
  );
}
