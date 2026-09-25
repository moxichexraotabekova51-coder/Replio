import type { CBlock, CompiledFlow, CStep } from "../../../supabase/functions/_shared/flow";
import { edgeFrom, MAX_BUTTONS, TEXT_LIMIT, type Draft, type DraftBlock } from "./draft";

export type FlowIssue = { nodeId: string; blockId?: string; code: "no_trigger" | "empty_step" | "empty_text" | "too_long" | "bad_url" | "empty_button" | "dangling_button" | "no_start" | "bad_media" };

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

export function validateDraft(d: Draft, triggerCount: number): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (triggerCount === 0) issues.push({ nodeId: "trigger", code: "no_trigger" });
  const start = edgeFrom(d, "trigger", "then")?.target;
  if (!start) issues.push({ nodeId: "trigger", code: "no_start" });
  for (const n of d.nodes) {
    if (n.type !== "message") continue;
    if (n.data.blocks.length === 0) issues.push({ nodeId: n.id, code: "empty_step" });
    for (const b of n.data.blocks) {
      if (b.type === "text") {
        if (!b.text.trim()) issues.push({ nodeId: n.id, blockId: b.id, code: "empty_text" });
        if (b.text.length > TEXT_LIMIT) issues.push({ nodeId: n.id, blockId: b.id, code: "too_long" });
        for (const btn of b.buttons.slice(0, MAX_BUTTONS)) {
          if (!btn.title.trim()) issues.push({ nodeId: n.id, blockId: b.id, code: "empty_button" });
          if (btn.kind === "url" && !isHttpUrl(btn.url)) issues.push({ nodeId: n.id, blockId: b.id, code: "bad_url" });
          if (btn.kind === "step" && !edgeFrom(d, n.id, btn.id)) issues.push({ nodeId: n.id, blockId: b.id, code: "dangling_button" });
        }
      } else if (b.type !== "delay" && !isHttpUrl(b.url)) {
        issues.push({ nodeId: n.id, blockId: b.id, code: "bad_media" });
      }
    }
  }
  return issues;
}

function compileBlock(d: Draft, nodeId: string, b: DraftBlock): CBlock {
  if (b.type === "text") {
    return {
      t: "text",
      text: sanitizeHtml(b.text.slice(0, TEXT_LIMIT)),
      buttons: b.buttons.slice(0, MAX_BUTTONS).map((btn) =>
        btn.kind === "url" ? { title: btn.title.trim(), url: btn.url.trim() } : { title: btn.title.trim(), step: edgeFrom(d, nodeId, btn.id)?.target ?? null },
      ),
    };
  }
  if (b.type === "delay") return { t: "delay", s: Math.min(60, Math.max(1, Math.round(b.seconds))) };
  return { t: b.type, url: b.url.trim(), ...(b.caption ? { caption: sanitizeHtml(b.caption) } : {}) };
}

export function compileDraft(d: Draft): CompiledFlow {
  const steps: Record<string, CStep> = {};
  for (const n of d.nodes) {
    if (n.type !== "message") continue;
    steps[n.id] = { t: "message", blocks: n.data.blocks.map((b) => compileBlock(d, n.id, b)), next: edgeFrom(d, n.id, "next")?.target ?? null };
  }
  return { v: 1, start: edgeFrom(d, "trigger", "then")?.target ?? null, steps };
}
