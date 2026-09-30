import type { StorageConfig } from "@zaydemy/config";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";
import type { Storage } from "./types";

export function createStorage(config: StorageConfig): Storage {
  return config.driver === "s3" ? createS3Storage(config) : createLocalStorage(config);
}

export { buildKey, cleanFileName, isValidKey } from "./keys";
export {
  createLocalStorage,
  UploadRejectedError,
  type LocalStorage,
  type StoredFile,
} from "./local";
export { createS3Storage } from "./s3";
export { uploadTtlSeconds, type Storage, type UploadRequest, type UploadTicket } from "./types";
