import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `supabase config push` sends supabase/config.toml to the hosted project. On hosted Supabase,
 * [auth.email] enable_signup is the whole e-mail provider: set to false, nobody can sign in with
 * e-mail and password any more ("Email logins are disabled"). Sign-ups are closed by
 * [auth] enable_signup instead. This was found on the first deployment; the local stand-in did not show it.
 */
function section(toml: string, name: string): Record<string, string> {
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `[${name}]`);
  expect(start, `section [${name}]`).toBeGreaterThanOrEqual(0);
  const values: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (t.startsWith("[")) break;
    const m = /^([a-z_]+)\s*=\s*(.+)$/.exec(t);
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

describe("supabase/config.toml auth settings", () => {
  const toml = readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf8");

  it("keeps public sign-up and anonymous sign-in closed", () => {
    const auth = section(toml, "auth");
    expect(auth.enable_signup).toBe("false");
    expect(auth.enable_anonymous_sign_ins).toBe("false");
  });

  it("keeps the e-mail provider on, so the staff can sign in with e-mail and password", () => {
    expect(section(toml, "auth.email").enable_signup).toBe("true");
  });

  it("asks for long passwords with mixed characters", () => {
    const auth = section(toml, "auth");
    expect(Number(auth.minimum_password_length)).toBeGreaterThanOrEqual(10);
    expect(auth.password_requirements).toBe('"lower_upper_letters_digits"');
  });
});
