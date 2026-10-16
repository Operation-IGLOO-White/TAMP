import { expect, test, type Page } from "@playwright/test";

async function mockApi(page: Page, role?: string) {
  const party = role
    ? {
        id: "P-TEST",
        role,
        companyName: "Test Company",
        contactName: "Test User",
        email: "test@example.test",
        phone: "",
        province: "GP",
        verification: "VERIFIED",
        ratingAvg: null,
        ratingCount: 0,
        suspended: false,
        createdAt: "2026-01-01",
        onboardingComplete: true,
      }
    : null;
  const snapshot = {
    parties: party ? [party] : [],
    loads: [],
    trucks: [],
    matches: [],
    trips: [],
    ratings: [],
    disputes: [],
    acceptances: [],
    reservations: [],
    audit: [],
    fuelLogs: [],
    maintenance: [],
    proofs: [],
    incidents: [],
    invoices: [],
    transactions: [],
  };
  await page.route("**/api/v1/system-logs**", (route) =>
    route.fulfill({ json: { groups: [{ name: "modules", files: [] }, { name: "services", files: [] }] } }),
  );
  await page.route("**/api/trpc/**", async (route) => {
    const paths = new URL(route.request().url()).pathname.split("/api/trpc/")[1]!.split(",");
    const result = paths.map((path) => ({
      result: {
        data: {
          json:
            path === "auth.me"
              ? party
              : path === "snapshot.load"
                ? snapshot
                : path === "notifications.unreadCount"
                  ? 0
                  : path === "parties.onboarding"
                    ? null
                    : [],
        },
      },
    }));
    await route.fulfill({ json: result });
  });
}

test("public deep links, query strings, and missing pages render", async ({ page }) => {
  await mockApi(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/register",
    "/forgot-password",
    "/403",
    "/track/LD-123",
    "/does-not-exist",
  ]) {
    await page.goto(path);
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL("/");
  expect(errors).toEqual([]);
});

test("signed-out users are redirected from protected deep links", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin/users/P-TEST");
  await expect(page).toHaveURL("/");
});

const roleRoutes: Record<string, string[]> = {
  FREIGHT_OWNER: [
    "/owner",
    "/owner/board?q=Cape+Town",
    "/owner/history",
    "/owner/billing",
    "/owner/profile",
    "/owner/loads/LD-123",
  ],
  TRANSPORTER: [
    "/transporter",
    "/transporter/fleet",
    "/transporter/fleet-ops",
    "/transporter/history",
    "/transporter/earnings",
    "/transporter/engagements",
    "/transporter/profile",
    "/driver",
  ],
  DRIVER: [
    "/driver",
    "/driver/dashboard",
    "/driver/fleet",
    "/driver/fleet-ops",
    "/driver/history",
    "/transporter/earnings",
    "/driver/engagements",
    "/driver/profile",
  ],
  ADMIN: [
    "/admin",
    "/admin/users",
    "/admin/users/P-TEST",
    "/admin/trucks",
    "/admin/oversight",
    "/admin/finance",
    "/admin/logs",
    "/admin/profile",
    "/notifications",
    "/trucks/TR-123",
  ],
};
for (const [role, paths] of Object.entries(roleRoutes)) {
  test(`${role} routes survive direct loads and refresh`, async ({ page }) => {
    await mockApi(page, role);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main, section.flex-1").first()).toBeVisible();
      await expect(page).toHaveURL(path);
    }
    await page.reload();
    await expect(page.locator("main, section.flex-1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("role guards redirect an owner away from admin pages", async ({ page }) => {
  await mockApi(page, "FREIGHT_OWNER");
  await page.goto("/admin/logs");
  await expect(page).toHaveURL("/owner");
});
