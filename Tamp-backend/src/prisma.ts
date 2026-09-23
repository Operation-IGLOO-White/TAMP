// Server-only Prisma client. A single instance is reused across HMR reloads in
// dev to avoid exhausting Postgres connections.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __tampPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__tampPrisma ??
  new PrismaClient({
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") globalForPrisma.__tampPrisma = prisma;
