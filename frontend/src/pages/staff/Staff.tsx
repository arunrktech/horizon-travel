import { Link, NavLink, Outlet, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CircleDollarSign, Clock, Users } from "lucide-react";
import { bookingClient } from "@/api/bookingClient";
import { customerClient } from "@/api/customerClient";
import type { BookingStatus } from "@/api/types";
import { BookingView } from "@/components/BookingView";
import { Card, EmptyState, ErrorState, Field, Input, ListSkeleton, PageHeader, Pagination, Select, Skeleton, StatusBadge } from "@/components/ui";
import { cn, dateOnly, dateTime, money } from "@/lib/format";

const PAGE_SIZE = 10;

export function StaffLayout() {
  const tab = ({ isActive }: { isActive: boolean }) => cn("whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold", isActive ? "border-navy-800 text-navy-800" : "border-transparent text-ink-muted hover:text-navy-700");
  return (
    <div>
      <div className="border-b border-line bg-white">
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4" aria-label="Back office">
          <NavLink to="/staff" end className={tab}>Dashboard</NavLink>
          <NavLink to="/staff/bookings" className={tab}>Bookings</NavLink>
          <NavLink to="/staff/customers" className={tab}>Customers</NavLink>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8"><Outlet /></div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = "default" }: { icon: typeof Clock; label: string; value: string; tone?: "default" | "warn" | "bad" }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={cn("rounded-sm p-2.5", tone === "bad" ? "bg-red-50 text-bad" : tone === "warn" ? "bg-amber-50 text-warn" : "bg-sand-100 text-sand-700")}><Icon className="h-5 w-5" aria-hidden /></span>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className="text-2xl font-bold tabular-nums text-navy-800">{value}</p></div>
    </Card>
  );
}

export function Dashboard() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => bookingClient.stats(), refetchInterval: 30000 });
  const recent = useQuery({ queryKey: ["bookings", "recent"], queryFn: () => bookingClient.list({ pageSize: 6 }) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Back office" title="Today at Horizon" />
      {stats.isPending && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} title="Could not load figures" />}
      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Clock} label="Bookings today" value={String(stats.data.bookingsToday)} />
          <Stat icon={CircleDollarSign} label="Revenue this month" value={money(stats.data.revenueMonthCents, stats.data.currency)} />
          <Stat icon={CalendarClock} label="Departing in 14 days" value={String(stats.data.upcomingDepartures)} />
          <Stat icon={AlertTriangle} label="Failed payments, 30 days" value={String(stats.data.failedPaymentsLast30Days)} tone={stats.data.failedPaymentsLast30Days ? "bad" : "default"} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg text-navy-800">Next departures</h2>
          {stats.data && stats.data.nextDepartures.length === 0 && <p className="mt-3 text-sm text-ink-muted">No confirmed departures in the next 14 days.</p>}
          <ul className="mt-3 divide-y divide-line">
            {stats.data?.nextDepartures.map((d, i) => (
              <li key={`${d.bookingId}-${i}`} className="flex items-center gap-3 py-3 text-sm">
                <span className="w-28 shrink-0 tabular-nums text-ink-muted">{dateOnly(d.startAt)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{d.title}</span><span className="text-ink-muted">{d.travellerName}</span></span>
                <Link to={`/staff/bookings/${d.bookingId}`} className="font-mono text-xs font-semibold text-navy-700 hover:underline">{d.reference}</Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg text-navy-800">Latest bookings</h2><Link to="/staff/bookings" className="text-sm font-semibold text-navy-700 hover:underline">All bookings</Link></div>
          {recent.isError && <div className="mt-3"><ErrorState error={recent.error} onRetry={() => recent.refetch()} /></div>}
          <ul className="mt-3 divide-y divide-line">
            {recent.data?.items.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3 text-sm">
                <Link to={`/staff/bookings/${b.id}`} className="font-mono text-xs font-semibold text-navy-700 hover:underline">{b.reference}</Link>
                <span className="min-w-0 flex-1 truncate">{b.leadTraveller.firstName} {b.leadTraveller.lastName}</span>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
          {stats.data && stats.data.pendingPayment > 0 && <p className="mt-3 text-xs text-warn">{stats.data.pendingPayment} booking(s) waiting for payment. Unpaid bookings release after 30 minutes.</p>}
        </Card>
      </div>
    </div>
  );
}

const STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING_PAYMENT", "CANCELLED", "FAILED"];

export function StaffBookings() {
  const [sp, setSp] = useSearchParams();
  const params = {
    query: sp.get("query") ?? "", status: (sp.get("status") || undefined) as BookingStatus | undefined,
    from: sp.get("from") ?? "", to: sp.get("to") ?? "", page: Number(sp.get("page") ?? 1), pageSize: PAGE_SIZE,
  };
  const q = useQuery({ queryKey: ["bookings", "staff", params], queryFn: () => bookingClient.list(params), placeholderData: (prev) => prev });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    setSp(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Back office" title="Bookings" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <Field label="Search" htmlFor="b-q"><Input id="b-q" placeholder="Reference, name or email" defaultValue={params.query} onChange={(e) => set("query", e.target.value)} /></Field>
        <Field label="Status" htmlFor="b-status"><Select id="b-status" value={params.status ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</Select></Field>
        <Field label="Booked from" htmlFor="b-from"><Input id="b-from" type="date" value={params.from} onChange={(e) => set("from", e.target.value)} /></Field>
        <Field label="Booked to" htmlFor="b-to"><Input id="b-to" type="date" value={params.to} onChange={(e) => set("to", e.target.value)} /></Field>
      </div>
      {q.isPending && <ListSkeleton rows={5} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load bookings" />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No bookings match">Clear a filter to see more.</EmptyState>}
      {q.data && q.data.items.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-sand-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Lead traveller</th><th className="px-4 py-3">Trip</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.items.map((b) => (
                <tr key={b.id} className="hover:bg-sand-50">
                  <td className="px-4 py-3"><Link to={`/staff/bookings/${b.id}`} className="font-mono font-semibold text-navy-700 hover:underline">{b.reference}</Link></td>
                  <td className="px-4 py-3">{b.leadTraveller.firstName} {b.leadTraveller.lastName}<span className="block text-xs text-ink-muted">{b.leadTraveller.email}</span></td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-ink-muted">{b.items.map((i) => i.title).join(", ")}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">{dateTime(b.createdAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(b.totalCents, b.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set("page", String(p))} />}
    </div>
  );
}

export function StaffBookingDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["booking", id], queryFn: () => bookingClient.get(id) });
  return (
    <div className="flex flex-col gap-6">
      <Link to="/staff/bookings" className="text-sm font-semibold text-navy-700 hover:underline">Back to bookings</Link>
      {q.isPending && <Skeleton className="h-96" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && <BookingView booking={q.data} staff />}
    </div>
  );
}

export function StaffCustomers() {
  const [sp, setSp] = useSearchParams();
  const query = sp.get("query") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const q = useQuery({ queryKey: ["customers", query, page], queryFn: () => customerClient.list(query, page, PAGE_SIZE), placeholderData: (prev) => prev });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Back office" title="Customers" />
      <Field label="Search" htmlFor="c-q" className="max-w-md"><Input id="c-q" placeholder="Name, email or phone" defaultValue={query} onChange={(e) => setSp(e.target.value ? { query: e.target.value } : {}, { replace: true })} /></Field>
      {q.isPending && <ListSkeleton rows={4} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load customers" />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<Users className="h-8 w-8" />} title="No customers found" />}
      {q.data && q.data.items.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line bg-sand-50 text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Customer since</th></tr></thead>
            <tbody className="divide-y divide-line">
              {q.data.items.map((c) => (
                <tr key={c.id} className="hover:bg-sand-50">
                  <td className="px-4 py-3"><Link to={`/staff/customers/${c.id}`} className="font-semibold text-navy-700 hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-3 text-ink-muted">{c.email}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.phone ?? ""}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{dateOnly(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => setSp({ ...(query ? { query } : {}), page: String(p) })} />}
    </div>
  );
}

export function StaffCustomerDetail() {
  const { id = "" } = useParams();
  const c = useQuery({ queryKey: ["customer", id], queryFn: () => customerClient.get(id) });
  const b = useQuery({ queryKey: ["bookings", "customer", id], queryFn: () => bookingClient.list({ customerId: id, pageSize: 50 }) });
  const lifetime = (b.data?.items ?? []).filter((x) => x.status === "CONFIRMED").reduce((s, x) => s + x.totalCents, 0);
  return (
    <div className="flex flex-col gap-6">
      <Link to="/staff/customers" className="text-sm font-semibold text-navy-700 hover:underline">Back to customers</Link>
      {c.isPending && <Skeleton className="h-40" />}
      {c.isError && <ErrorState error={c.error} onRetry={() => c.refetch()} />}
      {c.data && (
        <Card className="grid gap-4 p-6 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <h1 className="font-display text-3xl text-navy-800">{c.data.name}</h1>
            <p className="text-ink-muted">{c.data.email}{c.data.phone ? ` · ${c.data.phone}` : ""}</p>
            <p className="mt-2 text-sm text-ink-muted">{[c.data.addressLine, c.data.city, c.data.postalCode, c.data.country].filter(Boolean).join(", ") || "No address on file"}</p>
            <p className="mt-1 text-sm text-ink-muted">Passport {c.data.passportLast4 ? `ending ${c.data.passportLast4}` : "not on file"} · customer since {dateOnly(c.data.createdAt)}</p>
          </div>
          <div className="rounded-sm bg-sand-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Confirmed spend</p><p className="text-2xl font-bold tabular-nums text-navy-800">{money(lifetime)}</p><p className="text-sm text-ink-muted">{b.data?.total ?? 0} bookings</p></div>
        </Card>
      )}
      <h2 className="font-display text-xl text-navy-800">Booking history</h2>
      {b.isPending && <ListSkeleton rows={3} />}
      {b.isError && <ErrorState error={b.error} onRetry={() => b.refetch()} />}
      {b.data?.items.length === 0 && <EmptyState title="No bookings yet" />}
      <div className="flex flex-col gap-2">
        {b.data?.items.map((x) => (
          <Link key={x.id} to={`/staff/bookings/${x.id}`}>
            <Card className="flex flex-wrap items-center gap-3 p-4 hover:shadow-md">
              <span className="font-mono text-sm font-semibold text-navy-700">{x.reference}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{x.items.map((i) => i.title).join(", ")}</span>
              <span className="text-sm tabular-nums">{money(x.totalCents, x.currency)}</span>
              <StatusBadge status={x.status} />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
