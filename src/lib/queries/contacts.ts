"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccountId } from "@/components/providers/app-provider";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

export type FilterRule =
  | { kind: "tag"; tag_id: string; neg?: boolean }
  | { kind: "sequence"; sequence_id: string; neg?: boolean }
  | { kind: "field"; field_id: string; cmp: "eq" | "neq" | "gt" | "lt" | "contains" | "empty" | "not_empty"; value?: string }
  | { kind: "system"; field: string; cmp: "eq" | "neq" | "contains" | "empty" | "not_empty"; value?: string }
  | { kind: "subscribed"; cmp: "before" | "after"; value: string };

export type ContactFilter = { op: "and" | "or"; rules: FilterRule[] };
export const emptyFilter: ContactFilter = { op: "and", rules: [] };

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  subscribed_at: string;
  last_interaction_at: string | null;
  is_subscribed: boolean;
  tags: { id: string; name: string }[];
};

const PAGE = 50;

export const contactKeys = {
  all: (acc: string) => [acc, "contacts"] as const,
  list: (acc: string, f: ContactFilter, search: string) => [acc, "contacts", "list", f, search] as const,
  count: (acc: string, f: ContactFilter, search: string) => [acc, "contacts", "count", f, search] as const,
  detail: (acc: string, id: string) => [acc, "contacts", "detail", id] as const,
};

export function useContactsList(filter: ContactFilter, search: string) {
  const acc = useAccountId();
  return useInfiniteQuery({
    queryKey: contactKeys.list(acc, filter, search),
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await createClient().rpc("contacts_page", {
        p_account_id: acc,
        p_filter: filter as unknown as Json,
        p_search: search.trim() || undefined,
        p_before: pageParam?.at,
        p_before_id: pageParam?.id,
        p_limit: PAGE,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ContactRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? { at: last.at(-1)!.subscribed_at, id: last.at(-1)!.id } : null),
    placeholderData: (prev) => prev,
  });
}

export function useContactsCount(filter: ContactFilter, search: string) {
  const acc = useAccountId();
  return useQuery({
    queryKey: contactKeys.count(acc, filter, search),
    queryFn: async () => {
      const { data, error } = await createClient().rpc("contacts_count", {
        p_account_id: acc,
        p_filter: filter as unknown as Json,
        p_search: search.trim() || undefined,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    placeholderData: (prev) => prev,
  });
}

export type BulkAction = "add_tag" | "remove_tag" | "set_field" | "clear_field" | "subscribe_sequence" | "unsubscribe_sequence" | "delete";

export function useContactsBulk() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ids: string[] | null; filter: ContactFilter; search: string; action: BulkAction; arg?: Record<string, unknown> }) => {
      const { data, error } = await createClient().rpc("contacts_bulk", {
        p_account_id: acc,
        p_ids: v.ids as string[],
        p_filter: v.filter as unknown as Json,
        p_search: v.search.trim(),
        p_action: v.action,
        p_arg: (v.arg ?? {}) as Json,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onError: () => toast.error("Amalni bajarib bo'lmadi. Qayta urinib ko'ring."),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.all(acc) });
      void qc.invalidateQueries({ queryKey: [acc, "tags"] });
    },
  });
}

export function useSequencesList() {
  const acc = useAccountId();
  return useQuery({
    queryKey: [acc, "sequences", "list"],
    queryFn: async () => {
      const { data, error } = await createClient().from("sequences").select("id, name").eq("account_id", acc).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTag() {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const { data: existing } = await supabase.from("tags").select("id, name").eq("account_id", acc).eq("name", name).maybeSingle();
      if (existing) return existing;
      const { data, error } = await supabase.from("tags").insert({ account_id: acc, name }).select("id, name").single();
      if (error) throw error;
      return data;
    },
    onError: () => toast.error("Teg yaratib bo'lmadi."),
    onSettled: () => qc.invalidateQueries({ queryKey: [acc, "tags"] }),
  });
}
