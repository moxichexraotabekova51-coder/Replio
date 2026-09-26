import type { Metadata } from "next";
import { BasicPage } from "@/components/automation/basic-page";

export const metadata: Metadata = { title: "Basic" };

export default function Page() {
  return <BasicPage />;
}
