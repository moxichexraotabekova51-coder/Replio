import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const js = (body: string) =>
  new Response(body, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

/**
 * Sayt widgeti: <script async src=".../api/growth/<id>/widget"></script>
 * Har yuklanish — "ko'rish"; tugma t.me/<bot>?start=<kod> ni ochadi (bosish va obuna bot tomonida hisoblanadi).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return js("/* replio: not found */");
  const { data } = await createAdminClient().rpc("growth_view", { p_id: id });
  const w = data as { ref_code: string; bot: string | null; config: { button_text?: string; position?: string } } | null;
  if (!w?.bot) return js("/* replio: widget not found */");
  const cfg = {
    href: `https://t.me/${w.bot}?start=${encodeURIComponent(w.ref_code)}`,
    text: String(w.config?.button_text ?? "Telegram'da yozish").slice(0, 40),
    side: w.config?.position === "left" ? "left" : "right",
  };
  return js(`(function(){
  if (window.__replioWidget) return; window.__replioWidget = 1;
  var c = ${JSON.stringify(cfg)};
  var a = document.createElement("a");
  a.href = c.href; a.target = "_blank"; a.rel = "noopener";
  a.setAttribute("aria-label", c.text);
  a.style.cssText = "position:fixed;bottom:20px;" + c.side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:#000;color:#fff;font:600 14px/1 system-ui,-apple-system,sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.25)";
  a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M9.8 15.2l-.4 4.3c.6 0 .9-.3 1.2-.6l2.9-2.7 6 4.4c1.1.6 1.9.3 2.2-1l4-18.6c.4-1.6-.6-2.3-1.7-1.9L.9 8.3c-1.6.6-1.6 1.5-.3 1.9l6 1.9 13.9-8.8c.7-.4 1.3-.2.8.3"/></svg>';
  a.appendChild(document.createTextNode(c.text));
  (document.body || document.documentElement).appendChild(a);
})();`);
}
