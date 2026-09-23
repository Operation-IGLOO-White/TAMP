import type { Money } from "tamp-backend/src/types";
export { PLACES, type PlaceKey } from "./places";

export const zar = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = (m: Money) =>
  `${zar(m.amount)} ${m.vat === "incl" ? "incl. VAT" : "excl. VAT"}`;
