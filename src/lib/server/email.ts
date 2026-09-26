import "server-only";

/**
 * Tranzaksion email (Resend API). RESEND_API_KEY va EMAIL_FROM berilmagan bo'lsa — yuborilmaydi (false).
 * Supabase Auth emaillari (tasdiqlash, taklif) alohida — Supabase SMTP sozlamalari orqali.
 */
export async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || to.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
