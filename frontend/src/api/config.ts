const raw = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

/** Empty VITE_API_BASE_URL means the app runs entirely on mock data. */
export const USE_MOCK = raw === "";

/** "/" means same origin (Vite proxy locally, CloudFront in AWS). */
export const API_BASE_URL = raw === "/" ? "" : raw.replace(/\/$/, "");
