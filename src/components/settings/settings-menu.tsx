"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/components/providers/app-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { SECTIONS } from "./sections";

export function SettingsMenu() {
  const t = useT();
  const pathname = usePathname();
  const { isAdmin } = usePermissions();
  return (
    <nav
      className="shrink-0 border-border px-4 py-4 md:w-[272px] md:border-r md:px-11 md:py-8 max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:border-b"
      aria-label={t.settings.title}
    >
      {SECTIONS.filter((s) => isAdmin || !s.admin).map((s) => {
        const href = `/app/settings/${s.key}`;
        const active = pathname === href;
        return (
          <Link
            key={s.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-[6px] px-3 text-sm font-medium hover:bg-bg-muted max-md:h-10 max-md:shrink-0",
              active && "bg-active hover:bg-active",
            )}
          >
            <s.icon className="size-[18px]" strokeWidth={1.75} />
            {s.label(t)}
          </Link>
        );
      })}
    </nav>
  );
}
