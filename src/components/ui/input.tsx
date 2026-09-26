import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[6px] border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted",
        "outline-none transition-colors hover:border-border-strong focus:border-fg focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-60 aria-[invalid=true]:border-fg aria-[invalid=true]:border-2",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-20 w-full rounded-[6px] border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted",
        "outline-none transition-colors hover:border-border-strong focus:border-fg resize-y",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-fg", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-fg">
      <span aria-hidden>⚠</span>
      {children}
    </p>
  );
}

export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full appearance-none rounded-[6px] border border-border bg-bg bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9 text-sm text-fg",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2371717a%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        "outline-none hover:border-border-strong focus:border-fg",
        className,
      )}
      {...props}
    />
  );
}
