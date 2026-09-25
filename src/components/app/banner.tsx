"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { usePricingModal } from "@/lib/stores/ui";
import { startCheckout } from "./checkout";

const KEY = "replio.banner.dismissed";

/** Obuna tugaganda yoki 3 kundan kam qolganda ko'rinadigan qora banner */
export function SubscriptionBanner() {
  const t = useT();
  const app = useApp();
  const showPricing = usePricingModal((s) => s.show);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(`${KEY}.${app.account.id}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [app.account.id]);

  if (!app.billing.showBanner || dismissed) return null;

  const text = app.billing.expired
    ? t.banner.expired
    : fmt(app.billing.trialing ? t.banner.trialEnding : t.banner.expiring, { days: Math.max(app.billing.daysLeft, 0) });

  async function renew() {
    // Sinov muddatida tarif tanlanmagan — modalni ochamiz; aks holda joriy tarif uchun to'g'ridan-to'g'ri to'lov
    if (app.billing.trialing || app.account.role !== "admin") {
      showPricing(app.plan?.id);
      return;
    }
    setBusy(true);
    const ok = await startCheckout(app.plan.id, app.subscription?.billing_period ?? "monthly");
    if (!ok) setBusy(false);
  }

  return (
    <div role="status" className="flex min-h-12 items-center gap-3 bg-banner px-4 py-2 text-[13px] text-white md:px-6">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-black">
        <AlertTriangle className="size-3.5" strokeWidth={2.5} />
      </span>
      <p className="min-w-0 flex-1">
        {text}{" "}
        <button onClick={renew} disabled={busy} className="font-medium text-[#d4d4d8] hover:underline disabled:opacity-60">
          {t.banner.renew}
        </button>
      </p>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(`${KEY}.${app.account.id}`, "1");
          } catch {
            /* e'tiborsiz */
          }
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[#a1a1aa] hover:bg-white/10 hover:text-white"
        aria-label={t.banner.dismiss}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
