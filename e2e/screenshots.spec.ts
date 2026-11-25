/**
 * Produces the screenshots in docs/screenshots: `npm run screenshots`.
 * Desktop 1440x900 and phone 390x844, light and dark. Run it against a
 * freshly started preview, because it creates a draft and an API key. All
 * screenshots show the preview with invented data and the assistant in test
 * mode (fixed answers, no model call). The base set uses the neutral accent;
 * each company accent gets its own images named theme-<slug>-*.png.
 */
import { test, type Page } from "@playwright/test";
import { INQUIRY, signIn } from "./helpers";

const DIR = "docs/screenshots";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** Hides the development badge and lets entrance animations (bars, gauge, counters) finish. */
async function settle(page: Page, wait = 1400) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.mouse.move(0, 0);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(wait);
}

/**
 * Long pages: grow the viewport to the page height instead of using
 * Playwright's fullPage stitching, so the sticky header and tab bar sit
 * where they do on a tall screen. Charts redraw at the new size, so wait again.
 */
async function shot(page: Page, name: string, fullHeight = false) {
  await settle(page);
  if (!fullHeight) {
    await page.screenshot({ path: `${DIR}/${name}.png` });
    return;
  }
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  await page.setViewportSize(viewport);
}

async function setMode(page: Page, mode: "light" | "dark") {
  await page.evaluate((m) => localStorage.setItem("crm-mode", m), mode);
  await page.reload();
}

/**
 * The team page shows a freshly created key once. In the published image it
 * is replaced by an obvious placeholder, so nobody mistakes a screenshot for
 * a leaked credential. The page itself is unchanged.
 */
async function maskNewApiKey(page: Page) {
  const raw = (await page.getByTestId("new-api-key").textContent())!.trim();
  await page.evaluate((key) => {
    const placeholder = `${key.slice(0, 13)}${"x".repeat(key.length - 13)}`;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(key)) node.textContent = node.textContent.replaceAll(key, placeholder);
    }
  }, raw);
}

async function openDraft(page: Page) {
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  await page.getByRole("region", { name: "Assistent" }).waitFor();
  const create = page.getByRole("button", { name: "Entwurf erstellen" });
  if (await create.isVisible()) await create.click();
  await page.getByRole("button", { name: "Als Notiz übernehmen" }).waitFor();
}

test.describe.configure({ mode: "serial" });

test("login", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/login");
  await shot(page, "login-desktop");
  await setMode(page, "dark");
  await shot(page, "login-dark-desktop");
  await setMode(page, "light");
  await page.setViewportSize(PHONE);
  await shot(page, "login-mobile");
});

test("owner views", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(DESKTOP);
  await signIn(page, "owner");
  await shot(page, "overview-desktop", true);

  // Tooltip on a pill of the pipeline hero.
  await page.locator('section[aria-label="Pipeline-Wert"] .recharts-bar-rectangle').nth(6).hover({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/overview-tooltip-desktop.png` });
  await page.mouse.move(0, 0);

  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Befehlspalette" }).waitFor();
  await page.keyboard.type("hoch");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/command-palette-desktop.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Profilmenü" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/profile-menu-desktop.png`, clip: { x: 840, y: 0, width: 600, height: 380 } });
  await page.keyboard.press("Escape");

  await page.keyboard.press("?");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${DIR}/shortcuts-desktop.png` });
  await page.keyboard.press("Escape");

  await page.goto("/inquiries");
  await shot(page, "board-owner-desktop");

  // Hover the neighbour of the active navigation item.
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Kontakte" }).hover();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/nav-hover-desktop.png`, clip: { x: 0, y: 0, width: 720, height: 72 } });

  await page.getByRole("button", { name: /^Zuständig:/ }).click();
  // Let the list finish its entrance, or hover() scrolls the moving element.
  await page.waitForTimeout(350);
  await page.getByRole("option", { name: "Mira Schulz" }).hover();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${DIR}/filter-dropdown-desktop.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.getByPlaceholder("Titel, Kontakt oder Firma").fill("Zeltverleih");
  await shot(page, "board-search-empty-desktop");
  await page.getByRole("button", { name: "Suche zurücksetzen" }).click();

  await openDraft(page);
  await shot(page, "inquiry-draft-desktop", true);

  await page.getByRole("button", { name: /^Zuständig:/ }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${DIR}/assignee-dropdown-desktop.png` });
  await page.keyboard.press("Escape");

  await page.goto(`/inquiries/${INQUIRY.matchedByEmail}`);
  await shot(page, "inquiry-unconfirmed-sender-desktop");

  await page.goto("/contacts");
  await shot(page, "contacts-desktop");

  await page.goto("/team");
  await page.getByPlaceholder("Wofür, zum Beispiel Webformular").fill("Webformular");
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
  await page.getByTestId("new-api-key").waitFor();
  await maskNewApiKey(page);
  await shot(page, "team-api-desktop", true);

  await page.goto("/gibt-es-nicht");
  await shot(page, "not-found-desktop");

  // Dark mode.
  await page.goto("/");
  await setMode(page, "dark");
  await shot(page, "overview-dark-desktop", true);
  await page.goto("/inquiries");
  await shot(page, "board-dark-desktop");
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  await shot(page, "inquiry-dark-desktop", true);
  await page.goto("/contacts");
  await shot(page, "contacts-dark-desktop");
  await setMode(page, "light");

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await shot(page, "overview-mobile", true);
  await page.goto("/inquiries");
  await shot(page, "board-owner-mobile");
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  await shot(page, "inquiry-mobile", true);
  await page.goto("/contacts");
  await shot(page, "contacts-mobile");
});

test("staff view", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, "mira");
  await shot(page, "overview-staff-desktop");
  await page.goto("/inquiries");
  await shot(page, "board-staff-desktop");
  await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
  await shot(page, "staff-foreign-inquiry-desktop");
});

for (const theme of ["everlast", "refundrebel"] as const) {
  test(`theme ${theme}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(DESKTOP);
    await page.goto(`/login?firma=${theme}`);
    await shot(page, `theme-${theme}-login-desktop`);
    await signIn(page, "owner");
    await shot(page, `theme-${theme}-overview-desktop`, true);
    await page.goto("/inquiries");
    await shot(page, `theme-${theme}-board-desktop`);
    await openDraft(page);
    await shot(page, `theme-${theme}-detail-desktop`, true);

    await page.goto("/");
    await setMode(page, "dark");
    await shot(page, `theme-${theme}-overview-dark-desktop`, true);
    await page.goto("/inquiries");
    await shot(page, `theme-${theme}-board-dark-desktop`);
    await setMode(page, "light");

    await page.setViewportSize(PHONE);
    await page.goto("/");
    await shot(page, `theme-${theme}-overview-mobile`, true);
  });
}
