import { Zap } from "lucide-react";
import { TelegramIcon } from "@/components/brand/logo";
import type { Json } from "@/lib/supabase/database.types";

type Node = { id: string; type: string; data?: { name?: string; blocks?: { id: string; type: string; text?: string }[] } };

/** Flow'ning faqat ko'rish uchun sxemasi (to'liq builder 3-fazada) */
export function FlowPreview({ draft, triggers }: { draft: Json; triggers: { label: string; chips: string[] }[] }) {
  const nodes = ((draft as { nodes?: Node[] })?.nodes ?? []).filter((n) => n.type !== "trigger");
  return (
    <div className="flex min-h-0 flex-1 items-start gap-16 overflow-auto bg-canvas p-10 scrollbar-thin">
      <div className="w-[420px] shrink-0 rounded-[24px] border border-border bg-bg p-6 shadow-sm">
        <div className="flex items-center gap-2 text-[20px] font-semibold">
          <Zap className="size-5" />
          When...
        </div>
        <div className="mt-4 space-y-2">
          {triggers.length === 0 ? (
            <p className="text-sm text-muted">Trigger — avtomatlashtirishni boshlaydigan hodisa.</p>
          ) : (
            triggers.map((tr, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[12px] bg-bg-muted px-3 py-2.5 text-sm">
                <TelegramIcon size={18} />
                <span>{tr.label}</span>
                {tr.chips.map((c) => (
                  <code key={c} className="rounded-[4px] bg-bg px-1.5 font-sans text-[12px] font-medium">
                    {c}
                  </code>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {nodes.map((n) => (
        <div key={n.id} className="w-[380px] shrink-0 rounded-[24px] border border-border bg-bg p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <TelegramIcon size={28} />
            <div>
              <div className="text-[12px] text-muted">Telegram</div>
              <div className="text-[20px] font-semibold leading-tight">{n.data?.name ?? "Send Message"}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(n.data?.blocks ?? []).length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-border-dashed p-3 text-center text-sm text-muted">Matn qo&apos;shing</div>
            ) : (
              n.data!.blocks!.map((b) => (
                <div key={b.id} className="whitespace-pre-wrap rounded-[12px] bg-bg-muted px-3 py-2.5 text-sm">
                  {b.text ?? b.type}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
