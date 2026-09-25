import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/server/app-context";

export default async function SettingsIndex() {
  const ctx = await getSessionContext();
  redirect(ctx.kind === "ready" && ctx.account.role !== "admin" ? "/app/settings/tags" : "/app/settings/general");
}
