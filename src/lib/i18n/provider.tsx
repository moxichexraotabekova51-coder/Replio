"use client";

import { createContext, useContext } from "react";
import { getDictionary, type Dictionary, type Locale } from "./index";

const I18nContext = createContext<{ locale: Locale; t: Dictionary }>({ locale: "uz", t: getDictionary("uz") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, t: getDictionary(locale) }}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext).t;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}
