import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Compass, Headphones, MapPinned, ShieldCheck, Ticket } from "lucide-react";
import { SearchPanel } from "@/components/SearchPanel";
import { Photo } from "@/components/Photo";
import { PHOTOS, type Photo as PhotoData } from "@/content/images";
import { isoDay } from "@/lib/format";

const DESTINATIONS: { name: string; code: string; line: string; photo: PhotoData }[] = [
  { name: "Portugal", code: "LIS", line: "Tram 28 up to the castle, long lunches in Alfama, and the Atlantic an hour away.", photo: PHOTOS.lisbon },
  { name: "Mexico", code: "CUN", line: "Caribbean water the colour of glass, with Mayan ruins a day trip inland.", photo: PHOTOS.cancun },
  { name: "Japan", code: "NRT", line: "Tokyo's energy, then the quiet lanes and temples of Kyoto by bullet train.", photo: PHOTOS.japan },
];

const PILLARS = [
  { icon: MapPinned, title: "16 destinations", text: "From Lisbon to Tokyo" },
  { icon: Compass, title: "One booking", text: "Flights, stays and experiences" },
  { icon: ShieldCheck, title: "Secure payment", text: "Cards handled by Stripe" },
  { icon: Headphones, title: "A real agent", text: "In Andover, by phone" },
  { icon: Ticket, title: "Itinerary in minutes", text: "PDF and email after payment" },
];

function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <p className={`text-[11px] font-medium uppercase tracking-label ${light ? "text-sand-300" : "text-sand-700"}`}>{children}</p>;
}

export default function Home() {
  const [sp] = useSearchParams();
  const tab = (sp.get("tab") as "flights" | "hotels" | "activities" | null) ?? "flights";

  return (
    <>
      {/* Hero: full bleed photograph with the headline set over it */}
      <section className="relative flex min-h-[92vh] items-end">
        <Photo photo={PHOTOS.hero} eager className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/30" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-40 pt-40 sm:px-6">
          <Eyebrow light>Welcome to</Eyebrow>
          <h1 className="mt-3 font-display text-6xl font-medium leading-none text-white sm:text-8xl">Horizon</h1>
          <p className="mt-6 max-w-xl text-lg font-light text-white/85">
            Trips planned by people who have been there. Book the flight, the stay and the moments in between, together, then call us if anything changes.
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-28 max-w-6xl px-4 sm:px-6">
        <SearchPanel initial={tab} key={tab} />
      </div>

      {/* Brand statement */}
      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <Eyebrow>We are Horizon</Eyebrow>
        <h2 className="mt-5 font-display text-4xl font-medium leading-tight text-navy-800 sm:text-5xl">
          Travel that feels personal, from the first search to the flight home.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-ink-muted">
          Fifteen of us in a small office in Andover. Every trip gets one reference, one itinerary and one phone number that a person answers.
        </p>
      </section>

      {/* Destinations */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Eyebrow>Destinations</Eyebrow><h2 className="mt-3 font-display text-4xl font-medium text-navy-800">Where Andover is going this season</h2></div>
          <Link to="/" className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-label text-navy-800 hover:text-sand-700">All 16 destinations <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {DESTINATIONS.map((d, i) => (
            <Link key={d.code} to={`/search/flights?from=BOS&to=${d.code}&departDate=${isoDay(30 + i * 14)}&returnDate=${isoDay(38 + i * 14)}&passengers=2`} className="group">
              <Photo photo={d.photo} sizes="(min-width: 768px) 33vw, 100vw" className="aspect-[4/5] transition-transform duration-700 group-hover:scale-[1.02]" />
              <h3 className="mt-5 font-display text-3xl font-medium text-navy-800">{d.name}</h3>
              <p className="mt-2 text-ink-muted">{d.line}</p>
              <p className="mt-3 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-label text-sand-700 group-hover:text-navy-800">Flights from Boston <ArrowRight className="h-3.5 w-3.5" aria-hidden /></p>
            </Link>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto mt-24 max-w-7xl border-y border-line px-4 py-12 sm:px-6">
        <ul className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col items-center text-center">
              <Icon className="h-6 w-6 text-sand-500" strokeWidth={1.4} aria-hidden />
              <p className="mt-3 font-display text-xl font-medium text-navy-800">{title}</p>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Split feature */}
      <section className="mx-auto mt-24 grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <Photo photo={PHOTOS.lodge} sizes="(min-width: 1024px) 50vw, 100vw" className="aspect-[5/4]" />
        <div>
          <Eyebrow>Tailored trips</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-medium leading-tight text-navy-800 sm:text-5xl">Stays chosen for the place, not the points</h2>
          <p className="mt-5 text-ink-muted">Filter by class, guest rating and free cancellation, then add the room to the same trip as your flights. Prices are confirmed with the hotel when you book, so the total you see is the total you pay.</p>
          <Link to="/?tab=hotels" className="mt-8 inline-flex h-12 items-center gap-2 bg-navy-800 px-7 text-[13px] font-medium uppercase tracking-[0.12em] text-white hover:bg-navy-700">Find a stay <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>

      {/* Experiences band */}
      <section className="mx-auto mt-24 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className="order-2 flex flex-col justify-center lg:order-1">
          <Eyebrow>Experiences</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-medium leading-tight text-navy-800 sm:text-5xl">The day you will talk about afterwards</h2>
          <p className="mt-5 text-ink-muted">Food walks, kayak tours, cooking classes and balloon flights at sunrise, booked on the same reference as the rest of the trip.</p>
          <Link to="/?tab=activities" className="mt-8 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-label text-navy-800 hover:text-sand-700">Browse experiences <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <Photo photo={PHOTOS.balloons} sizes="(min-width: 1024px) 50vw, 100vw" className="order-1 aspect-[5/4] lg:order-2" />
      </section>

      {/* How it works */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <Eyebrow>How it works</Eyebrow>
        <ol className="mt-8 grid gap-10 md:grid-cols-3">
          {[
            ["Build the trip", "Search flights, stays and experiences and add the ones you like. The total updates as you go."],
            ["Book and pay once", "One booking reference for everything. You pay on Stripe's secure page; we never see your card."],
            ["Travel with backup", "Your itinerary and invoice arrive by email within minutes. If plans change, call the office."],
          ].map(([title, text], i) => (
            <li key={title} className="border-t border-navy-800 pt-6">
              <p className="font-display text-5xl font-medium text-sand-500">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 font-display text-2xl font-medium text-navy-800">{title}</h3>
              <p className="mt-2 text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing call to action over a photograph */}
      <section className="relative mt-28 flex min-h-[60vh] items-center">
        <Photo photo={PHOTOS.wing} className="absolute inset-0" />
        <div className="absolute inset-0 bg-black/45" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <Eyebrow light>Ready when you are</Eyebrow>
          <h2 className="mt-5 font-display text-5xl font-medium leading-tight text-white sm:text-6xl">Start planning your next trip</h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="inline-flex h-12 items-center bg-white px-7 text-[13px] font-medium uppercase tracking-[0.12em] text-navy-800 hover:bg-sand-100">Search trips</a>
            <span className="inline-flex h-12 items-center border border-white/60 px-7 text-[13px] font-medium uppercase tracking-[0.12em] text-white">Call (978) 555 0100</span>
          </div>
        </div>
      </section>
    </>
  );
}
