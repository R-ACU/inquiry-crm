# Inquiry CRM

[![CI](https://github.com/R-ACU/inquiry-crm/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml) ![Node 24](https://img.shields.io/badge/node-24-339933) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A small CRM for a catering and events business that receives inquiries by web form and API. Next.js 16 (App Router), TypeScript, Tailwind CSS, Supabase (Auth, Postgres, row level security), TanStack Query, Zod, and a Claude-based assistant that drafts, never decides.

All data is invented. "Lindgrün Catering & Events" is not a real business.

**Live demo:** https://anfragen-crm.vercel.app (one click on the login page signs in as the owner or as staff; the data is reset every night).

![Overview as a bento grid: pipeline value as pill bars on a dark hero card, new and open inquiries, won volume, win-rate gauge, upcoming events and inquiries per week](docs/screenshots/overview-desktop.png)

*All screenshots come from the local preview with invented data; the assistant runs in test mode there (fixed answers, no model call). Deutsche Kurzfassung am Ende.*

## Problem

A caterer gets inquiries from a web form, by phone and from partner platforms. They end up in an inbox, someone forgets to answer, and nobody knows which events are confirmed or how much is in the pipeline. With more than one person on the team, a second problem appears: staff should see their own inquiries and customers, not every customer of the business.

## How it works

1. **Intake.** A web form or another system sends `POST /api/v1/inquiries` with an API key. The request is throttled, size-limited and validated, then a database function checks the hashed key, applies the per-key rate limit, finds or creates the contact and stores the inquiry as "Neu". A known e-mail address links the inquiry to the existing contact but never changes it; if the sender typed a different name or phone number, the inquiry shows it as unconfirmed.
2. **Overview.** The start page answers "where do we stand?" for 7, 30 or 90 days, as a bento grid: the pipeline value as pill bars on a dark hero card (quoted and new budgets, the hatched headroom up to the period's peak, a tooltip card that glides from pill to pill); new and open inquiries with sparklines; the won volume on an accent card; the win rate as a half-ring gauge; the next events as a timeline; inquiries per calendar week over 13 weeks. Every change chip shows a percentage only on a sound base, otherwise the amount. Every figure is computed from what the database holds (creation and closing times, budgets, the status changes the triggers logged), with the user's own RLS scope, so a staff member sees the figures of their own inquiries, and the labels say so ("Deine Übersicht", "Deine Pipeline", "Deine Zusagen").
3. **Pipeline.** The owner assigns inquiries and moves them through four stages: Neu, Angebot, Gewonnen, Verloren (drag and drop or keyboard). Every card shows the event date first, because a caterer plans by date.
4. **Detail page.** Facts, the customer's message, contact data, notes and a history that is written by database triggers. Clients cannot skip, backdate or delete entries, and nothing is deleted through the API.
5. **Assistant.** On request, Claude summarises the inquiry and proposes up to three follow-up questions. The result is a draft. Only a person can turn it into a note. The database limits drafts per person and per day before the model is called.
6. **Calendar.** Each event can be downloaded as an `.ics` file for any calendar app.
7. **Roles.** The owner sees and changes everything and manages roles and API keys. Staff see only their assigned inquiries and the contacts of those inquiries. Postgres enforces this with RLS, not the UI.
8. **Working fast.** A header with the four areas, a command palette (Ctrl+K) that finds pages, inquiries, contacts and companies the user may open, notifications for new arrivals, a profile menu with settings (reduce motion) and a shortcut help (`?`, `g` then `a`, `k`, `t` or `ü`). On a phone the areas move to a tab bar at the bottom. Switching areas works like an app: an area seen before is back at once with its data, filters and scroll position and refreshes itself quietly; a loading placeholder shows only on a first visit that takes longer than 0.4 s.

| Pipeline board | Inquiry with AI draft |
| :---: | :---: |
| ![Pipeline board, owner view](docs/screenshots/board-owner-desktop.png) | ![Inquiry detail with AI draft](docs/screenshots/inquiry-draft-desktop.png) |

| Sign-in | Command palette |
| :---: | :---: |
| ![Sign-in with photo and frosted panel](docs/screenshots/login-desktop.png) | ![Command palette searching for an inquiry](docs/screenshots/command-palette-desktop.png) |

| Board for a staff member (Mira) | Overview on a phone |
| :---: | :---: |
| ![Board for a staff member](docs/screenshots/board-staff-desktop.png) | ![Overview on a phone](docs/screenshots/overview-mobile.png) |

| Team and API keys | Phone |
| :---: | :---: |
| ![Team and API key management](docs/screenshots/team-api-desktop.png) | ![Inquiry on a phone](docs/screenshots/inquiry-mobile.png) |

| Sender not confirmed | Search without matches |
| :---: | :---: |
| ![Inquiry whose e-mail matched a known contact](docs/screenshots/inquiry-unconfirmed-sender-desktop.png) | ![Board search without matches](docs/screenshots/board-search-empty-desktop.png) |

The API key in the team screenshot is replaced by a placeholder; real keys are shown once and stored only as a hash.

More screenshots, including the chart tooltip, the profile menu, the shortcut help, the custom dropdowns, the 404 page, dark mode and all phone layouts, are in [`docs/screenshots`](docs/screenshots). The sign-in photo is CC0 (Sweet Ice Cream Photography), the typeface is Allo under the SIL Open Font License, see [docs/CREDITS.md](docs/CREDITS.md).

## Look and themes

A calm, modern SaaS dashboard: a bento grid of rounded cards (28 px outside, 22 px for cards inside cards), soft surfaces instead of lines, round icon circles and pill controls, one typeface (Allo, self-hosted, tabular figures) and plenty of air. The navigation is one header line with a command palette; there is no sidebar.

| | Light (default) | Dark |
| :--- | :--- | :--- |
| Overview | ![Overview, light](docs/screenshots/overview-desktop.png) | ![Overview, dark](docs/screenshots/overview-dark-desktop.png) |
| Board | ![Board, light](docs/screenshots/board-owner-desktop.png) | ![Board, dark](docs/screenshots/board-dark-desktop.png) |
| Inquiry | ![Inquiry, light](docs/screenshots/inquiry-draft-desktop.png) | ![Inquiry, dark](docs/screenshots/inquiry-dark-desktop.png) |

**Light and dark.** Light is the default. The sun and moon button in the header (or the `D` key) switches to a dark mode in deep black and anthracite, and this browser remembers the choice. A small script in `<head>` applies it before the first paint, so there is no flash. The overview's hero card and the API example are dark in both modes: `.dark` also works on a single card.

**An accent per company.** `?firma=<slug>` sets only the accent colour, a session cookie keeps it, and a small "Demo für ..." note appears in the header. Without a parameter the accent is blue.

| Accent | Link parameter | Overview | Dark |
| :--- | :--- | :--- | :--- |
| Blue (default) | none | ![Overview, blue accent](docs/screenshots/overview-desktop.png) | ![Overview, blue accent, dark](docs/screenshots/overview-dark-desktop.png) |
| Indigo | `?firma=everlast` | ![Overview, indigo accent](docs/screenshots/theme-everlast-overview-desktop.png) | ![Overview, indigo accent, dark](docs/screenshots/theme-everlast-overview-dark-desktop.png) |
| Teal | `?firma=refundrebel` | ![Overview, teal accent](docs/screenshots/theme-refundrebel-overview-desktop.png) | ![Overview, teal accent, dark](docs/screenshots/theme-refundrebel-overview-dark-desktop.png) |

Accents are always cool and calm; yellow, orange, brown or red never become a main colour, and red only marks errors. The demo borrows no logo, font, image or text from the companies. Values and reasons: [`docs/themes`](docs/themes).

How it is built:

- Every colour, radius and shadow in the components is a semantic token (`canvas`, `surface`, `raised`, `accent`, `muted`, ...). The values are six-digit hex variables in `src/app/globals.css`: `:root` for light, `.dark` for dark, and one small block per company accent and mode.
- The list of accents is fixed in `src/lib/theme/themes.ts`. The proxy stores only a known slug in the cookie; anything else, from the URL or a forged cookie, becomes `neutral`. No value from the request is written into HTML or CSS. The stored mode is honoured only if it is exactly `dark`.
- `tests/unit/theme.test.ts` parses the stylesheet and checks every accent in both modes: all tokens present, text on every surface at least 4.5:1, white on buttons at least 4.5:1, chart marks and icons at least 3:1, and the accent hue inside the cool range.
- Motion: gliding indicators for the navigation and every segmented control, a slight sink on button press, dialogs, menus and tooltips that scale in from their anchor, chart tooltip cards that glide from bar to bar and fade out on leave, cards that glide to their new column on the board, counting numbers and short chart entrances. 150 to 300 ms with spring easing; `prefers-reduced-motion` or the switch in the settings turns it off.

## Result

Measured on the development machine (Windows laptop, Node 24):

- **452 Vitest tests** pass in about 15 seconds: 100 database tests against Postgres (PGlite) running the shipped migrations and seed (including that every note, assignment and status change in the seed is one RLS would have allowed at that moment), 25 API tests that drive the real route handlers, the real sign-in action and the real `supabase-js` client, 327 unit tests for validation, money, time zones, calendar export, API keys, cookies, throttling, the AI layer, the overview figures and the themes (hostile values against the theme selection and the head script, and the contrast of every colour pair in every accent and mode).
- **33 Playwright tests** pass in about 85 seconds in headless Chromium against the production build (about three minutes against the dev server), and pass again on a second run against the same server. Five cover the accents and modes (each accent loads with its variables, keeps them after sign-in and logs no console errors; a hostile `?firma=` value ends up as `neutral`; dark mode survives a reload and the `D` key switches back), three cover the overview, the command palette and the keyboard shortcuts, including that a staff member's palette offers neither admin pages nor foreign inquiries. Four cover switching areas: a view seen before is back within a second even while the server's answer is held back, without a placeholder and without replaying its entrance; a card moved on the board shows on the contacts page; after signing out nothing of the session is left in the page, and the next person sees only their own data.
- **Switching back to an area takes 30 to 90 ms** to full content in the production build (local preview, headless Chromium), with no request to the server. Before, every switch rendered the page again and showed its skeleton (about 0.9 s on the dev server).
- **The tests catch regressions.** Replacing the inquiry read policy with `using (true)` made 7 of the 65 database tests fail. Restoring the column grants and the API key trigger from before the security review made 6 fail.
- **16 policies, 10 `security definer` functions,** all with an empty `search_path`. A test fails if a table without RLS, a function without a pinned search path, an unexpected definer function or any new right for `anon` appears.
- `npm audit --omit=dev`: 0 known vulnerabilities at build time.

Not measured yet, because it needs the real Claude API: quality of summaries and questions on real inquiries, latency and cost per draft. The mock mode answers instantly with fixed text; those numbers say nothing about the model.

## Limits

- The live demo runs on the Supabase free plan (Frankfurt) and Vercel, with the assistant in test mode. It is reset to the seed every night, so whatever a visitor changes is gone the next day. Test figures above come from the local stand-in.
- Inquiries cannot be created by hand in the UI; they arrive through the API.
- No e-mail sending, no payments, no two-way calendar sync (see [DECISIONS.md](DECISIONS.md)).
- On the dev server (`npm run preview`), Next.js 16.4 does not learn the route of the page that was loaded first, nor of the start page after sign-in, so a return there waits for the server once more (about 0.3 to 0.5 s; the previous page stays visible, no placeholder). The production build prefetches the links and has no such wait.
- The browser tests change in-memory data. They clean up after themselves, but the AI draft limit (6 per person per 10 minutes) can trip after several runs in a row; restart the preview to reset.
- The AI origin of a draft is what the server records, not a proof (see SECURITY.md).
- Security trade-offs and open points are listed in [SECURITY.md](SECURITY.md).

## Run it locally

Requirements: Node 24, npm. No Docker, no Supabase account.

```bash
npm ci
npm run preview          # local Supabase stand-in on :3211 and Next.js dev server on :3210
```

Open http://127.0.0.1:3210 and sign in. Password for all three: `Lindgruen-Demo-2026`

| Account | Role |
| :--- | :--- |
| `lena@lindgruen.example` | owner |
| `jonas@lindgruen.example` | staff |
| `mira@lindgruen.example` | staff |

The stand-in keeps data in memory and resets to the seed on every start. The seed shows a team at work: notes, assignments (including one handover), status changes and an accepted AI draft by all three people, each a step RLS would have allowed at that moment (`tests/db/seed-history.test.ts`). The seed is written as of 24 November 2026 and moves itself to the day it runs: timestamps by whole days (the newest inquiry is from today, or yesterday early in the morning), event dates by whole weeks so weekdays stay, so the overview and the upcoming events are never empty. The app itself never moves a date. For a production build: `npm run build`, then `PREVIEW_MODE=start npm run preview`.

## Tests and checks

```bash
npm test                 # all Vitest suites: unit, API, RLS
npm run test:db          # only the RLS and SQL function tests
npm run test:e2e         # Playwright, starts the preview itself if it is not running
npm run screenshots      # regenerates docs/screenshots (run against a fresh preview)
npm run lint
npm run typecheck        # run `npx next typegen` once first on a fresh checkout
npm run build
```

CI runs the same steps on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Project layout

```
src/app/                    pages (App Router) and route handlers
  api/v1/inquiries/         public intake API (API key)
  api/inquiries/[id]/calendar/   .ics export (session)
src/lib/data/               read queries, all with the user's session
src/lib/actions/            Server Actions: validate with Zod, write with the user's session
src/lib/domain/             pure logic: KPIs, money, time zones, ICS, intake schema, API keys, throttling
src/lib/ai/                 assistant: real mode (Claude), mock mode, prompts, output schemas
src/lib/theme/              theme list, selection and the head script
src/lib/domain/overview.ts  figures for the overview: periods, status timeline, weeks, upcoming events
src/components/overview/    overview page and its charts (plain SVG and CSS, no chart library)
src/components/shell/       header, command palette, notifications, profile menu, shortcuts
supabase/migrations/        schema, RLS policies, privileges, functions, triggers
supabase/seed.sql           invented demo data: 3 users, 20 contacts, 30 inquiries, the team's notes and history
fixtures/ai/                fixed assistant answers for mock mode
tests/                      Vitest: unit, api, db (PGlite harness in tests/support)
e2e/                        Playwright tests, preview script, local Supabase stand-in
docs/themes/                what each company theme borrows, with the measured values
```

## Intake API

```bash
curl -X POST https://your-app.example/api/v1/inquiries \
  -H "Authorization: Bearer crm_xxxxxxxx_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"Greta Sommer","email":"greta@post.example","title":"Gartenfest im Juli","eventDate":"2027-07-17","startTime":"15:00","guestCount":45,"budgetEur":2000,"source":"web_form"}'
```

Required: `name`, `email`, `title`. Optional: `phone`, `company`, `message`, `eventType` (`corporate`, `wedding`, `private`, `conference`, `other`), `eventDate` (YYYY-MM-DD), `startTime` and `endTime` (HH:MM, Europe/Berlin), `guestCount`, `budgetEur`, `location`, `source` (`web_form` or `api`). Unknown fields are rejected.

| Status | Code | Meaning |
| :--- | :--- | :--- |
| 201 | | Created, body `{ "data": { "inquiryId", "status": "new" } }` |
| 400 | `invalid_json` | Body is not JSON |
| 401 | `missing_api_key`, `invalid_api_key` | No key, malformed, unknown or revoked |
| 413 | `payload_too_large` | Body over 16 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` | Field errors in `details` |
| 429 | `rate_limited` | Too many requests; see `Retry-After` |

API keys are created by an owner under "Team und API". The key is shown once and belongs on a server, never in a web page's source.

## Go live

Steps as run for the live demo.

1. **Create the Supabase project.** supabase.com, New project, region `eu-central-1` (Frankfurt). Store the database password in a password manager.
2. **Link the repository.**
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. **Apply schema and auth settings.**
   ```bash
   npx supabase db push              # runs supabase/migrations
   npx supabase config push          # sign-up disabled, password rules, site URL from config.toml
   ```
   Then in the dashboard under Authentication, URL Configuration, set the Site URL to the Vercel URL from step 5 (every `config push` sets it back to the local one). Keep `[auth.email] enable_signup = true` in `config.toml`: on hosted Supabase that switch is the whole e-mail provider, and `false` blocks sign-in with e-mail and password ("Email logins are disabled"). Sign-ups stay closed through `[auth] enable_signup = false`; `tests/unit/supabase-config.test.ts` guards both.
4. **Load the demo data.**
   ```bash
   npx supabase db push --include-seed
   ```
   If the CLI reaches the database through Supabase's connection pooler (no IPv6), the seed fails with `schema "pg_temp" does not exist`: it uses temporary helper functions, which need one session. Then paste `supabase/seed.sql` into the SQL editor instead, or run it with `psql` over the direct connection. The seed moves all dates to the day it runs. The live demo is reset every night by emptying the public tables and the auth users and running the seed again in one session.
5. **Deploy on Vercel.** Import the GitHub repository, framework Next.js. Environment variables (Production and Preview):
   | Name | Value |
   | :--- | :--- |
   | `SUPABASE_URL` | Project Settings, API, Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | Project Settings, API Keys, publishable key (not the secret key) |
   | `APP_URL` | `https://<your-app>.vercel.app` |
   | `AI_MODE` | `mock` (keep it for a public demo; see step 8) |
   | `DEMO_LOGIN_PASSWORD`, `DEMO_LOGIN_ACCOUNTS` | Public demo only: the seed password and a JSON list such as `[{"email":"lena@lindgruen.example","name":"Lena Hoffmann","role":"Inhaberin"}]`. The login page then shows a "Demo-Zugang" card with one sign-in button per account. They are read when the page is built, so redeploy after changing them. Leave both unset anywhere else. |
6. **Test login.** Open the Vercel URL, sign in as `jonas@lindgruen.example` with `Lindgruen-Demo-2026`: 12 inquiries. Then as `lena@lindgruen.example`: 30 inquiries, and "Team und API" is visible.
7. **Smoke-test the API.** As Lena, create a key under "Team und API", run the curl example above against the Vercel URL, expect `201`, and see the inquiry under "Neu".
8. **Optional: real AI, not for a public demo.** Set `AI_MODE=anthropic` and `ANTHROPIC_API_KEY` in Vercel only for a private deployment. Every "Entwurf erstellen" then costs API credits; the database allows 6 drafts per person in 10 minutes and 100 per day. Also set a monthly spend limit in the Anthropic Console.
9. **Check.** Supabase dashboard, Advisors, Security: there should be no RLS warnings. Regenerate the TypeScript types from the live schema: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
10. **Before sharing the link.** The seed passwords are public in this README, and the demo card shows them on the login page. Keep `AI_MODE=mock` and reset the demo regularly (step 4); anything a visitor adds as the owner (API keys, inquiries, team members) disappears with the next reset.

## License

MIT, see [LICENSE](LICENSE).

---

## Deutsche Kurzfassung

**Problem.** Ein Catering-Betrieb bekommt Anfragen über Webformular, Telefon und Partner. Sie gehen im Postfach unter, niemand weiß, was bestätigt ist, und Mitarbeiter sollen nur ihre eigenen Kunden sehen.

**Ablauf.** Anfragen kommen über eine abgesicherte API (gehashter API-Schlüssel, Zod-Prüfung, Größenlimit, Drosselung). Passt die E-Mail zu einem bekannten Kontakt, wird die Anfrage zugeordnet, der Kontakt aber nie überschrieben; abweichende Angaben erscheinen als „nicht bestätigt“. Die Inhaberin weist Anfragen zu und schiebt sie durch Neu, Angebot, Gewonnen, Verloren. Jede Karte zeigt zuerst den Eventtermin. Auf der Detailseite stehen Notizen und ein Verlauf, den Datenbank-Trigger schreiben; löschen lässt sich über die API nichts. Die Demodaten zeigen ein Team im Betrieb: Notizen, Zuweisungen (auch eine Übergabe) und Statuswechsel von allen drei Personen, jeweils so, wie RLS es in dem Moment erlaubt hätte. Claude fasst auf Knopfdruck zusammen und schlägt Rückfragen vor, aber nur als Entwurf: Übernehmen muss ein Mensch, und die Datenbank begrenzt die Entwürfe pro Person und Tag. Anmeldungen werden pro E-Mail-Adresse und pro Client gedrosselt. Termine gibt es als `.ics`-Datei. Wer was sieht, erzwingt Postgres mit Row Level Security, nicht die Oberfläche.

**Übersicht und Bedienung.** Die Startseite zeigt für 7, 30 oder 90 Tage ein Bento-Raster: den Pipeline-Wert als Pillen-Balken auf einer dunklen Hauptkarte, neue und offene Anfragen mit Verlaufslinie, das zugesagte Volumen auf einer Akzentkarte, die Abschlussquote als Halbring, die nächsten Termine als Zeitleiste und die Anfragen je Kalenderwoche. Veränderungen stehen nur bei tragfähiger Basis in Prozent, sonst als Betrag. Alles wird aus den Daten berechnet, die die Datenbank für den angemeldeten Menschen freigibt; Mitarbeiter sehen ihre eigenen Zahlen, und die Beschriftungen sagen es („Deine Pipeline“, „Deine Zusagen“). Oben eine Kopfnavigation mit Befehlspalette (Strg+K), Benachrichtigungen, Profilmenü und Tastenkürzeln, auf dem Telefon eine Leiste unten.

**Look und Themes.** Ein ruhiges, gerundetes SaaS-Dashboard mit Bento-Karten, der Schrift Allo und weichen Flächen statt Linien, hell als Standard und mit einem Schalter (oder der Taste D) dunkel in tiefem Schwarz; der Browser merkt sich die Wahl. `?firma=everlast` oder `?firma=refundrebel` ändert nur die Akzentfarbe (Indigo, Teal), ohne Parameter ist sie blau. Akzente sind immer kühl, Rot steht nur für Fehler. Die Auswahl kommt aus einer festen Liste, alles andere fällt auf neutral zurück; ein Unit-Test prüft den Kontrast jedes Farbpaars in jedem Akzent und Modus nach WCAG AA.

**Ergebnis.** 452 Vitest-Tests (davon 100 gegen eine echte Postgres-Engine mit den ausgelieferten Migrationen) und 33 Playwright-Tests sind grün. Ein schon besuchter Bereich ist beim Zurückwechseln in 30 bis 90 ms vollständig da, ohne Ladeanimation und ohne Anfrage an den Server; nach dem Abmelden bleibt nichts von der Sitzung im Tab. Eine absichtlich kaputte Policy ließ 7 Datenbanktests fehlschlagen, die alten Rechte von vor der Sicherheitsprüfung 6. Qualität, Dauer und Kosten der KI-Entwürfe sind noch nicht gemessen, das geht erst mit der echten API.

**Live:** https://anfragen-crm.vercel.app, ein Klick auf der Anmeldeseite meldet als Inhaberin oder Mitarbeiter an, die Daten werden jede Nacht zurückgesetzt.

**Grenzen.** Kostenloses Supabase-Projekt, Assistent im Testmodus, keine manuelle Anfrage-Erfassung, kein Mailversand, keine Zahlung. Details in [SECURITY.md](SECURITY.md) und [DECISIONS.md](DECISIONS.md).

**Starten.** `npm ci`, dann `npm run preview`, dann http://127.0.0.1:3210 öffnen (mit `?firma=everlast` oder `?firma=refundrebel` im Firmenstil). Passwort für alle drei Konten: `Lindgruen-Demo-2026`.
