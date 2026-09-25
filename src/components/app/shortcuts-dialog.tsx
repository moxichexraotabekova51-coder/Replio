"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/provider";

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t.helpMenu.shortcutsTitle}</DialogTitle>
        <ul className="mt-5 divide-y divide-border">
          {t.shortcuts.map(([keys, desc]) => (
            <li key={keys} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="text-muted">{desc}</span>
              <kbd className="shrink-0 rounded-[4px] border border-border-strong bg-bg-subtle px-1.5 py-0.5 font-sans text-[12px] font-medium">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
