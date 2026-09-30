"use client";

/**
 * Remembers, per device, whether the post-sign-in "save this device" offer was
 * answered. Per device on purpose: a passkey belongs to a device, so saying
 * "not now" on a laptop must not hide the offer on a phone.
 */
const key = "zaydemy:passkey-offer";

export function shouldOfferPasskey(): boolean {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return window.localStorage.getItem(key) === null;
  } catch {
    // Storage blocked (private mode): we could not remember a "no", so asking
    // on every sign-in would nag. Do not ask.
    return false;
  }
}

export function closePasskeyOffer(result: "saved" | "skipped") {
  try {
    window.localStorage.setItem(key, result);
  } catch {
    // Not remembered; the flow goes on.
  }
}

/** WebAuthn in this browser; false during server rendering. */
export function supportsPasskeys(): boolean {
  return typeof window !== "undefined" && Boolean(window.PublicKeyCredential);
}

/**
 * A default name for a new passkey, before the user renames it: the platform
 * (a proper noun), or the translated `fallback`.
 */
export function suggestedDeviceName(fallback: string): string {
  const ua = navigator.userAgent;
  const platform = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return platform ?? fallback;
}

/** The user closed the browser's passkey prompt: a cancellation, not an error. */
export function isCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "NotAllowedError";
}
