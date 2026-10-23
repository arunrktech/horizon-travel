import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Plus, Star, Ticket } from "lucide-react";
import { searchClient } from "@/api/searchClient";
import type { ActivityOffer } from "@/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, ListSkeleton, Select } from "@/components/ui";
import { TripSummary } from "@/components/TripSummary";
import { PageBanner } from "@/components/PageBanner";
import { PHOTOS } from "@/content/images";
import { useTrip } from "@/trip/TripContext";
import { cn, dateOnly, duration, money } from "@/lib/format";

type Sort = "time" | "price" | "rating";

export default function ActivityResults() {
  const [sp] = useSearchParams();
  const params = { city: sp.get("city") ?? "", date: sp.get("date") ?? "" };
  const q = useQuery({ queryKey: ["activities", params], queryFn: () => searchClient.activities(params), enabled: !!params.city });
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort>("time");
  const trip = useTrip();
  const categories = [...new Set((q.data?.items ?? []).map((a) => a.category))];

  const shown = useMemo(() => {
    const list = (q.data?.items ?? []).filter((a) => category === "all" || a.category === category);
    return [...list].sort((a, b) => sort === "time" ? a.startTime.localeCompare(b.startTime) : sort === "price" ? a.priceCents - b.priceCents : b.rating - a.rating);
  }, [q.data, category, sort]);

  const add = (a: ActivityOffer) => trip.add({
    type: "activity", supplierRef: a.supplierRef, title: a.name, subtitle: `${dateOnly(a.date + "T12:00:00")} at ${a.startTime}, ${duration(a.durationMinutes)}`,
    priceCents: a.priceCents, currency: a.currency, startAt: `${a.date}T${a.startTime}:00Z`,
  });

  return (
    <>
      <PageBanner photo={PHOTOS.balloons} eyebrow="Activities" title={`Things to do in ${params.city}`}>{dateOnly(params.date + "T12:00:00")}</PageBanner>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr_300px]">
        <aside className="flex flex-col gap-4" aria-label="Filters">
          <Field label="Category" htmlFor="cat"><Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Sort by" htmlFor="asort"><Select id="asort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="time">Start time</option><option value="price">Lowest price</option><option value="rating">Rating</option></Select></Field>
        </aside>
        <section aria-live="polite" className="flex min-w-0 flex-col gap-3">
          {q.isPending && <ListSkeleton rows={4} />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load activities" />}
          {q.isSuccess && shown.length === 0 && <EmptyState icon={<Ticket className="h-8 w-8" />} title="Nothing in this category that day">Pick another category or date.</EmptyState>}
          {shown.map((a) => {
            const inTrip = trip.has(a.supplierRef);
            return (
              <Card key={a.supplierRef} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", inTrip && "ring-2 ring-navy-500")}>
                <div className="min-w-0 flex-1">
                  <Badge>{a.category}</Badge>
                  <h3 className="mt-1.5 font-semibold text-navy-800">{a.name}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{a.startTime}, {duration(a.durationMinutes)}</span>
                    <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-sand-500 text-sand-500" aria-hidden />{a.rating}</span>
                    {a.spotsLeft <= 5 && <span className="text-warn">{a.spotsLeft} spots left</span>}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="text-lg font-bold tabular-nums text-navy-800">{money(a.priceCents, a.currency)}</p>
                  <Button size="sm" variant={inTrip ? "secondary" : "primary"} onClick={() => (inTrip ? trip.remove(a.supplierRef) : add(a))}>
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
