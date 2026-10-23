import { useState } from "react";
import type { Photo as PhotoData } from "@/content/images";
import { photoUrl } from "@/content/images";
import { cn } from "@/lib/format";

/** Responsive photo that falls back to a warm tinted panel if the image cannot load. */
export function Photo({ photo, className, sizes = "100vw", eager = false }: { photo: PhotoData; className?: string; sizes?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-sand-300 via-sand-500 to-navy-700", className)}>
      {!failed && (
        <img
          src={photoUrl(photo, 1600)}
          srcSet={[640, 1024, 1600, 2400].map((w) => `${photoUrl(photo, w)} ${w}w`).join(", ")}
          sizes={sizes}
          alt={photo.alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
