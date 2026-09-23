"use client";

import { Link } from "@/lib/nav";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { useTamp } from "@/lib/tamp-store";

function AdminTrucks() {
  const { trucks, parties } = useTamp();
  const [query, setQuery] = useState("");

  // Decorate each truck with its owner + driver names once, then filter.
  const rows = useMemo(
    () =>
      trucks.map((t) => {
        const owner = parties.find((p) => p.id === t.transporterId);
        const driver = t.driverId ? parties.find((p) => p.id === t.driverId) : undefined;
        return { truck: t, owner, driver };
      }),
    [trucks, parties],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ truck: t, owner, driver }) =>
      [
        t.id,
        t.registration,
        BODY_TYPE_LABEL[t.bodyType],
        t.currentLocation.label,
        t.currentLocation.province,
        t.status,
        owner?.companyName,
        owner?.contactName,
        driver?.contactName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  return (
    <AppShell>
      <PageHeader title="All Trucks" />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by registration, body type, owner, driver, location or status…"
            className="w-full rounded-lg border border-border bg-graphite py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {query ? `${filtered.length} of ${trucks.length}` : trucks.length} trucks
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3">Truck</th>
                <th className="px-3 py-3">Body</th>
                <th className="px-3 py-3 text-right">Capacity</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Driver</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(({ truck: t, owner, driver }) => (
                <tr key={t.id} className="hover:bg-steel/20">
                  <td className="px-4 py-3">
                    <Link
                      to="/trucks/$truckId"
                      params={{ truckId: t.id }}
                      className="flex items-center gap-2.5 font-mono font-semibold hover:text-signal"
                    >
                      <BodyTypeIcon type={t.bodyType} className="size-5 text-muted-foreground" />
                      {t.registration}
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

export default AdminTrucks;
