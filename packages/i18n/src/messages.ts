import type en from "../messages/en.json";
import type { Locale } from "./locales";

/** Message catalog shape. English is the source, so its file defines the keys. */
export type Messages = typeof en;

const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import("../messages/en.json"),
  tr: () => import("../messages/tr.json"),
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await loaders[locale]()).default;
}
