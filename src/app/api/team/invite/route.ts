import { NextResponse } from "next/server";
import { z } from "zod";
import { SITE_URL } from "@/lib/env";
import { getSessionContext } from "@/lib/server/app-context";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "editor", "agent", "viewer"]),
});

/** Jamoaga taklif: mavjud foydalanuvchi darhol qo'shiladi, yangisiga Supabase taklif xati yuboriladi. */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "Faqat admin taklif qila oladi" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Email noto'g'ri" }, { status: 400 });
  const { email, role } = parsed.data;
  const admin = createAdminClient();
  const accountId = ctx.account.id;

  // Tarif bo'yicha o'rinlar limiti (a'zolar + kutilayotgan takliflar)
  const [{ count: members }, { count: invites }] = await Promise.all([
    admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", accountId),
    admin.from("account_invites").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("accepted_at", null),
  ]);
  if ((members ?? 0) + (invites ?? 0) >= ctx.plan.seat_limit) {
    return NextResponse.json({ error: `Tarifingizda ${ctx.plan.seat_limit} ta jamoa a'zosi mumkin`, code: "seat_limit" }, { status: 402 });
  }

  const { data: existingId } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (existingId) {
    const { error } = await admin.from("account_members").insert({ account_id: accountId, user_id: existingId, role });
    if (error) {
      return NextResponse.json({ error: error.code === "23505" ? "Bu foydalanuvchi allaqachon jamoada" : "Qo'shib bo'lmadi" }, { status: 409 });
    }
    return NextResponse.json({ status: "added" });
  }

  const { error: invErr } = await admin
    .from("account_invites")
    .upsert({ account_id: accountId, email, role, invited_by: ctx.user.id, accepted_at: null }, { onConflict: "account_id,email" });
  if (invErr) return NextResponse.json({ error: "Taklifni saqlab bo'lmadi" }, { status: 500 });

  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/app`,
  });
  if (mailErr) console.error("invite email failed", mailErr.message);
  return NextResponse.json({ status: "invited", email_sent: !mailErr });
}
