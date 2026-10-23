import { Link } from "react-router-dom";
import { BedDouble, Plane, Ticket, X } from "lucide-react";
import type { ItemType } from "@/api/types";
import { useTrip } from "@/trip/TripContext";
import { Button, Card } from "@/components/ui";
import { money } from "@/lib/format";

export const ITEM_ICON: Record<ItemType, typeof Plane> = { flight: Plane, accommodation: BedDouble, activity: Ticket };

/** Running total shown beside search results. */
export function TripSummary() {
  const trip = useTrip();
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl text-navy-800">Your trip</h2>
      {trip.items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Add a flight, a stay and a few activities. They are booked and paid for together.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {trip.items.map((i) => {
              const Icon = ITEM_ICON[i.type];
              return (
                <li key={i.supplierRef} className="flex items-start gap-3 py-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sand-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{i.title}</p>
                    <p className="text-xs text-ink-muted">{i.subtitle}</p>
                  </div>
                  <span className="text-sm tabular-nums">{money(i.priceCents, i.currency)}</span>
                  <button onClick={() => trip.remove(i.supplierRef)} className="rounded p-0.5 text-ink-faint hover:text-bad" aria-label={`Remove ${i.title}`}><X className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-3 font-semibold">
            <span>Total</span><span className="tabular-nums">{money(trip.totalCents, trip.currency)}</span>
          </div>
          <Link to="/trip" className="mt-4 block"><Button className="w-full">Review trip</Button></Link>
        </>
      )}
    </Card>
  );
}
