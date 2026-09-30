export interface UploadRequest {
  /** Key prefix segments, e.g. `["org", organizationId, "resources"]`. */
  prefix: readonly string[];
  fileName: string;
  contentType: string;
  /** Exact size in bytes; the upload is rejected if the body differs. */
  contentLength: number;
}

/** What the browser needs to upload a file directly, without the app relaying it. */
export interface UploadTicket {
  method: "PUT";
  url: string;
  /** Headers the upload must send exactly; they are part of the signature. */
  headers: Record<string, string>;
  key: string;
  /** Permanent URL of the file once uploaded; store this. */
  publicUrl: string;
}

export interface Storage {
  readonly driver: "local" | "s3";
  createUpload(request: UploadRequest): Promise<UploadTicket>;
  /**
   * The key behind a public URL, or `null` when the URL is not one of ours.
   * Deletion goes through this: records can also hold external links, and
   * those must never be "deleted".
   */
  keyOf(url: string): string | null;
  delete(key: string): Promise<void>;
}

/** Signed upload URLs are short-lived. */
export const uploadTtlSeconds = 300;
