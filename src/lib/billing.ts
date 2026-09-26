import type { Tables } from "@/lib/supabase/database.types";

export type Plan = Tables<"plans">;
export type Subscription = Tables<"subscriptions">;

export const GRACE_DAYS = 3;
const DAY = 86_400_000;

export type PlanFeatures = {
  external_request?: boolean;
  api?: boolean;
  webhook_trigger?: boolean;
  live_chat_assign?: boolean;
  data_collection?: boolean;
  growth_stats?: "basic" | "full";
};

export function planFeatures(plan: Pick<Plan, "features"> | null | undefined): PlanFeatures {
  return (plan?.features ?? {}) as PlanFeatures;
}

export type BillingState = {
  /** muddat tugagan (grace period ichida ham) */
  expired: boolean;
  /** grace ham tugagan — botlar pauzada */
  paused: boolean;
  /** muddat tugashiga qolgan kun (tugagan bo'lsa ≤ 0) */
  daysLeft: number;
  /** banner ko'rsatilsinmi (tugagan yoki < 3 kun qolgan) */
  showBanner: boolean;
  trialing: boolean;
};

export function billingState(sub: Pick<Subscription, "status" | "current_period_end"> | null | undefined, now = Date.now()): BillingState {
  if (!sub) return { expired: true, paused: true, daysLeft: 0, showBanner: true, trialing: false };
  const end = new Date(sub.current_period_end).getTime();
  const daysLeft = Math.ceil((end - now) / DAY);
  const expired = sub.status === "expired" || sub.status === "canceled" || end <= now;
  const paused = expired && end + GRACE_DAYS * DAY <= now;
  return {
    expired,
    paused,
    daysLeft,
    showBanner: expired || daysLeft < 3,
    trialing: sub.status === "trialing",
  };
}

/** Rail'dagi akkaunt avatari badge'i */
export function planBadge(planId: string | null | undefined, state: BillingState): "START" | "PRO" | "TUGAGAN" {
  if (state.expired) return "TUGAGAN";
  return planId === "pro" ? "PRO" : "START";
}

export function planPrice(plan: Pick<Plan, "price_monthly" | "price_yearly">, period: "monthly" | "yearly"): number {
  return period === "yearly" ? plan.price_yearly : plan.price_monthly;
}
