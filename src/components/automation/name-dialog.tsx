"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

/** Nom kiritish / o'zgartirish modali */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  placeholder,
  maxLength = 200,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial);
      setError(undefined);
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <form
          className="mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = name.trim();
            if (!v) return setError(t.common.required);
            setBusy(true);
            try {
              await onSubmit(v);
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={busy}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
