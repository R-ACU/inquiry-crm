/**
 * Switching between the main areas feels like a native app: a view seen
 * once comes back at once with its data and state, without a loading
 * placeholder and without replaying its entrance; changes made elsewhere
 * show up on it; and a sign-out leaves nothing of the session in the tab.
 * Each test leaves the data as it found it.
 */
import { expect, test, type Page } from "@playwright/test";
import { INQUIRY, PASSWORD, USERS, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

function nav(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name, exact: true });
}

/**
 * For the next four seconds, records everything in the main area that looks
 * like loading: a visible placeholder (aria-busy), a row or card playing an
 * entrance animation, or one that motion fades in from a lower opacity.
 */
async function watchForLoading(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __loading: string[] }).__loading = seen;
    const until = performance.now() + 4000;
    const tick = () => {
      for (const el of document.querySelectorAll<HTMLElement>("main [aria-busy='true']")) {
        if (el.offsetParent !== null) seen.push(el.getAttribute("aria-label") ?? "placeholder");
      }
      for (const el of document.querySelectorAll<HTMLElement>("main tr, main li, main li > div")) {
        if (el.offsetParent === null) continue;
        if (el.getAnimations().some((a) => a.playState === "running")) seen.push(`entrance on ${el.tagName.toLowerCase()}`);
        if (Number(el.style.opacity || 1) < 0.99) seen.push(`fading ${el.tagName.toLowerCase()}`);
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function loadingSeen(page: Page) {
  return [...new Set(await page.evaluate(() => (window as unknown as { __loading: string[] }).__loading))];
}

/** Signs in on the login page that is already open, without loading it again. */
async function signInHere(page: Page, user: keyof typeof USERS) {
  await page.getByLabel("E-Mail-Adresse").fill(USERS[user].email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("/");
}

function contactRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

test("a view seen before comes back at once, with its data and its search, without loading", async ({ page }) => {
  await signIn(page, "owner");
  await nav(page, "Kontakte").click();
  await expect(contactRow(page, "Felix Brandt")).toBeVisible();
  await page.getByRole("searchbox", { name: "Kontakte durchsuchen" }).fill("Brandt");
  await nav(page, "Anfragen").click();
  await expect(page.getByRole("heading", { name: "Anfragen", level: 1 })).toBeVisible();
  await page.waitForTimeout(800);

  // Hold back any server answer for the contacts page: the view must not need one.
  await page.route(/\/contacts\?_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue();
  });
  await watchForLoading(page);
  await nav(page, "Kontakte").click();
  await expect(page.getByRole("heading", { name: "Kontakte", level: 1 })).toBeVisible({ timeout: 1000 });
  await expect(contactRow(page, "Felix Brandt")).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole("searchbox", { name: "Kontakte durchsuchen" })).toHaveValue("Brandt");

  await watchForLoading(page);
  await nav(page, "Anfragen").click();
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.unassigned}"]`).filter({ visible: true })).toBeVisible({ timeout: 1000 });
  await page.waitForTimeout(600);
  expect(await loadingSeen(page)).toEqual([]);
  await page.unroute(/\/contacts\?_rsc=/);
});

test("a view rebuilt from the cache appears as it is, without counting up or growing again", async ({ page }) => {
  await signIn(page, "owner");
  await page.waitForTimeout(1200);
  // React keeps the last three pages alive; with four areas the overview is rebuilt on return.
  for (const area of ["Anfragen", "Kontakte", "Team"]) {
    await nav(page, area).click();
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true })).toBeVisible();
    await page.waitForTimeout(500);
  }
  const frames = await page.evaluate(
    () =>
      new Promise<{ first: string; bars: number }[]>((resolve) => {
        const link = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Hauptnavigation"] a')].find((a) => a.textContent?.trim() === "Übersicht")!;
        const out: { first: string; bars: number }[] = [];
        const started = performance.now();
        const tick = () => {
          const hero = [...document.querySelectorAll<HTMLElement>('section[aria-label="Pipeline-Wert"]')].find((s) => s.offsetParent !== null);
          if (hero) {
            const bars = [...hero.querySelectorAll(".recharts-bar-rectangle")].reduce((sum, b) => sum + b.getBoundingClientRect().height, 0);
            out.push({ first: [...hero.querySelectorAll("p")].map((p) => p.textContent ?? "").find((t) => t.includes("€")) ?? "", bars: Math.round(bars) });
          }
          if (performance.now() - started > 2500) return resolve(out);
          requestAnimationFrame(tick);
        };
        link.click();
        tick();
      }),
  );
  expect(frames.length).toBeGreaterThan(0);
  const last = frames[frames.length - 1];
  // The very first frame already shows the final figure and the full bars.
  expect(frames[0].first).toBe(last.first);
  expect(frames[0].bars).toBe(last.bars);
});

test("a change on the board shows on a view seen before, without reloading it", async ({ page }) => {
  await signIn(page, "owner");
  // Start from "Neu" even if an earlier run stopped halfway.
  await page.goto(`/inquiries/${INQUIRY.unassigned}`);
  const neu = page.getByRole("radio", { name: "Neu" });
  if ((await neu.getAttribute("aria-checked")) !== "true") {
    await neu.click();
    await expect(page.getByRole("status").filter({ hasText: "Stand auf Neu gesetzt." })).toBeVisible();
  }
  await nav(page, "Kontakte").click();
  const openCell = contactRow(page, "Felix Brandt").getByRole("cell").nth(4);
  await expect(openCell).toBeVisible();
  const openBefore = Number(await openCell.textContent());

  await nav(page, "Anfragen").click();
  const card = page.locator(`[data-inquiry-id="${INQUIRY.unassigned}"]`).filter({ visible: true });
  await expect(card).toBeVisible();
  await card.dragTo(page.locator('section[data-status="won"] header').filter({ visible: true }));
  await expect(page.getByRole("status").filter({ hasText: "Verschoben nach Gewonnen." })).toBeVisible();
  // Let the card finish gliding into its column; only what happens on the switch counts.
  await expect.poll(() => page.evaluate(() => document.querySelector("main")!.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length)).toBe(0);

  await watchForLoading(page);
  await nav(page, "Kontakte").click();
  await expect(openCell).toHaveText(String(openBefore - 1));
  expect(await loadingSeen(page)).toEqual([]);

  // Back to "Neu".
  await page.goto(`/inquiries/${INQUIRY.unassigned}`);
  await page.getByRole("radio", { name: "Neu" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stand auf Neu gesetzt." })).toBeVisible();
});

test("after signing out nothing of the session stays in the tab, and the next person sees only their own data", async ({ page }) => {
  await signIn(page, "owner");
  await nav(page, "Anfragen").click();
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.ofMira}"]`).filter({ visible: true })).toBeVisible();
  await nav(page, "Kontakte").click();
  await expect(page.getByRole("heading", { name: "Kontakte", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Profilmenü" }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await page.waitForURL("/login");
  // Not even hidden: the sign-out loads the login page afresh.
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.ofMira}"]`)).toHaveCount(0);
  await expect(page.getByText(USERS.owner.name)).toHaveCount(0);

  await page.evaluate((id) => {
    const seen: string[] = [];
    (window as unknown as { __foreign: string[] }).__foreign = seen;
    new MutationObserver(() => {
      if (document.querySelector(`[data-inquiry-id="${id}"], a[href="/inquiries/${id}"]`)) seen.push(id);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  }, INQUIRY.ofMira);
  await signInHere(page, "jonas");
  await expect(page.getByRole("heading", { name: "Deine Übersicht", level: 1 })).toBeVisible();
  await nav(page, "Anfragen").click();
  await expect(page.locator(`[data-inquiry-id="${INQUIRY.ofJonas}"]`).filter({ visible: true })).toBeVisible();
  await nav(page, "Kontakte").click();
  await expect(page.getByRole("heading", { name: "Kontakte", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Benachrichtigungen/ }).click();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as { __foreign: string[] }).__foreign)).toEqual([]);
});
