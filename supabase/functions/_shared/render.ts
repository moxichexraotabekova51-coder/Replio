// Matnni tayyorlash: {{o'zgaruvchi}} → qiymat (HTML-escaped). Matnning o'zi kompilyatsiyada tozalangan.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type Vars = Record<string, unknown>;

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** {{first_name}}, {{ username }}, {{custom_field}} */
export function renderVars(text: string, vars: Vars): string {
  return text.replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (_, name: string) => escapeHtml(valueToString(vars[name])));
}

/** HTML teglarni olib tashlab oddiy matn (Telegram HTML'ni rad etsa — zaxira) */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
