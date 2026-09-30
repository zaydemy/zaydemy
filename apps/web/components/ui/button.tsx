import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover disabled:bg-outline disabled:text-faint",
  secondary: "border border-line bg-card text-body shadow-card hover:bg-subtle disabled:opacity-50",
  ghost: "text-muted hover:bg-subtle-2 hover:text-body disabled:opacity-50",
  danger: "bg-danger text-white hover:brightness-110 disabled:opacity-50",
} as const;

const sizes = {
  sm: "h-8 rounded-[10px] px-3 text-[13px]",
  md: "h-10 rounded-card px-4 text-[14px]",
  lg: "h-[46px] rounded-card px-5 text-[15px]",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
}

export function Button({
  tone = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed",
        tones[tone],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
