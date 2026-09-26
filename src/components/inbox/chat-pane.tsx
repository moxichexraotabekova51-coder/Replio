"use client";

import {
  AlarmClock,
  ArrowLeft,
  Check,
  Heart,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Send,
  Smile,
  StickyNote,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ContactDrawer, ContactProfile } from "@/components/contacts/contact-drawer";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { planFeatures } from "@/lib/billing";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useFlows } from "@/lib/queries/automation";
import { displayName, useLabels, useMembers, useMessages, useToggleLabel, useUpdateConversations, type Conversation, type Message } from "@/lib/queries/inbox";
import { useAssign, useContactReminder, usePauseAutomation, useSendFlow, useSendMessage } from "@/lib/queries/live-chat";
import { usePricingModal } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const PANEL_KEY = "replio.inbox.panel";

export function ChatPane({ contact, onBack, tz }: { contact: Conversation; onBack: () => void; tz: string }) {
  const t = useT();
  const perms = usePermissions();
  const messages = useMessages(contact.id);
  const labels = useLabels();
  const update = useUpdateConversations();
  const toggleLabel = useToggleLabel();
  const bottom = useRef<HTMLDivElement>(null);
  const name = displayName(contact);
  const favorites = labels.data?.find((l) => l.is_default);
  const isFav = !!favorites && contact.contact_labels.some((l) => l.label_id === favorites.id);
  const [panel, setPanel] = useState(true);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      setPanel(localStorage.getItem(PANEL_KEY) !== "0");
    } catch {
      /* e'tiborsiz */
    }
  }, []);
  const togglePanel = () => {
    // Keng ekran (2xl) — yon panel; kichikroq — drawer
    if (!window.matchMedia("(min-width: 1536px)").matches) return setDrawer(true);
    setPanel((v) => {
      try {
        localStorage.setItem(PANEL_KEY, v ? "0" : "1");
      } catch {
        /* e'tiborsiz */
      }
      return !v;
    });
  };

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length, contact.id]);

  // Ochiq suhbatga kelgan yangi xabar — darhol o'qilgan (sahifa ko'rinib turganda)
  const unread = contact.is_unread;
  const markRead = update.mutate;
  useEffect(() => {
    if (unread && perms.canChat && !document.hidden) markRead({ ids: [contact.id], patch: { is_unread: false } });
  }, [unread, contact.id, perms.canChat, markRead]);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg" data-testid="chat-pane">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <button onClick={onBack} className="flex size-9 items-center justify-center rounded-[6px] hover:bg-bg-muted md:hidden" aria-label={t.common.back}>
            <ArrowLeft className="size-5" />
          </button>
          <Avatar src={contact.avatar_url} name={name} size={36} silhouette={!contact.avatar_url} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{name}</div>
            {contact.username && <div className="truncate text-[12px] text-muted">@{contact.username}</div>}
          </div>
          {perms.canChat && (
            <div className="flex items-center gap-1.5">
              <AssignButton contact={contact} />
              <ReminderButton contact={contact} tz={tz} />
              {favorites && (
                <button
                  onClick={() => toggleLabel.mutate({ ids: [contact.id], labelId: favorites.id, on: !isFav })}
                  className={cn("flex size-9 items-center justify-center rounded-[6px] border border-border hover:border-fg", isFav && "border-fg")}
                  aria-pressed={isFav}
                  aria-label={t.inbox.addFavorite}
                  title={t.inbox.addFavorite}
                >
                  <Heart className="size-4" fill={isFav ? "currentColor" : "none"} />
                </button>
              )}
              {contact.live_chat_status === "open" ? (
                <Button variant="outline" size="sm" className="h-9" onClick={() => update.mutate({ ids: [contact.id], patch: { live_chat_status: "closed" } })}>
                  <XCircle className="size-4" />
                  <span className="max-sm:hidden">{t.inbox.close}</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-9" onClick={() => update.mutate({ ids: [contact.id], patch: { live_chat_status: "open" } })}>
                  <RotateCcw className="size-4" />
                  <span className="max-sm:hidden">{t.inbox.reopen}</span>
                </Button>
              )}
            </div>
          )}
          <button
            onClick={togglePanel}
            className="flex size-9 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
            aria-label={t.contacts.profile}
            title={t.contacts.profile}
          >
            {panel ? <PanelRightClose className="size-5" /> : <PanelRightOpen className="size-5" />}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-subtle px-4 py-6 scrollbar-thin">
          {messages.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
            </div>
          ) : messages.data?.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">{t.inbox.noMessages}</p>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-2" data-testid="messages">
              {messages.data?.map((m) => <Bubble key={m.id} m={m} tz={tz} />)}
            </div>
          )}
          <div ref={bottom} />
        </div>
        {perms.canChat && <Composer contact={contact} />}
      </section>
      {panel && (
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-bg 2xl:flex" aria-label={t.contacts.profile}>
          <ContactProfile id={contact.id} variant="panel" extra={perms.canChat ? <PauseAutomation contact={contact} tz={tz} /> : null} />
        </aside>
      )}
      <ContactDrawer
        contactId={drawer ? contact.id : null}
        onClose={() => setDrawer(false)}
        compact
        extra={perms.canChat ? <PauseAutomation contact={contact} tz={tz} /> : null}
      />
    </div>
  );
}

function Bubble({ m, tz }: { m: Message; tz: string }) {
  const t = useT();
  const c = m.content ?? {};
  const isImage = (m.type === "image" || m.type === "photo" || m.type === "gif") && c.url;
  const text = c.text ?? c.caption ?? (c.file_name ? `📎 ${c.file_name}` : isImage ? "" : `[${m.type}]`);
  const incoming = m.direction === "in";
  const pending = m.id.startsWith("temp-");
  return (
    <div className={cn("flex", incoming ? "justify-start" : "justify-end")} data-direction={m.direction}>
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap break-words rounded-[12px] px-3.5 py-2 text-sm",
          incoming && "border border-border bg-bg",
          m.direction === "out_bot" && "bg-bg-muted",
          m.direction === "out_agent" && "bg-fg text-bg",
          m.direction === "note" && "border border-dashed border-border-dashed bg-bg italic",
          m.failed && "opacity-60",
        )}
      >
        {m.direction === "note" && <div className="mb-0.5 text-[11px] font-semibold not-italic text-muted">{t.inbox.note}</div>}
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.url} alt="" className="mb-1 max-h-60 rounded-[8px]" />
        )}
        {text}
        <div className={cn("mt-1 text-right text-[11px]", m.direction === "out_agent" ? "text-white/60" : "text-muted")}>
          {m.failed ? `⚠ ${t.inbox.failed}` : pending ? t.inbox.sending : formatDate(m.created_at, tz, true)}
        </div>
      </div>
    </div>
  );
}

const EMOJIS = "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 🙂 😉 😢 😭 😡 🙏 👍 👎 👌 👏 🙌 💪 🤝 👋 ❤️ 🔥 ✨ 🎉 🎁 ✅ ❌ ⚡ 📦 🚚 💳 💰 📞 📍 ⏰ 📅 ⭐ 💯 🤗 😇 🥳 😴 🤷 🙋".split(" ");

function mediaType(file: File): "image" | "video" | "audio" | "file" | "gif" {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function Composer({ contact }: { contact: Conversation }) {
  const t = useT();
  const app = useApp();
  const send = useSendMessage(contact.id);
  const sendFlow = useSendFlow(contact.id);
  const flows = useFlows();
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowQ, setFlowQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const blocked = contact.is_subscribed === false;
  const live = useMemo(
    () => (flows.data ?? []).filter((f) => f.status === "live" && f.name.toLowerCase().includes(flowQ.toLowerCase())),
    [flows.data, flowQ],
  );

  function submit() {
    const v = text.trim();
    if (!v) return;
    if (blocked && !note) return void toast.error(t.inbox.blocked);
    send.mutate({ kind: note ? "note" : "text", text: v });
    setText("");
    area.current?.focus();
  }

  async function upload(file: File) {
    if (file.size > 50 * 1024 * 1024) return void toast.error(t.builder.fileTooBig);
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const path = `${app.account.id}/inbox/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type || undefined });
    setUploading(false);
    if (error) return void toast.error(t.errors.generic);
    const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
    send.mutate({ kind: "media", media: { type: mediaType(file), url, name: file.name }, caption: text.trim() || undefined });
    setText("");
  }

  return (
    <div className={cn("shrink-0 border-t border-border bg-bg p-3", note && "bg-bg-subtle")}>
      {blocked && !note && <p className="mb-2 text-[13px] font-medium">⚠ {t.inbox.unsubscribedBanner}</p>}
      <div className="mb-2 flex gap-1 text-[13px]">
        <button onClick={() => setNote(false)} aria-pressed={!note} className={cn("h-7 rounded-[6px] px-2.5 font-medium", !note ? "bg-fg text-bg" : "text-muted hover:bg-bg-muted")}>
          {t.inbox.replyMode}
        </button>
        <button onClick={() => setNote(true)} aria-pressed={note} className={cn("flex h-7 items-center gap-1 rounded-[6px] px-2.5 font-medium", note ? "bg-fg text-bg" : "text-muted hover:bg-bg-muted")}>
          <StickyNote className="size-3.5" />
          {t.inbox.noteMode}
        </button>
      </div>
      <textarea
        ref={area}
        value={text}
        rows={2}
        maxLength={4096}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={note ? t.inbox.notePlaceholder : t.inbox.composerPlaceholder}
        aria-label={note ? t.inbox.notePlaceholder : t.inbox.composerPlaceholder}
        className="block max-h-40 min-h-[44px] w-full resize-y bg-transparent text-sm outline-none placeholder:text-muted"
      />
      <div className="mt-2 flex items-center gap-1">
        {!note && (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid="chat-file" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || blocked}
              className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg disabled:opacity-40"
              aria-label={t.inbox.attach}
              title={t.inbox.attach}
            >
              {uploading ? <Spinner className="size-4" /> : <Paperclip className="size-[18px]" />}
            </button>
          </>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.inbox.emoji} title={t.inbox.emoji}>
              <Smile className="size-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="grid w-72 grid-cols-8 gap-0.5 p-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setText((x) => x + e);
                  area.current?.focus();
                }}
                className="flex size-8 items-center justify-center rounded-[6px] text-lg hover:bg-bg-muted"
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {!note && (
          <Popover open={flowOpen} onOpenChange={setFlowOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={blocked}
                className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg disabled:opacity-40"
                aria-label={t.inbox.sendFlow}
                title={t.inbox.sendFlow}
              >
                <Zap className="size-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-80 p-2">
              <Input value={flowQ} onChange={(e) => setFlowQ(e.target.value)} placeholder={t.common.search} aria-label={t.common.search} className="mb-2 h-9" />
              <div className="max-h-64 overflow-y-auto">
                {live.length === 0 && <p className="px-2 py-3 text-sm text-muted">{t.inbox.noLiveFlows}</p>}
                {live.map((f) => (
                  <button
                    key={f.id}
                    role="menuitem"
                    onClick={() => {
                      setFlowOpen(false);
                      sendFlow.mutate(f.id, { onSuccess: () => toast(t.inbox.flowSent) });
                    }}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm hover:bg-bg-muted"
                  >
                    <Zap className="size-4 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <div className="ml-auto">
          <Button size="sm" className="h-9" onClick={submit} disabled={!text.trim() || (blocked && !note)}>
            {note ? <StickyNote className="size-4" /> : <Send className="size-4" />}
            {note ? t.inbox.noteMode : t.inbox.send}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssignButton({ contact }: { contact: Conversation }) {
  const t = useT();
  const app = useApp();
  const members = useMembers();
  const assign = useAssign();
  const showPricing = usePricingModal((s) => s.show);
  const pro = !!planFeatures(app.plan).live_chat_assign;
  const current = members.data?.find((m) => m.user_id === contact.assigned_to);
  const label = current ? (current.user_id === app.user.id ? t.inbox.me : (current.profile?.full_name ?? "—")) : t.inbox.assign;

  if (!pro) {
    return (
      <Button variant="outline" size="sm" className="h-9" onClick={() => showPricing("pro")}>
        <UserRound className="size-4" />
        <span className="max-sm:hidden">{t.inbox.assign}</span>
        <span className="rounded-[4px] bg-fg px-1 text-[9px] font-bold text-bg">{t.builder.upgradeBadge}</span>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 max-w-[180px]" aria-label={t.inbox.assignTo}>
          <UserRound className="size-4 shrink-0" />
          <span className="truncate max-sm:hidden">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {members.data?.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => assign.mutate({ ids: [contact.id], userId: m.user_id })}>
            <Avatar src={m.profile?.avatar_url ?? null} name={m.profile?.full_name ?? "?"} size={20} />
            <span className="flex-1 truncate">
              {m.profile?.full_name ?? "—"}
              {m.user_id === app.user.id && ` (${t.inbox.me})`}
            </span>
            {m.user_id === contact.assigned_to && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        {contact.assigned_to && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => assign.mutate({ ids: [contact.id], userId: null })}>{t.inbox.unassign}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function presetTimes(tz: string) {
  const now = new Date();
  // Akkaunt vaqt mintaqasidagi "ertaga 09:00" va "keyingi dushanba 09:00"
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const localMidnightUtc = (daysAhead: number) => {
    const base = new Date(`${get("year")}-${get("month")}-${get("day")}T09:00:00Z`);
    base.setUTCDate(base.getUTCDate() + daysAhead);
    // tz ofsetini hisoblash
    const asTz = new Date(base.toLocaleString("en-US", { timeZone: tz }));
    const asUtc = new Date(base.toLocaleString("en-US", { timeZone: "UTC" }));
    return new Date(base.getTime() - (asTz.getTime() - asUtc.getTime()));
  };
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const toMonday = ((8 - wd) % 7) || 7;
  return [
    { key: "remind1h", at: new Date(now.getTime() + 3_600_000) },
    { key: "remind3h", at: new Date(now.getTime() + 3 * 3_600_000) },
    { key: "remindTomorrow", at: localMidnightUtc(1) },
    { key: "remindNextWeek", at: localMidnightUtc(toMonday) },
  ] as const;
}

function ReminderButton({ contact, tz }: { contact: Conversation; tz: string }) {
  const t = useT();
  const { q, set, done } = useContactReminder(contact.id);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const r = q.data;
  const pick = (at: Date) => {
    set.mutate(at, { onSuccess: () => toast(fmt(t.inbox.remindSet, { time: formatDate(at.toISOString(), tz, true) })) });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn("flex h-9 items-center gap-1.5 rounded-[6px] border border-border px-2.5 text-[13px] font-medium hover:border-fg", r && "border-fg")}
          aria-label={t.inbox.reminder}
          title={r ? fmt(t.inbox.remindActive, { time: formatDate(r.remind_at, tz, true) }) : t.inbox.reminder}
        >
          <AlarmClock className="size-4" />
          {r && <span className="hidden 2xl:inline">{formatDate(r.remind_at, tz, true)}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="px-2 pb-1 pt-1 text-[12px] font-semibold uppercase text-muted">{t.inbox.remindIn}</div>
        {presetTimes(tz).map((p) => (
          <button key={p.key} role="menuitem" onClick={() => pick(p.at)} className="flex h-9 w-full items-center rounded-[6px] px-2 text-left text-sm hover:bg-bg-muted">
            {t.inbox[p.key]}
          </button>
        ))}
        <div className="mt-1 border-t border-border px-2 pt-2">
          <div className="mb-1 text-[12px] text-muted">{t.inbox.remindCustom}</div>
          <div className="flex gap-1.5">
            <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-9 text-[13px]" aria-label={t.inbox.remindCustom} />
            <Button size="sm" className="h-9" disabled={!custom} onClick={() => pick(new Date(custom))} aria-label={t.common.save}>
              <Check className="size-4" />
            </Button>
          </div>
        </div>
        {r && (
          <button
            role="menuitem"
            onClick={() => {
              done.mutate(r.id);
              setOpen(false);
            }}
            className="mt-1 flex h-9 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm font-medium hover:bg-bg-muted"
          >
            <Check className="size-4" />
            {t.inbox.remindDone}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PauseAutomation({ contact, tz }: { contact: Conversation; tz: string }) {
  const t = useT();
  const pause = usePauseAutomation();
  const until = contact.automation_paused_until;
  const paused = !!until && new Date(until) > new Date();
  const opts = [
    { v: "30", label: t.inbox.pause30m, ms: 30 * 60_000 },
    { v: "60", label: t.inbox.pause1h, ms: 3_600_000 },
    { v: "1440", label: t.inbox.pause24h, ms: 86_400_000 },
    { v: "forever", label: t.inbox.pauseForever, ms: 100 * 365 * 86_400_000 },
  ];
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold uppercase text-muted">{t.inbox.pauseAutomation}</h3>
      {paused ? (
        <div className="flex items-center justify-between gap-2 rounded-[8px] bg-bg-subtle px-3 py-2 text-sm">
          <span>
            ⏸{" "}
            {new Date(until!).getFullYear() > new Date().getFullYear() + 50
              ? t.inbox.pauseForever
              : fmt(t.inbox.pausedUntil, { time: formatDate(until!, tz, true) })}
          </span>
          <Button size="sm" variant="outline" onClick={() => pause.mutate({ id: contact.id, until: null })}>
            {t.inbox.resume}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">▶ {t.inbox.activeAutomation}</span>
          <NativeSelect
            className="h-9 w-44"
            value=""
            aria-label={t.inbox.pauseFor}
            onChange={(e) => {
              const o = opts.find((x) => x.v === e.target.value);
              if (o) pause.mutate({ id: contact.id, until: new Date(Date.now() + o.ms).toISOString() });
            }}
          >
            <option value="">{t.inbox.pauseFor}</option>
            {opts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}
