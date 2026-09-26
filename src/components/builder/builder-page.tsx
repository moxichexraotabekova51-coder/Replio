"use client";

import { Check, ChevronLeft, ChevronRight, Copy, History, MoreVertical, Pencil, Plus, Redo2, Square, Trash2, Undo2, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/automation/flow-items";
import { usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { compileDraft, validateDraft } from "@/lib/flow/compile";
import { isLinear, linearChain, normalizeDraft, uid, type Draft } from "@/lib/flow/draft";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useDuplicateFlows, useFlows, useTrashFlows, useUpdateFlows } from "@/lib/queries/automation";
import { useFlow, useFlowTriggers, usePublish, useSaveDraft, useSetFlowStatus, useStepStats, useVersions, type FlowDetail, type FlowTrigger } from "@/lib/queries/builder";
import { usePricingModal } from "@/lib/stores/ui";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CanvasDataProvider } from "./canvas/canvas-context";
import { FlowCanvas } from "./canvas/flow-canvas";
import { MessageStepEditor } from "./message-step-editor";
import { PreviewButton } from "./preview-button";
import { ActionEditor, CommentEditor, ConditionEditor, RandomizerEditor, SmartDelayEditor, StartFlowEditor } from "./step-editors";
import { useEditor } from "./store";
import { TriggersPanel } from "./triggers-panel";

const AUTOSAVE_MS = 800;

export function BuilderPage({ flowId, initialFlow, initialTriggers }: { flowId: string; initialFlow?: FlowDetail; initialTriggers?: FlowTrigger[] }) {
  const t = useT();
  const flow = useFlow(flowId, initialFlow);
  const triggers = useFlowTriggers(flowId, initialTriggers);
  const init = useEditor((s) => s.init);
  const ready = useEditor((s) => s.flowId === flowId);

  useEffect(() => {
    if (flow.data) init(flowId, normalizeDraft(flow.data.draft));
    // faqat birinchi yuklashda (keyingi o'zgarishlar store'da)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, !!flow.data]);

  if (flow.isError) return <div className="p-8"><ErrorState message={t.errors.generic} onRetry={() => flow.refetch()} /></div>;
  if (flow.data === null || flow.data?.deleted_at) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-[20px] font-semibold">{t.errors.notFound}</h1>
        <Link href="/app/automation" className="text-sm font-medium underline underline-offset-4">
          {t.automation.backToList}
        </Link>
      </div>
    );
  }
  if (flow.isLoading || !ready || !flow.data) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex min-h-[84px] items-center border-b border-border px-8"><Skeleton className="h-7 w-72" /></div>
        <div className="mx-auto w-full max-w-[640px] space-y-4 p-8">
          <Skeleton className="h-40 w-full rounded-[24px]" />
          <Skeleton className="h-64 w-full rounded-[24px]" />
        </div>
      </div>
    );
  }
  return <Editor flow={flow.data} triggers={triggers.data ?? []} />;
}

function Editor({ flow, triggers }: { flow: FlowDetail; triggers: FlowTrigger[] }) {
  const t = useT();
  const showPricing = usePricingModal((s) => s.show);
  const [mode, setMode] = useState<"flow" | "basic">(() => (flow.is_basic && isLinear(useEditor.getState().draft) ? "basic" : "flow"));
  const { canEdit } = usePermissions();
  const draft = useEditor((s) => s.draft);
  const save = useSaveDraft(flow.id);
  const publish = usePublish(flow.id);
  const lastSaved = useRef<Draft>(draft);
  const [saving, setSaving] = useState(false);

  // Barqaror havola: mutatsiya obyekti har renderda o'zgaradi, shuning uchun ref orqali
  const saveRef = useRef(save.mutateAsync);
  saveRef.current = save.mutateAsync;
  const liveRef = useRef(flow.status === "live");
  liveRef.current = flow.status === "live";
  const inFlight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    const d = useEditor.getState().draft;
    if (d === lastSaved.current || !canEdit) return;
    setSaving(true);
    const p = saveRef
      .current({ draft: d, live: liveRef.current })
      .then(() => {
        lastSaved.current = d;
      })
      .finally(() => {
        inFlight.current = null;
        setSaving(false);
      });
    inFlight.current = p.catch(() => undefined);
    await p;
  }, [canEdit]);

  // Auto-save (debounce 800 ms)
  useEffect(() => {
    if (draft === lastSaved.current) return;
    const id = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [draft, flush]);

  // Sahifadan chiqishda saqlanmagan o'zgarish qolmasin
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().draft !== lastSaved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void flush();
    };
  }, [flush]);

  // Undo / Redo: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return; // matn maydonida brauzerning o'z undo'si
      e.preventDefault();
      if (e.shiftKey) useEditor.getState().redo();
      else useEditor.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function setLive() {
    await flush();
    const d = useEditor.getState().draft;
    const active = triggers.filter((x) => x.is_active).length;
    const found = validateDraft(d, active);
    useEditor.getState().setIssues(found);
    if (found.length) {
      toast.error(`${t.builder.fixErrors}: ${t.builder.issues[found[0].code]}`);
      if (mode === "flow" && found[0].nodeId) useEditor.getState().select(found[0].nodeId);
      return;
    }
    try {
      await publish.mutateAsync({ draft: d, compiled: compileDraft(d) });
    } catch (e) {
      if ((e as { message?: string }).message?.startsWith("upgrade_required")) showPricing("pro");
      return;
    }
    lastSaved.current = d;
    toast(t.builder.published);
  }

  const linear = isLinear(draft);
  const toggle =
    mode === "flow" ? (
      linear ? (
        <button onClick={() => setMode("basic")} className="h-10 rounded-[6px] px-3 text-sm font-medium underline-offset-4 hover:underline">
          {t.builder.goBasic}
        </button>
      ) : null
    ) : (
      <button onClick={() => setMode("flow")} className="h-10 rounded-[6px] px-3 text-sm font-medium underline-offset-4 hover:underline">
        {t.builder.goFlow}
      </button>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        flow={flow}
        saving={saving || save.isPending}
        dirty={draft !== lastSaved.current}
        onSaveNow={flush}
        onSetLive={setLive}
        publishing={publish.isPending}
        extra={
          <>
            {canEdit && toggle}
            {canEdit && <PreviewButton flowId={flow.id} flush={flush} />}
          </>
        }
      />
      {mode === "basic" ? <BasicView flow={flow} triggers={triggers} /> : <FlowView flow={flow} triggers={triggers} />}
    </div>
  );
}

function FlowView({ flow, triggers }: { flow: FlowDetail; triggers: FlowTrigger[] }) {
  const t = useT();
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const node = useEditor((s) => s.draft.nodes.find((n) => n.id === s.selected));
  const stats = useStepStats(flow.id);
  const flows = useFlows();
  const data = useMemo(
    () => ({ flowId: flow.id, triggers, stats: stats.data ?? {}, flows: (flows.data ?? []).map((f) => ({ id: f.id, name: f.name })) }),
    [flow.id, triggers, stats.data, flows.data],
  );
  const open = !!node;
  return (
    <CanvasDataProvider value={data}>
      <div className="flex min-h-0 flex-1">
        {open && (
          <aside className="relative w-full max-w-[528px] shrink-0 overflow-y-auto border-r border-border bg-bg p-6 scrollbar-thin" data-testid="step-sidebar" data-node-id={selected ?? undefined}>
            <button
              onClick={() => select(null)}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
              aria-label={t.builder.collapseSidebar}
              title={t.builder.collapseSidebar}
            >
              <ChevronLeft className="size-5" />
            </button>
            <SidebarContent key={selected} flow={flow} triggers={triggers} />
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          <FlowCanvas onSelect={select} sidebarOpen={open} />
        </div>
      </div>
    </CanvasDataProvider>
  );
}

function SidebarContent({ flow, triggers }: { flow: FlowDetail; triggers: FlowTrigger[] }) {
  const t = useT();
  const { canEdit } = usePermissions();
  const node = useEditor((s) => s.draft.nodes.find((n) => n.id === s.selected));
  const draft = useEditor((s) => s.draft);
  const issues = useEditor((s) => s.issues);
  if (!node) return null;
  const ro = !canEdit;
  const body = (() => {
    switch (node.type) {
      case "trigger": {
        const edge = draft.edges.find((e) => e.source === "trigger" && e.sourceHandle === "then");
        const target = edge ? draft.nodes.find((n) => n.id === edge.target) : undefined;
        const triggerIssue = issues.some((x) => x.nodeId === "trigger");
        return (
          <div>
            <h2 className="flex items-center gap-2 text-[22px] font-semibold">
              <Zap className="size-5" />
              {t.builder.when}
            </h2>
            <p className="mb-4 mt-1 text-[13px] text-muted">{t.builder.whenDesc}</p>
            <TriggersPanel flowId={flow.id} triggers={triggers} fixed={flow.is_basic} canEdit={canEdit} invalid={triggerIssue} />
            <div className="mt-6 rounded-[12px] border border-border p-4">
              <div className="text-[12px] font-semibold uppercase text-muted">{t.builder.then}</div>
              {target && target.type !== "trigger" && target.type !== "comment" ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="truncate text-sm font-semibold underline-offset-4 hover:underline" onClick={() => useEditor.getState().select(target.id)}>
                    {target.data.name}
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => useEditor.getState().update((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== edge!.id) }))}
                      className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                      aria-label={t.builder.disconnect}
                      title={t.builder.disconnect}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">{t.builder.connectHint}</p>
              )}
            </div>
          </div>
        );
      }
      case "message":
        return <MessageStepEditor node={node} readOnly={ro} mode="flow" />;
      case "action":
        return <ActionEditor node={node} />;
      case "condition":
        return <ConditionEditor node={node} />;
      case "randomizer":
        return <RandomizerEditor node={node} />;
      case "smart_delay":
        return <SmartDelayEditor node={node} />;
      case "start_flow":
        return <StartFlowEditor node={node} currentFlowId={flow.id} />;
      case "comment":
        return <CommentEditor node={node} />;
    }
  })();
  return <fieldset disabled={ro} className="min-w-0">{body}</fieldset>;
}

function BasicView({ flow, triggers }: { flow: FlowDetail; triggers: FlowTrigger[] }) {
  const t = useT();
  const { canEdit } = usePermissions();
  const draft = useEditor((s) => s.draft);
  const issues = useEditor((s) => s.issues);
  const chain = linearChain(draft);
  const triggerIssue = issues.some((x) => x.nodeId === "trigger");

  return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas scrollbar-thin">
        <div className="mx-auto w-full max-w-[640px] px-4 py-8">
          {/* When... */}
          <section className={cn("rounded-[24px] border border-border bg-bg p-6 shadow-sm", triggerIssue && "border-2 border-fg")}>
            <h2 className="flex items-center gap-2 text-[22px] font-semibold">
              <Zap className="size-5" />
              {t.builder.when}
            </h2>
            <p className="mb-4 mt-1 text-[13px] text-muted">{t.builder.whenDesc}</p>
            <TriggersPanel flowId={flow.id} triggers={triggers} fixed={flow.is_basic} canEdit={canEdit} invalid={triggerIssue} />
          </section>

          <div className="flex flex-col items-center py-2" aria-hidden>
            <span className="text-[12px] font-medium text-muted">{t.builder.then}</span>
            <span className="h-6 w-px bg-[#71717a]" />
          </div>

          {chain.map((node, i) => (
            <div key={node.id}>
              <section className="relative rounded-[24px] border border-border bg-bg p-6 shadow-sm">
                {canEdit && chain.length > 1 && (
                  <button
                    onClick={() =>
                      useEditor.getState().update((d) => {
                        const prev = d.edges.find((e) => e.target === node.id && (e.sourceHandle === "next" || e.sourceHandle === "then"));
                        const next = d.edges.find((e) => e.source === node.id && e.sourceHandle === "next");
                        d.edges = d.edges.filter((e) => e.source !== node.id && e.target !== node.id);
                        if (prev && next) d.edges.push({ ...prev, id: uid("e"), target: next.target });
                        d.nodes = d.nodes.filter((n) => n.id !== node.id);
                        return d;
                      })
                    }
                    className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                    aria-label={t.builder.removeStep}
                    title={t.builder.removeStep}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <MessageStepEditor node={node} readOnly={!canEdit} mode="basic" />
              </section>
              {i < chain.length - 1 && (
                <div className="flex justify-center py-1" aria-hidden>
                  <span className="h-6 w-px bg-[#71717a]" />
                </div>
              )}
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() =>
                useEditor.getState().update((d) => {
                  const last = linearChain(d).at(-1);
                  const id = uid("m");
                  const y = (last?.position.y ?? 0) + 400;
                  d.nodes.push({ id, type: "message", position: { x: 700, y }, data: { name: t.builder.sendMessage, blocks: [] } });
                  d.edges.push({ id: uid("e"), source: last?.id ?? "trigger", sourceHandle: last ? "next" : "then", target: id });
                  return d;
                })
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed bg-bg text-sm font-medium hover:border-fg"
            >
              <Plus className="size-4" />
              {t.builder.addNextStep}
            </button>
          )}
          <p className="mt-6 text-center text-[12px] text-muted">{t.builder.basicViewHint}</p>
        </div>
      </div>
  );
}

function Toolbar({
  flow,
  saving,
  dirty,
  onSaveNow,
  onSetLive,
  publishing,
  extra,
}: {
  flow: FlowDetail;
  saving: boolean;
  dirty: boolean;
  onSaveNow: () => Promise<void>;
  onSetLive: () => Promise<void>;
  publishing: boolean;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const { canEdit } = usePermissions();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [name, setName] = useState(flow.name);
  const [editing, setEditing] = useState(false);
  const updateFlows = useUpdateFlows();
  const duplicate = useDuplicateFlows();
  const trash = useTrashFlows();
  const setStatus = useSetFlowStatus(flow.id);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function commitName(v: string) {
    setEditing(false);
    const n = v.trim().slice(0, 200);
    if (!n || n === name) return;
    setName(n);
    updateFlows.mutate({ ids: [flow.id], patch: { name: n } });
  }

  const liveLabel = flow.status === "live" && flow.has_unpublished ? t.builder.liveChanged : null;

  return (
    <div className="flex min-h-[84px] shrink-0 flex-wrap items-center gap-3 border-b border-border bg-bg px-4 py-3 md:px-8">
      <nav className="flex min-w-0 items-center gap-2 text-[18px]" aria-label="breadcrumb">
        <Link
          href="/app/automation"
          onClick={async (e) => {
            if (dirty) {
              e.preventDefault();
              await onSaveNow();
              router.push("/app/automation");
            }
          }}
          className="shrink-0 text-muted hover:text-fg"
        >
          {t.builder.automations}
        </Link>
        <ChevronRight className="size-4 shrink-0 text-muted" />
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            maxLength={200}
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-9 min-w-0 rounded-[6px] border border-fg px-2 font-semibold outline-none"
            aria-label={t.common.rename}
          />
        ) : (
          <>
            <span className="truncate font-semibold">{name}</span>
            {canEdit && (
              <button onClick={() => setEditing(true)} className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.common.rename}>
                <Pencil className="size-4" />
              </button>
            )}
          </>
        )}
        {liveLabel ? (
          <span className="shrink-0 rounded-[4px] bg-fg px-1.5 py-0.5 text-[11px] font-semibold uppercase text-bg">{liveLabel}</span>
        ) : (
          <StatusBadge flow={flow} />
        )}
      </nav>

      {canEdit && (
        <div className="ml-auto flex items-center gap-2">
          {extra}
          <button
            onClick={() => void onSaveNow()}
            className="flex h-10 items-center gap-1.5 rounded-[6px] px-2 text-sm text-muted hover:bg-bg-muted hover:text-fg"
            aria-label={saving ? t.builder.saving : t.builder.saved}
          >
            {saving ? <Spinner className="size-4" /> : dirty ? <span className="size-2 rounded-full border border-fg" /> : <Check className="size-4" />}
            {saving ? t.builder.saving : dirty ? t.builder.unsaved : t.builder.saved}
          </button>
          <button
            onClick={() => useEditor.getState().undo()}
            disabled={!canUndo}
            className="flex size-10 items-center justify-center rounded-[6px] hover:bg-bg-muted disabled:text-border-strong disabled:hover:bg-transparent"
            aria-label={t.builder.undo}
            title={`${t.builder.undo} (Ctrl+Z)`}
          >
            <Undo2 className="size-5" />
          </button>
          <button
            onClick={() => useEditor.getState().redo()}
            disabled={!canRedo}
            className="flex size-10 items-center justify-center rounded-[6px] hover:bg-bg-muted disabled:text-border-strong disabled:hover:bg-transparent"
            aria-label={t.builder.redo}
            title={`${t.builder.redo} (Shift+Ctrl+Z)`}
          >
            <Redo2 className="size-5" />
          </button>
          <Button size="lg" className="h-12 min-w-[160px] md:min-w-[200px]" onClick={() => void onSetLive()} loading={publishing}>
            {flow.status === "live" ? t.builder.publish : t.builder.setLive}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex size-12 items-center justify-center rounded-[6px] border border-border-strong bg-bg hover:bg-bg-muted" aria-label={t.builder.moreActions}>
                <MoreVertical className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!flow.is_basic && (
                <DropdownMenuItem
                  onSelect={() =>
                    duplicate.mutate([flow.id], { onSuccess: () => toast(t.common.duplicate) })
                  }
                >
                  <Copy />
                  {t.builder.duplicateFlow}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setVersionsOpen(true)}>
                <History />
                {t.builder.versions}
              </DropdownMenuItem>
              {flow.status === "live" && (
                <DropdownMenuItem onSelect={() => setStatus.mutate("stopped", { onSuccess: () => toast(t.builder.stopped) })}>
                  <Square />
                  {t.builder.stopFlow}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
                <Trash2 />
                {t.builder.deleteFlow}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <VersionsDialog flowId={flow.id} open={versionsOpen} onOpenChange={setVersionsOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        destructive
        title={t.automation.deleteConfirmTitle}
        description={fmt(t.automation.deleteConfirm, { name })}
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await trash.mutateAsync([flow.id]);
          router.push(flow.is_basic ? "/app/automation/basic" : "/app/automation");
        }}
      />
    </div>
  );
}

function VersionsDialog({ flowId, open, onOpenChange }: { flowId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const versions = useVersions(flowId, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t.builder.versions}</DialogTitle>
        <div className="mt-4">
          {versions.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : versions.data?.length === 0 ? (
            <p className="text-sm text-muted">{t.builder.noVersions}</p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.data?.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="font-medium">{fmt(t.builder.versionN, { n: v.version })}</span>
                    <span className="ml-2 text-muted">{formatDate(v.created_at, undefined, true)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      useEditor.getState().update(() => normalizeDraft(v.draft));
                      onOpenChange(false);
                    }}
                  >
                    {t.builder.restoreDraft}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
