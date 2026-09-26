"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Copy, Folder, FolderInput, LayoutGrid, List, Plus, Square, Trash2, Workflow, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import {
  useCreateFolder,
  useDeleteFolder,
  useDuplicateFlows,
  useFlows,
  useFolders,
  useRenameFolder,
  useTrashFlows,
  useUpdateFlows,
  type FlowRow,
  type FolderRow,
} from "@/lib/queries/automation";
import { TRIGGER_TYPES } from "@/lib/triggers";
import { cn } from "@/lib/utils";
import { FilterSelect } from "./filter-select";
import { FlowGridItem, FlowListItem, LIST_COLS, type FlowActions } from "./flow-items";
import { FolderCard, NewFolderCard, useDropTarget } from "./folder-items";
import { NameDialog } from "./name-dialog";
import { NewAutomationDialog } from "./new-automation-dialog";

type SortKey = "name" | "modified";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type TriggerFilter = "any" | (typeof TRIGGER_TYPES)[number];
type StateFilter = "any" | "active" | "paused";

const VIEW_KEY = "replio.automation.view";

export function MyAutomations() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const perms = usePermissions();
  const folderId = params.get("folder");

  const flowsQ = useFlows();
  const foldersQ = useFolders();
  const updateFlows = useUpdateFlows();
  const trashFlows = useTrashFlows();
  const duplicateFlows = useDuplicateFlows();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("any");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");
  const [sort, setSort] = useState<Sort>({ key: "modified", dir: "desc" });
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<FlowRow | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<FolderRow | null>(null);
  const [deleting, setDeleting] = useState<FlowRow[] | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderRow | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* e'tiborsiz */
    }
  }, []);

  const toggleView = () => {
    const next = view === "list" ? "grid" : "list";
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* e'tiborsiz */
    }
  };

  // Papka almashganda tanlov tozalanadi
  useEffect(() => setSelected(new Set()), [folderId]);

  const allFlows = useMemo(() => (flowsQ.data ?? []).filter((f) => !f.is_basic), [flowsQ.data]);
  const folders = foldersQ.data ?? [];
  const currentFolder = folderId ? folders.find((f) => f.id === folderId) : undefined;

  const searching = search.trim().length > 0;
  const filtering = searching || triggerFilter !== "any" || stateFilter !== "any";

  const flows = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = allFlows.filter((f) => {
      if (!filtering && (folderId ? f.folder_id !== folderId : f.folder_id !== null)) return false;
      if (filtering && folderId && f.folder_id !== folderId) return false;
      if (s && !f.name.toLowerCase().includes(s)) return false;
      if (triggerFilter !== "any" && !f.triggers.some((tr) => tr.type === triggerFilter)) return false;
      if (stateFilter === "active" && !f.triggers.some((tr) => tr.is_active)) return false;
      if (stateFilter === "paused" && !f.triggers.some((tr) => !tr.is_active)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const r = sort.key === "name" ? a.name.localeCompare(b.name, "uz") : a.updated_at.localeCompare(b.updated_at);
      return sort.dir === "asc" ? r : -r;
    });
    return list;
  }, [allFlows, filtering, folderId, search, triggerFilter, stateFilter, sort]);

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of allFlows) if (f.folder_id) m.set(f.folder_id, (m.get(f.folder_id) ?? 0) + 1);
    return m;
  }, [allFlows]);

  const openFlow = useCallback((f: FlowRow) => router.push(`/app/automation/${f.id}`), [router]);
  // Builder marshruti (JS + React Flow) oldindan yuklanadi — ro'yxatdan ochish tez
  useEffect(() => {
    const first = allFlows[0];
    if (first) router.prefetch(`/app/automation/${first.id}`);
  }, [allFlows, router]);

  const moveFlows = useCallback(
    (ids: string[], target: string | null) => {
      const toMove = ids.filter((id) => allFlows.find((f) => f.id === id)?.folder_id !== target);
      if (toMove.length) updateFlows.mutate({ ids: toMove, patch: { folder_id: target } });
      setSelected(new Set());
    },
    [allFlows, updateFlows],
  );

  const actions: FlowActions | null = perms.canEdit
    ? {
        rename: (f) => setRenaming(f),
        duplicate: (f) => duplicateFlows.mutate([f.id]),
        move: (f, target) => moveFlows([f.id], target),
        setStatus: (f, status) => updateFlows.mutate({ ids: [f.id], patch: { status } }),
        remove: (f) => setDeleting([f]),
      }
    : null;

  const allSelected = flows.length > 0 && flows.every((f) => selected.has(f.id));
  const someSelected = flows.some((f) => selected.has(f.id));
  const selectedFlows = allFlows.filter((f) => selected.has(f.id));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const rootDrop = useDropTarget((ids) => moveFlows(ids, null));

  const triggerOptions = [
    { value: "any" as const, label: t.automation.anyTrigger },
    ...TRIGGER_TYPES.map((tt) => ({ value: tt, label: t.triggerTypes[tt] })),
  ];
  const stateOptions = [
    { value: "any" as const, label: t.automation.anyTriggerState },
    { value: "active" as const, label: t.automation.stateActive },
    { value: "paused" as const, label: t.automation.statePaused },
  ];

  const loading = flowsQ.isLoading || foldersQ.isLoading;
  const totallyEmpty = !loading && allFlows.length === 0 && folders.length === 0;

  return (
    <div className="px-4 py-6 pb-28 md:px-11 md:py-8">
      {/* Sarlavha qatori */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] md:text-[32px]">{t.automation.myAutomations}</h2>
        {perms.canEdit && (
          <Button size="lg" onClick={() => setNewOpen(true)} className="h-12 shrink-0">
            <Plus className="size-5" />
            {t.automation.newAutomation}
          </Button>
        )}
      </div>

      {/* Filtrlar */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t.automation.searchPlaceholder} inputClassName="h-12" />
        <FilterSelect value={triggerFilter} options={triggerOptions} onChange={setTriggerFilter} ariaLabel={t.automation.anyTrigger} />
        <FilterSelect value={stateFilter} options={stateOptions} onChange={setStateFilter} ariaLabel={t.automation.anyTriggerState} />
      </div>

      <div className="mt-4 grid items-start gap-4 md:grid-cols-3">
        <div>{perms.canEdit && !folderId && <NewFolderCard onCreate={(name) => createFolder.mutate(name)} />}</div>
        <div className="max-md:hidden" />
        <div className="flex flex-col items-end gap-2 max-md:flex-row max-md:justify-between">
          <Link href="/app/automation/trash" className="flex h-8 items-center gap-1.5 text-sm font-medium hover:underline">
            <Trash2 className="size-4" />
            {t.automation.trash}
          </Link>
          <button onClick={toggleView} className="flex h-8 items-center gap-1.5 text-sm font-medium hover:underline">
            {view === "list" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
            {view === "list" ? t.automation.viewGrid : t.automation.viewList}
          </button>
        </div>
      </div>

      {/* Papka ichida — breadcrumb */}
      {folderId && (
        <nav className="mt-6 flex items-center gap-2 text-sm" aria-label="breadcrumb">
          <Link
            href="/app/automation"
            {...(perms.canEdit ? rootDrop.props : {})}
            className={cn("rounded-[6px] px-1.5 py-1 text-muted hover:text-fg", rootDrop.over && "bg-bg-muted text-fg ring-2 ring-fg")}
          >
            {t.automation.root}
          </Link>
          <ChevronRight className="size-4 text-muted" />
          <span className="flex items-center gap-1.5 font-semibold">
            <Folder className="size-4" />
            {currentFolder?.name ?? "…"}
          </span>
        </nav>
      )}

      {flowsQ.isError && (
        <div className="mt-6">
          <ErrorState message={t.errors.generic} onRetry={() => flowsQ.refetch()} retryLabel={t.common.retry} />
        </div>
      )}

      {loading ? (
        <div className="mt-8 space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[12px]" />
          ))}
        </div>
      ) : totallyEmpty ? (
        <EmptyState
          className="mt-8 rounded-[12px] border border-border bg-bg"
          icon={<Workflow />}
          title={t.automation.emptyTitle}
          description={t.automation.emptyDesc}
          action={
            perms.canEdit ? (
              <Button size="lg" onClick={() => setNewOpen(true)}>
                <Plus className="size-5" />
                {t.automation.newAutomation}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Papkalar (faqat asosiy darajada) */}
          {!folderId && !filtering && folders.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  count={folderCounts.get(f.id) ?? 0}
                  editable={perms.canEdit}
                  onOpen={() => router.push(`/app/automation?folder=${f.id}`)}
                  onRename={() => setRenamingFolder(f)}
                  onDelete={() => setDeletingFolder(f)}
                  onDropFlows={(ids) => moveFlows(ids, f.id)}
                />
              ))}
            </div>
          )}

          {/* Jadval sarlavhasi */}
          {view === "list" && flows.length > 0 && (
            <div className={cn("mt-8 grid items-center gap-x-4 px-6 text-[13px] font-medium text-muted", LIST_COLS)}>
              <span className="flex">
                {perms.canEdit && (
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(flows.map((f) => f.id)) : new Set())}
                    aria-label="Hammasini tanlash"
                  />
                )}
              </span>
              <SortButton label={t.automation.colName} active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
              <span className="text-right max-md:hidden">{t.automation.colRuns}</span>
              <span className="text-right max-md:hidden">{t.automation.colCtr}</span>
              <span className="flex justify-end max-md:hidden">
                <SortButton label={t.automation.colModified} active={sort.key === "modified"} dir={sort.dir} onClick={() => toggleSort("modified")} />
              </span>
              <span />
            </div>
          )}
          {view === "grid" && flows.length > 0 && (
            <div className="mt-8 flex items-center gap-4 text-[13px] font-medium text-muted">
              {perms.canEdit && (
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(flows.map((f) => f.id)) : new Set())}
                  aria-label="Hammasini tanlash"
                />
              )}
              <SortButton label={t.automation.colName} active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
              <SortButton label={t.automation.colModified} active={sort.key === "modified"} dir={sort.dir} onClick={() => toggleSort("modified")} />
            </div>
          )}

          {flows.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">
              {filtering ? t.automation.emptySearch : folderId ? t.automation.emptyFolder : t.automation.emptyTitle}
            </p>
          ) : (
            <div className={cn("mt-3", view === "list" ? "flex flex-col gap-6" : "grid gap-6 sm:grid-cols-2 xl:grid-cols-3")}>
              {flows.map((f) => {
                const Item = view === "list" ? FlowListItem : FlowGridItem;
                return (
                  <Item
                    key={f.id}
                    flow={f}
                    folders={folders.filter((x) => !x.id.startsWith("temp-"))}
                    selected={selected.has(f.id)}
                    selectable={perms.canEdit}
                    onSelect={(v) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (v) n.add(f.id);
                        else n.delete(f.id);
                        return n;
                      })
                    }
                    onOpen={() => openFlow(f)}
                    actions={actions}
                    dragIds={() => (selected.has(f.id) ? [...selected] : [f.id])}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Ommaviy amallar paneli */}
      {selectedFlows.length > 0 && perms.canEdit && (
        <BulkBar
          count={selectedFlows.length}
          folders={folders.filter((x) => !x.id.startsWith("temp-"))}
          onMove={(target) => moveFlows([...selected], target)}
          onDuplicate={() => {
            duplicateFlows.mutate([...selected]);
            setSelected(new Set());
          }}
          onStop={() => {
            const live = selectedFlows.filter((f) => f.status === "live").map((f) => f.id);
            if (live.length) updateFlows.mutate({ ids: live, patch: { status: "stopped" } });
            setSelected(new Set());
          }}
          canStop={selectedFlows.some((f) => f.status === "live")}
          onDelete={() => setDeleting(selectedFlows)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <NewAutomationDialog open={newOpen} onOpenChange={setNewOpen} folderId={folderId} />
      <NameDialog
        open={!!renaming}
        onOpenChange={(v) => !v && setRenaming(null)}
        title={t.common.rename}
        initial={renaming?.name}
        onSubmit={(name) => {
          if (renaming) updateFlows.mutate({ ids: [renaming.id], patch: { name } });
        }}
      />
      <NameDialog
        open={!!renamingFolder}
        onOpenChange={(v) => !v && setRenamingFolder(null)}
        title={t.common.rename}
        initial={renamingFolder?.name}
        maxLength={100}
        onSubmit={(name) => {
          if (renamingFolder) renameFolder.mutate({ id: renamingFolder.id, name });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t.automation.deleteConfirmTitle}
        description={
          deleting && deleting.length === 1
            ? fmt(t.automation.deleteConfirm, { name: deleting[0].name })
            : fmt(t.automation.deleteManyConfirm, { n: deleting?.length ?? 0 })
        }
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deleting) trashFlows.mutate(deleting.map((f) => f.id));
          setSelected(new Set());
        }}
      />
      <ConfirmDialog
        open={!!deletingFolder}
        onOpenChange={(v) => !v && setDeletingFolder(null)}
        destructive
        title={t.common.delete}
        description={deletingFolder ? fmt(t.automation.deleteFolderConfirm, { name: deletingFolder.name }) : ""}
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deletingFolder) {
            deleteFolder.mutate(deletingFolder.id);
            if (folderId === deletingFolder.id) router.push("/app/automation");
          }
        }}
      />
    </div>
  );
}

function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1 hover:text-fg", active && "text-fg")}>
      {label}
      <Icon className="size-3.5" />
    </button>
  );
}

function BulkBar({
  count,
  folders,
  onMove,
  onDuplicate,
  onStop,
  canStop,
  onDelete,
  onClear,
}: {
  count: number;
  folders: FolderRow[];
  onMove: (folderId: string | null) => void;
  onDuplicate: () => void;
  onStop: () => void;
  canStop: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  const t = useT();
  const btn = "flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium hover:bg-white/10 disabled:opacity-40";
  return (
    <div role="toolbar" aria-label="Ommaviy amallar" className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[12px] bg-fg px-3 py-2 text-bg shadow-pop animate-up md:bottom-6">
      <span className="px-2 text-[13px] font-semibold">{fmt(t.common.selected, { n: count })}</span>
      <span className="mx-1 h-5 w-px bg-white/20" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={btn}>
            <FolderInput className="size-4" />
            <span className="max-sm:hidden">{t.automation.bulkMove}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => onMove(null)}>{t.automation.noFolder}</DropdownMenuItem>
          {folders.map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => onMove(f.id)}>
              <Folder />
              <span className="truncate">{f.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button className={btn} onClick={onDuplicate}>
        <Copy className="size-4" />
        <span className="max-sm:hidden">{t.automation.bulkDuplicate}</span>
      </button>
      <button className={btn} onClick={onStop} disabled={!canStop}>
        <Square className="size-4" />
        <span className="max-sm:hidden">{t.automation.bulkStop}</span>
      </button>
      <button className={btn} onClick={onDelete}>
        <Trash2 className="size-4" />
        <span className="max-sm:hidden">{t.automation.bulkDelete}</span>
      </button>
      <span className="mx-1 h-5 w-px bg-white/20" />
      <button className="flex size-9 items-center justify-center rounded-[6px] hover:bg-white/10" onClick={onClear} aria-label={t.common.clearSelection}>
        <X className="size-4" />
      </button>
    </div>
  );
}
