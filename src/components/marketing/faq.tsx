import { ChevronDown } from "lucide-react";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border rounded-[12px] border border-border bg-bg">
      {items.map((x) => (
        <details key={x.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">
            {x.q}
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">{x.a}</p>
        </details>
      ))}
    </div>
  );
}

export const FAQ = [
  { q: "Replio nima?", a: "Replio — Telegram botingiz uchun vizual avtomatlashtirish platformasi: flow builder, kalit so'z triggerlari, broadcast, sequence'lar va Live Chat. Kod yozish shart emas." },
  { q: "Botni qanday ulayman?", a: "@BotFather'da bot yarating, tokenni nusxalab Settings → Telegram bo'limiga qo'ying. Replio webhookni avtomatik sozlaydi — bir daqiqa ichida bot javob bera boshlaydi." },
  { q: "Bot qanchalik tez javob beradi?", a: "Javob odatda 0,5 soniya ichida yetadi (eng sekin holatda ham 2 soniyadan oshmaydi). Birinchi xabar webhook javobining o'zida yuboriladi." },
  { q: "Qanday to'lash mumkin?", a: "checkout.uz orqali Payme, Click, Uzcard yoki Humo bilan. Yillik to'lovda 20% chegirma." },
  { q: "Kontakt limiti tugasa nima bo'ladi?", a: "Yangi kontaktlar saqlanadi, lekin limitdan oshganlariga avtomatlashtirishlar ishlamaydi. Pro tarifga o'tsangiz hammasi darhol faollashadi." },
  { q: "Obuna tugasa-chi?", a: "Tugashidan 3 va 1 kun oldin Telegram va email orqali eslatamiz. Muddat tugagach 3 kun davomida bot ishlaydi, keyin pauzaga qo'yiladi. Ma'lumotlaringiz o'chirilmaydi." },
];
