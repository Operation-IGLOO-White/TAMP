import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  FileWarning,
  ListChecks,
  Search,
  ShieldCheck,
  Truck,
  UserRoundCog,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL } from "@/components/tamp/BodyTypeIcon";
import { StatCard } from "@/components/tamp/StatCard";
import { useTamp } from "@/context/TampContext";
import { listOrganisations } from "@/fns/organisations";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { Link } from "@/lib/nav";

type Queue = "all" | "organisations" | "trucks" | "drivers" | "documents";
type ReviewStatus = "PENDING" | "UNVERIFIED" | "REJECTED" | "ACTION_REQUIRED" | "DUE_SOON";
type ReviewItem = {
  id: string;
  kind: Exclude<Queue, "all">;
  title: string;
  subtitle: string;
  company: string;
  status: ReviewStatus;
  submittedAt: string;
  href: string;
  image?: string;
  detail: string;
};

const QUEUES: { id: Queue; label: string; icon: typeof ListChecks }[] = [
  { id: "all", label: "All reviews", icon: ListChecks },
  { id: "organisations", label: "Organisations", icon: Building2 },
  { id: "trucks", label: "Trucks", icon: Truck },
  { id: "drivers", label: "Drivers", icon: UserRoundCog },
  { id: "documents", label: "Documents", icon: FileWarning },
];

function ageLabel(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Submitted today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

export default function VerificationInbox() {
  const { parties, trucks, vehicles, maintenance } = useTamp();
  const { data: organisations = [] } = useQuery({ queryKey: ["organisations"], queryFn: listOrganisations });
  const [params, setParams] = useSearchParams();
  const requested = params.get("queue") as Queue | null;
  const queue: Queue = requested && QUEUES.some((item) => item.id === requested) ? requested : "all";
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("ALL");
  const [status, setStatus] = useState<ReviewStatus | "ALL">("ALL");
  const [order, setOrder] = useState<"oldest" | "newest">("oldest");

  const items = useMemo<ReviewItem[]>(() => {
    const organisationItems: ReviewItem[] = organisations
      .filter((organisation) => organisation.verification !== "VERIFIED")
      .map((organisation) => ({
        id: organisation.id,
        kind: "organisations",
        title: organisation.name,
        subtitle: organisation.type.replaceAll("_", " "),
        company: organisation.name,
        status: organisation.verification === "REJECTED" ? "REJECTED" : organisation.verification === "UNVERIFIED" ? "UNVERIFIED" : "PENDING",
        submittedAt: organisation.createdAt ?? new Date(0).toISOString(),
        href: `/admin/organisations?organisationId=${encodeURIComponent(organisation.id)}`,
        detail: "Review company information, members and registration status.",
      }));

    const truckItems: ReviewItem[] = trucks.flatMap((truck) => {
      const owner = parties.find((party) => party.id === truck.transporterId);
      const vehicle = vehicles.find((item) => item.id === truck.vehicleId);
      if (vehicle?.verification === "VERIFIED") return [];
      return [{
        id: truck.id,
        kind: "trucks" as const,
        title: truck.registration,
        subtitle: BODY_TYPE_LABEL[truck.bodyType],
        company: owner?.companyName ?? "Unknown company",
        status: vehicle?.verification === "REJECTED" ? "REJECTED" as const : vehicle?.verification === "UNVERIFIED" ? "UNVERIFIED" as const : "PENDING" as const,
        submittedAt: vehicle?.createdAt ?? truck.createdAt,
        href: `/trucks/${encodeURIComponent(truck.id)}`,
        image: fleetVehicleAsset(truck),
        detail: "Inspect vehicle photos, licence, roadworthy and insurance documents.",
      }];
    });

    const driverItems: ReviewItem[] = parties
      .filter((party) => party.role === "DRIVER" && party.verification !== "VERIFIED")
      .map((driver) => ({
        id: driver.id,
        kind: "drivers",
        title: driver.contactName,
        subtitle: driver.email,
        company: driver.companyName,
        status: driver.verification === "REJECTED" ? "REJECTED" : driver.verification === "UNVERIFIED" ? "UNVERIFIED" : "PENDING",
        submittedAt: driver.createdAt,
        href: `/admin/users/${encodeURIComponent(driver.id)}`,
        detail: "Review account identity and organisation membership before activation.",
      }));

    const documentItems: ReviewItem[] = trucks.flatMap((truck) => {
      const owner = parties.find((party) => party.id === truck.transporterId);
      const vehicle = vehicles.find((item) => item.id === truck.vehicleId);
      const compliance = assessFleetCompliance(truck, vehicle, maintenance);
      const documentCount = vehicle?.documents.length ?? truck.documents?.length ?? 0;
      const problems = [
        !truck.licenceNumber && !vehicle?.licenceNumber ? "licence number missing" : null,
        !truck.licenceExpiry && !vehicle?.licenceExpiry ? "licence expiry missing" : null,
        documentCount < 3 ? `${3 - documentCount} required document${3 - documentCount === 1 ? "" : "s"} missing` : null,
      ].filter(Boolean);
      if (!problems.length && compliance.level === "COMPLIANT") return [];
      return [{
        id: `documents-${truck.id}`,
        kind: "documents" as const,
        title: `${truck.registration} documents`,
        subtitle: `${documentCount}/3 required documents`,
        company: owner?.companyName ?? "Unknown company",
        status: compliance.level === "DUE_SOON" ? "DUE_SOON" as const : "ACTION_REQUIRED" as const,
        submittedAt: vehicle?.updatedAt ?? truck.createdAt,
        href: `/trucks/${encodeURIComponent(truck.id)}`,
        image: fleetVehicleAsset(truck),
        detail: problems.join(" · ") || "A compliance document is approaching expiry.",
      }];
    });
    return [...organisationItems, ...truckItems, ...driverItems, ...documentItems];
  }, [organisations, parties, trucks, vehicles, maintenance]);

  const companies = useMemo(() => [...new Set(items.map((item) => item.company))].sort(), [items]);
  const filtered = items
    .filter((item) => queue === "all" || item.kind === queue)
    .filter((item) => company === "ALL" || item.company === company)
    .filter((item) => status === "ALL" || item.status === status)
    .filter((item) => `${item.title} ${item.subtitle} ${item.company} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => order === "oldest" ? new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime() : new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const count = (kind: ReviewItem["kind"]) => items.filter((item) => item.kind === kind).length;

  return (
    <AppShell>
      <PageHeader title="Verification Inbox" />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="All pending" value={String(items.length)} icon={ListChecks} accent />
          <StatCard label="Organisations" value={String(count("organisations"))} icon={Building2} />
          <StatCard label="Truck reviews" value={String(count("trucks"))} icon={Truck} />
          <StatCard label="Driver reviews" value={String(count("drivers"))} icon={UserRoundCog} />
          <StatCard label="Documents" value={String(count("documents"))} icon={FileWarning} />
        </div>

        <section className="app-surface overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {QUEUES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setParams(id === "all" ? {} : { queue: id })} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-bold ${queue === id ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-steel/50 hover:text-foreground"}`}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[minmax(240px,1fr)_200px_170px_150px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search submissions" className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label>
            <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Filter by company" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="ALL">All companies</option>{companies.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter by review status" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="UNVERIFIED">Unverified</option><option value="REJECTED">Rejected</option><option value="ACTION_REQUIRED">Action required</option><option value="DUE_SOON">Due soon</option></select>
            <select value={order} onChange={(event) => setOrder(event.target.value as typeof order)} aria-label="Sort submissions" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select>
          </div>

          <div className="divide-y divide-border">
            {filtered.length === 0 && <div className="px-5 py-16 text-center"><ShieldCheck className="mx-auto mb-3 size-8 text-positive" /><p className="text-sm font-bold">This review queue is clear.</p><p className="mt-1 text-xs text-muted-foreground">There are no submissions matching the selected filters.</p></div>}
            {filtered.map((item) => (
              <Link key={`${item.kind}-${item.id}`} to={item.href} className="grid gap-3 px-4 py-4 transition-colors hover:bg-steel/25 md:grid-cols-[72px_minmax(0,1fr)_minmax(150px,.45fr)_auto] md:items-center">
                <div className="flex size-[60px] items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5">
                  {item.image ? <img src={item.image} alt="" className="h-full w-full object-contain" /> : item.kind === "organisations" ? <Building2 className="size-6 text-black/60" /> : <UserRoundCog className="size-6 text-black/60" />}
                </div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{item.title}</h3><ReviewBadge status={item.status} /></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p><p className="mt-1 line-clamp-2 text-[11px]">{item.detail}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Company</p><p className="mt-1 truncate text-xs font-semibold">{item.company}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarClock className="size-3" /> {ageLabel(item.submittedAt)}</p></div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-signal">Review <ChevronRight className="size-4" /></span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const style = status === "REJECTED" || status === "ACTION_REQUIRED" ? "bg-danger/15 text-danger" : status === "DUE_SOON" ? "bg-signal/15 text-signal" : "bg-steel text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${style}`}>{status.replaceAll("_", " ")}</span>;
}
