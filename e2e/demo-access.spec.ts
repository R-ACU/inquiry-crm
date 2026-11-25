import { expect, test } from "@playwright/test";
import { PASSWORD, USERS } from "./helpers";

/**
 * The public demo shows its accounts on the login page (DEMO_LOGIN_*, as on the live deployment).
 * The login page is prerendered, so the values must be set when it is built: e2e/preview.mjs sets
 * them for the dev server, the CI sets them for the build. One click per role signs in through the
 * normal sign-in action; the role decides what the overview shows.
 */

test("the demo-access card shows the password and one row per role", async ({ page }) => {
  await page.goto("/login");
  const card = page.getByRole("region", { name: "Demo-Zugang" });
  await expect(card).toContainText(PASSWORD);
  await expect(card.getByRole("button")).toHaveCount(2);
  await expect(card).toContainText(USERS.owner.email);
  await expect(card).toContainText(USERS.jonas.email);
});

test("one click signs in as the owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Demo als Inhaberin öffnen (Lena Hoffmann)" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Übersicht", exact: true, level: 1 })).toBeVisible();
});

test("one click signs in as staff, who sees only their own figures", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Demo als Mitarbeiter öffnen (Jonas Weber)" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Deine Übersicht", level: 1 })).toBeVisible();
});
