import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({ at: z.string().datetime({ offset: true }).nullable().default(null) });

/**
 * Broadcast: "Hozir yuborish" yoki "Rejalashtirish". Flow avval publish_flow bilan kompilyatsiya qilingan bo'ladi.
 * Darhol yuborishda worker kutilmaydi — Edge Function /_worker shu yerning o'zidan uyg'otiladi (≤ 1 s birinchi xabar).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_broadcast", { p_id: id, p_at: (parsed.data.at ?? null) as unknown as string });
  if (error) {
    const code = ["not_compiled", "no_bot", "already_sent"].find((c) => error.message.includes(c)) ?? (error.code === "42501" ? "forbidden" : "failed");
    return NextResponse.json({ error: code }, { status: code === "forbidden" ? 403 : 409 });
  }
  const status = (data as { status: string }).status;
  if (status === "sending") {
    const base = (process.env.FUNCTIONS_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`).replace(/\/$/, "");
    // Javobni kutmaymiz: worker o'zi fon rejimida ishlaydi
    await fetch(`${base}/tg-webhook/_worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3_000),
    }).catch(() => undefined); // pg_cron baribir 1 soniyada uyg'otadi
  }
  return NextResponse.json({ ok: true, status });
}
