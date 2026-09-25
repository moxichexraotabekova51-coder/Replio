"use client";

import { Check, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/components/providers/app-provider";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import type { FlowRow } from "@/lib/queries/automation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/automation/flow-items";

export function BuilderToolbar({
  flow,
  right,
}: {
  flow: Pick<FlowRow, "id" | "name" | "status" | "has_unpublished">;
  right?: React.ReactNode;
}) {
  const t = useT();
  const perms = usePermissions();
  const [name, setName] = useState(flow.name);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(flow.name);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const v = draftName.trim().slice(0, 200);
    setEditing(false);
    if (!v || v === name) return setDraftName(name);
    const prev = name;
    setName(v);
    setSaving(true);
    const { error } = await createClient().from("flows").update({ name: v }).eq("id", flow.id);
    setSaving(false);
    if (error) {
      setName(prev);
      setDraftName(prev);
      toast.error(t.errors.generic);
    }
  }

  return (
    <div className="flex min-h-[84px] shrink-0 items-center gap-4 border-b border-border bg-bg px-4 md:px-8">
      <nav className="flex min-w-0 items-center gap-2 text-[18px]" aria-label="breadcrumb">
        <Link href="/app/automation" className="shrink-0 text-muted hover:text-fg">
          Automations
        </Link>
        <ChevronRight className="size-4 shrink-0 text-muted" />
        {editing ? (
          <input
            autoFocus
            value={draftName}
            maxLength={200}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") {
                setDraftName(name);
                setEditing(false);
              }
            }}
            className="h-9 min-w-0 rounded-[6px] border border-fg px-2 font-semibold outline-none"
          />
        ) : (
          <>
            <span className="truncate font-semibold">{name}</span>
            {perms.canEdit && (
              <button
                onClick={() => {
                  setDraftName(name);
                  setEditing(true);
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                aria-label={t.common.rename}
              >
                <Pencil className="size-4" />
              </button>
            )}
          </>
        )}
        <StatusBadge flow={flow} />
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm text-muted">
        {saving ? (
          <span className="flex items-center gap-1.5">
            <Spinner className="size-3.5" />
            {t.common.saving}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Check className="size-4" />
            {t.common.saved}
          </span>
        )}
        {right}
      </div>
    </div>
  );
}
