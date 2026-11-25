import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Lindgruen-Demo-2026";

export const USERS = {
  owner: { email: "lena@lindgruen.example", name: "Lena Hoffmann" },
  jonas: { email: "jonas@lindgruen.example", name: "Jonas Weber" },
  mira: { email: "mira@lindgruen.example", name: "Mira Schulz" },
} as const;

export const INQUIRY = {
  ofJonas: "e0000000-0000-4000-8000-000000000001",
  ofMira: "e0000000-0000-4000-8000-000000000002",
  wedding: "e0000000-0000-4000-8000-000000000006",
  unassigned: "e0000000-0000-4000-8000-000000000025",
  /** Web form inquiry whose e-mail matched an existing contact (seed). */
  matchedByEmail: "e0000000-0000-4000-8000-000000000026",
} as const;

export async function signIn(page: Page, user: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(USERS[user].email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Übersicht", level: 1 })).toBeVisible();
}

/** Signs in and opens the pipeline board. */
export async function signInToBoard(page: Page, user: keyof typeof USERS) {
  await signIn(page, user);
  await page.goto("/inquiries");
  await expect(page.getByRole("heading", { name: "Anfragen", level: 1 })).toBeVisible();
}
