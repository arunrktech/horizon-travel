import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Plane, Ticket, Search } from "lucide-react";
import { searchClient } from "@/api/searchClient";
import { Button, Field, Input, Select } from "@/components/ui";
import { cn, isoDay } from "@/lib/format";

type Tab = "flights" | "hotels" | "activities";
const TABS: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: "flights", label: "Flights", icon: Plane },
  { id: "hotels", label: "Hotels", icon: BedDouble },
  { id: "activities", label: "Activities", icon: Ticket },
];

const notPast = (d: string) => d >= isoDay(0);

const flightSchema = z.object({
  from: z.string().length(3, "Choose where you are flying from"),
  to: z.string().length(3, "Choose a destination"),
  departDate: z.string().min(1, "Pick a departure date").refine(notPast, "That date has passed"),
  returnDate: z.string().optional(),
  passengers: z.coerce.number().int().min(1).max(9),
}).refine((v) => v.from !== v.to, { path: ["to"], message: "Destination must differ from origin" })
  .refine((v) => !v.returnDate || v.returnDate >= v.departDate, { path: ["returnDate"], message: "Return must be after departure" });

const hotelSchema = z.object({
  city: z.string().min(2, "Choose a city"),
  checkIn: z.string().min(1, "Pick a check in date").refine(notPast, "That date has passed"),
  checkOut: z.string().min(1, "Pick a check out date"),
  guests: z.coerce.number().int().min(1).max(8),
}).refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"], message: "Check out must be after check in" });

const activitySchema = z.object({
  city: z.string().min(2, "Choose a city"),
  date: z.string().min(1, "Pick a date").refine(notPast, "That date has passed"),
});

function useLocations() {
  return useQuery({ queryKey: ["locations"], queryFn: () => searchClient.locations(), staleTime: Infinity });
}

function FlightForm() {
  const navigate = useNavigate();
  const { data: locations = [] } = useLocations();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof flightSchema>>({
    resolver: zodResolver(flightSchema),
    defaultValues: { from: "BOS", to: "LIS", departDate: isoDay(21), returnDate: isoDay(28), passengers: 2 },
  });
  return (
    <form noValidate onSubmit={handleSubmit((v) => navigate(`/search/flights?${new URLSearchParams(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined).map(([k, x]) => [k, String(x)]))}`))}
      className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_0.7fr_auto] lg:items-end">
      <Field label="From" htmlFor="f-from" error={errors.from?.message}>
        <Select id="f-from" {...register("from")}>{locations.map((l) => <option key={l.code} value={l.code}>{l.city} ({l.code})</option>)}</Select>
      </Field>
      <Field label="To" htmlFor="f-to" error={errors.to?.message}>
        <Select id="f-to" {...register("to")}>{locations.map((l) => <option key={l.code} value={l.code}>{l.city} ({l.code})</option>)}</Select>
      </Field>
      <Field label="Depart" htmlFor="f-depart" error={errors.departDate?.message}><Input id="f-depart" type="date" min={isoDay(0)} {...register("departDate")} invalid={!!errors.departDate} /></Field>
      <Field label="Return (optional)" htmlFor="f-return" error={errors.returnDate?.message}><Input id="f-return" type="date" min={isoDay(0)} {...register("returnDate")} invalid={!!errors.returnDate} /></Field>
      <Field label="Travellers" htmlFor="f-pax" error={errors.passengers?.message}>
        <Select id="f-pax" {...register("passengers")}>{Array.from({ length: 9 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
      </Field>
      <Button type="submit" size="lg" className="col-span-2 lg:col-span-1"><Search className="h-4 w-4" aria-hidden />Search flights</Button>
    </form>
  );
}

function HotelForm() {
  const navigate = useNavigate();
  const { data: locations = [] } = useLocations();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof hotelSchema>>({
    resolver: zodResolver(hotelSchema),
    defaultValues: { city: "Lisbon", checkIn: isoDay(21), checkOut: isoDay(28), guests: 2 },
  });
  return (
    <form noValidate onSubmit={handleSubmit((v) => navigate(`/search/hotels?${new URLSearchParams(Object.entries(v).map(([k, x]) => [k, String(x)]))}`))}
      className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_0.7fr_auto] lg:items-end">
      <Field label="City" htmlFor="h-city" error={errors.city?.message} className="col-span-2 lg:col-span-1">
        <Select id="h-city" {...register("city")}>{[...new Set(locations.map((l) => l.city))].map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <Field label="Check in" htmlFor="h-in" error={errors.checkIn?.message}><Input id="h-in" type="date" min={isoDay(0)} {...register("checkIn")} invalid={!!errors.checkIn} /></Field>
      <Field label="Check out" htmlFor="h-out" error={errors.checkOut?.message}><Input id="h-out" type="date" min={isoDay(1)} {...register("checkOut")} invalid={!!errors.checkOut} /></Field>
      <Field label="Guests" htmlFor="h-guests" error={errors.guests?.message}>
        <Select id="h-guests" {...register("guests")}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
      </Field>
      <Button type="submit" size="lg"><Search className="h-4 w-4" aria-hidden />Search hotels</Button>
    </form>
  );
}

function ActivityForm() {
  const navigate = useNavigate();
  const { data: locations = [] } = useLocations();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof activitySchema>>({
    resolver: zodResolver(activitySchema),
    defaultValues: { city: "Lisbon", date: isoDay(22) },
  });
  return (
    <form noValidate onSubmit={handleSubmit((v) => navigate(`/search/activities?${new URLSearchParams(v)}`))}
      className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
      <Field label="City" htmlFor="a-city" error={errors.city?.message} className="col-span-2 lg:col-span-1">
        <Select id="a-city" {...register("city")}>{[...new Set(locations.map((l) => l.city))].map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <Field label="Date" htmlFor="a-date" error={errors.date?.message}><Input id="a-date" type="date" min={isoDay(0)} {...register("date")} invalid={!!errors.date} /></Field>
      <Button type="submit" size="lg"><Search className="h-4 w-4" aria-hidden />Find activities</Button>
    </form>
  );
}

export function SearchPanel({ initial = "flights" }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const locations = useLocations();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div className="bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,.18)] sm:p-7">
      <div role="tablist" aria-label="What are you booking?" className="mb-5 flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onKey}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={cn("-mb-px flex items-center gap-2 border-b-2 shrink-0 px-2.5 py-3 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors sm:px-3 sm:tracking-label",
              tab === id ? "border-navy-800 text-navy-800" : "border-transparent text-ink-muted hover:text-navy-700")}
          >
            <Icon className="hidden h-4 w-4 sm:block" aria-hidden />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {/* Wait for the airport list so the select defaults (BOS to LIS) can apply. */}
        {!locations.data && <div className="h-[76px] animate-pulse bg-navy-50" aria-busy="true" aria-label="Loading search" />}
        {locations.data && tab === "flights" && <FlightForm />}
        {locations.data && tab === "hotels" && <HotelForm />}
        {locations.data && tab === "activities" && <ActivityForm />}
      </div>
    </div>
  );
}
