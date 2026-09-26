"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useApp } from "@/components/providers/app-provider";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { cn, formatNumber, percent } from "@/lib/utils";
import { BarChart } from "./bar-chart";

type Stats = {
  series: { date: string; new_contacts: number; unsubscribed: number }[];
  totals: { contacts: number; new_contacts: number; messages_out: number; active_automations: number };
  checklist: { bot: boolean; automation: boolean; welcome: boolean; broadcast: boolean };
  last_broadcast: {
    id: string;
    name: string;
    sent_at: string | null;
    stats: { total?: number; sent?: number; delivered?: number; clicked?: number; failed?: number };
  } | null;
};

const PERIODS = [7, 30, 90] as const;

export function Dashboard() {
  const t = useT();
  const app = useApp();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const q = useQuery({
    queryKey: [app.account.id, "dashboard", days],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("dashboard_stats", { p_account_id: app.account.id, p_days: days });
      if (error) throw error;
      return data as unknown as Stats;
    },
    placeholderData: (prev) => prev,
  });

  const s = q.data;
  const name = app.profile.full_name?.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader title={t.home.title} />
      <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-11 md:py-8">
        <p className="text-[20px] font-semibold">{fmt(t.home.greeting, { name })}</p>
        {q.isError && <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />}

        {s && !Object.values(s.checklist).every(Boolean) && <Checklist c={s.checklist} />}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t.home.totalContacts} value={s?.totals.contacts} />
          <StatCard label={`${t.home.newContacts} · ${fmt(t.home.days, { n: days })}`} value={s?.totals.new_contacts} />
          <StatCard label={t.home.activeAutomations} value={s?.totals.active_automations} />
          <StatCard label={`${t.home.messagesOut} · ${fmt(t.home.days, { n: days })}`} value={s?.totals.messages_out} />
        </div>

        <section className="rounded-[8px] border border-border bg-bg p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">{t.home.chartTitle}</h2>
            <div role="radiogroup" className="inline-flex rounded-[8px] border border-border bg-bg-muted p-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={days === p}
                  onClick={() => setDays(p)}
                  className={cn(
                    "h-7 rounded-[6px] px-3 text-[13px] font-medium text-muted",
                    days === p && "bg-bg text-fg shadow-sm",
                  )}
                >
                  {fmt(t.home.days, { n: p })}
                </button>
              ))}
            </div>
          </div>
          {s ? (
            <BarChart data={s.series.map((p) => ({ date: p.date, value: p.new_contacts }))} tz={app.account.timezone} />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </section>

        <section className="rounded-[8px] border border-border bg-bg p-5 shadow-sm">
          <h2 className="mb-4 text-[16px] font-semibold">{t.home.lastBroadcast}</h2>
          {!s ? (
            <Skeleton className="h-16 w-full" />
          ) : s.last_broadcast ? (
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.last_broadcast.name}</div>
                <div className="text-[13px] text-muted">{formatDate(s.last_broadcast.sent_at, app.account.timezone, true)}</div>
              </div>
              <Metric label={t.home.sent} value={formatNumber(s.last_broadcast.stats.sent ?? 0)} />
              <Metric label={t.home.delivered} value={formatNumber(s.last_broadcast.stats.delivered ?? 0)} />
              <Metric
                label={t.home.ctr}
                value={percent(s.last_broadcast.stats.clicked ?? 0, s.last_broadcast.stats.delivered ?? 0)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">{t.home.noBroadcast}</p>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-[8px] border border-border bg-bg p-5 shadow-sm">
      <div className="text-[13px] text-muted">{label}</div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="mt-1 text-[28px] font-semibold tracking-tight">{formatNumber(value)}</div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="text-[18px] font-semibold">{value}</div>
    </div>
  );
}

function Checklist({ c }: { c: Stats["checklist"] }) {
  const t = useT();
  const items = [
    { done: c.bot, title: t.home.stepConnect, desc: t.home.stepConnectDesc, href: "/app/settings/telegram" },
    { done: c.automation, title: t.home.stepAutomation, desc: t.home.stepAutomationDesc, href: "/app/automation" },
    { done: c.welcome, title: t.home.stepWelcome, desc: t.home.stepWelcomeDesc, href: "/app/automation/basic" },
    { done: c.broadcast, title: t.home.stepBroadcast, desc: t.home.stepBroadcastDesc, href: "/app/broadcasting" },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <section className="rounded-[8px] border border-border bg-bg shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[16px] font-semibold">{t.home.checklistTitle}</h2>
        <div className="flex items-center gap-3 text-[13px] text-muted">
          {fmt(t.home.checklistDone, { done, total: items.length })}
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-muted">
            <div className="h-full bg-fg" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol>
        {items.map((it, i) => (
          <li key={it.href} className="border-b border-border last:border-0">
            <Link href={it.href} className="flex items-center gap-4 px-5 py-3.5 hover:bg-bg-subtle">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
                  it.done ? "border-fg bg-fg text-bg" : "border-border-strong",
                )}
              >
                {it.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", it.done && "text-muted line-through")}>{it.title}</span>
                <span className="block text-[13px] text-muted">{it.desc}</span>
              </span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
