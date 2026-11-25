import type { TruckPosting } from "@/types/domain";

const BODY_TYPE_ASSET: Record<TruckPosting["bodyType"], string> = {
  TAUTLINER: "/fleet/tamp-tautliner.png",
  FLATBED: "/fleet/tamp-flatbed.png",
  TIPPER: "/fleet/tamp-tipper.png",
  TANKER: "/fleet/tamp-tanker.png",
  REFRIGERATED: "/fleet/tamp-refrigerated.png",
  SIDE_TIPPER: "/fleet/tamp-side-tipper.png",
  LOWBED: "/fleet/tamp-lowbed.png",
  DROPSIDE: "/fleet/tamp-dropside.png",
  CONTAINER_SKELETAL: "/fleet/tamp-container-skeletal.png",
  BOX_TRUCK: "/fleet/tamp-box-truck.png",
  CRANE_TRUCK: "/fleet/tamp-crane-truck.png",
  CAR_CARRIER: "/fleet/tamp-car-carrier.png",
  LIVESTOCK_CARRIER: "/fleet/tamp-livestock-carrier.png",
};

export function fleetVehicleAsset(truck: TruckPosting): string {
  return BODY_TYPE_ASSET[truck.bodyType];
}
