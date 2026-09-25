import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        // ManyChat ko'k asosiy tugmasi → qora fon, oq matn
        primary: "bg-primary text-primary-fg hover:bg-[#27272a]",
        // Ikkinchi darajali → oq fon, qora border
        secondary: "bg-bg text-fg border border-fg hover:bg-bg-muted",
        outline: "bg-bg text-fg border border-border-strong hover:bg-bg-muted",
        ghost: "text-fg hover:bg-bg-muted",
        dashed: "bg-transparent text-fg border border-dashed border-border-dashed hover:bg-bg-muted hover:border-fg",
        link: "text-fg underline-offset-4 hover:underline px-0 h-auto",
        danger: "bg-primary text-primary-fg hover:bg-[#27272a]",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
