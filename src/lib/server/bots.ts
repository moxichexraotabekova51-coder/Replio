import "server-only";
import { decryptSecret } from "@/lib/server/crypto";
import { createAdminClient } from "@/lib/supabase/server";

/** Akkauntga tegishli botning shifrlangan tokenini ochadi (faqat server). */
export async function loadBot(accountId: string, botId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bots")
    .select("id, account_id, token_encrypted, webhook_secret, username")
    .eq("id", botId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, token: await decryptSecret(data.token_encrypted) };
}
