"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { inboxSettingsSchema, type InboxSettings } from "@/lib/inbox-settings";
import { ACCOUNT_COOKIE } from "@/lib/server/app-context";
import { createClient } from "@/lib/supabase/server";

const cookieOpts = { path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

export async function switchAccount(accountId: string) {
  const id = z.string().uuid().parse(accountId);
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("id").eq("id", id).maybeSingle();
  if (!data) throw new Error("forbidden");
  (await cookies()).set(ACCOUNT_COOKIE, id, cookieOpts);
  redirect("/app");
}

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().min(1).max(64).default("Asia/Tashkent"),
});

export async function createAccount(input: { name: string; timezone?: string }): Promise<{ error?: string }> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_account", {
    p_name: parsed.data.name,
    p_timezone: parsed.data.timezone,
  });
  if (error || !data) return { error: error?.message ?? "failed" };
  (await cookies()).set(ACCOUNT_COOKIE, data, cookieOpts);
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACCOUNT_COOKIE);
  redirect("/login");
}

const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().min(1).max(64),
  locale: z.enum(["uz"]),
});

export async function updateAccount(accountId: string, input: z.infer<typeof accountUpdateSchema>): Promise<{ error?: string }> {
  const parsed = accountUpdateSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(accountId).success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").update(parsed.data).eq("id", accountId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  return {};
}

export async function deleteAccount(accountId: string): Promise<{ error?: string }> {
  if (!z.string().uuid().safeParse(accountId).success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").delete().eq("id", accountId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  (await cookies()).delete(ACCOUNT_COOKIE);
  redirect("/app");
}

export async function updateInboxSettings(accountId: string, input: InboxSettings): Promise<{ error?: string }> {
  const parsed = inboxSettingsSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(accountId).success) return { error: "invalid" };
  const supabase = await createClient();
  const { data: acc } = await supabase.from("accounts").select("settings").eq("id", accountId).maybeSingle();
  if (!acc) return { error: "forbidden" };
  const settings = { ...((acc.settings as Record<string, unknown>) ?? {}), inbox: parsed.data };
  const { data, error } = await supabase.from("accounts").update({ settings }).eq("id", accountId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  return {};
}
