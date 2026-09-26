import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PreviewInfo = { code: string; contact_id: string | null; bot_id: string | null; bot_username: string | null };

export async function previewInfo(accountId: string): Promise<PreviewInfo | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_preview", { p_account_id: accountId });
  return (data as PreviewInfo | null) ?? null;
}
