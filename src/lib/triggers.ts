import type { Dictionary } from "@/lib/i18n";
import type { Json } from "@/lib/supabase/database.types";

export const TRIGGER_TYPES = [
  "keyword",
  "welcome",
  "ref_url",
  "command",
  "default_reply",
  "message_type",
  "tag_applied",
  "tag_removed",
  "field_changed",
  "date_based",
  "subscribed",
  "unsubscribed",
  "webhook",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

type Cfg = Record<string, unknown>;

/** Trigger kartochkasi uchun: sarlavha + (ixtiyoriy) chip'lar */
export function triggerSummary(t: Dictionary, type: string, config: Json): { label: string; chips: string[] } {
  const c = (config && typeof config === "object" && !Array.isArray(config) ? config : {}) as Cfg;
  switch (type) {
    case "keyword": {
      const match = (c.match as string) ?? "contains";
      const label = t.keywordMatch[match as keyof Dictionary["keywordMatch"]] ?? t.keywordMatch.contains;
      return { label, chips: Array.isArray(c.keywords) ? (c.keywords as string[]) : [] };
    }
    case "command":
      return { label: t.triggerTypes.command, chips: c.command ? [`/${String(c.command).replace(/^\//, "")}`] : [] };
    case "ref_url":
      return { label: t.triggerTypes.ref_url, chips: c.ref ? [String(c.ref)] : [] };
    case "message_type":
      return {
        label: t.triggerTypes.message_type,
        chips: Array.isArray(c.types) ? (c.types as string[]).map((x) => t.builder.msgTypes[x as keyof Dictionary["builder"]["msgTypes"]] ?? x) : [],
      };
    case "date_based": {
      const off = Number(c.offset_days ?? 0);
      const when = off === 0 ? t.builder.offsetSame : `${Math.abs(off)} ${t.builder.daysOffset.toLowerCase()} ${off < 0 ? t.builder.offsetBefore : t.builder.offsetAfter}`;
      return { label: t.triggerTypes.date_based, chips: c.field_name ? [String(c.field_name), `${when} ${c.time ?? "10:00"}`] : [] };
    }
    case "tag_applied":
    case "tag_removed":
      return { label: t.triggerTypes[type], chips: c.tag_name ? [String(c.tag_name)] : [] };
    case "field_changed":
      return { label: t.triggerTypes.field_changed, chips: c.field_name ? [String(c.field_name)] : [] };
    default:
      return { label: t.triggerTypes[type as TriggerType] ?? type, chips: [] };
  }
}
