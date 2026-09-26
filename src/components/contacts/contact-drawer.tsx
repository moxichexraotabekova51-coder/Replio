"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { parseFieldValue } from "@/components/settings/fields-section";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogTitle, DrawerContent } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useAllFields } from "@/lib/queries/builder";
import { contactKeys, useCreateTag, useSequencesList } from "@/lib/queries/contacts";
import { useMessages, useTagsList } from "@/lib/queries/inbox";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/database.types";
import { formatDate, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

type Detail = {
  id: string;
  tg_user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  language_code: string | null;
  subscribed_at: string;
  last_interaction_at: string | null;
  is_subscribed: boolean;
  contact_tags: { tag_id: string; tags: { id: string; name: string } | null }[];
  contact_field_values: { field_id: string; value: Json }[];
  contact_sequences: { sequence_id: string; current_step: number; sequences: { name: string } | null }[];
};

export function ContactDrawer({ contactId, onClose, extra, compact }: { contactId: string | null; onClose: () => void; extra?: React.ReactNode; compact?: boolean }) {
  return (
    <Dialog open={!!contactId} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent aria-describedby={undefined}>
        {contactId && <ContactProfile id={contactId} onClose={onClose} extra={extra} hideInboxLink={compact} />}
      </DrawerContent>
    </Dialog>
  );
}

/** Kontakt profili: Contacts drawer'ida (variant="drawer") va Inbox'ning o'ng panelida (variant="panel") */
export function ContactProfile({
  id,
  onClose,
  variant = "drawer",
  extra,
  hideInboxLink,
}: {
  id: string;
  onClose?: () => void;
  variant?: "drawer" | "panel";
  extra?: React.ReactNode;
  hideInboxLink?: boolean;
}) {
  const panel = variant === "panel";
  const Title = panel ? "h2" : DialogTitle;
  const t = useT();
  const app = useApp();
  const perms = usePermissions();
  const qc = useQueryClient();
  const key = contactKeys.detail(app.account.id, id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("contacts")
        .select(
          "id, tg_user_id, first_name, last_name, username, avatar_url, language_code, subscribed_at, last_interaction_at, is_subscribed, contact_tags(tag_id, tags(id, name)), contact_field_values(field_id, value), contact_sequences(sequence_id, current_step, sequences(name))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });
  const fields = useAllFields();
  const messages = useMessages(id);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: [app.account.id, "contacts", "list"] });
  };
  const run = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await fn();
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: invalidate,
  });
  const supabase = createClient();

  const c = q.data;
  if (q.isLoading || !c) {
    return (
      <div className="space-y-4 p-6">
        <Title className="sr-only">{t.contacts.profile}</Title>
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "—";
  const customFields = (fields.data ?? []).filter((f) => !f.is_bot_field);

  return (
    <>
      <div className={cn("flex items-center gap-4 border-b border-border py-5", panel ? "px-5" : "px-6 pr-14")}>
        <Avatar src={c.avatar_url} name={name} size={panel ? 44 : 56} silhouette={!c.avatar_url} />
        <div className="min-w-0">
          <Title className={cn("truncate pr-0 font-semibold", panel ? "text-[17px]" : "text-[20px]")}>{name}</Title>
          {c.username && (
            <a href={`https://t.me/${c.username}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:underline">
              @{c.username}
            </a>
          )}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 space-y-6 overflow-y-auto py-5 scrollbar-thin", panel ? "px-5" : "px-6")}>
        {!panel && !hideInboxLink && (
          <Link href={`/app/inbox?c=${c.id}`} className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
            <MessageCircle className="size-4" />
            {t.contacts.openInInbox}
          </Link>
        )}
        {extra}

        <Section title={t.contacts.info}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t.contacts.tgId}</dt>
            <dd className="font-mono text-[13px]">{c.tg_user_id}</dd>
            <dt className="text-muted">{t.contacts.subscribed}</dt>
            <dd>{formatDate(c.subscribed_at, app.account.timezone, true)}</dd>
            <dt className="text-muted">{t.contacts.lastActivity}</dt>
            <dd>{timeAgo(t, c.last_interaction_at)}</dd>
            <dt className="text-muted">{t.contacts.language}</dt>
            <dd>{c.language_code ?? "—"}</dd>
            <dt className="text-muted">{t.contacts.status}</dt>
            <dd className="font-medium">{c.is_subscribed ? t.contacts.subscribedYes : `⚠ ${t.contacts.subscribedNo}`}</dd>
          </dl>
        </Section>

        <Section title={t.contacts.tags}>
          <div className="flex flex-wrap gap-1.5">
            {c.contact_tags
              .filter((x) => x.tags)
              .map((x) => (
                <span key={x.tag_id} className="flex h-7 items-center gap-1 rounded-[6px] bg-bg-muted pl-2 pr-1 text-[13px] font-medium">
                  {x.tags!.name}
                  {perms.canChat && (
                    <button
                      onClick={() => run.mutate(() => supabase.from("contact_tags").delete().eq("contact_id", c.id).eq("tag_id", x.tag_id))}
                      className="flex size-5 items-center justify-center rounded hover:bg-border"
                      aria-label={`${x.tags!.name} tegini olib tashlash`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            {perms.canChat && (
              <TagAdder
                existing={c.contact_tags.map((x) => x.tag_id)}
                onAdd={(tagId) => run.mutate(() => supabase.from("contact_tags").upsert({ contact_id: c.id, tag_id: tagId }, { ignoreDuplicates: true }))}
              />
            )}
          </div>
        </Section>

        <Section title={t.contacts.fieldsTitle}>
          {customFields.length === 0 ? (
            <p className="text-sm text-muted">{t.settings.fieldsEmpty}</p>
          ) : (
            <div className="space-y-2">
              {customFields.map((f) => {
                const cur = c.contact_field_values.find((v) => v.field_id === f.id)?.value ?? null;
                return (
                  <FieldRow
                    key={f.id}
                    name={f.name}
                    type={f.type}
                    value={cur}
                    readOnly={!perms.canChat}
                    onSave={(v) =>
                      run.mutate(() =>
                        v === null
                          ? supabase.from("contact_field_values").delete().eq("contact_id", c.id).eq("field_id", f.id)
                          : supabase.from("contact_field_values").upsert({ contact_id: c.id, field_id: f.id, value: v, updated_at: new Date().toISOString() }),
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title={t.contacts.sequencesTitle}>
          {c.contact_sequences.length === 0 && <p className="text-sm text-muted">{t.contacts.noSequences}</p>}
          <ul className="space-y-1.5">
            {c.contact_sequences.map((s) => (
              <li key={s.sequence_id} className="flex items-center justify-between rounded-[6px] bg-bg-subtle px-3 py-2 text-sm">
                {s.sequences?.name ?? "—"}
                {perms.canEdit && (
                  <button
                    onClick={() => run.mutate(() => supabase.from("contact_sequences").delete().eq("contact_id", c.id).eq("sequence_id", s.sequence_id))}
                    className="flex size-7 items-center justify-center rounded text-muted hover:bg-border hover:text-fg"
                    aria-label="Sequence'dan chiqarish"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {perms.canEdit && (
            <SequenceAdder
              existing={c.contact_sequences.map((s) => s.sequence_id)}
              onAdd={(sid) =>
                run.mutate(() =>
                  supabase.from("contact_sequences").upsert({ contact_id: c.id, sequence_id: sid, current_step: 0, next_run_at: new Date().toISOString() }, { ignoreDuplicates: true }),
                )
              }
            />
          )}
        </Section>

        {!panel && (
        <Section title={t.contacts.historyTitle}>
          {messages.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : messages.data?.length === 0 ? (
            <p className="text-sm text-muted">{t.inbox.noMessages}</p>
          ) : (
            <div className="space-y-1.5">
              {messages.data?.slice(-20).map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "in" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] px-3 py-1.5 text-[13px]",
                      m.direction === "in" ? "border border-border" : m.direction === "out_agent" ? "bg-fg text-bg" : "bg-bg-muted",
                    )}
                  >
                    {m.content?.text ?? m.content?.caption ?? `[${m.type}]`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
        )}

        {perms.canEdit && !panel && (
          <Button variant="outline" className="w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            {t.contacts.deleteContact}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={t.contacts.deleteContact}
        description={fmt(t.contacts.deleteConfirm, { n: 1 })}
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await run.mutateAsync(() => supabase.from("contacts").delete().eq("id", c.id));
          onClose?.();
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function TagAdder({ existing, onAdd }: { existing: string[]; onAdd: (tagId: string) => void }) {
  const t = useT();
  const tags = useTagsList();
  const createTag = useCreateTag();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = (tags.data ?? []).filter((x) => !existing.includes(x.id) && x.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = (tags.data ?? []).some((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-7 items-center gap-1 rounded-[6px] border border-dashed border-border-dashed px-2 text-[13px] font-medium hover:border-fg">
        <Plus className="size-3.5" />
        {t.contacts.bulkAddTag}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.contacts.newTagName}
          className="mb-1 h-9 w-full rounded-[6px] border border-border px-2.5 text-sm outline-none focus:border-fg"
        />
        <div className="max-h-56 overflow-y-auto">
          {list.map((x) => (
            <button
              key={x.id}
              className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[13px] hover:bg-bg-muted"
              onClick={() => {
                onAdd(x.id);
                setOpen(false);
                setQ("");
              }}
            >
              {x.name}
            </button>
          ))}
          {q.trim() && !exact && (
            <button
              className="flex h-8 w-full items-center gap-1.5 rounded-[6px] px-2.5 text-left text-[13px] font-medium hover:bg-bg-muted"
              onClick={async () => {
                const tag = await createTag.mutateAsync(q.trim().slice(0, 64));
                onAdd(tag.id);
                setOpen(false);
                setQ("");
              }}
            >
              <Plus className="size-3.5" />
              {t.contacts.createTag}: “{q.trim()}”
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SequenceAdder({ existing, onAdd }: { existing: string[]; onAdd: (id: string) => void }) {
  const t = useT();
  const seqs = useSequencesList();
  const list = (seqs.data ?? []).filter((s) => !existing.includes(s.id));
  if (!list.length) return null;
  return (
    <NativeSelect
      className="mt-2 h-9"
      value=""
      aria-label={t.contacts.bulkSequence}
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
      }}
    >
      <option value="">+ {t.contacts.bulkSequence}</option>
      {list.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function FieldRow({
  name,
  type,
  value,
  readOnly,
  onSave,
}: {
  name: string;
  type: Enums<"field_type">;
  value: Json;
  readOnly: boolean;
  onSave: (v: Json) => void;
}) {
  const initial = value === null || value === undefined ? "" : type === "boolean" ? String(value) : String(value);
  const [v, setV] = useState(initial);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (v === initial) return;
    if (v.trim() === "") return onSave(null);
    const parsed = parseFieldValue(type, type === "boolean" ? v === "true" : v);
    if (!parsed.ok) return setBad(true);
    setBad(false);
    onSave(parsed.value);
  };
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm">
      <span className="truncate text-muted">{name}</span>
      {type === "boolean" ? (
        <NativeSelect className="h-9" disabled={readOnly} value={v} onChange={(e) => { setV(e.target.value); onSave(e.target.value === "" ? null : e.target.value === "true"); }}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </NativeSelect>
      ) : (
        <input
          disabled={readOnly}
          type={type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text"}
          inputMode={type === "number" ? "decimal" : undefined}
          value={type === "datetime" && v ? v.slice(0, 16) : v}
          onChange={(e) => {
            setV(e.target.value);
            setBad(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-invalid={bad || undefined}
          className={cn("h-9 rounded-[6px] border border-border px-2.5 outline-none focus:border-fg disabled:bg-bg-muted", bad && "border-2 border-fg")}
        />
      )}
    </label>
  );
}
