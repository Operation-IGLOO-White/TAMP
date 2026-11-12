import { ArrowLeft, BadgeCheck, CalendarClock, Download, FileText, FolderOpen, Mail, MapPin, Phone, Plus, ShieldCheck, Star, Trash2, Truck, UserRound, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { useTamp } from "@/context/TampContext";
import { listOrganisationMembers } from "@/fns/organisations";
import { deleteDriverDocument, listDriverDocuments, uploadDriverDocument, type DriverDocument, type DriverDocumentType } from "@/fns/driver-documents";
import { Link } from "@/lib/nav";
import { DRIVER_ROLE_ID, driverAvailability, driverTrips, statusStyle } from "./driver-data";

const DOCUMENT_LABELS: Record<DriverDocumentType, string> = { IDENTITY_DOCUMENT: "Identity document", DRIVING_LICENCE: "Driving licence", PRDP: "Professional Driving Permit", MEDICAL_CERTIFICATE: "Medical certificate", EMPLOYMENT_CONTRACT: "Employment contract" };

export default function DriverProfilePage() {
  const { driverId = "" } = useParams();
  const { authParty, trucks, trips, matches, loads } = useTamp();
  const organisationId = authParty?.activeOrganisationId ?? null;
  const { data: members = [], isLoading } = useQuery({ queryKey: ["organisation-members", organisationId], queryFn: () => listOrganisationMembers(organisationId!), enabled: Boolean(organisationId) });
  const driver = members.find((member) => member.id === driverId && member.roleIds.includes(DRIVER_ROLE_ID));
  const truck = trucks.find((item) => item.driverId === driverId);
  const history = driverTrips(driverId, trips).sort((a, b) => new Date(b.events.at(-1)?.at ?? 0).getTime() - new Date(a.events.at(-1)?.at ?? 0).getTime());

  if (isLoading) return <AppShell><div className="p-10 text-center text-sm text-muted-foreground">Loading driver profile…</div></AppShell>;
  if (!driver) return <AppShell><div className="p-10 text-center"><p className="font-bold">Driver not found</p><Link to="/transporter/drivers" className="mt-3 inline-block text-sm font-bold text-signal">Return to directory</Link></div></AppShell>;

  const state = driverAvailability(driver, truck);
  const completed = history.filter((trip) => ["DELIVERED", "COMPLETED"].includes(trip.status)).length;
  const activeTrip = history.find((trip) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(trip.status));

  return <AppShell>
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/transporter/drivers" className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
      <div className="min-w-0"><div className="truncate font-bold">Driver profile</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Personnel file · {driver.id}</div></div>
      <span className={`ml-auto rounded-full px-3 py-1 text-[10px] font-black ${statusStyle[state]}`}>{state.replaceAll("_", " ")}</span>
    </header>
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-signal/10 p-5 shadow-sm sm:p-7">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <Avatar party={driver} size="lg" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight">{driver.contactName}</h1>{driver.verification === "VERIFIED" && <BadgeCheck className="size-5 text-positive" />}</div><p className="mt-1 text-sm text-muted-foreground">Organisation driver · joined {new Date(driver.createdAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs"><Contact icon={Mail} value={driver.email} /><Contact icon={Phone} value={driver.phone} /><Contact icon={MapPin} value={driver.province || "Not supplied"} /></div></div>
          <div className="grid grid-cols-3 gap-2 md:w-[330px]"><Stat label="Trips" value={history.length} /><Stat label="Completed" value={completed} /><Stat label="Rating" value={driver.ratingAvg == null ? "New" : driver.ratingAvg.toFixed(1)} /></div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title="Operational profile" icon={UserRound}>
            <div className="grid sm:grid-cols-2"><Info label="Account status" value={driver.suspended ? "Suspended" : "Active"} /><Info label="Verification" value={driver.verification} /><Info label="Assigned vehicle" value={truck?.registration ?? "Not assigned"} /><Info label="Vehicle status" value={truck?.status.replaceAll("_", " ") ?? "—"} /><Info label="Current work" value={activeTrip ? activeTrip.status.replaceAll("_", " ") : "No active trip"} /><Info label="Organisation role" value="Driver" /></div>
          </Panel>
          <Panel title={`Trip history (${history.length})`} icon={CalendarClock}>
            {history.length === 0 ? <Empty text="No trips have been assigned to this driver." /> : <div className="divide-y divide-border">{history.map((trip) => {
              const match = matches.find((item) => item.id === trip.matchId); const load = loads.find((item) => item.id === match?.loadId);
              return <div key={trip.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="font-mono text-xs font-bold">{trip.id}</div><div className="mt-1 truncate text-sm font-semibold">{load ? `${load.origin.label} → ${load.destination.label}` : "Route unavailable"}</div><div className="mt-1 text-[10px] text-muted-foreground">{truck?.registration ?? "Vehicle not assigned"} · {trip.events.at(-1)?.at ? new Date(trip.events.at(-1)!.at).toLocaleString("en-ZA") : "No activity yet"}</div></div><span className="w-fit rounded-full bg-steel/50 px-2.5 py-1 text-[9px] font-black">{trip.status.replaceAll("_", " ")}</span></div>;
            })}</div>}
          </Panel>
        </div>
        <aside className="space-y-5">
          <DriverDocumentFolder organisationId={organisationId!} driverId={driver.id} canManage={authParty?.permissions?.includes("organisations.members.manage") ?? false} />
          <Panel title="Performance" icon={Star}><div className="grid grid-cols-2"><Info label="Average rating" value={driver.ratingAvg == null ? "No rating yet" : `${driver.ratingAvg.toFixed(1)} / 5`} /><Info label="Rating count" value={driver.ratingCount} /><Info label="Completion rate" value={history.length ? `${Math.round((completed / history.length) * 100)}%` : "—"} /><Info label="Safety flags" value="0 recorded" /></div></Panel>
          {truck && <Link to="/trucks/$truckId" params={{ truckId: truck.id }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-signal"><Truck className="size-5 text-signal" /><div><div className="text-sm font-bold">Open assigned vehicle</div><div className="text-xs text-muted-foreground">{truck.registration} · {truck.bodyType.replaceAll("_", " ")}</div></div></Link>}
        </aside>
      </div>
    </main>
  </AppShell>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center gap-2 border-b border-border px-4 py-3"><Icon className="size-4 text-signal" /><h2 className="text-xs font-black uppercase tracking-widest">{title}</h2></div>{children}</section>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-border bg-background/80 p-3 text-center"><div className="font-mono text-lg font-black">{value}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div></div>; }
function Info({ label, value }: { label: string; value: string | number }) { return <div className="border-b border-border p-4 sm:border-r"><div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>; }
function Contact({ icon: Icon, value }: { icon: typeof Mail; value: string }) { return <span className="inline-flex min-w-0 items-center gap-1.5"><Icon className="size-3.5 shrink-0 text-signal" /><span className="truncate">{value}</span></span>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>; }

function DriverDocumentFolder({ organisationId, driverId, canManage }: { organisationId: string; driverId: string; canManage: boolean }) {
  const client = useQueryClient();
  const key = ["driver-documents", organisationId, driverId];
  const { data: documents = [], isLoading } = useQuery({ queryKey: key, queryFn: () => listDriverDocuments(organisationId, driverId), enabled: Boolean(organisationId) });
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<DriverDocumentType>("DRIVING_LICENCE");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: () => uploadDriverDocument({ organisationId, driverId, documentType, documentNumber, issuedAt, expiresAt, file: file! }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); setOpen(false); setFile(null); setDocumentNumber(""); setIssuedAt(""); setExpiresAt(""); toast.success("Driver document filed"); },
    onError: (error) => toast.error("Upload failed", { description: error.message }),
  });
  const remove = useMutation({
    mutationFn: (documentId: string) => deleteDriverDocument(organisationId, driverId, documentId),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); toast.success("Document removed"); },
    onError: (error) => toast.error("Could not remove document", { description: error.message }),
  });
  const latest = new Map<DriverDocumentType, DriverDocument>();
  [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).forEach((document) => { if (!latest.has(document.documentType)) latest.set(document.documentType, document); });
  return <Panel title="Document folder" icon={FolderOpen}>
    <div className="p-3">
      <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-signal/25 bg-signal/5 p-3"><p className="text-xs text-muted-foreground">Private compliance files. Expiry reminders are sent to authorised members of this organisation.</p>{canManage && <button onClick={() => setOpen((value) => !value)} className="grid size-8 shrink-0 place-items-center rounded-lg bg-signal text-signal-foreground" aria-label="Add driver document">{open ? <X className="size-4" /> : <Plus className="size-4" />}</button>}</div>
      {open && <div className="mb-3 space-y-3 rounded-xl border border-border bg-background p-3">
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DriverDocumentType)} className={documentInput}>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Document number (optional)" className={documentInput} />
        <div className="grid grid-cols-2 gap-2"><label className="text-[9px] font-bold uppercase text-muted-foreground">Issued<input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} className={`${documentInput} mt-1`} /></label><label className="text-[9px] font-bold uppercase text-muted-foreground">Expires<input type="date" value={expiresAt} min={issuedAt} onChange={(event) => setExpiresAt(event.target.value)} className={`${documentInput} mt-1`} /></label></div>
        <label className="block cursor-pointer rounded-lg border border-dashed border-border p-3 text-center text-xs font-semibold hover:border-signal">{file?.name ?? "Choose image or PDF"}<input type="file" accept="image/*,.pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={!file || upload.isPending} onClick={() => upload.mutate()} className="w-full rounded-lg bg-signal py-2.5 text-xs font-black uppercase text-signal-foreground disabled:opacity-50">{upload.isPending ? "Uploading…" : "File document"}</button>
      </div>}
      <div className="space-y-2">{(Object.keys(DOCUMENT_LABELS) as DriverDocumentType[]).map((type) => { const document = latest.get(type); return <div key={type} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className={`grid size-9 place-items-center rounded-lg ${document ? "bg-positive/10 text-positive" : "bg-steel/40 text-muted-foreground"}`}><FileText className="size-4" /></span><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{DOCUMENT_LABELS[type]}</div><div className="truncate text-[10px] text-muted-foreground">{document ? `${document.filename}${document.expiresAt ? ` · expires ${new Date(`${document.expiresAt}T12:00:00`).toLocaleDateString("en-ZA")}` : ""}` : "Not uploaded"}</div></div>{document ? <><span className={`text-[9px] font-black uppercase ${document.status === "VALID" ? "text-positive" : document.status === "EXPIRING" ? "text-signal" : "text-danger"}`}>{document.status}</span><a href={document.fileUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-border" aria-label={`Download ${DOCUMENT_LABELS[type]}`}><Download className="size-3.5" /></a>{canManage && <button onClick={() => remove.mutate(document.id)} className="grid size-8 place-items-center rounded-lg border border-border text-danger" aria-label={`Remove ${DOCUMENT_LABELS[type]}`}><Trash2 className="size-3.5" /></button>}</> : <span className="text-[9px] font-black uppercase text-signal">Missing</span>}</div>; })}</div>
      {isLoading && <p className="py-3 text-center text-xs text-muted-foreground">Loading documents…</p>}
    </div>
  </Panel>;
}

const documentInput = "w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-signal";

