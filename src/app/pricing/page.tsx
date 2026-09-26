import type { Metadata } from "next";
import { Faq, FAQ } from "@/components/marketing/faq";
import { PricingTable, type PublicPlan } from "@/components/marketing/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "Narxlar",
  description: "Replio tariflari: Start — 89 000 so'm/oy, Pro — 179 000 so'm/oy. Yillik to'lovda 20% chegirma.",
};

// ISR: narxlar `plans` jadvalidan, soatiga bir marta yangilanadi (CDN'dan statik beriladi)
export const revalidate = 3600;

const FALLBACK: PublicPlan[] = [
  { id: "start", name: "Start", price_monthly: 89000, price_yearly: 854000, contact_limit: 250, bot_limit: 1, seat_limit: 2, features: { growth_stats: "basic" } },
  {
    id: "pro",
    name: "Pro",
    price_monthly: 179000,
    price_yearly: 1718000,
    contact_limit: 2500,
    bot_limit: 3,
    seat_limit: 3,
    features: { external_request: true, api: true, webhook_trigger: true, live_chat_assign: true, data_collection: true, growth_stats: "full" },
  },
];

async function loadPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?select=id,name,price_monthly,price_yearly,contact_limit,bot_limit,seat_limit,features&order=sort_order`,
      { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return FALLBACK;
    const rows = (await res.json()) as PublicPlan[];
    return rows.length ? rows : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export default async function PricingPage() {
  const plans = await loadPlans();
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main className="px-4 pb-20 pt-16 md:px-6">
        <div className="text-center">
          <h1 className="text-[36px] font-semibold tracking-tight md:text-[48px]">Oddiy va arzon narxlar</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Ikkala tarifda ham cheksiz flowlar, triggerlar, broadcast va sequence&apos;lar. 7 kun bepul — karta talab qilinmaydi.
          </p>
        </div>
        <PricingTable plans={plans} />
        <p className="mt-6 text-center text-[13px] text-muted">Payme · Click · Uzcard · Humo orqali to&apos;lov (checkout.uz)</p>
        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-8 text-center text-[28px] font-semibold tracking-tight">Savollar</h2>
          <Faq items={FAQ} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
