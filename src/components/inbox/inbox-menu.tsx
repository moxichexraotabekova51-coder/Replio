"use client";

import { ChevronDown, ChevronsLeft, Clock, Inbox as InboxIcon, Plus } from "lucide-react";
import { useState } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label as FieldLabel } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { useCreateLabel, useInboxCounts, useLabels, type InboxView } from "@/lib/queries/inbox";
import { cn, formatNumber } from "@/lib/utils";
import { LABEL_ICONS, LabelIcon } from "./label-icon";

export function InboxMenu({
  view,
  onView,
  onCollapse,
}: {
  view: InboxView;
  onView: (v: InboxView) => void;
  onCollapse: () => void;
}) {
  const t = useT();
  const perms = usePermissions();
  const counts = useInboxCounts();
  const labels = useLabels();
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [creating, setCreating] = useState(false);

  const item = (active: boolean) =>
    cn(
      "flex h-11 w-full items-center gap-3 rounded-[6px] px-3 text-left text-sm font-medium hover:bg-bg-muted",
      active && "bg-active hover:bg-active",
    );

  return (
    <aside className="relative flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-bg px-4 py-5">
      <button className={item(view.kind === "all")} onClick={() => onView({ kind: "all" })}>
        <InboxIcon className="size-[18px]" strokeWidth={1.75} />
        <span className="flex-1">{t.inbox.allChats}</span>
        <span className="text-[13px] text-muted">{counts.data ? formatNumber(counts.data.open) : ""}</span>
      </button>
      <button className={item(view.kind === "reminders")} onClick={() => onView({ kind: "reminders" })}>
        <Clock className="size-[18px]" strokeWidth={1.75} />
        {t.inbox.reminders}
      </button>

      <div className="mt-5 flex items-center justify-between pl-3 pr-1">
        <button
          onClick={() => setLabelsOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg"
          aria-expanded={labelsOpen}
        >
          <ChevronDown className={cn("size-4 transition-transform", !labelsOpen && "-rotate-90")} />
          {t.inbox.labels}
        </button>
        {perms.canChat && (
          <button
            onClick={() => setCreating(true)}
            className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
            aria-label={t.inbox.newLabel}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {labelsOpen && (
        <div className="mt-1 flex flex-col gap-0.5 overflow-y-auto scrollbar-thin">
          {labels.data?.map((l) => (
            <button key={l.id} className={item(view.kind === "label" && view.id === l.id)} onClick={() => onView({ kind: "label", id: l.id })}>
              <LabelIcon icon={l.icon} filled={l.is_default} className="size-[18px]" />
              <span className="truncate">{l.name}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onCollapse}
        className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
        aria-label={t.inbox.collapse}
      >
        <ChevronsLeft className="size-5" />
      </button>

      <NewLabelDialog open={creating} onOpenChange={setCreating} />
    </aside>
  );
}

function NewLabelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const create = useCreateLabel();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [error, setError] = useState<string>();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setName("");
          setIcon("tag");
          setError(undefined);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>{t.inbox.newLabel}</DialogTitle>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = name.trim();
            if (!v) return setError(t.common.required);
            await create.mutateAsync({ name: v.slice(0, 40), icon }).then(
              () => onOpenChange(false),
              () => undefined,
            );
          }}
        >
          <div>
            <FieldLabel htmlFor="label-name">{t.inbox.labelName}</FieldLabel>
            <Input
              id="label-name"
              autoFocus
              maxLength={40}
              value={name}
              aria-invalid={!!error}
              onChange={(e) => {
                setName(e.target.value);
                setError(undefined);
              }}
            />
            <FieldError>{error}</FieldError>
          </div>
          <div role="radiogroup" aria-label="Ikonka" className="flex gap-2">
            {Object.keys(LABEL_ICONS).map((k) => (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={icon === k}
                onClick={() => setIcon(k)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-[8px] border border-border hover:border-fg",
                  icon === k && "border-2 border-fg bg-bg-muted",
                )}
              >
                <LabelIcon icon={k} className="size-[18px]" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
