import { UploadRejectedError } from "@zaydemy/adapters";
import { getLocalStorage } from "@/lib/server/services";

/**
 * Upload target for the local-disk storage driver (S3 uploads go straight to
 * the bucket). No session: the token, issued by the server after its own
 * authorization checks, fixes the key, type and size and expires quickly.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/files/upload/[token]">) {
  const storage = getLocalStorage();
  if (!storage) return new Response(null, { status: 404 });
  if (!request.body) return new Response(null, { status: 400 });

  const { token } = await params;
  const length = request.headers.get("content-length");
  const claims = {
    contentType: request.headers.get("content-type"),
    contentLength: length === null ? null : Number(length),
  };

  try {
    const key = storage.verifyUpload(token, claims);
    await storage.write(key, request.body, {
      contentType: claims.contentType!,
      contentLength: claims.contentLength!,
    });
    return new Response(null, { status: 201 });
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
