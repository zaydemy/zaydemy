import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildKey, cleanFileName, isValidKey } from "./keys";
import { createLocalStorage, UploadRejectedError, type LocalStorage } from "./local";
import { createS3Storage } from "./s3";

describe("keys", () => {
  it("cleans file names to lowercase ASCII with one extension", () => {
    expect(cleanFileName("Ödev Çözümü (son).PDF")).toBe("odev-cozumu-son.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("C:\\Users\\me\\CV.docx")).toBe("cv.docx");
    expect(cleanFileName("中文.zip")).toBe("file.zip");
    expect(cleanFileName(".env")).toBe("env");
  });

  it("builds random keys under a validated prefix", () => {
    const key = buildKey(["org", "a1b2", "resources"], "Notes.md");
    expect(key).toMatch(/^org\/a1b2\/resources\/[0-9a-f]{12}-notes\.md$/);
    expect(isValidKey(key)).toBe(true);
    expect(buildKey(["x"], "a.md")).not.toBe(buildKey(["x"], "a.md"));
    expect(() => buildKey(["../escape"], "a.md")).toThrow();
    expect(() => buildKey([], "a.md")).toThrow();
  });

  it("rejects keys it could not have produced", () => {
    for (const key of [
      "a.md",
      "/org/a.md",
      "org/../a.md",
      "org/A.md",
      "org/x.meta.json",
      "org//a.md",
    ]) {
      expect(isValidKey(key), key).toBe(false);
    }
  });
});

describe("local storage", () => {
  let directory: string;
  let clock: number;
  let storage: LocalStorage;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "zaydemy-storage-"));
    clock = Date.UTC(2026, 0, 1);
    storage = createLocalStorage(
      {
        driver: "local",
        directory,
        publicUrl: "https://learn.example.com/api/files",
        signingSecret: "s".repeat(32),
      },
      () => clock,
    );
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  const request = {
    prefix: ["org", "a1", "resources"],
    fileName: "notes.md",
    contentType: "text/markdown",
    contentLength: 5,
  };
  const tokenOf = (url: string) => url.split("/upload/")[1]!;
  const matching = { contentType: "text/markdown", contentLength: 5 };

  it("uploads with a signed token and reads the file back", async () => {
    const ticket = await storage.createUpload(request);
    expect(ticket.url).toMatch(/^https:\/\/learn\.example\.com\/api\/files\/upload\//);

    const key = storage.verifyUpload(tokenOf(ticket.url), matching);
    expect(key).toBe(ticket.key);
    await storage.write(key, Readable.from([Buffer.from("hello")]), matching);

    const file = await storage.read(key);
    expect(file?.contentType).toBe("text/markdown");
    expect(file?.size).toBe(5);
    expect(await text(file!.body)).toBe("hello");
    expect(storage.keyOf(ticket.publicUrl)).toBe(key);
  });

  it("rejects tampered, expired or mismatched tokens", async () => {
    const token = tokenOf((await storage.createUpload(request)).url);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        key: "org/a1/x/evil.sh",
        contentType: "text/markdown",
        contentLength: 5,
        exp: 9e9,
      }),
    ).toString("base64url");

    expect(() => storage.verifyUpload(`${forged}.${signature}`, matching)).toThrow(
      UploadRejectedError,
    );
    expect(() => storage.verifyUpload(`${payload}.x${signature}`, matching)).toThrow(
      /bad signature/,
    );
    expect(() => storage.verifyUpload("garbage", matching)).toThrow(/malformed/);
    expect(() => storage.verifyUpload(token, { ...matching, contentType: "text/html" })).toThrow(
      /type/,
    );
    expect(() => storage.verifyUpload(token, { ...matching, contentLength: 6 })).toThrow(/length/);

    clock += 301 * 1000;
    expect(() => storage.verifyUpload(token, matching)).toThrow(/expired/);
  });

  it("rejects bodies that differ from the signed size and leaves nothing behind", async () => {
    const { key } = await storage.createUpload(request);
    await expect(
      storage.write(key, Readable.from([Buffer.from("too long")]), matching),
    ).rejects.toThrow(/larger/);
    await expect(storage.write(key, Readable.from([Buffer.from("hi")]), matching)).rejects.toThrow(
      /smaller/,
    );
    expect(await storage.read(key)).toBeNull();
  });

  it("never overwrites an existing file", async () => {
    const { key } = await storage.createUpload(request);
    await storage.write(key, Readable.from([Buffer.from("first")]), matching);
    await expect(
      storage.write(key, Readable.from([Buffer.from("again")]), matching),
    ).rejects.toThrow(/exists/);
    expect(await text((await storage.read(key))!.body)).toBe("first");
  });

  it("ignores foreign URLs and invalid keys, and deletes its own files", async () => {
    expect(storage.keyOf("https://elsewhere.example/api/files/org/a/x.md")).toBeNull();
    expect(storage.keyOf("https://learn.example.com/api/files/..%2F..%2Fetc%2Fpasswd")).toBeNull();
    expect(await storage.read("../../etc/passwd")).toBeNull();

    const { key } = await storage.createUpload(request);
    await storage.write(key, Readable.from([Buffer.from("hello")]), matching);
    await storage.delete(key);
    expect(await storage.read(key)).toBeNull();
    const leftovers = await readdir(path.join(directory, "org", "a1", "resources"));
    expect(leftovers).toEqual([]);
  });
});

describe("s3 storage", () => {
  const storage = createS3Storage({
    driver: "s3",
    endpoint: "https://account.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "uploads",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret",
    publicUrl: "https://files.example.com",
    forcePathStyle: true,
  });

  it("presigns a short-lived PUT that fixes type and size", async () => {
    const ticket = await storage.createUpload({
      prefix: ["org", "a1", "images"],
      fileName: "Diagram.PNG",
      contentType: "image/png",
      contentLength: 1024,
    });
    const url = new URL(ticket.url);

    expect(url.origin + url.pathname).toMatch(
      /^https:\/\/account\.r2\.cloudflarestorage\.com\/uploads\/org\/a1\/images\/[0-9a-f]{12}-diagram\.png$/,
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";").sort()).toEqual([
      "content-length",
      "content-type",
      "host",
    ]);
    expect(ticket.headers).toEqual({ "content-type": "image/png", "content-length": "1024" });
    expect(ticket.publicUrl).toBe(`https://files.example.com/${ticket.key}`);
  });

  it("maps only its own public URLs back to keys", () => {
    expect(storage.keyOf("https://files.example.com/org/a1/images/abc-x.png")).toBe(
      "org/a1/images/abc-x.png",
    );
    expect(storage.keyOf("https://files.example.com.evil.test/org/a1/x.png")).toBeNull();
    expect(storage.keyOf("https://github.com/org/repo")).toBeNull();
  });
});
