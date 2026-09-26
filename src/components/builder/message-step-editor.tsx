"use client";

import { ArrowDown, ArrowUp, Clock, Copy, FileText, Film, GripVertical, Image as ImageIcon, ListPlus, MapPin, MoreVertical, Music, Pencil, Phone, Sparkle, TextCursorInput, Trash2, Type } from "lucide-react";
import { useState } from "react";
import { TelegramIcon } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/input";
import { useApp } from "@/components/providers/app-provider";
import { planFeatures } from "@/lib/billing";
import { uid, type DraftBlock, type MessageNode } from "@/lib/flow/draft";
import { usePricingModal } from "@/lib/stores/ui";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useEditor } from "./store";
import { InputBlockEditor, MediaBlockEditor, MenuEditor, RequestBlockEditor } from "./block-editors";
import { TextBlockEditor } from "./text-block-editor";

const DELAYS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

/** 12.2 — "Send Message" tahriri: bloklar ketma-ketligi va kontent qo'shish kartochkalari */
/** mode: "flow" — to'liq; "basic" — matn/delay, URL tugmalar; "broadcast" — barcha bloklar, tugmalar URL/avtomatlashtirish (step'siz), menyusiz */
export function MessageStepEditor({ node, readOnly, mode = "flow" }: { node: MessageNode; readOnly?: boolean; mode?: "flow" | "basic" | "broadcast" }) {
  const rich = mode !== "basic";
  const t = useT();
  const app = useApp();
  const showPricing = usePricingModal((s) => s.show);
  const canCollect = !!planFeatures(app.plan).data_collection && !app.billing.expired;
  const update = useEditor((s) => s.update);
  const issues = useEditor((s) => s.issues);
  const [renaming, setRenaming] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const setNode = (fn: (n: MessageNode) => void) =>
    update((d) => {
      const n = d.nodes.find((x) => x.id === node.id);
      if (n && n.type === "message") fn(n);
      return d;
    });

  const setBlock = (i: number, b: DraftBlock) => setNode((n) => void (n.data.blocks[i] = b));
  const move = (from: number, to: number) =>
    setNode((n) => {
      if (to < 0 || to >= n.data.blocks.length) return;
      const [b] = n.data.blocks.splice(from, 1);
      n.data.blocks.splice(to, 0, b);
    });
  const addBlock = (b: DraftBlock) => setNode((n) => void n.data.blocks.push(b));

  const stepEmpty = issues.some((x) => x.nodeId === node.id && x.code === "empty_step");

  return (
    <div className={cn("space-y-4", stepEmpty && "rounded-[12px] ring-2 ring-fg ring-offset-4")}>
      <div className="flex items-center gap-2">
        <TelegramIcon size={20} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={node.data.name}
            maxLength={60}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== node.data.name) setNode((n) => void (n.data.name = v));
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            aria-label={t.builder.renameStep}
            className="h-8 rounded-[6px] border border-fg px-2 text-[18px] font-semibold outline-none"
          />
        ) : (
          <>
            <h3 className="text-[18px] font-semibold">{node.data.name}</h3>
            {!readOnly && (
              <button onClick={() => setRenaming(true)} className="flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.builder.renameStep}>
                <Pencil className="size-3.5" />
              </button>
            )}
          </>
        )}
        {stepEmpty && <span className="ml-auto text-[13px] font-medium">⚠ {t.builder.issues.empty_step}</span>}
      </div>

      {node.data.blocks.map((b, i) => {
        const invalid = issues.some((x) => x.nodeId === node.id && x.blockId === b.id);
        return (
          <div
            key={b.id}
            className={cn("group relative pl-6", dragIndex === i && "opacity-40")}
            onDragOver={(e) => {
              if (dragIndex !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
              setDragIndex(null);
            }}
          >
            {!readOnly && (
              <>
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className="absolute left-0 top-3 cursor-grab text-muted opacity-0 group-hover:opacity-100"
                  aria-hidden
                >
                  <GripVertical className="size-4" />
                </span>
                <div className="absolute -right-2 top-1 z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <BlockMenu
                    onUp={i > 0 ? () => move(i, i - 1) : undefined}
                    onDown={i < node.data.blocks.length - 1 ? () => move(i, i + 1) : undefined}
                    onDuplicate={() => setNode((n) => void n.data.blocks.splice(i + 1, 0, { ...structuredClone(b), id: uid("b") }))}
                    onDelete={() => setNode((n) => void n.data.blocks.splice(i, 1))}
                  />
                </div>
              </>
            )}
            {b.type === "text" && <TextBlockEditor block={b} invalid={invalid} onChange={(nb) => setBlock(i, nb)} buttonKinds={mode === "flow" ? ["step", "url", "flow"] : mode === "broadcast" ? ["url", "flow"] : ["url"]} />}
            {(b.type === "image" || b.type === "video" || b.type === "audio" || b.type === "file" || b.type === "gif") && (
              <MediaBlockEditor block={b} invalid={invalid} onChange={(nb) => setBlock(i, nb)} />
            )}
            {b.type === "input" && <InputBlockEditor block={b} invalid={invalid} onChange={(nb) => setBlock(i, nb)} />}
            {b.type === "request" && <RequestBlockEditor block={b} invalid={invalid} onChange={(nb) => setBlock(i, nb)} />}
            {b.type === "delay" && (
              <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-border-dashed bg-bg px-4 py-3 text-sm">
                <Clock className="size-4 shrink-0" />
                <NativeSelect
                  aria-label={t.builder.blockDelay}
                  className="h-9 w-24"
                  value={b.seconds}
                  onChange={(e) => setBlock(i, { ...b, seconds: Number(e.target.value) })}
                >
                  {DELAYS.map((s) => (
                    <option key={s} value={s}>
                      {s} s
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-muted">{fmt(t.builder.delaySeconds, { n: b.seconds })}</span>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && mode === "flow" && (
        <div className="border-t border-border pt-4">
          {node.data.menu ? (
            <MenuEditor items={node.data.menu} onChange={(items) => setNode((n) => void (n.data.menu = items.length ? items : undefined))} />
          ) : (
            <button
              type="button"
              onClick={() => setNode((n) => void (n.data.menu = [{ id: uid("mm"), title: "" }]))}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg hover:bg-bg-subtle"
            >
              <ListPlus className="size-4" />+ {t.builder.telegramMenu}
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-[13px] text-muted">{t.builder.addContent}</p>
          <div className="grid grid-cols-2 gap-3">
            <AddCard icon={<Type className="size-5" />} title={t.builder.blockText} desc={t.builder.blockTextDesc} onClick={() => addBlock({ id: uid("b"), type: "text", text: "", buttons: [] })} />
            {rich && (
              <AddCard icon={<ImageIcon className="size-5" />} title={t.builder.blockImage} desc={t.builder.blockImageDesc} onClick={() => addBlock({ id: uid("b"), type: "image", url: "" })} />
            )}
            <AddCard icon={<Clock className="size-5" />} title={t.builder.blockDelay} desc={t.builder.blockDelayDesc} onClick={() => addBlock({ id: uid("b"), type: "delay", seconds: 3 })} />
            {rich && (
              <>
                <AddCard
                  icon={<TextCursorInput className="size-5" />}
                  title={t.builder.blockInput}
                  desc={t.builder.blockInputDesc}
                  badge={canCollect ? undefined : t.builder.upgradeBadge}
                  onClick={() =>
                    canCollect
                      ? addBlock({ id: uid("b"), type: "input", text: "", kind: "text", choices: [], field_id: null, error: "", skip: null, timeout_min: null })
                      : showPricing("pro")
                  }
                />
                <AddCard icon={<Film className="size-5" />} title={t.builder.blockVideo} desc={t.builder.blockVideoDesc} onClick={() => addBlock({ id: uid("b"), type: "video", url: "" })} />
                <AddCard icon={<Music className="size-5" />} title={t.builder.blockAudio} desc={t.builder.blockAudioDesc} onClick={() => addBlock({ id: uid("b"), type: "audio", url: "" })} />
                <AddCard icon={<FileText className="size-5" />} title={t.builder.blockFile} desc={t.builder.blockFileDesc} onClick={() => addBlock({ id: uid("b"), type: "file", url: "" })} />
                <AddCard icon={<Sparkle className="size-5" />} title={t.builder.blockGif} desc={t.builder.blockGifDesc} onClick={() => addBlock({ id: uid("b"), type: "gif", url: "" })} />
                <AddCard
                  icon={<Phone className="size-5" />}
                  title={t.builder.blockContact}
                  desc={t.builder.blockContactDesc}
                  onClick={() => addBlock({ id: uid("b"), type: "request", kind: "contact", text: "", button: "📱 Raqamni yuborish", field_id: null })}
                />
                <AddCard
                  icon={<MapPin className="size-5" />}
                  title={t.builder.blockLocation}
                  desc={t.builder.blockLocationDesc}
                  onClick={() => addBlock({ id: uid("b"), type: "request", kind: "location", text: "", button: "📍 Lokatsiyani yuborish", field_id: null })}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddCard({ icon, title, desc, onClick, badge }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex items-start gap-3 rounded-[12px] border border-dashed border-border-dashed bg-bg p-3 text-left hover:border-fg hover:bg-bg-subtle"
    >
      {badge && <span className="absolute right-2 top-2 rounded-[4px] bg-fg px-1 text-[9px] font-bold tracking-wide text-bg">{badge}</span>}
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[12px] leading-snug text-muted">{desc}</span>
      </span>
    </button>
  );
}

function BlockMenu({ onUp, onDown, onDuplicate, onDelete }: { onUp?: () => void; onDown?: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex size-7 items-center justify-center rounded-[6px] border border-border bg-bg text-muted shadow-sm hover:text-fg" aria-label="Blok amallari">
          <MoreVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!onUp} onSelect={() => onUp?.()}>
          <ArrowUp />
          {t.builder.blockMoveUp}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!onDown} onSelect={() => onDown?.()}>
          <ArrowDown />
          {t.builder.blockMoveDown}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy />
          {t.builder.blockDuplicate}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>
          <Trash2 />
          {t.builder.blockDelete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
