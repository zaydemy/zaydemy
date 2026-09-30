/**
 * Better Auth endpoints reachable over HTTP: only what a browser must call
 * itself. Everything else answers 404 to browsers and is only callable from
 * server code (`auth.api.*`, which carries no request); the app wraps those
 * in server actions with its own checks.
 *
 * An allowlist, not a denylist: plugins add endpoints on upgrade, and a new
 * one must not become public by default. Two concrete reasons it matters:
 * - `/email-otp/*` over HTTP would skip our rate limits and bot protection
 *   (sign-in codes are requested through server actions instead);
 * - `/organization/*` returns members' email addresses, and membership is
 *   managed by the app, never by clients directly.
 */
const exact = new Set([
  "/get-session",
  "/sign-out",
  // WebAuthn ceremonies run in the browser: the device talks to the page.
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  // OAuth (GitHub): the browser is redirected to the provider and back.
  "/sign-in/social",
  "/link-social",
  // Ending an impersonation is a click in the banner.
  "/admin/stop-impersonating",
  "/ok",
  "/error",
]);

// OAuth providers redirect back to /callback/<provider>.
const prefixes = ["/callback/"];

export function isPublicAuthPath(path: string): boolean {
  return exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix));
}
