"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-fg bg-bg transition-colors data-[state=checked]:bg-fg disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-[2px] rounded-full bg-fg transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-bg" />
    </SwitchPrimitive.Root>
  );
}
