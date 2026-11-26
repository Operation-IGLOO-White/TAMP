export function passengerVehicleAsset(vehicle: { type: string; make?: string; model?: string }) {
  const sprinter = /sprinter/i.test(vehicle.model ?? "");
  const image = sprinter ? "sprinter" : vehicle.type.toLowerCase();
  return `${import.meta.env.BASE_URL}fleet/tamp-passenger-${image}.webp`;
}
