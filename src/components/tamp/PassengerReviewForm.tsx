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
  const specifications = [
    ["Vehicle", [vehicle.make, vehicle.model].join(" ")],
    ["Vehicle type", vehicle.subtypeLabel || vehicle.type.toLowerCase()],
    ["Passenger seats", String(vehicle.seats)],
    ["Wheelchair positions", String(vehicle.wheelchairPositions)],
    ["Seats with wheelchair configuration", String(vehicle.seats - vehicle.displacedSeats)],
    ["Luggage capacity", `${vehicle.luggageKg} kg / ${vehicle.luggageM3} m³`],
    ["Current location", vehicle.location.label],
    ["Service area", vehicle.serviceArea],
    ["Available from (SAST)", displayDate.format(new Date(vehicle.availability.start))],
    ["Available until (SAST)", displayDate.format(new Date(vehicle.availability.end))],
    ["Vehicle licence expiry", vehicle.licenceExpiry],
    ["Operating licence expiry", vehicle.permitExpiry],
    ...(vehicle.luggageDimensions ? [["Luggage dimensions", `${vehicle.luggageDimensions.lengthM} × ${vehicle.luggageDimensions.widthM} × ${vehicle.luggageDimensions.heightM} m`]] : []),
  ];
  return <div className="grid min-w-0 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="grid min-w-0 content-start gap-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <h3 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Specification</h3>
        <dl className="grid sm:grid-cols-2">
          {specifications.map(([label, value]) => <div key={label} className="min-w-0 border-b border-border px-4 py-3 sm:odd:border-r">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm capitalize">{value || "Not provided"}</dd>
          </div>)}
        </dl>
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <h3 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicle photos ({vehicle.photos.length})</h3>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicle.photos.map((url, index) => <ReviewPhoto key={url + index} url={url} index={index} />)}
          {!vehicle.photos.length && <p className="text-sm text-muted-foreground">No vehicle photos uploaded.</p>}
        </div>
      </section>
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
    </div>
    <aside className="h-fit rounded-2xl border border-border bg-card shadow-sm">
      <h3 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicle verification</h3>
      <div className="grid gap-4 p-4">
        <p className="font-mono text-sm font-bold">{vehicle.registration}</p>
        <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-semibold">{vehicle.verification.toLowerCase()}</span>
    {vehicle.reviewReason && <p className="text-sm text-destructive">{vehicle.reviewReason}</p>}
    <label className="grid gap-1.5 text-sm">Review notes<textarea rows={4} placeholder="Add review notes or a reason for rejection" className="w-full rounded-lg border border-border bg-background p-3" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || vehicle.verification === "VERIFIED"} onClick={() => onReview("VERIFIED", reason)}>Verify vehicle</button>
      <button className={button} disabled={busy || !reason.trim()} onClick={() => onReview("REJECTED", reason)}>Reject vehicle</button>
    </div>
      </div>
    </aside>
  </div>;
}


function ReviewPhoto({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  return <a href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border bg-muted">
    {failed ? <div className="grid aspect-[4/3] place-items-center px-3 text-center text-sm text-muted-foreground">Preview unavailable. Open the uploaded photo.</div>
      : <img src={url} alt={`Vehicle view ${index + 1}`} loading="lazy" onError={() => setFailed(true)} className="aspect-[4/3] w-full object-contain" />}
    <span className="block border-t border-border px-3 py-2 text-xs font-bold">Open photo {index + 1} ↗</span>
  </a>;
}
