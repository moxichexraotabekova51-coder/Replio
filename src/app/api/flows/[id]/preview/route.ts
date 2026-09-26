import { NextResponse } from "next/server";
import { z } from "zod";
import { compileDraft } from "@/lib/flow/compile";
import { normalizeDraft } from "@/lib/flow/draft";
import { getSessionContext } from "@/lib/server/app-context";
import { runFlow } from "@/lib/server/telegram";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { previewInfo as info } from "@/lib/server/preview";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/** Draft'ni (Live qilmasdan) foydalanuvchining o'z Telegram'iga yuboradi */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["admin", "editor"].includes(ctx.account.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = z.object({ restart: z.boolean().default(false) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const p = await info(ctx.account.id);
  if (!p?.bot_id) return NextResponse.json({ ok: false, error: "no_bot" });
  if (!p.contact_id) return NextResponse.json({ ok: false, error: "not_linked" });

  const supabase = await createClient();
  const { data: flow } = await supabase.from("flows").select("id, draft").eq("id", id).eq("account_id", ctx.account.id).is("deleted_at", null).maybeSingle();
  if (!flow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const compiled = compileDraft(normalizeDraft(flow.draft));
  await createAdminClient().from("flows").update({ preview_compiled: compiled as unknown as Json }).eq("id", id);
  const r = await runFlow(p.bot_id, { contact_id: p.contact_id, flow_id: id, flow: compiled, kind: "preview", reset_state: parsed.data.restart });
  return NextResponse.json(r);
}
