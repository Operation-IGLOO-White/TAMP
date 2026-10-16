import { trpc } from "@/lib/trpc";
import type { TripIncident } from "@/types/domain";

export type IncidentAction = "ACKNOWLEDGE" | "ASSIGN" | "BEGIN_RESOLUTION" | "RESOLVE" | "RESUME_TRIP" | "REOPEN_LOAD" | "UPDATE_ETA";

export const runIncidentAction = (
  incidentId: string,
  action: IncidentAction,
  options: { assigneeId?: string; note?: string; etaMinutes?: number } = {},
) => trpc.mutation<{ ok: true; incident: TripIncident }>("operations.incidentAction", {
  incidentId,
  action,
  ...options,
});
