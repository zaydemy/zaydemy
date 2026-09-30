import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig } from "@zaydemy/config";
import { buildKey, isValidKey } from "./keys";
import { uploadTtlSeconds, type Storage, type UploadRequest } from "./types";

type S3Config = Extract<StorageConfig, { driver: "s3" }>;

/**
 * Any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, ...). Browsers upload
 * straight to the bucket with a presigned PUT, so large files never pass
 * through the app server.
 */
export function createS3Storage(config: S3Config): Storage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    // Path style (`endpoint/bucket/key`) works everywhere; virtual-host style
    // breaks TLS for bucket names with dots and is not what R2 or MinIO document.
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const publicBase = `${config.publicUrl}/`;

  return {
    driver: "s3",

    async createUpload(request: UploadRequest) {
      const key = buildKey(request.prefix, request.fileName);
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: request.contentType,
          ContentLength: request.contentLength,
        }),
        {
          expiresIn: uploadTtlSeconds,
          // The presigner signs only `host` by default. Signing type and size
          // makes the bucket reject a different file; otherwise the limits
          // would exist only in the browser.
          signableHeaders: new Set(["host", "content-type", "content-length"]),
        },
      );
      return {
        method: "PUT",
        url,
        headers: {
          "content-type": request.contentType,
          "content-length": String(request.contentLength),
        },
        key,
        publicUrl: publicBase + key,
      };
    },

    keyOf(url: string) {
      if (!url.startsWith(publicBase)) return null;
      const key = decodeURIComponent(url.slice(publicBase.length));
      return isValidKey(key) ? key : null;
    },

    async delete(key: string) {
      if (!isValidKey(key)) throw new Error(`Invalid storage key: ${key}`);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
