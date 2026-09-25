"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { Card, SectionTitle } from "./section";

type Role = Enums<"member_role">;
const ROLES: Role[] = ["admin", "editor", "agent", "viewer"];

export function TeamSection() {
  const t = useT();
  const app = useApp();
  const qc = useQueryClient();
  const acc = app.account.id;
  const key = [acc, "team"];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<{ user_id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const supabase = createClient();
      const [members, emails, invites] = await Promise.all([
        supabase.from("account_members").select("user_id, role, created_at").eq("account_id", acc).order("created_at"),
        supabase.rpc("account_member_emails", { p_account_id: acc }),
        supabase.from("account_invites").select("id, email, role, created_at").eq("account_id", acc).is("accepted_at", null).order("created_at"),
      ]);
      if (members.error) throw members.error;
      const ids = members.data.map((m) => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      return {
        members: members.data.map((m) => ({
          ...m,
          email: emails.data?.find((e) => e.user_id === m.user_id)?.email ?? "",
          profile: profiles?.find((p) => p.id === m.user_id) ?? null,
        })),
        invites: invites.data ?? [],
      };
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? t.errors.generic);
      return json as { status: string };
    },
    onSuccess: () => {
      setEmail("");
      toast(t.settings.invited);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => setError(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await createClient().from("account_members").update({ role }).eq("account_id", acc).eq("user_id", userId);
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await createClient().from("account_members").delete().eq("account_id", acc).eq("user_id", userId);
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("account_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onError: () => toast.error(t.errors.generic),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const used = (q.data?.members.length ?? 0) + (q.data?.invites.length ?? 0);
  const full = used >= app.plan.seat_limit;

  return (
    <>
      <SectionTitle title={t.settings.team} description={fmt(t.settings.seatLimit, { n: app.plan.seat_limit })} />

      <Card>
        <form
          className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t.auth.invalidEmail);
            invite.mutate();
          }}
        >
          <div>
            <Label htmlFor="inv-email">{t.settings.inviteEmail}</Label>
            <Input id="inv-email" type="email" value={email} aria-invalid={!!error} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} placeholder="ism@kompaniya.uz" />
          </div>
          <div>
            <Label htmlFor="inv-role">{t.settings.role}</Label>
            <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.settings.roles[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" loading={invite.isPending} disabled={full}>
            <Mail className="size-4" />
            {t.settings.invite}
          </Button>
        </form>
        <FieldError>{error}</FieldError>
        {full && <p className="mt-3 text-[13px] font-medium">⚠ {fmt(t.settings.seatLimit, { n: app.plan.seat_limit })}</p>}
        <p className="mt-3 text-[12px] text-muted">{t.settings.rolesDesc[role]}</p>
      </Card>

      <h3 className="mb-3 mt-8 text-[16px] font-semibold">{t.settings.teamMembers}</h3>
      <Card className="p-0">
        {q.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {q.data?.members.map((m) => {
              const isOwner = m.user_id === app.account.owner_id;
              const isMe = m.user_id === app.user.id;
              const name = m.profile?.full_name || m.email;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <Avatar src={m.profile?.avatar_url} name={name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {name}
                      {isMe && <span className="ml-2 text-[12px] text-muted">({t.settings.you})</span>}
                    </div>
                    <div className="truncate text-[12px] text-muted">{m.email}</div>
                  </div>
                  {isOwner ? (
                    <span className="rounded-[4px] bg-fg px-2 py-0.5 text-[11px] font-semibold uppercase text-bg">{t.settings.owner}</span>
                  ) : (
                    <>
                      <NativeSelect
                        className="h-9 w-44"
                        value={m.role}
                        aria-label={t.settings.role}
                        onChange={(e) => changeRole.mutate({ userId: m.user_id, role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t.settings.roles[r]}
                          </option>
                        ))}
                      </NativeSelect>
                      <button
                        onClick={() => setRemoving({ user_id: m.user_id, name })}
                        className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                        aria-label={t.settings.removeMember}
                        title={t.settings.removeMember}
                      >
                        <UserMinus className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!!q.data?.invites.length && (
        <>
          <h3 className="mb-3 mt-8 text-[16px] font-semibold">{t.settings.pendingInvites}</h3>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {q.data.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-6 py-4">
                  <Mail className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm">{i.email}</span>
                  <span className="text-[13px] text-muted">{t.settings.roles[i.role]}</span>
                  <button
                    onClick={() => cancelInvite.mutate(i.id)}
                    className="flex size-9 items-center justify-center rounded-[6px] text-muted hover:bg-bg-muted hover:text-fg"
                    aria-label={t.settings.cancelInvite}
                    title={t.settings.cancelInvite}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        destructive
        title={t.settings.removeMember}
        description={removing ? fmt(t.settings.removeMemberConfirm, { name: removing.name }) : ""}
        confirmLabel={t.settings.removeMember}
        onConfirm={() => {
          if (removing) removeMember.mutate(removing.user_id);
        }}
      />
    </>
  );
}
