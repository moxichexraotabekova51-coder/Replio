import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { AutomationInnerMenu } from "@/components/automation/inner-menu";
import { getDictionary } from "@/lib/i18n";
import { getSessionContext } from "@/lib/server/app-context";

export default async function AutomationLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (ctx.kind === "ready" && ctx.account.role === "agent") redirect("/app/inbox");
  const t = getDictionary("uz");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.automation.title} />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <AutomationInnerMenu />
        <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
