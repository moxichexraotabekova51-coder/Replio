"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;
export const DropdownMenuRadioGroup = DM.RadioGroup;

const contentCls =
  "z-50 min-w-[200px] overflow-hidden rounded-[8px] border border-border bg-bg p-1 text-sm text-fg shadow-pop animate-in";

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} className={cn(contentCls, className)} {...props} />
    </DM.Portal>
  );
}

const itemCls =
  "relative flex h-9 cursor-pointer select-none items-center gap-2 rounded-[6px] px-2.5 text-[13px] outline-none data-[highlighted]:bg-bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn(itemCls, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn(itemCls, "pr-8", className)} {...props}>
      {children}
      <DM.ItemIndicator className="absolute right-2.5">
        <Check />
      </DM.ItemIndicator>
    </DM.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem className={cn(itemCls, "pr-8", className)} {...props}>
      {children}
      <DM.ItemIndicator className="absolute right-2.5">
        <Check />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 pb-1 pt-2 text-[12px] font-medium text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof DM.SubTrigger>) {
  return (
    <DM.SubTrigger className={cn(itemCls, "data-[state=open]:bg-bg-muted", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </DM.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent className={cn(contentCls, className)} {...props} />
    </DM.Portal>
  );
}
