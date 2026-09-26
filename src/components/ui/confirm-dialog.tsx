"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
  children,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-fg">
              <AlertTriangle className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </div>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            loading={busy}
            disabled={confirmDisabled}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
