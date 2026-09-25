"use client";

import { useState } from "react";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export type Point = { date: string; value: number };

/** Yengil SVG ustunli grafik (kutubxonasiz — tez yuklanadi) */
export function BarChart({ data, height = 220, tz }: { data: Point[]; height?: number; tz: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = Math.max(0, ...data.map((d) => d.value));
  const max = raw <= 4 ? 4 : Math.ceil(raw / 2) * 2;
  const ticks = [max, max / 2, 0];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <div className="flex gap-3" style={{ height }}>
        <div className="flex w-8 shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-muted">
          {ticks.map((v, i) => (
            <span key={i}>{v}</span>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-[6px] bottom-6 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <div key={i} className="h-px w-full bg-border" />
            ))}
          </div>
          <div className="relative flex flex-1 items-end gap-[2px] pb-0" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div
                key={d.date}
                className="group flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)}
                role="img"
                aria-label={`${d.date}: ${d.value}`}
              >
                <div
                  className={cn("w-full rounded-t-[3px] bg-fg transition-opacity", hover !== null && hover !== i && "opacity-30")}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="flex h-6 items-end justify-between text-[11px] text-muted">
            <span>{data[0] ? formatDate(data[0].date, tz) : ""}</span>
            <span>{data.at(-1) ? formatDate(data.at(-1)!.date, tz) : ""}</span>
          </div>
        </div>
      </div>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-[6px] bg-fg px-2.5 py-1.5 text-[12px] text-bg">
          {formatDate(h.date, tz)} · <b>{h.value}</b>
        </div>
      )}
    </div>
  );
}
