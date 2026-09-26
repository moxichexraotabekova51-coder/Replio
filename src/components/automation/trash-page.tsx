"use client";

import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useDeleteFlowForever, useRestoreFlow, useTrash, type FlowRow } from "@/lib/queries/automation";
import { timeAgo } from "@/lib/time";

const RETENTION_DAYS = 30;

export function TrashPage() {
  const t = useT();
  const perms = usePermissions();
  const q = useTrash();
  const restore = useRestoreFlow();
  const destroy = useDeleteFlowForever();
  const [confirm, setConfirm] = useState<FlowRow | null>(null);

  return (
    <div className="px-4 py-6 md:px-11 md:py-8">
      <Link href="/app/automation" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        {t.automation.backToList}
      </Link>
      <h2 className="text-[26px] font-semibold leading-tight md:text-[32px]">{t.automation.trashTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.automation.trashDesc}</p>

      {q.isError && (
        <div className="mt-6">
          <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {q.isLoading &&
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-[12px]" />)}
        {q.data?.length === 0 && (
          <EmptyState className="rounded-[12px] border border-border bg-bg" icon={<Trash2 />} title={t.automation.trashEmpty} />
        )}
        {q.data?.map((f) => {
          const left = Math.max(0, RETENTION_DAYS - Math.floor((Date.now() - new Date(f.deleted_at!).getTime()) / 86_400_000));
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-4 rounded-[12px] border border-border bg-bg px-6 py-5 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[18px] font-semibold">{f.name}</div>
                <div className="text-[13px] text-muted">
                  {t.automation.deletedAt}: {timeAgo(t, f.deleted_at)} · {fmt(t.automation.daysLeft, { n: left })}
                </div>
              </div>
              {perms.canEdit && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => restore.mutate(f.id)}>
                    <RotateCcw className="size-4" />
                    {t.common.restore}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm(f)}>
                    <Trash2 className="size-4" />
                    {t.common.deleteForever}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        destructive
        title={t.common.deleteForever}
        description={confirm ? fmt(t.automation.deleteForeverConfirm, { name: confirm.name }) : ""}
        confirmLabel={t.common.deleteForever}
        onConfirm={() => {
          if (confirm) destroy.mutate(confirm.id);
        }}
      />
    </div>
  );
}
