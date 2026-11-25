/**
 * Accents and modes: `?firma=<slug>` picks the accent, a session cookie
 * keeps it, and anything unknown falls back to the neutral accent. Light or
 * dark is a switch in the header that this browser remembers.
 */
import { expect, test, type Page } from "@playwright/test";
import { INQUIRY, signIn } from "./helpers";

const EXPECTED = {
  neutral: { primary: "#2f64ee", font: "allo" },
  everlast: { primary: "#5148e0", font: "allo" },
  refundrebel: { primary: "#0f766e", font: "allo" },
} as const;

/** Console errors and uncaught exceptions on a page. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function themeState(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      theme: root.dataset.theme,
      primary: style.getPropertyValue("--primary").trim().toLowerCase(),
      dark: root.classList.contains("dark"),
      canvas: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
    };
  });
}

test.describe.configure({ mode: "serial" });

for (const [slug, expected] of Object.entries(EXPECTED)) {
  test(`theme ${slug}: loads, sets its variables and stays for the session`, async ({ page, context }) => {
    const errors = collectErrors(page);

    await page.goto(`/login?firma=${slug}`);
    let state = await themeState(page);
    expect(state.theme).toBe(slug);
    expect(state.primary).toBe(expected.primary);
    expect(state.font).toContain(expected.font);

    if (slug === "neutral") {
      await expect(page.getByText(/^Demo für /)).toHaveCount(0);
    } else {
      await expect(page.getByText(/^Demo für /).first()).toBeVisible();
    }

    const cookie = (await context.cookies()).find((c) => c.name === "crm-theme");
    expect(cookie?.value).toBe(slug);
    expect(cookie?.expires).toBe(-1); // session cookie
    expect(cookie?.sameSite).toBe("Lax");

    // Sign-in visits /login without the parameter: the cookie carries the theme.
    await signIn(page, "owner");
    state = await themeState(page);
    expect(state.theme).toBe(slug);
    expect(state.primary).toBe(expected.primary);

    await page.goto(`/inquiries/${INQUIRY.ofJonas}`);
    await expect(page.getByRole("region", { name: "Assistent" })).toBeVisible();
    expect((await themeState(page)).theme).toBe(slug);

    expect(errors).toEqual([]);
  });
}

test("an unknown or hostile theme value falls back to neutral and is never echoed", async ({ page, context }) => {
  const errors = collectErrors(page);
  await page.goto("/login?firma=everlast");
  expect((await themeState(page)).theme).toBe("everlast");

  const hostile = '"><style>body{display:none}</style>';
  const response = await page.goto(`/login?firma=${encodeURIComponent(hostile)}`);
  const state = await themeState(page);
  expect(state.theme).toBe("neutral");
  expect(state.primary).toBe(EXPECTED.neutral.primary);
  expect((await context.cookies()).find((c) => c.name === "crm-theme")?.value).toBe("neutral");
  await expect(page.locator("style", { hasText: "display:none" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Willkommen zurück" })).toBeVisible();
  const openingTag = (await response!.text()).match(/<html[^>]*>/)![0];
  expect(openingTag).toContain('data-theme="neutral"');
  expect(openingTag).not.toContain("style");

  // A forged cookie is ignored as well.
  await context.addCookies([{ name: "crm-theme", value: "constructor", url: page.url() }]);
  await page.goto("/login");
  expect((await themeState(page)).theme).toBe("neutral");
  expect(errors).toEqual([]);
});

test("the mode switch turns the app dark, keeps it after a reload and switches back", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/login?firma=neutral");
  await signIn(page, "owner");
  expect((await themeState(page)).dark).toBe(false);
  const light = (await themeState(page)).canvas;

  await page.getByRole("button", { name: "Zum dunklen Design wechseln" }).click();
  await expect(page.getByRole("button", { name: "Zum hellen Design wechseln" })).toBeVisible();
  let state = await themeState(page);
  expect(state.dark).toBe(true);
  expect(state.canvas).not.toBe(light);

  // Applied before the first paint on the next load, with no flash of the light page.
  await page.reload();
  expect((await themeState(page)).dark).toBe(true);
  await page.goto("/login");
  expect((await themeState(page)).dark).toBe(true);

  // The keyboard shortcut switches back.
  await page.goto("/");
  // Wait until the page is interactive: the switch then names the way back.
  await expect(page.getByRole("button", { name: "Zum hellen Design wechseln" })).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Zum dunklen Design wechseln" })).toBeVisible();
  state = await themeState(page);
  expect(state.dark).toBe(false);
  expect(errors).toEqual([]);
});
