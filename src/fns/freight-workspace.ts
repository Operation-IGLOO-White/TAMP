import { trpc } from "@/lib/trpc";
import type { CargoType, Place } from "@/types/domain";

export interface FreightCustomer {
  id: string;
  name: string;
  accountCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingEmail?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedLocation {
  id: string;
  customerId?: string;
  name: string;
  place: Place;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoadTemplate {
  id: string;
  name: string;
  customerId?: string;
  originLocationId?: string;
  destinationLocationId?: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number;
  specialRequirements?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FreightWorkspace {
  customers: FreightCustomer[];
  locations: SavedLocation[];
  templates: LoadTemplate[];
}

export const getFreightWorkspace = () => trpc.query<FreightWorkspace>("freightWorkspace.list");
export const saveFreightCustomer = (input: Omit<FreightCustomer, "createdAt" | "updatedAt"> | Omit<FreightCustomer, "id" | "createdAt" | "updatedAt">) =>
  trpc.mutation<FreightCustomer>("freightWorkspace.saveCustomer", input);
export const saveFreightLocation = (input: Omit<SavedLocation, "createdAt" | "updatedAt"> | Omit<SavedLocation, "id" | "createdAt" | "updatedAt">) =>
  trpc.mutation<SavedLocation>("freightWorkspace.saveLocation", input);
export const saveLoadTemplate = (input: Omit<LoadTemplate, "createdAt" | "updatedAt"> | Omit<LoadTemplate, "id" | "createdAt" | "updatedAt">) =>
  trpc.mutation<LoadTemplate>("freightWorkspace.saveTemplate", input);
export const deleteFreightWorkspaceRecord = (kind: "CUSTOMER" | "LOCATION" | "TEMPLATE", id: string) =>
  trpc.mutation<{ ok: true }>("freightWorkspace.delete", { kind, id });
