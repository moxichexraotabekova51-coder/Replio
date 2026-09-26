"use client";

import { GitBranch, Pencil, Play, Plus, Shuffle, Clock, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { planFeatures } from "@/lib/billing";
import { uid, type ActionNode, type CommentNode, type ConditionNode, type DraftAction, type RandomizerNode, type SmartDelayNode, type StartFlowNode, type StepNode } from "@/lib/flow/draft";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useFlows } from "@/lib/queries/automation";
import { useAllFields } from "@/lib/queries/builder";
import { useSequencesList } from "@/lib/queries/contacts";
import { useMembers, useTagsList } from "@/lib/queries/inbox";
import { usePricingModal } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { RulesEditor } from "./rules-editor";
import { useEditor } from "./store";

function useNodeUpdater<T extends StepNode | CommentNode>(id: string) {
  const update = useEditor((s) => s.update);
  return (fn: (n: T) => void) =>
    update((d) => {
      const n = d.nodes.find((x) => x.id === id) as T | undefined;
      if (n) fn(n);
      return d;
    });
}

export function StepHeader({ node, icon }: { node: StepNode; icon: React.ReactNode }) {
  const t = useT();
  const set = useNodeUpdater<StepNode>(node.id);
  const [editing, setEditing] = useState(false);
  return (
    <div className="mb-5 flex items-center gap-2">
      {icon}
      {editing ? (
        <input
          autoFocus
          defaultValue={node.data.name}
          maxLength={60}
          aria-label={t.builder.renameStep}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) set((n) => void (n.data.name = v));
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-9 rounded-[6px] border border-fg px-2 text-[20px] font-semibold outline-none"
        />
      ) : (
        <>
          <h3 className="text-[22px] font-semibold">{node.data.name}</h3>
          <button onClick={() => setEditing(true)} className="flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.builder.renameStep}>
            <Pencil className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── Actions ───────────────────────────

const ACTION_TYPES: DraftAction["a"][] = ["add_tag", "remove_tag", "set_field", "clear_field", "sub_seq", "unsub_seq", "notify", "open_chat", "assign", "http", "delete_contact"];

function blankAction(a: DraftAction["a"]): DraftAction {
  const id = uid("a");
  switch (a) {
    case "add_tag":
    case "remove_tag":
      return { id, a, tag_id: null };
    case "set_field":
      return { id, a, field_id: null, value: "" };
    case "clear_field":
      return { id, a, field_id: null };
    case "sub_seq":
    case "unsub_seq":
      return { id, a, sequence_id: null };
    case "notify":
      return { id, a, text: "🔔 Yangi so'rov: {{full_name}}" };
    case "assign":
      return { id, a, user_id: null };
    case "http":
      return { id, a, method: "POST", url: "https://", headers: [], body: '{\n  "name": "{{full_name}}"\n}', map: [] };
    default:
      return { id, a } as DraftAction;
  }
}

export function ActionEditor({ node }: { node: ActionNode }) {
  const t = useT();
  const app = useApp();
  const f = planFeatures(app.plan);
  const showPricing = usePricingModal((s) => s.show);
  const set = useNodeUpdater<ActionNode>(node.id);
  const issues = useEditor((s) => s.issues);
  const proOnly: Partial<Record<DraftAction["a"], boolean>> = { http: !f.external_request, assign: !f.live_chat_assign };

  return (
    <div>
      <StepHeader node={node} icon={<span className="flex size-8 items-center justify-center rounded-[8px] bg-[#3f3f46] text-bg"><Zap className="size-4" /></span>} />
      <div className="space-y-3">
        {node.data.actions.map((a, i) => (
          <div key={a.id} className={cn("rounded-[12px] border border-border p-3", issues.some((x) => x.blockId === a.id) && "border-2 border-fg")}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{t.builder.actions[a.a]}</span>
              <button onClick={() => set((n) => void n.data.actions.splice(i, 1))} className="flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label={t.common.delete}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <ActionFields action={a} onChange={(na) => set((n) => void (n.data.actions[i] = na))} />
          </div>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg">
            <Plus className="size-4" />
            {t.builder.addAction}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          {ACTION_TYPES.map((a) => (
            <DropdownMenuItem key={a} onSelect={() => (proOnly[a] ? showPricing("pro") : set((n) => void n.data.actions.push(blankAction(a))))}>
              <span className="flex-1">{t.builder.actions[a]}</span>
              {proOnly[a] && <span className="rounded-[4px] bg-fg px-1 text-[9px] font-bold text-bg">{t.builder.upgradeBadge}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ActionFields({ action, onChange }: { action: DraftAction; onChange: (a: DraftAction) => void }) {
  const t = useT();
  const tags = useTagsList();
  const fields = useAllFields();
  const seqs = useSequencesList();
  const members = useMembers();
  switch (action.a) {
    case "add_tag":
    case "remove_tag":
      return (
        <NativeSelect value={action.tag_id ?? ""} onChange={(e) => onChange({ ...action, tag_id: e.target.value || null })} aria-label={t.contacts.kind.tag}>
          <option value="">—</option>
          {tags.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
      );
    case "set_field":
    case "clear_field":
      return (
        <div className="space-y-2">
          <NativeSelect value={action.field_id ?? ""} onChange={(e) => onChange({ ...action, field_id: e.target.value || null })} aria-label={t.settings.fieldName}>
            <option value="">—</option>
            {fields.data
              ?.filter((x) => !x.is_bot_field)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </NativeSelect>
          {action.a === "set_field" && <Input placeholder={t.settings.fieldValue} value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })} aria-label={t.settings.fieldValue} />}
        </div>
      );
    case "sub_seq":
    case "unsub_seq":
      return (
        <NativeSelect value={action.sequence_id ?? ""} onChange={(e) => onChange({ ...action, sequence_id: e.target.value || null })} aria-label={t.contacts.kind.sequence}>
          <option value="">—</option>
          {seqs.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
      );
    case "notify":
      return (
        <div>
          <Textarea rows={2} value={action.text} onChange={(e) => onChange({ ...action, text: e.target.value })} aria-label={t.builder.notifyText} />
          <p className="mt-1 text-[12px] text-muted">{t.builder.notifyHint}</p>
        </div>
      );
    case "assign":
      return (
        <NativeSelect value={action.user_id ?? ""} onChange={(e) => onChange({ ...action, user_id: e.target.value || null })} aria-label={t.builder.assignTo}>
          <option value="">{t.builder.unassign}</option>
          {members.data?.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profile?.full_name ?? m.user_id.slice(0, 8)}
            </option>
          ))}
        </NativeSelect>
      );
    case "http":
      return <HttpFields action={action} onChange={onChange} />;
    default:
      return null;
  }
}

function HttpFields({ action, onChange }: { action: Extract<DraftAction, { a: "http" }>; onChange: (a: DraftAction) => void }) {
  const t = useT();
  const fields = useAllFields();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    const res = await fetch("/api/flows/test-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: action.method, url: action.url, headers: action.headers, body: action.body }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setTesting(false);
    setResult({ status: json.status ?? 0, body: json.body ?? json.error ?? "" });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <NativeSelect className="w-28" value={action.method} onChange={(e) => onChange({ ...action, method: e.target.value as typeof action.method })} aria-label={t.builder.httpMethod}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </NativeSelect>
        <Input value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} aria-label={t.builder.httpUrl} placeholder="https://api.example.com/{{username}}" />
      </div>
      <Label>{t.builder.httpHeaders}</Label>
      {action.headers.map((h, i) => (
        <div key={i} className="flex gap-2">
          <Input value={h.key} placeholder="Authorization" aria-label="Header" onChange={(e) => onChange({ ...action, headers: action.headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
          <Input value={h.value} placeholder="Bearer …" aria-label="Qiymat" onChange={(e) => onChange({ ...action, headers: action.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
          <button onClick={() => onChange({ ...action, headers: action.headers.filter((_, j) => j !== i) })} className="shrink-0 px-2 text-muted hover:text-fg" aria-label={t.common.delete}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button className="text-[13px] font-medium underline-offset-4 hover:underline" onClick={() => onChange({ ...action, headers: [...action.headers, { key: "", value: "" }] })}>
        + {t.builder.addHeader}
      </button>
      {action.method !== "GET" && (
        <>
          <Label>{t.builder.httpBody}</Label>
          <Textarea rows={4} className="font-mono text-[12px]" value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} aria-label={t.builder.httpBody} />
        </>
      )}
      <Label>{t.builder.httpMap}</Label>
      {action.map.map((m, i) => (
        <div key={i} className="flex gap-2">
          <Input value={m.path} placeholder={t.builder.httpPath} aria-label={t.builder.httpPath} onChange={(e) => onChange({ ...action, map: action.map.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)) })} />
          <NativeSelect value={m.field_id ?? ""} aria-label={t.settings.fieldName} onChange={(e) => onChange({ ...action, map: action.map.map((x, j) => (j === i ? { ...x, field_id: e.target.value || null } : x)) })}>
            <option value="">—</option>
            {fields.data
              ?.filter((x) => !x.is_bot_field)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </NativeSelect>
        </div>
      ))}
      <button className="text-[13px] font-medium underline-offset-4 hover:underline" onClick={() => onChange({ ...action, map: [...action.map, { path: "", field_id: null }] })}>
        + {t.builder.addMapping}
      </button>
      <Button size="sm" variant="outline" className="w-full" onClick={test} loading={testing}>
        {testing ? t.builder.testing : t.builder.testRequest}
      </Button>
      {result && (
        <div className="rounded-[8px] bg-bg-muted p-2 text-[12px]">
          <div className="font-semibold">{fmt(t.builder.testResult, { status: result.status })}</div>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all">{result.body}</pre>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Condition ───────────────────────────

export function ConditionEditor({ node }: { node: ConditionNode }) {
  const t = useT();
  const set = useNodeUpdater<ConditionNode>(node.id);
  return (
    <div>
      <StepHeader node={node} icon={<span className="flex size-8 items-center justify-center rounded-[8px] bg-[#71717a] text-bg"><GitBranch className="size-4" /></span>} />
      {node.data.rules.length === 0 && <p className="mb-3 text-sm text-muted">{t.builder.noConditions}</p>}
      <RulesEditor
        op={node.data.op}
        rules={node.data.rules}
        addLabel={t.builder.addCondition}
        onChange={(op, rules) =>
          set((n) => {
            n.data.op = op;
            n.data.rules = rules;
          })
        }
      />
    </div>
  );
}

// ─────────────────────────── Randomizer ───────────────────────────

export function RandomizerEditor({ node }: { node: RandomizerNode }) {
  const t = useT();
  const set = useNodeUpdater<RandomizerNode>(node.id);
  const total = node.data.variants.reduce((s, v) => s + v.pct, 0);
  return (
    <div>
      <StepHeader node={node} icon={<Shuffle className="size-6" />} />
      <div className="space-y-2">
        {node.data.variants.map((v, i) => (
          <div key={v.id} className="flex items-center gap-3">
            <span className="w-24 text-sm font-medium">{fmt(t.builder.variant, { n: String.fromCharCode(65 + i) })}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={v.pct}
              aria-label={`${fmt(t.builder.variant, { n: String.fromCharCode(65 + i) })} %`}
              onChange={(e) => set((n) => void (n.data.variants[i].pct = Number(e.target.value)))}
              className="flex-1 accent-black"
            />
            <Input className="w-20" type="number" min={0} max={100} value={v.pct} onChange={(e) => set((n) => void (n.data.variants[i].pct = Math.max(0, Math.min(100, Number(e.target.value) || 0))))} aria-label="%" />
            {node.data.variants.length > 2 && (
              <button onClick={() => set((n) => void n.data.variants.splice(i, 1))} className="px-1 text-muted hover:text-fg" aria-label={t.common.delete}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className={cn("mt-3 text-sm", total !== 100 ? "font-semibold" : "text-muted")}>
        {total !== 100 && "⚠ "}
        {fmt(t.builder.percentTotal, { n: total })}
      </p>
      {node.data.variants.length < 6 && (
        <button
          onClick={() => set((n) => void n.data.variants.push({ id: uid("v"), pct: 0 }))}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-dashed text-sm font-medium hover:border-fg"
        >
          <Plus className="size-4" />
          {t.builder.addVariant}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────── Smart Delay ───────────────────────────

export function SmartDelayEditor({ node }: { node: SmartDelayNode }) {
  const t = useT();
  const set = useNodeUpdater<SmartDelayNode>(node.id);
  return (
    <div>
      <StepHeader node={node} icon={<Clock className="size-6" />} />
      <Label>{t.builder.waitFor}</Label>
      <div className="flex gap-2">
        <Input type="number" min={1} max={365} className="w-28" value={node.data.amount} aria-label={t.builder.waitFor} onChange={(e) => set((n) => void (n.data.amount = Math.max(1, Math.min(365, Number(e.target.value) || 1))))} />
        <NativeSelect value={node.data.unit} aria-label="Birlik" onChange={(e) => set((n) => void (n.data.unit = e.target.value as SmartDelayNode["data"]["unit"]))}>
          {(["minutes", "hours", "days"] as const).map((u) => (
            <option key={u} value={u}>
              {t.builder.units[u]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <label className="mt-4 flex items-center justify-between gap-3 text-sm">
        {t.builder.businessHours}
        <Switch checked={node.data.business_hours} onCheckedChange={(v) => set((n) => void (n.data.business_hours = v))} />
      </label>
    </div>
  );
}

// ─────────────────────────── Start Another Automation ───────────────────────────

export function StartFlowEditor({ node, currentFlowId }: { node: StartFlowNode; currentFlowId: string }) {
  const t = useT();
  const set = useNodeUpdater<StartFlowNode>(node.id);
  const flows = useFlows();
  return (
    <div>
      <StepHeader node={node} icon={<Play className="size-6" />} />
      <Label htmlFor="sf-flow">{t.builder.selectFlow}</Label>
      <NativeSelect id="sf-flow" value={node.data.flow_id ?? ""} onChange={(e) => set((n) => void (n.data.flow_id = e.target.value || null))}>
        <option value="">—</option>
        {flows.data
          ?.filter((f) => f.id !== currentFlowId && f.status === "live")
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
      </NativeSelect>
    </div>
  );
}

// ─────────────────────────── Comment ───────────────────────────

export function CommentEditor({ node }: { node: CommentNode }) {
  const t = useT();
  const set = useNodeUpdater<CommentNode>(node.id);
  return (
    <div>
      <h3 className="mb-4 text-[22px] font-semibold">{t.builder.stepTypes.comment}</h3>
      <Textarea rows={8} value={node.data.text} placeholder={t.builder.commentPlaceholder} onChange={(e) => set((n) => void (n.data.text = e.target.value))} aria-label={t.builder.stepTypes.comment} />
    </div>
  );
}
