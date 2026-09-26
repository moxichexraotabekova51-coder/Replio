"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccountId } from "@/components/providers/app-provider";
import type { Draft } from "@/lib/flow/draft";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/database.types";

export type FlowDetail = {
  id: string;
  account_id: string;
  name: string;
  status: Enums<"flow_status">;
  has_unpublished: boolean;
  published_version: number;
  draft: Json;
  is_basic: boolean;
  basic_kind: string | null;
  folder_id: string | null;
  deleted_at: string | null;
};

export type TriggerConditions = { op?: "and" | "or"; rules?: unknown[] };

export type FlowTrigger = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  conditions: TriggerConditions | unknown[];
  secret?: string;
  is_active: boolean;
  run_count: number;
  click_count: number;
  updated_at: string;
};

export const builderKeys = {
  flow: (acc: string, id: string) => [acc, "flow", id] as const,
  triggers: (acc: string, id: string) => [acc, "flow", id, "triggers"] as const,
  versions: (acc: string, id: string) => [acc, "flow", id, "versions"] as const,
  fields: (acc: string) => [acc, "fields", "all"] as const,
};

export function useFlow(id: string) {
  const acc = useAccountId();
  return useQuery({
    queryKey: builderKeys.flow(acc, id),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("flows")
        .select("id, account_id, name, status, has_unpublished, published_version, draft, is_basic, basic_kind, folder_id, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as FlowDetail | null;
    },
  });
}

export function useFlowTriggers(flowId: string) {
  const acc = useAccountId();
  return useQuery({
    queryKey: builderKeys.triggers(acc, flowId),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("triggers")
        .select("id, type, config, conditions, secret, is_active, run_count, click_count, updated_at")
        .eq("flow_id", flowId)
        .order("created_at");
      if (error) throw error;
      return data as FlowTrigger[];
    },
  });
}

export function useAllFields() {
  const acc = useAccountId();
  return useQuery({
    queryKey: builderKeys.fields(acc),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("custom_fields")
        .select("id, name, type, is_bot_field")
        .eq("account_id", acc)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveDraft(flowId: string) {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, live }: { draft: Draft; live: boolean }) => {
      const patch: { draft: Json; has_unpublished?: boolean } = { draft: draft as unknown as Json };
      if (live) patch.has_unpublished = true;
      const { error } = await createClient().from("flows").update(patch).eq("id", flowId);
      if (error) throw error;
      return live;
    },
    onSuccess: (live) => {
      if (live) qc.setQueryData<FlowDetail | null>(builderKeys.flow(acc, flowId), (f) => (f ? { ...f, has_unpublished: true } : f));
      void qc.invalidateQueries({ queryKey: [acc, "flows"] });
    },
    onError: () => toast.error("Saqlab bo'lmadi. Internet aloqasini tekshiring."),
  });
}

export function useTriggerMutations(flowId: string) {
  const acc = useAccountId();
  const qc = useQueryClient();
  const key = builderKeys.triggers(acc, flowId);
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: [acc, "flows"] });
  };
  const optimistic = async (fn: (rows: FlowTrigger[]) => FlowTrigger[]) => {
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<FlowTrigger[]>(key);
    qc.setQueryData<FlowTrigger[]>(key, (old) => (old ? fn(old) : old));
    return { prev };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: FlowTrigger[] }) => {
    qc.setQueryData(key, ctx?.prev);
    toast.error("Nimadir noto'g'ri ketdi. Qayta urinib ko'ring.");
  };

  const create = useMutation({
    mutationFn: async ({ type, config, conditions }: { type: string; config: Record<string, unknown>; conditions?: TriggerConditions }) => {
      const { error } = await createClient()
        .from("triggers")
        .insert({ account_id: acc, flow_id: flowId, type, config: config as Json, conditions: (conditions ?? {}) as Json });
      if (error) throw error;
    },
    onMutate: ({ type, config, conditions }) =>
      optimistic((rows) => [
        ...rows,
        { id: `temp-${Date.now()}`, type, config, conditions: conditions ?? {}, is_active: true, run_count: 0, click_count: 0, updated_at: new Date().toISOString() },
      ]),
    onError: rollback,
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { config?: Record<string, unknown>; conditions?: TriggerConditions; is_active?: boolean } }) => {
      const { error } = await createClient()
        .from("triggers")
        .update({
          ...(patch.config ? { config: patch.config as Json } : {}),
          ...(patch.conditions ? { conditions: patch.conditions as Json } : {}),
          ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => optimistic((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    onError: rollback,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("triggers").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => optimistic((rows) => rows.filter((r) => r.id !== id)),
    onError: rollback,
    onSettled: settle,
  });
  return { create, update, remove };
}

export function usePublish(flowId: string) {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, compiled }: { draft: Draft; compiled: unknown }) => {
      const { data, error } = await createClient().rpc("publish_flow", {
        p_flow_id: flowId,
        p_draft: draft as unknown as Json,
        p_compiled: compiled as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (version) => {
      qc.setQueryData<FlowDetail | null>(builderKeys.flow(acc, flowId), (f) =>
        f ? { ...f, status: "live", has_unpublished: false, published_version: version } : f,
      );
      void qc.invalidateQueries({ queryKey: [acc, "flows"] });
      void qc.invalidateQueries({ queryKey: builderKeys.versions(acc, flowId) });
    },
    onError: (e: { message?: string }) => {
      // upgrade_required:* — chaqiruvchi pricing modalni ochadi
      if (!e.message?.startsWith("upgrade_required")) toast.error("Publish qilib bo'lmadi. Qayta urinib ko'ring.");
    },
  });
}

export function useSetFlowStatus(flowId: string) {
  const acc = useAccountId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "live" | "stopped") => {
      const { error } = await createClient().from("flows").update({ status }).eq("id", flowId);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.setQueryData<FlowDetail | null>(builderKeys.flow(acc, flowId), (f) => (f ? { ...f, status } : f));
      void qc.invalidateQueries({ queryKey: [acc, "flows"] });
    },
    onError: () => toast.error("Nimadir noto'g'ri ketdi. Qayta urinib ko'ring."),
  });
}

export function useVersions(flowId: string, enabled: boolean) {
  const acc = useAccountId();
  return useQuery({
    enabled,
    queryKey: builderKeys.versions(acc, flowId),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("flow_versions")
        .select("id, version, draft, created_at")
        .eq("flow_id", flowId)
        .order("version", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export type StepStat = { sent: number; delivered: number; clicked: number };

/** Canvas'dagi har bir qadam statistikasi (Sent/Delivered/Clicked) */
export function useStepStats(flowId: string) {
  const acc = useAccountId();
  return useQuery({
    queryKey: [acc, "flow", flowId, "stats"] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().from("step_stats").select("step_id, sent, delivered, clicked").eq("flow_id", flowId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.step_id, { sent: r.sent, delivered: r.delivered, clicked: r.clicked }])) as Record<string, StepStat>;
    },
  });
}

export type PreviewState = { bot: string | null; linked?: boolean; link?: string };

export function usePreviewState(enabled: boolean) {
  const acc = useAccountId();
  return useQuery({
    queryKey: [acc, "preview"] as const,
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/flows/preview-state");
      if (!res.ok) throw new Error("preview");
      return (await res.json()) as PreviewState;
    },
  });
}
