"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  fetchMe,
  login as authLogin,
  logout as authLogout,
  updateProfile as updateProfileCmd,
} from "@/fns/auth";
import {
  acceptMatchCmd,
  acceptRequestCmd,
  advanceTripCmd,
  confirmMatchCmd,
  type PodInput,
} from "@/fns/commands";
import { applyDelta, loadState, type SnapshotDelta } from "@/fns/snapshot";
import { bodyTypesForCargo, scoreLoadAgainstTrucks } from "./tamp-matching";
import { priceLoadMoney } from "./tamp-pricing";
import { activeMatchForLoad, tripForMatch } from "./tamp-selectors";
import type {
  Acceptance,
  AuditEvent,
  BodyType,
  CargoType,
  Dispute,
  DisputeCategory,
  FuelLog,
  Load,
  MaintenanceKind,
  MaintenanceTask,
  Match,
  Party,
  Proof,
  Rating,
  Reservation,
  Role,
  Trip,
  TripStatus,
  TruckPosting,
  VerificationStatus,
} from "./tamp-types";

const STORAGE_KEY = "tamp-state-v4";

// Auto-sign-out after this much inactivity (mouse/keys/scroll/touch reset it).
const IDLE_TIMEOUT_MS = 30 * 60_000; // 30 minutes

interface State {
  role: Role;
  parties: Party[];
  loads: Load[];
  trucks: TruckPosting[];
  matches: Match[];
  trips: Trip[];
  ratings: Rating[];
  disputes: Dispute[];
  acceptances: Acceptance[];
  reservations: Reservation[];
  audit: AuditEvent[];
  fuelLogs: FuelLog[];
  maintenance: MaintenanceTask[];
  proofs: Proof[];
  sidebarCollapsed: boolean;
  notificationsReadAt: Record<Role, string>;
}

// EVT-## catalogue — spec §10.4.
const EVT = {
  LOAD_POSTED: "EVT-10",
  USER_REGISTERED: "EVT-11",
  TRUCK_POSTED: "EVT-30",
  TRUCK_UPDATED: "EVT-33",
  DRIVER_ASSIGNED: "EVT-31",
  BACKHAUL_RESERVED: "EVT-25",
  BACKHAUL_RELEASED: "EVT-26",
  MATCH_OFFERED: "EVT-20",
  MATCH_ACCEPTED: "EVT-21",
  MATCH_REJECTED: "EVT-22",
  ENGAGEMENT_CONFIRMED: "EVT-23",
  JOB_REQUESTED: "EVT-27",
  TRIP_STATUS_CHANGED: "EVT-32",
  DISPUTE_RAISED: "EVT-40",
  DISPUTE_RESOLVED: "EVT-41",
  RATING_SUBMITTED: "EVT-50",
  VERIFICATION_CHANGED: "EVT-60",
  PROOF_CAPTURED: "EVT-70",
  MAINTENANCE_LOGGED: "EVT-71",
  MAINTENANCE_DONE: "EVT-72",
  FUEL_LOGGED: "EVT-73",
} as const;

const ACTOR_BY_ROLE: Record<Role, string> = {
  FREIGHT_OWNER: "P-OWNER-1",
  TRANSPORTER: "P-TRANS-1",
  DRIVER: "P-DRIVER-1",
  ADMIN: "P-ADMIN-1",
};


interface NewLoadInput {
  ownerId: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number | undefined;
  origin: Load["origin"];
  destination: Load["destination"];
  distanceKm: number;
  pickupWindow: Load["pickupWindow"];
  deliveryBy: string;
  specialRequirements?: string | undefined;
}

interface NewPartyInput {
  role: Role;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  province: string;
  kycDocumentName?: string | undefined;
}

interface NewTruckInput {
  transporterId: string;
  driverId?: string | undefined;
  registration: string;
  bodyType: BodyType;
  payloadCapacityKg: number;
  currentLocation: TruckPosting["currentLocation"];
  availableFrom: string;
  availableTo: string;
  preferredLanes?: { origin: string; destination: string }[] | undefined;
  photos?: string[];
  documents?: string[];
}

interface Store extends State {
  me: Party;
  authParty: Party | null; // the logged-in account (null until login)
  authReady: boolean; // false until the session check resolves
  login: (email: string, password: string) => Promise<Party>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<Party | null>;
  setRole: (r: Role) => void;
  updateProfile: (patch: Partial<Party>) => Promise<void>;
  setVerification: (partyId: string, status: VerificationStatus) => void;
  toggleSidebar: () => void;
  markNotificationsRead: () => void;
  registerParty: (p: NewPartyInput) => string;
  addLoad: (l: NewLoadInput) => void;
  repostLoad: (loadId: string) => void;
  addTruck: (t: NewTruckInput) => void;
  updateTruck: (
    truckId: string,
    patch: Partial<
      Pick<
        TruckPosting,
        | "status"
        | "currentLocation"
        | "availableFrom"
        | "availableTo"
        | "payloadCapacityKg"
        | "preferredLanes"
        | "licenceExpiry"
      >
    >,
  ) => void;
  assignDriver: (truckId: string, driverId: string) => void;
  linkDriver: (truckId: string, driver: Party) => void;
  requestJob: (load: Load, truckId: string, score: number) => void;
  acceptRequest: (loadId: string, truckId: string) => Promise<void>;
  withdrawRequest: (loadId: string, truckId: string) => void;
  reserveBackhaul: (truckId: string, loadId: string) => void;
  releaseReservation: (truckId: string, loadId: string) => void;
  acceptMatch: (loadId: string, truckId: string) => Promise<void>;
  rejectMatch: (loadId: string, truckId: string) => void;
  confirmMatch: (loadId: string, truckId?: string) => Promise<void>;
  declineMatch: (loadId: string, truckId?: string) => void;
  advanceTrip: (loadId: string, proof?: PodInput) => Promise<void>;
  rateLoad: (loadId: string, stars: 1 | 2 | 3 | 4 | 5, comment: string, tags: string[]) => void;
  flagDispute: (loadId: string, category: DisputeCategory, description: string) => void;
  resolveDispute: (loadId: string) => void;
  addFuelLog: (input: NewFuelInput) => void;
  addMaintenance: (input: NewMaintenanceInput) => void;
  completeMaintenance: (id: string) => void;
  addProof: (input: NewProofInput) => void;
  reset: () => void;
}

export interface NewFuelInput {
  truckId: string;
  litres: number;
  amount: number; // ZAR total
  odometerKm?: number | undefined;
  station?: string | undefined;
  note?: string | undefined;
  filledAt: string;
}
export interface NewMaintenanceInput {
  truckId: string;
  kind: MaintenanceKind;
  title: string;
  dueDate: string;
  amount?: number | undefined; // cost in ZAR
  note?: string | undefined;
}
export interface NewProofInput {
  tripId: string;
  loadId: string;
  recipientName: string;
  signature?: string;
  photoName?: string;
  note?: string;
}

function initial(): State {
  // Domain data now comes from Postgres (snapshot.load) — start empty and
  // hydrate. Only UI preferences are kept client-side.
  return {
    role: "FREIGHT_OWNER",
    parties: [],
    loads: [],
    trucks: [],
    matches: [],
    trips: [],
    ratings: [],
    disputes: [],
    acceptances: [],
    reservations: [],
    audit: [],
    fuelLogs: [],
    maintenance: [],
    proofs: [],
    sidebarCollapsed: false,
    notificationsReadAt: {
      FREIGHT_OWNER: new Date(0).toISOString(),
      TRANSPORTER: new Date(0).toISOString(),
      DRIVER: new Date(0).toISOString(),
      ADMIN: new Date(0).toISOString(),
    },
  };
}

// Change tracking for delta persistence: the shared entities and a snapshot of
// what has been persisted (id → serialised row) so we send only what changed.
const DOMAIN_KEYS = [
  "loads",
  "trucks",
  "matches",
  "trips",
  "ratings",
  "disputes",
  "acceptances",
  "reservations",
  "audit",
  "fuelLogs",
  "maintenance",
  "proofs",
] as const;
type DomainKey = (typeof DOMAIN_KEYS)[number];
type EntityMaps = Record<DomainKey, Map<string, string>>;

function emptyMaps(): EntityMaps {
  return Object.fromEntries(DOMAIN_KEYS.map((k) => [k, new Map<string, string>()])) as EntityMaps;
}

function mapsFrom(src: Record<DomainKey, { id: string }[]>): EntityMaps {
  return Object.fromEntries(
    DOMAIN_KEYS.map((k) => [k, new Map(src[k].map((r) => [r.id, JSON.stringify(r)]))]),
  ) as EntityMaps;
}

function computeDelta(prev: EntityMaps, state: State): { changed: boolean; delta: SnapshotDelta } {
  const upserts = {} as SnapshotDelta["upserts"];
  const deleteIds = {} as SnapshotDelta["deleteIds"];
  let changed = false;
  for (const k of DOMAIN_KEYS) {
    const rows = state[k] as { id: string }[];
    const prevMap = prev[k];
    const curIds = new Set<string>();
    const up: { id: string }[] = [];
    for (const r of rows) {
      curIds.add(r.id);
      if (prevMap.get(r.id) !== JSON.stringify(r)) up.push(r);
    }
    const del: string[] = [];
    for (const id of prevMap.keys()) if (!curIds.has(id)) del.push(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (upserts as any)[k] = up;
    deleteIds[k] = del;
    if (up.length || del.length) changed = true;
  }
  return { changed, delta: { upserts, deleteIds } };
}

const TampContext = createContext<Store | null>(null);

// Highest numeric suffix across all generated entities (loads, trucks,
// matches, trips, ratings, disputes). Used to seed the id counter so a fresh
// page load never reissues an id that persisted state already holds — which
// otherwise makes a new load inherit an old load's confirmed/delivered trip.
function maxRefNumber(s: State): number {
  let max = 999;
  const scan = (ids: string[]) => {
    for (const id of ids) {
      const m = /-(\d+)$/.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
  };
  scan(s.loads.map((l) => l.id));
  scan(s.trucks.map((t) => t.id));
  scan(s.matches.map((m) => m.id));
  scan(s.trips.map((t) => t.id));
  scan(s.ratings.map((r) => r.id));
  scan(s.disputes.map((d) => d.id));
  scan((s.acceptances ?? []).map((a) => a.id));
  scan((s.reservations ?? []).map((r) => r.id));
  return max;
}

let refSeq = maxRefNumber(initial()) + 1;
const nextRef = (prefix: string) => `${prefix}-${refSeq++}`;

export function TampProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [hydrated, setHydrated] = useState(false);
  // Real auth: the logged-in account, resolved from the session cookie.
  const [auth, setAuth] = useState<{ party: Party | null; ready: boolean }>({
    party: null,
    ready: false,
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What has been persisted, for computing deltas.
  const persistedRef = useRef<EntityMaps>(emptyMaps());

  // Load this account's scoped domain data from Postgres.
  const hydrateDomain = useCallback(async () => {
    try {
      const snap = await loadState();
      setState((s) => ({
        ...s,
        parties: snap.parties,
        loads: snap.loads,
        trucks: snap.trucks,
        matches: snap.matches,
        trips: snap.trips,
        ratings: snap.ratings,
        disputes: snap.disputes,
        acceptances: snap.acceptances,
        reservations: snap.reservations,
        audit: snap.audit,
        fuelLogs: snap.fuelLogs,
        maintenance: snap.maintenance,
        proofs: snap.proofs,
      }));
      persistedRef.current = mapsFrom(snap);
      refSeq = Math.max(refSeq, maxRefNumber({ ...initial(), ...snap } as State) + 1);
    } catch {
      /* not signed in / offline — keep whatever is loaded */
    }
  }, []);

  // Clear domain data (on sign-out) so the next account never sees it.
  const clearDomain = useCallback(() => {
    persistedRef.current = emptyMaps();
    setState((s) => ({
      ...s,
      parties: [],
      loads: [],
      trucks: [],
      matches: [],
      trips: [],
      ratings: [],
      disputes: [],
      acceptances: [],
      reservations: [],
      audit: [],
      // Clear the JSON-blob collections too, so the next account never sees the
      // previous one's data and they don't diff as "new" against the reset
      // baseline (which was triggering a stray sync on sign-out).
      fuelLogs: [],
      maintenance: [],
      proofs: [],
    }));
  }, []);

  // Restore UI preferences, resolve the session, and hydrate the domain.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const prefs = JSON.parse(raw) as Partial<
          Pick<State, "sidebarCollapsed" | "notificationsReadAt">
        >;
        setState((s) => ({ ...s, ...prefs }));
      }
    } catch {
      /* ignore corrupt cache */
    }
    (async () => {
      try {
        const party = await fetchMe();
        setAuth({ party, ready: true });
        if (party) {
          setState((s) => ({ ...s, role: party.role }));
          await hydrateDomain();
        }
      } catch {
        setAuth({ party: null, ready: true });
      } finally {
        setHydrated(true);
      }
    })();
  }, [hydrateDomain]);

  // Persist UI preferences only.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sidebarCollapsed: state.sidebarCollapsed,
          notificationsReadAt: state.notificationsReadAt,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [state.sidebarCollapsed, state.notificationsReadAt, hydrated]);

  // Write-through: persist only the rows that changed since the last save
  // (debounced so a burst of updates collapses into one delta).
  useEffect(() => {
    if (!hydrated) return;
    // No session → nothing to persist. Skips the write-through so signing out
    // (which resets the domain) never fires a doomed 401 sync.
    if (!auth.party) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { changed, delta } = computeDelta(persistedRef.current, state);
      if (!changed) return;
      applyDelta(delta)
        .then(() => {
          persistedRef.current = mapsFrom(state);
        })
        .catch(() => {});
    }, 400);
  }, [
    state.loads,
    state.trucks,
    state.matches,
    state.trips,
    state.ratings,
    state.disputes,
    state.acceptances,
    state.reservations,
    state.audit,
    hydrated,
    auth.party,
  ]);

  // Idle session timeout: sign the user out after a stretch of no interaction.
  // We end the server session and hard-navigate to the login page (with a
  // ?timeout flag) so the app reloads clean — no stale in-memory state.
  useEffect(() => {
    if (!auth.party) return;
    let timer: ReturnType<typeof setTimeout>;
    let last = 0;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await authLogout();
        } catch {
          /* clear the session best-effort */
        }
        window.location.href = "/?timeout=1";
      }, IDLE_TIMEOUT_MS);
    };
    // Throttle: activity fires constantly; only re-arm at most once/second.
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      arm();
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [auth.party]);

  const log = useCallback(
    (
      prev: AuditEvent[],
      eventKey: keyof typeof EVT,
      actorId: string,
      actorRole: Role | "SYSTEM",
      subjectType: AuditEvent["subjectType"],
      subjectId: string,
      summary: string,
    ): AuditEvent[] =>
      [
        {
          id: `EV-${Math.floor(Math.random() * 9000 + 1000)}`,
          eventId: EVT[eventKey],
          eventType: eventKey,
          actorId,
          actorRole,
          subjectType,
          subjectId,
          summary,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 60),
    [],
  );

  const value = useMemo<Store>(() => {
    const actorId = ACTOR_BY_ROLE[state.role];
    // The logged-in account is the real "me"; fall back to a persona only before
    // the session resolves (or in the seeded demo state).
    const me = auth.party ?? state.parties.find((p) => p.id === actorId) ?? state.parties[0]!;

    return {
      ...state,
      me,
      authParty: auth.party,
      authReady: auth.ready,

      login: async (email, password) => {
        const party = await authLogin(email, password);
        setAuth({ party, ready: true });
        setState((s) => ({ ...s, role: party.role }));
        await hydrateDomain();
        return party;
      },

      logout: async () => {
        await authLogout();
        setAuth({ party: null, ready: true });
        clearDomain();
      },

      // Re-read the current session (e.g. after a Google sign-in that set the
      // cookie server-side, or after finishing onboarding) and hydrate.
      refreshAuth: async () => {
        const party = await fetchMe();
        setAuth({ party, ready: true });
        if (party) {
          setState((s) => ({ ...s, role: party.role }));
          await hydrateDomain();
        }
        return party;
      },

      setRole: (role) => setState((s) => ({ ...s, role })),

      // Persist to the server, then reconcile both `auth.party` (the source of
      // `me` when logged in) and the local `parties` list from the authoritative
      // row it returns. No longer a fire-and-forget setState that's lost on reload.
      updateProfile: async (patch) => {
        const saved = await updateProfileCmd({
          ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
          ...(patch.companyName !== undefined ? { companyName: patch.companyName } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          ...(patch.province !== undefined ? { province: patch.province } : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        });
        setAuth((a) => (a.party && a.party.id === saved.id ? { ...a, party: saved } : a));
        setState((s) => ({
          ...s,
          parties: s.parties.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)),
        }));
      },

      // Server-side (parties.setVerification) is authoritative: it persists the
      // status and writes the audit row. Here we only mirror the change locally
      // for an immediate UI update; the server's audit row arrives on next sync.
      setVerification: (partyId, status) =>
        setState((s) => {
          const party = s.parties.find((p) => p.id === partyId);
          if (!party || party.verification === status) return s;
          return {
            ...s,
            parties: s.parties.map((p) => (p.id === partyId ? { ...p, verification: status } : p)),
          };
        }),

      toggleSidebar: () => setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })),

      markNotificationsRead: () =>
        setState((s) => ({
          ...s,
          notificationsReadAt: {
            ...s.notificationsReadAt,
            [s.role]: new Date().toISOString(),
          },
        })),

      registerParty: (input) => {
        const id = nextRef("P-USR");
        const now = new Date().toISOString();
        const party: Party = {
          id,
          role: input.role,
          companyName: input.companyName,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          province: input.province,
          verification: "PENDING",
          ratingAvg: null,
          ratingCount: 0,
          suspended: false,
          kycDocument: input.kycDocumentName
            ? { name: input.kycDocumentName, uploadedAt: now }
            : undefined,
          createdAt: now,
        };
        setState((s) => ({
          ...s,
          parties: [party, ...s.parties],
          audit: log(
            s.audit,
            "USER_REGISTERED",
            id,
            input.role,
            "USER",
            id,
            `${input.companyName} registered as ${input.role.replaceAll("_", " ")} — pending verification.`,
          ),
        }));
        return id;
      },

      addLoad: (input) =>
        setState((s) => {
          const id = nextRef("LD");
          // The platform derives the equipment and the price — the cargo owner
          // supplies neither. Cargo type → compatible bodies; pricing engine →
          // quoted rate.
          const load: Load = {
            id,
            reference: id,
            status: "POSTED",
            createdAt: new Date().toISOString(),
            ...input,
            requiredBodyTypes: bodyTypesForCargo(input.cargoType),
            targetRate: priceLoadMoney(input.distanceKm, input.weightKg, input.cargoType),
          };
          const ownerParty = s.parties.find((p) => p.id === load.ownerId)!;
          const available = s.trucks.filter((t) => t.status === "AVAILABLE");
          const scored = scoreLoadAgainstTrucks(load, available, s.parties, ownerParty).filter(
            (m) => m.passed,
          );
          const generated: Match[] = scored.map((m) => ({
            id: nextRef("MT"),
            loadId: id,
            truckPostingId: m.truck.id,
            score: m.score,
            breakdown: m.breakdown,
            hardFilterResults: m.hardFilterResults,
            status: "SUGGESTED",
            initiatedBy: "SYSTEM",
            expiresAt: new Date(Date.now() + 864e5).toISOString(),
            createdAt: new Date().toISOString(),
          }));

          return {
            ...s,
            loads: [load, ...s.loads],
            matches: [...generated, ...s.matches],
            audit: log(
              s.audit,
              "LOAD_POSTED",
              load.ownerId,
              "FREIGHT_OWNER",
              "LOAD",
              id,
              `${ownerParty.companyName} posted ${id} (${load.origin.label} → ${load.destination.label}).`,
            ),
          };
        }),

      // Re-post an expired (stale) load: reset its post date so the 7-day clock
      // starts over, ensure it's POSTED, and regenerate fresh suggestions
      // (dropping the load's old SUGGESTED matches).
      repostLoad: (loadId) =>
        setState((s) => {
          const existing = s.loads.find((l) => l.id === loadId);
          if (!existing) return s;
          const load: Load = {
            ...existing,
            status: "POSTED",
            createdAt: new Date().toISOString(),
          };
          const ownerParty = s.parties.find((p) => p.id === load.ownerId)!;
          const available = s.trucks.filter((t) => t.status === "AVAILABLE");
          const scored = scoreLoadAgainstTrucks(load, available, s.parties, ownerParty).filter(
            (m) => m.passed,
          );
          const generated: Match[] = scored.map((m) => ({
            id: nextRef("MT"),
            loadId,
            truckPostingId: m.truck.id,
            score: m.score,
            breakdown: m.breakdown,
            hardFilterResults: m.hardFilterResults,
            status: "SUGGESTED",
            initiatedBy: "SYSTEM",
            expiresAt: new Date(Date.now() + 864e5).toISOString(),
            createdAt: new Date().toISOString(),
          }));
          return {
            ...s,
            loads: s.loads.map((l) => (l.id === loadId ? load : l)),
            // Replace this load's stale SUGGESTED matches with the fresh ones.
            matches: [
              ...generated,
              ...s.matches.filter((m) => !(m.loadId === loadId && m.status === "SUGGESTED")),
            ],
            audit: log(
              s.audit,
              "LOAD_POSTED",
              load.ownerId,
              "FREIGHT_OWNER",
              "LOAD",
              loadId,
              `${ownerParty.companyName} re-posted ${loadId} (${load.origin.label} → ${load.destination.label}).`,
            ),
          };
        }),

      addTruck: (input) =>
        setState((s) => {
          const id = nextRef("TR");
          const truck: TruckPosting = {
            id,
            status: "AVAILABLE",
            createdAt: new Date().toISOString(),
            ...input,
          };
          const operator = s.parties.find((p) => p.id === truck.transporterId)!;
          const openLoads = s.loads.filter((l) => l.status === "POSTED");
          const generated: Match[] = [];
          for (const load of openLoads) {
            const ownerParty = s.parties.find((p) => p.id === load.ownerId)!;
            const scored = scoreLoadAgainstTrucks(load, [truck], s.parties, ownerParty).filter(
              (m) => m.passed,
            );
            for (const m of scored) {
              generated.push({
                id: nextRef("MT"),
                loadId: load.id,
                truckPostingId: truck.id,
                score: m.score,
                breakdown: m.breakdown,
                hardFilterResults: m.hardFilterResults,
                status: "SUGGESTED",
                initiatedBy: "SYSTEM",
                expiresAt: new Date(Date.now() + 864e5).toISOString(),
                createdAt: new Date().toISOString(),
              });
            }
          }

          return {
            ...s,
            trucks: [truck, ...s.trucks],
            matches: [...generated, ...s.matches],
            audit: log(
              s.audit,
              "TRUCK_POSTED",
              truck.transporterId,
              "TRANSPORTER",
              "TRUCK",
              id,
              `${operator.companyName} posted ${id} (${truck.bodyType}, ${truck.payloadCapacityKg.toLocaleString("en-ZA")} kg).`,
            ),
          };
        }),

      // Edit a persistent truck's availability details (status, location,
      // window, capacity, preferred lane) — no need to re-post a new truck.
      updateTruck: (truckId, patch) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === truckId);
          if (!truck) return s;
          return {
            ...s,
            trucks: s.trucks.map((t) => (t.id === truckId ? { ...t, ...patch } : t)),
            audit: log(
              s.audit,
              "TRUCK_UPDATED",
              truck.transporterId,
              "TRANSPORTER",
              "TRUCK",
              truckId,
              `${truck.registration} availability updated.`,
            ),
          };
        }),

      // Two-party handshake, step 1: the cargo owner accepts a suggestion.
      // The match moves to ACCEPTED and the load to MATCHED — no trip yet; it
      // awaits the truck owner's confirmation.
      // Authoritative: the server accepts the match (validates ownership,
      // creates the acceptance receipt, advances the load).
      acceptMatch: async (loadId, truckId) => {
        try {
          await acceptMatchCmd(loadId, truckId);
        } catch (err) {
          console.error("acceptMatch failed", err);
        }
        await hydrateDomain();
      },

      // Step 2 (authoritative): the carrier confirms the owner's acceptance. The
      // server flips the match to CONFIRMED, reserves the truck and opens a trip.
      confirmMatch: async (loadId, truckId) => {
        try {
          await confirmMatchCmd(loadId, truckId);
        } catch (err) {
          console.error("confirmMatch failed", err);
        }
        await hydrateDomain();
      },

      // The truck owner declines an acceptance — the load reopens for matching.
      declineMatch: (loadId, truckId) =>
        setState((s) => {
          const match = s.matches.find(
            (m) =>
              m.loadId === loadId &&
              m.status === "ACCEPTED" &&
              (truckId ? m.truckPostingId === truckId : true),
          );
          if (!match) return s;

          return {
            ...s,
            loads: s.loads.map((l) => (l.id === loadId ? { ...l, status: "POSTED" } : l)),
            matches: s.matches.map((m) =>
              m.id === match.id
                ? { ...m, status: "REJECTED", rejectionReason: "Carrier declined" }
                : m,
            ),
            audit: log(
              s.audit,
              "MATCH_REJECTED",
              actorId,
              state.role,
              "MATCH",
              match.id,
              `${loadId} declined by carrier. Load reopened.`,
            ),
          };
        }),

      rejectMatch: (loadId, truckId) =>
        setState((s) => {
          const match = s.matches.find(
            (m) => m.loadId === loadId && m.truckPostingId === truckId && m.status === "SUGGESTED",
          );
          if (!match) return s;
          return {
            ...s,
            matches: s.matches.map((m) =>
              m.id === match.id ? { ...m, status: "REJECTED", rejectionReason: "Rate too low" } : m,
            ),
            audit: log(
              s.audit,
              "MATCH_REJECTED",
              actorId,
              state.role,
              "MATCH",
              match.id,
              `Match ${match.id} rejected for ${loadId} (truck ${truckId}). Reason: rate too low.`,
            ),
          };
        }),

      assignDriver: (truckId, driverId) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === truckId);
          if (!truck) return s;
          const driver = driverId ? s.parties.find((p) => p.id === driverId) : undefined;
          return {
            ...s,
            trucks: s.trucks.map((t) =>
              t.id === truckId ? { ...t, driverId: driverId || undefined } : t,
            ),
            audit: log(
              s.audit,
              "DRIVER_ASSIGNED",
              actorId,
              state.role,
              "TRUCK",
              truckId,
              driver
                ? `${driver.contactName} assigned to drive ${truckId}.`
                : `Driver unassigned from ${truckId}.`,
            ),
          };
        }),

      // Link a driver (resolved by email) to a truck: adds their party record to
      // the store (a fleet doesn't otherwise hold the driver directory) and
      // assigns them. The driver sees the truck's jobs on their next sign-in.
      linkDriver: (truckId, driver) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === truckId);
          if (!truck) return s;
          const parties = s.parties.some((p) => p.id === driver.id)
            ? s.parties
            : [...s.parties, driver];
          return {
            ...s,
            parties,
            trucks: s.trucks.map((t) => (t.id === truckId ? { ...t, driverId: driver.id } : t)),
            audit: log(
              s.audit,
              "DRIVER_ASSIGNED",
              actorId,
              state.role,
              "TRUCK",
              truckId,
              `${driver.contactName} assigned to drive ${truckId}.`,
            ),
          };
        }),

      // Carrier requests an open job (from Engagements): records an OFFERED
      // match (awaiting the cargo owner's approval) — no trip yet. The load is
      // materialised into the store so the owner can see and act on the request.
      requestJob: (load, truckId, score) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === truckId);
          if (!truck || truck.status !== "AVAILABLE") return s;
          if (
            s.matches.some(
              (m) => m.loadId === load.id && m.truckPostingId === truckId && m.status === "OFFERED",
            )
          )
            return s;
          const now = new Date().toISOString();
          const loads = s.loads.some((l) => l.id === load.id) ? s.loads : [{ ...load }, ...s.loads];
          const match: Match = {
            id: nextRef("MT"),
            loadId: load.id,
            truckPostingId: truckId,
            score,
            breakdown: [],
            hardFilterResults: [],
            status: "OFFERED",
            initiatedBy: "TRANSPORTER",
            expiresAt: new Date(Date.now() + 864e5).toISOString(),
            createdAt: now,
          };
          return {
            ...s,
            loads,
            matches: [match, ...s.matches],
            audit: log(
              s.audit,
              "JOB_REQUESTED",
              truck.transporterId,
              "TRANSPORTER",
              "LOAD",
              load.id,
              `${truck.registration} requested ${load.id} (${load.origin.label} → ${load.destination.label}) — awaiting owner approval.`,
            ),
          };
        }),

      // Authoritative: the owner awards a carrier's request. The server confirms
      // the match, opens a trip, reserves the truck and closes other requests.
      acceptRequest: async (loadId, truckId) => {
        try {
          await acceptRequestCmd(loadId, truckId);
        } catch (err) {
          console.error("acceptRequest failed", err);
        }
        await hydrateDomain();
      },

      // Carrier withdraws a pending request.
      withdrawRequest: (loadId, truckId) =>
        setState((s) => {
          if (
            !s.matches.some(
              (m) => m.loadId === loadId && m.truckPostingId === truckId && m.status === "OFFERED",
            )
          )
            return s;
          return {
            ...s,
            matches: s.matches.filter(
              (m) =>
                !(m.loadId === loadId && m.truckPostingId === truckId && m.status === "OFFERED"),
            ),
            audit: log(
              s.audit,
              "MATCH_REJECTED",
              actorId,
              state.role,
              "LOAD",
              loadId,
              `Request on ${loadId} withdrawn.`,
            ),
          };
        }),

      // Carrier pre-books an open load as the backhaul for a truck on a trip.
      reserveBackhaul: (truckId, loadId) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === truckId);
          const load = s.loads.find((l) => l.id === loadId && l.status === "POSTED");
          if (!truck || !load) return s;
          const already = s.reservations.some(
            (r) => r.loadId === loadId && r.status === "RESERVED",
          );
          if (already) return s;
          const reservation: Reservation = {
            id: nextRef("RS"),
            truckId,
            loadId,
            transporterId: truck.transporterId,
            status: "RESERVED",
            createdAt: new Date().toISOString(),
          };
          return {
            ...s,
            reservations: [reservation, ...s.reservations],
            audit: log(
              s.audit,
              "BACKHAUL_RESERVED",
              actorId,
              state.role,
              "LOAD",
              loadId,
              `${truck.registration} pre-booked ${loadId} as a backhaul (${load.origin.label} → ${load.destination.label}).`,
            ),
          };
        }),

      // Carrier releases a backhaul reservation, freeing the load.
      releaseReservation: (truckId, loadId) =>
        setState((s) => {
          if (
            !s.reservations.some(
              (r) => r.truckId === truckId && r.loadId === loadId && r.status === "RESERVED",
            )
          )
            return s;
          return {
            ...s,
            reservations: s.reservations.filter(
              (r) => !(r.truckId === truckId && r.loadId === loadId && r.status === "RESERVED"),
            ),
            audit: log(
              s.audit,
              "BACKHAUL_RELEASED",
              actorId,
              state.role,
              "LOAD",
              loadId,
              `Backhaul reservation on ${loadId} released.`,
            ),
          };
        }),

      // Authoritative: the SERVER computes the transition (next status, POD gate,
      // load completion, truck release). We call the command, then re-hydrate so
      // local state reflects exactly what the server wrote.
      advanceTrip: async (loadId, proof) => {
        try {
          await advanceTripCmd(loadId, proof);
        } catch (err) {
          console.error("advanceTrip failed", err);
        }
        await hydrateDomain();
      },

      // Two-way rating. The ratee is the *other* side of the engagement: a
      // cargo owner rates the carrier, a truck owner rates the cargo owner.
      // Each party rates a given trip at most once, and the score rolls into
      // the ratee's running party rating.
      rateLoad: (loadId, stars, comment, tags) =>
        setState((s) => {
          const match = s.matches.find(
            (m) => m.loadId === loadId && (m.status === "CONFIRMED" || m.status === "ACCEPTED"),
          );
          const trip = tripForMatch(match?.id, s.trips);
          if (!match || !trip) return s;
          // one rating per rater per trip
          if (s.ratings.some((r) => r.tripId === trip.id && r.raterId === actorId)) return s;

          const load = s.loads.find((l) => l.id === loadId);
          const truck = s.trucks.find((t) => t.id === match.truckPostingId);
          const rateeId =
            state.role === "FREIGHT_OWNER"
              ? (truck?.transporterId ?? match.truckPostingId) // owner rates carrier
              : (load?.ownerId ?? ""); // carrier rates owner
          if (!rateeId) return s;

          const rating: Rating = {
            id: nextRef("RT"),
            tripId: trip.id,
            raterId: actorId,
            rateeId,
            stars,
            tags,
            comment,
            createdAt: new Date().toISOString(),
          };

          // Roll the score into the ratee's running rating (preserves the
          // seeded reputation rather than clobbering it).
          const parties = s.parties.map((p) => {
            if (p.id !== rateeId) return p;
            const base = p.ratingAvg ?? stars;
            const count = p.ratingCount + 1;
            return {
              ...p,
              ratingAvg: Math.round(((base * p.ratingCount + stars) / count) * 10) / 10,
              ratingCount: count,
            };
          });

          return {
            ...s,
            parties,
            ratings: [rating, ...s.ratings],
            loads: s.loads.map((l) =>
              l.id === loadId && l.status !== "CLOSED" ? { ...l, status: "CLOSED" } : l,
            ),
            trips: s.trips.map((t) =>
              t.id === trip.id && t.status !== "COMPLETED" ? { ...t, status: "COMPLETED" } : t,
            ),
            audit: log(
              s.audit,
              "RATING_SUBMITTED",
              actorId,
              state.role,
              "TRIP",
              trip.id,
              `${stars}-star rating submitted for ${trip.id}.`,
            ),
          };
        }),

      flagDispute: (loadId, category, description) =>
        setState((s) => {
          const match = activeMatchForLoad(loadId, s.matches);
          const trip = tripForMatch(match?.id, s.trips);
          if (!trip) return s;

          const dispute: Dispute = {
            id: nextRef("DP"),
            tripId: trip.id,
            raisedById: actorId,
            category,
            description: description || "No detail provided.",
            status: "OPEN",
            createdAt: new Date().toISOString(),
          };

          return {
            ...s,
            disputes: [dispute, ...s.disputes],
            trips: s.trips.map((t) => (t.id === trip.id ? { ...t, disputed: true } : t)),
            audit: log(
              s.audit,
              "DISPUTE_RAISED",
              actorId,
              state.role,
              "DISPUTE",
              dispute.id,
              `Dispute ${dispute.id} (${category.replaceAll("_", " ").toLowerCase()}) raised on ${trip.id}.`,
            ),
          };
        }),

      resolveDispute: (loadId) =>
        setState((s) => {
          const match = activeMatchForLoad(loadId, s.matches);
          const trip = tripForMatch(match?.id, s.trips);
          const dispute = s.disputes.find((d) => d.tripId === trip?.id && d.status === "OPEN");
          if (!trip || !dispute) return s;

          return {
            ...s,
            disputes: s.disputes.map((d) =>
              d.id === dispute.id
                ? {
                    ...d,
                    status: "RESOLVED",
                    resolutionNote: "Resolved by admin.",
                    resolvedAt: new Date().toISOString(),
                  }
                : d,
            ),
            trips: s.trips.map((t) => (t.id === trip.id ? { ...t, disputed: false } : t)),
            audit: log(
              s.audit,
              "DISPUTE_RESOLVED",
              "P-ADMIN-1",
              "ADMIN",
              "DISPUTE",
              dispute.id,
              `Dispute ${dispute.id} resolved.`,
            ),
          };
        }),

      addFuelLog: (input) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === input.truckId);
          if (!truck) return s;
          const fuel: FuelLog = {
            id: nextRef("FL"),
            truckId: truck.id,
            transporterId: truck.transporterId,
            driverId: truck.driverId,
            litres: input.litres,
            cost: { amount: input.amount, currency: "ZAR", vat: "incl" },
            odometerKm: input.odometerKm,
            station: input.station,
            note: input.note,
            filledAt: input.filledAt,
            createdAt: new Date().toISOString(),
          };
          return {
            ...s,
            fuelLogs: [fuel, ...s.fuelLogs],
            audit: log(
              s.audit,
              "FUEL_LOGGED",
              me.id,
              me.role,
              "TRUCK",
              truck.id,
              `${input.litres.toFixed(0)} L fuel logged for ${truck.registration} (R ${input.amount.toLocaleString("en-ZA")}).`,
            ),
          };
        }),

      addMaintenance: (input) =>
        setState((s) => {
          const truck = s.trucks.find((t) => t.id === input.truckId);
          if (!truck) return s;
          const task: MaintenanceTask = {
            id: nextRef("MN"),
            truckId: truck.id,
            transporterId: truck.transporterId,
            driverId: truck.driverId,
            kind: input.kind,
            title: input.title,
            dueDate: input.dueDate,
            status: "SCHEDULED",
            cost: input.amount ? { amount: input.amount, currency: "ZAR", vat: "incl" } : undefined,
            note: input.note,
            createdAt: new Date().toISOString(),
          };
          return {
            ...s,
            maintenance: [task, ...s.maintenance],
            audit: log(
              s.audit,
              "MAINTENANCE_LOGGED",
              me.id,
              me.role,
              "TRUCK",
              truck.id,
              `${input.title} scheduled for ${truck.registration} (due ${new Date(input.dueDate).toLocaleDateString("en-ZA")}).`,
            ),
          };
        }),

      completeMaintenance: (id) =>
        setState((s) => {
          const task = s.maintenance.find((m) => m.id === id);
          if (!task) return s;
          const truck = s.trucks.find((t) => t.id === task.truckId);
          return {
            ...s,
            maintenance: s.maintenance.map((m) =>
              m.id === id ? { ...m, status: "DONE", completedAt: new Date().toISOString() } : m,
            ),
            audit: log(
              s.audit,
              "MAINTENANCE_DONE",
              me.id,
              me.role,
              "TRUCK",
              task.truckId,
              `${task.title} completed${truck ? ` for ${truck.registration}` : ""}.`,
            ),
          };
        }),

      addProof: (input) =>
        setState((s) => {
          const load = s.loads.find((l) => l.id === input.loadId);
          const proof: Proof = {
            id: nextRef("PF"),
            tripId: input.tripId,
            loadId: input.loadId,
            recipientName: input.recipientName,
            signature: input.signature,
            photoName: input.photoName,
            note: input.note,
            capturedAt: new Date().toISOString(),
          };
          return {
            ...s,
            // One proof per trip — replace any existing.
            proofs: [proof, ...s.proofs.filter((p) => p.tripId !== input.tripId)],
            audit: log(
              s.audit,
              "PROOF_CAPTURED",
              me.id,
              me.role,
              "TRIP",
              input.tripId,
              `Proof of delivery captured${load ? ` for ${load.origin.label} → ${load.destination.label}` : ""} — signed by ${input.recipientName}.`,
            ),
          };
        }),

      reset: () => setState(initial()),
    };
  }, [state, log, auth, hydrateDomain, clearDomain]);

  return <TampContext.Provider value={value}>{children}</TampContext.Provider>;
}

export function useTamp() {
  const ctx = useContext(TampContext);
  if (!ctx) throw new Error("useTamp must be used inside TampProvider");
  return ctx;
}
