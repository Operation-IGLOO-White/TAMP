import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTamp } from "@/context/TampContext";
import { hasPermission } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import { charterJourneyPercent, charterVehicleComplete, charterStageLabel, type CharterVehicleProgress } from "@/lib/charter-assignment";
import type { Booking } from "@/components/tamp/CharterBookings";

const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-bold";
const time = (value: string) => new Date(value).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

export function CharterWaybill({ booking, vehicle }: { booking: Booking; vehicle: CharterVehicleProgress }) {
  const { authParty } = useTamp();
  const client = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const rating = booking.ratings?.[vehicle.vehicleId];
  const percent = charterJourneyPercent({ outbound: { progress: vehicle.legs.outbound }, ...(vehicle.legs.returnLeg ? { returnLeg: { progress: vehicle.legs.returnLeg } } : {}) });
  async function rate() {
    setBusy(true);
    try {
      await trpc.mutation("charter.rate", { bookingId: booking.id, vehicleId: vehicle.vehicleId, stars, comment });
      await client.invalidateQueries({ queryKey: ["charter-bookings"] });
      toast.success("Journey rating submitted");
    } catch (error) { toast.error("Rating could not be saved", { description: error instanceof Error ? error.message : "Try again shortly." }); }
    finally { setBusy(false); }
  }
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <header className="flex flex-wrap justify-between gap-3 border-b border-dashed border-border p-4"><div><h3 className="text-xl font-black italic">PASSENGER WAYBILL</h3><p className="mt-1 font-mono text-xs">{vehicle.registration}</p><p className="break-all text-xs text-muted-foreground">{booking.id}</p></div><p className="text-xl font-black text-signal">{percent}%</p></header>
    <div className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">TRANSPORTER</p><p className="font-bold">{booking.supplier}</p></div><div><p className="text-xs text-muted-foreground">REQUESTER</p><p className="font-bold">{booking.customer}</p></div></div>
    {(["outbound", "returnLeg"] as const).map((key) => {
      const leg = booking[key]; const progress = vehicle.legs[key];
      return leg && progress ? <div key={key} className="border-t border-dashed border-border p-4 text-sm"><div className="mb-2 flex justify-between gap-2"><h4 className="font-bold">{key === "outbound" ? "Outbound" : "Return"}</h4><span>{charterStageLabel[progress.stage]}</span></div><p>{leg.origin.label} → {leg.destination.label}</p><p className="mt-1 text-xs text-muted-foreground">Scheduled pickup {time(leg.pickupAt)} SAST</p>{progress.updatedAt && <p className="text-xs text-muted-foreground">Last step {time(progress.updatedAt)} SAST</p>}<ol className="mt-3 space-y-1 border-l-2 border-signal/40 pl-3">{progress.events?.map((event, index) => <li key={index} className="text-xs"><span className="font-semibold">{({ START: "Travel to pickup started", ARRIVE_PICKUP: "Arrived at pickup", BOARD: "Passengers boarded", COMPLETE_STOP: "Stop completed", COMPLETE: "Passengers dropped off" } as Record<string, string>)[event.action] ?? event.action}</span> · {time(event.at)} SAST</li>)}</ol></div> : null;
    })}
    <div className="mx-4 mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-signal transition-all" style={{ width: `${percent}%` }} /></div>
    {booking.returnLeg && <p className="px-4 pb-4 text-xs text-muted-foreground">Outbound completion = 50% · Return completion = 100%. Each vehicle completes independently.</p>}
    {rating ? <div className="border-t border-border p-4"><p className="font-bold">Ride rating · {rating.stars}/5</p><p className="text-sm text-muted-foreground">{rating.comment}</p></div> : !booking.incoming && charterVehicleComplete(vehicle) && hasPermission(authParty, "loads.manage") && <div className="grid gap-3 border-t border-border p-4"><p className="font-bold">Rate this driver and journey</p><div className="flex gap-2" role="group" aria-label="Ride rating">{[1,2,3,4,5].map((n) => <button key={n} type="button" aria-pressed={stars === n} className={`${button} ${stars === n ? "bg-signal text-signal-foreground" : ""}`} onClick={() => setStars(n)}>{n}</button>)}</div><textarea aria-label="Rating comment" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} className="rounded-lg border border-border bg-background p-3 text-sm" placeholder="How was your journey?" /><button type="button" disabled={!stars || busy} className={`${button} bg-signal text-signal-foreground disabled:opacity-50`} onClick={() => void rate()}>Submit rating</button></div>}
  </section>;
}

export function CharterRecords({ invoices = false }: { invoices?: boolean }) {
  const { authParty, role } = useTamp();
  const query = useQuery({ queryKey: ["charter-bookings", authParty?.id, authParty?.activeOrganisationId], queryFn: () => trpc.query<Booking[]>("charter.list"), enabled: role !== "DRIVER" && role !== "ADMIN", refetchInterval: 20_000 });
  const bookings = (query.data ?? []).filter((b) => invoices ? b.invoice : b.vehicleProgress?.some(charterVehicleComplete));
  if (!bookings.length) return null;
  return <section className="grid gap-4"><h2 className="text-lg font-bold">Passenger charter {invoices ? "invoices" : "history"}</h2>{bookings.map((booking) => invoices && booking.invoice ? <article key={booking.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-black italic">CHARTER INVOICE</h3><span className="rounded bg-signal/15 px-2 py-1 text-xs">{booking.invoice.status}</span></div><p className="mt-2 break-all font-mono text-xs">{booking.invoice.number}</p><p className="mt-3 text-sm">{booking.supplier} → {booking.customer}</p><p className="text-xs text-muted-foreground">Issued {time(booking.invoice.issuedAt)} SAST · All allocated vehicles completed</p><p className="mt-3 text-xl font-black">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(booking.invoice.total))} <span className="text-xs">{booking.invoice.vat === "INCL" ? "incl." : "excl."} VAT</span></p><p className="mt-2 text-xs text-muted-foreground">Invoice record. Payment is not automatically collected.</p></article> : <div key={booking.id} className="grid gap-4 lg:grid-cols-2">{booking.vehicleProgress?.filter(charterVehicleComplete).map((vehicle) => <CharterWaybill key={vehicle.vehicleId} booking={booking} vehicle={vehicle} />)}</div>)}</section>;
}
