// Serves a stored file by id. Public kinds (avatars, POD/truck photos) are open;
// private kinds (KYC documents) require the owner or an admin. Bytes are read
// from the local object store confined to UPLOAD_DIR.
import type { Request, Response } from "express";
import { partyFromCookie } from "../auth";
import { prisma } from "../prisma";
import { isPublicKind, loadFile } from "../storage";

export async function filesHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const file = await loadFile(id);
  if (!file) {
    res.status(404).send("Not found");
    return;
  }

  if (!isPublicKind(file.kind)) {
    const partyId = await partyFromCookie(req.headers["cookie"] ?? null);
    if (!partyId) {
      res.status(401).send("Unauthorized");
      return;
    }
    if (partyId !== file.ownerId) {
      const me = await prisma.party.findUnique({ where: { id: partyId }, select: { role: true } });
      if (me?.role !== "ADMIN") {
        res.status(403).send("Forbidden");
        return;
      }
    }
  }

  // Not-modified short-circuit for repeat loads.
  if (req.headers["if-none-match"] === file.etag) {
    res.status(304).setHeader("ETag", file.etag).end();
    return;
  }

  const cache = isPublicKind(file.kind) ? "public, max-age=3600" : "private, no-store";
  res
    .status(200)
    .set({
      "content-type": file.contentType,
      "content-length": String(file.bytes.length),
      "cache-control": cache,
      ETag: file.etag,
      "content-disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
    })
    .send(file.bytes);
}
