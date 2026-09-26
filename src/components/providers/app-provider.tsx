"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppContext } from "@/lib/server/app-context";

const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

/** Joriy akkaunt id'si — barcha query key'lar shu bilan boshlanadi */
export function useAccountId(): string {
  return useApp().account.id;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-[8px] !border !border-border !bg-fg !text-bg !shadow-pop !text-[13px] !font-medium",
              error: "!bg-bg !text-fg !border-2 !border-fg",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export function AppProvider({ value, children }: { value: AppContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Ruxsat tekshiruvlari (UI darajasida — asosiy himoya RLS'da) */
export function usePermissions() {
  const { role } = useApp().account;
  return {
    role,
    canEdit: role === "admin" || role === "editor",
    canChat: role !== "viewer",
    isAdmin: role === "admin",
    canViewAutomation: role !== "agent",
  };
}
