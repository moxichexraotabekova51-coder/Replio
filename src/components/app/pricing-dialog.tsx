"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { planFeatures, planPrice, type Plan } from "@/lib/billing";
import { fmt, type Dictionary } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { usePricingModal } from "@/lib/stores/ui";
import { cn, formatNumber } from "@/lib/utils";
import { startCheckout } from "./checkout";

export function planFeatureList(t: Dictionary, plan: Plan): string[] {
  const f = planFeatures(plan);
  return [
    fmt(t.pricing.contacts, { n: formatNumber(plan.contact_limit) }),
    fmt(t.pricing.bots, { n: plan.bot_limit }),
    fmt(t.pricing.seats, { n: plan.seat_limit }),
    t.pricing.unlimitedFlows,
    t.pricing.broadcast,
    f.live_chat_assign ? t.pricing.liveChatAssign : t.pricing.liveChat,
    ...(f.data_collection ? [t.pricing.dataCollection] : []),
    ...(f.external_request ? [t.pricing.externalRequest] : []),
    f.growth_stats === "full" ? t.pricing.growthFull : t.pricing.growthBasic,
    t.pricing.noBranding,
  ];
}

export function PeriodToggle({
  value,
  onChange,
}: {
  value: "monthly" | "yearly";
  onChange: (v: "monthly" | "yearly") => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" className="inline-flex rounded-[8px] border border-border bg-bg-muted p-1">
      {(["monthly", "yearly"] as const).map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[6px] px-3.5 text-[13px] font-medium text-muted transition-colors",
            value === p && "bg-bg text-fg shadow-sm",
          )}
        >
          {p === "monthly" ? t.pricing.monthly : t.pricing.yearly}
          {p === "yearly" && (
            <span className="rounded-[4px] bg-fg px-1 text-[10px] font-semibold text-bg">{t.pricing.yearlyDiscount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function PricingDialog() {
  const t = useT();
  const app = useApp();
  const { open, setOpen, planId } = usePricingModal();
  const [period, setPeriod] = useState<"monthly" | "yearly">(app.subscription?.billing_period ?? "monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = app.account.role === "admin";

  useEffect(() => {
    if (!open) setBusy(null);
  }, [open]);

  async function choose(id: string) {
    setBusy(id);
    const ok = await startCheckout(id, period);
    if (!ok) setBusy(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[760px] p-8">
        <div className="text-center">
          <DialogTitle className="pr-0 text-[24px]">{t.pricing.title}</DialogTitle>
          <DialogDescription>{t.pricing.subtitle}</DialogDescription>
          <div className="mt-5">
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {app.plans.map((plan) => {
            const isCurrent = app.plan?.id === plan.id && !app.billing.expired && !app.billing.trialing;
            const highlighted = planId ? plan.id === planId : plan.id === "pro";
            const price = planPrice(plan, period);
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-[12px] border bg-bg p-6",
                  highlighted ? "border-2 border-fg" : "border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[20px] font-semibold">{plan.name}</h3>
                  {isCurrent && (
                    <span className="rounded-[4px] bg-bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted">
                      {t.pricing.current}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[32px] font-semibold tracking-tight">{formatNumber(price)}</span>
                  <span className="text-sm text-muted">{period === "yearly" ? t.pricing.perYear : t.pricing.perMonth}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {planFeatureList(t, plan).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  size="lg"
                  variant={highlighted ? "primary" : "secondary"}
                  loading={busy === plan.id}
                  disabled={!isAdmin || (busy !== null && busy !== plan.id)}
                  onClick={() => choose(plan.id)}
                >
                  {busy === plan.id ? t.pricing.redirecting : t.pricing.choose}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-center text-[12px] text-muted">
          {isAdmin ? t.pricing.payMethods : t.errors.forbidden}
        </p>
      </DialogContent>
    </Dialog>
  );
}
