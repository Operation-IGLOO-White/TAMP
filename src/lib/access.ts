import type { Party } from "@/types/domain";

export type PermissionCode =
  | "platform.admin"
  | "users.read"
  | "users.verify"
  | "organisations.read"
  | "organisations.create"
  | "organisations.update"
  | "organisations.members.manage"
  | "loads.read"
  | "loads.manage"
  | "trucks.read"
  | "trucks.manage"
  | "matches.read"
  | "matches.manage"
  | "trips.read"
  | "trips.manage"
  | "dispatch.manage"
  | "dispatch.respond"
  | "incidents.report"
  | "incidents.manage"
  | "finance.read"
  | "finance.manage"
  | "messages.read"
  | "messages.send"
  | "notifications.read"
  | "tracking.read"
  | "tracking.publish"
  | "webhooks.manage"
  | "audit.read"
  | "system.logs.read"
  | "maps.use";

export function hasPermission(
  party: Pick<Party, "permissions" | "systemRole"> | null | undefined,
  permission?: PermissionCode,
) {
  if (!permission) return true;
  if (party?.systemRole === "system_super_user") return true;
  return party?.permissions?.includes(permission) === true;
}
