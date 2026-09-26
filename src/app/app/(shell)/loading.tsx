import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-[84px] items-center border-b border-border bg-bg-muted px-11">
        <Skeleton className="h-8 w-48 bg-border" />
      </div>
      <div className="space-y-4 px-11 py-8">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
