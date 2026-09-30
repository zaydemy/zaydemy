"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth: only the flows a browser must run itself (WebAuthn
 * ceremonies, OAuth redirects, sign-out). Everything else goes through server
 * actions; the server answers 404 to other auth endpoints.
 */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
