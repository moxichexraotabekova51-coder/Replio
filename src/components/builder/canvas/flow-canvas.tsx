"use client";

import dagre from "@dagrejs/dagre";
import {
  applyNodeChanges,
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Clock, Copy, CopyPlus, GitBranch, HelpCircle, Minus, Play, Plus, Send, Shuffle, Sparkles, StickyNote, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { newNode, sourceHandles, uid, type Draft, type DraftNode, type StepType } from "@/lib/flow/draft";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useEditor } from "../store";
import { nodeTypes } from "./nodes";

const STEP_TYPES: { type: StepType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "message", icon: Send },
  { type: "action", icon: Zap },
  { type: "condition", icon: GitBranch },
  { type: "randomizer", icon: Shuffle },
  { type: "smart_delay", icon: Clock },
  { type: "start_flow", icon: Play },
  { type: "comment", icon: StickyNote },
];

// Nusxalash buferi (sahifa bo'ylab)
let clipboard: { nodes: DraftNode[]; edges: Draft["edges"] } | null = null;

function toRfNodes(d: Draft, selected: string | null, prev?: Node[]): Node[] {
  // prev berilsa — ko'p tanlov saqlanadi (faqat draft o'zgarganda); aks holda faqat `selected`
  const prevSel = new Set((prev ?? []).filter((n) => n.selected).map((n) => n.id));
  return d.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { node: n },
    selected: n.id === selected || prevSel.has(n.id),
    deletable: n.type !== "trigger",
    dragHandle: undefined,
  }));
}

function toRfEdges(d: Draft): Edge[] {
  return d.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: "in",
    type: "default",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a", width: 18, height: 18 },
    style: { stroke: "#71717a", strokeWidth: 2 },
  }));
}

export function FlowCanvas(props: { onSelect: (id: string | null) => void; sidebarOpen: boolean }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ onSelect, sidebarOpen }: { onSelect: (id: string | null) => void; sidebarOpen: boolean }) {
  const t = useT();
  const { canEdit } = usePermissions();
  const draft = useEditor((s) => s.draft);
  const selected = useEditor((s) => s.selected);
  const update = useEditor((s) => s.update);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>(() => toRfNodes(draft, selected));
  // Katta flow (>40 step): boshlanishda faqat trigger atrofi — 200 node birdaniga render qilinmaydi (Ctrl+0 — hammasi)
  const [initialFit] = useState(() => {
    const d = useEditor.getState().draft;
    if (d.nodes.length <= 40) return { padding: 0.2, maxZoom: 1 };
    const start = d.nodes.find((n) => n.type === "trigger") ?? d.nodes[0];
    const near = [...d.nodes]
      .sort((a, b) => Math.hypot(a.position.x - start.position.x, a.position.y - start.position.y) - Math.hypot(b.position.x - start.position.x, b.position.y - start.position.y))
      .slice(0, 6);
    return { padding: 0.2, maxZoom: 1, minZoom: 0.4, nodes: near.map((n) => ({ id: n.id })) };
  });
  const edges = useMemo(() => toRfEdges(draft), [draft]);
  const [menu, setMenu] = useState<{ x: number; y: number; flow: { x: number; y: number }; from?: { source: string; handle: string } } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [zoom, setZoom] = useState(1);

  const lastSelected = useRef(selected);
  const connecting = useRef(false);
  useEffect(() => {
    const selChanged = lastSelected.current !== selected;
    lastSelected.current = selected;
    setNodes((prev) => toRfNodes(draft, selected, selChanged ? undefined : prev));
  }, [draft, selected]);

  // Sidebar ochilganda tanlangan node ko'rinmay qolsa — canvas'ni unga suramiz
  useEffect(() => {
    if (!selected) return;
    const id = requestAnimationFrame(() => {
      const n = rf.getInternalNode(selected);
      const box = wrapper.current?.getBoundingClientRect();
      if (!n || !box) return;
      const { x, y, zoom: z } = rf.getViewport();
      const w = (n.measured?.width ?? 500) * z;
      const h = (n.measured?.height ?? 200) * z;
      const left = n.internals.positionAbsolute.x * z + x;
      const top = n.internals.positionAbsolute.y * z + y;
      const visible = left + Math.min(w, 200) > 0 && left < box.width - 120 && top + Math.min(h, 120) > 0 && top < box.height - 80;
      if (!visible) {
        rf.setCenter(n.internals.positionAbsolute.x + (n.measured?.width ?? 500) / 2, n.internals.positionAbsolute.y + Math.min((n.measured?.height ?? 200) / 2, 200), { zoom: z, duration: 250 });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selected, sidebarOpen, rf]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removed.length && canEdit) {
        update((d) => {
          d.nodes = d.nodes.filter((n) => !removed.includes(n.id) || n.type === "trigger");
          d.edges = d.edges.filter((e) => !removed.includes(e.source) && !removed.includes(e.target));
          return d;
        });
        onSelect(null);
      }
      const sel = changes.find((c) => c.type === "select" && c.selected);
      // Chiqish nuqtasidan tortish boshlanganda sidebar ochilmasin (canvas siljib ketadi)
      if (sel && sel.type === "select" && !connecting.current) onSelect(sel.id);
    },
    [canEdit, update, onSelect],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      if (!canEdit) return;
      update((d) => {
        for (const m of dragged) {
          const n = d.nodes.find((x) => x.id === m.id);
          if (n) n.position = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
        }
        return d;
      });
    },
    [canEdit, update],
  );

  const connect = useCallback(
    (source: string, handle: string, target: string) => {
      if (source === target) return;
      update((d) => {
        d.edges = d.edges.filter((e) => !(e.source === source && e.sourceHandle === handle));
        d.edges.push({ id: uid("e"), source, sourceHandle: handle, target });
        return d;
      });
    },
    [update],
  );

  const onConnect = useCallback((c: Connection) => c.source && c.target && connect(c.source, c.sourceHandle ?? "next", c.target), [connect]);

  // Chiqish nuqtasidan tortib bo'sh joyga tashlansa — step turlari menyusi
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      connecting.current = false;
      if (state.isValid || !state.fromNode || !canEdit) return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      const box = wrapper.current!.getBoundingClientRect();
      setMenu({
        x: pt.clientX - box.left,
        y: pt.clientY - box.top,
        flow: rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }),
        from: { source: state.fromNode.id, handle: state.fromHandle?.id ?? "next" },
      });
    },
    [rf, canEdit],
  );

  const addStep = useCallback(
    (type: StepType, pos: { x: number; y: number }, from?: { source: string; handle: string }) => {
      const node = newNode(type, pos);
      update((d) => {
        d.nodes.push(node);
        if (from && type !== "comment") {
          d.edges = d.edges.filter((e) => !(e.source === from.source && e.sourceHandle === from.handle));
          d.edges.push({ id: uid("e"), source: from.source, sourceHandle: from.handle, target: node.id });
        }
        return d;
      });
      onSelect(node.id);
      setMenu(null);
    },
    [update, onSelect],
  );

  const copy = useCallback((ids: string[]) => {
    const d = useEditor.getState().draft;
    const set = new Set(ids);
    clipboard = {
      nodes: structuredClone(d.nodes.filter((n) => set.has(n.id) && n.type !== "trigger")),
      edges: structuredClone(d.edges.filter((e) => set.has(e.source) && set.has(e.target))),
    };
  }, []);

  const paste = useCallback(
    (offset = 60) => {
      if (!clipboard?.nodes.length || !canEdit) return;
      const map = new Map<string, string>();
      const nodesCopy = clipboard.nodes.map((n) => {
        const id = uid(n.type === "comment" ? "k" : "s");
        map.set(n.id, id);
        return { ...structuredClone(n), id, position: { x: n.position.x + offset, y: n.position.y + offset } } as DraftNode;
      });
      const edgesCopy = clipboard.edges.map((e) => ({ ...e, id: uid("e"), source: map.get(e.source)!, target: map.get(e.target)! }));
      update((d) => {
        d.nodes.push(...nodesCopy);
        d.edges.push(...edgesCopy);
        return d;
      });
      if (nodesCopy[0]) onSelect(nodesCopy[0].id);
    },
    [canEdit, update, onSelect],
  );

  const removeNode = useCallback(
    (id: string) => {
      update((d) => {
        d.nodes = d.nodes.filter((n) => n.id !== id || n.type === "trigger");
        d.edges = d.edges.filter((e) => e.source !== id && e.target !== id);
        return d;
      });
      onSelect(null);
    },
    [update, onSelect],
  );

  const autoLayout = useCallback(() => {
    const d = useEditor.getState().draft;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 140 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of d.nodes) {
      const el = rf.getInternalNode(n.id);
      g.setNode(n.id, { width: el?.measured?.width ?? 500, height: el?.measured?.height ?? 300 });
    }
    for (const e of d.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    update((dd) => {
      for (const n of dd.nodes) {
        const p = g.node(n.id);
        if (p) n.position = { x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2) };
      }
      return dd;
    });
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 80);
  }, [rf, update]);

  // Klaviatura: Ctrl/⌘+C/V, Ctrl/⌘+0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "0") {
        e.preventDefault();
        rf.fitView({ padding: 0.2, duration: 300 });
      }
      if (!canEdit) return;
      if (mod && e.key.toLowerCase() === "c") {
        const ids = rf.getNodes().filter((n) => n.selected).map((n) => n.id);
        if (ids.length) copy(ids);
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rf, canEdit, copy, paste]);

  const center = () => {
    const box = wrapper.current!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: box.left + box.width / 2 - 200, y: box.top + box.height / 2 - 120 });
  };

  const validHandles = useMemo(() => new Map(draft.nodes.map((n) => [n.id, new Set(sourceHandles(n))])), [draft]);

  return (
    <div ref={wrapper} className="relative h-full w-full bg-canvas" data-testid="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges.filter((e) => validHandles.get(e.source)?.has(e.sourceHandle ?? ""))}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={(changes) => {
          const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
          if (removed.length && canEdit) update((d) => ({ ...d, edges: d.edges.filter((e) => !removed.includes(e.id)) }));
        }}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={() => (connecting.current = true)}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => {
          onSelect(null);
          setMenu(null);
          setCtxMenu(null);
        }}
        onNodeContextMenu={(e, n) => {
          e.preventDefault();
          const box = wrapper.current!.getBoundingClientRect();
          setCtxMenu({ x: e.clientX - box.left, y: e.clientY - box.top, id: n.id });
        }}
        onMove={(_, vp) => setZoom(vp.zoom)}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        deleteKeyCode={canEdit ? ["Delete", "Backspace"] : null}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={initialFit}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background color="transparent" />
      </ReactFlow>

      {sidebarOpen && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-bg-muted px-4 py-1.5 text-[13px] font-medium text-muted shadow-sm ring-1 ring-border">
          {t.builder.editInSidebar}
        </div>
      )}

      {/* O'ng tomondagi suzuvchi tugmalar */}
      {canEdit && (
        <StepMenu
          trigger={
            <button className="absolute right-6 top-6 flex size-20 items-center justify-center rounded-full bg-primary text-primary-fg shadow-fab hover:bg-[#27272a]" aria-label={t.builder.addStep}>
              <Plus className="size-9" />
            </button>
          }
          onPick={(type) => addStep(type, center())}
        />
      )}
      <div className="absolute right-[38px] top-[124px] flex flex-col overflow-hidden rounded-[8px] border border-border bg-bg shadow-sm">
        {canEdit && (
          <Tooltip content={t.builder.autoLayout} side="left">
            <button onClick={autoLayout} className="flex size-12 items-center justify-center border-b border-border hover:bg-bg-muted" aria-label={t.builder.autoLayout}>
              <Sparkles className="size-5" />
            </button>
          </Tooltip>
        )}
        <Tooltip content={t.builder.zoomIn} side="left">
          <button onClick={() => rf.zoomIn({ duration: 150 })} disabled={zoom >= 2} className="flex size-12 items-center justify-center border-b border-border hover:bg-bg-muted disabled:opacity-40" aria-label={t.builder.zoomIn}>
            <Plus className="size-5" />
          </button>
        </Tooltip>
        <Tooltip content={t.builder.zoomOut} side="left">
          <button onClick={() => rf.zoomOut({ duration: 150 })} disabled={zoom <= 0.1} className="flex size-12 items-center justify-center hover:bg-bg-muted disabled:opacity-40" aria-label={t.builder.zoomOut}>
            <Minus className="size-5" />
          </button>
        </Tooltip>
      </div>
      <div className="absolute bottom-3 right-[92px] rounded-[6px] bg-bg px-2 py-1 text-[12px] font-medium text-muted shadow-sm">{Math.round(zoom * 100)}%</div>
      <Popover>
        <PopoverTrigger asChild>
          <button className="absolute bottom-6 right-6 flex size-12 items-center justify-center rounded-full border border-border bg-bg shadow-sm hover:bg-bg-muted" aria-label={t.builder.help}>
            <HelpCircle className="size-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-80">
          <h4 className="mb-2 text-sm font-semibold">{t.builder.help}</h4>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-muted">
            {t.builder.helpItems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      {/* Bo'sh joyga tashlanganda — step turlari */}
      {menu && (
        <StepMenu
          open
          onOpenChange={(v) => !v && setMenu(null)}
          anchor={{ x: menu.x, y: menu.y }}
          onPick={(type) => addStep(type, menu.flow, menu.from)}
        />
      )}

      {/* Node kontekst menyusi (o'ng tugma) */}
      {ctxMenu && (
        <div className="absolute z-50 min-w-[220px] rounded-[8px] border border-border bg-bg p-1 shadow-pop" style={{ left: ctxMenu.x, top: ctxMenu.y }} role="menu">
          {[
            { label: t.builder.ctxCopy, icon: Copy, run: () => copy([ctxMenu.id]), show: true },
            { label: t.builder.ctxDuplicate, icon: CopyPlus, run: () => { copy([ctxMenu.id]); paste(40); }, show: canEdit },
            {
              label: t.builder.ctxSetStart,
              icon: Play,
              run: () => connect("trigger", "then", ctxMenu.id),
              show: canEdit && draft.nodes.find((n) => n.id === ctxMenu.id)?.type !== "trigger" && draft.nodes.find((n) => n.id === ctxMenu.id)?.type !== "comment",
            },
            { label: t.builder.ctxDelete, icon: Trash2, run: () => removeNode(ctxMenu.id), show: canEdit && draft.nodes.find((n) => n.id === ctxMenu.id)?.type !== "trigger" },
          ]
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.label}
                role="menuitem"
                onClick={() => {
                  x.run();
                  setCtxMenu(null);
                }}
                className="flex h-9 w-full items-center gap-2 rounded-[6px] px-2.5 text-left text-[13px] hover:bg-bg-muted"
              >
                <x.icon className="size-4" />
                {x.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function StepMenu({
  trigger,
  onPick,
  open,
  onOpenChange,
  anchor,
}: {
  trigger?: React.ReactNode;
  onPick: (t: StepType) => void;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  anchor?: { x: number; y: number };
}) {
  const t = useT();
  const [o, setO] = useState(false);
  const isOpen = open ?? o;
  const setOpen = onOpenChange ?? setO;
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      {anchor ? <PopoverAnchor className="absolute" style={{ left: anchor.x, top: anchor.y }} /> : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent align={anchor ? "start" : "end"} className="w-80 p-1.5" role="menu" aria-label={t.builder.addStep}>
        {STEP_TYPES.map(({ type, icon: Icon }) => (
          <button
            key={type}
            role="menuitem"
            onClick={() => {
              onPick(type);
              setOpen(false);
            }}
            className={cn("flex w-full items-start gap-3 rounded-[6px] px-2.5 py-2 text-left hover:bg-bg-muted")}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block text-sm font-medium">{t.builder.stepTypes[type]}</span>
              <span className="block text-[12px] text-muted">{t.builder.stepTypeDesc[type]}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
