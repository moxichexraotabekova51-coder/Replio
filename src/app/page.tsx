import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Kirish
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Boshlash
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-[40px] font-semibold leading-tight tracking-tight md:text-[56px]">
          Telegram botingizni avtomatlashtiring
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] text-muted">
          Vizual flow builder, avtomatik javoblar, broadcast va Live Chat — kod yozmasdan.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Bepul sinab ko&apos;rish
          </Link>
        </div>
      </main>
    </div>
  );
}
