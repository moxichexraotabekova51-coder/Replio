"use client";

import { ChevronsRight, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { useT } from "@/lib/i18n/provider";
import {
  defaultInboxFilters,
  useContact,
  useConversations,
  useUpdateConversations,
  type Conversation,
  type InboxFilters,
  type InboxView,
} from "@/lib/queries/inbox";
import { cn } from "@/lib/utils";
import { ChatPane } from "./chat-pane";
import { ConversationList } from "./conversation-list";
import { InboxIllustration } from "./illustration";
import { InboxMenu } from "./inbox-menu";

const MENU_KEY = "replio.inbox.menu";

function parseView(v: string | null): InboxView {
  if (v === "reminders") return { kind: "reminders" };
  if (v?.startsWith("label:")) return { kind: "label", id: v.slice(6) };
  return { kind: "all" };
}
function viewParam(v: InboxView): string | null {
  return v.kind === "all" ? null : v.kind === "reminders" ? "reminders" : `label:${v.id}`;
}

export function InboxPage() {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => parseView(params.get("view")), [params]);
  const selectedId = params.get("c");

  const [filters, setFilters] = useState<InboxFilters>(defaultInboxFilters);
  const [menuOpen, setMenuOpen] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Conversation | null>(null);

  useEffect(() => {
    try {
      setMenuOpen(localStorage.getItem(MENU_KEY) !== "0");
    } catch {
      /* e'tiborsiz */
    }
  }, []);
  const setMenu = (v: boolean) => {
    setMenuOpen(v);
    try {
      localStorage.setItem(MENU_KEY, v ? "1" : "0");
    } catch {
      /* e'tiborsiz */
    }
  };

  const q = useConversations(view, filters);
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  const update = useUpdateConversations();

  // Tanlangan suhbat alohida so'rov bilan kuzatiladi (filtrdan chiqsa ham ochiq qoladi)
  const contactQ = useContact(selectedId, picked ?? rows.find((r) => r.id === selectedId) ?? null);
  const selected = selectedId ? (contactQ.data ?? null) : null;

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const open = (c: Conversation) => {
    setPicked(c);
    setParam({ c: c.id });
    if (c.is_unread) update.mutate({ ids: [c.id], patch: { is_unread: false } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sarlavha zonasi */}
      <header className="flex min-h-[84px] shrink-0 items-center gap-4 border-b border-border bg-bg-muted px-4 md:px-8">
        <h1 className="text-[26px] font-semibold md:text-[32px]">{t.inbox.title}</h1>
        <div className="flex flex-1 justify-center">
          <SearchInput
            value={filters.search}
            onChange={(search) => setFilters((f) => ({ ...f, search }))}
            placeholder={t.inbox.searchPlaceholder}
            className="w-full max-w-[530px]"
            inputClassName="h-11"
          />
        </div>
        {app.account.role === "admin" && (
          <Link
            href="/app/settings/inbox"
            className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-border bg-bg hover:border-fg"
            aria-label={t.inbox.settings}
            title={t.inbox.settings}
          >
            <Settings className="size-5" />
          </Link>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {menuOpen ? (
          <div className="hidden lg:block">
            <InboxMenu
              view={view}
              onView={(v) => {
                setChecked(new Set());
                setParam({ view: viewParam(v), c: null });
              }}
              onCollapse={() => setMenu(false)}
            />
          </div>
        ) : (
          <div className="hidden w-12 shrink-0 flex-col items-center border-r border-border py-4 lg:flex">
            <button
              onClick={() => setMenu(true)}
              className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
              aria-label={t.inbox.expand}
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        )}

        <div className={cn("min-w-0 max-md:flex-1", selected && "max-md:hidden")}>
          {q.isError ? (
            <div className="p-4 md:w-[430px]">
              <ErrorState message={t.errors.generic} onRetry={() => q.refetch()} retryLabel={t.common.retry} />
            </div>
          ) : (
            <ConversationList
              rows={rows}
              loading={q.isLoading}
              hasMore={!!q.hasNextPage}
              onLoadMore={() => !q.isFetchingNextPage && q.fetchNextPage()}
              filters={filters}
              setFilters={setFilters}
              selectedId={selected?.id ?? null}
              onOpen={open}
              checked={checked}
              setChecked={setChecked}
            />
          )}
        </div>

        {selected ? (
          <ChatPane
            key={selected.id}
            contact={selected}
            tz={app.account.timezone}
            onBack={() => {
              setPicked(null);
              setParam({ c: null });
            }}
          />
        ) : (
          <div className="hidden min-w-0 flex-1 flex-col items-center justify-center px-8 text-center md:flex">
            <InboxIllustration className="h-[150px] w-[200px]" />
            <h2 className="mt-8 max-w-md text-[22px] font-semibold leading-snug">{t.inbox.emptyTitle}</h2>
            <p className="mt-3 max-w-md text-sm text-muted">{t.inbox.emptyDesc}</p>
            {app.account.role === "admin" && (
              <Link href="/app/settings/inbox" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
                {t.inbox.goToSettings}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
