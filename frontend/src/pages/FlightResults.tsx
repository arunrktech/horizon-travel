import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Plane, Plus } from "lucide-react";
import { searchClient } from "@/api/searchClient";
import type { FlightOffer } from "@/api/types";
import { Button, Card, EmptyState, ErrorState, Field, ListSkeleton, Select } from "@/components/ui";
import { TripSummary } from "@/components/TripSummary";
import { PageBanner } from "@/components/PageBanner";
import { PHOTOS } from "@/content/images";
import { useTrip } from "@/trip/TripContext";
import { cn, dateOnly, duration, money, timeOnly } from "@/lib/format";

type Sort = "price" | "duration" | "depart";
type Window = "any" | "morning" | "afternoon" | "evening";

function hourOf(iso: string) {
  return new Date(iso).getHours();
}

export default function FlightResults() {
  const [sp] = useSearchParams();
  const params = {
    from: sp.get("from") ?? "", to: sp.get("to") ?? "", departDate: sp.get("departDate") ?? "",
    returnDate: sp.get("returnDate") || undefined, passengers: Number(sp.get("passengers") ?? 1),
  };
  const q = useQuery({ queryKey: ["flights", params], queryFn: () => searchClient.flights(params), enabled: !!params.from && !!params.to });
  const [leg, setLeg] = useState<"outbound" | "return">("outbound");
  const [stops, setStops] = useState("any");
  const [win, setWin] = useState<Window>("any");
  const [sort, setSort] = useState<Sort>("price");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const trip = useTrip();

  const legItems = useMemo(() => (q.data?.items ?? []).filter((f) => f.direction === leg), [q.data, leg]);
  const ceiling = Math.max(0, ...legItems.map((f) => f.priceCents));
  const shown = useMemo(() => {
    const list = legItems.filter((f) =>
      (stops === "any" || f.stops <= Number(stops)) &&
      (maxPrice === null || f.priceCents <= maxPrice) &&
      (win === "any" || (win === "morning" ? hourOf(f.departAt) < 12 : win === "afternoon" ? hourOf(f.departAt) >= 12 && hourOf(f.departAt) < 18 : hourOf(f.departAt) >= 18)),
    );
    return [...list].sort((a, b) => sort === "price" ? a.priceCents - b.priceCents : sort === "duration" ? a.durationMinutes - b.durationMinutes : a.departAt.localeCompare(b.departAt));
  }, [legItems, stops, maxPrice, win, sort]);

  const add = (f: FlightOffer) => trip.add({
    type: "flight", slot: f.direction, supplierRef: f.supplierRef, title: `${f.airline} ${f.flightNumber}, ${f.origin} to ${f.destination}`,
    subtitle: `${dateOnly(f.departAt)}, ${f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}, ${f.passengers} traveller${f.passengers > 1 ? "s" : ""}`,
    priceCents: f.priceCents, currency: f.currency, startAt: f.departAt,
  });

  return (
    <>
      <PageBanner photo={PHOTOS.wing} eyebrow="Flights" title={`${params.from} to ${params.to}`}>
        {dateOnly(params.departDate + "T12:00:00")}{params.returnDate ? `, returning ${dateOnly(params.returnDate + "T12:00:00")}` : ", one way"} · {params.passengers} traveller{params.passengers > 1 ? "s" : ""}
      </PageBanner>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr_300px]">
        <aside className="flex flex-col gap-4" aria-label="Filters">
          {params.returnDate && (
            <div role="group" aria-label="Which flight" className="grid grid-cols-2 rounded-sm bg-navy-50 p-1">
              {(["outbound", "return"] as const).map((l) => (
                <button key={l} onClick={() => { setLeg(l); setMaxPrice(null); }} aria-pressed={leg === l}
                  className={cn("rounded-md py-1.5 text-sm font-semibold capitalize", leg === l ? "bg-white text-navy-800 shadow-sm" : "text-ink-muted")}>{l}</button>
              ))}
            </div>
          )}
          <Field label="Stops" htmlFor="stops"><Select id="stops" value={stops} onChange={(e) => setStops(e.target.value)}>
            <option value="any">Any</option><option value="0">Nonstop only</option><option value="1">1 stop or fewer</option></Select></Field>
          <Field label="Departs" htmlFor="window"><Select id="window" value={win} onChange={(e) => setWin(e.target.value as Window)}>
            <option value="any">Any time</option><option value="morning">Before noon</option><option value="afternoon">Noon to 6 pm</option><option value="evening">After 6 pm</option></Select></Field>
          {ceiling > 0 && (
            <Field label={`Max price: ${money(maxPrice ?? ceiling)}`} htmlFor="price">
              <input id="price" type="range" min={0} max={ceiling} step={1000} value={maxPrice ?? ceiling} onChange={(e) => setMaxPrice(Number(e.target.value))} className="accent-navy-800" />
            </Field>
          )}
          <Field label="Sort by" htmlFor="sort"><Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="price">Lowest price</option><option value="duration">Shortest</option><option value="depart">Earliest departure</option></Select></Field>
        </aside>

        <section aria-live="polite" className="flex min-w-0 flex-col gap-3">
          {q.isPending && <ListSkeleton rows={5} />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load flights" />}
          {q.isSuccess && shown.length === 0 && (
            <EmptyState icon={<Plane className="h-8 w-8" />} title="No flights match these filters">Loosen the stops, time or price filters to see more.</EmptyState>
          )}
          {shown.map((f) => {
            const inTrip = trip.has(f.supplierRef);
            return (
              <Card key={f.supplierRef} className={cn("flex flex-col gap-4 p-4 sm:flex-row sm:items-center", inTrip && "ring-2 ring-navy-500")}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-xs font-semibold text-ink-muted">{f.airline} · {f.flightNumber}</p>
                  <div className="flex items-center gap-3">
                    <div><p className="text-xl font-semibold tabular-nums text-navy-800">{timeOnly(f.departAt)}</p><p className="text-xs text-ink-muted">{f.origin}</p></div>
                    <div className="flex flex-1 flex-col items-center text-xs text-ink-muted">
                      <span>{duration(f.durationMinutes)}</span>
                      <span className="my-1 h-px w-full bg-line" aria-hidden />
                      <span className={f.stops === 0 ? "font-semibold text-ok" : ""}>{f.stops === 0 ? "Nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}</span>
                    </div>
                    <div className="text-right"><p className="text-xl font-semibold tabular-nums text-navy-800">{timeOnly(f.arriveAt)}</p><p className="text-xs text-ink-muted">{f.destination}</p></div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:w-44 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="sm:text-right">
                    <p className="text-lg font-bold tabular-nums text-navy-800">{money(f.priceCents, f.currency)}</p>
                    <p className="text-xs text-ink-muted">total for {f.passengers}{f.seatsLeft <= 3 && <span className="text-warn"> · {f.seatsLeft} left</span>}</p>
                  </div>
                  <Button size="sm" variant={inTrip ? "secondary" : "primary"} onClick={() => (inTrip ? trip.remove(f.supplierRef) : add(f))}>
                    {inTrip ? <><Check className="h-4 w-4" aria-hidden />In trip</> : <><Plus className="h-4 w-4" aria-hidden />Add to trip</>}
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>

        <div className="lg:sticky lg:top-20 lg:self-start"><TripSummary /></div>
      </div>
      </div>
    </>
  );
}
