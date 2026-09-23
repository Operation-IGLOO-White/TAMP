// Multipart upload endpoint. Requires a session; stores the bytes via the local
// object store and returns the file id + served URL.
import type { Request, Response } from "express";
import multer from "multer";
import { partyFromCookie } from "../auth";
import { logger } from "../logger";
import { FILE_KINDS, type FileKind, MAX_UPLOAD_BYTES, saveUpload } from "../storage";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
}).single("file");

export async function uploadsHandler(req: Request, res: Response): Promise<void> {
  const partyId = await partyFromCookie(req.headers["cookie"] ?? null);
  if (!partyId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const file = req.file;
  const kind = String(req.body?.kind ?? "");
  if (!file) {
    res.status(400).json({ error: "Missing 'file' field." });
    return;
  }
  if (!FILE_KINDS.includes(kind as FileKind)) {
    res.status(400).json({ error: `Invalid 'kind'. Expected one of ${FILE_KINDS.join(", ")}.` });
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: "File too large (max 8 MB)." });
    return;
  }

  try {
    const saved = await saveUpload({
      ownerId: partyId,
      kind: kind as FileKind,
      filename: file.originalname || "upload",
      contentType: file.mimetype || "application/octet-stream",
      bytes: file.buffer,
    });
    logger.info("file_uploaded", { id: saved.id, kind: saved.kind, size: saved.size, partyId });
    res.status(201).json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    res.status(400).json({ error: message });
  }
}
