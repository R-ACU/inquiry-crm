import "server-only";
import { z } from "zod";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
}

export interface DemoAccess {
  password: string;
  accounts: DemoAccount[];
}

const Accounts = z
  .array(
    z.object({
      email: z.string().trim().toLowerCase().pipe(z.email()),
      name: z.string().trim().min(1).max(60),
      role: z.string().trim().min(1).max(30),
    }),
  )
  .min(1)
  .max(4);

const FORMAT = "DEMO_LOGIN_ACCOUNTS must be a JSON list of {email, name, role} (1 to 4 entries).";

/**
 * Public demo only. With DEMO_LOGIN_PASSWORD and DEMO_LOGIN_ACCOUNTS set, the login page shows a
 * "Demo-Zugang" card: one row per account that signs in through the normal sign-in action, so the
 * password check, the throttle and RLS apply as for anyone typing. Both unset (the default): no card.
 * Only one of them set, or a malformed list, is a configuration error, not a silent fallback.
 */
export function demoAccess(env: Record<string, string | undefined> = process.env): DemoAccess | null {
  const password = env.DEMO_LOGIN_PASSWORD?.trim() ?? "";
  const raw = env.DEMO_LOGIN_ACCOUNTS?.trim() ?? "";
  if (!password && !raw) return null;
  if (!password || !raw) throw new Error("Set both DEMO_LOGIN_PASSWORD and DEMO_LOGIN_ACCOUNTS, or neither.");
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error(FORMAT);
  }
  const accounts = Accounts.safeParse(list);
  if (!accounts.success) throw new Error(FORMAT);
  return { password, accounts: accounts.data };
}
