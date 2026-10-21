// User-account API. Export names remain compatible while UI call sites migrate
// from the former Party terminology.
import { trpc } from "@/lib/trpc";
import type { OnboardingData, OnboardingUserType, Party, VerificationStatus } from "@/types/domain";

export const listParties = (): Promise<Party[]> => trpc.query("users.list");

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
  trpc.mutation("users.register", data);

export const setPartyVerification = ({
  data,
}: {
  data: { partyId: string; status: VerificationStatus };
}): Promise<{ ok: true }> => trpc.mutation("users.setVerification", data);

export interface CompleteOnboardingInput {
  userType: OnboardingUserType;
  companyName: string;
  phone: string;
  province: string;
}

export const completeOnboarding = (data: CompleteOnboardingInput): Promise<Party> =>
  trpc.mutation("users.completeOnboarding", data);

export const findDriver = (email: string): Promise<Party | null> =>
  trpc.query("users.findDriver", { email });

export const getOnboarding = (partyId: string): Promise<OnboardingData | null> =>
  trpc.query("users.onboarding", { partyId });

export const uploadKycDocument = (name: string, url: string): Promise<Party> =>
  trpc.mutation("users.uploadKyc", { name, url });
