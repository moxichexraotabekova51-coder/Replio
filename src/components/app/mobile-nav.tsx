"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { useHasUnread } from "@/lib/queries/live-chat";
import { useApp } from "@/components/providers/app-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { isActive, NAV } from "./nav";
import { AccountSwitcher, HelpMenu, ProButton, UserMenu } from "./rail";

/** Telefon ekrani uchun: yuqorida ixcham panel, pastda navigatsiya */
export function MobileTopBar() {
  const app = useApp();
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg-subtle px-3 md:hidden">
      <Link href={app.account.role === "agent" ? "/app/inbox" : "/app"} aria-label="Replio">
        <LogoMark size={28} />
      </Link>
      <div className="ml-1">
        <AccountSwitcher compact />
      </div>
      <div className="ml-auto flex items-center [&>button]:!w-10">
        <div className="w-16 [&>button]:!mt-0 [&>button]:!w-16">
          <ProButton />
        </div>
        <HelpMenu />
        <UserMenu />
      </div>
    </div>
  );
}

export function MobileBottomNav() {
  const t = useT();
  const pathname = usePathname();
  const app = useApp();
  const { data: hasUnread } = useHasUnread();
  const items = NAV.filter((n) => app.account.role !== "agent" || n.agent);
  return (
    <nav className="flex h-16 shrink-0 items-stretch border-t border-border bg-bg-subtle md:hidden" aria-label="Navigatsiya">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted", active && "text-fg")}
          >
            <span className="relative">
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              {item.key === "inbox" && hasUnread && (
                <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-fg" />
              )}
            </span>
            <span className={cn(active && "font-semibold")}>{item.label(t)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
