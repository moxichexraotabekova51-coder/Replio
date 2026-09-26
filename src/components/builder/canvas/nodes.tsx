"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, GitBranch, Play, Shuffle, StickyNote, Zap } from "lucide-react";
import { memo } from "react";
import { TelegramIcon } from "@/components/brand/logo";
import type { DraftNode } from "@/lib/flow/draft";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { triggerSummary } from "@/lib/triggers";
import { cn } from "@/lib/utils";
import { useEditor } from "../store";
import { useCanvasData } from "./canvas-context";

type P = NodeProps & { data: { node: DraftNode } };

const handleCls = "!size-3.5 !border-2 !border-fg !bg-bg";

function OutHandle({ id, label, filled, className }: { id: string; label: string; filled?: boolean; className?: string }) {
  return (
    <div className={cn("relative flex h-8 items-center justify-end gap-2 pr-1 text-[13px] font-medium", className)}>
      {label}
      <Handle type="source" position={Position.Right} id={id} className={cn(handleCls, "!relative !right-auto !top-auto !translate-x-0 !translate-y-0", filled && "!bg-fg")} />
    </div>
  );
}

function InHandle() {
  return <Handle type="target" position={Position.Left} id="in" className={cn(handleCls, "!-left-2")} />;
}

function Shell({ id, selected, children, className, width }: { id: string; selected?: boolean; children: React.ReactNode; className?: string; width: number }) {
  const issue = useEditor((s) => s.issues.some((i) => i.nodeId === id));
  const stats = useCanvasData().stats[id];
  const t = useT();
  return (
    <div style={{ width }} className="relative">
      {stats && (
        <div className="absolute -top-7 left-4 rounded-[6px] bg-bg px-2 py-0.5 text-[12px] font-medium text-muted shadow-sm">
          {fmt(t.builder.stats, { sent: stats.sent, ctr: stats.sent ? `${Math.round((stats.clicked / stats.sent) * 1000) / 10}%` : "0%" })}
        </div>
      )}
      <div
        className={cn(
          "rounded-[24px] border border-border bg-bg p-6 shadow-sm transition-shadow",
          selected && "border-2 border-fg p-[23px]",
          issue && !selected && "border-2 border-dashed border-fg p-[23px]",
          className,
        )}
      >
        {issue && <span className="absolute right-5 top-5 text-[16px]" aria-label="Xato">⚠</span>}
        {children}
      </div>
    </div>
  );
}

function Title({ icon, kicker, title }: { icon: React.ReactNode; kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <div className="text-[12px] text-muted">{kicker}</div>
        <div className="truncate text-[22px] font-semibold leading-tight">{title}</div>
      </div>
    </div>
  );
}

export const TriggerNodeView = memo(function TriggerNodeView({ id, selected }: P) {
  const t = useT();
  const { triggers } = useCanvasData();
  return (
    <Shell id={id} selected={selected} width={575}>
      <div className="flex items-center gap-2 text-[24px] font-semibold">
        <Zap className="size-6" />
        {t.builder.when}
      </div>
      <p className="mt-2 text-sm text-muted">{t.builder.whenDesc}</p>
      <div className="mt-4 space-y-2">
        {triggers.map((tr) => {
          const s = triggerSummary(t, tr.type, tr.config as never);
          return (
            <div key={tr.id} className={cn("flex flex-wrap items-center gap-1.5 rounded-[12px] bg-bg-muted px-3 py-2.5 text-sm", !tr.is_active && "opacity-50")}>
              <TelegramIcon size={18} />
              <span className="font-medium">{s.label}</span>
              {s.chips.map((c) => (
                <code key={c} className="rounded-[4px] bg-bg px-1.5 font-sans text-[12px] font-medium">
                  {c}
                </code>
              ))}
            </div>
          );
        })}
        <div className="flex h-12 items-center justify-center rounded-[12px] border border-dashed border-border-dashed text-sm font-medium">+ {t.builder.newTrigger}</div>
      </div>
      <div className="mt-4 flex justify-end">
        <OutHandle id="then" label="Then" filled />
      </div>
    </Shell>
  );
});

export const MessageNodeView = memo(function MessageNodeView({ id, selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "message") return null;
  return (
    <Shell id={id} selected={selected} width={505}>
      <InHandle />
      <Title icon={<TelegramIcon size={32} />} kicker={t.builder.telegram} title={node.data.name} />
      <div className="mt-4 space-y-2">
        {node.data.blocks.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-border-dashed p-3 text-center text-sm text-muted">{t.builder.addText}</div>
        )}
        {node.data.blocks.map((b) => (
          <div key={b.id}>
            {b.type === "text" && (
              <div className="rounded-[12px] bg-bg-muted px-3 py-2.5 text-sm">
                <div className="line-clamp-4 whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: previewHtml(b.text) || `<span class="text-muted">${t.builder.textPlaceholder}</span>` }} />
                {b.buttons.map((btn) => (
                  <div key={btn.id} className="mt-2 flex items-center justify-center rounded-[8px] border border-border bg-bg py-1.5 text-[13px] font-medium">
                    {btn.kind === "step" ? <OutHandle id={btn.id} label={btn.title || "…"} className="w-full justify-center" /> : btn.title || "…"}
                  </div>
                ))}
              </div>
            )}
            {b.type === "delay" && (
              <div className="flex items-center gap-2 rounded-[12px] border border-dashed border-border-dashed px-3 py-2 text-[13px] text-muted">
                <Clock className="size-4" />
                {b.seconds} s
              </div>
            )}
            {(b.type === "image" || b.type === "gif") && b.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.url} alt="" className="max-h-40 w-full rounded-[12px] object-cover" />
            )}
            {(b.type === "video" || b.type === "audio" || b.type === "file" || ((b.type === "image" || b.type === "gif") && !b.url)) && (
              <div className="rounded-[12px] bg-bg-muted px-3 py-2.5 text-[13px]">📎 {("name" in b && b.name) || b.type}</div>
            )}
            {b.type === "input" && (
              <div className="rounded-[12px] border border-fg px-3 py-2.5 text-sm">
                <div className="text-[11px] font-semibold uppercase text-muted">{t.builder.blockInput} · {t.builder.inputKinds[b.kind]}</div>
                <div className="line-clamp-2">{b.text || "…"}</div>
                {b.timeout_min ? <OutHandle id={`timeout:${b.id}`} label="Timeout" /> : null}
              </div>
            )}
            {b.type === "request" && (
              <div className="rounded-[12px] bg-bg-muted px-3 py-2.5 text-sm">
                <div className="line-clamp-2">{b.text || "…"}</div>
                <div className="mt-2 rounded-[8px] border border-border bg-bg py-1.5 text-center text-[13px] font-medium">{b.button || (b.kind === "contact" ? "📱" : "📍")}</div>
              </div>
            )}
          </div>
        ))}
        {(node.data.menu ?? []).length > 0 && (
          <div className="rounded-[12px] border border-border p-2">
            <div className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted">{t.builder.telegramMenu}</div>
            {node.data.menu!.map((m) => (
              <OutHandle key={m.id} id={m.id} label={m.title || "…"} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <OutHandle id="next" label={t.builder.nextStep} />
      </div>
    </Shell>
  );
});

export const ActionNodeView = memo(function ActionNodeView({ id, selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "action") return null;
  return (
    <Shell id={id} selected={selected} width={420}>
      <InHandle />
      <Title icon={<span className="flex size-8 items-center justify-center rounded-[8px] bg-[#3f3f46] text-bg"><Zap className="size-4" /></span>} kicker={t.builder.stepTypes.action} title={node.data.name} />
      <ul className="mt-3 space-y-1.5">
        {node.data.actions.length === 0 && <li className="text-sm text-muted">—</li>}
        {node.data.actions.map((a) => (
          <li key={a.id} className="rounded-[8px] bg-bg-muted px-3 py-2 text-[13px] font-medium">
            {t.builder.actions[a.a]}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <OutHandle id="next" label={t.builder.nextStep} />
      </div>
    </Shell>
  );
});

export const ConditionNodeView = memo(function ConditionNodeView({ id, selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "condition") return null;
  return (
    <Shell id={id} selected={selected} width={420}>
      <InHandle />
      <Title icon={<span className="flex size-8 items-center justify-center rounded-[8px] bg-[#71717a] text-bg"><GitBranch className="size-4" /></span>} kicker={t.builder.stepTypes.condition} title={node.data.name} />
      <p className="mt-3 text-[13px] text-muted">
        {node.data.rules.length === 0 ? t.builder.noConditions : `${node.data.rules.length} × ${node.data.op === "and" ? "AND" : "OR"}`}
      </p>
      <div className="mt-2 flex flex-col items-end">
        <OutHandle id="yes" label={t.builder.yes} filled />
        <OutHandle id="no" label={t.builder.no} />
      </div>
    </Shell>
  );
});

export const RandomizerNodeView = memo(function RandomizerNodeView({ id, selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "randomizer") return null;
  return (
    <Shell id={id} selected={selected} width={380} className="border-fg">
      <InHandle />
      <Title icon={<Shuffle className="size-6" />} kicker={t.builder.stepTypes.randomizer} title={node.data.name} />
      <div className="mt-3 flex flex-col items-end">
        {node.data.variants.map((v, i) => (
          <OutHandle key={v.id} id={v.id} label={`${String.fromCharCode(65 + i)} · ${v.pct}%`} />
        ))}
      </div>
    </Shell>
  );
});

export const SmartDelayNodeView = memo(function SmartDelayNodeView({ id, selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "smart_delay") return null;
  return (
    <Shell id={id} selected={selected} width={360} className="border-2 border-dashed border-fg">
      <InHandle />
      <Title icon={<Clock className="size-6" />} kicker={t.builder.stepTypes.smart_delay} title={`${node.data.amount} ${t.builder.units[node.data.unit]}`} />
      {node.data.business_hours && <p className="mt-2 text-[12px] text-muted">09:00–18:00</p>}
      <div className="mt-3 flex justify-end">
        <OutHandle id="next" label={t.builder.nextStep} />
      </div>
    </Shell>
  );
});

export const StartFlowNodeView = memo(function StartFlowNodeView({ id, selected, data }: P) {
  const t = useT();
  const { flows } = useCanvasData();
  const node = data.node;
  if (node.type !== "start_flow") return null;
  const target = flows.find((f) => f.id === node.data.flow_id);
  return (
    <Shell id={id} selected={selected} width={360}>
      <InHandle />
      <Title icon={<Play className="size-6" />} kicker={t.builder.stepTypes.start_flow} title={target?.name ?? "—"} />
    </Shell>
  );
});

export const CommentNodeView = memo(function CommentNodeView({ selected, data }: P) {
  const t = useT();
  const node = data.node;
  if (node.type !== "comment") return null;
  return (
    <div className={cn("w-[280px] rounded-[4px] border border-border-strong bg-bg p-4 shadow-sm", selected && "border-2 border-fg")}>
      <StickyNote className="mb-2 size-4 text-muted" />
      <p className="whitespace-pre-wrap text-sm">{node.data.text || <span className="text-muted">{t.builder.commentPlaceholder}</span>}</p>
    </div>
  );
});

/** Canvas'da ko'rsatish uchun xavfsiz HTML (faqat b/i/u/s/code/a — qolgani escape) */
function previewHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/&lt;(\/?)(b|strong|i|em|u|s|code)&gt;/gi, "<$1$2>")
    .replace(/&lt;a href="(https?:\/\/[^"&<>]+)"&gt;/gi, '<a class="underline" href="$1" target="_blank" rel="noopener noreferrer">')
    .replace(/&lt;\/a&gt;/gi, "</a>")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, '<span class="rounded bg-bg px-1 text-[12px] font-medium">{{$1}}</span>');
}

export const nodeTypes = {
  trigger: TriggerNodeView,
  message: MessageNodeView,
  action: ActionNodeView,
  condition: ConditionNodeView,
  randomizer: RandomizerNodeView,
  smart_delay: SmartDelayNodeView,
  start_flow: StartFlowNodeView,
  comment: CommentNodeView,
};
