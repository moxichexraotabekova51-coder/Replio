import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { getDictionary } from "@/lib/i18n";
import { getSessionContext } from "@/lib/server/app-context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (ctx.kind === "ready" && ctx.account.role === "agent") redirect("/app/inbox");
  const t = getDictionary("uz");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.settings.title} />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <SettingsMenu />
        <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-[880px] px-4 py-6 md:px-11 md:py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
