import { responseError } from "@/lib/api-errors";

export type DriverDocumentType =
  | "IDENTITY_DOCUMENT"
  | "DRIVING_LICENCE"
  | "PRDP"
  | "MEDICAL_CERTIFICATE"
  | "EMPLOYMENT_CONTRACT";

export interface DriverDocument {
  id: string;
  organisationId: string;
  driverId: string;
  driverName: string;
  documentType: DriverDocumentType;
  documentNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  fileUrl: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  status: "VALID" | "EXPIRING" | "EXPIRED";
}

const path = (organisationId: string, driverId: string) =>
  `/api/v1/organisations/${encodeURIComponent(organisationId)}/drivers/${encodeURIComponent(driverId)}/documents`;

export async function listDriverDocuments(organisationId: string, driverId: string): Promise<DriverDocument[]> {
  const response = await fetch(path(organisationId, driverId), { credentials: "include" });
  if (!response.ok) throw new Error(await responseError(response, "Driver documents could not be loaded."));
  return response.json() as Promise<DriverDocument[]>;
}

export async function uploadDriverDocument(input: {
  organisationId: string;
  driverId: string;
  documentType: DriverDocumentType;
  documentNumber: string;
  issuedAt: string;
  expiresAt: string;
  file: File;
}): Promise<DriverDocument> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("document_type", input.documentType);
  body.append("document_number", input.documentNumber);
  body.append("issued_at", input.issuedAt);
  body.append("expires_at", input.expiresAt);
  const response = await fetch(path(input.organisationId, input.driverId), {
    method: "POST", credentials: "include", headers: { "X-TAMP-Request": "1" }, body,
  });
  if (!response.ok) throw new Error(await responseError(response, "The driver document could not be uploaded."));
  return response.json() as Promise<DriverDocument>;
}

export async function deleteDriverDocument(organisationId: string, driverId: string, documentId: string) {
  const response = await fetch(`${path(organisationId, driverId)}/${encodeURIComponent(documentId)}`, {
    method: "DELETE", credentials: "include", headers: { "X-TAMP-Request": "1" },
  });
  if (!response.ok) throw new Error(await responseError(response, "The driver document could not be removed."));
}

