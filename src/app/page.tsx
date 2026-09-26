import { ArrowRight, Clock, GitBranch, Megaphone, MessageCircle, QrCode, Zap } from "lucide-react";
import Link from "next/link";
import { TelegramIcon } from "@/components/brand/logo";
import { Faq, FAQ } from "@/components/marketing/faq";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Statik (SSG) — CDN'dan beriladi, runtime'da DB so'rovi yo'q
export const dynamic = "force-static";

const FEATURES = [
  { icon: GitBranch, title: "Vizual Flow Builder", text: "Xabarlar, tugmalar, shartlar, randomizer va Smart Delay — hammasi bitta canvas'da, kodsiz." },
  { icon: Zap, title: "11 turdagi trigger", text: "Kalit so'z, /start, buyruq, ref havola, teg, custom field, sana, webhook va boshqalar." },
  { icon: Megaphone, title: "Broadcast", text: "Barcha yoki filtrlangan obunachilarga bir zumda yoki rejalashtirib yuboring. Natijalar va CTR." },
  { icon: Clock, title: "Sequences", text: "Obunadan keyin 1-kun, 3-kun, 7-kun — xabarlar seriyasi o'zi ketadi, ish vaqtini hisobga olib." },
  { icon: MessageCircle, title: "Live Chat", text: "Mijozlar bilan real vaqtda yozishing: operatorga biriktirish, eslatmalar, ichki izohlar." },
  { icon: QrCode, title: "Growth Tools", text: "Ref havola, QR kod va sayt widgeti — har biri o'z statistikasi bilan." },
];

const STEPS = [
  { n: "1", title: "Botni ulang", text: "@BotFather tokenini joylashtiring — webhook avtomatik sozlanadi." },
  { n: "2", title: "Avtomatlashtiring", text: "Shablondan boshlang yoki flow builder'da o'z ssenariyingizni yarating." },
  { n: "3", title: "O'sing", text: "Broadcast, sequence va growth tool'lar bilan obunachilarni ko'paytiring." },
];

function FlowIllustration() {
  // Yengil HTML "skrinshot" — rasm yuklanmaydi (LCP tez)
  return (
    <div className="relative mx-auto mt-14 max-w-4xl rounded-[20px] border border-border bg-canvas p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.25)] md:p-8" aria-hidden>
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-[16px] border border-border bg-bg p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4" /> When...
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-bg-muted px-2.5 py-2 text-[12px]">
            <TelegramIcon size={14} /> Message contains <code className="rounded bg-bg px-1">narx</code>
          </div>
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-muted md:block" />
        <div className="rounded-[16px] border border-border bg-bg p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TelegramIcon size={16} /> Send Message
          </div>
          <div className="mt-3 rounded-[8px] bg-bg-muted px-2.5 py-2 text-[12px]">Narxlarimiz bilan tanishing 👇</div>
          <div className="mt-2 rounded-[8px] border border-border px-2.5 py-1.5 text-center text-[12px] font-medium">Katalog</div>
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-muted md:block" />
        <div className="rounded-[16px] border border-border bg-bg p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4" /> Actions
          </div>
          <div className="mt-3 rounded-[8px] bg-bg-muted px-2.5 py-2 text-[12px]">+ Teg: lead</div>
          <div className="mt-2 rounded-[8px] bg-bg-muted px-2.5 py-2 text-[12px]">🔔 Adminga xabar</div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center md:px-6 md:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[13px] font-medium">
            <TelegramIcon size={16} /> Faqat Telegram uchun
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-[40px] font-semibold leading-[1.1] tracking-tight md:text-[60px]">
            Telegram botingizni avtomatlashtiring
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            Vizual flow builder, avtomatik javoblar, broadcast va Live Chat — kod yozmasdan. Bot 0,5 soniyada javob beradi.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              7 kun bepul sinab ko&apos;rish
            </Link>
            <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Narxlarni ko&apos;rish
            </Link>
          </div>
          <FlowIllustration />
        </section>

        <section id="imkoniyatlar" className="border-t border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
            <h2 className="text-center text-[30px] font-semibold tracking-tight md:text-[40px]">Kerak bo&apos;lgan hamma narsa</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted">Bitta platformada: avtomatlashtirish, marketing va mijozlarga xizmat.</p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-[16px] border border-border bg-bg p-6">
                  <span className="flex size-10 items-center justify-center rounded-[10px] bg-fg text-bg">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <h2 className="text-center text-[30px] font-semibold tracking-tight md:text-[40px]">3 qadamda ishga tushiring</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-[16px] border border-border p-6">
                <span className="flex size-9 items-center justify-center rounded-full border-2 border-fg text-sm font-bold">{s.n}</span>
                <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border bg-fg text-bg">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center md:px-6">
            <h2 className="text-[28px] font-semibold tracking-tight md:text-[36px]">ManyChat&apos;dan 2 barobar arzon</h2>
            <p className="max-w-lg text-[#a1a1aa]">Start — 89 000 so&apos;m/oy, Pro — 179 000 so&apos;m/oy. Yillik to&apos;lovda 20% chegirma. Payme, Click, Uzcard, Humo.</p>
            <Link href="/pricing" className={cn(buttonVariants({ size: "lg" }), "bg-bg text-fg hover:bg-[#e4e4e7]")}>
              Tariflarni solishtirish
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <h2 className="mb-8 text-center text-[30px] font-semibold tracking-tight">Ko&apos;p so&apos;raladigan savollar</h2>
          <Faq items={FAQ} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
