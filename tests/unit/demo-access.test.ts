import { describe, expect, it } from "vitest";
import { demoAccess } from "@/lib/demo-access";

const ACCOUNTS = JSON.stringify([
  { email: "Lena@Lindgruen.example ", name: "Lena Hoffmann", role: "Inhaberin" },
  { email: "jonas@lindgruen.example", name: "Jonas Weber", role: "Mitarbeiter" },
]);

describe("demo access on the login page", () => {
  it("is off unless configured", () => {
    expect(demoAccess({})).toBeNull();
    expect(demoAccess({ DEMO_LOGIN_PASSWORD: " ", DEMO_LOGIN_ACCOUNTS: "" })).toBeNull();
  });

  it("reads the password and the accounts, with normalised e-mail addresses", () => {
    const access = demoAccess({ DEMO_LOGIN_PASSWORD: "Lindgruen-Demo-2026", DEMO_LOGIN_ACCOUNTS: ACCOUNTS });
    expect(access).toEqual({
      password: "Lindgruen-Demo-2026",
      accounts: [
        { email: "lena@lindgruen.example", name: "Lena Hoffmann", role: "Inhaberin" },
        { email: "jonas@lindgruen.example", name: "Jonas Weber", role: "Mitarbeiter" },
      ],
    });
  });

  it("refuses half or broken configuration instead of hiding it", () => {
    expect(() => demoAccess({ DEMO_LOGIN_PASSWORD: "Lindgruen-Demo-2026" })).toThrow(/both/);
    expect(() => demoAccess({ DEMO_LOGIN_ACCOUNTS: ACCOUNTS })).toThrow(/both/);
    const bad = ["not json", "{}", "[]", '[{"email":"no-mail","name":"X","role":"Y"}]', '[{"email":"a@b.example","name":"","role":"Y"}]'];
    for (const value of bad) {
      expect(() => demoAccess({ DEMO_LOGIN_PASSWORD: "x", DEMO_LOGIN_ACCOUNTS: value }), value).toThrow(/JSON list/);
    }
  });
});
