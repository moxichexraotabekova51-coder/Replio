// Vaqt mintaqalari ro'yxati (Intl mavjud bo'lsa — to'liq ro'yxat)
const FALLBACK = [
  "Asia/Tashkent",
  "Asia/Samarkand",
  "Asia/Almaty",
  "Asia/Bishkek",
  "Asia/Dushanbe",
  "Asia/Ashgabat",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "UTC",
];

export function timezones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("Asia/Tashkent") ? list : ["Asia/Tashkent", ...list];
  } catch {
    /* eski brauzer */
  }
  return FALLBACK;
}
