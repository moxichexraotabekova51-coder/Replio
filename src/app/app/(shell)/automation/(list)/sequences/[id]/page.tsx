import type { Metadata } from "next";
import { SequenceEditor } from "@/components/automation/sequence-editor";

export const metadata: Metadata = { title: "Sequence" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SequenceEditor id={id} />;
}
