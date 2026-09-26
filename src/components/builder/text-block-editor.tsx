"use client";

import { Bold, Braces, Italic, Link2, Plus, Smile, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isHttpUrl } from "@/lib/flow/compile";
import { MAX_BUTTONS, TEXT_LIMIT, uid, type DraftButton, type TextBlock } from "@/lib/flow/draft";
import { useT } from "@/lib/i18n/provider";
import { useFlows } from "@/lib/queries/automation";
import { useAllFields } from "@/lib/queries/builder";
import { cn } from "@/lib/utils";

const EMOJIS =
  "😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 😎 🤩 🤔 😅 😂 🙏 👍 👎 👋 👏 🙌 💪 🤝 👉 👇 ☝️ ✅ ❌ ⚠️ ❗ ❓ 💯 🔥 ⭐ ✨ 🎉 🎁 🎯 💡 📌 📍 📞 📱 💬 📩 📦 🛒 💳 💰 🏷️ ⏰ 📅 🚀 ❤️ 🧡 💛 💚 💙 🖤".split(" ");

const SYSTEM_VARS = ["first_name", "last_name", "full_name", "username"];

export type ButtonKind = DraftButton["kind"];

export function TextBlockEditor({
  block,
  onChange,
  invalid,
  buttonKinds = ["url"],
}: {
  block: TextBlock;
  onChange: (b: TextBlock) => void;
  invalid?: boolean;
  /** Basic builder'da faqat URL; Flow builder'da — keyingi step va boshqa avtomatlashtirish ham */
  buttonKinds?: ButtonKind[];
}) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [popover, setPopover] = useState<"link" | "emoji" | "vars" | null>(null);
  const left = TEXT_LIMIT - block.text.length;

  /** Kursor joyiga matn qo'yish (yoki tanlangan matnni o'rash) */
  function insert(before: string, after = "") {
    const el = ref.current;
    const start = el?.selectionStart ?? block.text.length;
    const end = el?.selectionEnd ?? block.text.length;
    const sel = block.text.slice(start, end);
    const next = block.text.slice(0, start) + before + sel + after + block.text.slice(end);
    onChange({ ...block, text: next.slice(0, TEXT_LIMIT) });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + before.length + sel.length + (sel ? after.length : 0);
      el?.setSelectionRange(pos, pos);
    });
  }

  const empty = !block.text.trim();

  return (
    <div className="space-y-2">
      <div className="relative">
        {empty && (
          <span className="absolute -left-6 top-3 text-[15px]" title={t.builder.issues.empty_text} aria-label={t.builder.issues.empty_text}>
            ⚠
          </span>
        )}
        <textarea
          ref={ref}
          value={block.text}
          maxLength={TEXT_LIMIT}
          placeholder={t.builder.textPlaceholder}
          aria-label={t.builder.blockText}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          rows={Math.min(12, Math.max(3, block.text.split("\n").length + 1))}
          className={cn(
            "w-full resize-none rounded-[12px] border border-transparent bg-bg-muted px-4 py-3 text-sm outline-none focus:border-fg",
            invalid && "border-2 border-fg",
          )}
        />
        {(focused || popover) && (
          <div className="mt-2 flex w-fit items-center gap-0.5 rounded-full bg-fg px-2 py-1 text-bg shadow-pop">
            <ToolbarButton label={t.builder.bold} onClick={() => insert("<b>", "</b>")}>
              <Bold className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton label={t.builder.italic} onClick={() => insert("<i>", "</i>")}>
              <Italic className="size-3.5" />
            </ToolbarButton>
            <LinkPopover open={popover === "link"} onOpenChange={(v) => setPopover(v ? "link" : null)} onInsert={(text, url) => insert(`<a href="${url}">${text}</a>`)} />
            <Popover open={popover === "emoji"} onOpenChange={(v) => setPopover(v ? "emoji" : null)}>
              <PopoverTrigger asChild>
                <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-white/15" aria-label={t.builder.emoji} onMouseDown={(e) => e.preventDefault()}>
                  <Smile className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="grid grid-cols-10 gap-0.5">
                  {EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="flex size-6 items-center justify-center rounded hover:bg-bg-muted"
                      onClick={() => {
                        insert(em);
                        setPopover(null);
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <VarsPopover open={popover === "vars"} onOpenChange={(v) => setPopover(v ? "vars" : null)} onInsert={(name) => insert(`{{${name}}}`)} />
            <span className={cn("px-2 text-[12px] tabular-nums", left < 100 && "font-bold")}>{left}</span>
          </div>
        )}
      </div>

      {block.buttons.map((btn, i) => (
        <ButtonRow
          key={btn.id}
          button={btn}
          onChange={(b) => onChange({ ...block, buttons: block.buttons.map((x, j) => (j === i ? b : x)) })}
          onDelete={() => onChange({ ...block, buttons: block.buttons.filter((_, j) => j !== i) })}
        />
      ))}
      {block.buttons.length < MAX_BUTTONS && (
        <AddButtonPopover kinds={buttonKinds} onAdd={(b) => onChange({ ...block, buttons: [...block.buttons, b] })} />
      )}
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
    >
      {children}
    </button>
  );
}

function LinkPopover({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange: (v: boolean) => void; onInsert: (text: string, url: string) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("https://");
  const [error, setError] = useState<string>();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-white/15" aria-label={t.builder.link} onMouseDown={(e) => e.preventDefault()}>
          <Link2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3">
        <div>
          <Label htmlFor="lk-text">{t.builder.linkText}</Label>
          <Input id="lk-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="lk-url">{t.builder.linkUrl}</Label>
          <Input id="lk-url" value={url} aria-invalid={!!error} onChange={(e) => { setUrl(e.target.value); setError(undefined); }} />
          <FieldError>{error}</FieldError>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            if (!isHttpUrl(url)) return setError(t.builder.issues.bad_url);
            onInsert((text.trim() || url).replace(/[<>]/g, ""), url.replace(/"/g, "%22"));
            setText("");
            setUrl("https://");
            onOpenChange(false);
          }}
        >
          {t.builder.insert}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function VarsPopover({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange: (v: boolean) => void; onInsert: (name: string) => void }) {
  const t = useT();
  const fields = useAllFields();
  const groups: [string, string[]][] = [
    [t.builder.systemFields, SYSTEM_VARS],
    [t.builder.customFields, (fields.data ?? []).filter((f) => !f.is_bot_field).map((f) => f.name)],
    [t.builder.botFields, (fields.data ?? []).filter((f) => f.is_bot_field).map((f) => f.name)],
  ];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-white/15" aria-label={t.builder.variables} onMouseDown={(e) => e.preventDefault()}>
          <Braces className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-64 overflow-y-auto p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {groups
          .filter(([, list]) => list.length)
          .map(([title, list]) => (
            <div key={title} className="py-1">
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase text-muted">{title}</div>
              {list.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[13px] hover:bg-bg-muted"
                  onClick={() => {
                    onInsert(name);
                    onOpenChange(false);
                  }}
                >
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
          ))}
      </PopoverContent>
    </Popover>
  );
}

function ButtonRow({ button, onChange, onDelete }: { button: DraftButton; onChange: (b: DraftButton) => void; onDelete: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const bad = !button.title.trim() || (button.kind === "url" && !isHttpUrl(button.url)) || (button.kind === "flow" && !button.flow_id);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex h-11 items-center rounded-[12px] border border-border bg-bg text-sm", bad && "border-2 border-fg")}>
        <PopoverTrigger asChild>
          <button type="button" className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 px-3 font-medium">
            {bad && <span aria-hidden>⚠</span>}
            <span className="truncate">{button.title || t.builder.buttonTitle}</span>
          </button>
        </PopoverTrigger>
        <button type="button" onClick={onDelete} className="mr-1 flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.builder.deleteButton}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <PopoverContent className="space-y-3">
        <ButtonFields button={button} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function ButtonFields({ button, onChange }: { button: DraftButton; onChange: (b: DraftButton) => void }) {
  const t = useT();
  const flows = useFlows();
  return (
    <>
      <div>
        <Label htmlFor={`bt-${button.id}`}>{t.builder.buttonTitle}</Label>
        <Input id={`bt-${button.id}`} maxLength={64} value={button.title} onChange={(e) => onChange({ ...button, title: e.target.value })} />
      </div>
      {button.kind === "url" && (
        <div>
          <Label htmlFor={`bu-${button.id}`}>{t.builder.buttonUrl}</Label>
          <Input id={`bu-${button.id}`} value={button.url} placeholder="https://" onChange={(e) => onChange({ ...button, url: e.target.value })} />
          {button.url && !isHttpUrl(button.url) && <FieldError>{t.builder.issues.bad_url}</FieldError>}
        </div>
      )}
      {button.kind === "flow" && (
        <div>
          <Label htmlFor={`bf-${button.id}`}>{t.builder.selectFlow}</Label>
          <NativeSelect id={`bf-${button.id}`} value={button.flow_id ?? ""} onChange={(e) => onChange({ ...button, flow_id: e.target.value || null })}>
            <option value="">—</option>
            {flows.data?.filter((f) => f.status === "live").map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </>
  );
}

function blankButton(kind: ButtonKind): DraftButton {
  const id = uid("b");
  if (kind === "url") return { id, title: "", kind, url: "https://" };
  if (kind === "flow") return { id, title: "", kind, flow_id: null };
  return { id, title: "", kind };
}

function AddButtonPopover({ onAdd, kinds }: { onAdd: (b: DraftButton) => void; kinds: ButtonKind[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftButton>(blankButton(kinds[0]));
  const labels: Record<ButtonKind, string> = { url: t.builder.buttonTypeUrl, step: t.builder.buttonTypeStep, flow: t.builder.buttonTypeFlow };
  const valid = !!draft.title.trim() && (draft.kind !== "url" || isHttpUrl(draft.url)) && (draft.kind !== "flow" || !!draft.flow_id);
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setDraft(blankButton(kinds[0]));
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg hover:bg-bg-subtle">
          <Plus className="size-4" />
          {t.builder.addButton}
        </button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3">
        <div>
          <Label htmlFor="btn-kind">{t.builder.buttonType}</Label>
          {kinds.length > 1 ? (
            <NativeSelect id="btn-kind" value={draft.kind} onChange={(e) => setDraft({ ...blankButton(e.target.value as ButtonKind), title: draft.title })}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <div className="flex h-9 items-center rounded-[6px] border border-fg bg-bg-muted px-3 text-[13px] font-medium">{labels[kinds[0]]}</div>
          )}
        </div>
        <ButtonFields button={draft} onChange={setDraft} />
        <Button
          size="sm"
          className="w-full"
          disabled={!valid}
          onClick={() => {
            onAdd({ ...draft, title: draft.title.trim() });
            setOpen(false);
          }}
        >
          {t.builder.insert}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
