import { fmt, type Dictionary } from "@/lib/i18n";

/** "23 soat oldin" */
export function timeAgo(t: Dictionary, date: string | Date | null | undefined): string {
  if (!date) return "—";
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t.time.justNow;
  if (m < 60) return fmt(t.time.min, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(t.time.hour, { n: h });
  return fmt(t.time.day, { n: Math.floor(h / 24) });
}

/** Inbox uchun qisqa: "27min" → "27m", "5h", "3d" */
export function timeShort(t: Dictionary, date: string | Date | null | undefined): string {
  if (!date) return "";
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const m = Math.max(1, Math.floor(diff / 60_000));
  if (m < 60) return fmt(t.time.shortMin, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(t.time.shortHour, { n: h });
  return fmt(t.time.shortDay, { n: Math.floor(h / 24) });
}

export function formatDate(date: string | Date | null | undefined, tz = "Asia/Tashkent", withTime = false): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(date));
}
