import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getDictionary } from "@/lib/i18n";
import { getSessionContext } from "@/lib/server/app-context";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Akkaunt yaratish" };

export default async function OnboardingPage() {
  const ctx = await getSessionContext();
  if (ctx.kind === "anonymous") redirect("/login");
  const t = getDictionary("uz");
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo />
        {ctx.kind === "ready" && (
          <Link href="/app" className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Link>
        )}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:items-center md:pt-0">
        <div className="w-full max-w-[440px] rounded-[12px] border border-border bg-bg p-8 shadow-sm">
          <h1 className="text-[24px] font-semibold">{t.onboarding.title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-muted">{t.onboarding.subtitle}</p>
          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}
