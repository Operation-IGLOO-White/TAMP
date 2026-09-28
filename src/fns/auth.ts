// Client wrappers over the tRPC `auth` router (real session-based login).
import { trpc } from "@/lib/trpc";
import type { Party } from "@/types/domain";

export const login = (email: string, password: string): Promise<Party> =>
  trpc.mutation("auth.login", { email, password });

export const fetchMe = (): Promise<Party | null> => trpc.query("auth.me");

export const logout = (): Promise<{ ok: true }> => trpc.mutation("auth.logout");

export const changePassword = (
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; signedOut: number }> =>
  trpc.mutation("auth.changePassword", { currentPassword, newPassword });

export const logoutOtherSessions = (): Promise<{ count: number }> =>
  trpc.mutation("auth.logoutOtherSessions");

export const requestPasswordReset = (email: string): Promise<{ sent: true; devCode?: string | undefined }> =>
  trpc.mutation("auth.requestPasswordReset", { email });

export const resetPassword = (
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: true }> => trpc.mutation("auth.resetPassword", { email, code, newPassword });

export const requestEmailChange = (
  newEmail: string,
): Promise<{ sent: true; newEmail: string; devCode?: string | undefined }> =>
  trpc.mutation("auth.requestEmailChange", { newEmail });

export const confirmEmailChange = (code: string): Promise<Party> =>
  trpc.mutation("auth.confirmEmailChange", { code });

export interface ProfilePatch {
  contactName?: string;
  companyName?: string;
  phone?: string;
  province?: string;
  avatarUrl?: string;
}

export const updateProfile = (patch: ProfilePatch): Promise<Party> =>
  trpc.mutation("auth.updateProfile", patch);
