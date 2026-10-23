/**
 * The trip builder: a cart that collects flights, a stay and activities into
 * one booking. Kept in localStorage so a refresh does not lose it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ItemType } from "@/api/types";

export interface TripItem {
  type: ItemType;
  supplierRef: string;
  title: string;
  subtitle: string;
  priceCents: number;
  currency: string;
  startAt: string | null;
  /** flights only: "outbound" or "return", so a trip holds at most one of each */
  slot?: string;
}

interface TripContextValue {
  items: TripItem[];
  totalCents: number;
  currency: string;
  has(supplierRef: string): boolean;
  add(item: TripItem): void;
  remove(supplierRef: string): void;
  clear(): void;
}

const KEY = "horizon.trip";
const TripContext = createContext<TripContextValue | null>(null);

function load(): TripItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TripItem[];
  } catch {
    return [];
  }
}

export function TripProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TripItem[]>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const add = useCallback((item: TripItem) => {
    setItems((prev) => {
      // Replace the existing flight in the same slot, or the existing stay, instead of stacking duplicates.
      const kept = prev.filter((p) =>
        p.supplierRef !== item.supplierRef &&
        !(item.type === "flight" && p.type === "flight" && p.slot === item.slot) &&
        !(item.type === "accommodation" && p.type === "accommodation"),
      );
      return [...kept, item].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
    });
  }, []);
  const remove = useCallback((ref: string) => setItems((prev) => prev.filter((p) => p.supplierRef !== ref)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<TripContextValue>(() => ({
    items,
    totalCents: items.reduce((s, i) => s + i.priceCents, 0),
    currency: items[0]?.currency ?? "USD",
    has: (ref) => items.some((i) => i.supplierRef === ref),
    add, remove, clear,
  }), [items, add, remove, clear]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used inside TripProvider");
  return ctx;
}
