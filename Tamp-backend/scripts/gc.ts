// Delete expired sessions and verification/reset/change codes. Run on a schedule
// (e.g. cron: `*/30 * * * * npm run db:gc`).
import { gcExpired } from "../src/server/auth";
import { prisma } from "../src/server/prisma";

async function main() {
  await gcExpired();
  console.log(`[gc] cleaned expired sessions/codes at ${new Date().toISOString()}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("[gc] failed", e);
  process.exit(1);
});
