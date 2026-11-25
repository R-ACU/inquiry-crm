/**
 * Starts the local Supabase stand-in: `npm run mock:supabase`.
 * State lives in memory and resets to the seed on every start.
 */
import { startMockSupabase } from "./server";

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 3211);
const mock = await startMockSupabase({ port, quiet: process.env.MOCK_SUPABASE_QUIET === "1" });
console.log(`Local Supabase stand-in ready on ${mock.url} (seeded, in memory)`);

const shutdown = async () => {
  await mock.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
