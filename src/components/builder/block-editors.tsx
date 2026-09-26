"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountId } from "@/components/providers/app-provider";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { isHttpUrl } from "@/lib/flow/compile";
import { uid, type InputBlock, type MediaBlock, type MenuItem, type RequestBlock } from "@/lib/flow/draft";
import { useT } from "@/lib/i18n/provider";
import { useAllFields } from "@/lib/queries/builder";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ACCEPT: Record<MediaBlock["type"], string> = {
  image: "image/*",
  gif: "image/gif,video/mp4",
  video: "video/*",
  audio: "audio/*",
  file: "*/*",
};
const MAX_BYTES = 50 * 1024 * 1024;

export function MediaBlockEditor({ block, onChange, invalid }: { block: MediaBlock; onChange: (b: MediaBlock) => void; invalid?: boolean }) {
  const t = useT();
  const acc = useAccountId();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return void toast.error(t.builder.fileTooBig);
    setBusy(true);
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const path = `${acc}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type || undefined, upsert: false });
    setBusy(false);
    if (error) return void toast.error(t.errors.generic);
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    onChange({ ...block, url: data.publicUrl, name: file.name });
  }

  return (
    <div className={cn("space-y-3 rounded-[12px] border border-border bg-bg p-3", invalid && "border-2 border-fg")}>
      {block.url && (block.type === "image" || block.type === "gif") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt="" className="max-h-48 w-full rounded-[8px] object-cover" />
      ) : block.url ? (
        <div className="truncate rounded-[8px] bg-bg-muted px-3 py-2 text-[13px]">📎 {block.name ?? block.url}</div>
      ) : null}
      <input ref={ref} type="file" accept={ACCEPT[block.type]} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid={`upload-${block.id}`} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg disabled:opacity-60"
      >
        {busy ? <Spinner /> : <Upload className="size-4" />}
        {busy ? t.builder.uploading : t.builder.uploadFile}
      </button>
      <Input
        placeholder={`${t.builder.orUrl}: https://…`}
        value={block.url}
        aria-invalid={!!block.url && !isHttpUrl(block.url)}
        onChange={(e) => onChange({ ...block, url: e.target.value, name: undefined })}
      />
      {block.type !== "audio" && (
        <Input placeholder={t.builder.caption} value={block.caption ?? ""} maxLength={1024} onChange={(e) => onChange({ ...block, caption: e.target.value })} />
      )}
    </div>
  );
}

function FieldSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id: string }) {
  const t = useT();
  const fields = useAllFields();
  return (
    <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t.builder.noField}</option>
      {fields.data
        ?.filter((f) => !f.is_bot_field)
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
    </NativeSelect>
  );
}

export function InputBlockEditor({ block, onChange, invalid }: { block: InputBlock; onChange: (b: InputBlock) => void; invalid?: boolean }) {
  const t = useT();
  return (
    <div className={cn("space-y-3 rounded-[12px] border border-fg bg-bg p-3", invalid && "border-2")}>
      <div className="text-[12px] font-semibold uppercase text-muted">{t.builder.blockInput}</div>
      <div>
        <Label htmlFor={`q-${block.id}`}>{t.builder.inputQuestion}</Label>
        <Textarea id={`q-${block.id}`} rows={2} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`k-${block.id}`}>{t.builder.inputKind}</Label>
          <NativeSelect id={`k-${block.id}`} value={block.kind} onChange={(e) => onChange({ ...block, kind: e.target.value as InputBlock["kind"] })}>
            {(Object.keys(t.builder.inputKinds) as InputBlock["kind"][]).map((k) => (
              <option key={k} value={k}>
                {t.builder.inputKinds[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={`f-${block.id}`}>{t.builder.saveTo}</Label>
          <FieldSelect id={`f-${block.id}`} value={block.field_id} onChange={(v) => onChange({ ...block, field_id: v })} />
        </div>
      </div>
      {block.kind === "choice" && (
        <div>
          <Label htmlFor={`c-${block.id}`}>{t.builder.inputChoices}</Label>
          <Textarea id={`c-${block.id}`} rows={3} value={block.choices.join("\n")} onChange={(e) => onChange({ ...block, choices: e.target.value.split("\n").slice(0, 10) })} />
        </div>
      )}
      {block.kind !== "text" && block.kind !== "choice" && (
        <div>
          <Label htmlFor={`e-${block.id}`}>{t.builder.errorText}</Label>
          <Input id={`e-${block.id}`} value={block.error} onChange={(e) => onChange({ ...block, error: e.target.value })} />
        </div>
      )}
      <label className="flex items-center justify-between gap-3 text-sm">
        {t.builder.skipButton}
        <Switch checked={block.skip !== null} onCheckedChange={(v) => onChange({ ...block, skip: v ? "O'tkazib yuborish" : null })} />
      </label>
      {block.skip !== null && <Input value={block.skip} maxLength={40} onChange={(e) => onChange({ ...block, skip: e.target.value })} aria-label={t.builder.skipButton} />}
      <div>
        <Label htmlFor={`t-${block.id}`}>{t.builder.timeout}</Label>
        <Input
          id={`t-${block.id}`}
          type="number"
          min={0}
          max={10080}
          value={block.timeout_min ?? ""}
          placeholder="—"
          onChange={(e) => onChange({ ...block, timeout_min: e.target.value ? Math.max(1, Math.min(10080, Number(e.target.value))) : null })}
        />
        <p className="mt-1 text-[12px] text-muted">{t.builder.timeoutHint}</p>
      </div>
    </div>
  );
}

export function RequestBlockEditor({ block, onChange, invalid }: { block: RequestBlock; onChange: (b: RequestBlock) => void; invalid?: boolean }) {
  const t = useT();
  return (
    <div className={cn("space-y-3 rounded-[12px] border border-border bg-bg p-3", invalid && "border-2 border-fg")}>
      <div className="text-[12px] font-semibold uppercase text-muted">{block.kind === "contact" ? t.builder.blockContact : t.builder.blockLocation}</div>
      <Textarea rows={2} placeholder={t.builder.textPlaceholder} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} aria-label={t.builder.inputQuestion} />
      <div>
        <Label htmlFor={`rb-${block.id}`}>{t.builder.requestButton}</Label>
        <Input id={`rb-${block.id}`} value={block.button} maxLength={40} onChange={(e) => onChange({ ...block, button: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`rf-${block.id}`}>{t.builder.saveTo}</Label>
        <FieldSelect id={`rf-${block.id}`} value={block.field_id} onChange={(v) => onChange({ ...block, field_id: v })} />
      </div>
    </div>
  );
}

export function MenuEditor({ items, onChange }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-[12px] border border-border p-3">
      <div className="text-[12px] font-semibold uppercase text-muted">{t.builder.telegramMenu}</div>
      {items.map((m, i) => (
        <div key={m.id} className="flex gap-2">
          <Input value={m.title} maxLength={40} placeholder={t.builder.menuItem} aria-label={t.builder.menuItem} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="flex size-10 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.common.delete}>
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {items.length < 8 && (
        <button type="button" onClick={() => onChange([...items, { id: uid("mm"), title: "" }])} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-dashed text-[13px] font-medium hover:border-fg">
          <Plus className="size-3.5" />
          {t.builder.addMenuItem}
        </button>
      )}
    </div>
  );
}
