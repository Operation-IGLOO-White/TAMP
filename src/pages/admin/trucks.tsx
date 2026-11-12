
import { Link } from "@/lib/nav";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL } from "@/components/tamp/BodyTypeIcon";
import { useTamp } from "@/context/TampContext";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import type { BodyType, TruckPosting } from "@/types/domain";

type TruckSortKey = "registration" | "bodyType" | "capacity" | "owner" | "driver" | "location" | "status" | "compliance";
type SortDirection = "asc" | "desc";

function AdminTrucks() {
  const { trucks, vehicles, maintenance, parties } = useTamp();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("ALL");
  const [bodyType, setBodyType] = useState<BodyType | "ALL">("ALL");
  const [status, setStatus] = useState<TruckPosting["status"] | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<TruckSortKey>("registration");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Decorate each truck with its owner + driver names once, then filter.
  const rows = useMemo(
    () =>
      trucks.map((t) => {
        const owner = parties.find((p) => p.id === t.transporterId);
        const driver = t.driverId ? parties.find((p) => p.id === t.driverId) : undefined;
        const vehicle = vehicles.find((vehicle) => vehicle.id === t.vehicleId);
        const compliance = assessFleetCompliance(
          t,
          vehicle,
          maintenance,
        );
        return { truck: t, owner, driver, vehicle, compliance };
      }),
    [trucks, vehicles, maintenance, parties],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(({ truck: t, owner, driver, compliance }) => {
        if (company !== "ALL" && owner?.companyName !== company) return false;
        if (bodyType !== "ALL" && t.bodyType !== bodyType) return false;
        if (status !== "ALL" && t.status !== status) return false;
        if (!q) return true;
        return [
          t.id,
          t.registration,
          BODY_TYPE_LABEL[t.bodyType],
          t.currentLocation.label,
          t.currentLocation.province,
          t.status,
          owner?.companyName,
          owner?.contactName,
          driver?.contactName,
          compliance.level,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const values: Record<TruckSortKey, [string | number, string | number]> = {
          registration: [a.truck.registration, b.truck.registration],
          bodyType: [BODY_TYPE_LABEL[a.truck.bodyType], BODY_TYPE_LABEL[b.truck.bodyType]],
          capacity: [a.truck.payloadCapacityKg, b.truck.payloadCapacityKg],
          owner: [a.owner?.companyName ?? "", b.owner?.companyName ?? ""],
          driver: [a.driver?.contactName ?? "", b.driver?.contactName ?? ""],
          location: [a.truck.currentLocation.label, b.truck.currentLocation.label],
          status: [a.truck.status, b.truck.status],
          compliance: [a.compliance.score, b.compliance.score],
        };
        const [left, right] = values[sortKey];
        const result = typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
        return sortDirection === "asc" ? result : -result;
      });
  }, [rows, query, company, bodyType, status, sortKey, sortDirection]);

  const companies = useMemo(
    () => [...new Set(rows.map(({ owner }) => owner?.companyName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const statuses = useMemo(
    () => [...new Set(trucks.map((truck) => truck.status))].sort(),
    [trucks],
  );
  const hasFilters = company !== "ALL" || bodyType !== "ALL" || status !== "ALL" || query !== "";
  const clearFilters = () => {
    setCompany("ALL");
    setBodyType("ALL");
    setStatus("ALL");
    setQuery("");
  };
  const changeSort = (key: TruckSortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <AppShell>
      <PageHeader title="All Trucks" />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="app-surface flex flex-wrap gap-3 p-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search registration, owner, driver or location"
              className="h-10 w-full rounded-lg border border-border bg-graphite pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
            />
            {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search"><X className="size-4" /></button>}
          </div>
          <FilterSelect value={company} onChange={setCompany} label="Company" icon={Building2} options={companies.map((value) => ({ value, label: value }))} />
          <FilterSelect value={bodyType} onChange={(value) => setBodyType(value as BodyType | "ALL")} label="Body type" icon={SlidersHorizontal} options={(Object.entries(BODY_TYPE_LABEL) as [BodyType, string][]).map(([value, label]) => ({ value, label }))} />
          <FilterSelect value={status} onChange={(value) => setStatus(value as TruckPosting["status"] | "ALL")} label="Status" icon={SlidersHorizontal} options={statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
          {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"><X className="size-3.5" /> Clear</button>}
        </div>

        <p className="text-xs text-muted-foreground">
          {query ? `${filtered.length} of ${trucks.length}` : trucks.length} trucks
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <SortableHeader label="Truck" sortKey="registration" current={sortKey} direction={sortDirection} onSort={changeSort} className="px-4" />
                <SortableHeader label="Body" sortKey="bodyType" current={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Capacity" sortKey="capacity" current={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
                <SortableHeader label="Company" sortKey="owner" current={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Driver" sortKey="driver" current={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Location" sortKey="location" current={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Status" sortKey="status" current={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Compliance" sortKey="compliance" current={sortKey} direction={sortDirection} onSort={changeSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(({ truck: t, owner, driver, compliance }) => (
                <tr key={t.id} className="hover:bg-steel/20">
                  <td className="px-4 py-3">
                    <Link
                      to="/trucks/$truckId"
                      params={{ truckId: t.id }}
                      className="group flex items-center gap-3 font-mono font-semibold hover:text-signal"
                    >
                      <span className="flex h-11 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white/90 p-0.5 transition-colors group-hover:border-signal/50">
                        <img src={fleetVehicleAsset(t)} alt={`${BODY_TYPE_LABEL[t.bodyType]} body type`} className="h-full w-full object-contain" />
                      </span>
                      <span>{t.registration}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{BODY_TYPE_LABEL[t.bodyType]}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {(t.payloadCapacityKg / 1000).toFixed(0)} t
                  </td>
                  <td className="px-3 py-3">{owner?.companyName ?? "—"}</td>
                  <td className="px-3 py-3">{driver?.contactName ?? "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {t.currentLocation.label}, {t.currentLocation.province}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        t.status === "AVAILABLE"
                          ? "bg-positive/15 text-positive"
                          : "bg-steel text-foreground"
                      }`}
                    >
                      {t.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className={`text-[10px] font-bold uppercase ${compliance.level === "COMPLIANT" ? "text-positive" : compliance.level === "DUE_SOON" ? "text-signal" : "text-danger"}`}>
                      {compliance.level.replaceAll("_", " ")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{compliance.score}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {trucks.length === 0 ? "No trucks on the platform yet." : `No trucks match “${query}”.`}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FilterSelect({ value, onChange, label, options, icon: Icon }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
  icon: typeof Building2;
}) {
  return (
    <label className="relative min-w-44">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter by ${label}`} className="h-10 w-full appearance-none rounded-md border border-border bg-graphite pl-9 pr-7 text-xs font-medium outline-none focus:border-signal">
        <option value="ALL">All {label.toLowerCase()}s</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SortableHeader({ label, sortKey, current, direction, onSort, align = "left", className = "px-3" }: {
  label: string;
  sortKey: TruckSortKey;
  current: TruckSortKey;
  direction: SortDirection;
  onSort: (key: TruckSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = current !== sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`${className} py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1.5 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""}`} aria-label={`Sort by ${label}`}>
        {label}<Icon className={`size-3 ${current === sortKey ? "text-signal" : "opacity-50"}`} />
      </button>
    </th>
  );
}

export default AdminTrucks;
