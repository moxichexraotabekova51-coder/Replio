"use client";

import { ChevronDown, Copy, ExternalLink, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/provider";
import { usePreviewState } from "@/lib/queries/builder";
import { cn } from "@/lib/utils";

/** Toolbar: Preview + ⌄ — draft'ni Live qilmasdan o'z Telegram'ingizda sinash */
export function PreviewButton({ flowId, flush }: { flowId: string; flush: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const state = usePreviewState(dialog || menuOpen);

  async function run(restart = false) {
    setBusy(true);
    try {
      await flush();
      const res = await fetch(`/api/flows/${flowId}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restart }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (json.ok) {
        setDialog(false);
        toast(t.builder.previewSent);
      } else if (json.error === "not_linked" || json.error === "no_bot") {
        await state.refetch();
        setDialog(true);
      } else {
        toast.error(t.errors.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex h-12 overflow-hidden rounded-[6px] border border-border-strong bg-bg">
        <button onClick={() => void run()} disabled={busy} className="flex items-center gap-2 px-4 text-sm font-medium hover:bg-bg-muted disabled:opacity-60" data-testid="preview">
          <Send className="size-4" />
          {t.builder.preview}
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="flex w-9 items-center justify-center border-l border-border-strong hover:bg-bg-muted" aria-label={`${t.builder.preview} — ${t.builder.moreActions}`}>
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onSelect={() => void run(true)}>
              <RotateCcw />
              {t.builder.previewRestart}
            </DropdownMenuItem>
            {state.data?.link && (
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(state.data!.link!);
                  toast(t.common.copied);
                }}
              >
                <Copy />
                {t.builder.previewCopyLink}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-sm text-center">
          <DialogTitle>{t.builder.previewTitle}</DialogTitle>
          {state.data && !state.data.bot ? (
            <>
              <DialogDescription>{t.builder.previewNoBot}</DialogDescription>
              <Link href="/app/settings/telegram" className={cn(buttonVariants(), "mt-4 w-full")}>
                Telegram
              </Link>
            </>
          ) : (
            <>
              <DialogDescription>{t.builder.previewConnect}</DialogDescription>
              {state.data?.link && <Qr value={state.data.link} />}
              {state.data?.link && (
                <a href={state.data.link} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                  <ExternalLink className="size-4" />
                  {t.builder.previewOpen} @{state.data.bot}
                </a>
              )}
              <Button className="mt-2 w-full" onClick={() => void run()} loading={busy}>
                {t.builder.previewCheck}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 220, color: { dark: "#000000", light: "#ffffff" } }).then(setSrc, () => setSrc(null));
  }, [value]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR" width={220} height={220} className="mx-auto my-4" /> : <div className="mx-auto my-4 size-[220px] animate-pulse rounded bg-bg-muted" />;
}
