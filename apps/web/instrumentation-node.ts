import { ConfigError } from "@zaydemy/config";
import { getConfig } from "./lib/server/services";

/*
 * Validates the configuration at startup: a missing or malformed variable
 * stops the server with a list of every problem, instead of failing on the
 * first request that needs it.
 */
try {
  const config = getConfig();
  console.info(
    `[config] ${config.environment}: email=${config.email.transport}, storage=${config.storage.driver}, bot-protection=${config.botProtection.provider}`,
  );
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[config] ${error.message}\nSee .env.example for every variable.`);
    process.exit(1);
  }
  throw error;
}
