// Flow bajarish rejasi: kompilyatsiya qilingan flow + boshlang'ich step → Telegram chaqiruvlari ro'yxati.
// Sof funksiya — tarmoqqa murojaat qilmaydi (testlash oson).
import type { CBlock, CompiledFlow } from "./flow.ts";
import { renderVars, type Vars } from "./render.ts";

export type Action =
  | { kind: "call"; method: string; payload: Record<string, unknown>; stepId: string; preview: string; type: string }
  | { kind: "wait"; ms: number; chatId: number };

const MAX_STEPS = 50; // cheksiz tsikldan himoya

const MEDIA_METHOD: Record<string, [string, string]> = {
  image: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  file: ["sendDocument", "document"],
  gif: ["sendAnimation", "animation"],
};

export function callbackData(flowId: string, stepId: string): string {
  return `f:${flowId}:${stepId}`.slice(0, 64);
}

export function parseCallback(data: string): { flowId: string; stepId: string } | null {
  const m = /^f:([0-9a-f-]{36}):(.+)$/.exec(data);
  return m ? { flowId: m[1], stepId: m[2] } : null;
}

function blockActions(b: CBlock, chatId: number, flowId: string, stepId: string, vars: Vars): Action[] {
  if (b.t === "delay") {
    const ms = Math.min(60, Math.max(1, b.s)) * 1000;
    return [
      { kind: "call", method: "sendChatAction", payload: { chat_id: chatId, action: "typing" }, stepId, preview: "", type: "action" },
      { kind: "wait", ms, chatId },
    ];
  }
  if (b.t === "text") {
    const text = renderVars(b.text, vars);
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: false },
    };
    if (b.buttons.length) {
      payload.reply_markup = {
        inline_keyboard: b.buttons.map((btn) => [
          btn.url ? { text: btn.title, url: btn.url } : { text: btn.title, callback_data: callbackData(flowId, btn.step ?? "") },
        ]),
      };
    }
    return [{ kind: "call", method: "sendMessage", payload, stepId, preview: text, type: "text" }];
  }
  const [method, field] = MEDIA_METHOD[b.t];
  const payload: Record<string, unknown> = { chat_id: chatId, [field]: b.file_id ?? b.url };
  if (b.caption) {
    payload.caption = renderVars(b.caption, vars);
    payload.parse_mode = "HTML";
  }
  return [{ kind: "call", method, payload, stepId, preview: b.caption ?? `[${b.t}]`, type: b.t }];
}

export function plan(flow: CompiledFlow, flowId: string, startStep: string | null, chatId: number, vars: Vars) {
  const actions: Action[] = [];
  const steps: string[] = [];
  let cur = startStep;
  const seen = new Set<string>();
  while (cur && flow.steps[cur] && !seen.has(cur) && steps.length < MAX_STEPS) {
    seen.add(cur);
    steps.push(cur);
    const step = flow.steps[cur];
    for (const b of step.blocks) actions.push(...blockActions(b, chatId, flowId, cur, vars));
    // Tugmali xabardan keyin avtomatik davom etmaymiz — foydalanuvchi tugmani bosadi
    const hasStepButtons = step.blocks.some((b) => b.t === "text" && b.buttons.some((x) => !x.url));
    cur = hasStepButtons ? null : step.next;
  }
  return { actions, steps };
}
