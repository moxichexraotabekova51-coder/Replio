"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Database, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/database.types";
import { Card, SectionTitle } from "./section";

type FieldType = Enums<"field_type">;
const TYPES: FieldType[] = ["text", "number", "date", "datetime", "boolean"];

type FieldRow = {
  id: string;
  name: string;
  type: FieldType;
  description: string | null;
  bot_value: Json;
};

/** Qiymatni turiga qarab tekshiradi va JSON'ga aylantiradi */
export function parseFieldValue(type: FieldType, raw: string | boolean): { ok: true; value: Json } | { ok: false } {
  if (type === "boolean") return { ok: true, value: raw === true || raw === "true" };
  const s = String(raw).trim();
  if (s === "") return { ok: true, value: null };
  if (type === "number") {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { ok: true, value: s } : { ok: false };
  if (type === "datetime") return Number.isNaN(Date.parse(s)) ? { ok: false } : { ok: true, value: new Date(s).toISOString() };
  return { ok: true, value: s.slice(0, 2000) };
}

function displayValue(type: FieldType, v: Json): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "boolean") return v ? "true" : "false";
  return String(v);
}

export function FieldsSection({ bot }: { bot: boolean }) {
  const t = useT();
  const app = useApp();
  const { canEdit } = usePermissions();
  const qc = useQueryClient();
  const acc = app.account.id;
  const key = [acc, "fields", bot ? "bot" : "custom"];
  const [editing, setEditing] = useState<FieldRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<FieldRow | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("custom_fields")
        .select("id, name, type, description, bot_value")
        .eq("account_id", acc)
        .eq("is_bot_field", bot)
        .order("name");
      if (error) throw error;
      return data as FieldRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (v: { id?: string; name: string; type: FieldType; description: string | null; bot_value?: Json }) => {
      const supabase = createClient();
      const payload = { name: v.name, type: v.type, description: v.description, ...(bot ? { bot_value: v.bot_value ?? null } : {}) };
      const { error } = v.id
        ? await supabase.from("custom_fields").update(payload).eq("id", v.id)
        : await supabase.from("custom_fields").insert({ ...payload, account_id: acc, is_bot_field: bot });
      if (error) throw new Error(error.code === "23505" ? "Bunday nomli maydon allaqachon mavjud" : t.errors.generic);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [acc, "fields"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prev = qc.getQueryData<FieldRow[]>(key);
      qc.setQueryData<FieldRow[]>(key, (old) => old?.filter((x) => x.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(t.errors.generic);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [acc, "fields"] }),
  });

  const Icon = bot ? Database : Braces;

  return (
    <>
      <SectionTitle
        title={bot ? t.settings.botFields : t.settings.fields}
        description={bot ? t.settings.botFieldsDesc : t.settings.fieldsDesc}
        action={
          canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t.settings.newField}
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : q.data?.length === 0 ? (
        <Card>
          <EmptyState icon={<Icon />} title={t.settings.fieldsEmpty} className="py-8" />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-bg-subtle text-left text-[12px] text-muted">
              <tr className="h-10">
                <th className="px-6 font-medium">{t.settings.fieldName}</th>
                <th className="px-4 font-medium">{t.settings.fieldType}</th>
                <th className="px-4 font-medium">{bot ? t.settings.fieldValue : t.settings.fieldDesc}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {q.data?.map((f) => (
                <tr key={f.id} className="h-14 border-t border-border">
                  <td className="px-6 font-medium">
                    <code className="font-sans">{`{{${f.name}}}`}</code>
                  </td>
                  <td className="px-4 text-muted">{t.settings.fieldTypes[f.type]}</td>
                  <td className="max-w-[280px] truncate px-4 text-muted">{bot ? displayValue(f.type, f.bot_value) : f.description || "—"}</td>
                  <td className="pr-3">
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label="Amallar">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(f)}>
                            <Pencil />
                            {t.common.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeleting(f)}>
                            <Trash2 />
                            {t.common.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <FieldDialog
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        bot={bot}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing === "new" ? null : editing}
        onSubmit={(v) => save.mutateAsync({ id: editing && editing !== "new" ? editing.id : undefined, ...v })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t.common.delete}
        description={deleting ? `{{${deleting.name}}}` : ""}
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

function FieldDialog({
  bot,
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  bot: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: FieldRow | null;
  onSubmit: (v: { name: string; type: FieldType; description: string | null; bot_value?: Json }) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FieldType>(initial?.type ?? "text");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [value, setValue] = useState<string | boolean>(
    initial?.type === "boolean" ? initial.bot_value === true : initial?.bot_value == null ? "" : String(initial.bot_value),
  );
  const [error, setError] = useState<{ name?: string; value?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{initial ? t.common.edit : t.settings.newField}</DialogTitle>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return setError({ name: t.common.required });
            if (!/^[\p{L}\p{N}_]+$/u.test(n)) return setError({ name: "Faqat harf, raqam va _ belgisi" });
            let botValue: Json | undefined;
            if (bot) {
              const parsed = parseFieldValue(type, value);
              if (!parsed.ok) return setError({ value: "Qiymat turiga mos emas" });
              botValue = parsed.value;
            }
            setBusy(true);
            try {
              await onSubmit({ name: n.slice(0, 64), type, description: description.trim() || null, bot_value: botValue });
              onOpenChange(false);
            } catch (err) {
              setError({ form: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="f-name">{t.settings.fieldName}</Label>
            <Input id="f-name" autoFocus maxLength={64} value={name} aria-invalid={!!error.name} placeholder="masalan: telefon" onChange={(e) => { setName(e.target.value); setError({}); }} />
            <FieldError>{error.name}</FieldError>
          </div>
          <div>
            <Label htmlFor="f-type">{t.settings.fieldType}</Label>
            <NativeSelect
              id="f-type"
              value={type}
              onChange={(e) => {
                const nt = e.target.value as FieldType;
                setType(nt);
                setValue(nt === "boolean" ? false : "");
              }}
            >
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t.settings.fieldTypes[x]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {bot ? (
            <div>
              <Label htmlFor="f-value">{t.settings.fieldValue}</Label>
              {type === "boolean" ? (
                <div className="flex h-10 items-center">
                  <Switch id="f-value" checked={value === true} onCheckedChange={(v) => setValue(v)} />
                </div>
              ) : (
                <Input
                  id="f-value"
                  type={type === "number" ? "text" : type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text"}
                  inputMode={type === "number" ? "decimal" : undefined}
                  value={String(value)}
                  aria-invalid={!!error.value}
                  onChange={(e) => { setValue(e.target.value); setError({}); }}
                />
              )}
              <FieldError>{error.value}</FieldError>
            </div>
          ) : (
            <div>
              <Label htmlFor="f-desc">{t.settings.fieldDesc}</Label>
              <Input id="f-desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}
          <FieldError>{error.form}</FieldError>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={busy}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
