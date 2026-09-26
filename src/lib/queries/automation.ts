"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccountId } from "@/components/providers/app-provider";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/database.types";

export type TriggerRow = {
  id: string;
  type: string;
  config: Json;
  is_active: boolean;
  run_count: number;
  click_count: number;
};

export type FlowRow = {
  id: string;
  name: string;
  status: Enums<"flow_status">;
  folder_id: string | null;
  runs: number;
  clicks: number;
  published_version: number;
  has_unpublished: boolean;
  is_basic: boolean;
  basic_kind: string | null;
  updated_at: string;
  deleted_at: string | null;
  triggers: TriggerRow[];
};

export type FolderRow = { id: string; name: string; parent_id: string | null; created_at: string };

const FLOW_COLS =
  "id, name, status, folder_id, runs, clicks, published_version, has_unpublished, is_basic, basic_kind, updated_at, deleted_at, triggers(id, type, config, is_active, run_count, click_count)";

export const automationKeys = {
  flows: (acc: string) => [acc, "flows"] as const,
  trash: (acc: string) => [acc, "flows", "trash"] as const,
  folders: (acc: string) => [acc, "folders"] as const,
  templates: ["templates"] as const,
  sequences: (acc: string) => [acc, "sequences"] as const,
};

export function useFlows() {
  const acc = useAccountId();
  return useQuery({
    queryKey: automationKeys.flows(acc),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("flows")
        .select(FLOW_COLS)
        .eq("account_id", acc)
        .is("deleted_at", null)
        .or("basic_kind.is.null,basic_kind.neq.broadcast") // broadcast xabarlari — Broadcasting bo'limida
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as FlowRow[];
    },
  });
}

export function useTrash() {
  const acc = useAccountId();
  return useQuery({
    queryKey: automationKeys.trash(acc),
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await createClient()
        .from("flows")
        .select(FLOW_COLS)
        .eq("account_id", acc)
        .not("deleted_at", "is", null)
        .gte("deleted_at", since)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FlowRow[];
    },
  });
}

export function useFolders() {
  const acc = useAccountId();
  return useQuery({
    queryKey: automationKeys.folders(acc),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("folders")
        .select("id, name, parent_id, created_at")
        .eq("account_id", acc)
        .order("name");
      if (error) throw error;
      return data as FolderRow[];
    },
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: automationKeys.templates,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("templates")
        .select("id, name, description, category, icon")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

/** Flowlar keshini optimistik yangilash yordamchisi */
function useFlowsCache() {
  const qc = useQueryClient();
  const acc = useAccountId();
  const key = automationKeys.flows(acc);
  return {
    qc,
    acc,
    key,
    async snapshot() {
      await qc.cancelQueries({ queryKey: key });
      return qc.getQueryData<FlowRow[]>(key);
    },
    set(fn: (rows: FlowRow[]) => FlowRow[]) {
      qc.setQueryData<FlowRow[]>(key, (old) => (old ? fn(old) : old));
    },
    restore(prev: FlowRow[] | undefined) {
      qc.setQueryData(key, prev);
    },
    invalidate() {
      return qc.invalidateQueries({ queryKey: [acc, "flows"] });
    },
  };
}

function onErr(msg = "Nimadir noto'g'ri ketdi. Qayta urinib ko'ring.") {
  toast.error(msg);
}

export function useUpdateFlows() {
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<Pick<FlowRow, "name" | "folder_id" | "status">> }) => {
      const { error } = await createClient().from("flows").update(patch).in("id", ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, patch }) => {
      const prev = await c.snapshot();
      const now = new Date().toISOString();
      c.set((rows) => rows.map((r) => (ids.includes(r.id) ? { ...r, ...patch, updated_at: now } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      c.restore(ctx?.prev);
      onErr();
    },
    onSettled: () => c.invalidate(),
  });
}

/** Trash'ga ko'chirish (soft delete) */
export function useTrashFlows() {
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await createClient()
        .from("flows")
        .update({ deleted_at: new Date().toISOString(), status: "stopped" })
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      const prev = await c.snapshot();
      c.set((rows) => rows.filter((r) => !ids.includes(r.id)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      c.restore(ctx?.prev);
      onErr();
    },
    onSettled: () => c.invalidate(),
  });
}

export function useRestoreFlow() {
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("flows").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = automationKeys.trash(c.acc);
      await c.qc.cancelQueries({ queryKey: key });
      const prev = c.qc.getQueryData<FlowRow[]>(key);
      c.qc.setQueryData<FlowRow[]>(key, (old) => old?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      c.qc.setQueryData(automationKeys.trash(c.acc), ctx?.prev);
      onErr();
    },
    onSettled: () => c.invalidate(),
  });
}

export function useDeleteFlowForever() {
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("flows").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = automationKeys.trash(c.acc);
      await c.qc.cancelQueries({ queryKey: key });
      const prev = c.qc.getQueryData<FlowRow[]>(key);
      c.qc.setQueryData<FlowRow[]>(key, (old) => old?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      c.qc.setQueryData(automationKeys.trash(c.acc), ctx?.prev);
      onErr();
    },
    onSettled: () => c.invalidate(),
  });
}

export function useDuplicateFlows() {
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const supabase = createClient();
      for (const id of ids) {
        const { error } = await supabase.rpc("duplicate_flow", { p_flow_id: id });
        if (error) throw error;
      }
    },
    onError: () => onErr(),
    onSettled: () => c.invalidate(),
  });
}

export function useCreateFlow() {
  const acc = useAccountId();
  const c = useFlowsCache();
  return useMutation({
    mutationFn: async ({ templateId, folderId }: { templateId?: string | null; folderId?: string | null }) => {
      const { data, error } = await createClient().rpc("create_flow", {
        p_account_id: acc,
        p_template_id: templateId ?? undefined,
        p_folder_id: folderId ?? undefined,
      });
      if (error || !data) throw error ?? new Error("create_flow failed");
      return data;
    },
    onError: () => onErr(),
    onSuccess: () => c.invalidate(),
  });
}

/* ───────────── Papkalar ───────────── */

export function useCreateFolder() {
  const qc = useQueryClient();
  const acc = useAccountId();
  const key = automationKeys.folders(acc);
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await createClient()
        .from("folders")
        .insert({ account_id: acc, name })
        .select("id, name, parent_id, created_at")
        .single();
      if (error) throw error;
      return data as FolderRow;
    },
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FolderRow[]>(key);
      const temp: FolderRow = { id: `temp-${Date.now()}`, name, parent_id: null, created_at: new Date().toISOString() };
      qc.setQueryData<FolderRow[]>(key, (old) => [...(old ?? []), temp].sort((a, b) => a.name.localeCompare(b.name)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      onErr();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  const acc = useAccountId();
  const key = automationKeys.folders(acc);
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await createClient().from("folders").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FolderRow[]>(key);
      qc.setQueryData<FolderRow[]>(key, (old) => old?.map((f) => (f.id === id ? { ...f, name } : f)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      onErr();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  const acc = useAccountId();
  const key = automationKeys.folders(acc);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("folders").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FolderRow[]>(key);
      qc.setQueryData<FolderRow[]>(key, (old) => old?.filter((f) => f.id !== id));
      qc.setQueryData<FlowRow[]>(automationKeys.flows(acc), (old) =>
        old?.map((r) => (r.folder_id === id ? { ...r, folder_id: null } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      onErr();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: automationKeys.flows(acc) });
    },
  });
}
