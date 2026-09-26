"use client";

import { useRouter } from "next/navigation";
import { usePermissions } from "@/components/providers/app-provider";
import { useDueReminders, useInboxRealtime } from "@/lib/queries/live-chat";

/** Shell darajasida: realtime obuna va eslatmalar (Inbox sahifasi ochiq bo'lmasa ham) */
export function LiveChatBridge() {
  const { canChat } = usePermissions();
  return canChat ? <Bridge /> : null;
}

function Bridge() {
  const router = useRouter();
  useInboxRealtime();
  useDueReminders((id) => router.push(`/app/inbox?c=${id}`));
  return null;
}
