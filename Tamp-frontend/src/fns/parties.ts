// Client wrappers over the tRPC `parties` router. Signatures match the previous
// TanStack server functions so existing call sites are unchanged.
import { trpc } from "@/lib/trpc";
import type { OnboardingData, OnboardingUserType, Party, VerificationStatus } from "@/lib/tamp-types";

export const listParties = (): Promise<Party[]> => trpc.parties.list.query();

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
  trpc.parties.register.mutate(data);

export const setPartyVerification = ({
  data,
}: {
  data: { partyId: string; status: VerificationStatus };
}): Promise<{ ok: true }> => trpc.parties.setVerification.mutate(data);

export interface CompleteOnboardingInput {
  userType: OnboardingUserType;
  companyName: string;
  phone: string;
  province: string;
}

export const completeOnboarding = (data: CompleteOnboardingInput): Promise<Party> =>
  trpc.parties.completeOnboarding.mutate(data);

export const findDriver = (email: string): Promise<Party | null> =>
  trpc.parties.findDriver.query({ email });

export const getOnboarding = (partyId: string): Promise<OnboardingData | null> =>
  trpc.parties.onboarding.query({ partyId });

export const uploadKycDocument = (name: string, url: string): Promise<Party> =>
  trpc.parties.uploadKyc.mutate({ name, url });
