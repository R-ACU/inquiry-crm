/**
 * The English demo locally: the same app built with APP_LOCALE=en, on its own ports and in its own
 * build folder, so it can run next to the German preview.
 *
 *   npm run build:en       production build into .next-en
 *   npm run preview:en     preview on http://127.0.0.1:3212 (Supabase stand-in on :3213)
 *   npm run test:e2e:en    browser tests in e2e/en (starts the preview itself if it is not running)
 *
 * The stand-in holds both workspaces; the English accounts see only the English one (RLS).
 * Extra arguments go to Playwright, e.g. `npm run test:e2e:en -- --grep login`.
 */
import { spawn } from "node:child_process";

const [mode, ...rest] = process.argv.slice(2);
const env = {
  ...process.env,
  APP_LOCALE: "en",
  PORT: process.env.PORT ?? "3212",
  MOCK_SUPABASE_PORT: process.env.MOCK_SUPABASE_PORT ?? "3213",
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-en",
};

const commands = {
  build: ["npx", ["next", "build", ...rest]],
  preview: ["node", ["e2e/preview.mjs", ...rest]],
  test: ["npx", ["playwright", "test", "--project=app", ...rest]],
};
if (!(mode in commands)) {
  console.error(`Usage: node e2e/en.mjs <${Object.keys(commands).join("|")}> [args]`);
  process.exit(2);
}

const [command, args] = commands[mode];
const child = spawn(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
