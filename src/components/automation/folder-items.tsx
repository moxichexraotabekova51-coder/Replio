"use client";

import { Folder, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/provider";
import type { FolderRow } from "@/lib/queries/automation";
import { cn } from "@/lib/utils";
import { DRAG_MIME, flowCountLabel } from "./flow-items";

export function readDragIds(e: React.DragEvent): string[] | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

/** Avtomatlashtirishni sudrab tashlash mumkin bo'lgan hudud */
export function useDropTarget(onDrop: (ids: string[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const ids = readDragIds(e);
        if (ids?.length) {
          e.preventDefault();
          onDrop(ids);
        }
      },
    },
  };
}

export function FolderCard({
  folder,
  count,
  onOpen,
  onRename,
  onDelete,
  onDropFlows,
  editable,
}: {
  folder: FolderRow;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropFlows: (ids: string[]) => void;
  editable: boolean;
}) {
  const t = useT();
  const drop = useDropTarget(onDropFlows);
  const temp = folder.id.startsWith("temp-");
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => !temp && onOpen()}
      onKeyDown={(e) => e.key === "Enter" && !temp && onOpen()}
      {...(editable ? drop.props : {})}
      className={cn(
        "group flex h-[72px] cursor-pointer items-center gap-3 rounded-[12px] border border-border bg-bg px-4 shadow-sm transition-colors hover:border-border-strong",
        drop.over && "border-2 border-fg bg-bg-subtle",
        temp && "opacity-60",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-bg-muted">
        <Folder className="size-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{folder.name}</span>
        <span className="block text-[12px] text-muted">{flowCountLabel(t, count)}</span>
      </span>
      {editable && !temp && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex size-8 items-center justify-center rounded-[6px] text-muted opacity-0 outline-none hover:bg-bg-muted hover:text-fg group-hover:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
              aria-label="Papka amallari"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={onRename}>
              <Pencil />
              {t.common.rename}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete}>
              <Trash2 />
              {t.common.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** "+ New Folder" — dashed kartochka, bosilganda inline nom kiritish */
export function NewFolderCard({ onCreate }: { onCreate: (name: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const v = name.trim();
    if (v) onCreate(v.slice(0, 100));
    setName("");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex h-12 items-center rounded-[6px] border border-fg bg-bg px-3">
        <Folder className="mr-2 size-4 shrink-0 text-muted" />
        <input
          autoFocus
          value={name}
          maxLength={100}
          placeholder={t.automation.folderPlaceholder}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setName("");
              setEditing(false);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-border-dashed text-sm font-medium text-fg hover:border-fg hover:bg-bg-subtle"
    >
      <Plus className="size-4" />
      {t.automation.newFolder}
    </button>
  );
}
