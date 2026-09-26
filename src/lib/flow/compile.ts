import type { CAction, CBlock, CompiledFlow, CStep } from "../../../supabase/functions/_shared/flow";
import { edgeFrom, MAX_BUTTONS, TEXT_LIMIT, type Draft, type DraftAction, type DraftBlock, type DraftNode } from "./draft";

export type IssueCode =
  | "no_trigger"
  | "empty_text"
  | "too_long"
  | "bad_url"
  | "empty_button"
  | "dangling_button"
  | "no_start"
  | "bad_media"
  | "empty_step"
  | "bad_percent"
  | "no_flow"
  | "bad_action"
  | "no_choices";

export type FlowIssue = { nodeId: string; blockId?: string; code: IssueCode };

const ALLOWED = /^<\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)>$|^<a href="https?:\/\/[^"<>\s]+">$|^<\/a>$/i;

/** Telegram HTML: faqat ruxsat etilgan teglar qoladi, qolgan hammasi escape qilinadi */
export function sanitizeHtml(input: string): string {
  const parts = input.split(/(<[^<>]*>)/g);
  return parts
    .map((p) => {
      if (/^<[^<>]*>$/.test(p) && ALLOWED.test(p)) return p;
      return p.replace(/&(?!(amp|lt|gt|quot);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("");
}

export function isHttpUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

function validateAction(a: DraftAction): boolean {
  switch (a.a) {
    case "add_tag":
    case "remove_tag":
      return !!a.tag_id;
    case "set_field":
    case "clear_field":
      return !!a.field_id;
    case "sub_seq":
    case "unsub_seq":
      return !!a.sequence_id;
    case "http":
      return isHttpUrl(a.url.replace(/\{\{[^}]+\}\}/g, "x"));
    default:
      return true;
  }
}

export function validateDraft(d: Draft, triggerCount: number): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (triggerCount === 0) issues.push({ nodeId: "trigger", code: "no_trigger" });
  if (!edgeFrom(d, "trigger", "then")) issues.push({ nodeId: "trigger", code: "no_start" });
  for (const n of d.nodes) {
    switch (n.type) {
      case "message":
        if (n.data.blocks.length === 0) issues.push({ nodeId: n.id, code: "empty_step" });
        for (const b of n.data.blocks) {
          if (b.type === "text") {
            if (!b.text.trim()) issues.push({ nodeId: n.id, blockId: b.id, code: "empty_text" });
            if (b.text.length > TEXT_LIMIT) issues.push({ nodeId: n.id, blockId: b.id, code: "too_long" });
            for (const btn of b.buttons.slice(0, MAX_BUTTONS)) {
              if (!btn.title.trim()) issues.push({ nodeId: n.id, blockId: b.id, code: "empty_button" });
              if (btn.kind === "url" && !isHttpUrl(btn.url)) issues.push({ nodeId: n.id, blockId: b.id, code: "bad_url" });
              if (btn.kind === "step" && !edgeFrom(d, n.id, btn.id)) issues.push({ nodeId: n.id, blockId: b.id, code: "dangling_button" });
              if (btn.kind === "flow" && !btn.flow_id) issues.push({ nodeId: n.id, blockId: b.id, code: "no_flow" });
            }
          } else if (b.type === "input" || b.type === "request") {
            if (!b.text.trim()) issues.push({ nodeId: n.id, blockId: b.id, code: "empty_text" });
            if (b.type === "input" && b.kind === "choice" && b.choices.filter((c) => c.trim()).length === 0) {
              issues.push({ nodeId: n.id, blockId: b.id, code: "no_choices" });
            }
          } else if (b.type !== "delay" && !isHttpUrl(b.url)) {
            issues.push({ nodeId: n.id, blockId: b.id, code: "bad_media" });
          }
        }
        break;
      case "action":
        if (n.data.actions.length === 0) issues.push({ nodeId: n.id, code: "empty_step" });
        for (const a of n.data.actions) if (!validateAction(a)) issues.push({ nodeId: n.id, blockId: a.id, code: "bad_action" });
        break;
      case "randomizer":
        if (n.data.variants.reduce((s, v) => s + v.pct, 0) !== 100) issues.push({ nodeId: n.id, code: "bad_percent" });
        break;
      case "start_flow":
        if (!n.data.flow_id) issues.push({ nodeId: n.id, code: "no_flow" });
        break;
    }
  }
  return issues;
}

function compileBlock(d: Draft, nodeId: string, b: DraftBlock): CBlock {
  switch (b.type) {
    case "text":
      return {
        t: "text",
        text: sanitizeHtml(b.text.slice(0, TEXT_LIMIT)),
        buttons: b.buttons.slice(0, MAX_BUTTONS).map((btn) =>
          btn.kind === "url"
            ? { title: btn.title.trim(), url: btn.url.trim() }
            : btn.kind === "flow"
              ? { title: btn.title.trim(), flow: btn.flow_id }
              : { title: btn.title.trim(), step: edgeFrom(d, nodeId, btn.id)?.target ?? null },
        ),
      };
    case "delay":
      return { t: "delay", s: Math.min(60, Math.max(1, Math.round(b.seconds))) };
    case "input":
      return {
        t: "input",
        text: sanitizeHtml(b.text),
        kind: b.kind,
        choices: b.kind === "choice" ? b.choices.map((c) => c.trim()).filter(Boolean) : undefined,
        field_id: b.field_id,
        error: b.error.trim() || undefined,
        skip: b.skip?.trim() || null,
        timeout_min: b.timeout_min,
        timeout_step: b.timeout_min ? (edgeFrom(d, nodeId, `timeout:${b.id}`)?.target ?? null) : null,
      };
    case "request":
      return { t: "request", kind: b.kind, text: sanitizeHtml(b.text), button: b.button.trim() || (b.kind === "contact" ? "📱 Raqamni yuborish" : "📍 Lokatsiyani yuborish"), field_id: b.field_id };
    default:
      return { t: b.type, url: b.url.trim(), ...(b.caption ? { caption: sanitizeHtml(b.caption) } : {}) };
  }
}

function compileAction(a: DraftAction): CAction {
  switch (a.a) {
    case "add_tag":
    case "remove_tag":
      return { a: a.a, tag_id: a.tag_id! };
    case "set_field":
      return { a: "set_field", field_id: a.field_id!, value: a.value };
    case "clear_field":
      return { a: "clear_field", field_id: a.field_id! };
    case "sub_seq":
    case "unsub_seq":
      return { a: a.a, sequence_id: a.sequence_id! };
    case "notify":
      return { a: "notify", text: sanitizeHtml(a.text) };
    case "assign":
      return { a: "assign", user_id: a.user_id };
    case "http":
      return {
        a: "http",
        method: a.method,
        url: a.url.trim(),
        headers: a.headers.filter((h) => h.key.trim()),
        body: a.body,
        map: a.map.filter((m) => m.path.trim() && m.field_id).map((m) => ({ path: m.path.trim(), field_id: m.field_id! })),
      };
    default:
      return { a: a.a } as CAction;
  }
}

function compileNode(d: Draft, n: DraftNode): CStep | null {
  const next = (h: string) => edgeFrom(d, n.id, h)?.target ?? null;
  switch (n.type) {
    case "message":
      return {
        t: "message",
        blocks: n.data.blocks.map((b) => compileBlock(d, n.id, b)),
        next: next("next"),
        ...(n.data.menu?.length ? { menu: n.data.menu.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), step: next(m.id) })) } : {}),
      };
    case "action":
      return { t: "action", actions: n.data.actions.filter(validateAction).map(compileAction), next: next("next") };
    case "condition":
      return { t: "condition", op: n.data.op, rules: n.data.rules.map(({ id: _id, ...r }) => (void _id, r)), yes: next("yes"), no: next("no") };
    case "randomizer":
      return { t: "random", variants: n.data.variants.map((v) => ({ pct: v.pct, step: next(v.id) })) };
    case "smart_delay":
      return { t: "smart_delay", amount: n.data.amount, unit: n.data.unit, business_hours: n.data.business_hours, next: next("next") };
    case "start_flow":
      return { t: "start_flow", flow_id: n.data.flow_id };
    default:
      return null;
  }
}

export function compileDraft(d: Draft): CompiledFlow {
  const steps: Record<string, CStep> = {};
  for (const n of d.nodes) {
    const s = compileNode(d, n);
    if (s) steps[n.id] = s;
  }
  return { v: 2, start: edgeFrom(d, "trigger", "then")?.target ?? null, steps };
}
