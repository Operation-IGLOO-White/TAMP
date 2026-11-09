import { trpc } from "@/lib/trpc";
import type { Vehicle, VerificationStatus } from "@/types/domain";

export const setVehicleVerification = (
  truckId: string,
  status: Extract<VerificationStatus, "PENDING" | "VERIFIED" | "REJECTED">,
) => trpc.mutation<Vehicle>("vehicles.setVerification", { truckId, status });
