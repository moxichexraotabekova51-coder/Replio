"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { cn, formatNumber, percent } from "@/lib/utils";

type Tab = "draft" | "scheduled" | "sent";
type Stats = { total?: number; sent?: number; delivered?: number; clicked?: number; failed?: number };

export function BroadcastingPage() {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [tab, setTab] = useState<Tab>("draft");
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await createClient().rpc("create_broadcast", { p_account_id: app.account.id, p_name: "Untitled" });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => router.push(`/app/broadcasting/${id}`),
    onError: () => toast.error(t.errors.generic),
  });
  const clicks = useQuery({
    queryKey: [app.account.id, "broadcast-clicks"],
    enabled: tab === "sent",
    queryFn: async () => {
      const { data } = await createClient().rpc("broadcast_clicks", { p_account_id: app.account.id });
      return new Map((data ?? []).map((r) => [r.broadcast_id, Number(r.clicked)]));
    },
  });

  const q = useQuery({
    queryKey: [app.account.id, "broadcasts", tab],
    queryFn: async () => {
      const statuses = tab === "sent" ? (["sent", "sending", "failed"] as const) : ([tab] as const);
      const { data, error } = await createClient()
        .from("broadcasts")
        .select("id, name, audience, status, scheduled_at, sent_at, created_at, stats")
        .eq("account_id", app.account.id)
        .in("status", [...statuses])
        .order(tab === "scheduled" ? "scheduled_at" : tab === "sent" ? "sent_at" : "created_at", { ascending: tab === "scheduled" })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const tabs: { key: Tab; label: string; empty: string }[] = [
    { key: "draft", label: t.broadcasting.draft, empty: t.broadcasting.emptyDraft },
    { key: "scheduled", label: t.broadcasting.scheduled, empty: t.broadcasting.emptyScheduled },
    { key: "sent", label: t.broadcasting.sent, empty: t.broadcasting.emptySent },
  ];
  const current = tabs.find((x) => x.key === tab)!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.broadcasting.title}>
        {canEdit && (
          <Button size="lg" className="ml-auto h-12" onClick={() => create.mutate()} loading={create.isPending}>
            <Plus className="size-5" />
            {t.broadcasting.newBroadcast}
          </Button>
        )}
      </PageHeader>
      <div className="px-4 py-6 md:px-11 md:py-8">
        <div role="tablist" className="flex gap-6 border-b border-border">
          {tabs.map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={tab === x.key}
              onClick={() => setTab(x.key)}
              className={cn(
                "-mb-px h-11 border-b-2 border-transparent text-sm font-medium text-muted hover:text-fg",
                tab === x.key && "border-fg text-fg",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>

        {q.isError && (
          <div className="mt-6">
            <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />
          </div>
        )}

        {q.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : q.data?.length === 0 ? (
          <EmptyState icon={<Send />} title={current.empty} description={t.broadcasting.emptyDesc} />
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[8px] border border-border bg-bg shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-bg-subtle text-left text-[12px] text-muted">
                <tr className="h-11">
                  <th className="px-4 font-medium">{t.broadcasting.colName}</th>
                  <th className="px-4 font-medium">{t.broadcasting.colAudience}</th>
                  <th className="px-4 font-medium">{t.broadcasting.colDate}</th>
                  {tab === "sent" && (
                    <>
                      <th className="px-4 text-right font-medium">{t.broadcasting.colSent}</th>
                      <th className="px-4 text-right font-medium">{t.broadcasting.colDelivered}</th>
                      <th className="px-4 text-right font-medium">{t.broadcasting.colCtr}</th>
                      <th className="px-4 text-right font-medium">{t.broadcasting.colFailed}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {q.data?.map((b) => {
                  const s = (b.stats ?? {}) as Stats;
                  const aud = (b.audience ?? {}) as { type?: string };
                  return (
                    <tr key={b.id} className="h-14 cursor-pointer border-t border-border hover:bg-bg-subtle" onClick={() => router.push(`/app/broadcasting/${b.id}`)}>
                      <td className="px-4 font-medium">
                        {b.name}
                        {b.status === "sending" && <span className="ml-2 rounded-[4px] bg-fg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-bg">{t.broadcasting.statusSending}</span>}
                        {b.status === "failed" && <span className="ml-2 text-[12px] text-muted">⚠ {t.broadcasting.statusFailed}</span>}
                      </td>
                      <td className="px-4 text-muted">{aud.type === "all" ? t.broadcasting.audienceAll : t.broadcasting.audienceFiltered}</td>
                      <td className="px-4 text-muted">
                        {formatDate(tab === "draft" ? b.created_at : tab === "scheduled" ? b.scheduled_at : b.sent_at, app.account.timezone, true)}
                      </td>
                      {tab === "sent" && (
                        <>
                          <td className="px-4 text-right">{formatNumber(s.sent ?? 0)}</td>
                          <td className="px-4 text-right">{formatNumber(s.delivered ?? 0)}</td>
                          <td className="px-4 text-right">{percent(clicks.data?.get(b.id) ?? 0, s.delivered ?? 0)}</td>
                          <td className="px-4 text-right">{formatNumber(s.failed ?? 0)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
