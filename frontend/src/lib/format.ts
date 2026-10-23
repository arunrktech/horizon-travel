import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Money arrives as integer cents; format only here. */
export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** Timestamps arrive in UTC; show them in the viewer's time zone. */
export const dateTime = (iso: string | null | undefined) => (iso ? format(parseISO(iso), "EEE d MMM yyyy, h:mm a") : "");
export const dateOnly = (iso: string | null | undefined) => (iso ? format(parseISO(iso), "EEE d MMM yyyy") : "");
export const timeOnly = (iso: string) => format(parseISO(iso), "h:mm a");
export const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`;
}

/** yyyy-MM-dd in local time, n days from today */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return format(d, "yyyy-MM-dd");
}

export const newIdempotencyKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
