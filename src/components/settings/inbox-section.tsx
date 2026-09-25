"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { readInboxSettings, type InboxSettings } from "@/lib/inbox-settings";
import { updateInboxSettings } from "@/lib/server/actions";
import { Card, SectionTitle } from "./section";

const AUTO_CLOSE = [0, 60, 240, 1440, 4320, 10080];
const PAUSE = [0, 15, 30, 60, 120, 1440];

export function InboxSection() {
  const t = useT();
  const app = useApp();
  const router = useRouter();
  const [s, setS] = useState<InboxSettings>(() => readInboxSettings(app.account.settings));
  const [pending, start] = useTransition();

  const label = (m: number) =>
    m === 0 ? t.settings.never : m < 60 ? fmt(t.settings.minutes, { n: m }) : m < 1440 ? fmt(t.settings.hours, { n: m / 60 }) : fmt(t.settings.days, { n: m / 1440 });

  async function requestNotify(v: boolean) {
    if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => undefined);
    }
    setS((x) => ({ ...x, notify_browser: v }));
  }

  return (
    <>
      <SectionTitle title={t.settings.inbox} />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateInboxSettings(app.account.id, s);
            if (res.error) return void toast.error(t.errors.generic);
            toast(t.common.saved);
            router.refresh();
          });
        }}
      >
        <Card className="space-y-6">
          <div>
            <Label htmlFor="is-close">{t.settings.inboxAutoClose}</Label>
            <p className="mb-2 text-[13px] text-muted">{t.settings.inboxAutoCloseDesc}</p>
            <NativeSelect id="is-close" className="max-w-xs" value={s.auto_close_minutes} onChange={(e) => setS({ ...s, auto_close_minutes: Number(e.target.value) })}>
              {AUTO_CLOSE.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="is-pause">{t.settings.inboxPause}</Label>
            <p className="mb-2 text-[13px] text-muted">{t.settings.inboxPauseDesc}</p>
            <NativeSelect id="is-pause" className="max-w-xs" value={s.pause_minutes} onChange={(e) => setS({ ...s, pause_minutes: Number(e.target.value) })}>
              {PAUSE.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </Card>
        <Card className="space-y-4">
          <h3 className="text-[15px] font-semibold">{t.settings.inboxNotifications}</h3>
          <label className="flex items-center justify-between gap-4 text-sm">
            {t.settings.inboxNotifyBrowser}
            <Switch checked={s.notify_browser} onCheckedChange={requestNotify} />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            {t.settings.inboxNotifySound}
            <Switch checked={s.notify_sound} onCheckedChange={(v) => setS({ ...s, notify_sound: v })} />
          </label>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </>
  );
}
