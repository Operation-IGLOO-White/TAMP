// Client helper for the multipart upload endpoint. Returns the stored file's
// served URL, which the caller persists on the relevant record.
export type FileKind = "AVATAR" | "KYC" | "POD" | "TRUCK_PHOTO" | "TRUCK_DOCUMENT" | "MESSAGE";
import { responseError } from "@/lib/api-errors";

export interface UploadedFile {
  id: string;
  url: string;
  kind: FileKind;
  filename: string;
  contentType: string;
  size: number;
}

export async function uploadFile(file: File, kind: FileKind): Promise<UploadedFile> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  // Same-origin, via the /api/ reverse proxy — see src/lib/trpc.ts.
  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    headers: { "X-TAMP-Request": "1" },
    body,
  });
  if (!res.ok) {
    throw new Error(await responseError(res, "The file could not be uploaded. Please try again."));
  }
  try {
    return (await res.json()) as UploadedFile;
  } catch {
    throw new Error("The upload service returned an invalid response. Please try again shortly.");
  }
}
