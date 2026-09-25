import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/app-context";
import { loadBot } from "@/lib/server/bots";
import { tg } from "@/lib/server/telegram";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Botni uzish: webhook o'chiriladi, bot yozuvi o'chiriladi (kontaktlar saqlanadi). */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = z.object({ bot_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const bot = await loadBot(ctx.account.id, parsed.data.bot_id).catch(() => null);
  if (!bot) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await tg(bot.token, "deleteWebhook", { drop_pending_updates: true });
  await createAdminClient().from("bots").delete().eq("id", bot.id);
  return NextResponse.json({ ok: true });
}
