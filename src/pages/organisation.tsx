import {
  Building2,
  ClipboardList,
  Copy,
  Gauge,
  KeyRound,
  PackageOpen,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
  Truck,
  UserRoundPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { useTamp } from "@/context/TampContext";
import { Link } from "@/lib/nav";
import { zar } from "@/lib/tamp-data";
import {
  addOrganisationMember,
  createOrganisation,
  listOrganisationMembers,
  listOrganisations,
  removeOrganisationMember,
  setOrganisationVerification,
  setOrganisationMemberRoles,
  switchOrganisation,
  updateOrganisation,
} from "@/fns/organisations";
import type {
  DispatchAssignment,
  Invoice,
  Load,
  Match,
  OrganisationRole,
  OrganisationSummary,
  Party,
  Trip,
  TruckPosting,
} from "@/types/domain";

const ROLE_IDS: Record<OrganisationRole, string> = {
  FREIGHT_OWNER: "ROLE-FREIGHT-OWNER",
  TRANSPORTER: "ROLE-TRANSPORTER",
  DRIVER: "ROLE-DRIVER",
  CARGO_OPERATOR: "ROLE-CARGO-OPERATOR",
  DISPATCHER: "ROLE-DISPATCHER",
};
const ROLE_LABEL: Record<OrganisationRole, string> = {
  FREIGHT_OWNER: "Cargo organisation admin",
  TRANSPORTER: "Carrier organisation admin",
  DRIVER: "Driver",
  CARGO_OPERATOR: "Cargo operator",
  DISPATCHER: "Fleet dispatcher",
};
const ROLE_HELP: Record<OrganisationRole, string> = {
  FREIGHT_OWNER: "Manages the cargo company, team, loads and commercial activity.",
  TRANSPORTER: "Manages the truck company, fleet, drivers and commercial activity.",
  DRIVER: "Views assigned vehicles and performs dispatched trips.",
  CARGO_OPERATOR: "Posts loads, reviews matches and monitors cargo movements.",
  DISPATCHER: "Manages trucks, assigns drivers and coordinates active jobs.",
};

export default function OrganisationPage() {
  const { authParty, trucks, vehicles, loads, matches, trips, invoices, dispatches } = useTamp();
  const queryClient = useQueryClient();
  const canCreate = authParty?.systemRole === "system_super_user";
  const canManageMembers =
    authParty?.permissions?.includes("organisations.members.manage") ?? false;
  const canUpdate = authParty?.permissions?.includes("organisations.update") ?? false;
  const { data: organisations = [] } = useQuery({
    queryKey: ["organisations"],
    queryFn: listOrganisations,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? authParty?.activeOrganisationId ?? organisations[0]?.id ?? null;
  const active = organisations.find((item) => item.id === activeId);
  const carrierOrganisation =
    active?.type === "CARRIER" ||
    active?.type === "DRIVER_NETWORK" ||
    active?.type === "TRANSPORTER";
  const { data: members = [] } = useQuery({
    queryKey: ["organisation-members", activeId],
    queryFn: () => listOrganisationMembers(activeId!),
    enabled: Boolean(activeId),
  });
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [credentials, setCredentials] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const memberRoles: OrganisationRole[] =
    carrierOrganisation
      ? canCreate
        ? ["TRANSPORTER", "DISPATCHER", "DRIVER"]
        : ["DISPATCHER", "DRIVER"]
      : canCreate
        ? ["FREIGHT_OWNER", "CARGO_OPERATOR"]
        : ["CARGO_OPERATOR"];
  const [role, setRole] = useState<OrganisationRole>("DRIVER");
  const selectedRole = memberRoles.includes(role) ? role : memberRoles[0]!;
  const driverCount = members.filter((member) =>
    member.roleIds.includes(ROLE_IDS.DRIVER),
  ).length;
  const operatorCount = members.filter((member) =>
    member.roleIds.includes(ROLE_IDS.CARGO_OPERATOR),
  ).length;
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"CARGO_OWNER" | "CARRIER" | "BROKER" | "DRIVER_NETWORK">(
    "CARRIER",
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["organisation-members", activeId] });
  const add = useMutation({
    mutationFn: () =>
      addOrganisationMember({
        organisationId: activeId!,
        email,
        role: selectedRole,
        ...(carrierOrganisation && selectedRole === "DRIVER"
          ? {
              contactName: memberName,
              phone: memberPhone,
              createAccount: true,
            }
          : {}),
      }),
    onSuccess: (result) => {
      if (result.temporaryPassword) {
        setCredentials({
          name: memberName,
          email,
          password: result.temporaryPassword,
        });
      } else {
        setCredentials(null);
      }
      setEmail("");
      setMemberName("");
      setMemberPhone("");
      void refresh();
      toast.success(result.created ? "Driver account created" : "Member added");
    },
    onError: (error) => toast.error("Could not add member", { description: error.message }),
  });
  const create = useMutation({
    mutationFn: () => createOrganisation({ name: newName, type: newType }),
    onSuccess: (organisation) => {
      setNewName("");
      setSelectedId(organisation.id);
      void queryClient.invalidateQueries({ queryKey: ["organisations"] });
      toast.success("Organisation created");
    },
    onError: (error) =>
      toast.error("Could not create organisation", { description: error.message }),
  });
  const verifyOrganisation = useMutation({
    mutationFn: (status: "PENDING" | "VERIFIED" | "REJECTED") =>
      setOrganisationVerification(activeId!, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organisations"] });
      toast.success("Organisation verification updated");
    },
    onError: (error) =>
      toast.error("Could not update verification", { description: error.message }),
  });

  return (
    <AppShell>
      <PageHeader title="Organisation" />
      <div className="grid gap-5 p-5 xl:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-border bg-graphite p-3">
          <div className="mb-3 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Building2 className="size-4" /> Organisations
          </div>
          <div className="space-y-1">
            {organisations.map((organisation) => (
              <button
                key={organisation.id}
                onClick={() => setSelectedId(organisation.id)}
                className={`w-full rounded-md px-3 py-2 text-left ${organisation.id === activeId ? "bg-signal/10 ring-1 ring-signal/30" : "hover:bg-steel/40"}`}
              >
                <div className="truncate text-sm font-bold">{organisation.name}</div>
                <div className="mt-0.5 text-[10px] uppercase text-muted-foreground">
                  {organisation.type.replaceAll("_", " ")}
                  {organisation.id === authParty?.activeOrganisationId ? " · Active" : ""}
                </div>
              </button>
            ))}
          </div>
          {canCreate && (
            <form
              className="mt-4 border-t border-border pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (newName.trim()) create.mutate();
              }}
            >
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New organisation name"
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
              <select
                value={newType}
                onChange={(event) => setNewType(event.target.value as typeof newType)}
                className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                <option value="CARGO_OWNER">Cargo owner</option>
                <option value="CARRIER">Carrier</option>
                <option value="BROKER">Broker</option>
                <option value="DRIVER_NETWORK">Driver network</option>
              </select>
              <button
                disabled={!newName.trim() || create.isPending}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-40"
              >
                <Plus className="size-4" /> Create
              </button>
            </form>
          )}
        </aside>
        <main className="min-w-0 space-y-5">
          {active ? (
            <>
              <section className="rounded-lg border border-border bg-graphite p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-signal" />
                      <h2 className="text-xl font-black">{active.name}</h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {active.type.replaceAll("_", " ")} · {active.verification}
                    </p>
                  </div>
                  {active.id !== authParty?.activeOrganisationId && (
                    <button
                      onClick={() =>
                        void switchOrganisation(active.id).then(() => window.location.reload())
                      }
                      className="rounded-md bg-signal px-4 py-2 text-xs font-bold text-signal-foreground"
                    >
                      Use this organisation
                    </button>
                  )}
                  {canCreate && (
                    <div className="flex flex-wrap gap-2">
                      {active.verification !== "VERIFIED" && (
                        <button
                          onClick={() => verifyOrganisation.mutate("VERIFIED")}
                          disabled={verifyOrganisation.isPending}
                          className="rounded-md bg-positive px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Verify organisation
                        </button>
                      )}
                      {active.verification !== "REJECTED" && (
                        <button
                          onClick={() => verifyOrganisation.mutate("REJECTED")}
                          disabled={verifyOrganisation.isPending}
                          className="rounded-md border border-danger/40 px-4 py-2 text-xs font-bold text-danger disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                      {active.verification !== "PENDING" && (
                        <button
                          onClick={() => verifyOrganisation.mutate("PENDING")}
                          disabled={verifyOrganisation.isPending}
                          className="rounded-md border border-border px-4 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          Return to review
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {canUpdate && (
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const input = new FormData(event.currentTarget)
                        .get("name")
                        ?.toString()
                        .trim();
                      if (input)
                        void updateOrganisation(active.id, input).then(() =>
                          queryClient.invalidateQueries({ queryKey: ["organisations"] }),
                        );
                    }}
                  >
                    <input
                      name="name"
                      defaultValue={active.name}
                      className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
                    />
                    <button className="rounded-md border border-border px-4 text-xs font-bold">
                      Save name
                    </button>
                  </form>
                )}
              </section>
              <section className="grid gap-3 sm:grid-cols-2">
                {carrierOrganisation ? (
                  <>
                    <OrganisationTool
                      icon={Truck}
                      title="Company fleet"
                      description={`${vehicles.length || trucks.length} registered ${vehicles.length === 1 || trucks.length === 1 ? "truck" : "trucks"} in the active company.`}
                      action="Add a truck"
                      to="/transporter/fleet?add=true"
                      enabled={authParty?.permissions?.includes("trucks.manage") ?? false}
                    />
                    <OrganisationTool
                      icon={UserRoundPlus}
                      title="Drivers and dispatch"
                      description={`${driverCount} ${driverCount === 1 ? "driver" : "drivers"}. Add drivers for trips or dispatchers to coordinate the fleet.`}
                      action="Manage below"
                      anchor
                      enabled={canManageMembers}
                    />
                  </>
                ) : (
                  <>
                    <OrganisationTool
                      icon={ClipboardList}
                      title="Company loads"
                      description={`${loads.length} ${loads.length === 1 ? "load" : "loads"} visible to the active cargo company.`}
                      action="Post a load"
                      to="/owner/board?post=true"
                      enabled={authParty?.permissions?.includes("loads.manage") ?? false}
                    />
                    <OrganisationTool
                      icon={UserRoundPlus}
                      title="Cargo operations team"
                      description={`${operatorCount} cargo ${operatorCount === 1 ? "operator" : "operators"}. Operators can post loads and manage matches for this company.`}
                      action="Manage below"
                      anchor
                      enabled={canManageMembers}
                    />
                  </>
                )}
              </section>
              {authParty?.role === "ADMIN" && (
                <AdminOrganisationOversight
                  organisation={active}
                  members={members}
                  loads={loads}
                  trucks={trucks}
                  matches={matches}
                  trips={trips}
                  invoices={invoices}
                  dispatches={dispatches}
                />
              )}
              <section className="rounded-lg border border-border bg-graphite">
                <div id="organisation-members" className="flex items-start gap-2 border-b border-border p-4">
                  <Users className="size-4 text-signal" />
                  <div>
                    <h3 className="font-bold">
                      {carrierOrganisation ? "Fleet team" : "Cargo operations team"}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {carrierOrganisation
                        ? "Truck company administrators can add dispatchers and drivers. Drivers only receive operational access."
                        : "Cargo company administrators can add cargo operators. Operators work only with this organisation's loads."}
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">{members.length}</span>
                </div>
                {canManageMembers && (
                  <form
                    className="border-b border-border p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        email &&
                        (!carrierOrganisation || selectedRole !== "DRIVER" || memberName.trim())
                      )
                        add.mutate();
                    }}
                  >
                    {carrierOrganisation && selectedRole === "DRIVER" && (
                      <div className="mb-2 grid gap-2 sm:grid-cols-2">
                        <input
                          value={memberName}
                          onChange={(event) => setMemberName(event.target.value)}
                          placeholder="Driver's full name"
                          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm"
                          required
                        />
                        <input
                          type="tel"
                          value={memberPhone}
                          onChange={(event) => setMemberPhone(event.target.value)}
                          placeholder="Mobile number (optional)"
                          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-[1fr_210px_auto]">
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={
                          carrierOrganisation && selectedRole === "DRIVER"
                            ? "Driver's email address"
                            : "Registered user's email address"
                        }
                        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm"
                      />
                      <select
                        value={selectedRole}
                        onChange={(event) => setRole(event.target.value as OrganisationRole)}
                        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        {memberRoles.map((value) => (
                          <option key={value} value={value}>
                            {ROLE_LABEL[value]}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={
                          add.isPending ||
                          !email ||
                          (carrierOrganisation &&
                            selectedRole === "DRIVER" &&
                            !memberName.trim())
                        }
                        className="min-h-11 rounded-md bg-signal px-4 py-2 text-xs font-bold text-signal-foreground disabled:opacity-40"
                      >
                        {carrierOrganisation && selectedRole === "DRIVER"
                          ? "Add driver"
                          : "Add member"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ROLE_HELP[selectedRole]}{" "}
                      {carrierOrganisation && selectedRole === "DRIVER"
                        ? "If the email is new, TAMP creates the driver account and gives you a temporary password to share securely."
                        : "The person must first have a registered TAMP account."}
                    </p>
                    {credentials && (
                      <div className="mt-4 rounded-xl border border-signal/40 bg-signal/10 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-signal text-signal-foreground">
                            <KeyRound className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black">Save these driver credentials now</h4>
                            <p className="mt-1 text-xs text-muted-foreground">
                              This temporary password is displayed only once. Send it directly to {credentials.name}.
                            </p>
                            <dl className="mt-3 grid gap-2 rounded-lg border border-border bg-graphite p-3 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="text-[10px] font-bold uppercase text-muted-foreground">Email</dt>
                                <dd className="mt-1 break-all font-mono font-bold">{credentials.email}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold uppercase text-muted-foreground">Temporary password</dt>
                                <dd className="mt-1 break-all font-mono font-bold">{credentials.password}</dd>
                              </div>
                            </dl>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(
                                    `TAMP driver login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`,
                                  );
                                  toast.success("Credentials copied");
                                }}
                                className="inline-flex min-h-9 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-bold text-background"
                              >
                                <Copy className="size-3.5" /> Copy credentials
                              </button>
                              <button
                                type="button"
                                onClick={() => setCredentials(null)}
                                className="min-h-9 rounded-md border border-border px-3 text-xs font-bold"
                              >
                                I saved them
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </form>
                )}
                <div className="divide-y divide-border">
                  {members.map((member) => {
                    const currentRole = (Object.entries(ROLE_IDS).find(([, id]) =>
                      member.roleIds.includes(id),
                    )?.[0] ?? "DRIVER") as OrganisationRole;
                    const editable = memberRoles.includes(currentRole);
                    return (
                      <div key={member.id} className="flex flex-wrap items-center gap-3 p-4">
                        <div className="grid size-9 place-items-center rounded-full bg-steel text-xs font-black">
                          {member.contactName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{member.contactName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </div>
                        </div>
                        {canManageMembers && editable ? (
                          <select
                            value={currentRole}
                            onChange={(event) =>
                              void setOrganisationMemberRoles(active.id, member.id, [
                                event.target.value as OrganisationRole,
                              ]).then(refresh)
                            }
                            className="rounded-md border border-border px-2 py-1.5 text-xs"
                          >
                            {memberRoles.map((value) => (
                              <option key={value} value={value}>
                                {ROLE_LABEL[value]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheck className="size-3.5" />
                            {ROLE_LABEL[currentRole]}
                          </span>
                        )}
                        {canManageMembers && member.id !== authParty?.id && editable && (
                          <button
                            aria-label={`Remove ${member.contactName}`}
                            onClick={() =>
                              void removeOrganisationMember(active.id, member.id)
                                .then(refresh)
                                .catch((error: Error) =>
                                  toast.error("Could not remove member", {
                                    description: error.message,
                                  }),
                                )
                            }
                            className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger/10"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No organisation selected.
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}

type OversightTab = "overview" | "loads" | "trucks" | "engagements" | "finance";

function AdminOrganisationOversight({
  organisation,
  members,
  loads,
  trucks,
  matches,
  trips,
  invoices,
  dispatches,
}: {
  organisation: OrganisationSummary;
  members: (Party & { membershipId: string; isPrimary: boolean; roleIds: string[] })[];
  loads: Load[];
  trucks: TruckPosting[];
  matches: Match[];
  trips: Trip[];
  invoices: Invoice[];
  dispatches: DispatchAssignment[];
}) {
  const [tab, setTab] = useState<OversightTab>("overview");
  const memberIds = new Set(members.map((member) => member.id));
  const orgLoads = loads.filter((load) => memberIds.has(load.ownerId));
  const orgTrucks = trucks.filter(
    (truck) => memberIds.has(truck.transporterId) || Boolean(truck.driverId && memberIds.has(truck.driverId)),
  );
  const loadIds = new Set(orgLoads.map((load) => load.id));
  const truckIds = new Set(orgTrucks.map((truck) => truck.id));
  const orgMatches = matches.filter(
    (match) => loadIds.has(match.loadId) || truckIds.has(match.truckPostingId),
  );
  const matchIds = new Set(orgMatches.map((match) => match.id));
  const orgTrips = trips.filter((trip) => matchIds.has(trip.matchId));
  const tripIds = new Set(orgTrips.map((trip) => trip.id));
  const orgInvoices = invoices.filter(
    (invoice) =>
      memberIds.has(invoice.ownerId) ||
      memberIds.has(invoice.carrierId) ||
      matchIds.has(invoice.matchId),
  );
  const orgDispatches = dispatches.filter((assignment) => tripIds.has(assignment.tripId));
  const activeTrips = orgTrips.filter(
    (trip) => !["COMPLETED", "CANCELLED"].includes(trip.status),
  );
  const totalBilled = orgInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const tabs: { id: OversightTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "loads", label: "Loads", count: orgLoads.length },
    { id: "trucks", label: "Trucks", count: orgTrucks.length },
    { id: "engagements", label: "Engagements", count: orgMatches.length },
    { id: "finance", label: "Finance", count: orgInvoices.length },
  ];

  return (
    <section className="app-surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-signal" />
            <h3 className="font-black">Platform oversight</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tenant-scoped operational and financial activity for {organisation.name}.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-[10px] font-bold uppercase text-muted-foreground">
          {organisation.verification}
        </span>
      </div>

      <div className="overflow-x-auto border-b border-border px-3 pt-2">
        <div className="flex min-w-max gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-t-lg px-3 py-2.5 text-xs font-bold ${tab === item.id ? "bg-steel text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}{item.count !== undefined ? ` (${item.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <OversightMetric icon={Users} label="Members" value={members.length} />
            <OversightMetric icon={PackageOpen} label="Loads" value={orgLoads.length} />
            <OversightMetric icon={Truck} label="Trucks" value={orgTrucks.length} />
            <OversightMetric icon={Route} label="Active trips" value={activeTrips.length} />
            <OversightMetric icon={WalletCards} label="Total billed" value={zar(totalBilled)} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <OverviewList title="Load status" rows={countBy(orgLoads, (item) => item.status)} />
            <OverviewList title="Truck status" rows={countBy(orgTrucks, (item) => item.status)} />
            <OverviewList title="Trip status" rows={countBy(orgTrips, (item) => item.status)} />
          </div>
        </div>
      )}

      {tab === "loads" && (
        <OversightTable
          empty="This organisation has no loads."
          heads={["Load", "Route", "Cargo", "Weight", "Status"]}
          rows={orgLoads.map((load) => [
            load.id,
            `${load.origin.label} → ${load.destination.label}`,
            load.cargoType.replaceAll("_", " "),
            `${(load.weightKg / 1000).toFixed(1)} t`,
            load.status,
          ])}
        />
      )}
      {tab === "trucks" && (
        <OversightTable
          empty="This organisation has no trucks."
          heads={["Truck", "Body", "Capacity", "Driver", "Status"]}
          rows={orgTrucks.map((truck) => [
            truck.registration,
            truck.bodyType.replaceAll("_", " "),
            `${(truck.payloadCapacityKg / 1000).toFixed(1)} t`,
            members.find((member) => member.id === truck.driverId)?.contactName ?? "Unassigned",
            truck.status,
          ])}
        />
      )}
      {tab === "engagements" && (
        <OversightTable
          empty="This organisation has no match or trip engagements."
          heads={["Match", "Load", "Truck", "Score", "Match status", "Trip status"]}
          rows={orgMatches.map((match) => {
            const trip = orgTrips.find((item) => item.matchId === match.id);
            return [
              match.id,
              match.loadId,
              orgTrucks.find((truck) => truck.id === match.truckPostingId)?.registration ?? match.truckPostingId,
              `${match.score.toFixed(1)} / 100`,
              match.status,
              trip?.status ?? "Not started",
            ];
          })}
        />
      )}
      {tab === "finance" && (
        <OversightTable
          empty="No invoices have been generated for this organisation."
          heads={["Invoice", "Load", "Total", "Payment", "Payout", "Due"]}
          rows={orgInvoices.map((invoice) => [
            invoice.invoiceNumber,
            invoice.loadId,
            zar(invoice.total),
            invoice.status,
            invoice.payoutStatus,
            new Date(invoice.dueAt).toLocaleDateString("en-ZA"),
          ])}
        />
      )}

      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        {orgDispatches.length} dispatch assignment{orgDispatches.length === 1 ? "" : "s"} recorded for this organisation.
      </div>
    </section>
  );
}

function OversightMetric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-background p-3 shadow-sm"><div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground"><span>{label}</span><Icon className="size-4" /></div><div className="mt-2 text-xl font-black">{value}</div></div>;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function OverviewList({ title, rows }: { title: string; rows: [string, number][] }) {
  return <div className="rounded-xl border border-border bg-background p-4"><h4 className="text-xs font-black uppercase tracking-wide">{title}</h4><div className="mt-3 space-y-2">{rows.length ? rows.map(([label, count]) => <div key={label} className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label.replaceAll("_", " ")}</span><strong>{count}</strong></div>) : <span className="text-xs text-muted-foreground">No activity</span>}</div></div>;
}

function OversightTable({ heads, rows, empty }: { heads: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-steel/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{heads.map((head) => <th key={head} className="whitespace-nowrap px-4 py-3">{head}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="hover:bg-steel/20">{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 ${cellIndex === 0 ? "font-mono font-bold" : "max-w-sm"}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function OrganisationTool({
  icon: Icon,
  title,
  description,
  action,
  to,
  anchor = false,
  enabled,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: string;
  to?: string;
  anchor?: boolean;
  enabled: boolean;
}) {
  const actionClass =
    "mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-signal px-4 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105";
  return (
    <article className="rounded-lg border border-border bg-graphite p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-signal/10 text-signal">
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {enabled && to && (
        <Link to={to} className={actionClass}>
          {action}
        </Link>
      )}
      {enabled && anchor && (
        <a href="#organisation-members" className={actionClass}>
          {action}
        </a>
      )}
      {!enabled && (
        <p className="mt-4 text-[11px] font-semibold text-muted-foreground">
          Your organisation role has view-only access.
        </p>
      )}
    </article>
  );
}
