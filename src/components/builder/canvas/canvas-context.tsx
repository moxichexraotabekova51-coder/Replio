"use client";

import { createContext, useContext } from "react";
import type { FlowTrigger } from "@/lib/queries/builder";

export type CanvasData = {
  flowId: string;
  triggers: FlowTrigger[];
  stats: Record<string, { sent: number; delivered: number; clicked: number }>;
  flows: { id: string; name: string }[];
};

const Ctx = createContext<CanvasData>({ flowId: "", triggers: [], stats: {}, flows: [] });

export const CanvasDataProvider = Ctx.Provider;

export function useCanvasData() {
  return useContext(Ctx);
}
