import { authRouter } from "./routers/auth";
import { commandsRouter } from "./routers/commands";
import { emailRouter } from "./routers/email";
import { geocodeRouter } from "./routers/geocode";
import { loadsRouter } from "./routers/loads";
import { matchingRouter } from "./routers/matching";
import { notificationsRouter } from "./routers/notifications";
import { partiesRouter } from "./routers/parties";
import { phoneRouter } from "./routers/phone";
import { pricingRouter } from "./routers/pricing";
import { routesRouter } from "./routers/routes";
import { snapshotRouter } from "./routers/snapshot";
import { webhooksRouter } from "./routers/webhooks";
import { router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  email: emailRouter,
  loads: loadsRouter,
  matching: matchingRouter,
  notifications: notificationsRouter,
  parties: partiesRouter,
  phone: phoneRouter,
  pricing: pricingRouter,
  snapshot: snapshotRouter,
  geocode: geocodeRouter,
  routes: routesRouter,
  webhooks: webhooksRouter,
});

export type AppRouter = typeof appRouter;
