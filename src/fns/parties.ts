// Client wrappers over the tRPC `parties` router. Signatures match the previous
// TanStack server functions so existing call sites are unchanged.
import { trpc } from "@/lib/trpc";
import type { OnboardingData, OnboardingUserType, Party, VerificationStatus } from "@/types/domain";

export const listParties = (): Promise<Party[]> => trpc.query("parties.list");

export interface RegisterInput {
  userType: OnboardingUserType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  province: string;
  password: string;
  code: string;
  business?: OnboardingData["business"];
  driver?: OnboardingData["driver"];
  documents?: string[];
}

export const registerParty = ({ data }: { data: RegisterInput }): Promise<{ id: string }> =>
  trpc.mutation("parties.register", data);

export const setPartyVerification = ({
  data,
}: {
  data: { partyId: string; status: VerificationStatus };
}): Promise<{ ok: true }> => trpc.mutation("parties.setVerification", data);

export interface CompleteOnboardingInput {
  userType: OnboardingUserType;
  companyName: string;
  phone: string;
  province: string;
}

export const completeOnboarding = (data: CompleteOnboardingInput): Promise<Party> =>
  trpc.mutation("parties.completeOnboarding", data);

export const findDriver = (email: string): Promise<Party | null> =>
  trpc.query("parties.findDriver", { email });

export const getOnboarding = (partyId: string): Promise<OnboardingData | null> =>
  trpc.query("parties.onboarding", { partyId });

export const uploadKycDocument = (name: string, url: string): Promise<Party> =>
  trpc.mutation("parties.uploadKyc", { name, url });
