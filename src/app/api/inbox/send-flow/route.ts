import { NextResponse } from "next/server";
import { z } from "zod";
import { runFlow } from "@/lib/server/telegram";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({ contact_id: z.string().uuid(), flow_id: z.string().uuid() });

/** Live Chat ⚡: kontaktga LIVE avtomatlashtirishni yuborish */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [{ data: contact }, { data: flow }] = await Promise.all([
    supabase.from("contacts").select("id, account_id, bot_id").eq("id", parsed.data.contact_id).maybeSingle(),
    supabase.from("flows").select("id, account_id, status").eq("id", parsed.data.flow_id).maybeSingle(),
  ]);
  if (!contact || !flow || flow.account_id !== contact.account_id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (flow.status !== "live") return NextResponse.json({ error: "not_live" }, { status: 409 });
  if (!contact.bot_id) return NextResponse.json({ error: "no_bot" }, { status: 409 });
  const { data: member } = await createAdminClient()
    .from("account_members")
    .select("role")
    .eq("account_id", contact.account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || member.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await runFlow(contact.bot_id, { contact_id: contact.id, flow_id: flow.id, kind: "job" });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
