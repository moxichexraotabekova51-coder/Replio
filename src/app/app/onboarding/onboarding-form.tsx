"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { createAccount } from "@/lib/server/actions";
import { timezones } from "@/lib/timezones";

export function OnboardingForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [tz, setTz] = useState("Asia/Tashkent");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(t.common.required);
        start(async () => {
          const res = await createAccount({ name, timezone: tz });
          if (res?.error) setError(t.errors.generic);
        });
      }}
    >
      <div>
        <Label htmlFor="acc-name">{t.onboarding.name}</Label>
        <Input
          id="acc-name"
          autoFocus
          placeholder={t.onboarding.namePlaceholder}
          value={name}
          maxLength={100}
          aria-invalid={!!error}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
        />
        <FieldError>{error}</FieldError>
      </div>
      <div>
        <Label htmlFor="acc-tz">{t.onboarding.timezone}</Label>
        <NativeSelect id="acc-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
          {timezones().map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t.onboarding.submit}
      </Button>
      <p className="text-center text-[12px] text-muted">{t.onboarding.trial}</p>
    </form>
  );
}
