// Client wrappers over the tRPC `auth` router (real session-based login).
import { trpc } from "@/lib/trpc";
import type { Party } from "@/lib/tamp-types";

export const login = (email: string, password: string): Promise<Party> =>
  trpc.auth.login.mutate({ email, password });

export const fetchMe = (): Promise<Party | null> => trpc.auth.me.query();

export const logout = (): Promise<{ ok: true }> => trpc.auth.logout.mutate();

export const changePassword = (
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; signedOut: number }> =>
  trpc.auth.changePassword.mutate({ currentPassword, newPassword });

export const logoutOtherSessions = (): Promise<{ count: number }> =>
  trpc.auth.logoutOtherSessions.mutate();

export const requestPasswordReset = (email: string): Promise<{ sent: true; devCode?: string | undefined }> =>
  trpc.auth.requestPasswordReset.mutate({ email });

export const resetPassword = (
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: true }> => trpc.auth.resetPassword.mutate({ email, code, newPassword });

export const requestEmailChange = (
  newEmail: string,
): Promise<{ sent: true; newEmail: string; devCode?: string | undefined }> =>
  trpc.auth.requestEmailChange.mutate({ newEmail });

export const confirmEmailChange = (code: string): Promise<Party> =>
  trpc.auth.confirmEmailChange.mutate({ code });

export interface ProfilePatch {
  contactName?: string;
  companyName?: string;
  phone?: string;
  province?: string;
  avatarUrl?: string;
}

export const updateProfile = (patch: ProfilePatch): Promise<Party> =>
  trpc.auth.updateProfile.mutate(patch);
