import { cn } from "@/lib/utils";

/** Sahifa sarlavhasi zonasi: fon #F4F4F5, pastida 1px border, chapda 28px/600 sarlavha */
export function PageHeader({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-[84px] shrink-0 items-center gap-4 border-b border-border bg-bg-muted px-4 md:px-11",
        className,
      )}
    >
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] md:text-[28px]">{title}</h1>
      {children}
    </header>
  );
}
