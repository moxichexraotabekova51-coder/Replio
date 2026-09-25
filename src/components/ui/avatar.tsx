/* eslint-disable @next/next/no-img-element */
import { User } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = 32,
  className,
  silhouette,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** rasm bo'lmasa bosh harf o'rniga kulrang siluet */
  silhouette?: boolean;
}) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  if (silhouette) {
    return (
      <span
        className={cn("flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-border", className)}
        style={style}
      >
        <User className="translate-y-[12%] fill-[#a1a1aa] text-[#a1a1aa]" style={{ width: size * 0.8, height: size * 0.8 }} />
      </span>
    );
  }
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-fg font-semibold text-bg", className)}
      style={style}
    >
      {initials(name)}
    </span>
  );
}
