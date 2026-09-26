"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { MessageStepEditor } from "@/components/builder/message-step-editor";
import { useEditor } from "@/components/builder/store";
import { FilterBar } from "@/components/contacts/filter-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { compileDraft, validateDraft } from "@/lib/flow/compile";
import { linearChain, normalizeDraft, uid, type Draft } from "@/lib/flow/draft";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { usePublish } from "@/lib/queries/builder";
import { emptyFilter, type ContactFilter } from "@/lib/queries/contacts";
import { usePricingModal } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/time";
import { cn, formatNumber, percent } from "@/lib/utils";

type Audience = { type: "all" } | { type: "filter"; filter: ContactFilter };
type Stats = { total?: number; sent?: number; delivered?: number; clicked?: number; failed?: number };
type Broadcast = {
  id: string;
  name: string;
  audience: Audience;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  stats: Stats;
  flow_id: string;
  flows: { draft: Json } | null;
};

export function BroadcastEditor({ id }: { id: string }) {
  const t = useT();
  const app = useApp();
  const acc = app.account.id;
  const key = [acc, "broadcast", id] as const;
  const init = useEditor((s) => s.init);
  const ready = useEditor((s) => s.flowId);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("broadcasts")
        .select("id, name, audience, status, scheduled_at, sent_at, stats, flow_id, flows(draft)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Broadcast | null;
    },
    refetchInterval: (query) => (query.state.data?.status === "sending" ? 2000 : false),
  });

  useEffect(() => {
    if (q.data?.flow_id) init(q.data.flow_id, normalizeDraft(q.data.flows?.draft));
    // faqat birinchi yuklashda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.flow_id]);

  if (q.isError) return <div className="p-8"><ErrorState message={t.errors.generic} onRetry={() => q.refetch()} /></div>;
  if (q.data === null) {
    return (
      <div className="p-8">
        <h1 className="text-[20px] font-semibold">{t.errors.notFound}</h1>
        <Link href="/app/broadcasting" className="text-sm font-medium underline underline-offset-4">
          {t.broadcasting.back}
        </Link>
      </div>
    );
  }
  if (!q.data || ready !== q.data.flow_id) {
    return (
      <div className="space-y-4 px-4 py-6 md:px-11 md:py-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full max-w-[720px] rounded-[12px]" />
      </div>
    );
  }
  return <Editor b={q.data} />;
}

function StatusBadge({ b }: { b: Broadcast }) {
  const t = useT();
  const map = {
    draft: ["draft", t.broadcasting.draft],
    scheduled: ["draft", t.broadcasting.scheduled],
    sending: ["live", t.broadcasting.statusSending],
    sent: ["live", t.broadcasting.statusSent],
    failed: ["stopped", t.broadcasting.statusFailed],
  } as const;
  const [status, label] = map[b.status];
  return <Badge status={status}>{label}</Badge>;
}

function Editor({ b }: { b: Broadcast }) {
  const t = useT();
  const app = useApp();
  const acc = app.account.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { canEdit } = usePermissions();
  const showPricing = usePricingModal((s) => s.show);
  const key = [acc, "broadcast", b.id] as const;
  const editable = canEdit && b.status === "draft";
  const draft = useEditor((s) => s.draft);
  const lastSaved = useRef<Draft>(draft);
  const publish = usePublish(b.flow_id);
  const [name, setName] = useState(b.name);
  const [renaming, setRenaming] = useState(false);
  const [audience, setAudience] = useState<Audience>(b.audience?.type === "filter" ? b.audience : { type: "all" });
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  // Xabar (flow draft) — avtomatik saqlash
  const flush = useCallback(async () => {
    const d = useEditor.getState().draft;
    if (d === lastSaved.current) return;
    lastSaved.current = d;
    await createClient().from("flows").update({ draft: d as unknown as Json }).eq("id", b.flow_id);
  }, [b.flow_id]);
  useEffect(() => {
    if (!editable || draft === lastSaved.current) return;
    const id = setTimeout(() => void flush(), 800);
    return () => clearTimeout(id);
  }, [draft, editable, flush]);
  useEffect(() => () => void flush(), [flush]);

  const patch = useMutation({
    mutationFn: async (p: { name?: string; audience?: Audience }) => {
      const { error } = await createClient()
        .from("broadcasts")
        .update({ ...(p.name ? { name: p.name } : {}), ...(p.audience ? { audience: p.audience as unknown as Json } : {}) })
        .eq("id", b.id);
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => qc.invalidateQueries({ queryKey: [acc, "broadcasts"] }),
  });

  const count = useQuery({
    queryKey: [acc, "broadcast-audience", audience],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("broadcast_audience_count", { p_account_id: acc, p_audience: audience as unknown as Json });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const clicks = useQuery({
    queryKey: [acc, "broadcast-clicks"],
    enabled: b.status !== "draft",
    queryFn: async () => {
      const { data } = await createClient().rpc("broadcast_clicks", { p_account_id: acc });
      return new Map((data ?? []).map((r) => [r.broadcast_id, Number(r.clicked)]));
    },
  });

  function setAud(a: Audience) {
    setAudience(a);
    patch.mutate({ audience: a });
  }

  /** Validatsiya + kompilyatsiya (publish_flow) + yuborish/rejalashtirish */
  async function start(at: Date | null) {
    if (!app.bot) return void toast.error(t.broadcasting.noBot);
    if ((count.data ?? 0) === 0) return void toast.error(t.broadcasting.noRecipients);
    if (at && at.getTime() < Date.now() + 60_000) return void toast.error(t.broadcasting.pastTime);
    setBusy(true);
    try {
      await flush();
      const d = useEditor.getState().draft;
      const found = validateDraft(d, 1).filter((x) => x.code !== "no_trigger");
      useEditor.getState().setIssues(found);
      if (found.length) return void toast.error(`${t.builder.fixErrors}: ${t.builder.issues[found[0].code]}`);
      try {
        await publish.mutateAsync({ draft: d, compiled: compileDraft(d) });
      } catch (e) {
        if ((e as { message?: string }).message?.startsWith("upgrade_required")) {
          toast.error(t.broadcasting.upgradeRequired);
          showPricing("pro");
        }
        return;
      }
      const res = await fetch(`/api/broadcasts/${b.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ at: at ? at.toISOString() : null }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) return void toast.error(json.error === "no_bot" ? t.broadcasting.noBot : t.errors.generic);
      toast(json.status === "scheduled" ? t.broadcasting.scheduledToast : t.broadcasting.started);
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: [acc, "broadcasts"] });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await createClient().rpc("cancel_broadcast", { p_id: b.id });
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: [acc, "broadcasts"] });
    },
  });

  const chain = linearChain(draft);
  const s = b.stats ?? {};
  const done = (s.sent ?? 0);
  const total = s.total ?? 0;
  const clicked = clicks.data?.get(b.id) ?? 0;

  return (
    <div className="px-4 py-6 md:px-11 md:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 items-center gap-2 text-[18px]" aria-label="breadcrumb">
          <Link href="/app/broadcasting" className="shrink-0 text-muted hover:text-fg">
            {t.broadcasting.back}
          </Link>
          <ChevronRight className="size-4 shrink-0 text-muted" />
          {renaming ? (
            <input
              autoFocus
              defaultValue={name}
              maxLength={200}
              aria-label={t.common.rename}
              onBlur={(e) => {
                const v = e.target.value.trim();
                setRenaming(false);
                if (v && v !== name) {
                  setName(v);
                  patch.mutate({ name: v });
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-9 min-w-0 rounded-[6px] border border-fg px-2 font-semibold outline-none"
            />
          ) : (
            <>
              <h1 className="truncate font-semibold">{name}</h1>
              {canEdit && b.status === "draft" && (
                <button onClick={() => setRenaming(true)} className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.common.rename}>
                  <Pencil className="size-4" />
                </button>
              )}
            </>
          )}
          <StatusBadge b={b} />
        </nav>

        {editable && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="lg" className="h-12" onClick={() => setDeleting(true)} aria-label={t.broadcasting.delete}>
              <Trash2 className="size-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="lg" className="h-12">
                  <CalendarClock className="size-4" />
                  {t.broadcasting.schedule}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <label className="block text-sm font-medium" htmlFor="bc-when">
                  {t.broadcasting.scheduleAt}
                </label>
                <Input id="bc-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                <Button className="w-full" disabled={!when} loading={busy} onClick={() => void start(new Date(when))}>
                  {t.broadcasting.scheduleConfirm}
                </Button>
              </PopoverContent>
            </Popover>
            <Button size="lg" className="h-12 min-w-[180px]" onClick={() => setConfirm(true)} disabled={busy}>
              <Send className="size-4" />
              {t.broadcasting.sendNow}
            </Button>
          </div>
        )}
        {canEdit && b.status === "scheduled" && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm">{fmt(t.broadcasting.scheduledFor, { time: formatDate(b.scheduled_at, app.account.timezone, true) })}</span>
            <Button variant="outline" size="lg" className="h-12" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {t.broadcasting.cancelSchedule}
            </Button>
          </div>
        )}
      </div>

      {(b.status === "sending" || b.status === "sent" || b.status === "failed") && (
        <section className="mt-6 max-w-[860px] rounded-[12px] border border-border bg-bg p-5 shadow-sm" data-testid="bc-results">
          <h2 className="mb-4 text-[16px] font-semibold">{t.broadcasting.results}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              [t.broadcasting.total, formatNumber(total)],
              [t.broadcasting.colSent, formatNumber(s.sent ?? 0)],
              [t.broadcasting.colDelivered, formatNumber(s.delivered ?? 0)],
              [t.broadcasting.colCtr, percent(clicked, s.delivered ?? 0)],
              [t.broadcasting.colFailed, formatNumber(s.failed ?? 0)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[12px] text-muted">{label}</div>
                <div className="text-[24px] font-semibold" data-stat={label}>
                  {value}
                </div>
              </div>
            ))}
          </div>
          {b.status === "sending" && total > 0 && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
                <div className="h-full bg-fg transition-all" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[12px] text-muted">{fmt(t.broadcasting.progress, { done: formatNumber(done), total: formatNumber(total) })}</div>
            </div>
          )}
        </section>
      )}

      <div className="mt-6 grid max-w-[860px] gap-6">
        <section className="rounded-[12px] border border-border bg-bg p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Users className="size-4" />
            {t.broadcasting.audience}
          </h2>
          <p className="mb-3 mt-1 text-[13px] text-muted">{t.broadcasting.audienceHint}</p>
          <fieldset disabled={!editable} className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="aud" className="size-4 accent-black" checked={audience.type === "all"} onChange={() => setAud({ type: "all" })} />
              {t.broadcasting.audienceAll}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="aud"
                className="size-4 accent-black"
                checked={audience.type === "filter"}
                onChange={() => setAud({ type: "filter", filter: emptyFilter })}
              />
              {t.broadcasting.audienceFiltered}
            </label>
            {audience.type === "filter" && (
              <div className="pl-6">
                <FilterBar filter={audience.filter} onChange={(f) => setAud({ type: "filter", filter: f })} />
              </div>
            )}
          </fieldset>
          <p className="mt-3 text-sm font-semibold" data-testid="bc-count">
            {count.isLoading ? "…" : fmt(t.broadcasting.recipients, { n: formatNumber(count.data ?? 0) })}
          </p>
        </section>

        <section className="rounded-[12px] border border-border bg-bg p-5 shadow-sm">
          <h2 className="mb-4 text-[16px] font-semibold">{t.broadcasting.message}</h2>
          {!editable && b.status !== "scheduled" && <p className="mb-3 text-[13px] text-muted">{t.broadcasting.readOnly}</p>}
          <div className="space-y-4">
            {chain.map((node, i) => (
              <div key={node.id} className="relative rounded-[12px] border border-border p-4">
                {editable && chain.length > 1 && (
                  <button
                    onClick={() =>
                      useEditor.getState().update((d) => {
                        const prev = d.edges.find((e) => e.target === node.id);
                        const next = d.edges.find((e) => e.source === node.id && e.sourceHandle === "next");
                        d.edges = d.edges.filter((e) => e.source !== node.id && e.target !== node.id);
                        if (prev && next) d.edges.push({ ...prev, id: uid("e"), target: next.target });
                        d.nodes = d.nodes.filter((n) => n.id !== node.id);
                        return d;
                      })
                    }
                    className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                    aria-label={t.broadcasting.removeMessage}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <MessageStepEditor node={node} readOnly={!editable} mode="broadcast" />
                {i < chain.length - 1 && <span className="sr-only">→</span>}
              </div>
            ))}
            {editable && (
              <button
                type="button"
                onClick={() =>
                  useEditor.getState().update((d) => {
                    const last = linearChain(d).at(-1);
                    const nid = uid("m");
                    d.nodes.push({ id: nid, type: "message", position: { x: 700, y: (last?.position.y ?? 0) + 400 }, data: { name: t.builder.sendMessage, blocks: [] } });
                    d.edges.push({ id: uid("e"), source: last?.id ?? "trigger", sourceHandle: last ? "next" : "then", target: nid });
                    return d;
                  })
                }
                className={cn("flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg")}
              >
                <Plus className="size-4" />
                {t.broadcasting.addNextMessage}
              </button>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.broadcasting.confirmTitle}
        description={fmt(t.broadcasting.confirmDesc, { n: formatNumber(count.data ?? 0) })}
        confirmLabel={t.broadcasting.confirmSend}
        onConfirm={() => start(null)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        destructive
        title={t.broadcasting.delete}
        description={fmt(t.broadcasting.deleteConfirm, { name })}
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await createClient().from("broadcasts").delete().eq("id", b.id);
          void qc.invalidateQueries({ queryKey: [acc, "broadcasts"] });
          router.push("/app/broadcasting");
        }}
      />
    </div>
  );
}
