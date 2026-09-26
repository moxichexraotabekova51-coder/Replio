"use client";

import { Copy, Folder, FolderInput, MoreVertical, Pencil, Play, Square, Trash2 } from "lucide-react";
import { TelegramIcon } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmt, type Dictionary } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import type { FlowRow, FolderRow } from "@/lib/queries/automation";
import { timeAgo } from "@/lib/time";
import { triggerSummary } from "@/lib/triggers";
import { cn, formatNumber, percent } from "@/lib/utils";

export const LIST_COLS = "grid-cols-[28px_minmax(0,1fr)_88px_88px_150px_40px] max-md:grid-cols-[28px_minmax(0,1fr)_40px]";

export const DRAG_MIME = "application/x-replio-flows";

export function StatusBadge({ flow }: { flow: Pick<FlowRow, "status" | "has_unpublished"> }) {
  const t = useT();
  if (flow.status === "live") return <Badge status="live">{t.automation.live}</Badge>;
  if (flow.status === "stopped") return <Badge status="stopped">{t.automation.stopped}</Badge>;
  return <Badge status="draft">{t.automation.draft}</Badge>;
}

export type FlowActions = {
  rename: (f: FlowRow) => void;
  duplicate: (f: FlowRow) => void;
  move: (f: FlowRow, folderId: string | null) => void;
  setStatus: (f: FlowRow, status: "live" | "stopped") => void;
  remove: (f: FlowRow) => void;
};

export function FlowMenu({
  flow,
  folders,
  actions,
  className,
}: {
  flow: FlowRow;
  folders: FolderRow[];
  actions: FlowActions;
  className?: string;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex size-9 items-center justify-center rounded-[6px] text-muted outline-none hover:bg-bg-muted hover:text-fg data-[state=open]:bg-bg-muted data-[state=open]:text-fg data-[state=open]:opacity-100",
            className,
          )}
          aria-label="Amallar"
        >
          <MoreVertical className="size-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => actions.rename(flow)}>
          <Pencil />
          {t.common.rename}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(flow)}>
          <Copy />
          {t.common.duplicate}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput />
            {t.automation.moveToFolder}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem disabled={flow.folder_id === null} onSelect={() => actions.move(flow, null)}>
              {t.automation.noFolder}
            </DropdownMenuItem>
            {folders.map((f) => (
              <DropdownMenuItem key={f.id} disabled={flow.folder_id === f.id} onSelect={() => actions.move(flow, f.id)}>
                <Folder />
                <span className="truncate">{f.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {flow.status === "live" && (
          <DropdownMenuItem onSelect={() => actions.setStatus(flow, "stopped")}>
            <Square />
            {t.automation.stop}
          </DropdownMenuItem>
        )}
        {flow.status === "stopped" && flow.published_version > 0 && (
          <DropdownMenuItem onSelect={() => actions.setStatus(flow, "live")}>
            <Play />
            {t.automation.setLive}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.remove(flow)}>
          <Trash2 />
          {t.common.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ctr(clicks: number, runs: number) {
  return runs ? percent(clicks, runs) : "—";
}

function TriggerLine({ t, trigger }: { t: Dictionary; trigger: FlowRow["triggers"][number] }) {
  const s = triggerSummary(t, trigger.type, trigger.config);
  return (
    <div className={cn("contents text-[13px]", !trigger.is_active && "[&>*]:opacity-60")}>
      <span />
      <span className="flex min-w-0 items-center gap-2">
        <TelegramIcon size={16} />
        <span className="shrink-0 text-muted">{s.label}</span>
        <span className="flex min-w-0 gap-1 overflow-hidden">
          {s.chips.slice(0, 4).map((c) => (
            <code key={c} className="truncate rounded-[4px] bg-bg-muted px-1.5 py-px font-sans text-[12px] font-medium text-fg">
              {c}
            </code>
          ))}
          {s.chips.length > 4 && <span className="text-muted">+{s.chips.length - 4}</span>}
        </span>
      </span>
      <span className="text-right text-[12px] text-muted max-md:hidden">{formatNumber(trigger.run_count)}</span>
      <span className="text-right text-[12px] text-muted max-md:hidden">{ctr(trigger.click_count, trigger.run_count)}</span>
      <span className="max-md:hidden" />
      <span />
    </div>
  );
}

type ItemProps = {
  flow: FlowRow;
  folders: FolderRow[];
  selected: boolean;
  selectable: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  actions: FlowActions | null;
  dragIds: () => string[];
};

export function FlowListItem({ flow, folders, selected, selectable, onSelect, onOpen, actions, dragIds }: ItemProps) {
  const t = useT();
  return (
    <div
      role="link"
      tabIndex={0}
      draggable={selectable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds()));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "group grid min-h-24 cursor-pointer items-center gap-x-4 gap-y-2 rounded-[12px] border border-border bg-bg px-6 py-5 shadow-sm transition-colors hover:border-border-strong",
        LIST_COLS,
        selected && "border-fg hover:border-fg",
      )}
    >
      <span onClick={(e) => e.stopPropagation()} className="flex items-center">
        {selectable && <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={flow.name} />}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <StatusBadge flow={flow} />
        <span className="truncate text-[20px] font-semibold leading-tight">{flow.name}</span>
      </span>
      <span className="text-right text-sm max-md:hidden">{formatNumber(flow.runs)}</span>
      <span className="text-right text-sm max-md:hidden">{ctr(flow.clicks, flow.runs)}</span>
      <span className="text-right text-sm text-muted max-md:hidden">{timeAgo(t, flow.updated_at)}</span>
      <span className="flex justify-end">
        {actions && (
          <FlowMenu flow={flow} folders={folders} actions={actions} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" />
        )}
      </span>
      {flow.triggers.map((tr) => (
        <TriggerLine key={tr.id} t={t} trigger={tr} />
      ))}
    </div>
  );
}

export function FlowGridItem({ flow, folders, selected, selectable, onSelect, onOpen, actions, dragIds }: ItemProps) {
  const t = useT();
  const first = flow.triggers[0] ? triggerSummary(t, flow.triggers[0].type, flow.triggers[0].config) : null;
  return (
    <div
      role="link"
      tabIndex={0}
      draggable={selectable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds()));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "group flex min-h-[184px] cursor-pointer flex-col rounded-[12px] border border-border bg-bg p-5 shadow-sm transition-colors hover:border-border-strong",
        selected && "border-fg hover:border-fg",
      )}
    >
      <div className="flex items-center gap-3">
        <span onClick={(e) => e.stopPropagation()} className="flex">
          {selectable && <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={flow.name} />}
        </span>
        <StatusBadge flow={flow} />
        <span className="ml-auto">
          {actions && <FlowMenu flow={flow} folders={folders} actions={actions} className="-mr-2" />}
        </span>
      </div>
      <div className="mt-3 line-clamp-2 text-[18px] font-semibold leading-snug">{flow.name}</div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-[13px] text-muted">
        {first ? (
          <>
            <TelegramIcon size={16} />
            <span className="truncate">
              {first.label}
              {first.chips[0] ? ` · ${first.chips[0]}` : ""}
            </span>
            {flow.triggers.length > 1 && <span className="shrink-0">+{flow.triggers.length - 1}</span>}
          </>
        ) : (
          t.automation.noTriggers
        )}
      </div>
      <div className="mt-auto flex items-end justify-between pt-4 text-[13px]">
        <span className="flex gap-4">
          <span>
            <span className="block text-[11px] text-muted">{t.automation.colRuns}</span>
            {formatNumber(flow.runs)}
          </span>
          <span>
            <span className="block text-[11px] text-muted">{t.automation.colCtr}</span>
            {ctr(flow.clicks, flow.runs)}
          </span>
        </span>
        <span className="text-muted">{timeAgo(t, flow.updated_at)}</span>
      </div>
    </div>
  );
}

export function flowCountLabel(t: Dictionary, n: number) {
  return fmt(t.automation.folderItems, { n });
}
