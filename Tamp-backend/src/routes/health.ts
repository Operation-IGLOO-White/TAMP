// GET /api/health — liveness + DB readiness probe for load balancers / uptime
// monitors. Returns 200 when the database answers, 503 otherwise.
import type { Request, Response } from "express";
import { logger } from "../logger";
import { prisma } from "../prisma";

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      db: "up",
      dbLatencyMs: Date.now() - started,
      uptimeSec: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("health_db_down", { message: err instanceof Error ? err.message : String(err) });
    res.status(503).json({ status: "error", db: "down", ts: new Date().toISOString() });
  }
}
