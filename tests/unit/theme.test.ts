import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_THEME, MODE_KEY, THEME_COOKIE, THEMES, resolveTheme, themeFromRequest, themeScript, type ThemeSlug } from "@/lib/theme/themes";

/** Values an attacker could put into `?firma=` or the cookie. */
const HOSTILE = [
  "",
  " ",
  " everlast",
  "everlast ",
  "everlast;",
  "everlast\n",
  "ever last",
  "everlast\"><script>alert(1)</script>",
  "\"]{}*{background:url(https://evil.example/x)}[data-theme=\"",
  "</script><script>alert(1)</script>",
  "javascript:alert(1)",
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "neutral".repeat(10),
  "a".repeat(10_000),
  "%65verlast",
  "refundrebel\u0000",
  "ｅverlast",
];

describe("resolveTheme", () => {
  it("accepts every known theme", () => {
    for (const slug of THEMES) expect(resolveTheme(slug)).toBe(slug);
  });

  it("ignores case, so a hand-typed link still works", () => {
    expect(resolveTheme("Everlast")).toBe("everlast");
    expect(resolveTheme("REFUNDREBEL")).toBe("refundrebel");
  });

  it.each(HOSTILE)("falls back to neutral for %j", (value) => {
    expect(resolveTheme(value)).toBe(DEFAULT_THEME);
  });

  it("falls back to neutral for anything that is not a string", () => {
    for (const value of [undefined, null, 0, 1, true, {}, [], ["everlast"], { toString: () => "everlast" }, Symbol("x")]) {
      expect(resolveTheme(value)).toBe(DEFAULT_THEME);
    }
  });

  it("never returns a value outside the fixed list", () => {
    for (const value of [...HOSTILE, ...THEMES, "foo", "Neutral"]) {
      expect(THEMES).toContain(resolveTheme(value));
    }
  });
});

describe("themeFromRequest", () => {
  it("lets an explicit parameter win over the cookie", () => {
    expect(themeFromRequest("refundrebel", "everlast")).toBe("refundrebel");
  });

  it("selects neutral for an unknown parameter even if the cookie holds a theme", () => {
    expect(themeFromRequest("unknown", "everlast")).toBe("neutral");
  });

  it("uses the cookie when there is no parameter", () => {
    expect(themeFromRequest(null, "everlast")).toBe("everlast");
    expect(themeFromRequest(undefined, "everlast")).toBe("everlast");
  });

  it("falls back to neutral without parameter and cookie, or with a forged cookie", () => {
    expect(themeFromRequest(null, null)).toBe("neutral");
    expect(themeFromRequest(null, "<script>")).toBe("neutral");
  });
});

/**
 * Runs the real head script against a minimal stand-in for the browser and
 * returns what it set on <html>: the theme and whether the dark class is on.
 */
function runScript(search: string, cookie: string, stored: Record<string, string> = {}): { theme: string | null; dark: boolean; motion: string | null } {
  const attributes: Record<string, string> = {};
  const classes = new Set<string>();
  const document = {
    cookie,
    documentElement: {
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
      classList: { add: (name: string) => classes.add(name) },
    },
  };
  const window = { location: { search }, localStorage: { getItem: (key: string) => stored[key] ?? null } };
  new Function("window", "document", "URLSearchParams", themeScript())(window, document, URLSearchParams);
  return { theme: attributes["data-theme"] ?? null, dark: classes.has("dark"), motion: attributes["data-motion"] ?? null };
}

describe("head script", () => {
  it("contains no request data, only the fixed list", () => {
    const script = themeScript();
    expect(script).toBe(themeScript());
    expect(script).toContain(JSON.stringify(THEMES));
    expect(script).not.toMatch(/<\/?script/i);
  });

  it("sets the theme from the parameter, then the cookie, then neutral", () => {
    expect(runScript("?firma=everlast", "").theme).toBe("everlast");
    expect(runScript("?firma=Refundrebel", `${THEME_COOKIE}=everlast`).theme).toBe("refundrebel");
    expect(runScript("", `other=1; ${THEME_COOKIE}=refundrebel`).theme).toBe("refundrebel");
    expect(runScript("", "").theme).toBe("neutral");
    expect(runScript("?firma=unbekannt", `${THEME_COOKIE}=everlast`).theme).toBe("neutral");
  });

  it.each(HOSTILE)("sets neutral for the parameter %j", (value) => {
    expect(runScript(`?firma=${encodeURIComponent(value)}`, "").theme).toBe("neutral");
  });

  it.each(HOSTILE)("sets neutral for the cookie %j", (value) => {
    expect(runScript("", `${THEME_COOKIE}=${encodeURIComponent(value)}`).theme).toBe("neutral");
  });

  it("survives a cookie that is not valid percent-encoding", () => {
    expect(runScript("", `${THEME_COOKIE}=%E0%A4%A`).theme).toBe("neutral");
  });

  it("does not read a cookie whose name only ends with the theme cookie name", () => {
    expect(runScript("", `x${THEME_COOKIE}=everlast`).theme).toBe("neutral");
  });

  it("agrees with themeFromRequest on every test value", () => {
    for (const value of [...HOSTILE, ...THEMES, "Everlast"]) {
      expect(runScript(`?firma=${encodeURIComponent(value)}`, "").theme).toBe(themeFromRequest(value, null));
      expect(runScript("", `${THEME_COOKIE}=${encodeURIComponent(value)}`).theme).toBe(themeFromRequest(null, value));
    }
  });

  it("starts light and switches to dark only for the exact stored value", () => {
    expect(runScript("", "").dark).toBe(false);
    expect(runScript("", "", { [MODE_KEY]: "dark" }).dark).toBe(true);
    for (const value of ["light", "Dark", "dark ", "1", "<script>", ""]) {
      expect(runScript("", "", { [MODE_KEY]: value }).dark).toBe(false);
    }
  });

  it("keeps the theme when storage is unavailable", () => {
    const attributes: Record<string, string> = {};
    const document = { cookie: "", documentElement: { setAttribute: (n: string, v: string) => (attributes[n] = v), classList: { add() {} } } };
    const window = {
      location: { search: "?firma=everlast" },
      get localStorage(): never {
        throw new Error("blocked");
      },
    };
    new Function("window", "document", "URLSearchParams", themeScript())(window, document, URLSearchParams);
    expect(attributes["data-theme"]).toBe("everlast");
  });
});

/* ------------------------------------------------------------------ */
/* Stylesheet: completeness and contrast for every mode and accent      */
/* ------------------------------------------------------------------ */

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

/** The declarations of the first rule whose selector list starts with `selector`. */
function block(selector: string): Record<string, string> {
  const index = css.indexOf(`\n${selector}`);
  if (index < 0) throw new Error(`missing block ${selector}`);
  const open = css.indexOf("{", index);
  const close = css.indexOf("}", open);
  const vars: Record<string, string> = {};
  for (const match of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[match[1]] = match[2].trim();
  return vars;
}

const light = block(":root {");
const dark = block(".dark {");

function palette(mode: "light" | "dark", theme: ThemeSlug): Record<string, string> {
  const base = { ...light, ...(mode === "dark" ? dark : {}) };
  if (theme === DEFAULT_THEME) return base;
  const lightAccent = block(`:root[data-theme="${theme}"] {`);
  const darkAccent = block(`[data-theme="${theme}"].dark,`);
  return { ...base, ...lightAccent, ...(mode === "dark" ? darkAccent : {}) };
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/;
const COLOUR_TOKENS = [
  "canvas", "surface", "raised", "hover", "track", "thumb", "line", "line-strong", "fg", "muted", "faint",
  "accent", "accent-soft", "accent-fg", "primary", "primary-hover", "chart-2", "chart-track", "hatch",
  "st-new", "st-quoted", "st-won", "st-lost", "success", "danger",
  "delta-up-bg", "delta-up-fg", "delta-down-bg", "delta-down-fg",
];

/** [foreground, background, minimum ratio, what it is] */
const PAIRS: [string, string, number, string][] = [
  ...["canvas", "surface", "raised", "hover"].flatMap((bg) =>
    ["fg", "muted", "faint"].map((fg): [string, string, number, string] => [fg, bg, 4.5, "text"]),
  ),
  ["muted", "track", 4.5, "segment labels"],
  ["fg", "thumb", 4.5, "selected segment"],
  ["accent-fg", "accent-soft", 4.5, "text on the accent tint"],
  ["accent-fg", "surface", 4.5, "accent links"],
  ["#ffffff", "primary", 4.5, "button text"],
  ["#ffffff", "primary-hover", 4.5, "button text on hover"],
  ["accent", "surface", 3, "chart marks and icons"],
  ["accent", "raised", 3, "chart marks on inner cards"],
  ["danger", "surface", 4.5, "error text"],
  ["delta-up-fg", "delta-up-bg", 4.5, "change chip"],
  ["delta-down-fg", "delta-down-bg", 4.5, "change chip"],
  ...[1, 2, 3, 4, 5].map((n): [string, string, number, string] => [`avatar-${n}-fg`, `avatar-${n}-bg`, 4.5, "initials"]),
];

describe("stylesheet", () => {
  it("defines an accent block for every company theme in both modes, and none for unknown names", () => {
    const lightBlocks = [...css.matchAll(/^:root\[data-theme="([^"]+)"\] \{/gm)].map((m) => m[1]);
    const darkBlocks = [...css.matchAll(/^\[data-theme="([^"]+)"\]\.dark,/gm)].map((m) => m[1]);
    const companies = new Set(THEMES.filter((t) => t !== DEFAULT_THEME));
    expect(new Set(lightBlocks)).toEqual(companies);
    expect(new Set(darkBlocks)).toEqual(companies);
  });

  it("uses no gradients, glows or outside resources", () => {
    expect(css).not.toMatch(/gradient\(/i);
    expect(css).not.toMatch(/url\(/i);
    expect(css).not.toMatch(/@import\s+url|https?:\/\//i);
    expect(css).not.toMatch(/drop-shadow|text-shadow/i);
  });

  for (const mode of ["light", "dark"] as const) {
    for (const theme of THEMES) {
      describe(`${theme}, ${mode}`, () => {
        const colours = palette(mode, theme);
        const value = (token: string) => (token.startsWith("#") ? token : colours[token]);

        it("has every colour token as a six-digit hex value", () => {
          for (const token of COLOUR_TOKENS) expect(colours[token], token).toMatch(HEX);
        });

        it.each(PAIRS)("%s on %s reaches %s:1 (%s)", (fg, bg, min) => {
          expect(value(fg), fg).toMatch(HEX);
          expect(value(bg), bg).toMatch(HEX);
          expect(contrast(value(fg), value(bg))).toBeGreaterThanOrEqual(min);
        });

        it("keeps the accent cool: blue, indigo, teal or green, never yellow, orange, brown or red", () => {
          const hex = colours.accent;
          const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const d = max - min;
          const hue = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
          const degrees = (hue + 360) % 360;
          expect(degrees).toBeGreaterThanOrEqual(120);
          expect(degrees).toBeLessThanOrEqual(265);
        });
      });
    }
  }
});
