import Link from "next/link";
import { Logo, TelegramIcon } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { SUPPORT_TELEGRAM } from "@/lib/env";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" aria-label="Replio — bosh sahifa">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm md:gap-2" aria-label="Sayt menyusi">
          <Link href="/#imkoniyatlar" className="hidden rounded-[6px] px-3 py-2 font-medium text-muted hover:text-fg sm:block">
            Imkoniyatlar
          </Link>
          <Link href="/pricing" className="rounded-[6px] px-3 py-2 font-medium text-muted hover:text-fg">
            Narxlar
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Kirish
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Boshlash
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm md:flex-row md:items-center md:justify-between md:px-6">
        <div className="space-y-2">
          <Logo />
          <p className="text-muted">Telegram botlar uchun avtomatlashtirish platformasi.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-muted" aria-label="Pastki menyu">
          <Link href="/pricing" className="hover:text-fg">
            Narxlar
          </Link>
          <Link href="/help" className="hover:text-fg">
            Yordam markazi
          </Link>
          <a href={`https://t.me/${SUPPORT_TELEGRAM}`} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1.5 hover:text-fg")}>
            <TelegramIcon size={16} />
            Qo&apos;llab-quvvatlash
          </a>
          <Link href="/login" className="hover:text-fg">
            Kirish
          </Link>
        </nav>
        <p className="text-[12px] text-muted">© {new Date().getFullYear()} Replio</p>
      </div>
    </footer>
  );
}
