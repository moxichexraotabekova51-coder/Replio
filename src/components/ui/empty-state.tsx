import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-bg-subtle text-fg [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-[18px] font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-[8px] border-2 border-fg bg-bg p-4 text-sm">
      <span aria-hidden className="text-base">⚠</span>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-4">
          {retryLabel ?? "Qayta urinish"}
        </button>
      )}
    </div>
  );
}
