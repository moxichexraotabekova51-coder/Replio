"use client";

import { Gift, Hand, Menu, MessageSquare, Phone, Plus, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import { useCreateFlow, useTemplates } from "@/lib/queries/automation";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  hand: Hand,
  "message-square": MessageSquare,
  phone: Phone,
  menu: Menu,
  gift: Gift,
  zap: Zap,
};

export function NewAutomationDialog({
  open,
  onOpenChange,
  folderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folderId?: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const templates = useTemplates();
  const create = useCreateFlow();
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(templateId: string | null) {
    const key = templateId ?? "scratch";
    setBusy(key);
    try {
      const id = await create.mutateAsync({ templateId, folderId });
      router.push(`/app/automation/${id}`);
    } catch {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-[820px] p-8">
        <DialogTitle className="text-[24px]">{t.automation.newModalTitle}</DialogTitle>
        <DialogDescription>{t.automation.emptyDesc}</DialogDescription>

        <button
          onClick={() => pick(null)}
          disabled={busy !== null}
          className="mt-6 flex w-full items-center gap-4 rounded-[12px] border border-dashed border-border-dashed p-5 text-left hover:border-fg hover:bg-bg-subtle disabled:opacity-60"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
            {busy === "scratch" ? <Spinner className="size-5" /> : <Plus className="size-6" />}
          </span>
          <span>
            <span className="block text-[16px] font-semibold">{t.automation.fromScratch}</span>
            <span className="block text-sm text-muted">{t.automation.fromScratchDesc}</span>
          </span>
        </button>

        <h3 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.automation.templates}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.isLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[120px] rounded-[12px]" />)}
          {templates.data?.map((tpl) => {
            const Icon = ICONS[tpl.icon] ?? Zap;
            return (
              <button
                key={tpl.id}
                onClick={() => pick(tpl.id)}
                disabled={busy !== null}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-[12px] border border-border bg-bg p-4 text-left shadow-sm transition-colors hover:border-fg disabled:opacity-60",
                  busy === tpl.id && "border-fg",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-[8px] border border-border bg-bg-subtle">
                  {busy === tpl.id ? <Spinner /> : <Icon className="size-[18px]" />}
                </span>
                <span className="text-sm font-semibold">{tpl.name}</span>
                <span className="text-[13px] leading-snug text-muted">{tpl.description}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
