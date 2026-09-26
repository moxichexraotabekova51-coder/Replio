"use client";

import { toast } from "sonner";

/** Server'da to'lov yaratib, checkout.uz sahifasiga yo'naltiradi. Muvaffaqiyatsiz bo'lsa false. */
export async function startCheckout(planId: string, period: "monthly" | "yearly"): Promise<boolean> {
  try {
    const res = await fetch("/api/checkout/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: planId, period }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      toast.error(json.error ?? "To'lovni boshlab bo'lmadi. Qayta urinib ko'ring.");
      return false;
    }
    window.location.assign(json.url);
    return true;
  } catch {
    toast.error("Tarmoq xatosi. Qayta urinib ko'ring.");
    return false;
  }
}
