/** Small component kit in the shadcn/ui style, themed for Horizon. */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import type { BookingStatus } from "@/api/types";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "sand";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" | "lg" }>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500 disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-9 px-3.5 text-[11px]",
        size === "md" && "h-11 px-5 text-xs",
        size === "lg" && "h-12 px-7 text-[13px]",
        variant === "primary" && "bg-navy-800 text-white hover:bg-navy-700",
        variant === "secondary" && "border border-line bg-white text-navy-800 hover:bg-navy-50",
        variant === "ghost" && "text-navy-700 hover:bg-navy-50",
        variant === "danger" && "bg-bad text-white hover:bg-red-800",
        variant === "sand" && "bg-sand-500 text-white hover:bg-sand-700",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-11 w-full rounded-sm border bg-white px-3 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-navy-500/40",
      invalid ? "border-bad" : "border-line focus:border-navy-500",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-11 w-full rounded-sm border border-line bg-white px-3 text-[15px] text-ink focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/40", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-label text-ink-muted">{label}</label>
      {children}
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : hint ? <p className="text-sm text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-sm border border-line bg-white shadow-card", className)}>{children}</div>;
}

const STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  CONFIRMED: { label: "Confirmed", cls: "bg-green-50 text-ok ring-green-600/20" },
  PENDING_PAYMENT: { label: "Awaiting payment", cls: "bg-amber-50 text-warn ring-amber-600/20" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-ink-muted ring-slate-500/20" },
  FAILED: { label: "Payment failed", cls: "bg-red-50 text-bad ring-red-600/20" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", s.cls)}>{s.label}</span>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md bg-sand-100 px-2 py-0.5 text-xs font-medium text-sand-700", className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-navy-50", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Something went wrong" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "Please try again.";
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-sm border border-red-200 bg-red-50 p-5">
      <div className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle className="h-5 w-5" aria-hidden />{title}</div>
      <p className="text-sm text-ink">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RotateCw className="h-4 w-4" aria-hidden />Try again</Button>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon && <div className="text-sand-500">{icon}</div>}
      <h3 className="font-display text-2xl font-medium text-navy-800">{title}</h3>
      {children && <div className="max-w-md text-sm text-ink-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted" aria-label="Pagination">
      <span className="tabular-nums">{total === 0 ? "No results" : `${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow && <p className="text-[11px] font-medium uppercase tracking-label text-sand-700">{eyebrow}</p>}
      <h1 className="text-balance font-display text-4xl font-medium text-navy-800 sm:text-5xl">{title}</h1>
      {children && <div className="max-w-2xl text-ink-muted">{children}</div>}
    </div>
  );
}
