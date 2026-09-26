import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { I18nProvider } from "@/lib/i18n/provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="uz">
      <div className="flex min-h-dvh flex-col bg-bg-subtle">
        <header className="flex h-16 items-center px-6">
          <Link href="/" aria-label="Replio bosh sahifa">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:items-center md:pt-0">{children}</main>
      </div>
    </I18nProvider>
  );
}
