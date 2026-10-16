import { expect, test, type Page } from "@playwright/test";

const pause = (page: Page, ms = 2200) => process.env["PLAYWRIGHT_DEMO"] === "1" ? page.waitForTimeout(ms) : Promise.resolve();
const baseParty = { email: "demo@tamp.local", phone: "+27 82 555 0101", province: "GP", verification: "VERIFIED", ratingAvg: 4.8, ratingCount: 31, suspended: false, createdAt: "2026-01-01", onboardingComplete: true };
const owner = { ...baseParty, id: "P-OWNER-FLOW", role: "FREIGHT_OWNER", companyName: "Ubuntu Produce", contactName: "Thabo Nkosi" };
const carrier = { ...baseParty, id: "P-CARRIER-FLOW", role: "TRANSPORTER", companyName: "RoadLink Logistics", contactName: "Naledi Mokoena" };
const driver = { ...baseParty, id: "P-DRIVER-FLOW", role: "DRIVER", companyName: "RoadLink Logistics", contactName: "Lerato Dlamini" };
const admin = { ...baseParty, id: "P-ADMIN-FLOW", role: "ADMIN", companyName: "TAMP", contactName: "Platform Admin" };
const load = { id: "LD-FLOW-101", ownerId: owner.id, reference: "LD-FLOW-101", cargoType: "GENERAL_PALLETISED", weightKg: 24000, volumeM3: 54, requiredBodyTypes: ["TAUTLINER"], origin: { label: "Johannesburg Fresh Produce Market", province: "GP", lat: -26.226, lng: 28.028 }, destination: { label: "Durban Distribution Hub", province: "KZN", lat: -29.8587, lng: 31.0218 }, distanceKm: 570, pickupWindow: { from: "2026-10-18T06:00:00+02:00", to: "2026-10-18T09:00:00+02:00" }, deliveryBy: "2026-10-19T15:00:00+02:00", targetRate: { amount: 14850, currency: "ZAR", vat: "incl" }, status: "POSTED", createdAt: "2026-10-15T09:00:00+02:00" };
const truck = { id: "TR-FLOW-22", transporterId: carrier.id, driverId: driver.id, registration: "RL 22 TAMP GP", bodyType: "TAUTLINER", payloadCapacityKg: 30000, volumeCapacityM3: 70, currentLocation: { label: "Germiston Depot", province: "GP", lat: -26.2259, lng: 28.1708 }, availableFrom: "2026-10-17T05:00:00+02:00", availableTo: "2026-10-24T18:00:00+02:00", status: "AVAILABLE", createdAt: "2026-10-15T09:10:00+02:00", photos: ["front.jpg", "left.jpg", "right.jpg", "rear.jpg"], documents: ["licence.pdf", "roadworthy.pdf", "insurance.pdf"] };
const match = { id: "MT-FLOW-94", loadId: load.id, truckPostingId: truck.id, score: 94, breakdown: [{ ruleId: "R-PROXIMITY", label: "Near pickup", weight: 30, earned: 29, detail: "18 km from pickup" }], hardFilterResults: [{ ruleId: "R-CAPACITY", label: "Capacity", passed: true, detail: "30t truck carries 24t load" }], status: "SUGGESTED", initiatedBy: "SYSTEM", expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-15T09:11:00+02:00" };
const trip = { id: "TP-FLOW-58", matchId: match.id, status: "SCHEDULED", progressPct: 0, etaAt: "2026-10-19T12:30:00+02:00", simulatedPosition: null, events: [{ status: "SCHEDULED", at: "2026-10-15T09:20:00+02:00", byUserId: carrier.id }], geofences: { PICKUP: { inside: false, distanceM: 18000 }, DESTINATION: { inside: false, distanceM: 570000 } } };
const empty = { ratings: [], disputes: [], acceptances: [], reservations: [], audit: [], fuelLogs: [], maintenance: [], proofs: [], incidents: [], invoices: [], transactions: [] };

test("visible two-party marketplace journey through live movement", async ({ page, context }) => {
  let actor: any = owner;
  let phase: "empty" | "matched" | "accepted" | "confirmed" | "completed" = "empty";
  let invoiceStatus: "ISSUED" | "PAID" | "SETTLED" = "ISSUED";
  const invoice = { id: "IV-FLOW-58", invoiceNumber: "TAMP-20261019-LOW58", tripId: trip.id, loadId: load.id, matchId: match.id, ownerId: owner.id, carrierId: carrier.id, currency: "ZAR", subtotal: 12913.04, vatRate: 0.15, vatAmount: 1936.96, total: 14850, platformFeeRate: 0.10, platformFee: 1291.30, carrierPayout: 13558.70, status: invoiceStatus, payoutStatus: "PENDING", issuedAt: "2026-10-19T14:00:00+02:00", dueAt: "2026-10-26T14:00:00+02:00", paidAt: null, paidOutAt: null, lineItems: [{ description: "Freight service Johannesburg to Durban", quantity: 1, unitAmount: 12913.04, amount: 12913.04 }] };
  const snapshot = () => ({ ...empty, parties: [owner, carrier, driver, admin], loads: phase === "empty" ? [] : [{ ...load, status: phase === "matched" ? "POSTED" : phase === "accepted" ? "MATCHED" : phase === "completed" ? "COMPLETED" : "CONFIRMED" }], trucks: phase === "empty" ? [] : [{ ...truck, status: phase === "completed" ? "AVAILABLE" : phase === "confirmed" ? "ON_TRIP" : phase === "accepted" ? "RESERVED" : "AVAILABLE" }], matches: phase === "empty" ? [] : [{ ...match, status: phase === "matched" ? "SUGGESTED" : phase === "accepted" ? "ACCEPTED" : "CONFIRMED" }], trips: phase === "confirmed" || phase === "completed" ? [trip] : [], invoices: phase === "completed" ? [{ ...invoice, status: invoiceStatus, payoutStatus: invoiceStatus === "SETTLED" ? "PAID" : "PENDING" }] : [] });
  const route = { geometry: { type: "LineString", coordinates: [[28.028, -26.226], [29.2, -27.1], [30.1, -28.3], [31.0218, -29.8587]] }, distanceKm: 570, durationMin: 430, provider: "valhalla", routeToken: "demo-route-token", expiresAt: "2027-01-01T00:00:00Z" };
  const offer = { id: "OF-FLOW-1", matchId: match.id, routeQuoteId: "RQ-FLOW-1", revision: 1, termsHash: "a".repeat(64), status: "OPEN", createdAt: "2026-10-15T09:12:00Z", expiresAt: "2027-01-01T00:00:00Z", routeQuote: { id: "RQ-FLOW-1", deadhead: { ...route, distanceKm: 18, durationMin: 25 }, journey: route } };

  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:4173" });
  await context.setGeolocation({ latitude: -26.226, longitude: 28.028 });
  await page.addInitScript(() => {
    const points = [[28.18, -26.2], [28.75, -26.7], [29.45, -27.35], [30.15, -28.15], [30.72, -29.05]];
    class DemoWebSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      private timers: number[] = [];
      constructor(_url: string) {
        this.timers.push(window.setTimeout(() => { this.readyState = 1; this.onopen?.(new Event("open")); }, 200));
        points.forEach(([lng, lat], index) => this.timers.push(window.setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "position", position: { tripId: "TP-FLOW-58", truckId: "TR-FLOW-22", lat, lng, speedKph: 78, heading: 132, recordedAt: new Date().toISOString() } }) })), 900 + index * 1200)));
      }
      send() {}
      close() { this.timers.forEach(window.clearTimeout); this.readyState = 3; }
    }
    Object.defineProperty(window, "WebSocket", { value: DemoWebSocket, configurable: true });
  });
  await page.route("**/api/trpc/**", async (request) => {
    const names = new URL(request.request().url()).pathname.split("/api/trpc/")[1]!.split(",");
    const response = names.map((name) => {
      let json: any = [];
      if (name === "auth.me") json = actor;
      else if (name === "snapshot.load") json = snapshot();
      else if (name === "notifications.unreadCount") json = 0;
      else if (name === "matching.bodyTypesForCargo") json = ["TAUTLINER"];
      else if (name === "matching.roadDistanceKm") json = 570;
      else if (name === "pricing.quote") json = { amount: 14850, perKm: 26.05, distanceKm: 570, components: [{ label: "Transport", amount: 14850 }] };
      else if (name === "pricing.quoteMoney") json = { amount: 14850, currency: "ZAR", vat: "incl" };
      else if (name === "matching.score") json = [{ truck, operator: carrier, score: 94, breakdown: match.breakdown, hardFilterResults: match.hardFilterResults, passed: true }];
      else if (name === "routes.compute") json = route;
      else if (name === "commands.prepareOffer") json = offer;
      else if (name === "commands.acceptMatch") { phase = "accepted"; json = { ok: true }; }
      else if (name === "commands.confirmMatch") { phase = "confirmed"; json = { ok: true, tripId: trip.id }; }
      else if (name === "commands.advanceTrip") { trip.status = "EN_ROUTE_PICKUP"; trip.progressPct = 14; trip.events.push({ status: "EN_ROUTE_PICKUP", at: new Date().toISOString(), byUserId: driver.id }); json = { ok: true, status: trip.status, progressPct: 14 }; }
      else if (name === "finance.invoiceAction") { invoiceStatus = invoiceStatus === "ISSUED" ? "PAID" : "SETTLED"; json = { ok: true, invoice: { ...invoice, status: invoiceStatus }, transaction: { id: `TX-${invoiceStatus}`, invoiceId: invoice.id, type: invoiceStatus === "PAID" ? "PAYMENT" : "PAYOUT", amount: invoiceStatus === "PAID" ? invoice.total : invoice.carrierPayout, currency: "ZAR", status: "SUCCEEDED", reference: "BANK-DEMO-2026", createdAt: new Date().toISOString(), recordedById: admin.id } }; }
      else if (name === "snapshot.sync") json = { ok: true };
      return { result: { data: { json } } };
    });
    await request.fulfill({ json: response });
  });
  await page.route("**/api/v1/tracking/**", (r) => r.fulfill({ json: { tripId: trip.id, truckId: truck.id, lat: -26.1, lng: 28.2, recordedAt: new Date().toISOString() } }));

  await page.goto("/owner/board");
  await page.getByRole("button", { name: /Post New Load/i }).click();
  await expect(page.getByText("Platform quote (auto)")).toBeVisible();
  await page.getByLabel("Special requirements (optional)").fill("Refrigerated handling area and signed delivery receipt");
  await pause(page);
  phase = "matched";
  await page.reload();
  await expect(page.getByText("LD-FLOW-101", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("94").first()).toBeVisible();
  await pause(page);

  actor = carrier;
  await page.goto("/transporter/fleet");
  await page.getByRole("button", { name: /Add truck/i }).click();
  await page.getByRole("textbox", { name: "Registration", exact: true }).fill("RL 22 TAMP GP");
  await expect(page.getByRole("button", { name: "Register truck" })).toBeVisible();
  await pause(page);

  actor = owner;
  await page.goto("/owner/board");
  await page.getByRole("button", { name: "Accept match" }).click();
  await expect(page.getByRole("heading", { name: "Review route and terms" })).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").evaluate((input: HTMLElement) => input.click());
  await pause(page);
  await page.getByRole("dialog").getByRole("button", { name: "Accept match" }).evaluate((button: HTMLElement) => button.click());
  await expect.poll(() => phase).toBe("accepted");

  actor = carrier;
  await page.goto("/transporter/engagements");
  await expect(page.getByText("Awaiting your confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm engagement" }).first().evaluate((button: HTMLElement) => button.click());
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").evaluate((input: HTMLElement) => input.click());
  await pause(page);
  await page.getByRole("dialog").getByRole("button", { name: "Confirm engagement" }).evaluate((button: HTMLElement) => button.click());
  await expect.poll(() => phase).toBe("confirmed");

  actor = driver;
  await page.goto("/driver");
  await expect(page.getByRole("button", { name: /Start trip/i })).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: /Start trip/i }).click();
  await expect(page.getByText("Navigation").first()).toBeVisible();
  await pause(page, 7000);

  // Finish the journey and demonstrate the generated commercial settlement.
  phase = "completed";
  trip.status = "COMPLETED";
  trip.progressPct = 100;
  actor = owner;
  await page.goto("/owner/billing");
  await expect(page.getByRole("heading", { name: invoice.invoiceNumber })).toBeVisible();
  await expect(page.getByText("R 14 850,00").first()).toBeVisible();
  await pause(page);

  actor = carrier;
  await page.goto("/transporter/earnings");
  await expect(page.getByText("Carrier payout")).toBeVisible();
  await expect(page.getByText("R 13 558,70").first()).toBeVisible();
  await pause(page);

  actor = admin;
  await page.goto("/admin/finance");
  await page.getByPlaceholder("External payment reference").fill("BANK-DEMO-2026");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("PAID", { exact: true }).first()).toBeVisible();
  await pause(page);
  await page.getByPlaceholder("External payment reference").fill("PAYOUT-DEMO-2026");
  await page.getByRole("button", { name: "Release carrier payout" }).click();
  await expect(page.getByText("SETTLED", { exact: true }).first()).toBeVisible();
  await pause(page);
});
