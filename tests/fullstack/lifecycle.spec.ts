import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "Testing-password-123";
const TRIP_ID = "TP-E2E-001";

async function signIn(browser: Browser, role: "owner" | "carrier" | "driver" | "admin") {
  const context = await browser.newContext({
    geolocation: { latitude: -26.2041, longitude: 28.0473 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Email").fill(`e2e-${role}@tamp.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL("/");
  return { context, page };
}

async function sharePosition(page: Page, lat: number, lng: number) {
  const response = await page.request.post(`/api/v1/tracking/trips/${TRIP_ID}/positions`, {
    headers: { "X-TAMP-Request": "1" },
    // Wide test accuracy allows an accelerated Johannesburg journey while the
    // production plausibility check remains active in the real backend.
    data: { lat, lng, accuracyM: 5000, speedKph: 15, heading: 10, recordedAt: new Date().toISOString() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function close(context: BrowserContext) {
  await context.close();
}

test("real backend lifecycle ends in a settled carrier payout", async ({ browser }) => {
  const driverSession = await signIn(browser, "driver");
  const driver = driverSession.page;
  await expect(driver.getByText("LD-E2E-001", { exact: false }).first()).toBeVisible();
  await driver.getByRole("button", { name: "Start trip" }).click();
  await driver.getByRole("button", { name: "Close map" }).click();
  await expect(driver.getByRole("button", { name: "Confirm pickup arrival" })).toBeVisible();

  await sharePosition(driver, -26.2041, 28.0473);
  await driver.reload();
  await driver.getByRole("button", { name: "Confirm pickup arrival" }).click();
  await expect(driver.getByRole("button", { name: "Loaded" })).toBeVisible();
  await driver.getByRole("button", { name: "Loaded" }).click();
  await driver.getByPlaceholder("Full name of pickup contact").fill("E2E Pickup Contact");
  await driver.getByRole("button", { name: "Confirm pickup" }).click();
  await expect(driver.getByRole("button", { name: "In transit" })).toBeVisible();
  await driver.getByRole("button", { name: "In transit" }).click();

  await sharePosition(driver, -26.1467, 28.0419);
  await driver.reload();
  await driver.getByRole("button", { name: "Arrived at drop-off" }).click();
  await expect(driver.getByRole("button", { name: "Delivered" })).toBeVisible();
  await driver.getByRole("button", { name: "Delivered" }).click();
  await driver.getByPlaceholder("Full name of recipient").fill("E2E Recipient");
  await driver.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(driver.getByRole("button", { name: "Complete trip" })).toBeVisible();
  await driver.getByRole("button", { name: "Complete trip" }).click();
  await expect(driver.getByText("Delivered", { exact: true }).first()).toBeVisible();
  await close(driverSession.context);

  const ownerSession = await signIn(browser, "owner");
  await ownerSession.page.goto("/owner/billing");
  await expect(ownerSession.page.getByText("TAMP-", { exact: false }).first()).toBeVisible();
  await expect(ownerSession.page.getByText("R 4 850,00").first()).toBeVisible();
  await close(ownerSession.context);

  const carrierSession = await signIn(browser, "carrier");
  await carrierSession.page.goto("/transporter/earnings");
  await expect(carrierSession.page.getByText("Carrier payout")).toBeVisible();
  await close(carrierSession.context);

  const adminSession = await signIn(browser, "admin");
  const admin = adminSession.page;
  await admin.goto("/admin/finance");
  await admin.getByPlaceholder("External payment reference").fill("E2E-PAYMENT-001");
  await admin.getByRole("button", { name: "Record payment" }).click();
  await expect(admin.getByText("PAID", { exact: true }).first()).toBeVisible();
  await admin.getByPlaceholder("External payment reference").fill("E2E-PAYOUT-001");
  await admin.getByRole("button", { name: "Release carrier payout" }).click();
  await expect(admin.getByText("SETTLED", { exact: true }).first()).toBeVisible();
  await close(adminSession.context);
});
