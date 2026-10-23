/**
 * Stands in for Stripe's hosted checkout page when the booking service runs
 * with PAYMENT_MODE=mock. With PAYMENT_MODE=stripe the browser goes to Stripe
 * instead and this page is never shown.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Lock } from "lucide-react";
import { bookingClient } from "@/api/bookingClient";
import { Button, Card, ErrorState, Skeleton } from "@/components/ui";
import { money } from "@/lib/format";

export default function MockPay() {
  const [sp] = useSearchParams();
  const bookingId = sp.get("bookingId") ?? "";
  const sessionId = sp.get("sessionId") ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["booking", bookingId], queryFn: () => bookingClient.get(bookingId), enabled: !!bookingId });
  const pay = useMutation({
    mutationFn: (outcome: "succeeded" | "failed") => bookingClient.mockPayment(bookingId, { sessionId, outcome }),
    onSuccess: (b) => {
      qc.setQueryData(["booking", b.id], b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      navigate(`/trips/${b.id}?payment=${b.status === "CONFIRMED" ? "success" : "failed"}`, { replace: true });
    },
  });

  return (
    <div className="min-h-[70vh] bg-[#F6F8FA] px-4 py-12">
      <div className="mx-auto max-w-md">
        <p className="mb-4 rounded-sm bg-amber-50 px-3 py-2 text-center text-xs font-medium text-warn ring-1 ring-amber-200">
          Test payment page. In production this step happens on Stripe Checkout.
        </p>
        <Card className="p-6">
          {q.isPending && <Skeleton className="h-40" />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.data && (
            <>
              <p className="text-sm text-ink-muted">Pay Horizon Travel Services</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{money(q.data.totalCents, q.data.currency)}</p>
              <p className="mt-1 text-sm text-ink-muted">Booking {q.data.reference}</p>
              <div className="mt-6 rounded-sm border border-line p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Card information</p>
                <div className="mt-2 flex items-center gap-2 text-ink"><CreditCard className="h-5 w-5 text-ink-faint" aria-hidden /><span className="font-mono tracking-widest">4242 4242 4242 4242</span></div>
                <p className="mt-1 text-xs text-ink-faint">Test card, nothing is charged</p>
              </div>
              {pay.isError && <div className="mt-4"><ErrorState error={pay.error} /></div>}
              {q.data.status !== "PENDING_PAYMENT" ? (
                <Button className="mt-6 w-full" onClick={() => navigate(`/trips/${bookingId}`)}>This booking is already {q.data.status.toLowerCase().replace("_", " ")}. View it</Button>
              ) : (
                <div className="mt-6 flex flex-col gap-2">
                  <Button size="lg" className="w-full bg-[#635BFF] hover:bg-[#5146E5]" loading={pay.isPending && pay.variables === "succeeded"} disabled={pay.isPending} onClick={() => pay.mutate("succeeded")}>
                    <Lock className="h-4 w-4" aria-hidden />Pay {money(q.data.totalCents, q.data.currency)}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pay.isPending} onClick={() => pay.mutate("failed")}>Simulate a declined card</Button>
                  <Button variant="ghost" size="sm" disabled={pay.isPending} onClick={() => navigate(`/checkout?bookingId=${bookingId}&payment=cancelled`)}>Cancel and return to Horizon</Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
