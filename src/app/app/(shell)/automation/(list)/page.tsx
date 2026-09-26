import type { Metadata } from "next";
import { Suspense } from "react";
import { MyAutomations } from "@/components/automation/my-automations";

export const metadata: Metadata = { title: "My Automations" };

export default function Page() {
  return (
    <Suspense>
      <MyAutomations />
    </Suspense>
  );
}
