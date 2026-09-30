"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type OtpStatus = "idle" | "pending" | "error" | "success";

/**
 * The 6-digit sign-in code. One real `<input>` (input-otp) handles typing,
 * pasting, the browser's one-time-code suggestion and screen readers; the
 * slots are only its picture.
 *
 * Motion describes state: digits settle in from a blur, a sheen crosses the
 * slots while verifying, the field shakes on a wrong code and the slots
 * confirm one by one on success. With reduced motion only colour changes.
 */
export function OtpField({
  value,
  onChange,
  onComplete,
  status,
  errorKey,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  status: OtpStatus;
  /** Increments on every error, so the same error twice still shakes. */
  errorKey: number;
  disabled?: boolean;
  label: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const input = useRef<HTMLInputElement>(null);

  // Verifying disables the field and drops focus; give it back afterwards.
  useEffect(() => {
    if (status === "error" || status === "idle") input.current?.focus();
  }, [status, errorKey]);

  return (
    <motion.div
      key={errorKey}
      animate={status === "error" && !reduce ? { x: [0, -10, 9, -7, 5, -3, 0] } : { x: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <OTPInput
        ref={input}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        aria-label={label}
        aria-invalid={status === "error"}
        containerClassName="group flex items-center gap-2 has-[:disabled]:cursor-default sm:gap-2.5"
        render={({ slots }) => (
          // Digits read left to right in every script.
          <div dir="ltr" className="flex w-full items-center gap-2 sm:gap-2.5">
            <div className="flex flex-1 gap-2 sm:gap-2.5">
              {slots.slice(0, 3).map((slot, i) => (
                <Slot key={i} index={i} slot={slot} status={status} reduce={reduce} />
              ))}
            </div>
            <span aria-hidden className="h-[2px] w-2.5 flex-none rounded-full bg-outline sm:w-3" />
            <div className="flex flex-1 gap-2 sm:gap-2.5">
              {slots.slice(3).map((slot, i) => (
                <Slot key={i + 3} index={i + 3} slot={slot} status={status} reduce={reduce} />
              ))}
            </div>
          </div>
        )}
      />
    </motion.div>
  );
}

function Slot({
  slot,
  index,
  status,
  reduce,
}: {
  slot: SlotProps;
  index: number;
  status: OtpStatus;
  reduce: boolean;
}) {
  const tone =
    status === "error"
      ? "border-danger bg-danger-soft text-danger"
      : status === "success"
        ? "border-success bg-success-soft text-success"
        : slot.isActive
          ? "border-body bg-card text-body shadow-[0_0_0_4px_var(--color-subtle-2)]"
          : slot.char
            ? "border-outline bg-card text-body"
            : "border-line bg-subtle text-body";

  return (
    <motion.div
      animate={
        status === "success" && !reduce
          ? { scale: [1, 1.08, 1], transition: { delay: index * 0.05, duration: 0.35 } }
          : { scale: 1 }
      }
      data-spot-target={slot.isActive ? "" : undefined}
      className={cn(
        "relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-field border-[1.5px] font-mono text-[26px] font-medium tabular-nums transition-[border-color,background-color,box-shadow,color] duration-200 sm:h-16 sm:text-[28px]",
        tone,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {slot.char ? (
          <motion.span
            key={slot.char}
            className="otp-lit"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
          >
            {slot.char}
          </motion.span>
        ) : null}
      </AnimatePresence>

      {slot.hasFakeCaret ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="h-7 w-[2px] animate-[otp-caret_1.1s_ease-in-out_infinite] rounded-full bg-body" />
        </span>
      ) : null}

      {status === "pending" && !reduce ? (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-2/3 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--color-body)_15%,transparent)] to-transparent"
          initial={{ x: "-120%" }}
          animate={{ x: "180%" }}
          transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }}
        />
      ) : null}
    </motion.div>
  );
}
