"use client";

import {
  CalendarClock,
  Copy,
  Download,
  Hand,
  Image as ImageIcon,
  Link2,
  MessageSquareReply,
  MoreVertical,
  Pause,
  Pencil,
  PenLine,
  Play,
  Plus,
  SquareSlash,
  Tag,
  TagsIcon,
  Trash2,
  UserMinus,
  UserPlus,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TelegramIcon } from "@/components/brand/logo";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { planFeatures } from "@/lib/billing";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useAllFields, useTriggerMutations, type FlowTrigger, type TriggerConditions } from "@/lib/queries/builder";
import { useTagsList } from "@/lib/queries/inbox";
import { usePricingModal } from "@/lib/stores/ui";
import { triggerSummary, type TriggerType } from "@/lib/triggers";
import { cn, formatNumber } from "@/lib/utils";
import { cleanRules, RulesEditor, type Rule } from "./rules-editor";

const GROUPS: { key: "messages" | "contact" | "other"; items: { type: TriggerType; icon: LucideIcon }[] }[] = [
  {
    key: "messages",
    items: [
      { type: "keyword", icon: MessageSquareReply },
      { type: "welcome", icon: Hand },
      { type: "ref_url", icon: Link2 },
      { type: "command", icon: SquareSlash },
      { type: "message_type", icon: ImageIcon },
      { type: "default_reply", icon: Zap },
    ],
  },
  {
    key: "contact",
    items: [
      { type: "tag_applied", icon: Tag },
      { type: "tag_removed", icon: TagsIcon },
      { type: "field_changed", icon: PenLine },
      { type: "date_based", icon: CalendarClock },
      { type: "subscribed", icon: UserPlus },
      { type: "unsubscribed", icon: UserMinus },
    ],
  },
  { key: "other", items: [{ type: "webhook", icon: Webhook }] },
];

const MSG_TYPES = ["photo", "video", "document", "voice", "audio", "video_note", "sticker", "animation", "contact", "location"] as const;

function randomRef() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => a[x % a.length]).join("");
}

export function webhookUrl(accountId: string, tr: Pick<FlowTrigger, "id" | "secret">) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/api/hooks/${accountId}/${tr.id}?key=${tr.secret ?? ""}`;
}

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
        const editable = canEdit && !fixed && !tr.id.startsWith("temp-");
        const hasCond = !Array.isArray(tr.conditions) && ((tr.conditions as TriggerConditions)?.rules?.length ?? 0) > 0;
        return (
          <div key={tr.id} className={cn("flex items-center gap-3 rounded-[12px] border border-border bg-bg px-4 py-3", !tr.is_active && "bg-bg-subtle")} data-testid="trigger-card">
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
              {hasCond && <span className="rounded-[4px] border border-border px-1.5 py-px text-[11px] text-muted">{t.builder.conditions}</span>}
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
                      <DropdownMenuItem onSelect={() => setEditing({ type: tr.type, trigger: tr })}>
                        <Pencil />
                        {t.builder.editTrigger}
                      </DropdownMenuItem>
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
          setEditing({ type });
        }}
      />
      <TriggerEditor
        key={editing?.trigger?.id ?? editing?.type ?? "none"}
        state={editing}
        onClose={() => setEditing(null)}
        onSave={(type, config, conditions) => {
          if (editing?.trigger) m.update.mutate({ id: editing.trigger.id, patch: { config, conditions } });
          else m.create.mutate({ type, config, conditions });
          setEditing(null);
        }}
      />
    </div>
  );
}

function TriggerPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (type: string) => void }) {
  const t = useT();
  const app = useApp();
  const showPricing = usePricingModal((s) => s.show);
  const pro = !!planFeatures(app.plan).webhook_trigger;
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
          <div className="max-h-[70vh] overflow-y-auto p-3 scrollbar-thin">
            {GROUPS.map((g) => (
              <div key={g.key} className="mb-2">
                <div className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase text-muted">{t.builder.triggerGroups[g.key]}</div>
                <ul>
                  {g.items.map(({ type, icon: Icon }) => {
                    const locked = type === "webhook" && !pro;
                    return (
                      <li key={type}>
                        <button
                          type="button"
                          onClick={() => (locked ? showPricing("pro") : onPick(type))}
                          className="flex w-full items-start gap-3 rounded-[8px] px-3 py-3 text-left hover:bg-bg-muted"
                        >
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border bg-bg">
                            <Icon className="size-[18px]" />
                          </span>
                          <span className="flex-1">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              {t.triggerTypes[type]}
                              {locked && <span className="rounded-[4px] bg-fg px-1 text-[9px] font-bold text-bg">{t.builder.upgradeBadge}</span>}
                            </span>
                            <span className="block text-[13px] text-muted">{t.builder.triggerDesc[type]}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Cfg = {
  match?: string;
  keywords?: string[];
  translit?: boolean;
  command?: string;
  ref?: string;
  types?: string[];
  tag_id?: string;
  tag_name?: string;
  field_id?: string;
  field_name?: string;
  offset_days?: number;
  time?: string;
};

function TriggerEditor({
  state,
  onClose,
  onSave,
}: {
  state: { type: string; trigger?: FlowTrigger } | null;
  onClose: () => void;
  onSave: (type: string, config: Record<string, unknown>, conditions: TriggerConditions) => void;
}) {
  const t = useT();
  const app = useApp();
  const tags = useTagsList();
  const fields = useAllFields();
  const cfg = (state?.trigger?.config ?? {}) as Cfg;
  const cond0 = (state?.trigger && !Array.isArray(state.trigger.conditions) ? state.trigger.conditions : {}) as { op?: "and" | "or"; rules?: Rule[] };
  const [match, setMatch] = useState(cfg.match ?? "contains");
  const [keywords, setKeywords] = useState<string[]>(cfg.keywords ?? []);
  const [input, setInput] = useState("");
  const [translit, setTranslit] = useState(cfg.translit !== false);
  const [command, setCommand] = useState(cfg.command ?? "");
  const [ref, setRef] = useState(cfg.ref ?? randomRef());
  const [types, setTypes] = useState<string[]>(cfg.types ?? []);
  const [tagId, setTagId] = useState(cfg.tag_id ?? "");
  const [fieldId, setFieldId] = useState(cfg.field_id ?? "");
  const [offset, setOffset] = useState(Math.abs(cfg.offset_days ?? 1));
  const [dir, setDir] = useState<"before" | "after" | "same">(cfg.offset_days === 0 ? "same" : (cfg.offset_days ?? -1) < 0 ? "before" : "after");
  const [time, setTime] = useState(cfg.time ?? "10:00");
  const [op, setOp] = useState<"and" | "or">(cond0.op ?? "and");
  const [rules, setRules] = useState<Rule[]>(cond0.rules ?? []);
  const [showCond, setShowCond] = useState((cond0.rules ?? []).length > 0);
  const [error, setError] = useState<string>();
  const type = state?.type;
  const bot = app.bot?.username;
  const dateFields = fields.data?.filter((f) => !f.is_bot_field && (f.type === "date" || f.type === "datetime")) ?? [];

  function addKeyword() {
    const parts = input.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setKeywords((k) => [...new Set([...k, ...parts.map((p) => p.slice(0, 64))])].slice(0, 50));
    setInput("");
    setError(undefined);
  }

  function save() {
    let config: Record<string, unknown> = {};
    switch (type) {
      case "keyword": {
        const all = input.trim() ? [...keywords, input.trim()] : keywords;
        if (!all.length) return setError(t.common.required);
        config = { match, keywords: [...new Set(all)], translit };
        break;
      }
      case "command":
        if (!command) return setError(t.common.required);
        config = { command };
        break;
      case "ref_url":
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(ref)) return setError(t.builder.refHint);
        config = { ref };
        break;
      case "message_type":
        config = { types };
        break;
      case "tag_applied":
      case "tag_removed":
        if (!tagId) return setError(t.common.required);
        config = { tag_id: tagId, tag_name: tags.data?.find((x) => x.id === tagId)?.name };
        break;
      case "field_changed":
        if (!fieldId) return setError(t.common.required);
        config = { field_id: fieldId, field_name: fields.data?.find((x) => x.id === fieldId)?.name };
        break;
      case "date_based":
        if (!fieldId) return setError(t.common.required);
        config = {
          field_id: fieldId,
          field_name: fields.data?.find((x) => x.id === fieldId)?.name,
          offset_days: dir === "same" ? 0 : dir === "before" ? -offset : offset,
          time,
        };
        break;
    }
    onSave(type!, config, { op, rules: cleanRules(rules) });
  }

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto scrollbar-thin">
        <DialogTitle>{type ? t.triggerTypes[type as TriggerType] : ""}</DialogTitle>
        {type && <p className="mt-1 text-[13px] text-muted">{t.builder.triggerDesc[type as TriggerType]}</p>}

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

        {type === "ref_url" && (
          <div className="mt-5 space-y-3">
            <div>
              <Label htmlFor="ref">{t.builder.refName}</Label>
              <Input
                id="ref"
                value={ref}
                maxLength={64}
                onChange={(e) => {
                  setRef(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""));
                  setError(undefined);
                }}
              />
              <p className="mt-1 text-[12px] text-muted">{t.builder.refHint}</p>
              <FieldError>{error}</FieldError>
            </div>
            {bot ? <LinkWithQr url={`https://t.me/${bot}?start=${ref}`} name={`ref-${ref}`} /> : <p className="text-sm text-muted">{t.builder.previewNoBot}</p>}
          </div>
        )}

        {type === "message_type" && (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-2">
              {MSG_TYPES.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-black"
                    checked={types.includes(k)}
                    onChange={(e) => setTypes((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))}
                  />
                  {t.builder.msgTypes[k]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">{t.builder.msgTypesHint}</p>
          </div>
        )}

        {(type === "tag_applied" || type === "tag_removed") && (
          <div className="mt-5">
            <Label htmlFor="tr-tag">{t.builder.selectTag}</Label>
            <NativeSelect id="tr-tag" value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">—</option>
              {tags.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError>{error}</FieldError>
          </div>
        )}

        {type === "field_changed" && (
          <div className="mt-5">
            <Label htmlFor="tr-field">{t.builder.selectField}</Label>
            <NativeSelect id="tr-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
              <option value="">—</option>
              {fields.data
                ?.filter((f) => !f.is_bot_field)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </NativeSelect>
            <FieldError>{error}</FieldError>
          </div>
        )}

        {type === "date_based" && (
          <div className="mt-5 space-y-3">
            <div>
              <Label htmlFor="tr-date">{t.builder.dateField}</Label>
              <NativeSelect id="tr-date" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
                <option value="">—</option>
                {dateFields.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </NativeSelect>
              {fields.data && dateFields.length === 0 && <p className="mt-1 text-[12px] text-muted">{t.builder.noDateFields}</p>}
              <FieldError>{error}</FieldError>
            </div>
            <div className="flex items-end gap-2">
              {dir !== "same" && (
                <div className="w-24">
                  <Label htmlFor="tr-off">{t.builder.daysOffset}</Label>
                  <Input id="tr-off" type="number" min={1} max={365} value={offset} onChange={(e) => setOffset(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
                </div>
              )}
              <NativeSelect value={dir} aria-label={t.builder.daysOffset} onChange={(e) => setDir(e.target.value as typeof dir)}>
                <option value="before">{t.builder.offsetBefore}</option>
                <option value="same">{t.builder.offsetSame}</option>
                <option value="after">{t.builder.offsetAfter}</option>
              </NativeSelect>
              <div className="w-32">
                <Label htmlFor="tr-time">{t.builder.atTime}</Label>
                <Input id="tr-time" type="time" value={time} onChange={(e) => setTime(e.target.value || "10:00")} />
              </div>
            </div>
          </div>
        )}

        {type === "webhook" && (
          <div className="mt-5 space-y-2">
            <Label>{t.builder.webhookUrl}</Label>
            {state?.trigger?.secret ? (
              <LinkWithQr url={webhookUrl(app.account.id, state.trigger)} noQr />
            ) : (
              <p className="text-sm text-muted">{t.builder.webhookAfterSave}</p>
            )}
            <p className="text-[12px] text-muted">{t.builder.webhookHint}</p>
          </div>
        )}

        {/* Shartlar (ixtiyoriy) */}
        <div className="mt-6 border-t border-border pt-4">
          {showCond ? (
            <>
              <div className="mb-2 text-sm font-semibold">{t.builder.conditions}</div>
              <RulesEditor
                op={op}
                rules={rules}
                addLabel={t.builder.addCondition}
                onChange={(o, r) => {
                  setOp(o);
                  setRules(r);
                }}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowCond(true);
                if (!rules.length) setRules([{ id: crypto.randomUUID(), kind: "tag", tag_id: "" }]);
              }}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {t.builder.addTriggerCondition}
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button onClick={save}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkWithQr({ url, name, noQr }: { url: string; name?: string; noQr?: boolean }) {
  const t = useT();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (noQr) return;
    const id = setTimeout(() => QRCode.toDataURL(url, { margin: 1, width: 512 }).then(setQr, () => setQr(null)), 200);
    return () => clearTimeout(id);
  }, [url, noQr]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={t.builder.refLink} className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
        <Button
          variant="outline"
          size="icon"
          aria-label={t.builder.copyLink}
          title={t.builder.copyLink}
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast(t.common.copied);
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      {!noQr && qr && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" width={112} height={112} className="rounded-[8px] border border-border" />
          <a href={qr} download={`${name ?? "qr"}.png`} className="flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
            <Download className="size-4" />
            {t.builder.downloadQr}
          </a>
        </div>
      )}
    </div>
  );
}
