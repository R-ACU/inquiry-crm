/**
 * Language of this deployment. One build serves one language: APP_LOCALE is
 * read when the app is built (next.config.ts inlines it into server and
 * browser code), so a page never mixes languages and nothing in the request
 * can switch it. "de" is the default; "en" is the English demo.
 *
 * The language only picks texts and formats. Which rows a person may see is
 * decided by the database (RLS and the member's workspace), never by this.
 */
export type Locale = "de" | "en";

export const LOCALE: Locale = process.env.APP_LOCALE === "en" ? "en" : "de";

/** BCP 47 tag for Intl: German as in Germany, English as in Ireland (EUR, 24-hour clock, day before month). */
export const INTL_LOCALE = LOCALE === "en" ? "en-IE" : "de-DE";

/**
 * Time zone of the business. Event dates and times are stored as wall-clock
 * values of this zone (see DECISIONS.md, "Money and time").
 */
export const BUSINESS_TIME_ZONE = LOCALE === "en" ? "Europe/Dublin" : "Europe/Berlin";

/**
 * Picks the texts of this deployment's language. Both languages must have
 * the same shape; TypeScript checks the English entry against the German one.
 *
 *   const T = pick({ de: { save: "Speichern" }, en: { save: "Save" } });
 */
export function pick<T>(messages: { de: T; en: NoInfer<T> }): T {
  return messages[LOCALE];
}
