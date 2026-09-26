"use client";

import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAccountId, useApp } from "@/components/providers/app-provider";
import { readInboxSettings } from "@/lib/inbox-settings";
import { createClient } from "@/lib/supabase/client";
import { displayName, inboxKeys, type Conversation, type Message } from "./inbox";

/** Rail'dagi "o'qilmagan" nuqtasi — realtime hodisalarda qayta so'raladi */
export function useHasUnread() {
  const app = useApp();
  return useQuery({
    queryKey: [app.account.id, "inbox", "has-unread"],
    initialData: app.hasUnread,
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await createClient()
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", app.account.id)
        .eq("is_unread", true)
        .eq("live_chat_status", "open");
      return (count ?? 0) > 0;
    },
  });
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch {
    /* ovoz — ixtiyoriy */
  }
}

/**
 * Supabase Realtime: yangi xabarlar va kontakt o'zgarishlari (RLS bilan).
 * Shell darajasida bir marta ulanadi — Inbox yopiq bo'lsa ham rail nuqtasi va bildirishnomalar ishlaydi.
 */
export function useInboxRealtime() {
  const app = useApp();
  const acc = app.account.id;
  const qc = useQueryClient();
  const settings = readInboxSettings(app.account.settings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshLists = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void qc.invalidateQueries({ queryKey: [acc, "inbox", "list"] });
        void qc.invalidateQueries({ queryKey: inboxKeys.counts(acc) });
        void qc.invalidateQueries({ queryKey: [acc, "inbox", "has-unread"] });
      }, 250);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Realtime RLS foydalanuvchi JWT'si bilan ishlashi uchun: obunadan oldin sessiya tokeni
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
      .channel(`inbox:${acc}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `account_id=eq.${acc}` }, (p) => {
        const m = p.new as Message & { contact_id: string };
        qc.setQueryData<Message[]>(inboxKeys.messages(acc, m.contact_id), (old) => {
          if (!old) return old;
          if (old.some((x) => x.id === m.id)) return old;
          // Optimistik (temp) operator xabarini haqiqiysi bilan almashtirish
          const tempIdx = old.findIndex((x) => x.id.startsWith("temp-") && x.direction === m.direction && x.content?.text === m.content?.text);
          if (tempIdx >= 0) return old.map((x, i) => (i === tempIdx ? m : x));
          return [...old, m];
        });
        refreshLists();
        if (m.direction === "in") {
          const s = settingsRef.current;
          if (s.notify_sound) beep();
          if (s.notify_browser && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const c = qc.getQueryData<Conversation | null>(inboxKeys.contact(acc, m.contact_id));
            new Notification(c ? displayName(c) : "Replio", { body: m.content?.text ?? m.content?.caption ?? "", tag: m.contact_id });
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts", filter: `account_id=eq.${acc}` }, (p) => {
        const c = p.new as Conversation;
        const patch = (old: Conversation) => ({
          ...old,
          is_unread: c.is_unread,
          live_chat_status: c.live_chat_status,
          last_message_preview: c.last_message_preview,
          last_message_at: c.last_message_at,
          assigned_to: c.assigned_to,
          automation_paused_until: c.automation_paused_until,
        });
        qc.setQueryData<Conversation | null>(inboxKeys.contact(acc, c.id), (old) => (old ? patch(old) : old));
        qc.setQueriesData<InfiniteData<Conversation[]>>({ queryKey: [acc, "inbox", "list"] }, (old) =>
          old ? { ...old, pages: old.pages.map((pg) => pg.map((x) => (x.id === c.id ? patch(x) : x))) } : old,
        );
        refreshLists();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contacts", filter: `account_id=eq.${acc}` }, refreshLists)
      .subscribe();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [acc, qc]);
}

type SendInput =
  | { kind: "text" | "note"; text: string }
  | { kind: "media"; media: { type: "image" | "video" | "audio" | "file" | "gif"; url: string; name?: string }; caption?: string };

export function useSendMessage(contactId: string) {
  const acc = useAccountId();
  const { user } = useApp();
  const qc = useQueryClient();
  const key = inboxKeys.messages(acc, contactId);
  return useMutation({
    mutationFn: async (input: SendInput) => {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, contact_id: contactId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: Message };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "failed");
      return json.message ?? null;
    },
    onMutate: async (input) => {
      const temp: Message = {
        id: `temp-${Date.now()}`,
        direction: input.kind === "note" ? "note" : "out_agent",
        type: input.kind === "media" ? input.media.type : "text",
        content: input.kind === "media" ? { caption: input.caption, file_name: input.media.name ?? input.media.url.split("/").at(-1) } : { text: input.text },
        created_at: new Date().toISOString(),
        author_id: user.id,
      };
      qc.setQueryData<Message[]>(key, (old) => [...(old ?? []), temp]);
      return { tempId: temp.id };
    },
    onSuccess: (msg, _v, ctx) => {
      qc.setQueryData<Message[]>(key, (old) => {
        if (!old) return old;
        if (!msg || old.some((x) => x.id === msg.id)) return old.filter((x) => x.id !== ctx?.tempId);
        return old.map((x) => (x.id === ctx?.tempId ? msg : x));
      });
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData<Message[]>(key, (old) => old?.map((x) => (x.id === ctx?.tempId ? { ...x, failed: true } : x)));
      toast.error((e as Error).message === "blocked" ? "Kontakt botni bloklagan — xabar yetkazilmaydi" : "Xabar yuborilmadi");
    },
  });
}

export function useSendFlow(contactId: string) {
  return useMutation({
    mutationFn: async (flowId: string) => {
      const res = await fetch("/api/inbox/send-flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, flow_id: flowId }),
      });
      if (!res.ok) throw new Error("failed");
    },
    onError: () => toast.error("Avtomatlashtirishni yuborib bo'lmadi"),
  });
}

/** Operatorga biriktirish (bitta yoki ko'p suhbat) */
export function useAssign() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, userId }: { ids: string[]; userId: string | null }) => {
      const { error } = await createClient().from("contacts").update({ assigned_to: userId }).in("id", ids);
      if (error) throw error;
    },
    onMutate: ({ ids, userId }) => {
      for (const id of ids) qc.setQueryData<Conversation | null>(inboxKeys.contact(acc, id), (old) => (old ? { ...old, assigned_to: userId } : old));
    },
    onError: () => toast.error("Biriktirib bo'lmadi"),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all(acc) }),
  });
}

/** Avtomatlashtirishni pauza qilish / davom ettirish */
export function usePauseAutomation() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, until }: { id: string; until: string | null }) => {
      const { error } = await createClient().from("contacts").update({ automation_paused_until: until }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, until }) => {
      qc.setQueryData<Conversation | null>(inboxKeys.contact(acc, id), (old) => (old ? { ...old, automation_paused_until: until } : old));
    },
    onError: () => toast.error("Saqlab bo'lmadi"),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all(acc) }),
  });
}

export type Reminder = { id: string; contact_id: string; remind_at: string; note: string | null; done: boolean; notified_at: string | null };

export function useContactReminder(contactId: string) {
  const acc = useAccountId();
  const { user } = useApp();
  const qc = useQueryClient();
  const key = [acc, "inbox", "reminder", contactId] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("reminders")
        .select("id, contact_id, remind_at, note, done, notified_at")
        .eq("contact_id", contactId)
        .eq("user_id", user.id)
        .eq("done", false)
        .order("remind_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Reminder | null;
    },
  });
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: [acc, "inbox", "list", { kind: "reminders" }] });
  };
  const set = useMutation({
    mutationFn: async (at: Date) => {
      const supabase = createClient();
      await supabase.from("reminders").update({ done: true }).eq("contact_id", contactId).eq("user_id", user.id).eq("done", false);
      const { error } = await supabase.from("reminders").insert({ account_id: acc, contact_id: contactId, user_id: user.id, remind_at: at.toISOString() });
      if (error) throw error;
    },
    onError: () => toast.error("Eslatmani saqlab bo'lmadi"),
    onSettled: settle,
  });
  const done = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("reminders").update({ done: true }).eq("id", id);
      if (error) throw error;
    },
    onSettled: settle,
  });
  return { q, set, done };
}

/** Vaqti kelgan eslatmalar → brauzer bildirishnomasi + toast (har 30 soniyada) */
export function useDueReminders(onOpen: (contactId: string) => void) {
  const { user, account } = useApp();
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    const supabase = createClient();
    let stop = false;
    const check = async () => {
      const { data } = await supabase
        .from("reminders")
        .select("id, contact_id, remind_at, contacts(first_name, last_name, username)")
        .eq("account_id", account.id)
        .eq("user_id", user.id)
        .eq("done", false)
        .is("notified_at", null)
        .lte("remind_at", new Date().toISOString())
        .limit(10);
      if (stop || !data?.length) return;
      await supabase.from("reminders").update({ notified_at: new Date().toISOString() }).in("id", data.map((r) => r.id));
      for (const r of data) {
        const c = r.contacts as unknown as Pick<Conversation, "first_name" | "last_name" | "username"> | null;
        const name = c ? displayName(c) : "";
        toast(`⏰ Eslatma: ${name}`, { action: { label: "Ochish", onClick: () => openRef.current(r.contact_id) }, duration: 15_000 });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(`⏰ Eslatma: ${name}`, { tag: r.id });
          n.onclick = () => {
            window.focus();
            openRef.current(r.contact_id);
          };
        }
      }
    };
    void check();
    const id = setInterval(() => void check(), 30_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [user.id, account.id]);
}
