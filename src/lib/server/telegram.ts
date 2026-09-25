import "server-only";

// Telegram Bot API (server tomoni: ulash, tekshirish, uzish).
const API = (process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/$/, "");

export const ALLOWED_UPDATES = ["message", "edited_message", "callback_query", "my_chat_member"] as const;

export type TgResult<T> = { ok: true; result: T } | { ok: false; error_code?: number; description?: string };

export async function tg<T = unknown>(token: string, method: string, body?: unknown): Promise<TgResult<T>> {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return (await res.json()) as TgResult<T>;
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "network error" };
  }
}

export type TgUser = { id: number; is_bot: boolean; first_name: string; username?: string };
export type TgWebhookInfo = { url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number };

/** BotFather tokeni formati: 123456789:AA... */
export const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,50}$/;

export function webhookUrl(botId: string): string {
  const base = (process.env.TELEGRAM_WEBHOOK_BASE ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`).replace(/\/$/, "");
  return `${base}/tg-webhook/${botId}`;
}

export async function setWebhook(token: string, botId: string, secret: string) {
  return tg<boolean>(token, "setWebhook", {
    url: webhookUrl(botId),
    secret_token: secret,
    max_connections: 100,
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
  });
}
