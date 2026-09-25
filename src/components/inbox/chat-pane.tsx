"use client";

import { ArrowLeft, Heart, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePermissions } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/provider";
import { displayName, useLabels, useMessages, useToggleLabel, useUpdateConversations, type Conversation, type Message } from "@/lib/queries/inbox";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export function ChatPane({ contact, onBack, tz }: { contact: Conversation; onBack: () => void; tz: string }) {
  const t = useT();
  const perms = usePermissions();
  const messages = useMessages(contact.id);
  const labels = useLabels();
  const update = useUpdateConversations();
  const toggleLabel = useToggleLabel();
  const bottom = useRef<HTMLDivElement>(null);
  const name = displayName(contact);
  const favorites = labels.data?.find((l) => l.is_default);
  const isFav = !!favorites && contact.contact_labels.some((l) => l.label_id === favorites.id);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length, contact.id]);

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <button onClick={onBack} className="flex size-9 items-center justify-center rounded-[6px] hover:bg-bg-muted md:hidden" aria-label={t.common.back}>
          <ArrowLeft className="size-5" />
        </button>
        <Avatar src={contact.avatar_url} name={name} size={36} silhouette={!contact.avatar_url} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          {contact.username && <div className="truncate text-[12px] text-muted">@{contact.username}</div>}
        </div>
        {perms.canChat && (
          <div className="flex items-center gap-2">
            {favorites && (
              <button
                onClick={() => toggleLabel.mutate({ ids: [contact.id], labelId: favorites.id, on: !isFav })}
                className={cn("flex size-9 items-center justify-center rounded-[6px] border border-border hover:border-fg", isFav && "border-fg")}
                aria-pressed={isFav}
                aria-label={t.inbox.addFavorite}
              >
                <Heart className="size-4" fill={isFav ? "currentColor" : "none"} />
              </button>
            )}
            {contact.live_chat_status === "open" ? (
              <Button variant="outline" size="sm" onClick={() => update.mutate({ ids: [contact.id], patch: { live_chat_status: "closed" } })}>
                <XCircle className="size-4" />
                {t.inbox.close}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => update.mutate({ ids: [contact.id], patch: { live_chat_status: "open" } })}>
                <RotateCcw className="size-4" />
                {t.inbox.reopen}
              </Button>
            )}
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg-subtle px-4 py-6 scrollbar-thin">
        {messages.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.data?.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">{t.inbox.noMessages}</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {messages.data?.map((m) => <Bubble key={m.id} m={m} tz={tz} />)}
          </div>
        )}
        <div ref={bottom} />
      </div>
    </section>
  );
}

function Bubble({ m, tz }: { m: Message; tz: string }) {
  const t = useT();
  const text = m.content?.text ?? m.content?.caption ?? (m.content?.file_name ? `📎 ${m.content.file_name}` : `[${m.type}]`);
  const incoming = m.direction === "in";
  return (
    <div className={cn("flex", incoming ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap break-words rounded-[12px] px-3.5 py-2 text-sm",
          incoming && "border border-border bg-bg",
          m.direction === "out_bot" && "bg-bg-muted",
          m.direction === "out_agent" && "bg-fg text-bg",
          m.direction === "note" && "border border-dashed border-border-dashed bg-bg italic",
        )}
      >
        {m.direction === "note" && <div className="mb-0.5 text-[11px] font-semibold not-italic text-muted">{t.inbox.note}</div>}
        {text}
        <div className={cn("mt-1 text-right text-[11px]", m.direction === "out_agent" ? "text-white/60" : "text-muted")}>
          {formatDate(m.created_at, tz, true)}
        </div>
      </div>
    </div>
  );
}
