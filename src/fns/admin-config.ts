import { userFacingError } from "@/lib/api-errors";

export type RbacConfiguration = {
  permissions: { code: string; description: string }[];
  roles: { id: string; name: string; scope: string; system: boolean; permissions: string[] }[];
  userOverrides: Record<string, Record<string, boolean>>;
};

export type MatchingConfiguration = {
  maxPickupRadiusKm: number;
  minimumScore: number;
  weights: { proximity: number; capacity: number; timing: number; lane: number; rating: number };
  requireValidLicence: boolean;
  requireDocuments: boolean;
  requireVerifiedParties: boolean;
};

async function request<Result>(url: string, init?: RequestInit): Promise<Result> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = "The platform configuration could not be updated.";
    try {
      const body = await response.json() as { detail?: string };
      detail = body.detail ?? detail;
    } catch { /* use safe fallback */ }
    throw new Error(userFacingError(new Error(detail)));
  }
  return response.json() as Promise<Result>;
}

export const getRbacConfiguration = () => request<RbacConfiguration>("/api/v1/admin/rbac");
export const setRolePermission = (roleId: string, permission: string, enabled: boolean) =>
  request<{ ok: true }>(`/api/v1/admin/rbac/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permission)}`, { method: "PUT", body: JSON.stringify({ enabled }) });
export const setUserPermission = (userId: string, permission: string, enabled: boolean) =>
  request<{ ok: true }>(`/api/v1/admin/rbac/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permission)}`, { method: "PUT", body: JSON.stringify({ enabled }) });
export const getMatchingConfiguration = () => request<MatchingConfiguration>("/api/v1/admin/matching-config");
export const saveMatchingConfiguration = (input: MatchingConfiguration) =>
  request<MatchingConfiguration>("/api/v1/admin/matching-config", { method: "PUT", body: JSON.stringify(input) });
