"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#000" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.54 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.07-.16-1.52z" />
    </svg>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [sent, setSent] = useState(false);

  const schema = z.object({
    email: z.string().trim().email(t.auth.invalidEmail),
    password: z.string().min(8, t.auth.shortPassword),
  });

  async function google() {
    setBusy("google");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setBusy(null);
      setErrors({ form: t.errors.generic });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      return setErrors({ email: f.email?.[0], password: f.password?.[0] });
    }
    setErrors({});
    setBusy("email");
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) {
        setBusy(null);
        return setErrors({ form: t.auth.badCredentials });
      }
      router.replace(next);
      router.refresh();
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        data: { full_name: fullName.trim() || undefined },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(null);
    if (error) return setErrors({ form: error.message });
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="rounded-[8px] border border-border bg-bg p-6 text-center text-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border-2 border-fg text-lg">✉</div>
        {t.auth.checkEmail}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Button variant="outline" size="lg" className="w-full" onClick={google} loading={busy === "google"} disabled={busy !== null}>
        {busy !== "google" && <GoogleIcon />}
        {t.auth.google}
      </Button>
      <div className="flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-border" />
        {t.auth.or}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === "signup" && (
          <div>
            <Label htmlFor="fullName">{t.auth.fullName}</Label>
            <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={!!errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError>{errors.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            aria-invalid={!!errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError>{errors.password}</FieldError>
        </div>
        <FieldError>{errors.form}</FieldError>
        <Button type="submit" size="lg" className="w-full" loading={busy === "email"} disabled={busy !== null}>
          {mode === "login" ? t.auth.login : t.auth.signup}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? t.auth.noAccount : t.auth.haveAccount}{" "}
        <Link
          href={`${mode === "login" ? "/signup" : "/login"}${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-fg underline-offset-4 hover:underline"
        >
          {mode === "login" ? t.auth.signup : t.auth.login}
        </Link>
      </p>
      {mode === "signup" && <p className="text-center text-[12px] text-muted">{t.auth.terms}</p>}
    </div>
  );
}
