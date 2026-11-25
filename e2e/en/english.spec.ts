/**
 * The English demo (APP_LOCALE=en, workspace "en"), run with `npm run test:e2e:en`. Every main
 * view, menu and dialog is read in full (visible text, accessible names, tooltips, placeholders,
 * the page title) and must not contain a German word; the data must be the English business's.
 * The stand-in holds the German demo too, so these tests also see that it stays out of reach.
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const PASSWORD = "Larkspur-Demo-2026";
const OWNER = { email: "niamh@larkspur.example", name: "Niamh Byrne" };
const STAFF = { email: "conor@larkspur.example", name: "Conor Walsh" };
const INQUIRY = {
  ofConor: "e1000000-0000-4000-8000-000000000001",
  matchedByEmail: "e1000000-0000-4000-8000-000000000026",
  /** An inquiry of the German demo in the same database. */
  german: "e0000000-0000-4000-8000-000000000001",
};

/** Typical German words and letters. One match in an English page means a text was missed. */
const GERMAN =
  /[äöüÄÖÜß]|\b(und|der|die|das|den|dem|nicht|kein|keine|mit|für|zur|zum|vom|bis|oder|noch|auch|Uhr|Gäste|Personen|Anfrage|Anfragen|Übersicht|Kontakt|Kontakte|Notiz|Verlauf|Entwurf|Rückfragen|Zusammenfassung|Datum|offen|heute|gestern|Neu|Angebot|Gewonnen|Verloren|Inhaber|Inhaberin|Mitarbeiter|Zugesagt|Deine|Dein|Abmelden|Anmelden|Passwort|Suche|Suchen|Einstellungen|Tastenkürzel|Schließen|Speichern|Zurück|Termin|Termine|Woche|Tage|Firmenfeier|Hochzeit|Tagung|Sonstiges|Webformular|Manuell|Lindgrün)\b/;
/** People and businesses of the German demo. */
const GERMAN_DATA = /Lindgrün|Lena Hoffmann|Jonas Weber|Mira Schulz|Nordlicht|Speicherstadt/;

/** Everything a person can read or hear on the page right now. */
async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [document.title];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, template")) continue;
      if (node.textContent?.trim()) parts.push(node.textContent.trim());
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt], [aria-description], [aria-roledescription]")) {
      for (const name of ["aria-label", "title", "placeholder", "alt", "aria-description", "aria-roledescription"]) {
        const value = el.getAttribute(name);
        if (value) parts.push(value);
      }
    }
    return parts.join("\n");
  });
}

async function expectEnglish(page: Page, where: string) {
  const text = await pageText(page);
  const lines = text.split("\n");
  expect(lines.filter((line) => GERMAN.test(line)), `German text on ${where}`).toEqual([]);
  expect(lines.filter((line) => GERMAN_DATA.test(line)), `German demo data on ${where}`).toEqual([]);
}

async function openDemo(page: Page, role: "Owner" | "Staff", name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: `Open demo as ${role} (${name})` }).click();
  await page.waitForURL("/");
}

test("the login page is English and offers one demo button per role", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/Larkspur/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const card = page.getByRole("region", { name: "Demo access" });
  await expect(card).toContainText(PASSWORD);
  await expect(card.getByRole("button")).toHaveCount(2);
  await expect(card.getByRole("button", { name: `Open demo as Owner (${OWNER.name})` })).toBeVisible();
  await expect(card.getByRole("button", { name: `Open demo as Staff (${STAFF.name})` })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  // The scan reads the page, and it would see a German text if there were one.
  expect(await pageText(page)).toContain("Demo access");
  expect(["Neue Anfragen", "Deine Übersicht", "Datum offen"].every((text) => GERMAN.test(text))).toBe(true);
  await expectEnglish(page, "the login page");

  await page.getByRole("button", { name: "Show password" }).click();
  await expectEnglish(page, "the login page with the password shown");
});

test("a wrong password gets an English error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-wrong-wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expectEnglish(page, "the login error");
});

for (const who of [
  { role: "Owner" as const, person: OWNER, overview: "Overview", inquiries: 30, team: true },
  { role: "Staff" as const, person: STAFF, overview: "Your overview", inquiries: 12, team: false },
]) {
  test(`${who.role.toLowerCase()}: one click signs in, and every main view, menu and dialog is English`, async ({ page }) => {
    await openDemo(page, who.role, who.person.name);
    await expect(page.getByRole("heading", { name: who.overview, level: 1 })).toBeVisible();
    await expect(page.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
    await expectEnglish(page, "the overview");
    await page.getByRole("radio", { name: "7 days" }).click();
    await expectEnglish(page, "the overview, 7 days");
    await page.getByRole("radio", { name: "90 days" }).click();
    await expectEnglish(page, "the overview, 90 days");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "Inquiries" }).click();
    await expect(page.getByRole("heading", { name: "Inquiries", level: 1 })).toBeVisible();
    await expect(page.locator("[data-inquiry-id]")).toHaveCount(who.inquiries);
    expect(await page.locator('[data-inquiry-id^="e0000000"]').count()).toBe(0);
    await expectEnglish(page, "the board");

    await nav.getByRole("link", { name: "Contacts" }).click();
    await expect(page.getByRole("heading", { name: "Contacts", level: 1 })).toBeVisible();
    await expectEnglish(page, "the contacts");

    if (who.team) {
      await nav.getByRole("link", { name: "Team" }).click();
      await expect(page.getByRole("heading", { name: "Team & API", level: 1 })).toBeVisible();
      await expect(page.getByText(OWNER.name).first()).toBeVisible();
      await expectEnglish(page, "team and API keys");
    } else {
      await expect(nav.getByRole("link", { name: "Team" })).toHaveCount(0);
      await page.goto("/team");
      await expectEnglish(page, "the team page for staff");
    }

    await page.goto(`/inquiries/${INQUIRY.ofConor}`);
    await expect(page.getByRole("heading", { name: "Corrib Software Christmas party", level: 1 })).toBeVisible();
    await expectEnglish(page, "an inquiry");

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await expectEnglish(page, "the command palette");
    await page.keyboard.type("Murphy");
    await expectEnglish(page, "the command palette with results");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);

    // Shortcuts listen outside text fields.
    await page.getByRole("heading", { level: 1 }).click();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await expectEnglish(page, "the shortcut help");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
    await page.keyboard.press("g");
    await page.keyboard.press("c");
    await expect(page).toHaveURL(/\/contacts$/);
    await page.keyboard.press("g");
    await page.keyboard.press("o");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expectEnglish(page, "the notifications");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Profile menu" }).click();
    await expectEnglish(page, "the profile menu");
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expectEnglish(page, "the settings");
    await page.keyboard.press("Escape");

    await page.keyboard.press("d");
    await expectEnglish(page, "the overview in dark mode");
    await page.keyboard.press("d");
  });
}

test("the assistant drafts in English, and the accepted draft becomes an English note", async ({ page }) => {
  await openDemo(page, "Staff", STAFF.name);
  await page.goto(`/inquiries/${INQUIRY.ofConor}`);
  const panel = page.getByRole("region", { name: "Assistant" });
  const leftover = panel.getByRole("button", { name: "Discard" });
  if (await leftover.isVisible()) await leftover.click();

  await panel.getByRole("button", { name: "Create draft" }).click();
  await expect(panel.getByText("Suggested follow-up questions")).toBeVisible();
  await expectEnglish(page, "a pending AI draft");
  await panel.getByRole("button", { name: "Save as note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved as a note." })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^.*Summary: Corrib Software is planning/ }).first()).toBeVisible();
  await expectEnglish(page, "an inquiry with an accepted AI draft");
});

test("an inquiry whose e-mail matched a known contact says so in English", async ({ page }) => {
  await openDemo(page, "Owner", OWNER.name);
  await page.goto(`/inquiries/${INQUIRY.matchedByEmail}`);
  await expect(page.getByText("087 555 0190").first()).toBeVisible();
  await expectEnglish(page, "the unconfirmed sender");
});

test("the calendar file is English and in Irish time", async ({ page }) => {
  await openDemo(page, "Staff", STAFF.name);
  const response = await page.request.get(`/api/inquiries/${INQUIRY.ofConor}/calendar`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("corrib-software-christmas-party.ics");
  const ics = await response.text();
  // 18:00 in Dublin in December is 18:00 UTC.
  expect(ics).toContain("DTSTART:20261212T180000Z");
  expect(GERMAN.test(ics)).toBe(false);
});

test("the English owner cannot open an inquiry of the German demo, and the pages say so in English", async ({ page }) => {
  await openDemo(page, "Owner", OWNER.name);
  await page.goto(`/inquiries/${INQUIRY.german}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expectEnglish(page, "the not-found page of an inquiry");
  const ics = await page.request.get(`/api/inquiries/${INQUIRY.german}/calendar`);
  expect(ics.status()).toBe(404);

  await page.goto("/does-not-exist");
  await expectEnglish(page, "the general not-found page");
});

test("signing out returns to the English login page", async ({ page }) => {
  await openDemo(page, "Staff", STAFF.name);
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
  await expectEnglish(page, "the login page after signing out");
});
