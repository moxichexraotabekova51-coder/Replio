import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const body = z
  .object({
    telegram_id: z.coerce.number().int().positive().optional(),
    tg_user_id: z.coerce.number().int().positive().optional(),
    contact_id: z.string().uuid().optional(),
    fields: z.record(z.string().max(64), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])).optional(),
  })
  .refine((b) => b.contact_id || b.telegram_id || b.tg_user_id, { message: "telegram_id yoki contact_id kerak" });

const STATUS: Record<string, number> = { not_found: 404, upgrade_required: 402, contact_not_found: 404 };

/**
 * External webhook trigger (Pro): POST /api/hooks/{account}/{trigger}?key=<secret>
 * Tana: { "telegram_id": 123, "fields": { "buyurtma": "A-17" } } → avtomatlashtirish shu kontakt uchun navbatga qo'yiladi.
 */
export async function POST(req: Request, { params }: { params: Promise<{ account: string; trigger: string }> }) {
  const { account, trigger } = await params;
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-replio-key") ?? "";
  if (!uuid.safeParse(account).success || !uuid.safeParse(trigger).success || !key) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "bad_request" }, { status: 400 });
  const b = parsed.data;

  const { data, error } = await createAdminClient().rpc("webhook_event", {
    p_account_id: account,
    p_trigger_id: trigger,
    p_secret: key,
    p_contact_id: (b.contact_id ?? null) as string,
    p_tg_user_id: (b.telegram_id ?? b.tg_user_id ?? null) as number,
    p_fields: (b.fields ?? null) as Json,
  });
  if (error) return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  const r = data as { ok: boolean; error?: string; contact_id?: string };
  return NextResponse.json(r, { status: r.ok ? 202 : (STATUS[r.error ?? ""] ?? 400) });
}
