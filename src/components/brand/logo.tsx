import { cn } from "@/lib/utils";

/** Replio belgisi — qora "R" */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#000" />
      <path
        d="M11 23V9h6.2c3 0 4.8 1.6 4.8 4.2 0 1.9-1 3.3-2.7 3.9L22.5 23h-3.3l-2.8-5.5H14V23zm3-8.2h3c1.2 0 1.9-.6 1.9-1.6s-.7-1.6-1.9-1.6h-3z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[18px] font-semibold tracking-tight", className)}>
      <LogoMark size={28} />
      Replio
    </span>
  );
}

/** Telegram ikonkasi — qora doira, oq qog'oz samolyot */
export function TelegramIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#000" />
      <path
        d="M5.4 11.7 17 7.2c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1.1.5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.4-.1l-6.9 4.4-3-.9c-.6-.2-.6-.6.2-.9Z"
        fill="#fff"
      />
    </svg>
  );
}
