import type { ReactNode } from "react";
import { Photo } from "@/components/Photo";
import type { Photo as PhotoData } from "@/content/images";

/** Photo banner at the top of search and trip pages. */
export function PageBanner({ photo, eyebrow, title, children }: { photo: PhotoData; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="relative flex min-h-[300px] items-end">
      <Photo photo={photo} eager className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" aria-hidden />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-24 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-label text-sand-300">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-medium text-white sm:text-5xl">{title}</h1>
        {children && <p className="mt-2 text-white/80">{children}</p>}
      </div>
    </section>
  );
}
