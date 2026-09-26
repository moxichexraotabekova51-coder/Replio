import { z } from "zod";

export const inboxSettingsSchema = z.object({
  auto_close_minutes: z.number().int().min(0).max(60 * 24 * 30), // 0 = hech qachon
  pause_minutes: z.number().int().min(0).max(60 * 24 * 7),
  notify_browser: z.boolean(),
  notify_sound: z.boolean(),
});
export type InboxSettings = z.infer<typeof inboxSettingsSchema>;

export const defaultInboxSettings: InboxSettings = {
  auto_close_minutes: 0,
  pause_minutes: 30,
  notify_browser: true,
  notify_sound: false,
};

export function readInboxSettings(settings: unknown): InboxSettings {
  const raw = (settings as { inbox?: unknown } | null)?.inbox;
  const parsed = inboxSettingsSchema.safeParse({ ...defaultInboxSettings, ...(raw as object) });
  return parsed.success ? parsed.data : defaultInboxSettings;
}
