import type { OnboardingData, OnboardingUserType } from "@/types/domain";

export const BASE_REGISTRATION_DOCUMENTS = [
  "CIPC registration",
  "Tax clearance",
  "Proof of address",
  "Bank confirmation",
  "Transport / insurance",
] as const;

export const CARRIER_REGISTRATION_DOCUMENTS = [
  "Vehicle registration",
  "Operating licence",
  "Roadworthy certificate",
  "Insurance certificate",
] as const;

export const BROKER_REGISTRATION_DOCUMENTS = [
  "Broker mandate",
  "Commission / FSP agreement",
] as const;

export const DRIVER_REGISTRATION_DOCUMENTS = [
  "South African ID / passport",
  "Driver's licence (front & back)",
  "Professional Driving Permit (PrDP)",
  "Proof of address",
  "Profile photo",
] as const;

export const OWNER_DRIVER_VEHICLE_DOCUMENTS = [
  "Vehicle licence disc (registration)",
  "Roadworthy certificate",
  "Vehicle insurance certificate",
] as const;

export function registrationDocumentLabels(
  userType: OnboardingUserType,
  driverWorkType?: "OWNER" | "FLEET",
): string[] {
  if (userType === "DRIVER") {
    return DRIVER_REGISTRATION_DOCUMENTS.flatMap((label) =>
      label === "Proof of address" && driverWorkType === "OWNER"
        ? [...OWNER_DRIVER_VEHICLE_DOCUMENTS, label]
        : [label],
    );
  }
  if (userType === "CARRIER") {
    return [...BASE_REGISTRATION_DOCUMENTS, ...CARRIER_REGISTRATION_DOCUMENTS];
  }
  if (userType === "BROKER") {
    return [...BASE_REGISTRATION_DOCUMENTS, ...BROKER_REGISTRATION_DOCUMENTS];
  }
  return [];
}

export function onboardingDocumentLabels(onboarding: OnboardingData): string[] {
  const required = registrationDocumentLabels(onboarding.userType, onboarding.driver?.workType);
  if (required.length) return required;
  return (onboarding.documents ?? []).map((document) =>
    typeof document === "string" ? document : document.label,
  );
}
