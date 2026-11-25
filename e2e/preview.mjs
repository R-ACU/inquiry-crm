/**
 * Local preview without a Supabase project: starts the Supabase stand-in
 * (PGlite with the real migrations and seed) and the Next.js dev server.
 *
 *   npm run preview            dev server on http://127.0.0.1:3210
 *   PREVIEW_MODE=start npm run preview   production server (run `npm run build` first)
 *
 * Both child processes are stopped together on Ctrl+C.
 */
import { spawn } from "node:child_process";
import net from "node:net";

const APP_PORT = Number(process.env.PORT ?? 3210);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 3211);
const mode = process.env.PREVIEW_MODE === "start" ? "start" : "dev";

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

for (const port of [APP_PORT, MOCK_PORT]) {
  if (!(await portFree(port))) {
    console.error(`Port ${port} is in use. Stop that process or set PORT / MOCK_SUPABASE_PORT.`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  MOCK_SUPABASE_PORT: String(MOCK_PORT),
  SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local-preview-only",
  APP_URL: `http://127.0.0.1:${APP_PORT}`,
  AI_MODE: process.env.AI_MODE ?? "mock",
};

const children = [];
function run(command, args) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
  children.push(child);
  return child;
}

const mock = run("npx", ["tsx", "e2e/mock-supabase/main.ts"]);
await new Promise((resolve, reject) => {
  mock.stdout.on("data", (chunk) => {
    process.stdout.write(`[supabase] ${chunk}`);
    if (String(chunk).includes("ready")) resolve();
  });
  mock.once("exit", (code) => reject(new Error(`Supabase stand-in exited with code ${code}`)));
});

const next = run("npx", ["next", mode, "-p", String(APP_PORT), "-H", "127.0.0.1"]);
next.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));

function shutdown() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // With shell: true on Windows the PID belongs to the shell; stop its own process tree by PID.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  }
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.once("exit", shutdown);
