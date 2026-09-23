"use client";

import { Camera, X } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFile } from "@/fns/upload";

export interface PodResult {
  recipientName: string;
  signature?: string | undefined; // data-URL PNG
  photoName?: string | undefined; // captured photo's original filename (display)
  photoUrl?: string | undefined; // served URL of the uploaded photo in object storage
  note?: string | undefined;
}

// Proof-of-delivery capture: recipient name, a drawn signature, an optional
// photo, and a note. Shown when the driver marks a trip Delivered.
export function PodCapture({
  route,
  onConfirm,
  onCancel,
}: {
  route: string;
  onConfirm: (pod: PodResult) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [name, setName] = useState("");
  const [photoName, setPhotoName] = useState<string | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
  };

  const confirm = () => {
    if (!name.trim()) {
      setError("Enter the name of who received the delivery.");
      return;
    }
    if (uploadingPhoto) {
      setError("Wait for the photo to finish uploading.");
      return;
    }
    const signature = dirty.current ? canvasRef.current!.toDataURL("image/png") : undefined;
    onConfirm({
      recipientName: name.trim(),
      signature,
      photoName,
      photoUrl,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-graphite shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-bold uppercase">Proof of delivery</div>
            <div className="truncate text-[11px] text-muted-foreground">{route}</div>
          </div>
          <button onClick={onCancel} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-steel/50 hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Received by
            </span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="Full name of recipient"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-signal"
              autoFocus
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Signature
              </span>
              <button onClick={clear} className="text-[10px] font-bold uppercase tracking-wide text-signal hover:underline">
                Clear
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={440}
              height={150}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              className="w-full touch-none rounded-md border border-dashed border-border bg-white"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs">
            {uploadingPhoto ? (
              <span className="text-muted-foreground">Uploading photo…</span>
            ) : photoUrl && photoName ? (
              <span className="font-semibold text-positive">✓ {photoName}</span>
            ) : (
              <>
                <Camera className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Add a delivery photo (optional)</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={uploadingPhoto}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setUploadingPhoto(true);
                setError("");
                try {
                  // Store the real photo bytes in the object store; the Proof
                  // keeps the served URL, not just a filename.
                  const up = await uploadFile(f, "POD");
                  setPhotoName(up.filename);
                  setPhotoUrl(up.url);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Photo upload failed.");
                } finally {
                  setUploadingPhoto(false);
                }
              }}
              className="hidden"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Left with security at gate 3"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-signal"
            />
          </label>

          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </div>

        <div className="border-t border-border p-4">
          <button
            onClick={confirm}
            className="w-full rounded-lg bg-signal py-3 text-sm font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
          >
            Confirm delivery
          </button>
        </div>
      </div>
    </div>
  );
}
