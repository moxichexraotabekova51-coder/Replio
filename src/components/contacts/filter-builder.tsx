"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Dictionary } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useAllFields } from "@/lib/queries/builder";
import { useSequencesList, type ContactFilter, type FilterRule } from "@/lib/queries/contacts";
import { useTagsList } from "@/lib/queries/inbox";
import { cn } from "@/lib/utils";

type Kind = FilterRule["kind"];
const SYSTEM = ["first_name", "last_name", "username", "language_code", "is_subscribed", "live_chat_status"] as const;

export function ruleLabel(
  t: Dictionary,
  r: FilterRule,
  lookup: { tags: Map<string, string>; fields: Map<string, string>; sequences: Map<string, string> },
): string {
  const c = t.contacts;
  switch (r.kind) {
    case "tag":
      return `${c.kind.tag}: ${lookup.tags.get(r.tag_id) ?? "…"} ${r.neg ? c.hasNot : c.has}`;
    case "sequence":
      return `${c.kind.sequence}: ${lookup.sequences.get(r.sequence_id) ?? "…"} ${r.neg ? c.hasNot : c.has}`;
    case "subscribed":
      return `${c.kind.subscribed}: ${r.value} ${c.cmp[r.cmp]}`;
    case "field":
    case "system": {
      const name = r.kind === "field" ? lookup.fields.get(r.field_id) ?? "…" : c.systemFields[r.field as keyof typeof c.systemFields];
      return r.cmp === "empty" || r.cmp === "not_empty" ? `${name} ${c.cmp[r.cmp]}` : `${name} ${c.cmp[r.cmp]} ${r.value ?? ""}`;
    }
  }
}

export function FilterBar({ filter, onChange }: { filter: ContactFilter; onChange: (f: ContactFilter) => void }) {
  const t = useT();
  const tags = useTagsList();
  const fields = useAllFields();
  const sequences = useSequencesList();
  const lookup = {
    tags: new Map((tags.data ?? []).map((x) => [x.id, x.name])),
    fields: new Map((fields.data ?? []).filter((f) => !f.is_bot_field).map((x) => [x.id, x.name])),
    sequences: new Map((sequences.data ?? []).map((x) => [x.id, x.name])),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filter.rules.map((r, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...filter, op: filter.op === "and" ? "or" : "and" })}
              className="rounded-[4px] border border-border-strong px-1.5 text-[11px] font-semibold hover:border-fg"
              title={filter.op === "and" ? t.contacts.matchAll : t.contacts.matchAny}
            >
              {filter.op === "and" ? t.contacts.and : t.contacts.or}
            </button>
          )}
          <span className="flex h-8 items-center gap-1 rounded-[6px] bg-fg pl-2.5 pr-1 text-[13px] font-medium text-bg">
            {ruleLabel(t, r, lookup)}
            <button
              type="button"
              onClick={() => onChange({ ...filter, rules: filter.rules.filter((_, j) => j !== i) })}
              className="flex size-6 items-center justify-center rounded hover:bg-white/15"
              aria-label="Filtrni olib tashlash"
            >
              <X className="size-3.5" />
            </button>
          </span>
        </span>
      ))}
      <AddRule onAdd={(r) => onChange({ ...filter, rules: [...filter.rules, r] })} />
      {filter.rules.length > 0 && (
        <button type="button" onClick={() => onChange({ op: "and", rules: [] })} className="text-[13px] font-medium text-muted hover:text-fg hover:underline">
          {t.contacts.clearFilters}
        </button>
      )}
    </div>
  );
}

function AddRule({ onAdd }: { onAdd: (r: FilterRule) => void }) {
  const t = useT();
  const tags = useTagsList();
  const fields = useAllFields();
  const sequences = useSequencesList();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("tag");
  const [ref, setRef] = useState("");
  const [neg, setNeg] = useState(false);
  const [cmp, setCmp] = useState("eq");
  const [value, setValue] = useState("");

  const reset = (k: Kind) => {
    setKind(k);
    setRef("");
    setNeg(false);
    setCmp(k === "subscribed" ? "after" : "eq");
    setValue("");
  };

  const needsValue = !(cmp === "empty" || cmp === "not_empty");
  const valid =
    (kind === "tag" || kind === "sequence" || kind === "field" || kind === "system" ? !!ref : true) &&
    (kind === "tag" || kind === "sequence" || !needsValue || !!value.trim());

  function add() {
    let r: FilterRule;
    if (kind === "tag") r = { kind, tag_id: ref, neg };
    else if (kind === "sequence") r = { kind, sequence_id: ref, neg };
    else if (kind === "subscribed") r = { kind, cmp: cmp as "before" | "after", value };
    else if (kind === "field") r = { kind, field_id: ref, cmp: cmp as never, value: needsValue ? value.trim() : undefined };
    else r = { kind, field: ref, cmp: cmp as never, value: needsValue ? value.trim() : undefined };
    onAdd(r);
    setOpen(false);
    reset("tag");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-[6px] border border-dashed border-border-dashed px-2.5 text-[13px] font-medium hover:border-fg">
        <Plus className="size-4" />
        {t.contacts.filter}
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="flex flex-wrap gap-1">
          {(["tag", "field", "system", "sequence", "subscribed"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => reset(k)}
              className={cn("h-7 rounded-[6px] border border-border px-2 text-[12px] font-medium", kind === k && "border-fg bg-fg text-bg")}
            >
              {t.contacts.kind[k]}
            </button>
          ))}
        </div>

        {(kind === "tag" || kind === "sequence") && (
          <>
            <NativeSelect value={ref} onChange={(e) => setRef(e.target.value)} aria-label={t.contacts.kind[kind]}>
              <option value="">—</option>
              {(kind === "tag" ? tags.data : sequences.data)?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={neg ? "1" : "0"} onChange={(e) => setNeg(e.target.value === "1")} aria-label="Shart">
              <option value="0">{t.contacts.has}</option>
              <option value="1">{t.contacts.hasNot}</option>
            </NativeSelect>
          </>
        )}

        {(kind === "field" || kind === "system") && (
          <>
            <NativeSelect value={ref} onChange={(e) => setRef(e.target.value)} aria-label={t.contacts.kind[kind]}>
              <option value="">—</option>
              {kind === "field"
                ? fields.data
                    ?.filter((f) => !f.is_bot_field)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))
                : SYSTEM.map((f) => (
                    <option key={f} value={f}>
                      {t.contacts.systemFields[f]}
                    </option>
                  ))}
            </NativeSelect>
            <NativeSelect value={cmp} onChange={(e) => setCmp(e.target.value)} aria-label="Taqqoslash">
              {(kind === "field" ? ["eq", "neq", "gt", "lt", "contains", "empty", "not_empty"] : ["eq", "neq", "contains", "empty", "not_empty"]).map((c) => (
                <option key={c} value={c}>
                  {t.contacts.cmp[c as keyof typeof t.contacts.cmp]}
                </option>
              ))}
            </NativeSelect>
            {needsValue && (
              <div>
                <Label htmlFor="flt-val">{t.contacts.value}</Label>
                <Input id="flt-val" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            )}
          </>
        )}

        {kind === "subscribed" && (
          <>
            <NativeSelect value={cmp} onChange={(e) => setCmp(e.target.value)} aria-label="Taqqoslash">
              <option value="after">{t.contacts.cmp.after}</option>
              <option value="before">{t.contacts.cmp.before}</option>
            </NativeSelect>
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t.contacts.value} />
          </>
        )}

        <Button size="sm" className="w-full" disabled={!valid} onClick={add}>
          {t.contacts.addFilter}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
