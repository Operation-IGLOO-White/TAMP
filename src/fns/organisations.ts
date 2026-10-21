import { trpc } from "@/lib/trpc";
import type { OrganisationSummary, Role, User } from "@/types/domain";

export type OrganisationMember = User & {
  membershipId: string;
  isPrimary: boolean;
  roleIds: string[];
};

export const listOrganisations = (): Promise<OrganisationSummary[]> =>
  trpc.query("organisations.list");

export const listOrganisationMembers = (
  organisationId: string,
): Promise<OrganisationMember[]> => trpc.query("organisations.members", { organisationId });

export const createOrganisation = (input: {
  name: string;
  type: "CARGO_OWNER" | "CARRIER" | "BROKER" | "DRIVER_NETWORK";
}): Promise<OrganisationSummary> => trpc.mutation("organisations.create", input);

export const addOrganisationMember = (input: {
  organisationId: string;
  email: string;
  role: Exclude<Role, "ADMIN">;
}): Promise<{ ok: true; userId: string }> => trpc.mutation("organisations.addMember", input);

export const updateOrganisation = (organisationId: string, name: string) =>
  trpc.mutation<OrganisationSummary>("organisations.update", { organisationId, name });

export const setOrganisationMemberRoles = (
  organisationId: string,
  userId: string,
  roles: Exclude<Role, "ADMIN">[],
) => trpc.mutation<{ ok: true }>("organisations.setMemberRoles", { organisationId, userId, roles });

export const removeOrganisationMember = (organisationId: string, userId: string) =>
  trpc.mutation<{ ok: true }>("organisations.removeMember", { organisationId, userId });

export const switchOrganisation = (organisationId: string) =>
  trpc.mutation<{ ok: true; activeOrganisationId: string }>("organisations.switch", {
    organisationId,
  });
