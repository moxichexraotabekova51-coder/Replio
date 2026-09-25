"use client";

import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";

export default function ShellError({ reset }: { error: Error; reset: () => void }) {
  const t = getDictionary("uz");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border-2 border-fg text-lg">⚠</div>
      <h1 className="text-[18px] font-semibold">{t.errors.generic}</h1>
      <Button onClick={reset}>{t.common.retry}</Button>
    </div>
  );
}
