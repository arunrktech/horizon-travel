import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Briefcase, LogOut, Menu, X } from "lucide-react";
import { USE_MOCK } from "@/api/config";
import { useAuth } from "@/auth/AuthProvider";
import { PHOTOS } from "@/content/images";
import { useTrip } from "@/trip/TripContext";
import { cn, money } from "@/lib/format";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", light ? "text-navy-800" : "text-white")}>
      <span className="font-display text-[26px] font-medium tracking-[0.22em]">HORIZON</span>
      <span className={cn("mt-1 text-[9px] font-medium tracking-[0.42em]", light ? "text-sand-700" : "text-sand-300")}>TRAVEL SERVICES</span>
    </span>
  );
}

function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [threshold]);
  return scrolled;
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cn("px-3 py-2 text-[11px] font-medium uppercase tracking-label transition-colors", isActive ? "text-sand-300" : "text-white/85 hover:text-white");

export function Layout() {
  const { user, signOut } = useAuth();
  const trip = useTrip();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const overHero = pathname === "/";
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const solid = !overHero || scrolled || open;

  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <>
      <NavLink to="/" end className={linkCls}>Plan a trip</NavLink>
      <NavLink to="/search/hotels?city=Lisbon" className={linkCls}>Stays</NavLink>
      {user && <NavLink to="/trips" className={linkCls}>My trips</NavLink>}
      {user?.role === "staff" && <NavLink to="/staff" className={linkCls}><span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" aria-hidden />Back office</span></NavLink>}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className={cn("z-40 w-full transition-colors duration-300", overHero ? "fixed top-0" : "sticky top-0", solid ? "bg-navy-800/95 backdrop-blur" : "bg-gradient-to-b from-black/45 to-transparent")}>
        {USE_MOCK && (
          <div className="bg-sand-500 px-4 py-1 text-center text-[11px] font-medium tracking-wide text-white">
            Demo mode: sample data stored in this browser. No real bookings or payments are made.
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="mr-auto" aria-label="Horizon Travel home"><Logo /></Link>
          <nav className="hidden items-center lg:flex" aria-label="Main">{nav}</nav>
          <Link to="/trip" className="hidden items-center gap-2 border border-white/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-white transition-colors hover:bg-white hover:text-navy-800 sm:flex">
            Your trip{trip.items.length > 0 && <span className="tabular-nums normal-case tracking-normal">· {money(trip.totalCents, trip.currency)}</span>}
          </Link>
          {user ? (
            <button onClick={async () => { await signOut(); navigate("/"); }} className="hidden p-2 text-white/80 hover:text-white sm:block" aria-label={`Sign out ${user.name}`} title={`Signed in as ${user.name}. Sign out`}>
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Link to="/sign-in" className="hidden text-[11px] font-medium uppercase tracking-label text-white/85 hover:text-white sm:block">Sign in</Link>
          )}
          <button className="p-2 text-white lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" className="flex flex-col border-t border-white/10 px-4 pb-4 lg:hidden" aria-label="Main">
            {nav}
            <NavLink to="/trip" className={linkCls}>Your trip{trip.items.length > 0 && ` · ${money(trip.totalCents, trip.currency)}`}</NavLink>
            {user ? <button onClick={async () => { await signOut(); navigate("/"); }} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-label text-white/85">Sign out</button>
              : <NavLink to="/sign-in" className={linkCls}>Sign in</NavLink>}
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

function Footer() {
  const col = "flex flex-col gap-2 text-sm text-white/70";
  const head = "mb-2 text-[11px] font-medium uppercase tracking-label text-sand-300";
  return (
    <footer className="bg-navy-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm text-white/60">A small agency in Andover, Massachusetts, planning flights, stays and experiences since 2009.</p>
        </div>
        <div className={col}><p className={head}>Plan</p><Link to="/" className="hover:text-white">Flights</Link><Link to="/search/hotels?city=Lisbon" className="hover:text-white">Stays</Link><Link to="/?tab=activities" className="hover:text-white">Experiences</Link></div>
        <div className={col}><p className={head}>Your travel</p><Link to="/trips" className="hover:text-white">My trips</Link><Link to="/profile" className="hover:text-white">Traveller details</Link><Link to="/trip" className="hover:text-white">Trip builder</Link></div>
        <div className={col}><p className={head}>Visit us</p><span>12 Main Street, Andover, MA 01810</span><span>(978) 555 0100</span><span>Mon to Sat, 9 am to 6 pm</span></div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/45 sm:px-6 lg:flex-row lg:justify-between">
          <span>Payments by Stripe. Horizon never sees or stores card details.</span>
          <span>
            Photography from Unsplash by{" "}
            {Object.values(PHOTOS).map((p, i, all) => (
              <span key={p.id}><a href={p.page} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">{p.credit}</a>{i < all.length - 1 ? ", " : ""}</span>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
