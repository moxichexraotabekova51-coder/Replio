import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/home/dashboard";
import { getSessionContext } from "@/lib/server/app-context";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await getSessionContext();
  if (ctx.kind === "ready" && ctx.account.role === "agent") redirect("/app/inbox");
  return <Dashboard />;
}
