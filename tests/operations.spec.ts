import { expect, test, type Page } from "@playwright/test";

const demoPause = (page: Page) => process.env["PLAYWRIGHT_DEMO"] === "1" ? page.waitForTimeout(2500) : Promise.resolve();

const driver = {
  id: "P-DRIVER-DEMO", role: "DRIVER", companyName: "TAMP Logistics", contactName: "Lerato Dlamini",
  email: "driver@example.test", phone: "+27 82 000 0000", province: "GP", verification: "VERIFIED",
  ratingAvg: 4.8, ratingCount: 42, suspended: false, createdAt: "2026-01-01", onboardingComplete: true,
};
const owner = { ...driver, id: "P-OWNER-DEMO", role: "FREIGHT_OWNER", companyName: "Ubuntu Foods", contactName: "Thabo Nkosi" };
const carrier = { ...driver, id: "P-CARRIER-DEMO", role: "TRANSPORTER", companyName: "TAMP Logistics", contactName: "Naledi Mokoena" };
const load = {
  id: "LD-DEMO-101", ownerId: owner.id, reference: "LD-DEMO-101", cargoType: "GENERAL_PALLETISED",
  weightKg: 12000, requiredBodyTypes: ["TAUTLINER"],
  origin: { label: "Johannesburg Distribution Centre", province: "GP", lat: -26.2041, lng: 28.0473 },
  destination: { label: "Pretoria Retail Hub", province: "GP", lat: -25.7479, lng: 28.2293 },
  distanceKm: 64, pickupWindow: { from: "2026-10-15T06:00:00+02:00", to: "2026-10-15T09:00:00+02:00" },
  deliveryBy: "2026-10-15T14:00:00+02:00", targetRate: { amount: 4850, currency: "ZAR", vat: "incl" },
  status: "IN_TRANSIT", createdAt: "2026-10-14T08:00:00+02:00",
};
const truck = {
  id: "TR-DEMO-12", transporterId: carrier.id, driverId: driver.id, registration: "GP 12 TAMP",
  bodyType: "TAUTLINER", payloadCapacityKg: 18000, currentLocation: load.origin,
  availableFrom: "2026-10-15T05:00:00+02:00", availableTo: "2026-10-16T18:00:00+02:00",
  status: "ON_TRIP", createdAt: "2026-01-01",
};
const match = {
  id: "MT-DEMO-45", loadId: load.id, truckPostingId: truck.id, score: 94, breakdown: [], hardFilterResults: [],
  status: "CONFIRMED", initiatedBy: "SYSTEM", expiresAt: "2027-01-01", createdAt: "2026-10-14",
};
const trip = {
  id: "TP-DEMO-58", matchId: match.id, status: "IN_TRANSIT", progressPct: 62,
  etaAt: "2026-10-15T12:40:00+02:00", simulatedPosition: null,
  events: [
    { status: "SCHEDULED", at: "2026-10-15T06:30:00+02:00", byUserId: carrier.id },
    { status: "EN_ROUTE_PICKUP", at: "2026-10-15T07:00:00+02:00", byUserId: driver.id },
    { status: "AT_PICKUP", at: "2026-10-15T07:35:00+02:00", byUserId: driver.id },
    { status: "LOADED", at: "2026-10-15T08:05:00+02:00", byUserId: driver.id },
    { status: "IN_TRANSIT", at: "2026-10-15T08:15:00+02:00", byUserId: driver.id },
  ],
  geofences: { PICKUP: { inside: false, exitedAt: "2026-10-15T08:12:00+02:00" }, DESTINATION: { inside: false, distanceM: 25100 } },
};

async function mockOperationalApi(page: Page) {
  const snapshot = {
    parties: [driver, owner, carrier], loads: [load], trucks: [truck], matches: [match], trips: [trip],
    ratings: [], disputes: [], acceptances: [], reservations: [], audit: [], fuelLogs: [], maintenance: [], proofs: [], incidents: [],
  };
  await page.route("**/api/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname.split("/api/trpc/")[1]!.split(",");
    const responses = names.map((name) => ({ result: { data: { json:
      name === "auth.me" ? driver :
      name === "snapshot.load" ? snapshot :
      name === "notifications.unreadCount" ? 0 :
      name === "commands.reportIncident" || name === "commands.cancelTrip" ? { ok: true, incidentId: "IN-DEMO" } : []
    } } }));
    await route.fulfill({ json: responses });
  });
}

test("driver can inspect an active trip and open operational workflows", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:4173" });
  await context.setGeolocation({ latitude: -26.05, longitude: 28.11 });
  await mockOperationalApi(page);
  await page.goto("/driver");
  await expect(page.getByText("LD-DEMO-101", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/GPS (live|blocked|error)|Starting GPS/)).toBeVisible();
  await expect(page.getByText("In transit", { exact: true }).first()).toBeVisible();
  await demoPause(page);

  await page.screenshot({ path: "test-results/driver-active-trip.png", fullPage: true });
  await page.getByRole("button", { name: /Report an issue/i }).click();
  await expect(page.getByRole("heading", { name: "Report operational issue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Breakdown" })).toBeVisible();
  await page.getByRole("button", { name: "Breakdown" }).click();
  await page.getByLabel("Details").fill("Engine temperature warning requires roadside assistance.");
  await demoPause(page);
  await page.screenshot({ path: "test-results/driver-incident-dialog.png", fullPage: true });

  await page.getByRole("button", { name: "Cancel this trip" }).click();
  await expect(page.getByRole("heading", { name: "Cancel trip" })).toBeVisible();
  await expect(page.getByText(/After cargo is loaded/)).toBeVisible();
  await demoPause(page);
  await page.screenshot({ path: "test-results/driver-cancellation-dialog.png", fullPage: true });
});
