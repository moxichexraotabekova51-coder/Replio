"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, Input, Label } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils";
import { Card, SectionTitle } from "./section";

type TagRow = { id: string; name: string; folder: string | null; contacts: number };

export function TagsSection() {
  const t = useT();
  const app = useApp();
  const { canChat } = usePermissions();
  const qc = useQueryClient();
  const acc = app.account.id;
  const key = [acc, "tags"];
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TagRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<TagRow | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient().rpc("tags_with_counts", { p_account_id: acc });
      if (error) throw error;
      return data as TagRow[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, name, folder }: { id?: string; name: string; folder: string | null }) => {
      const supabase = createClient();
      const { error } = id
        ? await supabase.from("tags").update({ name, folder }).eq("id", id)
        : await supabase.from("tags").insert({ account_id: acc, name, folder });
      if (error) throw new Error(error.code === "23505" ? "Bunday teg allaqachon mavjud" : t.errors.generic);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: [acc, "tags", "list"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prev = qc.getQueryData<TagRow[]>(key);
      qc.setQueryData<TagRow[]>(key, (old) => old?.filter((x) => x.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(t.errors.generic);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [acc, "tags"] }),
  });

  const rows = (q.data ?? []).filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <SectionTitle
        title={t.settings.tags}
        description={t.settings.tagsDesc}
        action={
          canChat && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t.settings.newTag}
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : q.data?.length === 0 ? (
        <Card>
          <EmptyState icon={<Tag />} title={t.settings.tagsEmpty} className="py-8" />
        </Card>
      ) : (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder={t.common.search} className="mb-4 max-w-sm" />
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-6 py-3.5">
                  <Tag className="size-4 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    {r.folder && <span className="block text-[12px] text-muted">{r.folder}</span>}
                  </span>
                  <span className="text-[13px] text-muted">{fmt(t.settings.contactsCount, { n: formatNumber(r.contacts) })}</span>
                  {canChat && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label="Amallar">
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(r)}>
                          <Pencil />
                          {t.common.edit}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDeleting(r)}>
                          <Trash2 />
                          {t.common.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <TagDialog
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing === "new" ? null : editing}
        onSubmit={(v) => save.mutateAsync({ id: editing && editing !== "new" ? editing.id : undefined, ...v })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t.common.delete}
        description={deleting ? `"${deleting.name}" — ${fmt(t.settings.contactsCount, { n: deleting.contacts })}` : ""}
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

function TagDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: TagRow | null;
  onSubmit: (v: { name: string; folder: string | null }) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{initial ? t.common.edit : t.settings.newTag}</DialogTitle>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setError(t.common.required);
            setBusy(true);
            try {
              await onSubmit({ name: name.trim().slice(0, 64), folder: folder.trim() || null });
              onOpenChange(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="tag-name">{t.settings.tagName}</Label>
            <Input id="tag-name" autoFocus maxLength={64} value={name} aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(undefined); }} />
            <FieldError>{error}</FieldError>
          </div>
          <div>
            <Label htmlFor="tag-folder">{t.settings.tagFolder}</Label>
            <Input id="tag-folder" maxLength={64} value={folder} onChange={(e) => setFolder(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={busy}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
