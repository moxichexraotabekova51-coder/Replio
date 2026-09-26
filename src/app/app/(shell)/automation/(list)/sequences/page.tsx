import type { Metadata } from "next";
import { SequencesPage } from "@/components/automation/sequences-page";

export const metadata: Metadata = { title: "Sequences" };

export default function Page() {
  return <SequencesPage />;
}
