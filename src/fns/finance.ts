import { trpc } from "@/lib/trpc";
import type { FinancialTransaction, Invoice } from "@/types/domain";

export type InvoiceAction = "RECORD_PAYMENT" | "RELEASE_PAYOUT" | "VOID";

export const runInvoiceAction = (invoiceId: string, action: InvoiceAction, reference: string, note?: string) =>
  trpc.mutation<{ ok: true; invoice: Invoice; transaction: FinancialTransaction }>("finance.invoiceAction", {
    invoiceId,
    action,
    reference,
    note,
  });
