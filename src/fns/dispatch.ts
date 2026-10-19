import { trpc } from "@/lib/trpc";
import type { DispatchAssignment } from "@/types/domain";

export type DispatchAction = "ASSIGN" | "ACCEPT" | "DECLINE" | "CANCEL";
export const runDispatchAction = (tripId: string, action: DispatchAction, options: { driverEmail?: string; note?: string } = {}) =>
  trpc.mutation<{ ok: true; dispatch: DispatchAssignment }>("dispatch.action", { tripId, action, ...options });
