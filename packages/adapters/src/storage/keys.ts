import { randomBytes } from "node:crypto";

const segmentPattern = /^[a-z0-9][a-z0-9-]*$/;

/** Makes a user-supplied file name safe to use inside an object key. */
export function cleanFileName(fileName: string): string {
  // Browsers send a bare name, but a crafted request may carry a path.
  const name = fileName.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const body = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    // Drop combining marks left by NFKD, then anything outside [a-z0-9]:
    // non-ASCII letters and spaces break URLs and some storage providers.
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  const extension = (dot > 0 ? name.slice(dot + 1) : "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
  return `${body || "file"}${extension ? `.${extension}` : ""}`;
}

/**
 * Builds an object key: `<prefix...>/<random>-<clean name>`.
 *
 * The server decides every key. Letting clients choose paths would let anyone
 * who may upload write anywhere in the bucket; the random part also stops a
 * second upload with the same name from replacing the first.
 */
export function buildKey(prefix: readonly string[], fileName: string): string {
  if (prefix.length === 0) throw new Error("A storage key needs at least one prefix segment.");
  for (const segment of prefix) {
    if (!segmentPattern.test(segment)) throw new Error(`Invalid storage key segment: ${segment}`);
  }
  return [...prefix, `${randomBytes(6).toString("hex")}-${cleanFileName(fileName)}`].join("/");
}

// What `buildKey` produces for the last segment: at most one extension.
const filePattern = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9]{1,8})?$/;

/**
 * Keys this module could have produced. Anything else (dot-segments, a leading
 * slash, uppercase, a second extension) is rejected before touching storage.
 */
export function isValidKey(key: string): boolean {
  const segments = key.split("/");
  const file = segments.pop();
  return (
    segments.length > 0 &&
    segments.every((segment) => segmentPattern.test(segment)) &&
    file !== undefined &&
    filePattern.test(file)
  );
}
