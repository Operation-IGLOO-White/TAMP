import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  Play,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Panel } from "@/components/tamp/StatCard";
import { TripRouteMap } from "@/components/tamp/TripRouteMap";
import { useTamp } from "@/context/TampContext";
import type { IncidentAction } from "@/fns/operations";
import type { TripIncident } from "@/types/domain";

const TONES: Record<TripIncident["status"], string> = {
  OPEN: "bg-danger/10 text-danger",
  ACKNOWLEDGED: "bg-warning/15 text-warning",
  RESOLVING: "bg-sky-500/10 text-sky-600",
  RESOLVED: "bg-positive/10 text-positive",
};

function OversightPage() {
  const {
    loads,
    matches,
    trips,
    trucks,
    parties,
    incidents,
    disputes,
    audit,
    updateIncident,
    resolveDispute,
  } = useTamp();
  const [status, setStatus] = useState("ACTIVE");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [etaMinutes, setEtaMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      incidents
        .map((incident) => {
          const trip = trips.find((item) => item.id === incident.tripId);
          const match = matches.find((item) => item.id === trip?.matchId);
          const load = loads.find((item) => item.id === incident.loadId);
          const truck = trucks.find((item) => item.id === incident.truckId);
          const reporter = parties.find((item) => item.id === incident.reportedById);
          return { incident, trip, match, load, truck, reporter };
        })
        .filter((row) => row.trip && row.load && row.truck),
    [incidents, loads, matches, parties, trips, trucks],
  );

  const filtered = rows.filter((row) => {
    if (status === "ACTIVE" && row.incident.status === "RESOLVED") return false;
    if (status !== "ACTIVE" && status !== "ALL" && row.incident.status !== status) return false;
    const value = query.toLowerCase();
    return (
      !value ||
      [
        row.incident.id,
        row.incident.kind,
        row.load?.id,
        row.load?.origin.label,
        row.load?.destination.label,
        row.truck?.registration,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  });
  const selected = rows.find((row) => row.incident.id === selectedId) ?? filtered[0];
  const openDisputes = disputes.filter(
    (item) => item.status === "OPEN" || item.status === "UNDER_REVIEW",
  );

  const act = async (
    action: IncidentAction,
    options: { assigneeId?: string; note?: string; etaMinutes?: number } = {},
  ) => {
    if (!selected) return;
    setBusy(true);
    const ok = await updateIncident(selected.incident.id, action, options);
    if (ok) setNote("");
    setBusy(false);
  };

  return (
    <AppShell>
      <PageHeader title="Operations Control" />
      <div className="space-y-6 bg-background p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active incidents"
            value={rows.filter((row) => row.incident.status !== "RESOLVED").length}
            icon={AlertTriangle}
            tone="text-danger"
          />
          <Metric
            label="Unacknowledged"
            value={rows.filter((row) => row.incident.status === "OPEN").length}
            icon={Clock3}
            tone="text-warning"
          />
          <Metric
            label="Being resolved"
            value={rows.filter((row) => row.incident.status === "RESOLVING").length}
            icon={RefreshCw}
            tone="text-sky-600"
          />
          <Metric
            label="Resolved"
            value={rows.filter((row) => row.incident.status === "RESOLVED").length}
            icon={CheckCircle2}
            tone="text-positive"
          />
        </div>

        <div className="grid min-h-[650px] overflow-hidden rounded-xl border border-border bg-graphite xl:grid-cols-[420px_1fr]">
          <section className="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
            <div className="space-y-3 border-b border-border p-4">
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search trip, route or vehicle…"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {["ACTIVE", "OPEN", "ACKNOWLEDGED", "RESOLVING", "RESOLVED", "ALL"].map((value) => (
                  <button
                    key={value}
                    onClick={() => setStatus(value)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === value ? "bg-foreground text-background" : "bg-steel/40 text-muted-foreground"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
              {filtered.map((row) => (
                <button
                  key={row.incident.id}
                  onClick={() => setSelectedId(row.incident.id)}
                  className={`w-full p-4 text-left hover:bg-steel/20 ${selected?.incident.id === row.incident.id ? "bg-signal/5 border-l-4 border-signal" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{row.load?.id}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[9px] font-bold ${TONES[row.incident.status]}`}
                    >
                      {row.incident.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {row.incident.kind.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {row.load?.origin.label} → {row.load?.destination.label}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    <span>{row.truck?.registration}</span>
                    <span>{new Date(row.incident.reportedAt).toLocaleString("en-ZA")}</span>
                  </div>
                </button>
              ))}
              {!filtered.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No incidents match these filters.
                </p>
              )}
            </div>
          </section>

          <section className="min-w-0 overflow-y-auto">
            {selected?.trip && selected.load && selected.truck ? (
              <>
                <div className="border-b border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-danger">
                        {selected.incident.kind.replaceAll("_", " ")}
                      </div>
                      <h2 className="mt-1 text-xl font-black">
                        {selected.load.origin.label} → {selected.load.destination.label}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.incident.description}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${TONES[selected.incident.status]}`}
                    >
                      {selected.incident.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                    <Detail label="Vehicle" value={selected.truck.registration} />
                    <Detail
                      label="Reporter"
                      value={selected.reporter?.contactName ?? selected.incident.reportedByRole}
                    />
                    <Detail
                      label="Assigned to"
                      value={
                        parties.find((item) => item.id === selected.incident.assignedToId)
                          ?.contactName ?? "Unassigned"
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_1fr]">
                  <div className="overflow-hidden rounded-xl border border-border">
                    <TripRouteMap load={selected.load} trip={selected.trip} className="h-[350px]" />
                    <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      Latest vehicle position and planned route
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Panel title="Resolution workflow">
                      <div className="grid grid-cols-2 gap-2 p-3">
                        {selected.incident.status === "OPEN" && (
                          <Action
                            label="Acknowledge"
                            icon={UserCheck}
                            disabled={busy}
                            onClick={() => void act("ACKNOWLEDGE")}
                          />
                        )}
                        {selected.incident.status !== "RESOLVED" && (
                          <Action
                            label="Assign to me"
                            icon={UserCheck}
                            disabled={busy}
                            onClick={() => void act("ASSIGN")}
                          />
                        )}
                        {["OPEN", "ACKNOWLEDGED"].includes(selected.incident.status) && (
                          <Action
                            label="Begin resolution"
                            icon={RefreshCw}
                            disabled={busy}
                            onClick={() => void act("BEGIN_RESOLUTION")}
                          />
                        )}
                        {selected.incident.status !== "RESOLVED" && (
                          <div className="col-span-2 space-y-2">
                            <textarea
                              value={note}
                              onChange={(event) => setNote(event.target.value)}
                              placeholder="Resolution notes…"
                              rows={3}
                              className="w-full rounded-md border border-border p-2 text-sm"
                            />
                            <button
                              disabled={busy || note.trim().length < 5}
                              onClick={() => void act("RESOLVE", { note })}
                              className="w-full rounded-md bg-positive px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                            >
                              Resolve incident
                            </button>
                          </div>
                        )}
                        {selected.incident.status === "RESOLVED" &&
                          selected.trip.status !== "CANCELLED" && (
                            <Action
                              label="Resume trip"
                              icon={Play}
                              disabled={busy}
                              onClick={() => void act("RESUME_TRIP")}
                            />
                          )}
                        {selected.incident.status === "RESOLVED" &&
                          selected.trip.status === "CANCELLED" && (
                            <Action
                              label="Reopen load"
                              icon={Play}
                              disabled={busy}
                              onClick={() => void act("REOPEN_LOAD")}
                            />
                          )}
                      </div>
                    </Panel>
                    {selected.incident.status !== "RESOLVED" && (
                      <Panel title="ETA recovery">
                        <div className="flex gap-2 p-3">
                          <input
                            type="number"
                            min={5}
                            max={1440}
                            value={etaMinutes}
                            onChange={(event) => setEtaMinutes(Number(event.target.value))}
                            className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm"
                          />
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act("UPDATE_ETA", {
                                etaMinutes,
                                note: `ETA updated to ${etaMinutes} minutes from now`,
                              })
                            }
                            className="rounded-md bg-signal px-3 text-xs font-bold text-signal-foreground"
                          >
                            Update ETA
                          </button>
                        </div>
                      </Panel>
                    )}
                    {selected.incident.resolutionNote && (
                      <Panel title="Resolution">
                        <p className="p-3 text-sm">{selected.incident.resolutionNote}</p>
                      </Panel>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="grid min-h-[600px] place-items-center text-sm text-muted-foreground">
                Select an incident to manage it.
              </div>
            )}
          </section>
        </div>

        <Panel title={`Commercial disputes (${openDisputes.length})`}>
          <div className="divide-y divide-border">
            {openDisputes.map((dispute) => (
              <div key={dispute.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <strong className="text-sm">{dispute.category.replaceAll("_", " ")}</strong>
                  <p className="text-xs text-muted-foreground">{dispute.description}</p>
                </div>
                <button
                  onClick={() => {
                    const trip = trips.find((item) => item.id === dispute.tripId);
                    const match = matches.find((item) => item.id === trip?.matchId);
                    if (match) resolveDispute(match.loadId);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-bold"
                >
                  Resolve dispute
                </button>
              </div>
            ))}
            {!openDisputes.length && (
              <p className="p-4 text-xs text-muted-foreground">No open commercial disputes.</p>
            )}
          </div>
        </Panel>
        <Panel title="Recent operations audit">
          <div className="divide-y divide-border">
            {audit
              .filter(
                (event) =>
                  event.eventType.startsWith("INCIDENT_") || event.eventType === "TRIP_CANCELLED",
              )
              .slice(0, 12)
              .map((event) => (
                <div key={event.id} className="flex flex-wrap justify-between gap-2 p-3 text-xs">
                  <span>
                    <strong>{event.eventType.replaceAll("_", " ")}</strong> · {event.summary}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {new Date(event.at).toLocaleString("en-ZA")}
                  </span>
                </div>
              ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-steel/25 p-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function Action({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof AlertTriangle;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-steel/30 disabled:opacity-40"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

export default OversightPage;
