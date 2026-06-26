import { test, expect } from "@playwright/test";

// These specs run against a real Supabase project (see README "Testing" section).
// Run `npm run seed` first so the demo accounts below exist.
const TRAVELER_EMAIL = "vinayak.traveler@sahayatri.dev";
const GUIDE_EMAIL = "guide.jaipur@sahayatri.dev";
const DEMO_PASSWORD = "Sahayatri@123";

test.describe("Traveler happy path", () => {
  test("login -> browse real locations -> open a guide profile", async ({ page }) => {
    await page.goto("/auth");

    await page.getByPlaceholder("Email address").fill(TRAVELER_EMAIL);
    await page.getByPlaceholder("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    await page.goto("/explore");
    await expect(page.getByText(/Destinations & Spots/)).toBeVisible({ timeout: 15000 });

    // Real guide-authored listings should render as cards, not the old hardcoded array.
    const firstCard = page.locator("button.flex.flex-col.text-left.group").first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    await firstCard.click();

    await expect(page).toHaveURL(/\/location\//);
    await expect(page.getByText("Hosted by").first()).toBeVisible();
  });
});

test.describe("Guide happy path", () => {
  test("login -> see dashboard with real booking stats", async ({ page }) => {
    await page.goto("/guide-auth");

    await page.getByPlaceholder("Email address").fill(GUIDE_EMAIL);
    await page.getByPlaceholder("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign In as Guide" }).click();

    await expect(page).toHaveURL(/\/guide-dashboard/, { timeout: 15000 });
    await expect(page.getByText("Manage My Locations")).toBeVisible();
  });
});
