// Client wrapper over the tRPC `email` router.
import { trpc } from "@/lib/trpc";

export interface SendCodeResult {
  sent: boolean;
  live: boolean;
  devCode?: string | undefined;
}

export const sendVerificationCode = (email: string): Promise<SendCodeResult> =>
  trpc.mutation("email.sendCode", { email });
