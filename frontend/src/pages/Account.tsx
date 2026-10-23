import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Briefcase, UserRound } from "lucide-react";
import { customerClient } from "@/api/customerClient";
import { USE_MOCK } from "@/api/config";
import type { Role } from "@/api/types";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, ErrorState, Field, Input, PageHeader, Skeleton } from "@/components/ui";
import { Logo } from "@/components/Layout";

export function SignIn() {
  const { signIn } = useAuth();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const next = sp.get("next") ?? "/";
  const go = async (role: Role) => {
    await signIn(role);
    navigate(role === "staff" && next === "/" ? "/staff" : next, { replace: true });
  };
  const options: { role: Role; title: string; who: string; icon: typeof UserRound }[] = [
    { role: "customer", title: "Continue as a traveller", who: "Priya Shah, a sample customer", icon: UserRound },
    { role: "staff", title: "Continue as agency staff", who: "Dana Lopez, travel consultant", icon: Briefcase },
  ];
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-6 flex justify-center"><Logo light /></div>
      <Card className="p-6">
        <h1 className="font-display text-2xl text-navy-800">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {USE_MOCK || true ? "Development sign in. In AWS this screen is replaced by Amazon Cognito with multi factor authentication." : ""}
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {options.map(({ role, title, who, icon: Icon }) => (
            <button key={role} onClick={() => go(role)} autoFocus={sp.get("as") === role || (role === "customer" && !sp.get("as"))}
              className="flex items-center gap-4 rounded-sm border border-line p-4 text-left transition-colors hover:border-navy-500 hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-500">
              <span className="rounded-sm bg-sand-100 p-2.5 text-sand-700"><Icon className="h-5 w-5" aria-hidden /></span>
              <span><span className="block font-semibold text-navy-800">{title}</span><span className="block text-sm text-ink-muted">{who}</span></span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  phone: z.string().trim().max(20).optional(),
  addressLine: z.string().trim().max(120).optional(),
  city: z.string().trim().max(60).optional(),
  postalCode: z.string().trim().max(12).optional(),
  country: z.string().trim().max(60).optional(),
  passportNumber: z.string().trim().optional().refine((v) => !v || /^[A-Za-z0-9 ]{6,14}$/.test(v), "Passport numbers are 6 to 12 letters and digits"),
});
type ProfileForm = z.infer<typeof profileSchema>;

export function Profile() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me"], queryFn: () => customerClient.me() });
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  useEffect(() => {
    if (q.data) reset({ name: q.data.name, phone: q.data.phone ?? "", addressLine: q.data.addressLine ?? "", city: q.data.city ?? "", postalCode: q.data.postalCode ?? "", country: q.data.country ?? "", passportNumber: "" });
  }, [q.data, reset]);
  const save = useMutation({
    mutationFn: (f: ProfileForm) => customerClient.updateMe({ ...f, passportNumber: f.passportNumber || undefined }),
    onSuccess: (c) => qc.setQueryData(["me"], c),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader eyebrow="Account" title="Your details">Saved details fill in checkout for you. Your passport number is encrypted and only the last four characters are ever shown.</PageHeader>
      {q.isPending && <Skeleton className="mt-6 h-80" />}
      {q.isError && <div className="mt-6"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>}
      {q.data && (
        <form noValidate onSubmit={handleSubmit((f) => save.mutate(f))} className="mt-6">
          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Full name" htmlFor="p-name" error={errors.name?.message}><Input id="p-name" {...register("name")} invalid={!!errors.name} /></Field>
            <Field label="Email" htmlFor="p-email" hint="Managed by your sign in"><Input id="p-email" value={q.data.email} disabled /></Field>
            <Field label="Phone" htmlFor="p-phone"><Input id="p-phone" type="tel" {...register("phone")} /></Field>
            <Field label="Street address" htmlFor="p-addr"><Input id="p-addr" {...register("addressLine")} /></Field>
            <Field label="City" htmlFor="p-city"><Input id="p-city" {...register("city")} /></Field>
            <Field label="Postal code" htmlFor="p-zip"><Input id="p-zip" {...register("postalCode")} /></Field>
            <Field label="Country" htmlFor="p-country"><Input id="p-country" {...register("country")} /></Field>
            <Field label="Passport number" htmlFor="p-pass" error={errors.passportNumber?.message}
              hint={q.data.passportLast4 ? `On file: ending ${q.data.passportLast4}. Enter a new number to replace it.` : "Optional"}>
              <Input id="p-pass" autoComplete="off" {...register("passportNumber")} invalid={!!errors.passportNumber} />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={save.isPending} disabled={!isDirty}>Save details</Button>
              {save.isSuccess && !isDirty && <span role="status" className="text-sm text-ok">Saved</span>}
            </div>
            {save.isError && <div className="sm:col-span-2"><ErrorState error={save.error} /></div>}
          </Card>
        </form>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-display text-5xl text-sand-500">404</p>
      <h1 className="mt-2 font-display text-2xl text-navy-800">This page took a different flight</h1>
      <Link to="/" className="mt-6 inline-block"><Button>Back to planning</Button></Link>
    </div>
  );
}
