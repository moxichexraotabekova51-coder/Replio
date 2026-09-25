"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { planFeatureList } from "@/components/app/pricing-dialog";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { usePricingModal } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { cn, formatNumber, formatSum } from "@/lib/utils";
import { Card, SectionTitle } from "./section";

type PayState = "checking" | "paid" | "pending" | "failed";

export function BillingSection() {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const paymentId = params.get("payment");
  const showPricing = usePricingModal((s) => s.show);
  const [payState, setPayState] = useState<PayState | null>(paymentId ? "checking" : null);

  const usage = useQuery({
    queryKey: [app.account.id, "billing", "usage"],
    queryFn: async () => {
      const { count, error } = await createClient()
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", app.account.id)
        .eq("is_subscribed", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const payments = useQuery({
    queryKey: [app.account.id, "billing", "payments"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("payments")
        .select("id, plan_id, billing_period, amount, status, created_at, paid_at, checkout_url")
        .eq("account_id", app.account.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // return_url: webhook kechiksa ham status_payment orqali tekshiramiz
  useEffect(() => {
    if (!paymentId) return;
    let cancelled = false;
    let tries = 0;
    async function poll() {
      tries++;
      const res = await fetch(`/api/checkout/status?payment=${paymentId}`).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (json.status === "paid") {
        setPayState("paid");
        void payments.refetch();
        router.refresh();
      } else if (json.status === "failed" || json.status === "mismatch") {
        setPayState("failed");
      } else if (tries < 10) {
        setPayState("pending");
        setTimeout(poll, 2000);
      } else {
        setPayState("pending");
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  const used = usage.data ?? 0;
  const limit = app.plan.contact_limit;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const sub = app.subscription;
  const status = app.billing.expired ? "expired" : (sub?.status ?? "expired");

  return (
    <>
      <SectionTitle title={t.settings.billing} />

      {payState && (
        <div
          role="status"
          className={cn(
            "mb-6 flex items-center gap-3 rounded-[8px] border p-4 text-sm",
            payState === "paid" ? "border-fg bg-fg text-bg" : payState === "failed" ? "border-2 border-fg" : "border-border bg-bg-subtle",
          )}
        >
          {payState === "checking" || payState === "pending" ? <Spinner /> : payState === "paid" ? <Check className="size-4" /> : <span>⚠</span>}
          {payState === "paid" ? t.settings.paymentSuccess : payState === "failed" ? t.settings.paymentFailed : t.settings.paymentPending}
        </div>
      )}

      {used >= limit && (
        <div role="alert" className="mb-6 flex items-center gap-3 rounded-[8px] border-2 border-fg p-4 text-sm font-medium">
          <span aria-hidden>⚠</span>
          <span className="flex-1">{t.settings.billingLimitWarn}</span>
          <Button size="sm" onClick={() => showPricing("pro")}>
            {t.common.upgrade}
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[13px] text-muted">{t.settings.billingCurrent}</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight">{app.plan.name}</div>
            <div className="mt-1 text-sm text-muted">
              {formatSum(sub?.billing_period === "yearly" ? app.plan.price_yearly : app.plan.price_monthly)} /{" "}
              {sub?.billing_period === "yearly" ? t.pricing.yearly.toLowerCase() : t.pricing.monthly.toLowerCase()}
            </div>
          </div>
          <Button onClick={() => showPricing(app.plan.id === "start" ? "pro" : app.plan.id)}>{t.common.upgrade}</Button>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-muted">{t.settings.billingStatus}</dt>
            <dd className={cn("mt-1 text-sm font-semibold", app.billing.expired && "flex items-center gap-1.5")}>
              {app.billing.expired && <span aria-hidden>⚠</span>}
              {t.settings.statuses[status as keyof typeof t.settings.statuses]}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">{t.settings.billingPeriodEnd}</dt>
            <dd className="mt-1 text-sm font-semibold">{formatDate(sub?.current_period_end, app.account.timezone)}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t.settings.billingContacts}</span>
            {usage.isLoading ? <Skeleton className="h-4 w-24" /> : <span className="font-semibold">{formatNumber(used)} / {formatNumber(limit)}</span>}
          </div>
          {/* Limit progress: sariq emas — qora; limitga yaqin/yetganda qalin chiziq */}
          <div className={cn("mt-2 w-full overflow-hidden rounded-full bg-bg-muted", pct >= 90 ? "h-3 ring-2 ring-fg" : "h-2")}>
            <div className="h-full rounded-full bg-fg transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {pct >= 80 && pct < 100 && <p className="mt-2 text-[13px] font-medium">⚠ {fmt(t.settings.billingLimitNear, { p: pct })}</p>}
        </div>

        <ul className="mt-6 grid gap-2 border-t border-border pt-6 sm:grid-cols-2">
          {planFeatureList(t, app.plan).map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px]">
              <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
              {f}
            </li>
          ))}
        </ul>
      </Card>

      <h3 className="mb-3 mt-8 text-[16px] font-semibold">{t.settings.billingHistory}</h3>
      <Card className="overflow-x-auto p-0">
        {payments.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payments.data?.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t.settings.billingEmpty}</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-bg-subtle text-left text-[12px] text-muted">
              <tr className="h-10">
                <th className="px-6 font-medium">{t.settings.payDate}</th>
                <th className="px-4 font-medium">{t.settings.payPlan}</th>
                <th className="px-4 text-right font-medium">{t.settings.payAmount}</th>
                <th className="px-4 font-medium">{t.settings.payStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.data?.map((p) => {
                const plan = app.plans.find((x) => x.id === p.plan_id);
                const resumable = p.status === "pending" && p.checkout_url && Date.now() - new Date(p.created_at).getTime() < 30 * 60_000;
                return (
                  <tr key={p.id} className="h-14 border-t border-border">
                    <td className="px-6">{formatDate(p.paid_at ?? p.created_at, app.account.timezone, true)}</td>
                    <td className="px-4">
                      {plan?.name ?? p.plan_id} · {p.billing_period === "yearly" ? t.pricing.yearly : t.pricing.monthly}
                    </td>
                    <td className="px-4 text-right font-medium">{formatSum(p.amount)}</td>
                    <td className="px-4">
                      <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold uppercase", p.status === "paid" ? "bg-fg text-bg" : "bg-bg-muted text-muted")}>
                        {t.settings.paymentStatuses[p.status]}
                      </span>
                    </td>
                    <td className="pr-4 text-right">
                      {resumable && (
                        <a href={p.checkout_url!} className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline">
                          {t.settings.payContinue}
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
