import { cn } from "@/lib/utils";

type Status = "live" | "draft" | "stopped" | "neutral" | "solid" | "outline";

// Qizil LIVE → qora fon/oq matn; DRAFT/STOPPED → #F4F4F5 fon, #71717A matn
const styles: Record<Status, string> = {
  live: "bg-primary text-primary-fg",
  solid: "bg-primary text-primary-fg",
  draft: "bg-bg-muted text-muted",
  stopped: "bg-bg-muted text-muted",
  neutral: "bg-bg-muted text-fg",
  outline: "border border-border-strong text-muted bg-bg",
};

export function Badge({
  status = "neutral",
  className,
  children,
}: {
  status?: Status;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-[4px] px-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
        styles[status],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Active/Live → qora to'la doira; Draft/Off → bo'sh doira */
export function StatusDot({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full border border-fg", active && "bg-fg", className)}
    />
  );
}
