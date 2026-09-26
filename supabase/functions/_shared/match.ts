// Trigger moslash (4-bo'lim ustuvorligi): aniq "is" > "begins with" > "contains" > Default Reply.
// Teng bo'lsa — eng oxirgi o'zgartirilgan avtomatlashtirish.
import type { Trigger } from "./flow.ts";

// O'zbek kirill → lotin (lotin↔kirill moslash uchun ikkalasini lotinga keltiramiz)
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
  щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

export function toLatin(s: string): string {
  let out = "";
  for (const ch of s) out += CYR[ch] ?? ch;
  return out;
}

/** Kichik harf, apostrof variantlari, tinish belgilari → bo'shliq, ortiqcha bo'shliqlar */
export function normalize(s: string, translit = false): string {
  let x = s.toLowerCase().normalize("NFC");
  if (translit) x = toLatin(x);
  x = x.replace(/[ʻʼ’‘`´]/g, "'");
  x = x.replace(/[^\p{L}\p{N}'\s]+/gu, " ");
  return x.replace(/\s+/g, " ").trim();
}

export type MatchInput = {
  text: string | null;         // matnli xabar (yoki null)
  isNew: boolean;              // birinchi marta yozgan kontakt
  messageType: string;         // text | photo | video | document | voice | contact | location | ...
  botUsername?: string;
};

type Kind = "is" | "begins_with" | "contains";
const RANK: Record<Kind, number> = { is: 3, begins_with: 2, contains: 1 };

function newest(a: Trigger, b: Trigger) {
  return a.updated_at >= b.updated_at ? a : b;
}

export function matchKeyword(text: string, t: Trigger): Kind | null {
  const cfg = t.config as { match?: Kind; keywords?: string[]; translit?: boolean };
  const match: Kind = cfg.match ?? "contains";
  const tr = cfg.translit !== false; // standart: lotin↔kirill moslash yoqilgan
  const msg = normalize(text, tr);
  if (!msg) return null;
  for (const raw of cfg.keywords ?? []) {
    const kw = normalize(String(raw), tr);
    if (!kw) continue;
    if (match === "is" && msg === kw) return "is";
    if (match === "begins_with" && (msg === kw || msg.startsWith(kw + " "))) return "begins_with";
    if (match === "contains" && ` ${msg} `.includes(` ${kw} `)) return "contains";
  }
  return null;
}

export type Match = { trigger: Trigger; payload?: string } | null;

export function matchTrigger(triggers: Trigger[], input: MatchInput): Match {
  const byType = (type: string) => triggers.filter((t) => t.type === type);
  const text = input.text?.trim() ?? null;

  // /start [payload]
  if (text && /^\/start(@\w+)?(\s|$)/i.test(text)) {
    const payload = text.replace(/^\/start(@\w+)?\s*/i, "").trim();
    if (payload) {
      const ref = byType("ref_url").filter((t) => String((t.config as { ref?: string }).ref ?? "") === payload);
      if (ref.length) return { trigger: ref.reduce(newest), payload };
    }
    const welcome = byType("welcome");
    if (welcome.length) return { trigger: welcome.reduce(newest), payload };
    // /start boshqa trigger bo'lmasa — "start" buyrug'i sifatida davom etadi
  }

  // /buyruq
  if (text && text.startsWith("/")) {
    const cmd = text.slice(1).split(/\s/)[0].split("@")[0].toLowerCase();
    const cmds = byType("command").filter((t) => String((t.config as { command?: string }).command ?? "").replace(/^\//, "").toLowerCase() === cmd);
    if (cmds.length) return { trigger: cmds.reduce(newest) };
  }

  // Kalit so'zlar
  if (text) {
    let best: { t: Trigger; rank: number } | null = null;
    for (const t of byType("keyword")) {
      const kind = matchKeyword(text, t);
      if (!kind) continue;
      const rank = RANK[kind];
      if (!best || rank > best.rank || (rank === best.rank && t.updated_at > best.t.updated_at)) best = { t, rank };
    }
    if (best) return { trigger: best.t };
  }

  // Matn bo'lmagan xabar turlari
  if (input.messageType !== "text") {
    const mt = byType("message_type").filter((t) => {
      const types = (t.config as { types?: string[] }).types ?? [];
      return types.length === 0 || types.includes(input.messageType);
    });
    if (mt.length) return { trigger: mt.reduce(newest) };
  }

  const def = byType("default_reply");
  if (def.length) return { trigger: def.reduce(newest) };
  return null;
}
