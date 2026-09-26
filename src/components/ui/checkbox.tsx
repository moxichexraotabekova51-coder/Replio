"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-bg transition-colors",
        "hover:border-fg data-[state=checked]:border-fg data-[state=checked]:bg-fg data-[state=indeterminate]:border-fg data-[state=indeterminate]:bg-fg",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-primary-fg">
        {checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
