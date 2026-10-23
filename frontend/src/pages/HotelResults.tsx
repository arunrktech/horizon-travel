import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Check, Plus, Star } from "lucide-react";
import { searchClient } from "@/api/searchClient";
import type { HotelOffer } from "@/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, ListSkeleton, Select } from "@/components/ui";
import { TripSummary } from "@/components/TripSummary";
import { PageBanner } from "@/components/PageBanner";
import { PHOTOS } from "@/content/images";
import { useTrip } from "@/trip/TripContext";
import { cn, dateOnly, money } from "@/lib/format";

type Sort = "price" | "rating" | "stars";

export default function HotelResults() {
  const [sp] = useSearchParams();
  const params = { city: sp.get("city") ?? "", checkIn: sp.get("checkIn") ?? "", checkOut: sp.get("checkOut") ?? "", guests: Number(sp.get("guests") ?? 2) };
  const q = useQuery({ queryKey: ["hotels", params], queryFn: () => searchClient.hotels(params), enabled: !!params.city });
  const [minStars, setMinStars] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [freeCancel, setFreeCancel] = useState(false);
  const [sort, setSort] = useState<Sort>("price");
  const trip = useTrip();

  const shown = useMemo(() => {
    const list = (q.data?.items ?? []).filter((h) => h.stars >= minStars && h.reviewScore >= minScore && (!freeCancel || h.freeCancellation));
    return [...list].sort((a, b) => sort === "price" ? a.totalPriceCents - b.totalPriceCents : sort === "rating" ? b.reviewScore - a.reviewScore : b.stars - a.stars);
  }, [q.data, minStars, minScore, freeCancel, sort]);

  const add = (h: HotelOffer) => trip.add({
    type: "accommodation", supplierRef: h.supplierRef, title: h.name,
    subtitle: `${h.nights} nights from ${dateOnly(h.checkIn + "T12:00:00")}, ${h.roomType.toLowerCase()}`,
    priceCents: h.totalPriceCents, currency: h.currency, startAt: `${h.checkIn}T15:00:00Z`,
  });

  return (
    <>
      <PageBanner photo={PHOTOS.lodge} eyebrow="Hotels" title={`Places to stay in ${params.city}`}>
        {dateOnly(params.checkIn + "T12:00:00")} to {dateOnly(params.checkOut + "T12:00:00")} · {params.guests} guest{params.guests > 1 ? "s" : ""}
      </PageBanner>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr_300px]">
        <aside className="flex flex-col gap-4" aria-label="Filters">
          <Field label="Hotel class" htmlFor="stars"><Select id="stars" value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
            <option value={0}>Any</option><option value={3}>3 stars and up</option><option value={4}>4 stars and up</option><option value={5}>5 stars</option></Select></Field>
          <Field label="Guest rating" htmlFor="score"><Select id="score" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
            <option value={0}>Any</option><option value={8}>Very good: 8+</option><option value={9}>Excellent: 9+</option></Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={freeCancel} onChange={(e) => setFreeCancel(e.target.checked)} className="h-4 w-4 accent-navy-800" />Free cancellation only</label>
          <Field label="Sort by" htmlFor="hsort"><Select id="hsort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="price">Lowest total price</option><option value="rating">Guest rating</option><option value="stars">Hotel class</option></Select></Field>
        </aside>
        <section aria-live="polite" className="flex min-w-0 flex-col gap-3">
          {q.isPending && <ListSkeleton rows={5} />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load hotels" />}
          {q.isSuccess && shown.length === 0 && <EmptyState icon={<BedDouble className="h-8 w-8" />} title="No hotels match these filters">Try a lower class or rating.</EmptyState>}
          {shown.map((h) => {
            const inTrip = trip.has(h.supplierRef);
            return (
              <Card key={h.supplierRef} className={cn("flex flex-col gap-4 p-4 sm:flex-row", inTrip && "ring-2 ring-navy-500")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sand-500" aria-label={`${h.stars} star hotel`}>
                    {Array.from({ length: h.stars }, (_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" aria-hidden />)}
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-navy-800">{h.name}</h3>
                  <p className="text-sm text-ink-muted">{h.neighbourhood} · {h.roomType}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.freeCancellation && <Badge className="bg-green-50 text-ok">Free cancellation</Badge>}
                    {h.amenities.map((a) => <Badge key={a}>{a}</Badge>)}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:w-48 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="sm:text-right">
                    <p className="text-sm"><span className="rounded bg-navy-800 px-1.5 py-0.5 font-bold text-white tabular-nums">{h.reviewScore.toFixed(1)}</span> <span className="text-ink-muted">{h.reviewCount.toLocaleString()} reviews</span></p>
                    <p className="mt-2 text-lg font-bold tabular-nums text-navy-800">{money(h.totalPriceCents, h.currency)}</p>
                    <p className="text-xs text-ink-muted">{money(h.pricePerNightCents, h.currency)} a night · {h.nights} nights</p>
                  </div>
                  <Button size="sm" variant={inTrip ? "secondary" : "primary"} onClick={() => (inTrip ? trip.remove(h.supplierRef) : add(h))}>
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
