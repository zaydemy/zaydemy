import "server-only";
import { createAuth, type Auth } from "@zaydemy/auth";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import { getConfig } from "./services";

let auth: Auth | undefined;

/** Better Auth, with Next.js cookie handling for server actions. */
export function getAuth(): Auth {
  auth ??= createAuth({ db: getDb(), config: getConfig(), plugins: [nextCookies()] });
  return auth;
}
