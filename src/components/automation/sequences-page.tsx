"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountId, usePermissions } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { automationKeys } from "@/lib/queries/automation";
import { createClient } from "@/lib/supabase/client";
import { NameDialog } from "./name-dialog";

type Seq = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  sequence_steps: { count: number }[];
  contact_sequences: { count: number }[];
};

export function SequencesPage() {
  const t = useT();
  const acc = useAccountId();
  const perms = usePermissions();
  const qc = useQueryClient();
  const router = useRouter();
  const key = automationKeys.sequences(acc);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Seq | null>(null);
  const [deleting, setDeleting] = useState<Seq | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("sequences")
        .select("id, name, is_active, created_at, sequence_steps(count), contact_sequences(count)")
        .eq("account_id", acc)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Seq[];
    },
  });

  const optimistic = (fn: (rows: Seq[]) => Seq[]) => {
    const prev = qc.getQueryData<Seq[]>(key);
    qc.setQueryData<Seq[]>(key, (old) => (old ? fn(old) : old));
    return { prev };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: Seq[] }) => {
    qc.setQueryData(key, ctx?.prev);
    toast.error(t.errors.generic);
  };
  const settle = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await createClient().from("sequences").insert({ account_id: acc, name }).select("id").single();
      if (error) throw error;
      router.push(`/app/automation/sequences/${data.id}`);
    },
    onMutate: (name) =>
      optimistic((rows) => [
        { id: `temp-${Date.now()}`, name, is_active: true, created_at: new Date().toISOString(), sequence_steps: [{ count: 0 }], contact_sequences: [{ count: 0 }] },
        ...rows,
      ]),
    onError: rollback,
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; is_active?: boolean } }) => {
      const { error } = await createClient().from("sequences").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => optimistic((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    onError: rollback,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => optimistic((rows) => rows.filter((r) => r.id !== id)),
    onError: rollback,
    onSettled: settle,
  });

  return (
    <div className="px-4 py-6 md:px-11 md:py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold leading-tight md:text-[32px]">{t.automation.sequencesTitle}</h2>
          <p className="mt-1.5 text-sm text-muted">{t.automation.sequencesDesc}</p>
        </div>
        {perms.canEdit && (
          <Button size="lg" className="h-12 shrink-0" onClick={() => setCreating(true)}>
            <Plus className="size-5" />
            {t.automation.newSequence}
          </Button>
        )}
      </div>

      {q.isError && (
        <div className="mt-6">
          <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {q.isLoading && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 rounded-[12px]" />)}
        {q.data?.length === 0 && (
          <EmptyState
            className="rounded-[12px] border border-border bg-bg"
            icon={<ListOrdered />}
            title={t.automation.sequencesEmpty}
            description={t.automation.sequencesEmptyDesc}
          />
        )}
        {q.data?.map((s) => (
          <div key={s.id} className="flex items-center gap-4 rounded-[12px] border border-border bg-bg px-6 py-5 shadow-sm">
            <Badge status={s.is_active ? "live" : "stopped"}>{s.is_active ? t.automation.active : t.automation.paused}</Badge>
            <Link href={s.id.startsWith("temp-") ? "#" : `/app/automation/sequences/${s.id}`} className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-semibold hover:underline">{s.name}</div>
              <div className="text-[13px] text-muted">
                {fmt(t.automation.steps, { n: s.sequence_steps[0]?.count ?? 0 })} ·{" "}
                {fmt(t.automation.subscribers, { n: s.contact_sequences[0]?.count ?? 0 })}
              </div>
            </Link>
            {perms.canEdit && !s.id.startsWith("temp-") && (
              <>
                <Switch
                  checked={s.is_active}
                  onCheckedChange={(v) => update.mutate({ id: s.id, patch: { is_active: v } })}
                  aria-label={t.automation.active}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label="Amallar">
                      <MoreVertical className="size-[18px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(s)}>
                      <Pencil />
                      {t.common.rename}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDeleting(s)}>
                      <Trash2 />
                      {t.common.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ))}
      </div>

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title={t.automation.newSequence}
        placeholder={t.automation.sequenceName}
        maxLength={100}
        onSubmit={(name) => {
          create.mutate(name);
        }}
      />
      <NameDialog
        open={!!renaming}
        onOpenChange={(v) => !v && setRenaming(null)}
        title={t.common.rename}
        initial={renaming?.name}
        maxLength={100}
        onSubmit={(name) => {
          if (renaming) update.mutate({ id: renaming.id, patch: { name } });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t.common.delete}
        description={deleting?.name}
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}
