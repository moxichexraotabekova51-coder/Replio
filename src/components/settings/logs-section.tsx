"use client";

import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/components/providers/app-provider";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { cn, formatNumber } from "@/lib/utils";
import { Card, SectionTitle } from "./section";

type Pct = { count: number; p50: number | null; p95: number | null; p99: number | null; slow: number };
type Summary = {
  bot: Pct;
  web: (Pct & { name: string })[];
  slow_bot: { at: string; ms: number; kind: string }[];
  errors: { at: string; name: string; meta: unknown }[];
};

function Ms({ v }: { v: number | null }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span className={cn(v > 2000 && "font-bold underline decoration-2")}>{formatNumber(v)} ms</span>;
}

export function LogsSection() {
  const t = useT();
  const app = useApp();
  const q = useQuery({
    queryKey: [app.account.id, "logs"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("latency_summary", { p_account_id: app.account.id, p_hours: 24 });
      if (error) throw error;
      return data as unknown as Summary;
    },
    refetchInterval: 30_000,
  });

  const s = q.data;
  return (
    <>
      <SectionTitle title={t.settings.logs} description={t.settings.logsPeriod} />
      {q.isError && <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />}

      <h3 className="mb-3 text-[16px] font-semibold">{t.settings.logsLatency}</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(["p50", "p95", "p99"] as const).map((k) => (
          <Card key={k} className="p-5">
            <div className="text-[13px] uppercase text-muted">{k}</div>
            <div className="mt-1 text-[22px] font-semibold">{s ? <Ms v={s.bot[k]} /> : <Skeleton className="h-7 w-20" />}</div>
          </Card>
        ))}
        <Card className="p-5">
          <div className="text-[13px] text-muted">{t.settings.logsSlow}</div>
          <div className="mt-1 text-[22px] font-semibold">{s ? formatNumber(s.bot.slow) : <Skeleton className="h-7 w-12" />}</div>
        </Card>
      </div>
      {s && s.slow_bot.length > 0 && (
        <Card className="mt-4 p-0">
          <ul className="divide-y divide-border text-sm">
            {s.slow_bot.map((x, i) => (
              <li key={i} className="flex items-center justify-between px-6 py-2.5">
                <span className="flex items-center gap-2">
                  <span aria-hidden>⚠</span>
                  {formatDate(x.at, app.account.timezone, true)} · {x.kind}
                </span>
                <Ms v={x.ms} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h3 className="mb-3 mt-8 text-[16px] font-semibold">{t.settings.logsPerf}</h3>
      <Card className="overflow-x-auto p-0">
        {!s ? (
          <div className="p-6">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : s.web.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t.settings.logsEmpty}</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-bg-subtle text-left text-[12px] text-muted">
              <tr className="h-10">
                <th className="px-6 font-medium">{t.common.name}</th>
                <th className="px-4 text-right font-medium">n</th>
                <th className="px-4 text-right font-medium">p50</th>
                <th className="px-4 text-right font-medium">p95</th>
                <th className="px-4 text-right font-medium">p99</th>
              </tr>
            </thead>
            <tbody>
              {s.web.map((w) => (
                <tr key={w.name} className="h-11 border-t border-border">
                  <td className="px-6 font-medium">{w.name}</td>
                  <td className="px-4 text-right text-muted">{formatNumber(w.count)}</td>
                  <td className="px-4 text-right"><Ms v={w.p50} /></td>
                  <td className="px-4 text-right"><Ms v={w.p95} /></td>
                  <td className="px-4 text-right"><Ms v={w.p99} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h3 className="mb-3 mt-8 text-[16px] font-semibold">{t.settings.logsErrors}</h3>
      <Card className="p-0">
        {!s ? (
          <div className="p-6">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : s.errors.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t.settings.logsEmptyErrors}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {s.errors.map((e, i) => (
              <li key={i} className="px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">⚠ {e.name}</span>
                  <span className="text-[12px] text-muted">{formatDate(e.at, app.account.timezone, true)}</span>
                </div>
                {e.meta != null && <pre className="mt-1 overflow-x-auto text-[12px] text-muted">{JSON.stringify(e.meta)}</pre>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
