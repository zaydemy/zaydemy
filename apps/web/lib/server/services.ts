import "server-only";
import {
  createBotProtection,
  createEmailTransport,
  createStorage,
  type BotProtection,
  type EmailTransport,
  type LocalStorage,
  type Storage,
} from "@zaydemy/adapters";
import { loadConfig, type ServerConfig } from "@zaydemy/config";

/*
 * Process-wide services, built on first use from the validated configuration.
 * Everything that talks to the outside world (email, storage, bot checks) is
 * created here and nowhere else, so swapping a provider is a configuration
 * change.
 */

let config: ServerConfig | undefined;
let storage: Storage | undefined;
let email: EmailTransport | undefined;
let botProtection: BotProtection | undefined;

export function getConfig(): ServerConfig {
  config ??= loadConfig();
  return config;
}

export function getStorage(): Storage {
  storage ??= createStorage(getConfig().storage);
  return storage;
}

/** The local-disk driver, when configured; its routes 404 otherwise. */
export function getLocalStorage(): LocalStorage | null {
  const current = getStorage();
  return current.driver === "local" ? (current as LocalStorage) : null;
}

export function getEmailTransport(): EmailTransport {
  email ??= createEmailTransport(getConfig().email);
  return email;
}

export function getBotProtection(): BotProtection {
  botProtection ??= createBotProtection(getConfig().botProtection);
  return botProtection;
}
