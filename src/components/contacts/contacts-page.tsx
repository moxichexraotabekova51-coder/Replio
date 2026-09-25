"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { formatDate, timeAgo } from "@/lib/time";
import { formatNumber } from "@/lib/utils";

const PAGE = 50;
const ROW_H = 60;

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  subscribed_at: string;
  last_interaction_at: string | null;
  is_subscribed: boolean;
  contact_tags: { tags: { id: string; name: string } | null }[];
};

export function ContactsPage() {
  const t = useT();
  const app = useApp();
  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const q = useInfiniteQuery({
    queryKey: [app.account.id, "contacts", { search }],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = createClient()
        .from("contacts")
        .select(
          "id, first_name, last_name, username, avatar_url, subscribed_at, last_interaction_at, is_subscribed, contact_tags(tags(id, name))",
          pageParam ? undefined : { count: "estimated" },
        )
        .eq("account_id", app.account.id)
        .order("subscribed_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE);
      if (search.trim()) query = query.ilike("search", `%${search.trim().toLowerCase()}%`);
      if (pageParam) query = query.lt("subscribed_at", pageParam);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count };
    },
    getNextPageParam: (last) => (last.rows.length === PAGE ? last.rows.at(-1)!.subscribed_at : null),
  });

  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = q.data?.pages[0]?.count ?? null;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (lastIndex >= rows.length - 10 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const empty = !q.isLoading && rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.contacts.title} />
      <div className="flex min-h-0 flex-1 flex-col px-4 py-6 md:px-11">
        {!(empty && !search) && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t.contacts.searchPlaceholder}
              className="w-full max-w-md"
              inputClassName="h-12"
            />
            {total !== null && (
              <span className="text-[13px] text-muted">{fmt(t.contacts.total, { n: formatNumber(total) })}</span>
            )}
          </div>
        )}

        {q.isError && <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />}

        {empty && !search ? (
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-border bg-bg shadow-sm">
            <div className="grid h-11 shrink-0 grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_120px_140px_minmax(140px,1.5fr)] items-center gap-4 border-b border-border bg-bg-subtle px-4 text-[12px] font-medium text-muted max-md:hidden">
              <span>{t.contacts.name}</span>
              <span>{t.contacts.username}</span>
              <span>{t.contacts.subscribed}</span>
              <span>{t.contacts.lastActivity}</span>
              <span>{t.contacts.tags}</span>
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
                    return (
                      <div
                        key={c.id}
                        className="absolute inset-x-0 grid grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_120px_140px_minmax(140px,1.5fr)] items-center gap-4 border-b border-border px-4 text-sm max-md:grid-cols-[1fr_auto]"
                        style={{ height: ROW_H, transform: `translateY(${vi.start}px)` }}
                      >
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
                          {c.contact_tags
                            .map((ct) => ct.tags)
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((tag) => (
                              <span key={tag!.id} className="truncate rounded-[4px] bg-bg-muted px-1.5 py-0.5 text-[12px]">
                                {tag!.name}
                              </span>
                            ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
