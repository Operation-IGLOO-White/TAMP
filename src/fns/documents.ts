import { trpc } from "@/lib/trpc";

export type DocumentSubjectType = "REGISTRATION" | "TRUCK" | "DRIVER";
export type DocumentReviewStatus = "APPROVED" | "REJECTED";

export interface ReviewDocument {
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentId: string;
  driverName?: string;
  documentType?: string;
  filename: string;
  url?: string;
  fileUrl?: string;
  uploadedAt?: string;
  reviewStatus: "PENDING" | DocumentReviewStatus;
  reviewReason?: string | null;
}

export const listReviewDocuments = () => trpc.query<ReviewDocument[]>("documents.list");

export function reviewDocument(input: {
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentId: string;
  status: DocumentReviewStatus;
  reason?: string;
}) {
  return trpc.mutation<{ ok: true; reviewStatus: DocumentReviewStatus }>("documents.review", input);
}
