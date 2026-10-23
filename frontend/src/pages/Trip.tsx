import { Link } from "react-router-dom";
import { Compass, X } from "lucide-react";
import { useTrip } from "@/trip/TripContext";
import { ITEM_ICON } from "@/components/TripSummary";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";

const NEXT_STEP: Record<string, { label: string; tab: string }> = {
  flight: { label: "Add a stay", tab: "hotels" },
  accommodation: { label: "Add activities", tab: "activities" },
};

export default function Trip() {
  const trip = useTrip();
  if (trip.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState icon={<Compass className="h-8 w-8" />} title="Your trip is empty" action={<Link to="/"><Button>Start planning</Button></Link>}>
          Search flights, hotels and activities, then add the ones you like here. Everything is paid for together.
        </EmptyState>
      </div>
    );
  }
  const has = (t: string) => trip.items.some((i) => i.type === t);
  const suggestion = !has("accommodation") ? NEXT_STEP.flight : !has("activity") ? NEXT_STEP.accommodation : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader eyebrow="Trip builder" title="Review your trip">Prices are checked again with our suppliers when you continue. Offers are held for 30 minutes once you book.</PageHeader>
      <Card className="mt-6">
        <ul className="divide-y divide-line">
          {trip.items.map((i) => {
            const Icon = ITEM_ICON[i.type];
            return (
              <li key={i.supplierRef} className="flex items-start gap-4 p-4">
                <span className="mt-0.5 rounded-sm bg-sand-100 p-2 text-sand-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800">{i.title}</p>
                  <p className="text-sm text-ink-muted">{i.subtitle}</p>
                </div>
                <p className="font-semibold tabular-nums">{money(i.priceCents, i.currency)}</p>
                <button onClick={() => trip.remove(i.supplierRef)} className="rounded p-1 text-ink-faint hover:text-bad" aria-label={`Remove ${i.title}`}><X className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-line bg-sand-50 p-4 text-lg font-bold text-navy-800">
          <span>Total</span><span className="tabular-nums">{money(trip.totalCents, trip.currency)}</span>
        </div>
      </Card>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {suggestion && <Link to={`/?tab=${suggestion.tab}`}><Button variant="secondary">{suggestion.label}</Button></Link>}
          <Button variant="ghost" onClick={trip.clear}>Clear trip</Button>
        </div>
        <Link to="/checkout"><Button size="lg">Continue to traveller details</Button></Link>
      </div>
    </div>
  );
}
