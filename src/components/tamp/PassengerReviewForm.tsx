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
  const [reason, setReason] = useState("");
  return <div className="grid gap-3 border-t border-border pt-3">
    <p>{vehicle.location.label} · {vehicle.serviceArea}</p>
    <p>{displayDate.format(new Date(vehicle.availability.start))} – {displayDate.format(new Date(vehicle.availability.end))} SAST</p>
    <p>{vehicle.wheelchairPositions} wheelchair positions · {vehicle.seats - vehicle.displacedSeats} seats with wheelchair configuration</p>
    <p>Luggage capacity · {vehicle.luggageKg} kg / {vehicle.luggageM3} m³
      {vehicle.luggageDimensions && <> · {vehicle.luggageDimensions.lengthM} × {vehicle.luggageDimensions.widthM} × {vehicle.luggageDimensions.heightM} m</>}
    </p>
    <p>Vehicle licence expires {vehicle.licenceExpiry} · Operating licence expires {vehicle.permitExpiry}</p>
    <div className="flex flex-wrap gap-2">
      {documentKeys.map((key) => <a key={key} className={button} href={vehicle.documents[key]} target="_blank" rel="noreferrer">{documents[key]}</a>)}
      {vehicle.photos.map((url, index) => <a key={index} className={button} href={url} target="_blank" rel="noreferrer">Photo {index + 1}</a>)}
    </div>
    {vehicle.reviewReason && <p className="text-sm text-destructive">{vehicle.reviewReason}</p>}
    <label className="grid max-w-xl gap-1.5">Review notes<input className="min-h-10 rounded-md border border-border bg-background px-3" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || vehicle.verification === "VERIFIED"} onClick={() => onReview("VERIFIED", reason)}>Verify vehicle</button>
      <button className={button} disabled={busy || !reason.trim()} onClick={() => onReview("REJECTED", reason)}>Reject vehicle</button>
    </div>
  </div>;
}
