import { expect, test, type Page } from "@playwright/test";
import { MOTION_KEY } from "../src/lib/theme/themes";
import { PASSWORD, USERS } from "./helpers";

/**
 * The eye in the password field: shows the password and hides it again with
 * mouse and keyboard, keeps the field the same for password managers, hides
 * the password before the form is sent, and blinks (swaps at once with
 * reduced motion).
 */

const passwordField = (page: Page) => page.getByLabel("Passwort", { exact: true });
const eye = (page: Page) => page.getByRole("button", { name: "Passwort anzeigen" });

type Frame = { t: number; show: [number, number]; hide: [number, number] };

/** Clicks the eye and reads scaleY and opacity of both icons on every frame for half a second, once the page is idle. */
async function clickAndSample(page: Page): Promise<Frame[]> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)));
  return eye(page).evaluate(async (button) => {
    const read = (which: string): [number, number] => {
      const style = getComputedStyle(button.querySelector(`[data-eye="${which}"]`)!);
      const matrix = new DOMMatrix(style.transform === "none" ? undefined : style.transform);
      return [matrix.d, Number(style.opacity)];
    };
    const frames: Frame[] = [];
    const start = performance.now();
    (button as HTMLButtonElement).click();
    while (performance.now() - start < 500) {
      await new Promise(requestAnimationFrame);
      frames.push({ t: performance.now() - start, show: read("show"), hide: read("hide") });
    }
    return frames;
  });
}

test("the eye shows the password and hides it again, by mouse and by keyboard", async ({ page }) => {
  await page.goto("/login");
  const field = passwordField(page);
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveAttribute("name", "password");
  await expect(field).toHaveAttribute("autocomplete", "current-password");
  await expect(field).toHaveAttribute("spellcheck", "false");
  await expect(eye(page)).toHaveAttribute("type", "button");
  await expect(eye(page)).toHaveAttribute("aria-pressed", "false");

  await field.fill("geheim-und-lang");
  await field.press("Home");
  for (let i = 0; i < 3; i++) await field.press("ArrowRight");
  await field.evaluate((el) => el.setAttribute("data-probe", "same-element"));

  await eye(page).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("geheim-und-lang");
  await expect(eye(page)).toHaveAttribute("aria-pressed", "true");
  // Same <input> as before (password managers keep it), focus and caret stay in the field.
  await expect(field).toHaveAttribute("data-probe", "same-element");
  await expect(field).toBeFocused();
  await page.keyboard.type("X");
  await expect(field).toHaveValue("gehXeim-und-lang");

  await page.keyboard.press("Tab");
  await expect(eye(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(field).toHaveAttribute("type", "password");
  await expect(eye(page)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("type", "text");
  await expect(eye(page)).toBeFocused();

  // The eye never sends the form (the empty alert is the route announcer).
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
});

test("sending the form hides the password first, and a shown password still signs in", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() =>
    window.addEventListener("submit", (event) => {
      const field = (event.target as HTMLFormElement).elements.namedItem("password") as HTMLInputElement;
      sessionStorage.setItem("type-at-submit", field.type);
    }),
  );
  await page.getByLabel("E-Mail-Adresse").fill(USERS.owner.email);
  await passwordField(page).fill(PASSWORD);
  await eye(page).click();
  await expect(passwordField(page)).toHaveAttribute("type", "text");
  await passwordField(page).press("Enter");
  await page.waitForURL("/");
  expect(await page.evaluate(() => sessionStorage.getItem("type-at-submit"))).toBe("password");
});

test("the eye blinks; with reduced motion the icons swap at once", async ({ page }) => {
  await page.goto("/login");
  const shown = await clickAndSample(page);
  // The open eye closes like an eyelid while it is still visible ...
  expect(shown.some((f) => f.show[0] < 0.95 && f.show[1] > 0.3)).toBe(true);
  // ... and the crossed-out one springs open, a little past its size.
  expect(Math.max(...shown.map((f) => f.hide[0]))).toBeGreaterThan(1.01);
  const settled = shown.findIndex((f, i) => shown.slice(i).every((g) => Math.abs(g.hide[0] - 1) < 0.005 && g.hide[1] === 1));
  expect(settled).toBeGreaterThanOrEqual(0);
  expect(shown[settled]!.t).toBeLessThan(420);
  expect(shown.at(-1)!.show[1]).toBe(0);

  // The system setting, then the app's own switch (kept in this browser).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const bySystem = [await clickAndSample(page), await clickAndSample(page)];
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate((key) => localStorage.setItem(key, "reduce"), MOTION_KEY);
  await page.reload();
  const bySwitch = [await clickAndSample(page), await clickAndSample(page)];
  for (const frames of [...bySystem, ...bySwitch]) {
    const moved = frames.flatMap((f) => [f.show, f.hide]).filter(([scale, opacity]) => opacity > 0.01 && Math.abs(scale - 1) > 0.001);
    expect(moved, "a visible icon changed its size").toEqual([]);
    // The icons swap from one frame to the next, nothing in between.
    const same = (a: Frame, b: Frame) => JSON.stringify([a.show, a.hide]) === JSON.stringify([b.show, b.hide]);
    const [first, last] = [frames[0]!, frames.at(-1)!];
    expect(same(first, last)).toBe(false);
    expect(frames.filter((f) => !same(f, first) && !same(f, last))).toEqual([]);
  }
});
