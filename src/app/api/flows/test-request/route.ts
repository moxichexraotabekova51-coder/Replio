import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { z } from "zod";
import { planFeatures } from "@/lib/billing";
import { getSessionContext } from "@/lib/server/app-context";

export const dynamic = "force-dynamic";

const body = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url().max(2000),
  headers: z.array(z.object({ key: z.string().max(200), value: z.string().max(4000) })).max(20),
  body: z.string().max(20_000).default(""),
});

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** External Request (Pro): builder'dagi "Test request" — ichki tarmoqqa so'rov yuborilmaydi (SSRF) */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!planFeatures(ctx.plan).external_request) return NextResponse.json({ error: "upgrade_required" }, { status: 402 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  const u = new URL(parsed.data.url);
  if (u.protocol !== "https:" && u.protocol !== "http:") return NextResponse.json({ error: "Faqat http(s)" }, { status: 400 });
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) return NextResponse.json({ status: 0, error: "Manzilga ruxsat yo'q" });

  const headers = new Headers();
  for (const h of parsed.data.headers) if (h.key.trim()) headers.set(h.key.trim(), h.value);
  if (parsed.data.method !== "GET" && !headers.has("content-type")) headers.set("content-type", "application/json");
  try {
    const res = await fetch(u, {
      method: parsed.data.method,
      headers,
      body: parsed.data.method === "GET" ? undefined : parsed.data.body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const text = (await res.text()).slice(0, 10_000);
    return NextResponse.json({ status: res.status, body: text });
  } catch {
    return NextResponse.json({ status: 0, error: "So'rov bajarilmadi (timeout yoki tarmoq xatosi)" });
  }
}
