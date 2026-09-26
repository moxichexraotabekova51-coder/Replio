import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BuilderPage } from "@/components/builder/builder-page";
import type { FlowDetail, FlowTrigger } from "@/lib/queries/builder";
import { getSessionContext } from "@/lib/server/app-context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Builder" };

export default async function Page({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  if (!z.string().uuid().safeParse(flowId).success) notFound();
  // Flow va triggerlar server'da parallel yuklanadi — brauzerda qo'shimcha so'rov kutilmaydi (8-bo'lim: 200 stepli flow ≤ 800 ms)
  const supabase = await createClient();
  const [ctx, flow, triggers] = await Promise.all([
    getSessionContext(),
    supabase
      .from("flows")
      .select("id, account_id, name, status, has_unpublished, published_version, draft, is_basic, basic_kind, folder_id, deleted_at")
      .eq("id", flowId)
      .maybeSingle(),
    supabase.from("triggers").select("id, type, config, conditions, secret, is_active, run_count, click_count, updated_at").eq("flow_id", flowId).order("created_at"),
  ]);
  if (ctx.kind !== "ready") redirect("/login");
  if (ctx.account.role === "agent") redirect("/app/inbox");
  return (
    <BuilderPage
      key={flowId}
      flowId={flowId}
      initialFlow={(flow.data as FlowDetail | null) ?? undefined}
      initialTriggers={(triggers.data as FlowTrigger[] | null) ?? undefined}
    />
  );
}
