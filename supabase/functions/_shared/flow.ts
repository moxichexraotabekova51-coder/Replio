// Replio — kompilyatsiya qilingan flow formati (Next.js va Edge Function uchun umumiy, sof TS).
// Bu fayl hech narsani import qilmaydi: Deno ham, Node ham ishlata oladi.

/** Inline tugma: URL, flow ichidagi step yoki boshqa avtomatlashtirish */
export type CButton = { title: string; url?: string; step?: string | null; flow?: string | null };

export type InputKind = "text" | "number" | "email" | "phone" | "date" | "choice";

export type CBlock =
  | { t: "text"; text: string; buttons: CButton[] }
  | { t: "delay"; s: number }
  | { t: "image" | "video" | "audio" | "file" | "gif"; url: string; caption?: string; file_id?: string }
  | {
      t: "input";
      text: string;
      kind: InputKind;
      choices?: string[];
      field_id?: string | null;
      error?: string;
      skip?: string | null;
      timeout_min?: number | null;
      timeout_step?: string | null;
    }
  | { t: "request"; kind: "contact" | "location"; text: string; button: string; field_id?: string | null };

export type CAction =
  | { a: "add_tag" | "remove_tag"; tag_id: string }
  | { a: "set_field"; field_id: string; value: unknown }
  | { a: "clear_field"; field_id: string }
  | { a: "sub_seq" | "unsub_seq"; sequence_id: string }
  | { a: "notify"; text: string }
  | { a: "open_chat" }
  | { a: "assign"; user_id: string | null }
  | { a: "delete_contact" }
  | {
      a: "http";
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      headers?: { key: string; value: string }[];
      body?: string;
      map?: { path: string; field_id: string }[];
    };

export type CRule =
  | { kind: "tag"; tag_id: string; neg?: boolean }
  | { kind: "field"; field_id: string; cmp: string; value?: string }
  | { kind: "system"; field: string; cmp: string; value?: string }
  | { kind: "subscribed"; cmp: "before" | "after"; value: string };

export type CMenuItem = { title: string; step: string | null };

export type CStep =
  | { t: "message"; blocks: CBlock[]; next: string | null; menu?: CMenuItem[] }
  | { t: "action"; actions: CAction[]; next: string | null }
  | { t: "condition"; op: "and" | "or"; rules: CRule[]; yes: string | null; no: string | null }
  | { t: "random"; variants: { pct: number; step: string | null }[] }
  | { t: "smart_delay"; amount: number; unit: "minutes" | "hours" | "days"; business_hours?: boolean; next: string | null }
  | { t: "start_flow"; flow_id: string | null };

export type CompiledFlow = { v: 1 | 2; start: string | null; steps: Record<string, CStep> };

export type Trigger = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  conditions?: unknown;
  priority: number;
  flow_id: string;
  updated_at: string;
};

export type InputState = {
  flow_id: string;
  step_id: string;
  block: number; // javob kelgach shu blokdan keyingisi davom etadi
  kind: InputKind | "contact" | "location";
  field_id?: string | null;
  choices?: string[];
  error?: string;
  skip?: string | null;
  attempts?: number;
};

export type BotState = {
  input?: InputState;
  menu?: { flow_id: string; items: CMenuItem[] };
};

export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  language_code?: string | null;
  is_subscribed?: boolean;
  subscribed_at?: string;
  live_chat_status?: string;
  over_limit?: boolean;
  automation_paused_until?: string | null;
  is_new?: boolean;
  state: BotState;
  tags: string[];
  fields: Record<string, unknown>;
  field_ids: Record<string, unknown>;
};
