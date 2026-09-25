"use client";

import { Hand, MessageSquareReply, MoreVertical, Pause, Pencil, Play, Plus, SquareSlash, Trash2, X, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { TelegramIcon } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useTriggerMutations, type FlowTrigger } from "@/lib/queries/builder";
import { triggerSummary } from "@/lib/triggers";
import { cn, formatNumber } from "@/lib/utils";

/** 2-fazada qo'llab-quvvatlanadigan trigger turlari (qolganlari 4-fazada qo'shiladi) */
const SUPPORTED: { type: "keyword" | "welcome" | "command" | "default_reply"; icon: LucideIcon }[] = [
  { type: "keyword", icon: MessageSquareReply },
  { type: "welcome", icon: Hand },
  { type: "command", icon: SquareSlash },
  { type: "default_reply", icon: Zap },
];

export function TriggersPanel({
  flowId,
  triggers,
  fixed,
  canEdit,
  invalid,
}: {
  flowId: string;
  triggers: FlowTrigger[];
  /** Basic avtomatlashtirish (Welcome / Default Reply) — trigger o'zgarmaydi */
  fixed: boolean;
  canEdit: boolean;
  invalid?: boolean;
}) {
  const t = useT();
  const m = useTriggerMutations(flowId);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<{ type: string; trigger?: FlowTrigger } | null>(null);

  return (
    <div className="space-y-3">
      {triggers.map((tr) => {
        const s = triggerSummary(t, tr.type, tr.config as never);
        const editable = canEdit && !fixed && (tr.type === "keyword" || tr.type === "command");
        return (
          <div key={tr.id} className={cn("flex items-center gap-3 rounded-[12px] border border-border bg-bg px-4 py-3", !tr.is_active && "bg-bg-subtle")}>
            <TelegramIcon size={20} />
            <button
              type="button"
              disabled={!editable}
              onClick={() => setEditing({ type: tr.type, trigger: tr })}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left text-sm disabled:cursor-default"
            >
              <span className="font-medium">{s.label}</span>
              {s.chips.map((c) => (
                <code key={c} className="rounded-[4px] bg-bg-muted px-1.5 py-px font-sans text-[12px] font-medium">
                  {c}
                </code>
              ))}
            </button>
            <span className="shrink-0 text-[12px] text-muted">{fmt(t.builder.triggerRuns, { n: formatNumber(tr.run_count) })}</span>
            {canEdit && !tr.id.startsWith("temp-") && (
              <>
                <Switch
                  checked={tr.is_active}
                  onCheckedChange={(v) => m.update.mutate({ id: tr.id, patch: { is_active: v } })}
                  aria-label={tr.is_active ? t.builder.triggerActive : t.builder.triggerPaused}
                />
                {!fixed && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label="Trigger amallari">
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {editable && (
                        <DropdownMenuItem onSelect={() => setEditing({ type: tr.type, trigger: tr })}>
                          <Pencil />
                          {t.builder.editTrigger}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => m.update.mutate({ id: tr.id, patch: { is_active: !tr.is_active } })}>
                        {tr.is_active ? <Pause /> : <Play />}
                        {tr.is_active ? t.builder.pauseTrigger : t.builder.resumeTrigger}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => m.remove.mutate(tr.id)}>
                        <Trash2 />
                        {t.builder.deleteTrigger}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        );
      })}

      {fixed ? (
        <p className="text-[12px] text-muted">{t.builder.fixedTrigger}</p>
      ) : (
        canEdit && (
          <button
            type="button"
            onClick={() => setPicker(true)}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg hover:bg-bg-subtle",
              invalid && "border-2 border-solid border-fg",
            )}
          >
            {invalid && <span aria-hidden>⚠</span>}
            <Plus className="size-4" />
            {t.builder.newTrigger}
          </button>
        )
      )}

      <TriggerPicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(type) => {
          setPicker(false);
          if (type === "keyword" || type === "command") setEditing({ type });
          else m.create.mutate({ type, config: {} });
        }}
      />
      <TriggerEditor
        key={editing?.trigger?.id ?? editing?.type ?? "none"}
        state={editing}
        onClose={() => setEditing(null)}
        onSave={(type, config) => {
          if (editing?.trigger) m.update.mutate({ id: editing.trigger.id, patch: { config } });
          else m.create.mutate({ type, config });
          setEditing(null);
        }}
      />
    </div>
  );
}

function TriggerPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (type: string) => void }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] p-0">
        <DialogTitle className="border-b border-border px-6 py-5">{t.builder.triggerModal}</DialogTitle>
        <div className="grid min-h-[320px] md:grid-cols-[220px_1fr]">
          <div className="border-border p-3 md:border-r">
            <div className="px-2 pb-2 text-[12px] font-semibold uppercase text-muted">{t.builder.channel}</div>
            <div className="flex h-11 items-center gap-2.5 rounded-[8px] bg-active px-3 text-sm font-medium">
              <TelegramIcon size={20} />
              Telegram
            </div>
          </div>
          <ul className="p-3">
            {SUPPORTED.map(({ type, icon: Icon }) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => onPick(type)}
                  className="flex w-full items-start gap-3 rounded-[8px] px-3 py-3 text-left hover:bg-bg-muted"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-bg">
                    <Icon className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{t.triggerTypes[type]}</span>
                    <span className="block text-[13px] text-muted">{t.builder.triggerDesc[type]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TriggerEditor({
  state,
  onClose,
  onSave,
}: {
  state: { type: string; trigger?: FlowTrigger } | null;
  onClose: () => void;
  onSave: (type: string, config: Record<string, unknown>) => void;
}) {
  const t = useT();
  const cfg = (state?.trigger?.config ?? {}) as { match?: string; keywords?: string[]; translit?: boolean; command?: string };
  const [match, setMatch] = useState(cfg.match ?? "contains");
  const [keywords, setKeywords] = useState<string[]>(cfg.keywords ?? []);
  const [input, setInput] = useState("");
  const [translit, setTranslit] = useState(cfg.translit !== false);
  const [command, setCommand] = useState(cfg.command ?? "");
  const [error, setError] = useState<string>();
  const type = state?.type;

  function addKeyword() {
    const parts = input.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setKeywords((k) => [...new Set([...k, ...parts.map((p) => p.slice(0, 64))])].slice(0, 50));
    setInput("");
    setError(undefined);
  }

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{type ? t.triggerTypes[type as keyof typeof t.triggerTypes] : ""}</DialogTitle>
        {type === "keyword" && (
          <div className="mt-5 space-y-4">
            <div>
              <Label htmlFor="kw-match">{t.builder.keywordMatch}</Label>
              <NativeSelect id="kw-match" value={match} onChange={(e) => setMatch(e.target.value)}>
                <option value="contains">{t.keywordMatch.contains}</option>
                <option value="is">{t.keywordMatch.is}</option>
                <option value="begins_with">{t.keywordMatch.begins_with}</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="kw-input">{t.builder.keywords}</Label>
              <div className={cn("flex min-h-10 flex-wrap items-center gap-1.5 rounded-[6px] border border-border px-2 py-1.5 focus-within:border-fg", error && "border-2 border-fg")}>
                {keywords.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-[4px] bg-bg-muted py-0.5 pl-2 pr-1 text-[13px] font-medium">
                    {k}
                    <button type="button" onClick={() => setKeywords((x) => x.filter((y) => y !== k))} className="rounded hover:bg-border" aria-label={`${k} ni olib tashlash`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="kw-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addKeyword();
                    }
                    if (e.key === "Backspace" && !input && keywords.length) setKeywords((x) => x.slice(0, -1));
                  }}
                  onBlur={addKeyword}
                  className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <p className="mt-1 text-[12px] text-muted">{t.builder.keywordsHint}</p>
              <FieldError>{error}</FieldError>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              {t.builder.translit}
              <Switch checked={translit} onCheckedChange={setTranslit} />
            </label>
          </div>
        )}
        {type === "command" && (
          <div className="mt-5">
            <Label htmlFor="cmd">{t.builder.commandName}</Label>
            <div className="flex items-center rounded-[6px] border border-border focus-within:border-fg">
              <span className="pl-3 text-muted">/</span>
              <input
                id="cmd"
                autoFocus
                value={command}
                onChange={(e) => {
                  setCommand(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 32));
                  setError(undefined);
                }}
                className="h-10 flex-1 bg-transparent px-1 text-sm outline-none"
              />
            </div>
            <p className="mt-1 text-[12px] text-muted">{t.builder.commandHint}</p>
            <FieldError>{error}</FieldError>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              if (type === "keyword") {
                const all = input.trim() ? [...keywords, input.trim()] : keywords;
                if (!all.length) return setError(t.common.required);
                onSave("keyword", { match, keywords: [...new Set(all)], translit });
              } else if (type === "command") {
                if (!command) return setError(t.common.required);
                onSave("command", { command });
              }
            }}
          >
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
