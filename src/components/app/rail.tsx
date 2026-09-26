"use client";

import { ArrowLeftToLine, ArrowRightToLine, HelpCircle, Keyboard, LifeBuoy, LogOut, Languages, Plus, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LogoMark } from "@/components/brand/logo";
import { useHasUnread } from "@/lib/queries/live-chat";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { planBadge } from "@/lib/billing";
import { SUPPORT_TELEGRAM } from "@/lib/env";
import { localeNames, locales } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/provider";
import { signOut, switchAccount } from "@/lib/server/actions";
import { usePricingModal } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { ProfileDialog } from "./profile-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { isActive, NAV } from "./nav";

const EXPANDED_KEY = "replio.rail.expanded";

function Divider() {
  return <div className="mx-auto my-3 h-px w-full bg-border" />;
}

export function Rail() {
  const t = useT();
  const pathname = usePathname();
  const app = useApp();
  const { data: hasUnread } = useHasUnread();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(EXPANDED_KEY) === "1");
    } catch {
      /* localStorage mavjud emas */
    }
  }, []);

  const toggle = () => {
    setExpanded((v) => {
      try {
        localStorage.setItem(EXPANDED_KEY, v ? "0" : "1");
      } catch {
        /* e'tiborsiz */
      }
      return !v;
    });
  };

  const isAgent = app.account.role === "agent";
  const items = NAV.filter((n) => !isAgent || n.agent);
  const homeHref = isAgent ? "/app/inbox" : "/app";

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col border-r border-border bg-bg-subtle px-5 py-4 transition-[width] duration-150 md:flex",
        expanded ? "w-[232px]" : "w-[88px]",
      )}
      aria-label="Chap panel"
    >
      {/* Logo */}
      <Link href={homeHref} className={cn("flex h-12 items-center gap-3", !expanded && "justify-center")} aria-label="Replio">
        <LogoMark size={32} />
        {expanded && <span className="text-[17px] font-semibold tracking-tight">Replio</span>}
      </Link>
      <Divider />

      {/* Akkaunt */}
      <AccountSwitcher expanded={expanded} />
      <Divider />

      {/* Navigatsiya */}
      <nav className="flex flex-col gap-1" aria-label="Asosiy navigatsiya">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const showDot = item.key === "inbox" && hasUnread;
          return (
            <Tooltip key={item.key} content={item.label(t)} disabled={expanded}>
              <Link
                href={item.href}
                prefetch
                aria-label={item.label(t)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-3 rounded-[12px] text-fg transition-colors hover:bg-bg-muted",
                  expanded ? "px-3" : "w-12 justify-center",
                  active && "bg-bg-muted",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                  {showDot && <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-fg" aria-label="O'qilmagan xabarlar" />}
                </span>
                {expanded && <span className={cn("text-sm", active ? "font-semibold" : "font-medium")}>{item.label(t)}</span>}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <Tooltip content={expanded ? t.rail.collapse : t.rail.expand} disabled={expanded}>
          <button
            onClick={toggle}
            className={cn(
              "flex h-12 items-center gap-3 rounded-[12px] text-muted hover:bg-bg-muted hover:text-fg",
              expanded ? "px-3" : "w-12 justify-center",
            )}
            aria-label={expanded ? t.rail.collapse : t.rail.expand}
            aria-expanded={expanded}
          >
            {expanded ? <ArrowLeftToLine className="size-5" /> : <ArrowRightToLine className="size-5" />}
            {expanded && <span className="text-sm font-medium">{t.rail.collapse}</span>}
          </button>
        </Tooltip>
        <Divider />
        <UserMenu expanded={expanded} />
        <HelpMenu expanded={expanded} />
        <ProButton expanded={expanded} />
      </div>
    </aside>
  );
}

export function AccountSwitcher({ expanded, compact }: { expanded?: boolean; compact?: boolean }) {
  const t = useT();
  const app = useApp();
  const [pending, start] = useTransition();
  const current = app.accounts.find((a) => a.id === app.account.id)!;
  const badge = planBadge(current.plan_id, current.billing);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-3 rounded-[12px] text-left outline-none hover:bg-bg-muted data-[state=open]:bg-bg-muted",
            expanded ? "p-1.5" : "mx-auto p-0.5",
            pending && "opacity-60",
          )}
          aria-label={t.accountMenu.title}
        >
          <span className="relative">
            <Avatar src={app.account.avatar_url} name={app.account.name} size={compact ? 36 : 44} />
            <PlanBadge label={badge === "TUGAGAN" ? t.accountMenu.planExpired : badge} />
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{app.account.name}</span>
              {current.bot_username && <span className="block truncate text-[12px] text-muted">@{current.bot_username}</span>}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-72">
        <DropdownMenuLabel>{t.accountMenu.title}</DropdownMenuLabel>
        {app.accounts.map((a) => {
          const b = planBadge(a.plan_id, a.billing);
          return (
            <DropdownMenuItem
              key={a.id}
              className="h-12"
              onSelect={() => {
                if (a.id !== app.account.id) start(() => switchAccount(a.id));
              }}
            >
              <Avatar src={a.avatar_url} name={a.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block truncate text-[12px] text-muted">
                  {a.bot_username ? `@${a.bot_username}` : "Telegram"}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-[4px] px-1.5 text-[10px] font-semibold",
                  b === "TUGAGAN" ? "border border-fg" : "bg-bg-muted text-muted",
                )}
              >
                {b === "TUGAGAN" ? t.accountMenu.planExpired : b}
              </span>
              {a.id === app.account.id && <span className="size-1.5 rounded-full bg-fg" aria-label="joriy" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/onboarding">
            <Plus />
            {t.accountMenu.connectBot.replace(/^\+\s*/, "")}
          </Link>
        </DropdownMenuItem>
        {app.account.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/app/settings/general">
              <Settings2 />
              {t.accountMenu.settings}
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlanBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "absolute -bottom-1 -right-2 rounded-[4px] border border-bg px-1 text-[9px] font-bold leading-[14px] tracking-wide",
        label === "PRO" ? "bg-fg text-bg" : label === "START" ? "bg-bg text-fg ring-1 ring-border-strong" : "bg-bg text-fg ring-2 ring-fg",
      )}
    >
      {label}
    </span>
  );
}

export function UserMenu({ expanded }: { expanded?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const app = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, start] = useTransition();
  const name = app.profile.full_name || app.user.email;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex h-12 items-center gap-3 rounded-[12px] outline-none hover:bg-bg-muted data-[state=open]:bg-bg-muted",
              expanded ? "px-2" : "w-12 justify-center",
            )}
            aria-label={t.userMenu.profile}
          >
            <Avatar src={app.profile.avatar_url} name={name} size={32} />
            {expanded && <span className="min-w-0 truncate text-sm font-medium">{name}</span>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-64">
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar src={app.profile.avatar_url} name={name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{app.profile.full_name ?? "—"}</div>
              <div className="truncate text-[12px] text-muted">{app.user.email}</div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <UserRound />
            {t.userMenu.profile}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages />
              {t.userMenu.language}
              <span className="ml-auto pr-1 text-[12px] text-muted">{localeNames[locale]}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={locale}>
                {locales.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l}>
                    {localeNames[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending} onSelect={() => start(() => signOut())}>
            <LogOut />
            {t.userMenu.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

export function HelpMenu({ expanded }: { expanded?: boolean }) {
  const t = useT();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <Tooltip content={t.rail.help} disabled={expanded}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex h-12 items-center gap-3 rounded-[12px] text-fg outline-none hover:bg-bg-muted data-[state=open]:bg-bg-muted",
                expanded ? "px-3" : "w-12 justify-center",
              )}
              aria-label={t.rail.help}
            >
              <HelpCircle className="size-[22px]" strokeWidth={1.75} />
              {expanded && <span className="text-sm font-medium">{t.rail.help}</span>}
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" className="w-72">
          <DropdownMenuItem asChild>
            <a href="/help" target="_blank" rel="noopener">
              <LifeBuoy />
              {t.helpMenu.center}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`https://t.me/${SUPPORT_TELEGRAM}`} target="_blank" rel="noopener noreferrer">
              <Send24 />
              {t.helpMenu.telegram}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard />
            {t.helpMenu.shortcuts}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

function Send24() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function ProButton({ expanded }: { expanded?: boolean }) {
  const t = useT();
  const app = useApp();
  const show = usePricingModal((s) => s.show);
  // Pro tarifdagi (muddati tugamagan) foydalanuvchida ko'rinmaydi
  if (app.plan?.id === "pro" && !app.billing.expired) return null;
  if (app.account.role !== "admin") return null;
  return (
    <button
      onClick={() => show()}
      className={cn(
        "mt-2 flex h-9 items-center justify-center rounded-[8px] bg-primary text-[13px] font-semibold tracking-wide text-primary-fg hover:bg-[#27272a]",
        expanded ? "w-full" : "w-12",
      )}
    >
      {t.rail.pro}
    </button>
  );
}
