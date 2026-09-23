// Client wrappers over the tRPC `snapshot` router — one scoped read, and a
// delta apply that persists only the rows that changed.
import { trpc } from "@/lib/trpc";
import type { DomainSnapshot } from "@/server/routers/snapshot";
import type { Party } from "@/lib/tamp-types";

export type LoadedSnapshot = DomainSnapshot & { parties: Party[] };
export type SnapshotDelta = {
  upserts: DomainSnapshot;
  deleteIds: { [K in keyof DomainSnapshot]: string[] };
};

export const loadState = (): Promise<LoadedSnapshot> => trpc.snapshot.load.query();

export const applyDelta = (delta: SnapshotDelta): Promise<{ ok: true }> =>
  trpc.snapshot.sync.mutate(delta);
