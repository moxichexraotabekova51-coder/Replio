"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { uid } from "@/lib/flow/draft";
import { useT } from "@/lib/i18n/provider";
import { useAllFields } from "@/lib/queries/builder";
import { useTagsList } from "@/lib/queries/inbox";
import type { CRule } from "../../../supabase/functions/_shared/flow";

export type Rule = CRule & { id: string };

function blank(kind: CRule["kind"], id: string): Rule {
  switch (kind) {
    case "tag":
      return { id, kind, tag_id: "" };
    case "field":
      return { id, kind, field_id: "", cmp: "eq", value: "" };
    case "system":
      return { id, kind, field: "first_name", cmp: "eq", value: "" };
    case "subscribed":
      return { id, kind, cmp: "after", value: "" };
    case "time":
      return { id, kind, from: "09:00", to: "18:00" };
  }
}

/** Shartlar ro'yxati — Condition step va trigger shartlari uchun umumiy */
export function RulesEditor({
  op,
  rules,
  onChange,
  addLabel,
}: {
  op: "and" | "or";
  rules: Rule[];
  onChange: (op: "and" | "or", rules: Rule[]) => void;
  addLabel: string;
}) {
  const t = useT();
  const tags = useTagsList();
  const fields = useAllFields();
  const set = (i: number, r: Rule) => onChange(op, rules.map((x, j) => (j === i ? r : x)));

  return (
    <div className="space-y-2">
      {rules.length > 1 && (
        <NativeSelect value={op} onChange={(e) => onChange(e.target.value as "and" | "or", rules)} aria-label="AND/OR">
          <option value="and">{t.builder.matchAll}</option>
          <option value="or">{t.builder.matchAny}</option>
        </NativeSelect>
      )}
      {rules.map((r, i) => (
        <div key={r.id} className="space-y-2 rounded-[12px] border border-border p-3" data-testid="rule">
          <div className="flex gap-2">
            <NativeSelect value={r.kind} aria-label="Shart turi" onChange={(e) => set(i, blank(e.target.value as CRule["kind"], r.id))}>
              {(Object.keys(t.builder.ruleKinds) as CRule["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {t.builder.ruleKinds[k]}
                </option>
              ))}
            </NativeSelect>
            <button type="button" onClick={() => onChange(op, rules.filter((_, j) => j !== i))} className="shrink-0 px-2 text-muted hover:text-fg" aria-label={t.common.delete}>
              <Trash2 className="size-4" />
            </button>
          </div>
          {r.kind === "tag" && (
            <div className="flex gap-2">
              <NativeSelect value={r.tag_id} aria-label={t.contacts.kind.tag} onChange={(e) => set(i, { ...r, tag_id: e.target.value })}>
                <option value="">—</option>
                {tags.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="w-32" value={r.neg ? "1" : "0"} aria-label="bor/yo'q" onChange={(e) => set(i, { ...r, neg: e.target.value === "1" })}>
                <option value="0">{t.contacts.has}</option>
                <option value="1">{t.contacts.hasNot}</option>
              </NativeSelect>
            </div>
          )}
          {(r.kind === "field" || r.kind === "system") && (
            <>
              <div className="flex gap-2">
                {r.kind === "field" ? (
                  <NativeSelect value={r.field_id} aria-label={t.contacts.kind.field} onChange={(e) => set(i, { ...r, field_id: e.target.value })}>
                    <option value="">—</option>
                    {fields.data
                      ?.filter((x) => !x.is_bot_field)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </NativeSelect>
                ) : (
                  <NativeSelect value={r.field} aria-label={t.contacts.kind.system} onChange={(e) => set(i, { ...r, field: e.target.value })}>
                    {(Object.keys(t.contacts.systemFields) as (keyof typeof t.contacts.systemFields)[]).map((k) => (
                      <option key={k} value={k}>
                        {t.contacts.systemFields[k]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                <NativeSelect className="w-40" value={r.cmp} aria-label="Taqqoslash" onChange={(e) => set(i, { ...r, cmp: e.target.value })}>
                  {["eq", "neq", "gt", "lt", "contains", "empty", "not_empty"].map((c) => (
                    <option key={c} value={c}>
                      {t.contacts.cmp[c as keyof typeof t.contacts.cmp]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {r.cmp !== "empty" && r.cmp !== "not_empty" && (
                <Input value={r.value ?? ""} aria-label={t.contacts.value} placeholder={t.contacts.value} onChange={(e) => set(i, { ...r, value: e.target.value })} />
              )}
            </>
          )}
          {r.kind === "subscribed" && (
            <div className="flex gap-2">
              <NativeSelect className="w-40" value={r.cmp} aria-label="Taqqoslash" onChange={(e) => set(i, { ...r, cmp: e.target.value as "before" | "after" })}>
                <option value="after">{t.contacts.cmp.after}</option>
                <option value="before">{t.contacts.cmp.before}</option>
              </NativeSelect>
              <Input type="date" value={r.value} aria-label={t.contacts.value} onChange={(e) => set(i, { ...r, value: e.target.value })} />
            </div>
          )}
          {r.kind === "time" && (
            <div className="flex items-center gap-2 text-sm">
              <Input type="time" value={r.from} aria-label={t.builder.timeFrom} onChange={(e) => set(i, { ...r, from: e.target.value })} />
              <span className="text-muted">{t.builder.timeFrom}</span>
              <Input type="time" value={r.to} aria-label={t.builder.timeTo} onChange={(e) => set(i, { ...r, to: e.target.value })} />
              <span className="text-muted">{t.builder.timeTo}</span>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange(op, [...rules, blank("tag", uid("r"))])}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg"
      >
        <Plus className="size-4" />
        {addLabel}
      </button>
    </div>
  );
}

/** Saqlashdan oldin: to'liq bo'lmagan qoidalarni tashlab yuborish */
export function cleanRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => {
    switch (r.kind) {
      case "tag":
        return !!r.tag_id;
      case "field":
        return !!r.field_id;
      case "subscribed":
        return !!r.value;
      case "time":
        return !!r.from && !!r.to;
      default:
        return true;
    }
  });
}
