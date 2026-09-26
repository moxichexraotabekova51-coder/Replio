"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { fmt, localeNames, locales } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { deleteAccount, updateAccount } from "@/lib/server/actions";
import { timezones } from "@/lib/timezones";
import { Card, SectionTitle } from "./section";

export function GeneralSection() {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const [name, setName] = useState(app.account.name);
  const [tz, setTz] = useState(app.account.timezone);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const isOwner = app.account.owner_id === app.user.id;
  const dirty = name.trim() !== app.account.name || tz !== app.account.timezone;

  return (
    <>
      <SectionTitle title={t.settings.general} />
      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError(t.common.required);
            start(async () => {
              const res = await updateAccount(app.account.id, { name: name.trim(), timezone: tz, locale: "uz" });
              if (res.error) return void toast.error(t.errors.generic);
              toast(t.common.saved);
              router.refresh();
            });
          }}
        >
          <div>
            <Label htmlFor="gs-name">{t.settings.accountName}</Label>
            <Input id="gs-name" value={name} maxLength={100} aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(undefined); }} />
            <FieldError>{error}</FieldError>
          </div>
          <div>
            <Label htmlFor="gs-tz">{t.settings.timezone}</Label>
            <NativeSelect id="gs-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
              {timezones().map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="gs-lang">{t.settings.language}</Label>
            <NativeSelect id="gs-lang" value="uz" onChange={() => undefined}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={pending} disabled={!dirty}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </Card>

      {isOwner && (
        <Card className="mt-6 border-2 border-fg">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold">
            <span aria-hidden>⚠</span>
            {t.settings.dangerZone}
          </h3>
          <p className="mt-1.5 text-sm text-muted">{t.settings.deleteAccountDesc}</p>
          <Button variant="secondary" className="mt-4" onClick={() => setConfirmOpen(true)}>
            {t.settings.deleteAccount}
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(v) => {
          setConfirmOpen(v);
          if (!v) setConfirmText("");
        }}
        destructive
        title={t.settings.deleteAccount}
        description={fmt(t.settings.deleteAccountConfirm, { name: app.account.name })}
        confirmLabel={t.common.deleteForever}
        confirmDisabled={confirmText.trim() !== app.account.name}
        onConfirm={async () => {
          const res = await deleteAccount(app.account.id);
          if (res?.error) toast.error(t.errors.generic);
        }}
      >
        <Input className="mt-4" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={app.account.name} />
      </ConfirmDialog>
    </>
  );
}
