"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, ListOrdered, Plus, Tag, Tags, Trash2, UserRound, Variable, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { parseFieldValue } from "@/components/settings/fields-section";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useAllFields } from "@/lib/queries/builder";
import {
  emptyFilter,
  useContactsBulk,
  useContactsCount,
  useContactsList,
  useCreateTag,
  useSequencesList,
  type BulkAction,
  type ContactFilter,
} from "@/lib/queries/contacts";
import { useTagsList } from "@/lib/queries/inbox";
import { formatDate, timeAgo } from "@/lib/time";
import { cn, formatNumber } from "@/lib/utils";
import { ContactDrawer } from "./contact-drawer";
import { FilterBar } from "./filter-builder";

const ROW_H = 60;
const COLS = "grid-cols-[28px_minmax(200px,2fr)_minmax(120px,1fr)_120px_140px_minmax(140px,1.5fr)] max-md:grid-cols-[28px_1fr_auto]";

export function ContactsPage() {
  const t = useT();
  const app = useApp();
  const perms = usePermissions();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContactFilter>(emptyFilter);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const q = useContactsList(filter, search);
  const count = useContactsCount(filter, search);
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  const total = count.data ?? null;

  // Filtr/qidiruv o'zgarsa tanlov tozalanadi
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [filter, search]);

  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (lastIndex >= rows.length - 10 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filtering = filter.rules.length > 0 || search.trim() !== "";
  const empty = !q.isLoading && rows.length === 0;
  const loadedAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selCount = allMatching ? (total ?? 0) : selected.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.contacts.title} />
      <div className="flex min-h-0 flex-1 flex-col px-4 py-6 md:px-11">
        {empty && !filtering ? (
          <EmptyState
            icon={<UserRound />}
            title={t.contacts.emptyTitle}
            description={t.contacts.emptyDesc}
            action={
              !app.bot && app.account.role === "admin" ? (
                <Link href="/app/settings/telegram" className={buttonVariants()}>
                  {t.contacts.emptyCta}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder={t.contacts.searchPlaceholder} className="w-full max-w-md" inputClassName="h-12" />
              <span className="flex items-center gap-2 text-[13px] text-muted">
                {total !== null && fmt(t.contacts.total, { n: formatNumber(total) })}
                {(q.isFetching || count.isFetching) && <Spinner className="size-3.5" />}
              </span>
            </div>
            <div className="mb-4">
              <FilterBar filter={filter} onChange={setFilter} />
            </div>

            {q.isError && <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />}

            {perms.canChat && loadedAllSelected && total !== null && total > rows.length && (
              <div className="mb-3 rounded-[8px] bg-bg-muted px-4 py-2.5 text-[13px]">
                {allMatching ? (
                  <span className="font-medium">{fmt(t.contacts.allMatchingSelected, { n: formatNumber(total) })}</span>
                ) : (
                  <button className="font-medium underline underline-offset-4" onClick={() => setAllMatching(true)}>
                    {fmt(t.contacts.selectAllMatching, { n: formatNumber(total) })}
                  </button>
                )}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-border bg-bg shadow-sm">
              <div className={cn("grid h-11 shrink-0 items-center gap-4 border-b border-border bg-bg-subtle px-4 text-[12px] font-medium text-muted", COLS)}>
                <span className="flex">
                  {perms.canChat && (
                    <Checkbox
                      checked={loadedAllSelected ? true : selected.size > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => {
                        setAllMatching(false);
                        setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set());
                      }}
                      aria-label="Hammasini tanlash"
                    />
                  )}
                </span>
                <span>{t.contacts.name}</span>
                <span className="max-md:hidden">{t.contacts.username}</span>
                <span className="max-md:hidden">{t.contacts.subscribed}</span>
                <span>{t.contacts.lastActivity}</span>
                <span className="max-md:hidden">{t.contacts.tags}</span>
              </div>
              <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {q.isLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted">{t.contacts.notFound}</p>
                ) : (
                  <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                    {items.map((vi) => {
                      const c = rows[vi.index];
                      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "—";
                      const isSel = allMatching || selected.has(c.id);
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenId(c.id)}
                          onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)}
                          className={cn("absolute inset-x-0 grid cursor-pointer items-center gap-4 border-b border-border px-4 text-sm hover:bg-bg-subtle", COLS, isSel && "bg-bg-muted hover:bg-bg-muted")}
                          style={{ height: ROW_H, transform: `translateY(${vi.start}px)` }}
                        >
                          <span className="flex" onClick={(e) => e.stopPropagation()}>
                            {perms.canChat && (
                              <Checkbox
                                checked={isSel}
                                aria-label={name}
                                onCheckedChange={(v) => {
                                  if (allMatching) {
                                    setAllMatching(false);
                                    const n = new Set(rows.map((r) => r.id));
                                    n.delete(c.id);
                                    return setSelected(n);
                                  }
                                  const n = new Set(selected);
                                  if (v === true) n.add(c.id);
                                  else n.delete(c.id);
                                  setSelected(n);
                                }}
                              />
                            )}
                          </span>
                          <span className="flex min-w-0 items-center gap-3">
                            <Avatar src={c.avatar_url} name={name} size={32} silhouette={!c.avatar_url} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{name}</span>
                              {!c.is_subscribed && <span className="block text-[12px] text-muted">{t.contacts.unsubscribed}</span>}
                            </span>
                          </span>
                          <span className="truncate text-muted max-md:hidden">{c.username ? `@${c.username}` : "—"}</span>
                          <span className="text-muted max-md:hidden">{formatDate(c.subscribed_at, app.account.timezone)}</span>
                          <span className="text-muted">{timeAgo(t, c.last_interaction_at)}</span>
                          <span className="flex min-w-0 gap-1 overflow-hidden max-md:hidden">
                            {c.tags.slice(0, 3).map((tag) => (
                              <span key={tag.id} className="truncate rounded-[4px] bg-bg-muted px-1.5 py-0.5 text-[12px]">
                                {tag.name}
                              </span>
                            ))}
                            {c.tags.length > 3 && <span className="text-[12px] text-muted">+{c.tags.length - 3}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {perms.canChat && selCount > 0 && (
        <BulkBar
          count={selCount}
          ids={allMatching ? null : [...selected]}
          filter={filter}
          search={search}
          onDone={() => {
            setSelected(new Set());
            setAllMatching(false);
          }}
        />
      )}
      <ContactDrawer contactId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function BulkBar({
  count,
  ids,
  filter,
  search,
  onDone,
}: {
  count: number;
  ids: string[] | null;
  filter: ContactFilter;
  search: string;
  onDone: () => void;
}) {
  const t = useT();
  const perms = usePermissions();
  const bulk = useContactsBulk();
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function run(action: BulkAction, arg?: Record<string, unknown>) {
    const n = await bulk.mutateAsync({ ids, filter, search, action, arg });
    toast(fmt(t.contacts.bulkDone, { n: formatNumber(n) }));
    onDone();
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch("/api/contacts/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filter, search, ids }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replio-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t.errors.generic);
    } finally {
      setExporting(false);
    }
  }

  const btn = "flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium hover:bg-white/10 disabled:opacity-40";
  return (
    <div role="toolbar" aria-label="Ommaviy amallar" className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-[12px] bg-fg px-3 py-2 text-bg shadow-pop animate-up md:bottom-6">
      <span className="shrink-0 px-2 text-[13px] font-semibold">{fmt(t.common.selected, { n: formatNumber(count) })}</span>
      <span className="mx-1 h-5 w-px shrink-0 bg-white/20" />
      <TagAction label={t.contacts.bulkAddTag} icon={<Tag className="size-4" />} onPick={(id) => run("add_tag", { tag_id: id })} allowCreate className={btn} />
      <TagAction label={t.contacts.bulkRemoveTag} icon={<Tags className="size-4" />} onPick={(id) => run("remove_tag", { tag_id: id })} className={btn} />
      <FieldAction className={btn} onApply={(fieldId, value) => run(value === null ? "clear_field" : "set_field", { field_id: fieldId, value })} />
      {perms.canEdit && <SequenceAction className={btn} onPick={(id) => run("subscribe_sequence", { sequence_id: id })} />}
      <button className={btn} onClick={exportCsv} disabled={exporting}>
        {exporting ? <Spinner className="size-4" /> : <Download className="size-4" />}
        <span className="max-sm:hidden">{t.contacts.bulkExport}</span>
      </button>
      {perms.canEdit && (
        <button className={btn} onClick={() => setConfirm(true)}>
          <Trash2 className="size-4" />
          <span className="max-sm:hidden">{t.contacts.bulkDelete}</span>
        </button>
      )}
      <span className="mx-1 h-5 w-px shrink-0 bg-white/20" />
      <button className="flex size-9 shrink-0 items-center justify-center rounded-[6px] hover:bg-white/10" onClick={onDone} aria-label={t.common.clearSelection}>
        <X className="size-4" />
      </button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={t.contacts.bulkDelete}
        description={fmt(t.contacts.deleteConfirm, { n: formatNumber(count) })}
        confirmLabel={t.common.delete}
        onConfirm={() => run("delete")}
      />
    </div>
  );
}

function TagAction({ label, icon, onPick, allowCreate, className }: { label: string; icon: React.ReactNode; onPick: (id: string) => void; allowCreate?: boolean; className: string }) {
  const t = useT();
  const tags = useTagsList();
  const create = useCreateTag();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = (tags.data ?? []).filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = (tags.data ?? []).some((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={className}>
        {icon}
        <span className="max-sm:hidden">{label}</span>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.common.search} className="mb-1 h-9 w-full rounded-[6px] border border-border px-2.5 text-sm outline-none focus:border-fg" />
        <div className="max-h-56 overflow-y-auto">
          {list.map((x) => (
            <button key={x.id} className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[13px] hover:bg-bg-muted" onClick={() => { setOpen(false); onPick(x.id); }}>
              {x.name}
            </button>
          ))}
          {allowCreate && q.trim() && !exact && (
            <button
              className="flex h-8 w-full items-center gap-1.5 rounded-[6px] px-2.5 text-left text-[13px] font-medium hover:bg-bg-muted"
              onClick={async () => {
                const tag = await create.mutateAsync(q.trim().slice(0, 64));
                setOpen(false);
                onPick(tag.id);
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

function FieldAction({ className, onApply }: { className: string; onApply: (fieldId: string, value: unknown) => void }) {
  const t = useT();
  const fields = useAllFields();
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState("");
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const list = (fields.data ?? []).filter((f) => !f.is_bot_field);
  const field = list.find((f) => f.id === fieldId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={className}>
        <Variable className="size-4" />
        <span className="max-sm:hidden">{t.contacts.bulkSetField}</span>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 space-y-3">
        <NativeSelect value={fieldId} onChange={(e) => { setFieldId(e.target.value); setValue(""); setBad(false); }} aria-label={t.settings.fieldName}>
          <option value="">—</option>
          {list.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </NativeSelect>
        {field && (
          <div>
            <Label htmlFor="bulk-val">{t.settings.fieldValue}</Label>
            {field.type === "boolean" ? (
              <NativeSelect id="bulk-val" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">—</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </NativeSelect>
            ) : (
              <Input id="bulk-val" type={field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={value} aria-invalid={bad} onChange={(e) => { setValue(e.target.value); setBad(false); }} />
            )}
          </div>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={!field}
          onClick={() => {
            if (!field) return;
            if (!value.trim()) {
              setOpen(false);
              return onApply(field.id, null);
            }
            const parsed = parseFieldValue(field.type, field.type === "boolean" ? value === "true" : value);
            if (!parsed.ok) return setBad(true);
            setOpen(false);
            onApply(field.id, parsed.value);
          }}
        >
          {t.contacts.apply}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function SequenceAction({ className, onPick }: { className: string; onPick: (id: string) => void }) {
  const t = useT();
  const seqs = useSequencesList();
  const [open, setOpen] = useState(false);
  if (!seqs.data?.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={className}>
        <ListOrdered className="size-4" />
        <span className="max-sm:hidden">{t.contacts.bulkSequence}</span>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-60 p-1">
        {seqs.data.map((s) => (
          <button key={s.id} className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[13px] hover:bg-bg-muted" onClick={() => { setOpen(false); onPick(s.id); }}>
            {s.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
