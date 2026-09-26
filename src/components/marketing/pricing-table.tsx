"use client";

import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

export type PublicPlan = {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  contact_limit: number;
  bot_limit: number;
  seat_limit: number;
  features: Record<string, unknown>;
};

const ROWS: { label: string; value: (p: PublicPlan) => string | boolean }[] = [
  { label: "Faol kontaktlar", value: (p) => formatNumber(p.contact_limit) },
  { label: "Botlar soni", value: (p) => String(p.bot_limit) },
  { label: "Jamoa a'zolari", value: (p) => String(p.seat_limit) },
  { label: "Flowlar va triggerlar", value: () => "Cheksiz" },
  { label: "Broadcast", value: () => true },
  { label: "Sequences", value: () => true },
  { label: "Live Chat", value: () => true },
  { label: "Operatorlarga biriktirish", value: (p) => !!p.features.live_chat_assign },
  { label: "Data Collection", value: (p) => !!p.features.data_collection },
  { label: "External Request, API, Webhook trigger", value: (p) => !!p.features.external_request },
  { label: "Growth Tools statistikasi", value: (p) => (p.features.growth_stats === "full" ? "To'liq" : "Asosiy") },
  { label: "\"Powered by Replio\" belgisi", value: () => "Yo'q" },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto size-4" aria-label="bor" />;
  if (v === false) return <Minus className="mx-auto size-4 text-muted" aria-label="yo'q" />;
  return <>{v}</>;
}

export function PricingTable({ plans }: { plans: PublicPlan[] }) {
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <div className="mx-auto mt-8 flex w-fit items-center rounded-full border border-border p-1 text-sm font-medium" role="group" aria-label="To'lov davri">
        <button onClick={() => setYearly(false)} aria-pressed={!yearly} className={cn("h-9 rounded-full px-5", !yearly ? "bg-fg text-bg" : "text-muted")}>
          Oylik
        </button>
        <button onClick={() => setYearly(true)} aria-pressed={yearly} className={cn("h-9 rounded-full px-5", yearly ? "bg-fg text-bg" : "text-muted")}>
          Yillik <span className="ml-1 text-[12px] font-semibold">-20%</span>
        </button>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((p) => {
          const pro = p.id === "pro";
          const price = yearly ? p.price_yearly : p.price_monthly;
          return (
            <div key={p.id} className={cn("flex flex-col rounded-[20px] border p-8", pro ? "border-2 border-fg" : "border-border")} data-testid={`plan-${p.id}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-[22px] font-semibold">{p.name}</h2>
                {pro && <span className="rounded-full bg-fg px-2.5 py-1 text-[11px] font-bold uppercase text-bg">Tavsiya</span>}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[40px] font-semibold tracking-tight">{formatNumber(price)}</span>
                <span className="text-muted">so&apos;m / {yearly ? "yil" : "oy"}</span>
              </div>
              {yearly && <p className="text-[13px] text-muted">≈ {formatNumber(Math.round(price / 12))} so&apos;m / oy</p>}
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />{formatNumber(p.contact_limit)} ta faol kontakt</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />{p.bot_limit} ta bot, {p.seat_limit} ta jamoa a&apos;zosi</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />Cheksiz flowlar, broadcast, sequences</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />{pro ? "Live Chat + operatorlarga biriktirish" : "Live Chat"}</li>
                {pro && <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />Data Collection, External Request, API, Webhook</li>}
              </ul>
              <Link
                href={`/signup?plan=${p.id}&period=${yearly ? "yearly" : "monthly"}`}
                className={cn(buttonVariants({ size: "lg", variant: pro ? "primary" : "secondary" }), "mt-8 w-full")}
              >
                7 kun bepul boshlash
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-16 max-w-4xl overflow-x-auto rounded-[12px] border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-bg-subtle text-left">
            <tr className="h-12">
              <th className="px-5 font-semibold">Imkoniyat</th>
              {plans.map((p) => (
                <th key={p.id} className="w-40 px-5 text-center font-semibold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="h-11 border-t border-border">
                <td className="px-5">{r.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-5 text-center">
                    <Cell v={r.value(p)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
