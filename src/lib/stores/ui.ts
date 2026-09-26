"use client";

import { create } from "zustand";

type PricingState = {
  open: boolean;
  /** oldindan tanlangan tarif (masalan, "Obunani yangilash" uchun joriy tarif) */
  planId?: string;
  show: (planId?: string) => void;
  setOpen: (open: boolean) => void;
};

/** Tariflar modali — PRO tugmasi, UPGRADE badge'lari, Billing sahifasidan ochiladi */
export const usePricingModal = create<PricingState>((set) => ({
  open: false,
  planId: undefined,
  show: (planId) => set({ open: true, planId }),
  setOpen: (open) => set({ open }),
}));
