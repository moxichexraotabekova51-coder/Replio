import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionBanner } from "@/components/app/banner";
import { MobileBottomNav, MobileTopBar } from "@/components/app/mobile-nav";
import { PricingDialog } from "@/components/app/pricing-dialog";
import { Rail } from "@/components/app/rail";
import { PerfReporter } from "@/components/app/perf-reporter";
import { LiveChatBridge } from "@/components/inbox/live-chat-bridge";
import { AppProvider } from "@/components/providers/app-provider";
import { getSessionContext } from "@/lib/server/app-context";

export const metadata: Metadata = { robots: { index: false } };

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (ctx.kind === "anonymous") redirect("/login");
  if (ctx.kind === "no-account") redirect("/app/onboarding");
  const { kind: _kind, ...app } = ctx;
  void _kind;

  return (
    <AppProvider value={app}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <SubscriptionBanner />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</main>
          <MobileBottomNav />
        </div>
      </div>
      <PricingDialog />
      <LiveChatBridge />
      <PerfReporter />
    </AppProvider>
  );
}
