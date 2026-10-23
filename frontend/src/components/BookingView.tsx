import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { bookingClient } from "@/api/bookingClient";
import { documentClient } from "@/api/documentClient";
import type { Booking } from "@/api/types";
import { Button, Card, ErrorState, StatusBadge } from "@/components/ui";
import { ITEM_ICON } from "@/components/TripSummary";
import { dateTime, money } from "@/lib/format";

const PAYMENT_LABEL = { PENDING: "Awaiting payment", PAID: "Paid", FAILED: "Failed", REFUND_PENDING: "Refund in progress" };

function Documents({ booking }: { booking: Booking }) {
  const waiting = booking.status === "CONFIRMED";
  const q = useQuery({
    queryKey: ["documents", booking.id],
    queryFn: () => documentClient.forBooking(booking.id),
    enabled: booking.status === "CONFIRMED" || booking.status === "CANCELLED",
    // The worker writes the PDFs a few seconds after payment: poll until both exist.
    refetchInterval: (query) => (waiting && (query.state.data?.length ?? 0) < 2 ? 2000 : false),
  });
  if (!(booking.status === "CONFIRMED" || booking.status === "CANCELLED")) return null;
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg text-navy-800">Documents</h2>
      {q.isError && <div className="mt-3"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>}
      {q.data && q.data.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Preparing your itinerary and invoice</p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {q.data?.map((d) => (
          <li key={d.id}>
            <a href={d.downloadUrl} download={d.fileName} className="flex items-center gap-3 rounded-sm border border-line p-3 hover:bg-sand-50">
              <FileText className="h-5 w-5 text-sand-700" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold capitalize text-navy-800">{d.kind}</span><span className="block truncate text-xs text-ink-muted">{d.fileName}</span></span>
              <Download className="h-4 w-4 text-ink-muted" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Booking detail shared by "My trips" and the staff back office. */
export function BookingView({ booking, staff = false }: { booking: Booking; staff?: boolean }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => bookingClient.cancel(booking.id),
    onSuccess: (b) => {
      qc.setQueryData(["booking", b.id], b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setConfirming(false);
    },
  });
  const pay = useMutation({ mutationFn: async () => window.location.assign((await bookingClient.checkout(booking.id)).checkoutUrl) });
  const cancellable = booking.status === "CONFIRMED" || booking.status === "PENDING_PAYMENT";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Booking reference</p>
              <p className="font-mono text-2xl font-semibold text-navy-800">{booking.reference}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <ul className="divide-y divide-line">
            {booking.items.map((i) => {
              const Icon = ITEM_ICON[i.type];
              return (
                <li key={i.id} className="flex items-start gap-4 p-5">
                  <span className="rounded-sm bg-sand-100 p-2 text-sand-700"><Icon className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-800">{i.title}</p>
                    <p className="text-sm text-ink-muted">{dateTime(i.startAt)}{i.endAt ? ` to ${dateTime(i.endAt)}` : ""}</p>
                    {staff && <p className="mt-1 font-mono text-xs text-ink-faint">Supplier ref {i.supplierRef}</p>}
                  </div>
                  <p className="tabular-nums">{money(i.priceCents, booking.currency)}</p>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between border-t border-line bg-sand-50 p-5 text-lg font-bold text-navy-800">
            <span>Total</span><span className="tabular-nums">{money(booking.totalCents, booking.currency)}</span>
          </div>
        </Card>

        {cancellable && (
          <Card className="p-5">
            {!confirming ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">{booking.status === "CONFIRMED" ? "Cancelling releases every item. Paid bookings are refunded to the original card." : "Not paid yet. Cancelling releases the held offers."}</p>
                <div className="flex gap-2">
                  {booking.status === "PENDING_PAYMENT" && !staff && <Button loading={pay.isPending} onClick={() => pay.mutate()}>Pay now</Button>}
                  <Button variant="secondary" onClick={() => setConfirming(true)}>Cancel booking</Button>
                </div>
              </div>
            ) : (
              <div role="alertdialog" aria-labelledby="cancel-title" className="flex flex-col gap-3">
                <h3 id="cancel-title" className="font-semibold text-bad">Cancel booking {booking.reference}?</h3>
                <p className="text-sm text-ink">All {booking.items.length} items will be released. This cannot be undone.</p>
                {cancel.isError && <ErrorState error={cancel.error} />}
                <div className="flex gap-2">
                  <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Yes, cancel booking</Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>Keep booking</Button>
                </div>
              </div>
            )}
            {pay.isError && <div className="mt-3"><ErrorState error={pay.error} /></div>}
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Card className="p-5 text-sm">
          <h2 className="font-display text-lg text-navy-800">Lead traveller</h2>
          <p className="mt-2 font-semibold">{booking.leadTraveller.firstName} {booking.leadTraveller.lastName}</p>
          <p className="text-ink-muted">{booking.leadTraveller.email}</p>
          <p className="text-ink-muted">{booking.leadTraveller.phone}</p>
          {staff && <Link to={`/staff/customers/${booking.customerId}`} className="mt-2 inline-block font-semibold text-navy-700 underline">Customer record</Link>}
          <h2 className="mt-5 font-display text-lg text-navy-800">Payment</h2>
          {booking.payment ? (
            <p className="mt-1">{PAYMENT_LABEL[booking.payment.status]} via {booking.payment.provider === "stripe" ? "Stripe" : "test checkout"}<span className="block text-ink-muted">Updated {dateTime(booking.payment.updatedAt)}</span></p>
          ) : <p className="mt-1 text-ink-muted">No payment started yet</p>}
          <h2 className="mt-5 font-display text-lg text-navy-800">History</h2>
          <ul className="mt-1 flex flex-col gap-1 text-ink-muted">
            <li>Booked {dateTime(booking.createdAt)}</li>
            {booking.confirmedAt && <li>Confirmed {dateTime(booking.confirmedAt)}</li>}
            {booking.cancelledAt && <li>Cancelled {dateTime(booking.cancelledAt)}</li>}
          </ul>
        </Card>
        <Documents booking={booking} />
      </div>
    </div>
  );
}
