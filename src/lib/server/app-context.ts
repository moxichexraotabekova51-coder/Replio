import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { billingState, type BillingState, type Plan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export const ACCOUNT_COOKIE = "replio_account";

export type AccountSummary = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: Enums<"member_role">;
  plan_id: string;
  bot_username: string | null;
  billing: BillingState;
};

export type AppContext = {
  user: { id: string; email: string };
  profile: { full_name: string | null; avatar_url: string | null; locale: string };
  accounts: AccountSummary[];
  account: Pick<Tables<"accounts">, "id" | "name" | "timezone" | "locale" | "settings" | "owner_id" | "avatar_url"> & {
    role: Enums<"member_role">;
  };
  subscription: Tables<"subscriptions"> | null;
  billing: BillingState;
  plan: Plan;
  plans: Plan[];
  bot: BotSummary | null;
  bots: BotSummary[];
  hasUnread: boolean;
};

export type BotSummary = {
  id: string;
  username: string;
  first_name: string | null;
  status: Enums<"bot_status">;
  webhook_ok: boolean;
  last_error: string | null;
};

export type SessionContext =
  | { kind: "anonymous" }
  | { kind: "no-account"; user: AppContext["user"]; profile: AppContext["profile"] }
  | ({ kind: "ready" } & AppContext);

/** Bitta so'rov davomida bir marta hisoblanadi (layout va sahifalar bo'lishadi). */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };

  const [profileRes, membershipsRes, plansRes] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, locale").eq("id", user.id).maybeSingle(),
    supabase
      .from("account_members")
      .select(
        "role, accounts!inner(id, name, avatar_url, timezone, locale, settings, owner_id, plan_id, created_at, subscriptions(*), bots(id, username, first_name, status, webhook_ok, last_error, created_at))",
      )
      .eq("user_id", user.id),
    supabase.from("plans").select("*").order("sort_order"),
  ]);

  const profile = {
    full_name: profileRes.data?.full_name ?? user.user_metadata?.full_name ?? null,
    avatar_url: profileRes.data?.avatar_url ?? null,
    locale: profileRes.data?.locale ?? "uz",
  };
  const u = { id: user.id, email: user.email ?? "" };

  const rows = (membershipsRes.data ?? [])
    .map((m) => ({ role: m.role, a: m.accounts }))
    .filter((r) => r.a)
    .sort((x, y) => x.a.created_at.localeCompare(y.a.created_at));

  if (rows.length === 0) return { kind: "no-account", user: u, profile };

  const accounts: AccountSummary[] = rows.map(({ role, a }) => {
    const sub = a.subscriptions ?? null;
    return {
      id: a.id,
      name: a.name,
      avatar_url: a.avatar_url,
      role,
      plan_id: sub?.plan_id ?? a.plan_id,
      bot_username: a.bots?.[0]?.username ?? null,
      billing: billingState(sub),
    };
  });

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACCOUNT_COOKIE)?.value;
  const current = rows.find((r) => r.a.id === wanted) ?? rows[0];
  const a = current.a;
  const subscription = a.subscriptions ?? null;
  const plans = plansRes.data ?? [];
  const plan = plans.find((p) => p.id === (subscription?.plan_id ?? a.plan_id)) ?? plans[0];

  const { count: unread } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("account_id", a.id)
    .eq("is_unread", true)
    .eq("live_chat_status", "open");

  const bots: BotSummary[] = [...(a.bots ?? [])]
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map((b) => ({ id: b.id, username: b.username, first_name: b.first_name, status: b.status, webhook_ok: b.webhook_ok, last_error: b.last_error }));

  return {
    kind: "ready",
    user: u,
    profile,
    accounts,
    account: {
      id: a.id,
      name: a.name,
      timezone: a.timezone,
      locale: a.locale,
      settings: a.settings,
      owner_id: a.owner_id,
      avatar_url: a.avatar_url,
      role: current.role,
    },
    subscription,
    billing: billingState(subscription),
    plan,
    plans,
    bot: bots[0] ?? null,
    bots,
    hasUnread: (unread ?? 0) > 0,
  };
});
