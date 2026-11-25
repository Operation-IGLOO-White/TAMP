import { useState } from "react";

const documents = {
  licence: "Vehicle licence disc",
  roadworthy: "Roadworthy certificate",
  operatingLicence: "Operating licence",
  insurance: "Insurance certificate",
} as const;
const documentKeys = Object.keys(documents) as (keyof typeof documents)[];
const button = "inline-flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = button + " bg-signal text-signal-foreground";

export type PassengerReview = {
  supplier: string;
  vehicle: {
    id: string;
    version: string;
    createdAt?: string;
    registration: string;
    make: string;
    model: string;
    type: "MINIBUS" | "MIDIBUS" | "BUS" | "COACH";
    subtypeLabel?: string;
    seats: number;
    wheelchairPositions: number;
    displacedSeats: number;
    luggageKg: number;
    luggageM3: number;
    luggageDimensions?: { lengthM: number; widthM: number; heightM: number } | null;
    location: { label: string };
    serviceArea: string;
    availability: { start: string; end: string };
    verification: "PENDING" | "VERIFIED" | "REJECTED";
    reviewReason?: string;
    licenceExpiry: string;
    permitExpiry: string;
    documents: Record<keyof typeof documents, string>;
    photos: string[];
  };
};

const displayDate = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});

export function PassengerReviewForm({ vehicle, busy, onReview }: {
  vehicle: PassengerReview["vehicle"]; busy: boolean; onReview: (status: "VERIFIED" | "REJECTED", reason: string) => void;
}) {
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  return <div className="grid gap-3 border-t border-border pt-3">
    <p>{vehicle.location.label} · {vehicle.serviceArea}</p>
    <p>{displayDate.format(new Date(vehicle.availability.start))} – {displayDate.format(new Date(vehicle.availability.end))} SAST</p>
    <p>{vehicle.wheelchairPositions} wheelchair positions · {vehicle.seats - vehicle.displacedSeats} seats with wheelchair configuration</p>
    <p>Luggage capacity · {vehicle.luggageKg} kg / {vehicle.luggageM3} m³
      {vehicle.luggageDimensions && <> · {vehicle.luggageDimensions.lengthM} × {vehicle.luggageDimensions.widthM} × {vehicle.luggageDimensions.heightM} m</>}
    </p>
    <p>Vehicle licence expires {vehicle.licenceExpiry} · Operating licence expires {vehicle.permitExpiry}</p>
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <h3 className="border-b border-border px-4 py-3 font-semibold">Vehicle documents</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
            <th scope="col" className="px-4 py-3">Document</th><th scope="col" className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">{documentKeys.map((key) => {
            const url = vehicle.documents[key];
            return <tr key={key}><th scope="row" className="px-4 py-3 font-medium">{documents[key]}</th>
              <td className="px-4 py-3">{url ? <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} onClick={() => setPreview({ url, label: documents[key] })}>View document</button>
                <a className={button} href={url + (url.includes("?") ? "&" : "?") + "download=1"}>Download</a>
              </div> : <span className="text-destructive">File not uploaded</span>}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
    {preview && <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <h3 className="font-semibold">{preview.label}</h3>
        <div className="flex gap-2"><a className={button} href={preview.url} target="_blank" rel="noreferrer">Open in new tab</a>
          <button type="button" className={button} onClick={() => setPreview(null)}>Close preview</button></div>
      </div>
      <iframe key={preview.url} title={preview.label} src={preview.url} className="h-[65vh] min-h-80 w-full bg-white" />
      <p className="p-3 text-xs text-muted-foreground">If the preview is unavailable, open the document in a new tab or download it.</p>
    </section>}
    <section>
      <h3 className="mb-3 font-semibold">Uploaded vehicle photos</h3>
      {vehicle.photos.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vehicle.photos.map((url, index) => <a key={index} href={url} target="_blank" rel="noreferrer"
          className="overflow-hidden rounded-xl border border-border bg-card">
          <img src={url} alt={`Uploaded vehicle photo ${index + 1}`} loading="lazy" className="h-44 w-full object-contain" />
          <span className="block border-t border-border p-2 text-sm">View photo {index + 1}</span>
        </a>)}
      </div> : <p className="text-muted-foreground">No vehicle photos uploaded.</p>}
    </section>
    {vehicle.reviewReason && <p className="text-sm text-destructive">{vehicle.reviewReason}</p>}
    <label className="grid max-w-xl gap-1.5">Review notes<input className="min-h-10 rounded-md border border-border bg-background px-3" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || vehicle.verification === "VERIFIED"} onClick={() => onReview("VERIFIED", reason)}>Verify vehicle</button>
      <button className={button} disabled={busy || !reason.trim()} onClick={() => onReview("REJECTED", reason)}>Reject vehicle</button>
    </div>
  </div>;
}
