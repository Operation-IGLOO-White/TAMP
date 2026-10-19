import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { TripMessage } from "@/types/domain";

test.skip(process.env["PLAYWRIGHT_TWO_VIEW"] !== "1", "Run with npm run test:e2e:two-view");
test.setTimeout(240_000);

const wait = (page: Page, ms = 3500) => page.waitForTimeout(ms);
const baseParty = { email: "demo@tamp.local", phone: "+27 82 555 0101", province: "GP", verification: "VERIFIED", ratingAvg: 4.8, ratingCount: 31, suspended: false, createdAt: "2026-01-01", onboardingComplete: true };
const owner = { ...baseParty, id: "P-OWNER-DUAL", role: "FREIGHT_OWNER", companyName: "Ubuntu Produce", contactName: "Thabo Nkosi" };
const carrier = { ...baseParty, id: "P-CARRIER-DUAL", role: "TRANSPORTER", companyName: "RoadLink Logistics", contactName: "Naledi Mokoena" };
const driver = { ...baseParty, id: "P-DRIVER-DUAL", role: "DRIVER", companyName: "RoadLink Logistics", contactName: "Lerato Dlamini" };
const load = { id: "LD-DUAL-101", ownerId: owner.id, reference: "LD-DUAL-101", cargoType: "GENERAL_PALLETISED", weightKg: 24000, volumeM3: 54, requiredBodyTypes: ["TAUTLINER"], origin: { label: "Johannesburg Market", province: "GP", lat: -26.226, lng: 28.028 }, destination: { label: "Durban Distribution Hub", province: "KZN", lat: -29.8587, lng: 31.0218 }, distanceKm: 570, pickupWindow: { from: "2026-10-20T06:00:00+02:00", to: "2026-10-20T09:00:00+02:00" }, deliveryBy: "2026-10-21T15:00:00+02:00", targetRate: { amount: 14850, currency: "ZAR", vat: "incl" }, status: "POSTED", createdAt: "2026-10-19T09:00:00+02:00" };
const truck = { id: "TR-DUAL-22", transporterId: carrier.id, driverId: driver.id, registration: "RL 22 TAMP GP", bodyType: "TAUTLINER", payloadCapacityKg: 30000, volumeCapacityM3: 70, currentLocation: { label: "Germiston Depot", province: "GP", lat: -26.2259, lng: 28.1708 }, availableFrom: "2026-10-20T05:00:00+02:00", availableTo: "2026-10-25T18:00:00+02:00", status: "AVAILABLE", createdAt: "2026-10-19T09:10:00+02:00", photos: [], documents: [] };
const match = { id: "MT-DUAL-94", loadId: load.id, truckPostingId: truck.id, score: 94, breakdown: [{ ruleId: "R-PROXIMITY", label: "Near pickup", weight: 30, earned: 29, detail: "18 km from pickup" }], hardFilterResults: [{ ruleId: "R-CAPACITY", label: "Capacity", passed: true, detail: "Capacity verified" }], status: "SUGGESTED", initiatedBy: "SYSTEM", expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-19T09:11:00+02:00" };
const trip = { id: "TP-DUAL-58", matchId: match.id, status: "SCHEDULED", progressPct: 0, etaAt: null, simulatedPosition: null, events: [{ status: "SCHEDULED", at: "2026-10-19T09:20:00+02:00", byUserId: carrier.id }] };
const conversation = { id: "CV-DUAL-1", tripId: trip.id, loadId: load.id, ownerId: owner.id, carrierId: carrier.id, driverId: driver.id, createdAt: "2026-10-19T09:20:00+02:00", lastMessageAt: "2026-10-19T09:20:00+02:00", lastMessage: "Engagement confirmed. Trip scheduled.", unreadCount: 0 };
const route = { geometry: { type: "LineString", coordinates: [[28.028, -26.226], [29.2, -27.1], [31.0218, -29.8587]] }, distanceKm: 570, durationMin: 430, provider: "valhalla", routeToken: "dual-route-token", expiresAt: "2027-01-01T00:00:00Z" };
const offer = { id: "OF-DUAL-1", matchId: match.id, routeQuoteId: "RQ-DUAL-1", revision: 1, termsHash: "b".repeat(64), status: "OPEN", createdAt: "2026-10-19T09:12:00Z", expiresAt: "2027-01-01T00:00:00Z", routeQuote: { id: "RQ-DUAL-1", deadhead: { ...route, distanceKm: 18, durationMin: 25 }, journey: route } };
const empty = { ratings: [], disputes: [], acceptances: [], reservations: [], audit: [], fuelLogs: [], maintenance: [], proofs: [], incidents: [], invoices: [], transactions: [], dispatches: [] };

test("owner and carrier complete a slow two-window handoff", async () => {
  let leftBrowser: Browser | undefined;
  let rightBrowser: Browser | undefined;
  let phase: "suggested" | "accepted" | "confirmed" = "suggested";
  const chat: TripMessage[] = [{ id: "MS-SYSTEM", conversationId: conversation.id, senderId: null, senderRole: "SYSTEM", kind: "SYSTEM", text: "Engagement confirmed. Trip scheduled.", createdAt: "2026-10-19T09:20:00+02:00", readBy: [] }];
  const snapshot = () => ({ ...empty, parties: [owner, carrier, driver], loads: [{ ...load, status: phase === "suggested" ? "POSTED" : phase === "accepted" ? "MATCHED" : "CONFIRMED" }], trucks: [{ ...truck, status: phase === "suggested" ? "AVAILABLE" : phase === "accepted" ? "RESERVED" : "ON_TRIP" }], matches: [{ ...match, status: phase === "suggested" ? "SUGGESTED" : phase === "accepted" ? "ACCEPTED" : "CONFIRMED" }], trips: phase === "confirmed" ? [trip] : [] });

  const installApi = async (page: Page, actor: typeof owner | typeof carrier) => {
    await page.addInitScript(() => { class QuietSocket { readyState = 1; onmessage = null; close() {} send() {} } Object.defineProperty(window, "WebSocket", { value: QuietSocket }); });
    await page.route("**/api/trpc/**", async (routeCall) => {
      const names = new URL(routeCall.request().url()).pathname.split("/api/trpc/")[1]!.split(",");
      const responses = names.map((name) => {
        let json: unknown = [];
        if (name === "auth.me") json = actor;
        else if (name === "snapshot.load") json = snapshot();
        else if (name === "notifications.unreadCount") json = 0;
        else if (name === "matching.score") json = [{ truck, operator: carrier, score: 94, breakdown: match.breakdown, hardFilterResults: match.hardFilterResults, passed: true }];
        else if (name === "routes.compute") json = route;
        else if (name === "commands.prepareOffer") json = offer;
        else if (name === "commands.acceptMatch") { phase = "accepted"; json = { ok: true }; }
        else if (name === "commands.confirmMatch") { phase = "confirmed"; json = { ok: true, tripId: trip.id }; }
        else if (name === "messages.conversations") json = phase === "confirmed" ? [{ ...conversation, unreadCount: actor.id === carrier.id ? chat.filter((item) => item.senderId === owner.id).length : 0, lastMessage: chat.at(-1)?.text }] : [];
        else if (name === "messages.list") json = chat;
        else if (name === "messages.markRead") json = { updated: chat.length };
        else if (name === "messages.send") { const message = { id: `MS-${chat.length}`, conversationId: conversation.id, senderId: actor.id, senderRole: actor.role, kind: "USER", text: "Pickup team is ready at gate 3.", createdAt: new Date().toISOString(), readBy: [actor.id] }; chat.push(message); json = message; }
        else if (name === "snapshot.sync") json = { ok: true };
        return { result: { data: { json } } };
      });
      await routeCall.fulfill({ json: responses });
    });
  };

  try {
    leftBrowser = await chromium.launch({ headless: false, slowMo: 600, args: ["--window-position=0,0", "--window-size=940,980"] });
    rightBrowser = await chromium.launch({ headless: false, slowMo: 600, args: ["--window-position=950,0", "--window-size=940,980"] });
    const ownerPage = await (await leftBrowser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
    const carrierPage = await (await rightBrowser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
    ownerPage.setDefaultTimeout(15_000);
    carrierPage.setDefaultTimeout(15_000);
    await installApi(ownerPage, owner);
    await installApi(carrierPage, carrier);

    console.log("[two-view] Opening the owner board and carrier engagements");
    await Promise.all([ownerPage.goto("http://127.0.0.1:4173/owner/board", { waitUntil: "domcontentloaded" }), carrierPage.goto("http://127.0.0.1:4173/transporter/engagements", { waitUntil: "domcontentloaded" })]);
    await expect(ownerPage.getByText("LD-DUAL-101", { exact: false }).first()).toBeVisible();
    await wait(ownerPage);

    await ownerPage.getByRole("button", { name: "Accept match" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Review route and terms" })).toBeVisible();
    await wait(ownerPage, 5000);
    console.log("[two-view] Freight owner accepts the proposed match");
    await ownerPage.getByRole("dialog").getByRole("checkbox").evaluate((checkbox: HTMLInputElement) => checkbox.click());
    await ownerPage.getByRole("dialog").getByRole("button", { name: "Accept match" }).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => phase).toBe("accepted");
    await carrierPage.reload({ waitUntil: "domcontentloaded" });
    await expect(carrierPage.getByText("Awaiting your confirmation")).toBeVisible();
    await wait(carrierPage, 5000);
    console.log("[two-view] Truck owner reviews and confirms the engagement");

    await carrierPage.getByRole("button", { name: "Confirm engagement" }).first().evaluate((button: HTMLButtonElement) => button.click());
    await expect(carrierPage.getByRole("dialog")).toBeVisible();
    await wait(carrierPage, 5000);
    await carrierPage.getByRole("dialog").getByRole("checkbox").evaluate((checkbox: HTMLInputElement) => checkbox.click());
    await carrierPage.getByRole("dialog").getByRole("button", { name: "Confirm engagement" }).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => phase).toBe("confirmed");
    await ownerPage.reload({ waitUntil: "domcontentloaded" });
    await wait(ownerPage, 4000);

    console.log("[two-view] Both parties open their shared trip conversation");
    await Promise.all([ownerPage.goto("http://127.0.0.1:4173/messages", { waitUntil: "domcontentloaded" }), carrierPage.goto("http://127.0.0.1:4173/messages", { waitUntil: "domcontentloaded" })]);
    await expect(ownerPage.getByPlaceholder("Message this trip…")).toBeVisible();
    const ownerMessage = ownerPage.getByPlaceholder("Message this trip…");
    await ownerMessage.fill("Pickup team is ready at gate 3.");
    await wait(ownerPage, 3000);
    await ownerMessage.press("Enter");
    console.log("[two-view] Freight owner sends the pickup instruction");
    await carrierPage.reload({ waitUntil: "domcontentloaded" });
    await expect(carrierPage.getByText("Pickup team is ready at gate 3.").last()).toBeVisible();
    await wait(carrierPage, 8000);
    console.log("[two-view] Complete: the carrier received the message");
  } finally {
    await leftBrowser?.close();
    await rightBrowser?.close();
  }
});
