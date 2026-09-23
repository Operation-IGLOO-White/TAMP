// Local object storage for uploaded files (avatars, KYC docs, POD photos, truck
// photos). Bytes live on disk under UPLOAD_DIR; metadata lives in the StoredFile
// table. This is the demo-grade backend for the file-storage subsystem — the
// same StoredFile row + upload/serve routes would point at S3 signed URLs in
// production without touching the callers.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";

export const UPLOAD_DIR =
  process.env["UPLOAD_DIR"] ?? path.join(process.cwd(), ".uploads");

export const FILE_KINDS = ["AVATAR", "KYC", "POD", "TRUCK_PHOTO"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

// Avatars and POD/truck photos are shown around the app, so they're public.
// KYC documents are private — only the owner or an admin may fetch them.
const PUBLIC_KINDS = new Set<FileKind>(["AVATAR", "POD", "TRUCK_PHOTO"]);

const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["application/pdf", "pdf"],
]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

const fid = () =>
  `FL-${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;

export interface SaveResult {
  id: string;
  url: string;
  kind: FileKind;
  filename: string;
  contentType: string;
  size: number;
}

export async function saveUpload(args: {
  ownerId: string;
  kind: FileKind;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<SaveResult> {
  const ext = ALLOWED.get(args.contentType);
  if (!ext) throw new Error(`Unsupported file type: ${args.contentType}`);
  if (args.bytes.length === 0) throw new Error("Empty file.");
  if (args.bytes.length > MAX_UPLOAD_BYTES) throw new Error("File too large (max 8 MB).");

  const id = fid();
  // Store hashed by id under a per-owner subdir; the stored name never derives
  // from the client filename, so there's no path-traversal surface.
  const rel = path.join(sanitizeSegment(args.ownerId), `${id}.${ext}`);
  const abs = path.join(UPLOAD_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, args.bytes);

  const visibility = PUBLIC_KINDS.has(args.kind) ? "public" : "private";
  await prisma.storedFile.create({
    data: {
      id,
      ownerId: args.ownerId,
      kind: args.kind,
      filename: args.filename.slice(0, 200),
      contentType: args.contentType,
      size: args.bytes.length,
      visibility,
      path: rel,
    },
  });
  return {
    id,
    url: `/api/files/${id}`,
    kind: args.kind,
    filename: args.filename,
    contentType: args.contentType,
    size: args.bytes.length,
  };
}

export interface LoadedFile {
  bytes: Buffer;
  contentType: string;
  filename: string;
  kind: FileKind;
  visibility: string;
  ownerId: string;
  etag: string;
}

export async function loadFile(id: string): Promise<LoadedFile | null> {
  const row = await prisma.storedFile.findUnique({ where: { id } });
  if (!row) return null;
  // Confine reads to UPLOAD_DIR — reject any stored path that escapes it.
  const abs = path.resolve(UPLOAD_DIR, row.path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  const bytes = await readFile(abs).catch(() => null);
  if (!bytes) return null;
  return {
    bytes,
    contentType: row.contentType,
    filename: row.filename,
    kind: row.kind as FileKind,
    visibility: row.visibility,
    ownerId: row.ownerId,
    etag: `"${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}"`,
  };
}

export function isPublicKind(kind: FileKind): boolean {
  return PUBLIC_KINDS.has(kind);
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "anon";
}
