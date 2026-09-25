"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { planFeatures } from "@/lib/billing";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { usePricingModal } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { Card, SectionTitle } from "./section";

export function ApiSection() {
  const t = useT();
  const app = useApp();
  const qc = useQueryClient();
  const showPricing = usePricingModal((s) => s.show);
  const allowed = !!planFeatures(app.plan).api && !app.billing.expired;
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const key = [app.account.id, "api-key"];

  const q = useQuery({
    queryKey: key,
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("api_keys")
        .select("id, prefix, created_at")
        .eq("account_id", app.account.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/settings/api-key", { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !json.key) return void toast.error(json.error ?? t.errors.generic);
    setFresh(json.key);
    void qc.invalidateQueries({ queryKey: key });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    toast(t.common.copied);
  }

  return (
    <>
      <SectionTitle title={t.settings.api} description={t.settings.apiDesc} />
      {!allowed ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Key className="size-5" />
            {t.settings.apiProOnly}
          </div>
          <Button onClick={() => showPricing("pro")}>{t.common.upgrade}</Button>
        </Card>
      ) : (
        <Card>
          <div className="text-[13px] font-medium">{t.settings.apiKey}</div>
          {q.isLoading ? (
            <Skeleton className="mt-2 h-10 w-full" />
          ) : fresh ? (
            <>
              <div className="mt-2 flex gap-2">
                <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-[6px] border border-fg bg-bg-subtle px-3 font-mono text-[13px]">{fresh}</code>
                <Button variant="outline" onClick={() => copy(fresh)}>
                  <Copy className="size-4" />
                  {t.common.copy}
                </Button>
              </div>
              <p className="mt-2 text-[13px] font-medium">⚠ {t.settings.apiShownOnce}</p>
            </>
          ) : q.data ? (
            <>
              <code className="mt-2 flex h-10 items-center rounded-[6px] border border-border bg-bg-subtle px-3 font-mono text-[13px]">{q.data.prefix}••••••••••••••••••••••</code>
              <p className="mt-2 text-[12px] text-muted">{fmt(t.settings.apiCreatedAt, { date: formatDate(q.data.created_at, app.account.timezone, true) })}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t.settings.apiNoKey}</p>
          )}
          <div className="mt-4">
            {q.data || fresh ? (
              <Button variant="secondary" onClick={() => setConfirm(true)} loading={busy}>
                <RefreshCw className="size-4" />
                {t.settings.apiRegenerate}
              </Button>
            ) : (
              <Button onClick={generate} loading={busy}>
                <Key className="size-4" />
                {t.settings.apiGenerate}
              </Button>
            )}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={t.settings.apiRegenerate}
        description={t.settings.apiRegenerateConfirm}
        onConfirm={generate}
      />
    </>
  );
}
