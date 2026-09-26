/** Inbox bo'sh holati uchun oddiy qora chiziqli (line-art) illyustratsiya */
export function InboxIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" stroke="#09090b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {/* orqa pufak */}
      <path d="M128 30h78a14 14 0 0 1 14 14v40a14 14 0 0 1-14 14h-10v18l-20-18h-48a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14Z" />
      <path d="M140 54h54M140 70h36" />
      {/* old pufak */}
      <path d="M34 72h82a14 14 0 0 1 14 14v38a14 14 0 0 1-14 14H64l-22 18v-18h-8a14 14 0 0 1-14-14V86a14 14 0 0 1 14-14Z" fill="#fff" />
      <circle cx="56" cy="105" r="3.5" fill="#09090b" stroke="none" />
      <circle cx="75" cy="105" r="3.5" fill="#09090b" stroke="none" />
      <circle cx="94" cy="105" r="3.5" fill="#09090b" stroke="none" />
      {/* qog'oz samolyot */}
      <path d="M176 128 214 112l-12 38-10-14-16-8Z" />
      <path d="m192 136 22-24" />
      {/* bezak */}
      <path d="M24 38v10M19 43h10M224 20v8M220 24h8" strokeWidth="1.5" />
    </svg>
  );
}
