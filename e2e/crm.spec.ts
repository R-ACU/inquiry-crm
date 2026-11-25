/**
 * Click-through tests in a real browser against the local preview. Each
 * test leaves the data as it found it where that is cheap, so the suite can
 * run twice against the same server.
 */
import { expect, test } from "@playwright/test";
import { INQUIRY, signIn, signInToBoard, USERS } from "./helpers";

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("security headers are set and the session cookie is HttpOnly", async ({ page, context }) => {
  const response = await page.goto("/login");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();

  await signIn(page, "jonas");
  const sessionCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(sessionCookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
});

test("a wrong password shows one neutral error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(USERS.jonas.email);
  await page.getByLabel("Passwort", { exact: true }).fill("falsch-falsch");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-Mail-Adresse oder Passwort ist falsch." })).toBeVisible();
});

test("a staff member sees only assigned inquiries and no admin area", async ({ page }) => {
  await signInToBoard(page, "jonas");
  await expect(page.locator("[data-inquiry-id]")).toHaveCount(12);
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.ofMira}"]`)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Team" })).toHaveCount(0);

  await page.goto(`/inquiries/${INQUIRY.ofMira}`);
  await expect(page.getByRole("heading", { name: "Nicht gefunden" })).toBeVisible();

  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Nur für Inhaber" })).toBeVisible();

  const ics = await page.request.get(`/api/inquiries/${INQUIRY.ofMira}/calendar`);
  expect(ics.status()).toBe(404);
});

test("the owner sees every inquiry and can filter by assignee", async ({ page }) => {
  await signInToBoard(page, "owner");
  expect(await page.locator("[data-inquiry-id]").count()).toBeGreaterThanOrEqual(30);

  await page.getByRole("button", { name: /^Zuständig:/ }).click();
  await page.getByRole("option", { name: "Mira Schulz" }).click();
  await expect(page.locator("[data-inquiry-id]")).toHaveCount(12);
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.ofJonas}"]`)).toHaveCount(0);
});

test("moving a card on the board changes the stage and is logged", async ({ page }) => {
  await signIn(page, "owner");
  // Start from "Neu" even if an earlier run stopped halfway.
  await page.goto(`/inquiries/${INQUIRY.unassigned}`);
  const neu = page.getByRole("radio", { name: "Neu" });
  if ((await neu.getAttribute("aria-checked")) !== "true") {
    await neu.click();
    await expect(neu).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("status").filter({ hasText: "Stand auf Neu gesetzt." })).toBeVisible();
  }
  await page.goto("/inquiries");

  const card = page.locator(`[data-inquiry-id="${INQUIRY.unassigned}"]`);
  await expect(card).toBeVisible();
  // Drop on the column header: it is in view, so nothing scrolls mid-drag.
  await card.dragTo(page.locator('section[data-status="quoted"] header'));
  await expect(page.getByRole("status").filter({ hasText: "Verschoben nach Angebot." })).toBeVisible();
  await expect(page.locator(`section[data-status="quoted"] [data-inquiry-id="${INQUIRY.unassigned}"]`)).toBeVisible();

  await page.goto(`/inquiries/${INQUIRY.unassigned}`);
  await expect(page.getByRole("radio", { name: "Angebot" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Du hast den Stand von Neu auf Angebot gesetzt").first()).toBeVisible();

  // Back to "Neu" with the keyboard on the segmented control.
  await page.getByRole("radio", { name: "Angebot" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("status").filter({ hasText: "Stand auf Neu gesetzt." })).toBeVisible();
});

test("the owner assigns an inquiry with the keyboard and the staff member then sees it", async ({ page, browser }) => {
  await signIn(page, "owner");
  await page.goto(`/inquiries/${INQUIRY.unassigned}`);
  const trigger = page.getByRole("button", { name: /^Zuständig:/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Zuständig" })).toBeVisible();
  // Options: Nicht zugewiesen, Jonas Weber, Lena Hoffmann, Mira Schulz
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Jonas Weber ist jetzt zuständig." })).toBeVisible();

  const jonas = await browser.newPage();
  await signInToBoard(jonas, "jonas");
  await expect(jonas.locator(`[data-inquiry-id="${INQUIRY.unassigned}"]`)).toBeVisible();
  await jonas.close();

  await trigger.click();
  await page.getByRole("option", { name: "Nicht zugewiesen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Zuweisung entfernt." })).toBeVisible();
});

test("an AI draft stays a draft until a person accepts it", async ({ page }) => {
  await signIn(page, "mira");
  await page.goto(`/inquiries/${INQUIRY.wedding}`);

  const panel = page.getByRole("region", { name: "Assistent" });
  await expect(panel).toBeVisible();
  // A pending draft from an interrupted earlier run is discarded first.
  const leftover = panel.getByRole("button", { name: "Verwerfen" });
  if (await leftover.isVisible()) {
    await leftover.click();
    await expect(page.getByRole("status").filter({ hasText: "Entwurf verworfen." })).toBeVisible();
  }

  const summaryNotes = page.getByRole("listitem").filter({ hasText: "Zusammenfassung: Anna Petersen heiratet" });
  const before = await summaryNotes.count();

  await panel.getByRole("button", { name: "Entwurf erstellen" }).click();
  await expect(panel.getByText("Vorgeschlagene Rückfragen")).toBeVisible();
  await expect(panel.getByText("Testmodus mit festen Beispielantworten", { exact: false })).toBeVisible();
  // Still only a draft: no new note yet.
  await expect(summaryNotes).toHaveCount(before);

  await panel.getByRole("button", { name: "Als Notiz übernehmen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Entwurf als Notiz übernommen." })).toBeVisible();
  await expect(summaryNotes).toHaveCount(before + 1);
  await expect(page.getByText("Du hast einen KI-Entwurf als Notiz übernommen").first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "Entwurf erstellen" })).toBeVisible();
});

test("a note is saved in the author's name", async ({ page }) => {
  await signIn(page, "jonas");
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  const text = `Rückruf am Donnerstag vereinbart (${Date.now()})`;
  await page.getByLabel("Notiz").fill(text);
  await page.getByRole("button", { name: "Notiz speichern" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByLabel("Notiz")).toHaveValue("");
});

test("the event can be downloaded as an .ics file", async ({ page }) => {
  await signIn(page, "jonas");
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "In den Kalender" }).click()]);
  expect(download.suggestedFilename()).toBe("2026-12-12-weihnachtsfeier-nordlicht-software.ics");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const ics = Buffer.concat(chunks).toString("utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("DTSTART:20261212T170000Z");
});

test("an API key created in the UI lets a form submit an inquiry that lands on the board", async ({ page, request }) => {
  await signIn(page, "owner");
  await page.goto("/team");
  const keyName = `E2E-Formular ${Date.now()}`;
  await page.getByPlaceholder("Wofür, zum Beispiel Webformular").fill(keyName);
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
  const key = (await page.getByTestId("new-api-key").textContent())!.trim();
  expect(key).toMatch(/^crm_[a-z0-9]{8}_/);

  const title = `Sommerfest Test ${Date.now()}`;
  const response = await request.post("/api/v1/inquiries", {
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    data: { name: "Greta Sommer", email: "greta.e2e@post.example", title, eventDate: "2027-07-17", guestCount: 45, budgetEur: 2000, source: "web_form" },
  });
  expect(response.status()).toBe(201);

  const rejected = await request.post("/api/v1/inquiries", {
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    data: { name: "Greta", email: "kaputt", title: "x" },
  });
  expect(rejected.status()).toBe(422);

  await page.goto("/inquiries");
  await expect(page.locator('section[data-status="new"]').getByText(title)).toBeVisible();

  // Revoke and confirm the key stops working.
  await page.goto("/team");
  const row = page.getByRole("listitem").filter({ hasText: keyName });
  await row.getByRole("button", { name: "Widerrufen" }).click();
  await row.getByRole("button", { name: "Widerrufen" }).click();
  await expect(row.getByText(/^Widerrufen \d/)).toBeVisible();
  const afterRevoke = await request.post("/api/v1/inquiries", {
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    data: { name: "Greta", email: "greta2@post.example", title: "Nach Widerruf" },
  });
  expect(afterRevoke.status()).toBe(401);
});

test("a staff member gets no role controls and can sign out", async ({ page }) => {
  await signIn(page, "mira");
  // Role changes are enforced in the database (see tests/db/rls.test.ts).
  // Here: the UI offers no controls, and signing out ends the session.
  await page.goto("/team");
  await expect(page.getByRole("button", { name: /^Rolle von/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Profilmenü" }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("a search without matches says so and can be reset", async ({ page }) => {
  await signInToBoard(page, "owner");
  await page.getByPlaceholder("Titel, Kontakt oder Firma").fill("zzzzqq");
  await expect(page.getByRole("heading", { name: "Keine Anfragen zu „zzzzqq“" })).toBeVisible();
  await expect(page.locator("[data-inquiry-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Suche zurücksetzen" }).click();
  expect(await page.locator("[data-inquiry-id]").count()).toBeGreaterThanOrEqual(30);
});

test("an inquiry whose e-mail matched a known contact shows the typed details as unconfirmed", async ({ page }) => {
  await signInToBoard(page, "owner");
  // The board card already carries a quiet hint, other cards do not.
  const card = page.locator(`[data-inquiry-id="${INQUIRY.matchedByEmail}"]`);
  await expect(card.getByTitle("Per E-Mail zugeordnet, nicht bestätigt")).toBeVisible();
  const plainCard = page.locator(`[data-inquiry-id="${INQUIRY.wedding}"]`);
  await expect(plainCard).toBeVisible();
  await expect(plainCard.getByTitle("Per E-Mail zugeordnet, nicht bestätigt")).toHaveCount(0);
  await page.goto(`/inquiries/${INQUIRY.matchedByEmail}`);
  const note = page.getByRole("note");
  await expect(note).toContainText("Per E-Mail zugeordnet, nicht bestätigt");
  await expect(note).toContainText("0172 555 0190");
  // The contact itself still shows the known phone number.
  await expect(page.getByRole("link", { name: "040 555 0109" })).toBeVisible();
});

test("unknown addresses get a general not-found page", async ({ page }) => {
  await signIn(page, "jonas");
  await page.goto("/gibt-es-nicht");
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
});

test("the overview computes its figures from the visible data and switches periods", async ({ page }) => {
  await signIn(page, "owner");
  await expect(page.getByRole("heading", { name: "Neue Anfragen", level: 2 })).toBeVisible();
  await expect(page.getByRole("radio", { name: "30 Tage" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/in den letzten 30 Tagen\.$/)).toBeVisible();

  // The radio group works with the keyboard as well.
  await page.getByRole("radio", { name: "30 Tage" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "90 Tage" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/in den letzten 90 Tagen\.$/)).toBeVisible();

  // Every card of the grid is there, with a text alternative for the gauge.
  for (const name of ["Pipeline-Wert", "Nächste Termine", "Anfragen je Woche", "Abschlussquote"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByRole("article", { name: "Zugesagt" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Abschlussquote \d+ Prozent, \d+ gewonnen, \d+ verloren$/ })).toBeVisible();

  // Hovering a pill of the hero shows its figures.
  await page.locator('section[aria-label="Pipeline-Wert"] .recharts-bar-rectangle').last().hover();
  await expect(page.getByRole("paragraph").filter({ hasText: /^Stand heute$/ })).toBeVisible();

  // A staff member's overview counts only their own inquiries, and its labels say so.
  const jonas = await page.context().browser()!.newPage();
  await signIn(jonas, "jonas");
  await expect(jonas.getByRole("heading", { name: "Deine Übersicht", level: 1 })).toBeVisible();
  await expect(jonas.getByRole("region", { name: "Deine Pipeline" })).toBeVisible();
  await expect(jonas.getByRole("article", { name: "Deine Zusagen" })).toBeVisible();
  await expect(jonas.getByRole("article", { name: "Zugesagt" })).toHaveCount(0);
  await jonas.close();
});

test("the command palette finds an inquiry and keyboard shortcuts navigate", async ({ page }) => {
  await signIn(page, "owner");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Befehlspalette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("Hochzeit Petersen");
  await expect(palette.getByRole("option", { name: /Hochzeit Petersen im Mai/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/inquiries/${INQUIRY.wedding}$`));
  await expect(palette).toHaveCount(0);

  await page.keyboard.press("g");
  await page.keyboard.press("k");
  await expect(page).toHaveURL(/\/contacts$/);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toHaveCount(0);
});

test("a staff member's palette offers no admin pages and finds no foreign inquiries", async ({ page }) => {
  await signIn(page, "jonas");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Befehlspalette" });
  await page.keyboard.type("Team und API");
  await expect(palette.getByRole("option", { name: "Team und API" })).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Kanzleiempfang");
  await expect(palette.getByText(/^Nichts gefunden/)).toBeVisible();
});
