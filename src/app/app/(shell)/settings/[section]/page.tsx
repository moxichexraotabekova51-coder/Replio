import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ApiSection } from "@/components/settings/api-section";
import { BillingSection } from "@/components/settings/billing-section";
import { FieldsSection } from "@/components/settings/fields-section";
import { GeneralSection } from "@/components/settings/general-section";
import { InboxSection } from "@/components/settings/inbox-section";
import { LogsSection } from "@/components/settings/logs-section";
import { SECTIONS, type SettingsSection } from "@/components/settings/sections";
import { TagsSection } from "@/components/settings/tags-section";
import { TeamSection } from "@/components/settings/team-section";
import { TelegramSection } from "@/components/settings/telegram-section";
import { getDictionary } from "@/lib/i18n";
import { getSessionContext } from "@/lib/server/app-context";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const s = SECTIONS.find((x) => x.key === section);
  return { title: s ? `${s.label(getDictionary("uz"))} · Settings` : "Settings" };
}

export default async function SettingsSectionPage({ params }: Props) {
  const { section } = await params;
  const meta = SECTIONS.find((x) => x.key === section);
  if (!meta) notFound();
  const ctx = await getSessionContext();
  if (ctx.kind === "ready" && meta.admin && ctx.account.role !== "admin") redirect("/app/settings/tags");

  const map: Record<SettingsSection, React.ReactNode> = {
    general: <GeneralSection />,
    telegram: <TelegramSection />,
    team: <TeamSection />,
    tags: <TagsSection />,
    fields: <FieldsSection bot={false} />,
    "bot-fields": <FieldsSection bot />,
    inbox: <InboxSection />,
    billing: (
      <Suspense>
        <BillingSection />
      </Suspense>
    ),
    api: <ApiSection />,
    logs: <LogsSection />,
  };
  return <div key={meta.key}>{map[meta.key]}</div>;
}
