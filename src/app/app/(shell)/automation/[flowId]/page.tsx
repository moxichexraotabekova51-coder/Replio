import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BuilderPage } from "@/components/builder/builder-page";
import { getSessionContext } from "@/lib/server/app-context";

export const metadata: Metadata = { title: "Builder" };

export default async function Page({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  if (!z.string().uuid().safeParse(flowId).success) notFound();
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") redirect("/login");
  if (ctx.account.role === "agent") redirect("/app/inbox");
  return <BuilderPage key={flowId} flowId={flowId} />;
}
