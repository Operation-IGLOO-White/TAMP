import { passengerVehicleAsset } from "@/lib/passenger-assets";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2,
  BusFront,
  Check,
  CalendarClock,
  ChevronRight,
  FileWarning,
  ListChecks,
  Search,
  ShieldCheck,
  Truck,
  UserRoundCog,
  X,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL } from "@/components/tamp/BodyTypeIcon";
import { StatCard } from "@/components/tamp/StatCard";
import { useTamp } from "@/context/TampContext";
import { listOrganisations } from "@/fns/organisations";
import { getOnboarding } from "@/fns/parties";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { Link } from "@/lib/nav";
import { listReviewDocuments, reviewDocument, type DocumentSubjectType } from "@/fns/documents";

import { hasPermission } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import { PassengerReviewForm, type PassengerReview } from "@/components/tamp/PassengerReviewForm";

type Queue = "passenger" | "all" | "organisations" | "trucks" | "drivers" | "documents";
type ReviewStatus = "VERIFIED" | "PENDING" | "UNVERIFIED" | "REJECTED" | "ACTION_REQUIRED" | "DUE_SOON";
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
  subjectType?: DocumentSubjectType;
  subjectId?: string;
  documentId?: string;
  passenger?: PassengerReview;
  reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
};

const QUEUES: { id: Queue; label: string; icon: typeof ListChecks }[] = [
  { id: "all", label: "All reviews", icon: ListChecks },
  { id: "organisations", label: "Organisations", icon: Building2 },
  { id: "trucks", label: "Trucks", icon: Truck },
  { id: "drivers", label: "Drivers", icon: UserRoundCog },
  { id: "passenger", label: "Passenger Vehicles", icon: BusFront },
  { id: "documents", label: "Documents", icon: FileWarning },
];

function ageLabel(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Submitted today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

export default function VerificationInbox() {
  const queryClient = useQueryClient();
  const { authParty, parties, trucks, vehicles, maintenance } = useTamp();
  const canReviewPassengers = hasPermission(authParty, "platform.admin");
  const passengerKey = ["passenger-reviews", authParty?.id];
  const passengerReviews = useQuery({
    queryKey: passengerKey,
    queryFn: () => trpc.query<PassengerReview[]>("passenger.reviews"),
    enabled: canReviewPassengers,
  });
  const passengerReview = useMutation({
    mutationFn: (input: { id: string; version: string; status: "VERIFIED" | "REJECTED"; reason: string }) =>
      trpc.mutation("passenger.review", input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: passengerKey });
      toast.success("Vehicle review saved");
    },
    onError: (error) => toast.error("Vehicle review could not be saved", { description: error.message }),
  });
  const [openPassengerId, setOpenPassengerId] = useState<string | null>(null);
  const { data: organisations = [] } = useQuery({ queryKey: ["organisations"], queryFn: listOrganisations });
  const { data: reviewDocuments = [] } = useQuery({ queryKey: ["review-documents"], queryFn: listReviewDocuments });
  const review = useMutation({
    mutationFn: reviewDocument,
    onSuccess: (_result, input) => {
      toast.success(`Document ${input.status.toLowerCase()}`);
      return queryClient.invalidateQueries({ queryKey: ["review-documents"] });
    },
    onError: () => toast.error("Document review could not be saved"),
  });
  const [params, setParams] = useSearchParams();
  const requested = params.get("queue") as Queue | null;
  const queue: Queue = requested && (requested !== "passenger" || canReviewPassengers) && QUEUES.some((item) => item.id === requested) ? requested : "all";
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("ALL");
  const [selectedStatus, setStatus] = useState<ReviewStatus | "ALL">("ALL");
  const status = selectedStatus === "VERIFIED" && queue !== "passenger" ? "ALL" : selectedStatus;
  const [order, setOrder] = useState<"oldest" | "newest">("oldest");
  const pendingApplicants = useMemo(
    () => parties.filter((party) => party.verification !== "VERIFIED"),
    [parties],
  );
  const onboardingQueries = useQueries({
    queries: pendingApplicants.map((party) => ({
      queryKey: ["onboarding", party.id],
      queryFn: () => getOnboarding(party.id),
    })),
  });
  const registrationApplications = pendingApplicants.map((party, index) => ({
    party,
    onboarding: onboardingQueries[index]?.data,
  }));

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
    const registrationDocumentItems: ReviewItem[] = registrationApplications.flatMap(
      ({ party, onboarding }) => {
        const documents = onboarding?.documents ?? [];
        if (!documents.length) return [];
        const labels = documents.map((document) =>
          typeof document === "string" ? document : document.label,
        );
        return [{
          id: `registration-documents-${party.id}`,
          kind: "documents" as const,
          title: `${party.contactName} registration documents`,
          subtitle: `${documents.length} uploaded file${documents.length === 1 ? "" : "s"}`,
          company: party.companyName,
          status: party.verification === "REJECTED" ? "REJECTED" as const : "PENDING" as const,
          submittedAt: party.createdAt,
          href: `/admin/users/${encodeURIComponent(party.id)}`,
          detail: labels.join(" · "),
        }];
      },
    );
    const driverDocumentItems: ReviewItem[] = reviewDocuments.map((document) => ({
      id: `driver-document-${document.documentId}`,
      kind: "documents",
      title: document.driverName ?? "Driver document",
      subtitle: (document.documentType ?? "Driver document").replaceAll("_", " "),
      company: parties.find((party) => party.id === document.subjectId)?.companyName ?? "Transporter",
      status: document.reviewStatus === "REJECTED" ? "REJECTED" : "PENDING",
      submittedAt: document.uploadedAt ?? new Date(0).toISOString(),
      href: `/admin/users/${encodeURIComponent(document.subjectId)}`,
      detail: document.filename,
      subjectType: document.subjectType,
      subjectId: document.subjectId,
      documentId: document.documentId,
      reviewStatus: document.reviewStatus,
    }));
    const passengerItems: ReviewItem[] = (canReviewPassengers ? passengerReviews.data ?? [] : []).map((review) => {
      const { vehicle, supplier } = review;
      return {
        id: vehicle.id,
        kind: "passenger",
        title: vehicle.registration,
        subtitle: [vehicle.make, vehicle.model, vehicle.type, vehicle.subtypeLabel].filter(Boolean).join(" "),
        company: supplier,
        status: vehicle.verification,
        submittedAt: vehicle.createdAt ?? new Date(0).toISOString(),
        href: "/admin/verification?queue=passenger",
        detail: vehicle.location.label,
        passenger: review,
      };
    });
    return [...passengerItems, ...organisationItems, ...truckItems, ...driverItems, ...registrationDocumentItems, ...documentItems, ...driverDocumentItems];
  }, [organisations, parties, trucks, vehicles, maintenance, registrationApplications, reviewDocuments, canReviewPassengers, passengerReviews.data]);

  const companies = useMemo(() => [...new Set(items.map((item) => item.company))].sort(), [items]);
  const filtered = items
    .filter((item) => queue === "all" ? item.status !== "VERIFIED" : item.kind === queue)
    .filter((item) => company === "ALL" || item.company === company)
    .filter((item) => status === "ALL" || item.status === status)
    .filter((item) => `${item.title} ${item.subtitle} ${item.company} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => order === "oldest" ? new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime() : new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const passengerRows = filtered.flatMap((item) => item.passenger ? [item.passenger] : []);
  const showPassengerStatus = canReviewPassengers && (queue === "all" || queue === "passenger");
  const count = (kind: ReviewItem["kind"]) => items.filter((item) => item.kind === kind && item.status !== "VERIFIED").length;

  return (
    <AppShell>
      <PageHeader title="Verification Inbox" />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="All pending" value={String(items.filter((item) => item.status !== "VERIFIED").length)} icon={ListChecks} accent />
          <StatCard label="Organisations" value={String(count("organisations"))} icon={Building2} />
          <StatCard label="Truck reviews" value={String(count("trucks"))} icon={Truck} />
          <StatCard label="Driver reviews" value={String(count("drivers"))} icon={UserRoundCog} />
          {canReviewPassengers && <StatCard label="Passenger vehicles" value={String(count("passenger"))} icon={BusFront} />}
          <StatCard label="Documents" value={String(count("documents"))} icon={FileWarning} />
        </div>

        <section className="app-surface overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {QUEUES.filter(({ id }) => id !== "passenger" || canReviewPassengers).map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-pressed={queue === id} onClick={() => { setStatus("ALL"); setParams(id === "all" ? {} : { queue: id }); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-bold ${queue === id ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-steel/50 hover:text-foreground"}`}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[minmax(240px,1fr)_200px_170px_150px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search submissions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search submissions" className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label>
            <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Filter by company" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="ALL">All companies</option>{companies.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter by review status" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="UNVERIFIED">Unverified</option><option value="REJECTED">Rejected</option>{queue === "passenger" && <option value="VERIFIED">Verified</option>}<option value="ACTION_REQUIRED">Action required</option><option value="DUE_SOON">Due soon</option></select>
            <select value={order} onChange={(event) => setOrder(event.target.value as typeof order)} aria-label="Sort submissions" className="h-10 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select>
          </div>

          {showPassengerStatus && passengerReviews.isError && <p role="alert" className="p-4 text-sm text-destructive">
            Passenger vehicles could not be loaded. <button type="button" className="underline" onClick={() => void passengerReviews.refetch()}>Retry</button>
          </p>}
          {showPassengerStatus && passengerReviews.isPending && <p role="status" className="p-4 text-sm text-muted-foreground">Loading passenger vehicles…</p>}
          {passengerRows.length > 0 && <div className="overflow-x-auto border-b border-border" role="region" aria-label="Passenger vehicle reviews" tabIndex={0}>
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>{["Vehicle", "Company", "Capacity", "Status", "Action"].map((label) =>
                  <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {passengerRows.map(({ vehicle, supplier }) => {
                  const expanded = openPassengerId === vehicle.id;
                  return <Fragment key={vehicle.id}>
                    <tr className="hover:bg-steel/25">
                      <th scope="row" className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-3">
                          <img src={passengerVehicleAsset(vehicle)} alt="" className="h-10 w-16 object-contain" loading="lazy" />
                          <div><p className="font-mono font-bold">{vehicle.registration}</p>
                            <p>{vehicle.make} {vehicle.model}</p>
                            <p className="text-xs capitalize text-muted-foreground">{vehicle.type.toLowerCase()}{vehicle.subtypeLabel && ` · ${vehicle.subtypeLabel}`}</p></div>
                        </div>
                      </th>
                      <td className="px-4 py-3">{supplier}</td>
                      <td className="px-4 py-3">{vehicle.seats} seats</td>
                      <td className="px-4 py-3"><ReviewBadge status={vehicle.verification} /></td>
                      <td className="px-4 py-3">
                        <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide review for" : "Review"} ${vehicle.registration}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-bold"
                          onClick={() => setOpenPassengerId(expanded ? null : vehicle.id)}>
                          {expanded ? "Hide details" : "Review"} <ChevronRight className={`size-4 ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      </td>
                    </tr>
                    {expanded && <tr><td colSpan={5} className="bg-muted/30 px-4 pb-4">
                      <PassengerReviewForm key={vehicle.version} vehicle={vehicle} busy={passengerReview.isPending}
                        onReview={(status, reason) => passengerReview.mutate({ id: vehicle.id, version: vehicle.version, status, reason })} />
                    </td></tr>}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>}
          <div className="divide-y divide-border">
            {filtered.length === 0 && !(showPassengerStatus && (passengerReviews.isPending || passengerReviews.isError)) && <div className="px-5 py-16 text-center"><ShieldCheck className="mx-auto mb-3 size-8 text-positive" /><p className="text-sm font-bold">This review queue is clear.</p><p className="mt-1 text-xs text-muted-foreground">There are no submissions matching the selected filters.</p></div>}
            {filtered.filter((item) => !item.passenger).map((item) => (
              <Link key={`${item.kind}-${item.id}`} to={item.href} className="grid gap-3 px-4 py-4 transition-colors hover:bg-steel/25 md:grid-cols-[72px_minmax(0,1fr)_minmax(150px,.45fr)_auto] md:items-center">
                <div className="flex size-[60px] items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5">
                  {item.image ? <img src={item.image} alt="" className="h-full w-full object-contain" /> : item.kind === "organisations" ? <Building2 className="size-6 text-black/60" /> : <UserRoundCog className="size-6 text-black/60" />}
                </div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{item.title}</h3><ReviewBadge status={item.status} /></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p><p className="mt-1 line-clamp-2 text-[11px]">{item.detail}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Company</p><p className="mt-1 truncate text-xs font-semibold">{item.company}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarClock className="size-3" /> {ageLabel(item.submittedAt)}</p></div>
                {item.subjectType && item.documentId ? (
                  <span className="flex items-center justify-end gap-1">
                    <button type="button" disabled={review.isPending} onClick={(event) => { event.preventDefault(); review.mutate({ subjectType: item.subjectType!, subjectId: item.subjectId!, documentId: item.documentId!, status: "APPROVED" }); }} className="grid size-9 place-items-center rounded-md bg-signal text-signal-foreground disabled:opacity-50" aria-label={`Approve ${item.title}`}><Check className="size-4" /></button>
                    <button type="button" disabled={review.isPending} onClick={(event) => { event.preventDefault(); const reason = window.prompt("Why is this document being rejected?")?.trim(); if (reason) review.mutate({ subjectType: item.subjectType!, subjectId: item.subjectId!, documentId: item.documentId!, status: "REJECTED", reason }); }} className="grid size-9 place-items-center rounded-md border border-danger/40 text-danger disabled:opacity-50" aria-label={`Reject ${item.title}`}><X className="size-4" /></button>
                  </span>
                ) : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-signal">Review <ChevronRight className="size-4" /></span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const style = status === "VERIFIED" ? "bg-positive/10 text-positive" : status === "REJECTED" || status === "ACTION_REQUIRED" ? "bg-danger/15 text-danger" : status === "DUE_SOON" ? "bg-signal/15 text-signal" : "bg-steel text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${style}`}>{status.replaceAll("_", " ")}</span>;
}
