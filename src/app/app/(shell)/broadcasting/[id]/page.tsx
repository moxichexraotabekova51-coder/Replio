import type { Metadata } from "next";
import { BroadcastEditor } from "@/components/broadcasting/broadcast-editor";

export const metadata: Metadata = { title: "Broadcast" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BroadcastEditor id={id} />;
}
