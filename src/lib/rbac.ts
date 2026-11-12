import type { OrganisationRole } from "@/types/domain";

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "platform.admin": "Full platform administration",
  "users.read": "View users",
  "users.verify": "Verify and reject users",
  "organisations.read": "View organisations and memberships",
  "organisations.create": "Create organisations",
  "organisations.update": "Update organisation details",
  "organisations.members.manage": "Add, remove and assign organisation members",
  "loads.read": "View permitted loads",
  "loads.manage": "Create and manage freight loads",
  "trucks.read": "View permitted trucks",
  "trucks.manage": "Create and manage fleet vehicles",
  "matches.read": "View match suggestions and offers",
  "matches.manage": "Negotiate and accept matches",
  "trips.read": "View assigned trips",
  "trips.manage": "Advance and manage trips",
  "dispatch.manage": "Assign drivers to trips",
  "dispatch.respond": "Respond to driver assignments",
  "incidents.report": "Report trip incidents",
  "incidents.manage": "Manage operational incidents",
  "finance.read": "View permitted invoices and transactions",
  "finance.manage": "Record settlement actions",
  "messages.read": "View permitted trip conversations",
  "messages.send": "Send trip messages",
  "notifications.read": "View and acknowledge notifications",
  "tracking.read": "View permitted live vehicle positions",
  "tracking.publish": "Publish vehicle positions",
  "webhooks.manage": "Manage outbound webhooks",
  "audit.read": "View audit records",
  "system.logs.read": "Browse backend logs",
  "maps.use": "Use geocoding and routing",
};

export type BuiltInRole = "SYSTEM_SUPER_USER" | "ADMIN" | OrganisationRole;

const all = Object.keys(PERMISSION_DESCRIPTIONS);
export const ROLE_PERMISSIONS: Record<BuiltInRole, string[]> = {
  SYSTEM_SUPER_USER: all,
  ADMIN: all.filter((permission) => permission !== "organisations.create"),
  FREIGHT_OWNER: ["organisations.read", "organisations.update", "organisations.members.manage", "loads.read", "loads.manage", "trucks.read", "matches.read", "matches.manage", "trips.read", "trips.manage", "incidents.report", "finance.read", "messages.read", "messages.send", "notifications.read", "tracking.read", "maps.use"],
  TRANSPORTER: ["organisations.read", "organisations.update", "organisations.members.manage", "loads.read", "trucks.read", "trucks.manage", "matches.read", "matches.manage", "trips.read", "trips.manage", "dispatch.manage", "incidents.report", "finance.read", "messages.read", "messages.send", "notifications.read", "tracking.read", "tracking.publish", "maps.use"],
  DRIVER: ["organisations.read", "trucks.read", "trips.read", "trips.manage", "dispatch.respond", "incidents.report", "messages.read", "messages.send", "notifications.read", "tracking.read", "tracking.publish", "maps.use"],
  CARGO_OPERATOR: ["organisations.read", "loads.read", "loads.manage", "trucks.read", "matches.read", "matches.manage", "trips.read", "incidents.report", "finance.read", "messages.read", "messages.send", "notifications.read", "tracking.read", "maps.use"],
  DISPATCHER: ["organisations.read", "loads.read", "trucks.read", "trucks.manage", "matches.read", "matches.manage", "trips.read", "trips.manage", "dispatch.manage", "incidents.report", "messages.read", "messages.send", "notifications.read", "tracking.read", "maps.use"],
};

export const ROLE_LABELS: Record<BuiltInRole, string> = {
  SYSTEM_SUPER_USER: "System Super User",
  ADMIN: "Platform Administrator",
  FREIGHT_OWNER: "Cargo Organisation Admin",
  TRANSPORTER: "Carrier Organisation Admin",
  DRIVER: "Driver",
  CARGO_OPERATOR: "Cargo Operator",
  DISPATCHER: "Fleet Dispatcher",
};

export const ROLE_IDS: Record<OrganisationRole, string> = {
  FREIGHT_OWNER: "ROLE-FREIGHT-OWNER",
  TRANSPORTER: "ROLE-TRANSPORTER",
  DRIVER: "ROLE-DRIVER",
  CARGO_OPERATOR: "ROLE-CARGO-OPERATOR",
  DISPATCHER: "ROLE-DISPATCHER",
};
