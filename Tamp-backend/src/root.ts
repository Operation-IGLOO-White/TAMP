import { authRouter } from "./routers/auth";
import { commandsRouter } from "./routers/commands";
import { emailRouter } from "./routers/email";
import { geocodeRouter } from "./routers/geocode";
import { loadsRouter } from "./routers/loads";
import { notificationsRouter } from "./routers/notifications";
import { partiesRouter } from "./routers/parties";
import { routesRouter } from "./routers/routes";
import { snapshotRouter } from "./routers/snapshot";
import { webhooksRouter } from "./routers/webhooks";
import { router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  commands: commandsRouter,
  email: emailRouter,
  loads: loadsRouter,
  notifications: notificationsRouter,
  parties: partiesRouter,
  snapshot: snapshotRouter,
  geocode: geocodeRouter,
  routes: routesRouter,
  webhooks: webhooksRouter,
});

export type AppRouter = typeof appRouter;
