"use client";

import { ChevronRight, Hand, MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountId, usePermissions } from "@/components/providers/app-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import { useFlows } from "@/lib/queries/automation";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/time";
import { StatusBadge } from "./flow-items";

export function BasicPage() {
  const t = useT();
  const router = useRouter();
  const acc = useAccountId();
  const perms = usePermissions();
  const flows = useFlows();
  const [busy, setBusy] = useState<string | null>(null);

  const items = [
    { kind: "welcome", title: t.automation.welcomeTitle, desc: t.automation.welcomeDesc, icon: Hand },
    { kind: "default_reply", title: t.automation.defaultReplyTitle, desc: t.automation.defaultReplyDesc, icon: MessageSquareReply },
  ] as const;

  async function open(kind: string) {
    const existing = flows.data?.find((f) => f.basic_kind === kind);
    if (existing) return router.push(`/app/automation/${existing.id}`);
    if (!perms.canEdit) return;
    setBusy(kind);
    const { data, error } = await createClient().rpc("ensure_basic_flow", { p_account_id: acc, p_kind: kind });
    if (error || !data) {
      setBusy(null);
      toast.error(t.errors.generic);
      return;
    }
    router.push(`/app/automation/${data}`);
  }

  return (
    <div className="px-4 py-6 md:px-11 md:py-8">
      <h2 className="text-[26px] font-semibold leading-tight md:text-[32px]">{t.automation.basicTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.automation.basicDesc}</p>
      <div className="mt-8 flex flex-col gap-6">
        {items.map((it) => {
          const flow = flows.data?.find((f) => f.basic_kind === it.kind);
          const clickable = !!flow || perms.canEdit;
          return flows.isLoading ? (
            <Skeleton key={it.kind} className="h-24 rounded-[12px]" />
          ) : (
            <button
              key={it.kind}
              disabled={!clickable || busy !== null}
              onClick={() => open(it.kind)}
              className="flex min-h-24 items-center gap-5 rounded-[12px] border border-border bg-bg px-6 py-5 text-left shadow-sm transition-colors hover:border-border-strong disabled:cursor-default"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-bg-muted">
                {busy === it.kind ? <Spinner className="size-5" /> : <it.icon className="size-6" strokeWidth={1.75} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-3">
                  {flow ? <StatusBadge flow={flow} /> : <span className="rounded-[4px] border border-border-strong px-1.5 text-[11px] font-semibold uppercase text-muted">{t.automation.notConfigured}</span>}
                  <span className="truncate text-[20px] font-semibold">{it.title}</span>
                </span>
                <span className="mt-1 block text-sm text-muted">{it.desc}</span>
              </span>
              {flow && <span className="text-sm text-muted max-md:hidden">{timeAgo(t, flow.updated_at)}</span>}
              {clickable && <ChevronRight className="size-5 text-muted" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
