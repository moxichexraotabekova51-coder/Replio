import { Bell, Bookmark, Flag, Heart, Star, Tag, type LucideIcon } from "lucide-react";

export const LABEL_ICONS: Record<string, LucideIcon> = {
  heart: Heart,
  star: Star,
  flag: Flag,
  tag: Tag,
  bookmark: Bookmark,
  bell: Bell,
};

export function LabelIcon({ icon, className, filled }: { icon: string; className?: string; filled?: boolean }) {
  const Icon = LABEL_ICONS[icon] ?? Tag;
  return <Icon className={className} fill={filled ? "currentColor" : "none"} />;
}
