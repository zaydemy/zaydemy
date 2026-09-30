import { cn } from "@/lib/cn";

// Muted, distinguishable hues for classes without a chosen colour.
const palette = [
  "#64748b",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

/** A class's colour, or a stable one derived from its id. */
export function classColor(id: string, color: string | null): string {
  if (color) return color;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

export function ClassDot({
  id,
  color,
  className,
}: {
  id: string;
  color: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 flex-none rounded-full", className)}
      style={{ backgroundColor: classColor(id, color) }}
    />
  );
}
