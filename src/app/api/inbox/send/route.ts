import { NextResponse } from "next/server";
import { z } from "zod";
import { decryptSecret } from "@/lib/server/crypto";
import { tg } from "@/lib/server/telegram";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), contact_id: z.string().uuid(), text: z.string().trim().min(1).max(4096) }),
  z.object({ kind: z.literal("note"), contact_id: z.string().uuid(), text: z.string().trim().min(1).max(4096) }),
  z.object({
    kind: z.literal("media"),
    contact_id: z.string().uuid(),
    media: z.object({ type: z.enum(["image", "video", "audio", "file", "gif"]), url: z.string().url().max(2000), name: z.string().max(255).optional() }),
    caption: z.string().max(1024).optional(),
  }),
]);

const METHOD = {
  image: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  file: ["sendDocument", "document"],
  gif: ["sendAnimation", "animation"],
} as const;

// Ochilgan tokenlar (bot → token) — har xabarda qayta ochmaslik uchun
const tokens = new Map<string, { enc: string; token: string }>();

/** Live Chat: operator xabari (Telegram'ga) yoki ichki eslatma. Maqsad: ≤ 500 ms. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS: kontakt faqat a'zo bo'lgan akkauntda ko'rinadi
  const { data: contact } = await supabase.from("contacts").select("id, account_id, bot_id, tg_user_id, is_subscribed").eq("id", b.contact_id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: member } = await admin.from("account_members").select("role").eq("account_id", contact.account_id).eq("user_id", user.id).maybeSingle();
  if (!member || member.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (b.kind === "note") {
    const { data, error } = await admin.rpc("record_agent_message", {
      p_contact_id: contact.id,
      p_author: user.id,
      p_direction: "note",
      p_type: "text",
      p_content: { text: b.text },
      p_tg_message_id: null as unknown as number,
    });
    if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ ok: true, message: data });
  }

  if (!contact.bot_id) return NextResponse.json({ error: "no_bot" }, { status: 409 });
  let cached = tokens.get(contact.bot_id);
  const { data: bot } = await admin.from("bots").select("token_encrypted").eq("id", contact.bot_id).maybeSingle();
  if (!bot) return NextResponse.json({ error: "no_bot" }, { status: 409 });
  if (!cached || cached.enc !== bot.token_encrypted) {
    cached = { enc: bot.token_encrypted, token: await decryptSecret(bot.token_encrypted) };
    tokens.set(contact.bot_id, cached);
  }

  let method: string;
  let payload: Record<string, unknown>;
  let content: Record<string, unknown>;
  let type: string;
  if (b.kind === "text") {
    method = "sendMessage";
    payload = { chat_id: contact.tg_user_id, text: b.text };
    content = { text: b.text };
    type = "text";
  } else {
    const [m, field] = METHOD[b.media.type];
    method = m;
    payload = { chat_id: contact.tg_user_id, [field]: b.media.url, ...(b.caption ? { caption: b.caption } : {}) };
    content = { media: b.media.type, url: b.media.url, file_name: b.media.name ?? null, caption: b.caption ?? null };
    type = b.media.type;
  }

  const r = await tg<{ message_id: number }>(cached.token, method, payload);
  if (!r.ok) {
    const blocked = r.error_code === 403;
    if (blocked) await admin.from("contacts").update({ is_subscribed: false }).eq("id", contact.id);
    return NextResponse.json({ error: blocked ? "blocked" : "telegram", description: r.description }, { status: 502 });
  }
  const { data, error } = await admin.rpc("record_agent_message", {
    p_contact_id: contact.id,
    p_author: user.id,
    p_direction: "out_agent",
    p_type: type,
    p_content: content as Json,
    p_tg_message_id: r.result.message_id,
  });
  if (error) return NextResponse.json({ ok: true, message: null });
  return NextResponse.json({ ok: true, message: data });
}
