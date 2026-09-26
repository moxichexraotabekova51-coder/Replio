"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Copy, Download, Link2, MoreVertical, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp, usePermissions } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { planFeatures } from "@/lib/billing";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { useFlows } from "@/lib/queries/automation";
import { usePricingModal } from "@/lib/stores/ui";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { cn, formatNumber, percent } from "@/lib/utils";
import { Card, SectionTitle } from "./section";

type ToolType = "ref_url" | "qr" | "widget";
type Tool = {
  id: string;
  type: ToolType;
  name: string;
  ref_code: string;
  flow_id: string | null;
  config: { button_text?: string; position?: "right" | "left" };
  stats: { views?: number; clicks?: number; subscribers?: number };
};

const ICONS = { ref_url: Link2, qr: QrCode, widget: Code2 };

function randomCode() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => a[x % a.length]).join("");
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

export function GrowthSection() {
  const t = useT();
  const app = useApp();
  const { canEdit } = usePermissions();
  const qc = useQueryClient();
  const acc = app.account.id;
  const key = [acc, "growth"];
  const [editing, setEditing] = useState<Tool | "new" | null>(null);
  const [deleting, setDeleting] = useState<Tool | null>(null);
  const full = planFeatures(app.plan).growth_stats === "full";

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("growth_tools")
        .select("id, type, name, ref_code, flow_id, config, stats")
        .eq("account_id", acc)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Tool[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("growth_tools").delete().eq("id", id);
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <>
      <SectionTitle
        title={t.growth.title}
        description={t.growth.desc}
        action={
          canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t.growth.newTool}
            </Button>
          )
        }
      />
      {!app.bot && <p className="mb-4 text-sm font-medium">⚠ {t.growth.noBot}</p>}
      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[12px]" />
      ) : q.data?.length === 0 ? (
        <Card>
          <EmptyState icon={<Link2 />} title={t.growth.empty} description={t.growth.emptyDesc} />
        </Card>
      ) : (
        <div className="space-y-4">
          {q.data?.map((tool) => (
            <ToolCard key={tool.id} tool={tool} full={full} canEdit={canEdit} onEdit={() => setEditing(tool)} onDelete={() => setDeleting(tool)} />
          ))}
        </div>
      )}

      {editing && <ToolDialog tool={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t.common.delete}
        description={fmt(t.growth.deleteConfirm, { name: deleting?.name ?? "" })}
        confirmLabel={t.common.delete}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

function ToolCard({ tool, full, canEdit, onEdit, onDelete }: { tool: Tool; full: boolean; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const app = useApp();
  const showPricing = usePricingModal((s) => s.show);
  const Icon = ICONS[tool.type];
  const link = app.bot ? `https://t.me/${app.bot.username}?start=${tool.ref_code}` : "";
  const [qr, setQr] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const snippet = `<script async src="${origin}/api/growth/${tool.id}/widget"></script>`;
  const s = tool.stats ?? {};

  useEffect(() => {
    if (tool.type === "widget" || !link) return;
    QRCode.toDataURL(link, { margin: 1, width: 1024 }).then(setQr, () => setQr(null));
  }, [link, tool.type]);

  const copy = (v: string) => {
    void navigator.clipboard.writeText(v);
    toast(t.common.copied);
  };

  return (
    <Card className="p-5" data-testid="growth-tool">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-border">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold">{tool.name}</h3>
            <span className="rounded-[4px] bg-bg-muted px-1.5 py-0.5 text-[11px] font-medium">{t.growth.types[tool.type]}</span>
          </div>
          <code className="text-[12px] text-muted">start={tool.ref_code}</code>
        </div>
        {tool.type !== "widget" && qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR" width={72} height={72} className="shrink-0 rounded-[6px] border border-border" />
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg" aria-label="Amallar">
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                {t.common.edit}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete}>
                <Trash2 />
                {t.common.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tool.type === "widget" ? (
          <>
            <Input readOnly value={snippet} aria-label={t.growth.embedCode} className="min-w-0 flex-1 font-mono text-[12px]" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(snippet)}>
              <Copy className="size-4" />
              {t.growth.copyCode}
            </Button>
          </>
        ) : (
          link && (
            <>
              <Input readOnly value={link} aria-label={t.growth.link} className="min-w-0 flex-1 font-mono text-[12px]" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => copy(link)} aria-label={t.growth.copyLink} title={t.growth.copyLink}>
                <Copy className="size-4" />
              </Button>
              <Button variant="outline" disabled={!qr} onClick={() => qr && download(qr, `${tool.ref_code}.png`)}>
                <Download className="size-4" />
                {t.growth.downloadPng}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const svg = await QRCode.toString(link, { type: "svg", margin: 1 });
                  download(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), `${tool.ref_code}.svg`);
                }}
              >
                <Download className="size-4" />
                {t.growth.downloadSvg}
              </Button>
            </>
          )
        )}
      </div>
      {tool.type === "widget" && <p className="mt-1 text-[12px] text-muted">{t.growth.embedHint}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        {tool.type === "widget" && (
          <Stat label={t.growth.views} value={full ? formatNumber(s.views ?? 0) : "—"} locked={!full} onLocked={() => showPricing("pro")} />
        )}
        <Stat label={t.growth.clicks} value={formatNumber(s.clicks ?? 0)} />
        <Stat label={t.growth.subscribers} value={formatNumber(s.subscribers ?? 0)} />
        <Stat
          label={t.growth.conversion}
          value={full ? percent(s.subscribers ?? 0, tool.type === "widget" ? (s.views ?? 0) : (s.clicks ?? 0)) : "—"}
          locked={!full}
          onLocked={() => showPricing("pro")}
        />
      </dl>
    </Card>
  );
}

function Stat({ label, value, locked, onLocked }: { label: string; value: string; locked?: boolean; onLocked?: () => void }) {
  const t = useT();
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-[20px] font-semibold">
        {value}
        {locked && (
          <button onClick={onLocked} className="rounded-[4px] bg-fg px-1 text-[9px] font-bold text-bg" title={t.growth.proStats}>
            PRO
          </button>
        )}
      </dd>
    </div>
  );
}

function ToolDialog({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  const t = useT();
  const app = useApp();
  const qc = useQueryClient();
  const flows = useFlows();
  const [type, setType] = useState<ToolType>(tool?.type ?? "ref_url");
  const [name, setName] = useState(tool?.name ?? "");
  const [code, setCode] = useState(tool?.ref_code ?? randomCode());
  const [flowId, setFlowId] = useState(tool?.flow_id ?? "");
  const [buttonText, setButtonText] = useState(tool?.config?.button_text ?? t.growth.buttonDefault);
  const [position, setPosition] = useState<"right" | "left">(tool?.config?.position ?? "right");
  const [error, setError] = useState<string>();
  const live = (flows.data ?? []).filter((f) => f.status === "live" && !f.is_basic);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        type,
        name: name.trim() || t.growth.types[type],
        ref_code: code,
        flow_id: flowId || null,
        config: (type === "widget" ? { button_text: buttonText.trim() || t.growth.buttonDefault, position } : {}) as Json,
      };
      const supabase = createClient();
      const { error: e } = tool
        ? await supabase.from("growth_tools").update(row).eq("id", tool.id)
        : await supabase.from("growth_tools").insert({ ...row, account_id: app.account.id });
      if (e) throw e;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [app.account.id, "growth"] });
      onClose();
    },
    onError: (e: { code?: string }) => (e.code === "23505" ? setError(t.growth.codeTaken) : toast.error(t.errors.generic)),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{tool ? t.growth.editTool : t.growth.newTool}</DialogTitle>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return setError(t.growth.codeHint);
            save.mutate();
          }}
        >
          {!tool && (
            <div className="grid gap-2">
              {(["ref_url", "qr", "widget"] as const).map((k) => {
                const Icon = ICONS[k];
                return (
                  <label key={k} className={cn("flex cursor-pointer items-start gap-3 rounded-[8px] border p-3", type === k ? "border-fg" : "border-border")}>
                    <input type="radio" name="gt-type" className="mt-1 size-4 accent-black" checked={type === k} onChange={() => setType(k)} />
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold">{t.growth.types[k]}</span>
                      <span className="block text-[12px] text-muted">{t.growth.typeDesc[k]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div>
            <Label htmlFor="gt-name">{t.growth.name}</Label>
            <Input id="gt-name" value={name} maxLength={100} placeholder={t.growth.types[type]} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gt-code">{t.growth.code}</Label>
            <Input
              id="gt-code"
              value={code}
              maxLength={64}
              aria-invalid={!!error}
              onChange={(e) => {
                setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""));
                setError(undefined);
              }}
            />
            <p className="mt-1 text-[12px] text-muted">{t.growth.codeHint}</p>
            <FieldError>{error}</FieldError>
          </div>
          <div>
            <Label htmlFor="gt-flow">{t.growth.flow}</Label>
            <NativeSelect id="gt-flow" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">{t.growth.flowDefault}</option>
              {live.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {type === "widget" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="gt-btn">{t.growth.buttonText}</Label>
                <Input id="gt-btn" value={buttonText} maxLength={40} onChange={(e) => setButtonText(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gt-pos">{t.growth.position}</Label>
                <NativeSelect id="gt-pos" value={position} onChange={(e) => setPosition(e.target.value as "right" | "left")}>
                  <option value="right">{t.growth.right}</option>
                  <option value="left">{t.growth.left}</option>
                </NativeSelect>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
