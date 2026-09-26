import { Atom, House, MessageCircle, Send, Settings, UserRound, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

export type NavItem = {
  key: "home" | "contacts" | "automation" | "inbox" | "broadcasting" | "settings";
  href: string;
  icon: LucideIcon;
  label: (t: Dictionary) => string;
  /** 'agent' roli ham ko'radimi */
  agent: boolean;
};

export const NAV: NavItem[] = [
  { key: "home", href: "/app", icon: House, label: (t) => t.rail.home, agent: false },
  { key: "contacts", href: "/app/contacts", icon: UserRound, label: (t) => t.rail.contacts, agent: true },
  { key: "automation", href: "/app/automation", icon: Atom, label: (t) => t.rail.automation, agent: false },
  { key: "inbox", href: "/app/inbox", icon: MessageCircle, label: (t) => t.rail.inbox, agent: true },
  { key: "broadcasting", href: "/app/broadcasting", icon: Send, label: (t) => t.rail.broadcasting, agent: false },
  { key: "settings", href: "/app/settings", icon: Settings, label: (t) => t.rail.settings, agent: false },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}
