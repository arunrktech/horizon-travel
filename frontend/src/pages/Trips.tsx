import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Luggage, XCircle } from "lucide-react";
import { bookingClient } from "@/api/bookingClient";
import { BookingView } from "@/components/BookingView";
import { Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { dateOnly, money } from "@/lib/format";

export function MyTrips() {
  const q = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => bookingClient.list({ pageSize: 50 }) });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader eyebrow="Account" title="My trips" />
      <div className="mt-6 flex flex-col gap-3">
        {q.isPending && <ListSkeleton rows={3} />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load your trips" />}
        {q.data?.items.length === 0 && (
          <EmptyState icon={<Luggage className="h-8 w-8" />} title="No trips yet" action={<Link to="/"><Button>Plan a trip</Button></Link>}>
            When you book, your trips and documents appear here.
          </EmptyState>
        )}
        {q.data?.items.map((b) => {
          const first = b.items.find((i) => i.startAt);
          return (
            <Link key={b.id} to={`/trips/${b.id}`} className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-500">
              <Card className="flex flex-wrap items-center gap-4 p-4 transition-shadow hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-navy-800">{b.reference}</p>
                  <p className="truncate text-ink">{b.items.map((i) => i.title).join(" · ")}</p>
                  <p className="text-sm text-ink-muted">{first ? `Starts ${dateOnly(first.startAt)}` : ""}</p>
                </div>
                <div className="flex flex-col items-end gap-1"><StatusBadge status={b.status} /><span className="font-semibold tabular-nums">{money(b.totalCents, b.currency)}</span></div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function TripDetail() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const payment = sp.get("payment");
  // After Stripe redirects back, the webhook may still be on its way: poll until the booking leaves PENDING_PAYMENT.
  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: () => bookingClient.get(id),
    staleTime: payment ? 0 : 30_000,
    refetchInterval: (query) => (payment === "success" && query.state.data?.status === "PENDING_PAYMENT" ? 2000 : false),
  });
  const confirming = payment === "success" && q.data?.status === "PENDING_PAYMENT";
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/trips" className="text-sm font-semibold text-navy-700 hover:underline">Back to my trips</Link>
      {payment === "success" && q.data?.status === "CONFIRMED" && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-sm bg-green-50 p-4 text-ok ring-1 ring-green-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div><p className="font-semibold">You're booked.</p><p className="text-sm text-ink">A confirmation email is on its way. Your itinerary and invoice appear below in a few seconds.</p></div>
        </div>
      )}
      {confirming && (
        <div role="status" className="mt-4 flex items-center gap-3 rounded-sm bg-sand-100 p-4 text-navy-800 ring-1 ring-sand-200">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          <p className="font-medium">Confirming your payment with Stripe. This usually takes a few seconds.</p>
        </div>
      )}
      {payment === "failed" && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-sm bg-red-50 p-4 text-bad ring-1 ring-red-200">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div><p className="font-semibold">The payment was declined.</p><p className="text-sm text-ink">Nothing was charged and the offers were released. Search again to rebook.</p></div>
        </div>
      )}
      <div className="mt-6">
        {q.isPending && <Skeleton className="h-96" />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load this booking" />}
        {q.data && <BookingView booking={q.data} />}
      </div>
    </div>
  );
}
