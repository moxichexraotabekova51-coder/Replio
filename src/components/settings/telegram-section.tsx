"use client";

import { useApp } from "@/components/providers/app-provider";
import { TelegramIcon } from "@/components/brand/logo";
import { useT } from "@/lib/i18n/provider";
import { Card, SectionTitle } from "./section";

export function TelegramSection() {
  const t = useT();
  const app = useApp();
  const bot = app.bot;
  return (
    <>
      <SectionTitle title={t.settings.telegram} description={t.settings.telegramDesc} />
      <Card className="flex items-center gap-4">
        <TelegramIcon size={40} />
        {bot ? (
          <dl className="grid flex-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[13px] text-muted">{t.settings.botUsername}</dt>
              <dd className="font-semibold">@{bot.username}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">{t.settings.webhookStatus}</dt>
              <dd className="font-semibold">{bot.webhook_ok ? "✓" : "✗"}</dd>
            </div>
          </dl>
        ) : (
          <div>
            <div className="font-semibold">{t.settings.telegramNotConnected}</div>
            <div className="text-sm text-muted">{t.settings.telegramDesc}</div>
          </div>
        )}
      </Card>
    </>
  );
}
