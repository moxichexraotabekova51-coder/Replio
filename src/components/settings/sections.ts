import { Braces, CreditCard, Database, FileText, Inbox, Key, Send, Settings, Sprout, Tags, Users } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

export type SettingsSection = "general" | "telegram" | "team" | "tags" | "fields" | "bot-fields" | "inbox" | "growth" | "billing" | "api" | "logs";

export const SECTIONS: { key: SettingsSection; icon: typeof Settings; label: (t: Dictionary) => string; admin: boolean }[] = [
  { key: "general", icon: Settings, label: (t) => t.settings.general, admin: true },
  { key: "telegram", icon: Send, label: (t) => t.settings.telegram, admin: true },
  { key: "team", icon: Users, label: (t) => t.settings.team, admin: true },
  { key: "tags", icon: Tags, label: (t) => t.settings.tags, admin: false },
  { key: "fields", icon: Braces, label: (t) => t.settings.fields, admin: false },
  { key: "bot-fields", icon: Database, label: (t) => t.settings.botFields, admin: false },
  { key: "inbox", icon: Inbox, label: (t) => t.settings.inbox, admin: true },
  { key: "growth", icon: Sprout, label: (t) => t.settings.growth, admin: false },
  { key: "billing", icon: CreditCard, label: (t) => t.settings.billing, admin: true },
  { key: "api", icon: Key, label: (t) => t.settings.api, admin: true },
  { key: "logs", icon: FileText, label: (t) => t.settings.logs, admin: false },
];
