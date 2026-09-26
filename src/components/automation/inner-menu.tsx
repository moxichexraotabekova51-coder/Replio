"use client";

import { Layers, ListOrdered, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function AutomationInnerMenu() {
  const t = useT();
  const pathname = usePathname();
  const items = [
    { href: "/app/automation", label: t.automation.myAutomations, icon: Workflow, active: pathname === "/app/automation" || pathname === "/app/automation/trash" },
    { href: "/app/automation/basic", label: t.automation.basic, icon: Layers, active: pathname === "/app/automation/basic" },
    { href: "/app/automation/sequences", label: t.automation.sequences, icon: ListOrdered, active: pathname.startsWith("/app/automation/sequences") },
  ];
  return (
    <nav
      className="shrink-0 border-border px-4 py-4 md:w-[272px] md:border-r md:px-11 md:py-8 max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:border-b"
      aria-label={t.automation.title}
    >
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "flex h-[50px] items-center gap-3 rounded-[6px] px-3 text-[14px] font-medium text-fg hover:bg-bg-muted max-md:h-10 max-md:shrink-0",
            it.active && "bg-active hover:bg-active",
          )}
        >
          <it.icon className="size-[18px]" strokeWidth={1.75} />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
