import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Lock } from "lucide-react";
import { bookingClient } from "@/api/bookingClient";
import { ApiError } from "@/api/http";
import { useAuth } from "@/auth/AuthProvider";
import { useTrip } from "@/trip/TripContext";
import { Button, Card, ErrorState, Field, Input, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { money, newIdempotencyKey } from "@/lib/format";

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name as it appears on the passport").max(60),
  lastName: z.string().trim().min(1, "Enter a last name as it appears on the passport").max(60),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().min(7, "Enter a phone number we can reach during the trip").max(20).regex(/^[+\d\s().-]+$/, "Use digits, spaces and + only"),
});
type Form = z.infer<typeof schema>;

const KEY_STORE = "horizon.checkout.key";

/** One Idempotency-Key per checkout attempt: the same trip and traveller reuse the key on retry. */
function keyFor(signature: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_STORE) ?? "null") as { signature: string; key: string } | null;
    if (saved?.signature === signature) return saved.key;
    const key = newIdempotencyKey();
    sessionStorage.setItem(KEY_STORE, JSON.stringify({ signature, key }));
    return key;
  } catch {
    return newIdempotencyKey();
  }
}

async function goToPayment(bookingId: string) {
  const { checkoutUrl } = await bookingClient.checkout(bookingId);
  window.location.assign(checkoutUrl); // Stripe hosted checkout (or the mock page)
}

function RetryPayment({ bookingId }: { bookingId: string }) {
  const q = useQuery({ queryKey: ["booking", bookingId], queryFn: () => bookingClient.get(bookingId) });
  const pay = useMutation({ mutationFn: () => goToPayment(bookingId) });
  if (q.isPending) return <Skeleton className="mt-6 h-40" />;
  if (q.isError) return <div className="mt-6"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const b = q.data;
  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl text-navy-800">Booking {b.reference}</h2><StatusBadge status={b.status} /></div>
      <p className="mt-2 text-ink-muted">Payment was not completed. Your offers stay held for 30 minutes after booking.</p>
      <p className="mt-4 text-2xl font-bold tabular-nums text-navy-800">{money(b.totalCents, b.currency)}</p>
      {pay.isError && <div className="mt-4"><ErrorState error={pay.error} /></div>}
      <div className="mt-5 flex flex-wrap gap-3">
        {b.status === "PENDING_PAYMENT" ? (
          <Button size="lg" loading={pay.isPending} onClick={() => pay.mutate()}><Lock className="h-4 w-4" aria-hidden />Try payment again</Button>
        ) : (
          <Link to={`/trips/${b.id}`}><Button variant="secondary">View booking</Button></Link>
        )}
      </div>
    </Card>
  );
}

export default function Checkout() {
  const [sp] = useSearchParams();
  const retryId = sp.get("bookingId");
  const { user } = useAuth();
  const trip = useTrip();
  const navigate = useNavigate();
  const [stage, setStage] = useState<"form" | "redirecting">("form");
  const [first, ...rest] = (user?.name ?? "").split(" ");

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: first ?? "", lastName: rest.join(" "), email: user?.email ?? "", phone: "" },
  });
  const values = watch();
  const signature = useMemo(() => JSON.stringify({ items: trip.items.map((i) => i.supplierRef), values }), [trip.items, values]);

  const book = useMutation({
    mutationFn: async (form: Form) => {
      const booking = await bookingClient.create(
        { leadTraveller: form, items: trip.items.map((i) => ({ type: i.type, supplierRef: i.supplierRef })) },
        keyFor(signature),
      );
      setStage("redirecting");
      try { sessionStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
      trip.clear();
      await goToPayment(booking.id).catch(() => navigate(`/checkout?bookingId=${booking.id}`));
    },
  });

  if (retryId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <PageHeader eyebrow="Checkout" title="Finish paying for your trip" />
        <RetryPayment bookingId={retryId} />
      </div>
    );
  }

  if (trip.items.length === 0 && stage === "form") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-ink-muted">Your trip is empty.</p>
        <Link to="/" className="mt-3 inline-block"><Button>Start planning</Button></Link>
      </div>
    );
  }

  const err = book.error;
  const offerProblem = err instanceof ApiError && (err.code === "OFFER_EXPIRED" || err.code === "OFFER_ALREADY_BOOKED");

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <PageHeader eyebrow="Checkout" title="Lead traveller">We send the itinerary to this person. Names must match the passport.</PageHeader>
        <form noValidate onSubmit={handleSubmit((f) => book.mutate(f))} className="mt-6 flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="c-first" error={errors.firstName?.message}><Input id="c-first" autoComplete="given-name" {...register("firstName")} invalid={!!errors.firstName} /></Field>
            <Field label="Last name" htmlFor="c-last" error={errors.lastName?.message}><Input id="c-last" autoComplete="family-name" {...register("lastName")} invalid={!!errors.lastName} /></Field>
            <Field label="Email" htmlFor="c-email" error={errors.email?.message}><Input id="c-email" type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} /></Field>
            <Field label="Mobile phone" htmlFor="c-phone" error={errors.phone?.message} hint="Used only if your trip changes"><Input id="c-phone" type="tel" autoComplete="tel" placeholder="+1 978 555 0100" {...register("phone")} invalid={!!errors.phone} /></Field>
          </div>
          {err && (
            <div>
              <ErrorState error={err} title={offerProblem ? "Prices or availability changed" : "We could not create your booking"} />
              {offerProblem && <Link to="/trip" className="mt-2 inline-block text-sm font-semibold text-navy-700 underline">Review your trip and search again</Link>}
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-ink-muted"><Lock className="h-4 w-4" aria-hidden />Next, you pay securely on Stripe.</p>
            <Button type="submit" size="lg" loading={book.isPending || stage === "redirecting"}>
              {stage === "redirecting" ? "Opening payment" : `Book and pay ${money(trip.totalCents, trip.currency)}`}
            </Button>
          </div>
        </form>
      </div>
      <Card className="h-fit p-5">
        <h2 className="font-display text-lg text-navy-800">Trip summary</h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {trip.items.map((i) => (
            <li key={i.supplierRef} className="flex justify-between gap-3"><span className="min-w-0 text-ink">{i.title}<span className="block text-xs text-ink-muted">{i.subtitle}</span></span><span className="tabular-nums">{money(i.priceCents, i.currency)}</span></li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-line pt-3 font-bold"><span>Total</span><span className="tabular-nums">{money(trip.totalCents, trip.currency)}</span></div>
      </Card>
    </div>
  );
}
