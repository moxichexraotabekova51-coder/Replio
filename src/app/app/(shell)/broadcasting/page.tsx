import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BroadcastingPage } from "@/components/broadcasting/broadcasting-page";
import { getSessionContext } from "@/lib/server/app-context";

export const metadata: Metadata = { title: "Broadcasting" };

export default async function Page() {
  const ctx = await getSessionContext();
  if (ctx.kind === "ready" && ctx.account.role === "agent") redirect("/app/inbox");
  return <BroadcastingPage />;
}
