import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SUPPORT_TELEGRAM } from "@/lib/env";

export const metadata: Metadata = { title: "Yordam markazi" };

const FAQ: { q: string; a: string }[] = [
  {
    q: "Telegram botni qanday ulayman?",
    a: "Telegram'da @BotFather'ni oching, /newbot buyrug'i bilan bot yarating va bergan tokenni nusxalang. Replio'da Settings → Telegram bo'limiga tokenni qo'ying — webhook avtomatik o'rnatiladi.",
  },
  {
    q: "Avtomatlashtirish qanday ishlaydi?",
    a: "Automation → New Automation orqali flow yarating. \"When...\" tugunida trigger (masalan, kalit so'z) tanlang, keyin xabarlar, tugmalar va shartlarni qo'shing. \"Set Live\" bosilgandan so'ng flow ishlay boshlaydi.",
  },
  {
    q: "Welcome Message va Default Reply nima?",
    a: "Welcome Message — foydalanuvchi botga birinchi marta /start bosganda yuboriladi. Default Reply — hech bir trigger mos kelmaganda yuboriladi. Ikkalasi ham Automation → Basic bo'limida.",
  },
  {
    q: "Broadcast yuborishda cheklov bormi?",
    a: "Telegram cheklovlariga rioya qilish uchun xabarlar soniyasiga ~25 tadan yuboriladi. Faqat botga obuna bo'lgan (botni bloklamagan) kontaktlarga yetkaziladi.",
  },
  {
    q: "Tarifni qanday o'zgartiraman?",
    a: "Settings → Billing yoki chap paneldagi PRO tugmasi orqali tarif va davr (oylik/yillik) tanlang. To'lov checkout.uz orqali Payme, Click, Uzcard yoki Humo bilan amalga oshiriladi.",
  },
  {
    q: "Kontaktlar limitiga yetsam nima bo'ladi?",
    a: "Yangi kontaktlar saqlanaveradi, lekin avtomatlashtirishlar ularga ishlamaydi. Davom ettirish uchun tarifni oshiring.",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="flex h-16 items-center border-b border-border bg-bg px-6">
        <Link href="/app" aria-label="Replio">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-[32px] font-semibold">Yordam markazi</h1>
        <p className="mt-2 text-muted">Ko&apos;p so&apos;raladigan savollar va javoblar.</p>
        <div className="mt-8 divide-y divide-border rounded-[8px] border border-border bg-bg">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          Javob topmadingizmi?{" "}
          <a href={`https://t.me/${SUPPORT_TELEGRAM}`} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline underline-offset-4">
            Telegram orqali yozing
          </a>
          .
        </p>
      </main>
    </div>
  );
}
