// Client wrapper over the tRPC `phone` router — replaces the direct import
// of SA mobile-number validation from the old @tamp/shared package.
import { trpc } from "@/lib/trpc";

export interface PhoneCheck {
  valid: boolean;
  e164?: string;
  national?: string;
  reason?: string;
}

export const checkSaMobile = (raw: string): Promise<PhoneCheck> =>
  trpc.phone.check.query({ raw });
