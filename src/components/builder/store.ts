"use client";

import { create } from "zustand";
import type { Draft } from "@/lib/flow/draft";

const HISTORY = 50;

type EditorState = {
  flowId: string | null;
  draft: Draft;
  past: Draft[];
  future: Draft[];
  /** oxirgi saqlangandan keyin o'zgarish bormi */
  dirty: boolean;
  saving: boolean;
  /** Set Live validatsiyasidagi xatoli node/bloklar */
  issues: { nodeId: string; blockId?: string; code: string }[];
  selected: string | null;
  init: (flowId: string, draft: Draft) => void;
  /** Tarixga yoziladigan o'zgarish */
  update: (fn: (d: Draft) => Draft) => void;
  undo: () => void;
  redo: () => void;
  setSaving: (v: boolean) => void;
  markSaved: (snapshot: Draft) => void;
  setIssues: (i: EditorState["issues"]) => void;
  select: (id: string | null) => void;
};

export const useEditor = create<EditorState>((set, get) => ({
  flowId: null,
  draft: { nodes: [], edges: [] },
  past: [],
  future: [],
  dirty: false,
  saving: false,
  issues: [],
  selected: null,
  init: (flowId, draft) => set({ flowId, draft, past: [], future: [], dirty: false, saving: false, issues: [], selected: null }),
  update: (fn) => {
    const cur = get().draft;
    const next = fn(structuredClone(cur));
    set({ draft: next, past: [...get().past, cur].slice(-HISTORY), future: [], dirty: true, issues: [] });
  },
  undo: () => {
    const { past, draft, future } = get();
    if (!past.length) return;
    set({ draft: past[past.length - 1], past: past.slice(0, -1), future: [draft, ...future].slice(0, HISTORY), dirty: true });
  },
  redo: () => {
    const { past, draft, future } = get();
    if (!future.length) return;
    set({ draft: future[0], future: future.slice(1), past: [...past, draft].slice(-HISTORY), dirty: true });
  },
  setSaving: (saving) => set({ saving }),
  markSaved: (snapshot) => set({ dirty: get().draft !== snapshot, saving: false }),
  setIssues: (issues) => set({ issues }),
  select: (selected) => set({ selected }),
}));
