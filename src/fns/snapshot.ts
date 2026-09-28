// Client wrappers over the tRPC `snapshot` router — one scoped read, and a
// delta apply that persists only the rows that changed.
import { trpc } from "@/lib/trpc";
import type { DomainSnapshot } from "@/types/api";
import type { Party } from "@/types/domain";

export type LoadedSnapshot = DomainSnapshot & { parties: Party[] };
export type SnapshotDelta = {
  upserts: DomainSnapshot;
  deleteIds: { [K in keyof DomainSnapshot]: string[] };
};

export const loadState = (): Promise<LoadedSnapshot> => trpc.query("snapshot.load");

export const applyDelta = (delta: SnapshotDelta): Promise<{ ok: true; snapshot?: LoadedSnapshot }> =>
  trpc.mutation("snapshot.sync", delta);
