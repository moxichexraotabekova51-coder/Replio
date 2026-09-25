// Replio — kompilyatsiya qilingan flow formati (Next.js va Edge Function uchun umumiy, sof TS).
// Bu fayl hech narsani import qilmaydi: Deno ham, Node ham ishlata oladi.

export type CButton = { title: string; url?: string; step?: string | null };

export type CBlock =
  | { t: "text"; text: string; buttons: CButton[] }
  | { t: "delay"; s: number }
  | { t: "image" | "video" | "audio" | "file" | "gif"; url: string; caption?: string; file_id?: string };

export type CStep = { t: "message"; blocks: CBlock[]; next: string | null };

export type CompiledFlow = { v: 1; start: string | null; steps: Record<string, CStep> };

export type Trigger = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  conditions?: unknown;
  priority: number;
  flow_id: string;
  updated_at: string;
};
