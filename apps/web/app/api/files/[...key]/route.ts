import { Readable } from "node:stream";
import { getLocalStorage } from "@/lib/server/services";

// Types browsers may render in place. Anything else downloads, so an
// uploaded HTML or SVG file never runs as a page on the app's own origin.
const inlineTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
]);

/** Serves files stored by the local-disk driver. URLs are unguessable and immutable. */
export async function GET(_request: Request, { params }: RouteContext<"/api/files/[...key]">) {
  const storage = getLocalStorage();
  if (!storage) return new Response(null, { status: 404 });

  const { key } = await params;
  const file = await storage.read(key.join("/"));
  if (!file) return new Response(null, { status: 404 });

  const headers = new Headers({
    "content-type": file.contentType,
    "content-length": String(file.size),
    "content-disposition": inlineTypes.has(file.contentType) ? "inline" : "attachment",
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=31536000, immutable",
  });
  // Whatever a browser renders runs in an opaque origin, without scripts.
  // Not for PDFs: Chrome refuses to show them under a sandbox policy, and its
  // viewer does not run documents on the app's origin anyway.
  if (file.contentType !== "application/pdf") {
    headers.set(
      "content-security-policy",
      "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    );
  }

  return new Response(Readable.toWeb(file.body) as ReadableStream, { headers });
}
