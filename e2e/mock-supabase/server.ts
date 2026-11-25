/**
 * Local Supabase stand-in for the preview and for tests. It is not part of
 * the app: the app talks to it through the normal SUPABASE_URL, exactly as
 * it would talk to a hosted project.
 *
 * Database: PGlite with the real migrations and seed (see
 * tests/support/pg-harness.ts). HTTP: the PostgREST and Auth endpoints that
 * supabase-js uses in this app.
 */
import http from "node:http";
import { createTestDatabase, type TestDatabase } from "../../tests/support/pg-harness";
import { GoTrueEmulator } from "./gotrue";
import { PostgrestEmulator, type Caller } from "./postgrest";

/** Publishable key and JWT secret of the local preview. Not secrets, never used anywhere else. */
export const LOCAL_PUBLISHABLE_KEY = "sb_publishable_local-preview-only";
export const LOCAL_JWT_SECRET = "local-preview-only-jwt-secret-0000000000";

export interface MockSupabase {
  url: string;
  database: TestDatabase;
  close(): Promise<void>;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

export async function startMockSupabase(options: { port?: number; host?: string; quiet?: boolean } = {}): Promise<MockSupabase> {
  const database = await createTestDatabase({ seed: true });
  const rest = new PostgrestEmulator(database.db);
  await rest.init();
  const auth = new GoTrueEmulator(database.db, LOCAL_JWT_SECRET);

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
      }

      if (headers.get("apikey") !== LOCAL_PUBLISHABLE_KEY) {
        send(401, { message: "Invalid API key", hint: "Use the local publishable key" });
        return;
      }

      const method = req.method ?? "GET";
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        send(400, { code: "PGRST102", message: "Invalid JSON body" });
        return;
      }

      if (url.pathname.startsWith("/auth/v1/")) {
        const result = await auth.handle(method, url.pathname.slice("/auth/v1".length), url.searchParams, headers, body);
        send(result.status, result.body, result.headers);
        return;
      }

      if (url.pathname.startsWith("/rest/v1/")) {
        const bearer = /^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1];
        let caller: Caller = { role: "anon", claims: { role: "anon" } };
        if (bearer && bearer !== LOCAL_PUBLISHABLE_KEY) {
          const claims = await auth.verify(bearer);
          if (!claims) {
            send(401, { code: "PGRST301", message: "JWT expired or invalid", details: null, hint: null });
            return;
          }
          caller = { role: "authenticated", claims };
        }
        const result = await rest.handle(
          method,
          url.pathname.slice("/rest/v1".length),
          url.searchParams,
          headers,
          body,
          caller,
        );
        send(result.status, result.body, result.headers);
        if (!options.quiet) {
          console.log(`${method} ${url.pathname}${url.search ? "?" + decodeURIComponent(url.search.slice(1)).slice(0, 120) : ""} -> ${result.status}`);
        }
        return;
      }

      send(404, { message: `Not supported by the local emulator: ${url.pathname}` });
    } catch (error) {
      console.error(error);
      send(500, { message: "Local emulator error" });
    }
  });

  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, host, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    url: `http://${host}:${port}`,
    database,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await database.close();
    },
  };
}
