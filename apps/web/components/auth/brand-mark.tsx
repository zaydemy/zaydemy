import { cn } from "@/lib/cn";

/** Instance monogram until organizations upload a logo: the name's initials. */
export function BrandMark({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-[8px] bg-primary font-mono text-[12px] font-bold text-on-primary",
        className,
      )}
    >
      {initials || "·"}
    </span>
  );
}
