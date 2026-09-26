"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";

const schema = z.string().trim().min(1).max(100);

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const [name, setName] = useState(app.profile.full_name ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(name);
    if (!parsed.success) return setError(t.common.required);
    setBusy(true);
    const { error: err } = await createClient().from("profiles").update({ full_name: parsed.data }).eq("id", app.user.id);
    setBusy(false);
    if (err) return toast.error(t.errors.generic);
    toast(t.common.saved);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t.userMenu.profileTitle}</DialogTitle>
        <form onSubmit={save} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="pf-name">{t.userMenu.fullName}</Label>
            <Input
              id="pf-name"
              value={name}
              autoFocus
              aria-invalid={!!error}
              onChange={(e) => {
                setName(e.target.value);
                setError(undefined);
              }}
            />
            <FieldError>{error}</FieldError>
          </div>
          <div>
            <Label htmlFor="pf-email">{t.userMenu.email}</Label>
            <Input id="pf-email" value={app.user.email} disabled readOnly />
          </div>
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
