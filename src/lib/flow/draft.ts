// Builder'dagi flow (draft) modeli — flows.draft ustunida saqlanadi.

export type UrlButton = { id: string; title: string; kind: "url"; url: string };
export type StepButton = { id: string; title: string; kind: "step" };
export type DraftButton = UrlButton | StepButton;

export type TextBlock = { id: string; type: "text"; text: string; buttons: DraftButton[] };
export type DelayBlock = { id: string; type: "delay"; seconds: number };
export type MediaBlock = { id: string; type: "image" | "video" | "audio" | "file" | "gif"; url: string; caption?: string };
export type DraftBlock = TextBlock | DelayBlock | MediaBlock;

export type TriggerNode = { id: string; type: "trigger"; position: { x: number; y: number }; data: Record<string, never> };
export type MessageNode = {
  id: string;
  type: "message";
  position: { x: number; y: number };
  data: { name: string; blocks: DraftBlock[] };
};
export type DraftNode = TriggerNode | MessageNode;

/** sourceHandle: "then" (trigger), "next" (step), yoki tugma id'si */
export type DraftEdge = { id: string; source: string; sourceHandle: string; target: string };

export type Draft = { nodes: DraftNode[]; edges: DraftEdge[] };

export const TEXT_LIMIT = 2000;
export const MAX_BUTTONS = 3;

export function uid(prefix = "n"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
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
  const nodes = d.nodes.map((n) =>
    n.type === "message"
      ? {
          ...n,
          data: {
            name: n.data?.name ?? "Send Message",
            blocks: (n.data?.blocks ?? []).map((b) =>
              b.type === "text" ? { ...b, text: b.text ?? "", buttons: (b.buttons ?? []).map((x) => ({ ...x, kind: x.kind ?? "step" })) } : b,
            ),
          },
        }
      : n,
  ) as DraftNode[];
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
