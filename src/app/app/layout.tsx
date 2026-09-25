import { QueryProvider } from "@/components/providers/app-provider";
import { I18nProvider } from "@/lib/i18n/provider";

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="uz">
      <QueryProvider>{children}</QueryProvider>
    </I18nProvider>
  );
}
