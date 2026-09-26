"use client";

import { Check, ExternalLink, RefreshCw, Unplug, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { TelegramIcon } from "@/components/brand/logo";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import type { BotSummary } from "@/lib/server/app-context";
import { cn } from "@/lib/utils";
import { Card, SectionTitle } from "./section";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : { error: "Tarmoq xatosi" };
  return { ok: !!res?.ok, json: json as Record<string, unknown> };
}

export function TelegramSection() {
  const t = useT();
  const app = useApp();
  const canConnect = app.bots.length < app.plan.bot_limit;

  return (
    <>
      <SectionTitle title={t.settings.telegram} description={fmt(t.settings.botLimit, { n: app.plan.bot_limit })} />
      <div className="space-y-4">
        {app.bots.map((b) => (
          <BotCard key={b.id} bot={b} />
        ))}
        {canConnect && <ConnectForm first={app.bots.length === 0} />}
      </div>
    </>
  );
}

function BotCard({ bot }: { bot: BotSummary }) {
  const t = useT();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ok = bot.webhook_ok && bot.status === "connected";

  async function check() {
    setChecking(true);
    const { json } = await post("/api/telegram/check", { bot_id: bot.id });
    setChecking(false);
    if (json.ok) toast(t.settings.checkOk);
    else toast.error(String(json.error ?? t.settings.webhookFail));
    router.refresh();
  }

  return (
    <Card className="flex flex-wrap items-center gap-4">
      <TelegramIcon size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold">{bot.first_name ?? bot.username}</div>
        <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg hover:underline">
          @{bot.username}
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <div className={cn("flex items-center gap-1.5 text-sm font-medium", !ok && "rounded-[6px] border-2 border-fg px-2 py-1")}>
        {ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
        {ok ? t.settings.webhookOk : t.settings.webhookFail}
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" onClick={check} loading={checking}>
          <RefreshCw className="size-4" />
          {t.settings.checkConnection}
        </Button>
        <Button variant="outline" onClick={() => setConfirm(true)}>
          <Unplug className="size-4" />
          {t.settings.disconnect}
        </Button>
      </div>
      {bot.last_error && <p className="w-full text-[13px] font-medium">⚠ {bot.last_error}</p>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={t.settings.disconnect}
        description={fmt(t.settings.disconnectConfirm, { name: bot.username })}
        confirmLabel={t.settings.disconnect}
        onConfirm={async () => {
          const { ok: done } = await post("/api/telegram/disconnect", { bot_id: bot.id });
          if (!done) toast.error(t.errors.generic);
          router.refresh();
        }}
      />
    </Card>
  );
}

function ConnectForm({ first }: { first: boolean }) {
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <div className="flex items-center gap-3">
        <TelegramIcon size={32} />
        <h3 className="text-[16px] font-semibold">{first ? t.settings.telegramNotConnected : t.settings.connectAnother}</h3>
      </div>
      <form
        className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!/^\d{5,15}:[A-Za-z0-9_-]{30,50}$/.test(token.trim())) return setError("Token formati noto'g'ri");
          setBusy(true);
          const { ok, json } = await post("/api/telegram/connect", { token: token.trim() });
          setBusy(false);
          if (!ok) return setError(String(json.error ?? t.errors.generic));
          setToken("");
          toast(t.settings.connected);
          router.refresh();
        }}
      >
        <div>
          <Label htmlFor="bot-token">{t.settings.botToken}</Label>
          <Input
            id="bot-token"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.settings.botTokenPlaceholder}
            value={token}
            aria-invalid={!!error}
            onChange={(e) => {
              setToken(e.target.value);
              setError(undefined);
            }}
            className="font-mono text-[13px]"
          />
        </div>
        <Button type="submit" loading={busy}>
          {busy ? t.settings.connecting : t.settings.connectBot}
        </Button>
      </form>
      <FieldError>{error}</FieldError>
      <div className="mt-5 rounded-[8px] bg-bg-subtle p-4 text-sm">
        <div className="font-medium">{t.settings.howToTitle}</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
              {t.settings.howTo1}
            </a>
          </li>
          <li>{t.settings.howTo2}</li>
          <li>{t.settings.howTo3}</li>
        </ol>
      </div>
    </Card>
  );
}
