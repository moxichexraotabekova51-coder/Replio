import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";

export default function NotFound() {
  const t = getDictionary("uz");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[64px] font-semibold leading-none">404</div>
      <h1 className="text-[20px] font-semibold">{t.errors.notFound}</h1>
      <p className="max-w-sm text-sm text-muted">{t.errors.notFoundDesc}</p>
      <Link href="/app" className={buttonVariants({ className: "mt-4" })}>
        {t.errors.goHome}
      </Link>
    </div>
  );
}
