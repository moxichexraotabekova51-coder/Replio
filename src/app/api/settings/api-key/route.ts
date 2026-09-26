import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { planFeatures } from "@/lib/billing";
import { getSessionContext } from "@/lib/server/app-context";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Yangi shaxsiy API kalit (eskisi bekor qilinadi). Kalit faqat bir marta qaytariladi, bazada — sha256 xeshi. */
export async function POST() {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!planFeatures(ctx.plan).api || ctx.billing.expired) {
    return NextResponse.json({ error: "API faqat Pro tarifida mavjud", code: "upgrade" }, { status: 402 });
  }

  const key = `rpl_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const admin = createAdminClient();
  await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("account_id", ctx.account.id).is("revoked_at", null);
  const { error } = await admin
    .from("api_keys")
    .insert({ account_id: ctx.account.id, key_hash: hash, prefix: key.slice(0, 10), created_by: ctx.user.id });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ key });
}
