import { uz, type Dictionary } from "./uz";

export const locales = ["uz"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "uz";

export const localeNames: Record<Locale, string> = { uz: "O'zbekcha" };

const dictionaries: Record<Locale, Dictionary> = { uz };

export function getDictionary(locale: string | null | undefined): Dictionary {
  return dictionaries[(locales as readonly string[]).includes(locale ?? "") ? (locale as Locale) : defaultLocale];
}

/** "{n} ta kontakt" → "5 ta kontakt" */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type { Dictionary };
