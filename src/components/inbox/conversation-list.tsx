"use client";

import { ArrowUpDown, CheckCheck, ChevronDown, MessageCircle, Plus, Tag, X, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import {
  displayName,
  useLabels,
  useMembers,
  useTagsList,
  useToggleLabel,
  useUpdateConversations,
  type Conversation,
  type InboxFilters,
} from "@/lib/queries/inbox";
import { timeShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LabelIcon } from "./label-icon";

const chip =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-border bg-bg px-2.5 text-[13px] font-medium outline-none hover:border-border-strong data-[state=open]:border-fg";

export function ConversationList({
  rows,
  loading,
  hasMore,
  onLoadMore,
  filters,
  setFilters,
  selectedId,
  onOpen,
  checked,
  setChecked,
}: {
  rows: Conversation[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  filters: InboxFilters;
  setFilters: (f: InboxFilters) => void;
  selectedId: string | null;
  onOpen: (c: Conversation) => void;
  checked: Set<string>;
  setChecked: (s: Set<string>) => void;
}) {
  const t = useT();
  const perms = usePermissions();
  const labels = useLabels();
  const update = useUpdateConversations();
  const toggleLabel = useToggleLabel();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onLoadMore(), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore]);

  const all = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const some = rows.some((r) => checked.has(r.id));
  const ids = [...checked];
  const statusLabel = filters.status === "open" ? t.inbox.openChats : filters.status === "closed" ? t.inbox.closedChats : t.inbox.allStatuses;
  const activeFilterCount = [filters.tagId, filters.assignee, filters.labelId, filters.activity !== "any" ? 1 : null].filter(Boolean).length;

  return (
    <section className="flex h-full min-w-0 flex-col border-r border-border bg-bg md:w-[430px] md:shrink-0">
      {/* Filtrlar qatori */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {perms.canChat && (
          <Checkbox
            checked={all ? true : some ? "indeterminate" : false}
            onCheckedChange={(v) => setChecked(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
            aria-label="Hammasini tanlash"
            className="mr-1"
          />
        )}
        {checked.size > 0 ? (
          <>
            <span className="text-[13px] font-semibold">{fmt(t.common.selected, { n: checked.size })}</span>
            <button className={chip} onClick={() => update.mutate({ ids, patch: { live_chat_status: "closed" } }, { onSuccess: () => setChecked(new Set()) })}>
              <XCircle className="size-4" />
              {t.inbox.bulkClose}
            </button>
            <button className={chip} onClick={() => update.mutate({ ids, patch: { is_unread: false } }, { onSuccess: () => setChecked(new Set()) })}>
              <CheckCheck className="size-4" />
              {t.inbox.bulkRead}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <Tag className="size-4" />
                {t.inbox.bulkLabel}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {labels.data?.map((l) => (
                  <DropdownMenuItem
                    key={l.id}
                    onSelect={() => toggleLabel.mutate({ ids, labelId: l.id, on: true }, { onSuccess: () => setChecked(new Set()) })}
                  >
                    <LabelIcon icon={l.icon} />
                    {l.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button className="ml-auto flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted" onClick={() => setChecked(new Set())} aria-label={t.common.clearSelection}>
              <X className="size-4" />
            </button>
          </>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <MessageCircle className="size-4" />
                {statusLabel}
                <ChevronDown className="size-3.5 text-muted" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v as InboxFilters["status"] })}>
                  <DropdownMenuRadioItem value="open">{t.inbox.openChats}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="closed">{t.inbox.closedChats}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="all">{t.inbox.allStatuses}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              className={cn(chip, filters.unread && "border-fg bg-fg text-bg hover:border-fg")}
              aria-pressed={filters.unread}
              onClick={() => setFilters({ ...filters, unread: !filters.unread })}
            >
              {t.inbox.unread}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <ArrowUpDown className="size-4" />
                {filters.sort === "newest" ? t.inbox.sortNewest : t.inbox.sortOldest}
                <ChevronDown className="size-3.5 text-muted" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={filters.sort} onValueChange={(v) => setFilters({ ...filters, sort: v as InboxFilters["sort"] })}>
                  <DropdownMenuRadioItem value="newest">{t.inbox.newest}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">{t.inbox.oldest}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                {filters.channel === "all" ? t.inbox.allChannels : t.inbox.telegram}
                <ChevronDown className="size-3.5 text-muted" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={filters.channel} onValueChange={(v) => setFilters({ ...filters, channel: v as InboxFilters["channel"] })}>
                  <DropdownMenuRadioItem value="all">{t.inbox.allChannels}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="telegram">{t.inbox.telegram}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <FilterPopover filters={filters} setFilters={setFilters} count={activeFilterCount} />
          </>
        )}
      </div>

      {/* Suhbatlar */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-[100px] items-center gap-3 px-3">
                <Skeleton className="size-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold">{t.inbox.noChats}</p>
            <p className="mt-1 text-[13px] text-muted">{t.inbox.noChatsDesc}</p>
          </div>
        ) : (
          <ul>
            {rows.map((c) => {
              const name = displayName(c);
              const isChecked = checked.has(c.id);
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(c)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(c)}
                    className={cn(
                      "group flex h-[100px] cursor-pointer items-center gap-3 border-b border-border px-4 hover:bg-bg-subtle",
                      selectedId === c.id && "bg-bg-muted hover:bg-bg-muted",
                    )}
                  >
                    {perms.canChat && (
                      <span onClick={(e) => e.stopPropagation()} className={cn("flex", !isChecked && checked.size === 0 && "max-md:hidden md:opacity-0 md:group-hover:opacity-100")}>
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(v) => {
                            const n = new Set(checked);
                            if (v === true) n.add(c.id);
                            else n.delete(c.id);
                            setChecked(n);
                          }}
                          aria-label={name}
                        />
                      </span>
                    )}
                    <Avatar src={c.avatar_url} name={name} size={56} silhouette={!c.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold">{name}</span>
                        <span className={cn("ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-muted", c.is_unread && "font-bold text-fg")}>
                          {c.is_unread && <span className="size-2 rounded-full bg-fg" aria-label={t.inbox.unread} />}
                          {timeShort(t, c.last_message_at)}
                        </span>
                      </div>
                      <p className={cn("mt-1 truncate text-sm text-muted", c.is_unread && "text-fg")}>{c.last_message_preview ?? ""}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={sentinel} />
      </div>
    </section>
  );
}

function FilterPopover({ filters, setFilters, count }: { filters: InboxFilters; setFilters: (f: InboxFilters) => void; count: number }) {
  const t = useT();
  const tags = useTagsList();
  const members = useMembers();
  const labels = useLabels();
  return (
    <Popover>
      <PopoverTrigger className={cn(chip, count > 0 && "border-fg")}>
        <Plus className="size-4" />
        {t.inbox.filter}
        {count > 0 && <span className="rounded-full bg-fg px-1.5 text-[11px] text-bg">{count}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <FilterRow label={t.inbox.filterTag}>
          <NativeSelect value={filters.tagId ?? ""} onChange={(e) => setFilters({ ...filters, tagId: e.target.value || null })}>
            <option value="">{t.common.all}</option>
            {tags.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        </FilterRow>
        <FilterRow label={t.inbox.filterAssignee}>
          <NativeSelect value={filters.assignee ?? ""} onChange={(e) => setFilters({ ...filters, assignee: e.target.value || null })}>
            <option value="">{t.common.all}</option>
            <option value="none">{t.inbox.unassigned}</option>
            {members.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.full_name ?? m.user_id.slice(0, 8)}
              </option>
            ))}
          </NativeSelect>
        </FilterRow>
        <FilterRow label={t.inbox.filterLabel}>
          <NativeSelect value={filters.labelId ?? ""} onChange={(e) => setFilters({ ...filters, labelId: e.target.value || null })}>
            <option value="">{t.common.all}</option>
            {labels.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </FilterRow>
        <FilterRow label={t.inbox.filterActivity}>
          <NativeSelect value={filters.activity} onChange={(e) => setFilters({ ...filters, activity: e.target.value as InboxFilters["activity"] })}>
            <option value="any">{t.common.all}</option>
            <option value="1d">{t.inbox.lastDay}</option>
            <option value="7d">{t.inbox.lastWeek}</option>
            <option value="30d">{t.inbox.lastMonth}</option>
          </NativeSelect>
        </FilterRow>
        {count > 0 && (
          <>
            <DropdownMenuSeparatorLike />
            <button
              className="text-[13px] font-medium underline-offset-4 hover:underline"
              onClick={() => setFilters({ ...filters, tagId: null, assignee: null, labelId: null, activity: "any" })}
            >
              {t.inbox.clearFilters}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DropdownMenuSeparatorLike() {
  return <div className="-mx-3 h-px bg-border" />;
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
