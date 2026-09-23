// Standalone backend entrypoint: Express app serving tRPC + the small set of
// plain REST endpoints (health, file upload/serve, Google OAuth), plus the
// in-process background scheduler. Replaces the old Next.js route handlers +
// `instrumentation.ts` hook now that this runs as its own process.
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import { partyFromCookie } from "./auth";
import { filesHandler } from "./routes/files";
import { googleAuthHandler } from "./routes/googleAuth";
import { googleCallbackHandler } from "./routes/googleCallback";
import { healthHandler } from "./routes/health";
import { uploadMiddleware, uploadsHandler } from "./routes/uploads";
import { appRouter } from "./root";
import { startScheduler } from "./scheduler";
import type { Context } from "./trpc";

const FRONTEND_URL = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
const PORT = Number(process.env["PORT"] ?? 4000);

const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

app.get("/api/health", healthHandler);
app.post("/api/uploads", uploadMiddleware, uploadsHandler);
app.get("/api/files/:id", filesHandler);
app.get("/api/auth/google", googleAuthHandler);
app.get("/api/auth/google/callback", googleCallbackHandler);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: async ({ req, res }): Promise<Context> => {
      const cookieHeader = req.headers["cookie"] ?? null;
      const ip =
        (typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
          : req.headers["x-forwarded-for"]?.[0]) ||
        req.headers["x-real-ip"] ||
        req.socket.remoteAddress ||
        null;
      return {
        cookieHeader,
        resHeaders: res,
        ip: typeof ip === "string" ? ip : null,
        partyId: await partyFromCookie(cookieHeader),
      };
    },
  }),
);

if (process.env["TAMP_DISABLE_SCHEDULER"] !== "1") {
  startScheduler();
}

app.listen(PORT, () => {
  console.log(`[tamp-backend] listening on :${PORT}`);
});
