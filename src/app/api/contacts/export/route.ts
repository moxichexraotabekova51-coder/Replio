import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/app-context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const body = z.object({
  filter: z.object({ op: z.enum(["and", "or"]), rules: z.array(z.record(z.string(), z.unknown())).max(20) }),
  search: z.string().max(100).default(""),
  ids: z.array(z.string().uuid()).max(100_000).nullable(),
});

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // CSV injection'dan himoya (Excel formulalari)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Kontaktlarni CSV'ga eksport (joriy filtr yoki tanlangan kontaktlar) */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contacts_export", {
    p_account_id: ctx.account.id,
    p_filter: parsed.data.filter as unknown as Json,
    p_search: parsed.data.search || undefined,
  });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const ids = parsed.data.ids ? new Set(parsed.data.ids) : null;
  const rows = (data ?? []).filter((r) => !ids || ids.has(r.id));
  const fieldNames = [...new Set(rows.flatMap((r) => Object.keys((r.fields as Record<string, unknown>) ?? {})))].sort();
  const header = ["telegram_id", "first_name", "last_name", "username", "language", "subscribed_at", "last_activity", "subscribed", "tags", ...fieldNames];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const f = (r.fields as Record<string, unknown>) ?? {};
    lines.push(
      [r.tg_user_id, r.first_name, r.last_name, r.username, r.language_code, r.subscribed_at, r.last_interaction_at, r.is_subscribed, r.tags, ...fieldNames.map((n) => f[n])]
        .map(cell)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM — Excel UTF-8'ni to'g'ri ochishi uchun
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="replio-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
