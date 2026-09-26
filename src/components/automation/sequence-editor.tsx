"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight, Clock, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountId, usePermissions } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty-state";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { automationKeys, useFlows } from "@/lib/queries/automation";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Window = { from: string; to: string; days: number[] } | null;
type Step = { id: string; position: number; delay: string; flow_id: string | null; send_window: Window; is_active: boolean };
type Seq = { id: string; name: string; is_active: boolean; sequence_steps: Step[]; contact_sequences: { count: number }[] };
type Unit = "minutes" | "hours" | "days";

/** Postgres interval ("2 days", "01:30:00", "1 day 02:00:00") → daqiqa */
export function intervalMinutes(v: string): number {
  let m = 0;
  const d = /(-?\d+)\s+days?/.exec(v);
  if (d) m += Number(d[1]) * 1440;
  const t = /(\d+):(\d{2}):(\d{2})/.exec(v);
  if (t) m += Number(t[1]) * 60 + Number(t[2]);
  return m;
}

function split(min: number): { amount: number; unit: Unit } {
  if (min > 0 && min % 1440 === 0) return { amount: min / 1440, unit: "days" };
  if (min > 0 && min % 60 === 0) return { amount: min / 60, unit: "hours" };
  return { amount: min, unit: "minutes" };
}

const UNIT_MIN: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

export function SequenceEditor({ id }: { id: string }) {
  const t = useT();
  const acc = useAccountId();
  const { canEdit } = usePermissions();
  const qc = useQueryClient();
  const key = [acc, "sequence", id] as const;
  const flows = useFlows();
  const live = (flows.data ?? []).filter((f) => f.status === "live");

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("sequences")
        .select("id, name, is_active, sequence_steps(id, position, delay, flow_id, send_window, is_active), contact_sequences(count)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (data) (data as unknown as Seq).sequence_steps.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      return data as unknown as Seq | null;
    },
  });

  const patchCache = (fn: (s: Seq) => Seq) => {
    const prev = qc.getQueryData<Seq | null>(key);
    qc.setQueryData<Seq | null>(key, (s) => (s ? fn(structuredClone(s)) : s));
    return { prev };
  };
  const onError = (_e: unknown, _v: unknown, ctx?: { prev?: Seq | null }) => {
    qc.setQueryData(key, ctx?.prev);
    toast.error(t.errors.generic);
  };
  // Promise qaytaradi: mutatsiya ro'yxat yangilanguncha "pending" bo'lib turadi (ketma-ket bosishda pozitsiya takrorlanmaydi)
  const settle = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: automationKeys.sequences(acc) })]);

  const setSeq = useMutation({
    mutationFn: async (patch: { is_active?: boolean }) => {
      const { error } = await createClient().from("sequences").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: (patch) => patchCache((s) => ({ ...s, ...patch })),
    onError,
    onSettled: settle,
  });

  const addStep = useMutation({
    mutationFn: async () => {
      const steps = q.data?.sequence_steps ?? [];
      const { error } = await createClient()
        .from("sequence_steps")
        .insert({ sequence_id: id, position: (steps.at(-1)?.position ?? -1) + 1, delay: steps.length ? "1 day" : "00:00:00", flow_id: live[0]?.id ?? null });
      if (error) throw error;
    },
    onSettled: settle,
    onError: () => toast.error(t.errors.generic),
  });

  const updateStep = useMutation({
    mutationFn: async ({ stepId, patch }: { stepId: string; patch: Partial<Omit<Step, "id">> }) => {
      const { error } = await createClient()
        .from("sequence_steps")
        .update({ ...patch, send_window: patch.send_window === undefined ? undefined : (patch.send_window as Json) })
        .eq("id", stepId);
      if (error) throw error;
    },
    onMutate: ({ stepId, patch }) => patchCache((s) => ({ ...s, sequence_steps: s.sequence_steps.map((x) => (x.id === stepId ? { ...x, ...patch } : x)) })),
    onError,
    onSettled: settle,
  });

  const removeStep = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await createClient().from("sequence_steps").delete().eq("id", stepId);
      if (error) throw error;
    },
    onMutate: (stepId) => patchCache((s) => ({ ...s, sequence_steps: s.sequence_steps.filter((x) => x.id !== stepId) })),
    onError,
    onSettled: settle,
  });

  const move = useMutation({
    mutationFn: async ({ a, b }: { a: Step; b: Step }) => {
      const sb = createClient();
      const r1 = await sb.from("sequence_steps").update({ position: b.position }).eq("id", a.id);
      const r2 = await sb.from("sequence_steps").update({ position: a.position }).eq("id", b.id);
      if (r1.error || r2.error) throw r1.error ?? r2.error;
    },
    onMutate: ({ a, b }) =>
      patchCache((s) => {
        const steps = s.sequence_steps.map((x) => (x.id === a.id ? { ...x, position: b.position } : x.id === b.id ? { ...x, position: a.position } : x));
        steps.sort((x, y) => x.position - y.position);
        return { ...s, sequence_steps: steps };
      }),
    onError,
    onSettled: settle,
  });

  if (q.isError) return <div className="p-8"><ErrorState message={t.errors.generic} onRetry={() => q.refetch()} /></div>;
  if (q.isLoading) {
    return (
      <div className="space-y-4 px-4 py-6 md:px-11 md:py-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full max-w-[720px] rounded-[12px]" />
      </div>
    );
  }
  const seq = q.data;
  if (!seq) {
    return (
      <div className="p-8">
        <h1 className="text-[20px] font-semibold">{t.automation.seq.notFound}</h1>
        <Link href="/app/automation/sequences" className="text-sm font-medium underline underline-offset-4">
          {t.automation.seq.back}
        </Link>
      </div>
    );
  }
  const steps = seq.sequence_steps;

  return (
    <div className="px-4 py-6 md:px-11 md:py-8">
      <nav className="flex items-center gap-2 text-[18px]" aria-label="breadcrumb">
        <Link href="/app/automation/sequences" className="text-muted hover:text-fg">
          {t.automation.seq.back}
        </Link>
        <ChevronRight className="size-4 text-muted" />
        <h2 className="truncate font-semibold">{seq.name}</h2>
        <Badge status={seq.is_active ? "live" : "stopped"}>{seq.is_active ? t.automation.active : t.automation.paused}</Badge>
        {canEdit && <Switch className="ml-2" checked={seq.is_active} onCheckedChange={(v) => setSeq.mutate({ is_active: v })} aria-label={t.automation.active} />}
      </nav>
      <p className="mt-2 max-w-[720px] text-sm text-muted">
        {fmt(t.automation.subscribers, { n: seq.contact_sequences[0]?.count ?? 0 })} · {t.automation.seq.howItWorks}
      </p>

      <ol className="mt-6 max-w-[720px] space-y-4">
        {steps.length === 0 && <li className="rounded-[12px] border border-dashed border-border-dashed p-6 text-center text-sm text-muted">{t.automation.seq.empty}</li>}
        {steps.map((s, i) => (
          <StepCard
            key={s.id}
            step={s}
            index={i}
            first={i === 0}
            last={i === steps.length - 1}
            canEdit={canEdit}
            live={live}
            onPatch={(patch) => updateStep.mutate({ stepId: s.id, patch })}
            onDelete={() => removeStep.mutate(s.id)}
            onMove={(dir) => {
              const other = steps[i + dir];
              if (other) move.mutate({ a: s, b: other });
            }}
          />
        ))}
      </ol>
      {canEdit && (
        <button
          type="button"
          onClick={() => addStep.mutate()}
          disabled={addStep.isPending}
          className="mt-4 flex h-12 w-full max-w-[720px] items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed bg-bg text-sm font-medium hover:border-fg disabled:opacity-60"
        >
          <Plus className="size-4" />
          {t.automation.seq.addStep}
        </button>
      )}
    </div>
  );
}

function StepCard({
  step,
  index,
  first,
  last,
  canEdit,
  live,
  onPatch,
  onDelete,
  onMove,
}: {
  step: Step;
  index: number;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  live: { id: string; name: string }[];
  onPatch: (p: Partial<Omit<Step, "id">>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const init = split(intervalMinutes(step.delay));
  const [amount, setAmount] = useState(init.amount);
  const [unit, setUnit] = useState<Unit>(init.unit);
  const commitDelay = (a: number, u: Unit) => onPatch({ delay: `${Math.max(0, a) * UNIT_MIN[u]} minutes` });
  const w = step.send_window;

  return (
    <li className={cn("rounded-[12px] border border-border bg-bg p-5 shadow-sm", !step.is_active && "bg-bg-subtle")} data-testid="seq-step">
      <div className="flex items-center gap-2">
        <span className="text-[16px] font-semibold">{fmt(t.automation.seq.stepN, { n: index + 1 })}</span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <Switch checked={step.is_active} onCheckedChange={(v) => onPatch({ is_active: v })} aria-label={t.automation.seq.stepActive} />
            <button disabled={first} onClick={() => onMove(-1)} className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg disabled:opacity-30" aria-label={t.automation.seq.moveUp}>
              <ArrowUp className="size-4" />
            </button>
            <button disabled={last} onClick={() => onMove(1)} className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg disabled:opacity-30" aria-label={t.automation.seq.moveDown}>
              <ArrowDown className="size-4" />
            </button>
            <button onClick={onDelete} className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.automation.seq.deleteStep}>
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <fieldset disabled={!canEdit} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Clock className="size-4 text-muted" />
          <span>{t.automation.seq.sendAfter}</span>
          <Input
            type="number"
            min={0}
            max={999}
            className="w-20"
            value={amount}
            aria-label={t.automation.seq.sendAfter}
            onChange={(e) => setAmount(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
            onBlur={() => commitDelay(amount, unit)}
          />
          <NativeSelect
            className="w-32"
            value={unit}
            aria-label="Birlik"
            onChange={(e) => {
              const u = e.target.value as Unit;
              setUnit(u);
              commitDelay(amount, u);
            }}
          >
            {(["minutes", "hours", "days"] as const).map((u) => (
              <option key={u} value={u}>
                {t.builder.units[u]}
              </option>
            ))}
          </NativeSelect>
          <span className="text-muted">{amount === 0 ? t.automation.seq.immediately : first ? t.automation.seq.afterSubscribe : t.automation.seq.afterPrev}</span>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium">{t.automation.seq.automation}</div>
          <div className="flex gap-2">
            <NativeSelect value={step.flow_id ?? ""} aria-label={t.automation.seq.automation} onChange={(e) => onPatch({ flow_id: e.target.value || null })}>
              <option value="">{t.automation.seq.selectAutomation}</option>
              {live.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
            {step.flow_id && (
              <Link href={`/app/automation/${step.flow_id}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-[6px] border border-border-strong px-3 text-sm font-medium hover:bg-bg-muted">
                <ExternalLink className="size-4" />
                {t.automation.seq.openFlow}
              </Link>
            )}
          </div>
          {live.length === 0 && <p className="mt-1 text-[12px] text-muted">{t.automation.seq.noLiveFlows}</p>}
        </div>

        <div>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t.automation.seq.window}
            <Switch checked={!!w} onCheckedChange={(v) => onPatch({ send_window: v ? { from: "09:00", to: "21:00", days: [1, 2, 3, 4, 5, 6, 7] } : null })} />
          </label>
          {w && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Input type="time" className="w-32" value={w.from} aria-label={t.builder.timeFrom} onChange={(e) => onPatch({ send_window: { ...w, from: e.target.value || "09:00" } })} />
              <span className="text-muted">—</span>
              <Input type="time" className="w-32" value={w.to} aria-label={t.builder.timeTo} onChange={(e) => onPatch({ send_window: { ...w, to: e.target.value || "21:00" } })} />
              <div className="flex gap-1">
                {t.automation.seq.days.map((d, i) => {
                  const on = w.days.includes(i + 1);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onPatch({ send_window: { ...w, days: on ? w.days.filter((x) => x !== i + 1) : [...w.days, i + 1].sort() } })}
                      className={cn("h-9 w-10 rounded-[6px] border text-[13px] font-medium", on ? "border-fg bg-fg text-bg" : "border-border-strong bg-bg")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </fieldset>
    </li>
  );
}
