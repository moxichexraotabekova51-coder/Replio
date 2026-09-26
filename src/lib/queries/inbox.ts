"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccountId, useApp } from "@/components/providers/app-provider";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type InboxView = { kind: "all" } | { kind: "reminders" } | { kind: "label"; id: string };

export type InboxFilters = {
  status: "open" | "closed" | "all";
  unread: boolean;
  sort: "newest" | "oldest";
  channel: "all" | "telegram";
  tagId: string | null;
  assignee: string | null; // user id | "none"
  labelId: string | null;
  activity: "any" | "1d" | "7d" | "30d";
  search: string;
};

export const defaultInboxFilters: InboxFilters = {
  status: "open",
  unread: false,
  sort: "newest",
  channel: "all",
  tagId: null,
  assignee: null,
  labelId: null,
  activity: "any",
  search: "",
};

export type Conversation = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_unread: boolean;
  live_chat_status: Enums<"live_chat_status">;
  last_message_preview: string | null;
  last_message_at: string | null;
  assigned_to: string | null;
  automation_paused_until: string | null;
  is_subscribed?: boolean;
  contact_labels: { label_id: string }[];
};

export type Label = { id: string; name: string; icon: string; is_default: boolean };

const PAGE = 40;

export const inboxKeys = {
  all: (acc: string) => [acc, "inbox"] as const,
  list: (acc: string, view: InboxView, f: InboxFilters) => [acc, "inbox", "list", view, f] as const,
  counts: (acc: string) => [acc, "inbox", "counts"] as const,
  labels: (acc: string) => [acc, "inbox", "labels"] as const,
  messages: (acc: string, contactId: string) => [acc, "inbox", "messages", contactId] as const,
  contact: (acc: string, contactId: string) => [acc, "inbox", "contact", contactId] as const,
};

const CONVERSATION_COLS =
  "id, first_name, last_name, username, avatar_url, is_unread, live_chat_status, last_message_preview, last_message_at, assigned_to, automation_paused_until, is_subscribed, contact_labels(label_id)";

/** Tanlangan suhbat — ro'yxatdan mustaqil (filtrdan chiqib ketsa ham yangilanadi) */
export function useContact(id: string | null, initial?: Conversation | null) {
  const acc = useAccountId();
  return useQuery({
    enabled: !!id,
    queryKey: inboxKeys.contact(acc, id ?? ""),
    initialData: initial && initial.id === id ? initial : undefined,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await createClient().from("contacts").select(CONVERSATION_COLS).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as unknown as Conversation) ?? null;
    },
  });
}

export function displayName(c: Pick<Conversation, "first_name" | "last_name" | "username">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.username ? `@${c.username}` : "—");
}

const ACTIVITY_MS = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;

export function useConversations(view: InboxView, f: InboxFilters) {
  const acc = useAccountId();
  const { user } = useApp();
  return useInfiniteQuery({
    queryKey: inboxKeys.list(acc, view, f),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      let ids: string[] | null = null;
      if (f.search.trim()) {
        const { data, error } = await supabase.rpc("inbox_search", { p_account_id: acc, p_query: f.search.trim() });
        if (error) throw error;
        ids = data ?? [];
        if (ids.length === 0) return [] as Conversation[];
      }
      if (view.kind === "reminders") {
        const { data, error } = await supabase
          .from("reminders")
          .select("contact_id")
          .eq("account_id", acc)
          .eq("user_id", user.id)
          .eq("done", false);
        if (error) throw error;
        const rIds = [...new Set((data ?? []).map((r) => r.contact_id))];
        ids = ids ? ids.filter((x) => rIds.includes(x)) : rIds;
        if (ids.length === 0) return [] as Conversation[];
      }

      const labelId = view.kind === "label" ? view.id : f.labelId;
      const embeds = [
        labelId ? "contact_labels!inner(label_id)" : "contact_labels(label_id)",
        ...(f.tagId ? ["contact_tags!inner(tag_id)"] : []),
      ];
      let q = supabase
        .from("contacts")
        .select(
          `id, first_name, last_name, username, avatar_url, is_unread, live_chat_status, last_message_preview, last_message_at, assigned_to, automation_paused_until, ${embeds.join(", ")}`,
        )
        .eq("account_id", acc)
        .not("last_message_at", "is", null);
      if (f.status !== "all") q = q.eq("live_chat_status", f.status);
      if (f.unread) q = q.eq("is_unread", true);
      if (labelId) q = q.eq("contact_labels.label_id", labelId);
      if (f.tagId) q = q.eq("contact_tags.tag_id", f.tagId);
      if (f.assignee === "none") q = q.is("assigned_to", null);
      else if (f.assignee) q = q.eq("assigned_to", f.assignee);
      if (f.activity !== "any") q = q.gte("last_interaction_at", new Date(Date.now() - ACTIVITY_MS[f.activity]).toISOString());
      if (ids) q = q.in("id", ids);
      q = q
        .order("last_message_at", { ascending: f.sort === "oldest", nullsFirst: false })
        .order("id")
        .range(pageParam, pageParam + PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
}

export function useInboxCounts() {
  const acc = useAccountId();
  return useQuery({
    queryKey: inboxKeys.counts(acc),
    queryFn: async () => {
      const { count, error } = await createClient()
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acc)
        .eq("live_chat_status", "open")
        .not("last_message_at", "is", null);
      if (error) throw error;
      return { open: count ?? 0 };
    },
  });
}

export function useLabels() {
  const acc = useAccountId();
  return useQuery({
    queryKey: inboxKeys.labels(acc),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("inbox_labels")
        .select("id, name, icon, is_default")
        .eq("account_id", acc)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Label[];
    },
  });
}

export function useCreateLabel() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, icon }: { name: string; icon: string }) => {
      const { error } = await createClient().from("inbox_labels").insert({ account_id: acc, name, icon });
      if (error) throw error;
    },
    onError: () => toast.error("Label yaratib bo'lmadi (nom takrorlanmasligi kerak)."),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.labels(acc) }),
  });
}

/** Suhbatlar ro'yxatidagi kontaktlarni keshda optimistik yangilash */
function patchConversations(
  qc: ReturnType<typeof useQueryClient>,
  acc: string,
  ids: string[],
  fn: (c: Conversation) => Conversation,
) {
  for (const id of ids) qc.setQueryData<Conversation | null>(inboxKeys.contact(acc, id), (old) => (old ? fn(old) : old));
  qc.setQueriesData<InfiniteData<Conversation[]>>({ queryKey: [acc, "inbox", "list"] }, (old) =>
    old ? { ...old, pages: old.pages.map((p) => p.map((c) => (ids.includes(c.id) ? fn(c) : c))) } : old,
  );
}

export function useUpdateConversations() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: { is_unread?: boolean; live_chat_status?: "open" | "closed" } }) => {
      const { error } = await createClient().from("contacts").update(patch).in("id", ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: [acc, "inbox", "list"] });
      patchConversations(qc, acc, ids, (c) => ({ ...c, ...patch }));
    },
    onError: () => toast.error("Nimadir noto'g'ri ketdi. Qayta urinib ko'ring."),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all(acc) }),
  });
}

export function useToggleLabel() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, labelId, on }: { ids: string[]; labelId: string; on: boolean }) => {
      const supabase = createClient();
      const { error } = on
        ? await supabase.from("contact_labels").upsert(ids.map((contact_id) => ({ contact_id, label_id: labelId })), { ignoreDuplicates: true })
        : await supabase.from("contact_labels").delete().in("contact_id", ids).eq("label_id", labelId);
      if (error) throw error;
    },
    onMutate: async ({ ids, labelId, on }) => {
      await qc.cancelQueries({ queryKey: [acc, "inbox", "list"] });
      patchConversations(qc, acc, ids, (c) => ({
        ...c,
        contact_labels: on
          ? [...c.contact_labels.filter((l) => l.label_id !== labelId), { label_id: labelId }]
          : c.contact_labels.filter((l) => l.label_id !== labelId),
      }));
    },
    onError: () => toast.error("Nimadir noto'g'ri ketdi. Qayta urinib ko'ring."),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all(acc) }),
  });
}

export type Message = {
  id: string;
  direction: Enums<"message_direction">;
  type: string;
  content: { text?: string; caption?: string; file_name?: string; url?: string; media?: string } | null;
  created_at: string;
  author_id: string | null;
  /** optimistik xabar yuborilmadi */
  failed?: boolean;
};

export function useMessages(contactId: string | null) {
  const acc = useAccountId();
  return useQuery({
    enabled: !!contactId,
    queryKey: inboxKeys.messages(acc, contactId ?? ""),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("messages")
        .select("id, direction, type, content, created_at, author_id")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown as Message[]).reverse();
    },
  });
}

export function useTagsList() {
  const acc = useAccountId();
  return useQuery({
    queryKey: [acc, "tags", "list"],
    queryFn: async () => {
      const { data, error } = await createClient().from("tags").select("id, name").eq("account_id", acc).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useMembers() {
  const acc = useAccountId();
  return useQuery({
    queryKey: [acc, "members"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: members, error } = await supabase
        .from("account_members")
        .select("user_id, role, created_at")
        .eq("account_id", acc)
        .order("created_at");
      if (error) throw error;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", members.map((m) => m.user_id));
      return members.map((m) => ({ ...m, profile: profiles?.find((p) => p.id === m.user_id) ?? null }));
    },
  });
}
