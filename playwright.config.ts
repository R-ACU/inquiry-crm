import { defineConfig, devices } from "@playwright/test";

/** The English demo (APP_LOCALE=en) runs its own tests in e2e/en against its own preview: `npm run test:e2e:en`. */
const EN = process.env.APP_LOCALE === "en";
const PORT = Number(process.env.PORT ?? (EN ? 3212 : 3210));
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Browser tests run headless against the local preview: the real app on
 * the Next.js server, and the Supabase stand-in with the real migrations and
 * seed. State lives in memory, so tests run one after another in a fixed order.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    headless: true,
    locale: EN ? "en-IE" : "de-DE",
    timezoneId: EN ? "Europe/Dublin" : "Europe/Berlin",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    EN
      ? { name: "app", testMatch: /[\\/]e2e[\\/]en[\\/][^\\/]+\.spec\.ts$/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }
      : { name: "app", testIgnore: ["**/screenshots.spec.ts", /[\\/]e2e[\\/]en[\\/]/], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "screenshots", testMatch: "**/screenshots.spec.ts", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run preview",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
