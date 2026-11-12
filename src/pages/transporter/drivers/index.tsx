import { BriefcaseBusiness, CarFront, CheckCircle2, Search, ShieldAlert, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { useTamp } from "@/context/TampContext";
import { listOrganisationMembers } from "@/fns/organisations";
import { Link } from "@/lib/nav";
import { DRIVER_ROLE_ID, driverAvailability, driverTrips, statusStyle } from "./driver-data";

export default function DriversDirectoryPage() {
  const { authParty, trucks, trips } = useTamp();
  const organisationId = authParty?.activeOrganisationId ?? null;
  const [query, setQuery] = useState("");
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["organisation-members", organisationId],
    queryFn: () => listOrganisationMembers(organisationId!),
    enabled: Boolean(organisationId),
  });
  const drivers = useMemo(
    () => members.filter((member) => member.roleIds.includes(DRIVER_ROLE_ID)),
    [members],
  );
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return drivers;
    return drivers.filter((driver) => {
      const truck = trucks.find((item) => item.driverId === driver.id);
      return [driver.contactName, driver.email, driver.phone, driver.province, truck?.registration]
        .filter(Boolean).join(" ").toLowerCase().includes(value);
    });
  }, [drivers, query, trucks]);
  const assigned = drivers.filter((driver) => trucks.some((truck) => truck.driverId === driver.id)).length;
  const active = drivers.filter((driver) => driverAvailability(driver, trucks.find((truck) => truck.driverId === driver.id)) === "ON_TRIP").length;
  const attention = drivers.filter((driver) => driver.verification !== "VERIFIED" || driver.suspended).length;

  return <AppShell>
    <PageHeader title="Drivers Directory" actions={
      <Link to="/organisation" className="inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-xs font-black uppercase tracking-wide text-signal-foreground">
        <UserPlus className="size-4" /> Add driver
      </Link>
    } />
    <main className="space-y-5 p-4 sm:p-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Users} label="Total drivers" value={drivers.length} />
        <Metric icon={CarFront} label="Assigned vehicles" value={assigned} />
        <Metric icon={BriefcaseBusiness} label="Currently working" value={active} />
        <Metric icon={ShieldAlert} label="Needs attention" value={attention} />
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Your driver team</h2><p className="text-xs text-muted-foreground">Profiles, assignments, activity and compliance files in one place.</p></div>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, vehicle or province…" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-signal" />
          </label>
        </div>
        {isLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Loading drivers…</div> : filtered.length === 0 ?
          <div className="p-10 text-center"><Users className="mx-auto mb-3 size-9 text-muted-foreground" /><p className="font-semibold">No drivers found</p><p className="mt-1 text-sm text-muted-foreground">Add a driver to start assigning vehicles and work.</p></div> :
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((driver, index) => {
              const truck = trucks.find((item) => item.driverId === driver.id);
              const state = driverAvailability(driver, truck);
              const history = driverTrips(driver.id, trips);
              const completed = history.filter((trip) => ["DELIVERED", "COMPLETED"].includes(trip.status)).length;
              return <Link key={driver.id} to="/transporter/drivers/$driverId" params={{ driverId: driver.id }} className="group animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-background p-4 transition duration-300 hover:-translate-y-0.5 hover:border-signal/50 hover:shadow-lg" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="flex items-start gap-3"><Avatar party={driver} size="md" /><div className="min-w-0 flex-1"><div className="truncate font-bold">{driver.contactName}</div><div className="truncate text-xs text-muted-foreground">{driver.email}</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${statusStyle[state]}`}>{state.replaceAll("_", " ")}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-steel/25 p-3 text-center"><Mini label="Vehicle" value={truck?.registration ?? "Unassigned"} /><Mini label="Trips" value={history.length} /><Mini label="Completed" value={completed} /></div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{driver.province || "Province not set"}</span><span className="inline-flex items-center gap-1 font-bold text-foreground">Open profile <CheckCircle2 className="size-3.5 text-signal" /></span></div>
              </Link>;
            })}
          </div>}
      </section>
    </main>
  </AppShell>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <article className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><Icon className="size-4 text-signal" /></div><div className="mt-2 font-mono text-2xl font-black">{value}</div></article>;
}
function Mini({ label, value }: { label: string; value: string | number }) { return <div className="min-w-0"><div className="truncate text-xs font-bold">{value}</div><div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div></div>; }

