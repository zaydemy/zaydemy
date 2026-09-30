import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StorageConfig } from "@zaydemy/config";
import { buildKey, isValidKey } from "./keys";
import { uploadTtlSeconds, type Storage, type UploadRequest } from "./types";

type LocalConfig = Extract<StorageConfig, { driver: "local" }>;

interface UploadClaims {
  key: string;
  contentType: string;
  contentLength: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export class UploadRejectedError extends Error {
  constructor(reason: string) {
    super(`Upload rejected: ${reason}`);
    this.name = "UploadRejectedError";
  }
}

export interface StoredFile {
  body: Readable;
  size: number;
  contentType: string;
}

export interface LocalStorage extends Storage {
  readonly driver: "local";
  /** Checks an upload token against the request; returns the key to write. */
  verifyUpload(
    token: string,
    request: { contentType: string | null; contentLength: number | null },
  ): string;
  /** Writes an upload body, refusing to overwrite and to exceed the signed size. */
  write(
    key: string,
    body: ReadableStream<Uint8Array> | Readable,
    claims: { contentType: string; contentLength: number },
  ): Promise<void>;
  read(key: string): Promise<StoredFile | null>;
}

/**
 * Files on the app server's disk, for installs without object storage. The
 * app serves uploads (`PUT /api/files/upload/<token>`) and files
 * (`GET /api/files/<key>`) itself.
 *
 * Mirrors the S3 flow: the server issues a short-lived token that fixes the
 * key, type and size (HMAC-signed with the app secret), so the upload route
 * needs no session and still cannot be used to write anything else.
 */
export function createLocalStorage(
  config: LocalConfig,
  now: () => number = () => Date.now(),
): LocalStorage {
  const root = path.resolve(config.directory);
  const publicBase = `${config.publicUrl}/`;

  const sign = (payload: string) =>
    createHmac("sha256", config.signingSecret).update(payload).digest("base64url");

  const pathOf = (key: string) => {
    if (!isValidKey(key)) throw new Error(`Invalid storage key: ${key}`);
    const target = path.resolve(root, key);
    // isValidKey already rules out traversal; this is the belt to its braces.
    if (!target.startsWith(root + path.sep)) throw new Error(`Key escapes storage root: ${key}`);
    return target;
  };
  const metaPathOf = (key: string) => `${pathOf(key)}.meta.json`;

  return {
    driver: "local",

    async createUpload(request: UploadRequest) {
      const key = buildKey(request.prefix, request.fileName);
      const claims: UploadClaims = {
        key,
        contentType: request.contentType,
        contentLength: request.contentLength,
        exp: Math.floor(now() / 1000) + uploadTtlSeconds,
      };
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return {
        method: "PUT",
        url: `${config.publicUrl}/upload/${payload}.${sign(payload)}`,
        headers: {
          "content-type": request.contentType,
          "content-length": String(request.contentLength),
        },
        key,
        publicUrl: publicBase + key,
      };
    },

    verifyUpload(token, request) {
      const [payload, signature, ...rest] = token.split(".");
      if (!payload || !signature || rest.length > 0)
        throw new UploadRejectedError("malformed token");

      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        throw new UploadRejectedError("bad signature");
      }

      const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as UploadClaims;
      if (claims.exp < Math.floor(now() / 1000)) throw new UploadRejectedError("token expired");
      if (request.contentType !== claims.contentType) {
        throw new UploadRejectedError("content type differs from the signed one");
      }
      if (request.contentLength !== claims.contentLength) {
        throw new UploadRejectedError("content length differs from the signed one");
      }
      return claims.key;
    },

    async write(key, body, claims) {
      const target = pathOf(key);
      await mkdir(path.dirname(target), { recursive: true });

      let received = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > claims.contentLength) {
            callback(new UploadRejectedError("body is larger than the signed length"));
          } else {
            callback(null, chunk);
          }
        },
      });
      const source = body instanceof Readable ? body : Readable.fromWeb(body as never);

      try {
        // `wx`: never overwrite. Keys are random, so an existing file means a
        // replayed token.
        await pipeline(source, limit, createWriteStream(target, { flags: "wx" }));
        if (received !== claims.contentLength) {
          throw new UploadRejectedError("body is smaller than the signed length");
        }
        // Served back as the file's Content-Type; the signed type, not a guess.
        await writeFile(metaPathOf(key), JSON.stringify({ contentType: claims.contentType }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new UploadRejectedError("file already exists");
        }
        // Never leave a partial file behind.
        await rm(target, { force: true });
        throw error;
      }
    },

    async read(key) {
      if (!isValidKey(key)) return null;
      try {
        const [info, meta] = await Promise.all([
          stat(pathOf(key)),
          readFile(metaPathOf(key), "utf8"),
        ]);
        const { contentType } = JSON.parse(meta) as { contentType: string };
        return { body: createReadStream(pathOf(key)), size: info.size, contentType };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    keyOf(url) {
      if (!url.startsWith(publicBase)) return null;
      const key = decodeURIComponent(url.slice(publicBase.length));
      return isValidKey(key) ? key : null;
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
      await rm(metaPathOf(key), { force: true });
    },
  };
}
