/**
 * Visual themes. The same app can be shown in the style of the company that
 * looks at it: `?firma=<slug>` picks a theme, a session cookie keeps it.
 *
 * Only slugs from this fixed list ever reach the page. Anything else, from
 * the URL or the cookie, falls back to the neutral theme, so no outside
 * value is ever written into HTML or CSS. The colours themselves live in
 * globals.css under `:root[data-theme="<slug>"]`.
 */
export const THEMES = ["neutral", "everlast", "refundrebel"] as const;

export type ThemeSlug = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeSlug = "neutral";

/** URL parameter that selects a theme. */
export const THEME_PARAM = "firma";

/** Session cookie that keeps the theme. Not HttpOnly: the head script reads it before the first paint. */
export const THEME_COOKIE = "crm-theme";

/** Light or dark. Light is the default; the choice lives in this browser (localStorage). */
export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_KEY = "crm-mode";

/** "Reduce motion" switch in the app's settings, also kept in this browser. */
export const MOTION_KEY = "crm-motion";

/** Company names for the small "Demo für ..." note. The neutral theme shows none. */
export const THEME_COMPANY: Record<ThemeSlug, string | null> = {
  neutral: null,
  everlast: "Everlast",
  refundrebel: "refundrebel",
};

const MAX_LENGTH = 32;

/**
 * Maps any input to a known theme. Case is ignored ("Everlast" works in a
 * link), everything else must match exactly: no trimming, no prefixes, no
 * lookups on an object that could hit `__proto__` or `constructor`.
 */
export function resolveTheme(value: unknown): ThemeSlug {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return DEFAULT_THEME;
  const lower = value.toLowerCase();
  return (THEMES as readonly string[]).includes(lower) ? (lower as ThemeSlug) : DEFAULT_THEME;
}

/**
 * Picks the theme for a request: an explicit `?firma=` wins (an unknown
 * value selects neutral on purpose), otherwise the cookie, otherwise neutral.
 */
export function themeFromRequest(param: string | null | undefined, cookie: string | null | undefined): ThemeSlug {
  if (param !== null && param !== undefined) return resolveTheme(param);
  return resolveTheme(cookie);
}

/**
 * The inline script for <head>. It runs while the HTML is parsed, before the
 * first paint, so a prerendered page never flashes in the wrong theme. It
 * mirrors themeFromRequest. The script text is a constant built from the
 * fixed list above and contains no request data.
 */
export function themeScript(): string {
  const list = JSON.stringify(THEMES);
  return [
    "(function(){try{",
    `var L=${list},d=${JSON.stringify(DEFAULT_THEME)},t=null;`,
    `var p=new URLSearchParams(window.location.search).get(${JSON.stringify(THEME_PARAM)});`,
    "if(p!==null){t=p}else{",
    `var m=document.cookie.match(/(?:^|; )${THEME_COOKIE.replace(/-/g, "\\-")}=([^;]*)/);`,
    "if(m){try{t=decodeURIComponent(m[1])}catch(e){t=null}}}",
    `t=(typeof t==="string"&&t.length>0&&t.length<=${MAX_LENGTH})?t.toLowerCase():"";`,
    'document.documentElement.setAttribute("data-theme",L.indexOf(t)>=0?t:d)',
    "}catch(e){}",
    // Mode: only the exact value "dark" switches; anything else stays light.
    `try{if(window.localStorage.getItem(${JSON.stringify(MODE_KEY)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
    `try{if(window.localStorage.getItem(${JSON.stringify(MOTION_KEY)})==="reduce")document.documentElement.setAttribute("data-motion","reduce")}catch(e){}`,
    "})()",
  ].join("");
}
