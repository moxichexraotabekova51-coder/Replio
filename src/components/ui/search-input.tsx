"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Debounce bilan qidiruv inputi (standart 200 ms) */
export function SearchInput({
  value,
  onChange,
  placeholder,
  delay = 200,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  inputClassName?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const id = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(id);
  }, [local, value, delay, onChange]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-10 w-full rounded-[6px] border border-border bg-bg pl-10 pr-9 text-sm outline-none placeholder:text-muted hover:border-border-strong focus:border-fg [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] text-muted hover:bg-bg-muted hover:text-fg"
          aria-label="Tozalash"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
