// Builder'dagi flow (draft) modeli — flows.draft ustunida saqlanadi.
import type { CRule, InputKind } from "../../../supabase/functions/_shared/flow";

export type UrlButton = { id: string; title: string; kind: "url"; url: string };
export type StepButton = { id: string; title: string; kind: "step" };
export type FlowButton = { id: string; title: string; kind: "flow"; flow_id: string | null };
export type DraftButton = UrlButton | StepButton | FlowButton;

export type TextBlock = { id: string; type: "text"; text: string; buttons: DraftButton[] };
export type DelayBlock = { id: string; type: "delay"; seconds: number };
export type MediaType = "image" | "video" | "audio" | "file" | "gif";
export type MediaBlock = { id: string; type: MediaType; url: string; caption?: string; name?: string };
export type InputBlock = {
  id: string;
  type: "input";
  text: string;
  kind: InputKind;
  choices: string[];
  field_id: string | null;
  error: string;
  skip: string | null;
  timeout_min: number | null;
};
export type RequestBlock = { id: string; type: "request"; kind: "contact" | "location"; text: string; button: string; field_id: string | null };
export type DraftBlock = TextBlock | DelayBlock | MediaBlock | InputBlock | RequestBlock;

export type MenuItem = { id: string; title: string };

export type DraftAction =
  | { id: string; a: "add_tag" | "remove_tag"; tag_id: string | null }
  | { id: string; a: "set_field"; field_id: string | null; value: string }
  | { id: string; a: "clear_field"; field_id: string | null }
  | { id: string; a: "sub_seq" | "unsub_seq"; sequence_id: string | null }
  | { id: string; a: "notify"; text: string }
  | { id: string; a: "open_chat" }
  | { id: string; a: "assign"; user_id: string | null }
  | { id: string; a: "delete_contact" }
  | {
      id: string;
      a: "http";
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      headers: { key: string; value: string }[];
      body: string;
      map: { path: string; field_id: string | null }[];
    };

type Pos = { x: number; y: number };
export type TriggerNode = { id: string; type: "trigger"; position: Pos; data: Record<string, never> };
export type MessageNode = { id: string; type: "message"; position: Pos; data: { name: string; blocks: DraftBlock[]; menu?: MenuItem[] } };
export type ActionNode = { id: string; type: "action"; position: Pos; data: { name: string; actions: DraftAction[] } };
export type ConditionNode = { id: string; type: "condition"; position: Pos; data: { name: string; op: "and" | "or"; rules: (CRule & { id: string })[] } };
export type RandomizerNode = { id: string; type: "randomizer"; position: Pos; data: { name: string; variants: { id: string; pct: number }[] } };
export type SmartDelayNode = { id: string; type: "smart_delay"; position: Pos; data: { name: string; amount: number; unit: "minutes" | "hours" | "days"; business_hours: boolean } };
export type StartFlowNode = { id: string; type: "start_flow"; position: Pos; data: { name: string; flow_id: string | null } };
export type CommentNode = { id: string; type: "comment"; position: Pos; data: { text: string } };

export type StepNode = MessageNode | ActionNode | ConditionNode | RandomizerNode | SmartDelayNode | StartFlowNode;
export type DraftNode = TriggerNode | StepNode | CommentNode;
export type StepType = StepNode["type"] | "comment";

/** sourceHandle: "then" (trigger), "next", "yes"/"no", tugma/menyu/variant id'si, "timeout:<blockId>" */
export type DraftEdge = { id: string; source: string; sourceHandle: string; target: string };

export type Draft = { nodes: DraftNode[]; edges: DraftEdge[] };

export const TEXT_LIMIT = 2000;
export const MAX_BUTTONS = 3;

export function uid(prefix = "n"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export const STEP_NAMES: Record<StepType, string> = {
  message: "Send Message",
  action: "Actions",
  condition: "Condition",
  randomizer: "Randomizer",
  smart_delay: "Smart Delay",
  start_flow: "Start Another Automation",
  comment: "Comment",
};

export function newNode(type: StepType, position: Pos): DraftNode {
  const id = uid(type === "comment" ? "k" : "s");
  switch (type) {
    case "message":
      return { id, type, position, data: { name: STEP_NAMES.message, blocks: [] } };
    case "action":
      return { id, type, position, data: { name: STEP_NAMES.action, actions: [] } };
    case "condition":
      return { id, type, position, data: { name: STEP_NAMES.condition, op: "and", rules: [] } };
    case "randomizer":
      return { id, type, position, data: { name: STEP_NAMES.randomizer, variants: [{ id: uid("v"), pct: 50 }, { id: uid("v"), pct: 50 }] } };
    case "smart_delay":
      return { id, type, position, data: { name: STEP_NAMES.smart_delay, amount: 1, unit: "hours", business_hours: false } };
    case "start_flow":
      return { id, type, position, data: { name: STEP_NAMES.start_flow, flow_id: null } };
    case "comment":
      return { id, type, position, data: { text: "" } };
  }
}

export function emptyDraft(): Draft {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "m1", type: "message", position: { x: 700, y: 0 }, data: { name: "Send Message", blocks: [] } },
    ],
    edges: [{ id: "e1", source: "trigger", sourceHandle: "then", target: "m1" }],
  };
}

export function normalizeDraft(raw: unknown): Draft {
  const d = raw as Partial<Draft> | null;
  if (!d || !Array.isArray(d.nodes) || d.nodes.length === 0) return emptyDraft();
  const nodes = d.nodes.map((n) => {
    if (n.type !== "message") return n;
    return {
      ...n,
      data: {
        ...n.data,
        name: n.data?.name ?? "Send Message",
        blocks: (n.data?.blocks ?? []).map((b) =>
          b.type === "text" ? { ...b, text: b.text ?? "", buttons: (b.buttons ?? []).map((x) => ({ ...x, kind: x.kind ?? "step" })) } : b,
        ),
      },
    };
  }) as DraftNode[];
  if (!nodes.some((n) => n.type === "trigger")) nodes.unshift({ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} });
  return { nodes, edges: Array.isArray(d.edges) ? d.edges : [] };
}

export function edgeFrom(d: Draft, source: string, handle: string): DraftEdge | undefined {
  return d.edges.find((e) => e.source === source && e.sourceHandle === handle);
}

/** Trigger'dan boshlab "next" bo'yicha chiziqli zanjir (Basic builder uchun) */
export function linearChain(d: Draft): MessageNode[] {
  const out: MessageNode[] = [];
  const seen = new Set<string>();
  let cur = edgeFrom(d, "trigger", "then")?.target;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = d.nodes.find((n) => n.id === cur);
    if (!node || node.type !== "message") break;
    out.push(node);
    cur = edgeFrom(d, node.id, "next")?.target;
  }
  return out;
}

/** Basic builder faqat chiziqli Send Message zanjiri bo'lganda ishlaydi */
export function isLinear(d: Draft): boolean {
  const steps = d.nodes.filter((n) => n.type !== "trigger" && n.type !== "comment");
  const chain = linearChain(d);
  if (chain.length !== steps.length) return false;
  return chain.every((n) => n.data.blocks.every((b) => b.type === "text" || b.type === "delay") && !(n.data.menu?.length) && n.data.blocks.every((b) => b.type !== "text" || b.buttons.every((x) => x.kind === "url")));
}

/** Node'dan chiqadigan handle'lar ro'yxati (canvas va validatsiya uchun) */
export function sourceHandles(n: DraftNode): string[] {
  switch (n.type) {
    case "trigger":
      return ["then"];
    case "message": {
      const h: string[] = [];
      for (const b of n.data.blocks) {
        if (b.type === "text") for (const btn of b.buttons) if (btn.kind === "step") h.push(btn.id);
        if (b.type === "input" && b.timeout_min) h.push(`timeout:${b.id}`);
      }
      for (const m of n.data.menu ?? []) h.push(m.id);
      h.push("next");
      return h;
    }
    case "action":
    case "smart_delay":
      return ["next"];
    case "condition":
      return ["yes", "no"];
    case "randomizer":
      return n.data.variants.map((v) => v.id);
    default:
      return [];
  }
}
