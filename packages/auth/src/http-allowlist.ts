/**
 * Better Auth endpoints reachable over HTTP. Everything else answers 404 to
 * browsers and is only callable from server code (`auth.api.*`, which carries
 * no request).
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
  "/list-sessions",
  "/revoke-session",
  "/revoke-other-sessions",
  // Social sign-in and account linking (GitHub): the browser follows redirects.
  "/sign-in/social",
  "/link-social",
  "/list-accounts",
  "/unlink-account",
  // Ending an impersonation is a click in the banner.
  "/admin/stop-impersonating",
  "/ok",
  "/error",
]);

const prefixes = [
  // WebAuthn ceremonies run in the browser.
  "/passkey/",
  // OAuth redirects come back from the provider.
  "/callback/",
];

export function isPublicAuthPath(path: string): boolean {
  return exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix));
}
