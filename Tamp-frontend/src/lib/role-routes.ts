import type { Role } from "./tamp-types";

export const HOME_BY_ROLE: Record<
  Role,
  "/owner" | "/transporter" | "/driver/dashboard" | "/admin"
> = {
  FREIGHT_OWNER: "/owner",
  TRANSPORTER: "/transporter",
  DRIVER: "/driver/dashboard",
  ADMIN: "/admin",
};

export const PROFILE_BY_ROLE: Record<
  Role,
  "/owner/profile" | "/transporter/profile" | "/driver/profile" | "/admin/profile"
> = {
  FREIGHT_OWNER: "/owner/profile",
  TRANSPORTER: "/transporter/profile",
  DRIVER: "/driver/profile",
  ADMIN: "/admin/profile",
};

// User-facing role names.
export const ROLE_LABEL: Record<Role, string> = {
  FREIGHT_OWNER: "CARGO OWNER",
  TRANSPORTER: "TRUCK OWNER",
  DRIVER: "TRUCK DRIVER",
  ADMIN: "SUPER ADMIN",
};

export const ROLE_SHORT: Record<Role, string> = {
  FREIGHT_OWNER: "Cargo Owner",
  TRANSPORTER: "Truck Owner",
  DRIVER: "Truck Driver",
  ADMIN: "Super Admin",
};
