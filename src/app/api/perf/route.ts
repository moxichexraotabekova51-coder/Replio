import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const body = z.object({
  account_id: z.string().uuid().nullable(),
  entries: z
    .array(
      z.object({
        kind: z.enum(["web_vital", "nav", "api", "error"]),
        name: z.string().min(1).max(120),
        ms: z.number().min(0).max(600_000),
        meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** Brauzerdan: Web Vitals, sahifa o'tishlari, API javob vaqtlari (sendBeacon, partiyalab). RLS: faqat a'zo akkaunt. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });
  await supabase.from("perf_logs").insert(
    parsed.data.entries.map((e) => ({
      account_id: parsed.data.account_id,
      kind: e.kind,
      name: e.name,
      ms: Math.round(e.ms),
      meta: (e.meta ?? null) as Json,
    })),
  );
  return new NextResponse(null, { status: 204 });
}
