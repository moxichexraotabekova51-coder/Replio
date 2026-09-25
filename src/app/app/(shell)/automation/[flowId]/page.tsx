import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BuilderToolbar } from "@/components/builder/builder-toolbar";
import { FlowPreview } from "@/components/builder/flow-preview";
import { getDictionary } from "@/lib/i18n";
import { getSessionContext } from "@/lib/server/app-context";
import { createClient } from "@/lib/supabase/server";
import { triggerSummary } from "@/lib/triggers";

export const metadata: Metadata = { title: "Builder" };

export default async function BuilderPage({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  if (!z.string().uuid().safeParse(flowId).success) notFound();
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") redirect("/login");
  if (ctx.account.role === "agent") redirect("/app/inbox");

  const supabase = await createClient();
  const { data: flow } = await supabase
    .from("flows")
    .select("id, name, status, has_unpublished, draft, account_id, deleted_at, triggers(type, config)")
    .eq("id", flowId)
    .maybeSingle();
  if (!flow || flow.account_id !== ctx.account.id || flow.deleted_at) notFound();

  const t = getDictionary("uz");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BuilderToolbar flow={flow} />
      <FlowPreview draft={flow.draft} triggers={flow.triggers.map((tr) => triggerSummary(t, tr.type, tr.config))} />
    </div>
  );
}
