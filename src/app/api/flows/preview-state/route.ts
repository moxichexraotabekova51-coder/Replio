import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/app-context";
import { previewInfo as info } from "@/lib/server/preview";

export const dynamic = "force-dynamic";

/** Preview holati: bot, ulash havolasi, foydalanuvchi Telegram'i ulanganmi */
export async function GET() {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await info(ctx.account.id);
  if (!p?.bot_id || !p.bot_username) return NextResponse.json({ bot: null });
  return NextResponse.json({
    bot: p.bot_username,
    linked: !!p.contact_id,
    link: `https://t.me/${p.bot_username}?start=preview_${p.code}`,
  });
}

