# Decisions

Why the CRM is built the way it is, what happens when something fails, and what the AI may and may not do.

## Architecture

**The database enforces access, not the UI.** Every rule about who sees what lives in Postgres RLS policies and column privileges (`supabase/migrations`). The UI hides buttons for convenience only. A forgotten check in a Server Action therefore leaks nothing: the query still runs as the signed-in user.

**The browser never talks to Supabase.** All reads and writes go through Server Components, Server Actions and a few route handlers, each with the user's session. This keeps the session cookies `HttpOnly`, keeps the anon key off the client, and gives one place (`src/lib/data`, `src/lib/actions`) to read when reviewing data access.

**No service-role key in the app.** The public intake API calls one narrow `security definer` function as `anon` instead. If the app's environment leaked, nothing in it bypasses RLS.

**Column privileges where policies are not enough.** A policy sees only the new row, so it cannot stop "set role to owner" or "point my inquiry at a foreign contact". Granting `INSERT` and `UPDATE` only on specific columns closes both, and keeps timestamps, authors, status and source out of the client's hands.

**Nothing is deleted through the API.** Notes and history are the record of a customer relationship, and no screen deletes anything. Without a `DELETE` privilege, nobody can make an inquiry and its history disappear. Erasing a person's data is an operator task in SQL.

**`security definer` only where needed.** Eleven functions: the role change, the intake, accepting and discarding AI drafts, the AI budget, the two sign-in throttle functions, three triggers that write to tables users may not write to (profiles on sign-up, history), and `current_workspace`, which the profiles policy needs without running itself again. Each pins `search_path = ''` and says in a comment why it needs the elevated rights; the ones acting for a user check visibility themselves, because RLS does not apply inside. A test fails if another one appears.

**History through triggers.** Status changes, assignments and AI decisions are logged by triggers with `auth.uid()` as actor, so a client cannot skip, backdate or forge an entry. The content of an AI draft is the one part a member can write directly (see SECURITY.md, Known limits).

**Intake never trusts the sender's identity.** The intake matches contacts by e-mail, because that is how a returning customer is recognised. But the e-mail is not verified, so a match never changes the contact: what the sender typed is kept with the inquiry and shown as unconfirmed when it differs. Anyone can type a customer's address into a web form; nobody can make the CRM show their message under that customer's name without a warning.

**Throttles live in the database.** Serverless instances share no memory, so every limit that matters (API keys, sign-in failures, AI drafts) is counted in Postgres. The in-memory throttle on the intake route is only a cheap first filter.

**State management.** Server Components render pages; the inquiry detail page also renders its data on the server and refreshes with `useOptimistic` and `router.refresh()`. The four main areas (overview, board, contacts, team) keep their data in TanStack Query instead, because switching between them should feel like an app, not like loading a page: the page passes the server's promise to its view, which waits for it only on the first visit and then renders from the cache, refreshing quietly in the background (`/api/views/:view`, same loaders, same RLS). Next.js keeps visited pages for five minutes (`staleTimes.dynamic`) and the last three alive and hidden, so a return needs no server at all. After a change every cached view refetches at once, also the hidden ones; moving a card is still applied optimistically and snaps back on an error. The cache belongs to one member: the app layout keys all client state by member and role, and signing out is a plain form post that reloads the page.

**Entrances play once.** Numbers count up, charts grow and rows rise in when a view first appears. A kept page that is shown again, or a view rebuilt from the cache, appears as it is, because replaying the entrance looks like loading. CSS animations restart whenever a hidden element is shown again and Motion replays its entrances in the same case, so rows and cards rise in through the Web Animations API, started once per element (`components/ui/rise-in.ts`). Loading placeholders appear only after 0.4 s, so a quick first visit shows none.

**Money and time.** Budgets are integer cents. Event dates and times are stored as wall-clock values in Europe/Berlin, because that is how a caterer thinks about an event. The calendar export converts them to UTC, which every calendar app reads correctly without a time zone block; daylight saving is covered by tests.

**Two languages: one build each, one database, two workspaces.** English-speaking companies get an English demo with an Irish business ("Larkspur Catering & Events", Dublin; EUR, VAT and IBAN stay as they are), German ones keep the German demo. The language is a build setting (`APP_LOCALE`, inlined by `next.config.ts`), so every text, date and number format and the business time zone (Dublin or Berlin) switch together and nothing in a request can change them; texts sit next to the component in `pick({ de, en })`, and TypeScript checks that both have the same keys. The data cannot be a build setting: the free Supabase plan has room for one project. Both businesses therefore live in one database as two workspaces, and the database keeps them apart the same way it keeps staff apart, with RLS: every policy also asks for the caller's workspace, the definer functions check it themselves, and a trigger stops links across the wall. The text the database writes itself (the note made from an accepted AI draft) follows the workspace. Each seed touches only its own workspace, and the nightly reset loads both.

**Local preview without a Supabase project.** No Docker on the development machine, and no auth bypass in the app. Instead `e2e/mock-supabase` runs the real migrations and seed in PGlite (Postgres compiled to WebAssembly) and serves the parts of the PostgREST and Auth HTTP API this app uses. Requests run as the real API roles, so the preview and the browser tests hit the same RLS policies as production. The app does not know the difference; it only sees a different `SUPABASE_URL`.

**One look, an accent per company, light and dark.** A CRM someone would buy looks like a calm, modern SaaS dashboard: a bento grid of rounded cards, one typeface (Allo) with tabular figures, soft surfaces instead of lines, light by default with a dark mode in deep black. Copying each company's website was tried and dropped: it produced warm yellow, square, condensed variants nobody wanted to work in. Now `?firma=<slug>` changes only the accent colour, always a cool, calm one (blue, indigo, teal), and a session cookie keeps it. The mode is a switch in the header, kept in `localStorage`. Both are applied by a constant script in `<head>` before the first paint, not by the server: reading cookies in the root layout would make every page dynamic and give up the prerendered shells. Colours are six-digit hex tokens in one stylesheet, so a unit test can parse them and check WCAG AA for every pair in every mode and accent.

**An overview computed from the record, not stored figures.** The start page shows key figures and charts for 7, 30 or 90 days. They are computed from rows the user may read: creation and closing times, budgets, and the status changes the history triggers logged. Replaying that log gives the stage of every inquiry at any point in time, so "open budget per stage over time" is a fact, not a guess. With RLS, a staff member automatically sees the figures of their own work. With hundreds of inquiries per day this would move into a SQL view; for a caterer's volume, one query and a pure function (unit-tested) are simpler and need no new privileges.

**Recharts for the charts, styled by the tokens.** Pill bars, the hatched headroom, the half-ring gauge, sparklines and tooltip cards are Recharts with custom shapes and colours taken straight from the CSS variables, so a dark card inside a light page (the overview's hero) draws itself in dark tokens. Recharts brings hover state, tooltips and entrance animations that respect reduced motion; hand-rolled SVG had to reimplement all of that. Each chart still has a text alternative (an accessible name or a hidden table).

**Motion where something changes.** The navigation and every segmented control have a gliding thumb, buttons sink slightly on press, dialogs, menus and tooltips scale in from their anchor, the page content fades in on navigation, board cards glide to their new column after a drop, numbers count up. Durations stay between 150 and 300 ms with spring easing (Motion for React, CSS for the simple cases), and `prefers-reduced-motion` or the switch in the settings turns movement off.

**A header, not a sidebar.** Four areas fit into one header line, which leaves the full width to the board and the charts. A command palette (Ctrl+K) and keyboard shortcuts cover fast work; on a phone the areas become a tab bar in thumb reach.

## The AI assistant

**What it does.** On request it summarises an inquiry in two or three sentences, proposes up to three follow-up questions for a quote, and suggests an event type. Claude Sonnet writes the text, Claude Haiku does the classification; both calls run in parallel on the server.

**What it may not do.**
- It cannot change data. The model has no tools. Its output is stored as a pending draft.
- It cannot act without a person. Only "Als Notiz übernehmen" turns a draft into a note, in the name of the person who clicked. Discarding is logged too. Both go through database functions that record who decided and when; the table itself cannot be updated.
- It never sees data the user may not see: the inquiry is loaded with the user's session before the prompt is built.
- It does not calculate prices or promise anything. The prompt says so, and nothing it writes is sent to a customer automatically.

**When it fails.** Output must parse against a Zod schema with length limits (structured outputs). A refusal, an unusable answer or an API error produces a clear message and no draft. If only the classification fails, the draft is kept without an event type. Before the model is called, the database reserves a slot: six drafts per person in ten minutes and 100 per day for the whole business. A request over the limit never reaches the API.

**Mock mode by default.** Tests, the preview and a public demo run without API calls; the interface calls it "Testmodus". Fixed answers for selected seed inquiries live in `fixtures/ai/drafts.json` and pass through the same schema as real output; other inquiries get a deterministic draft built from their missing fields. Real mode needs `AI_MODE=anthropic` and a key in `.env.local`.

## Found and fixed during the build

- A staff member could have pointed one of their own inquiries at any contact ID and thereby made that contact visible through the contacts policy. Closed with column privileges (`contact_id` is not updatable) and a test.
- Next.js 16 with Cache Components flagged `Date.now()` inside the Supabase auth client during prerendering. Fixed by calling `connection()` before the session is read, so session-dependent work is always request-time.
- The first drag-and-drop browser test moved the wrong card: Playwright scrolled the long target column into view while the mouse button was down. The test now drops on the column header, which stays in view.
- Every switch between the areas rendered the page again on the server and showed its skeleton, even for a view seen seconds before. Now the views render from the client cache and Next.js reuses visited pages; `e2e/navigation.spec.ts` holds the server answer back and still expects the view at once. On the way, two things came up: returning to a kept page replayed every entrance animation, and after signing out the previous person's board stayed hidden in the page. Both are fixed and tested.

### Found in the security and design review

An independent review attacked the running preview and the schema. Everything below is fixed and covered by a test unless noted.

- A member could insert AI drafts with a chosen creation time and mark them accepted directly, which logged a decision without a note. Drafts are now decided only through `accept_ai_draft` and `discard_ai_draft`, and inserts are limited to the content columns.
- An intake request with a known customer's e-mail appeared under that customer's name, and the API response revealed the internal contact id. Now flagged as unconfirmed, with the typed values shown, and the response returns only the inquiry id.
- Sign-in ran on the server, so Supabase Auth's per-address limit applied to all users together. The app now throttles per e-mail address and per client address in the database.
- The AI draft limit lived in the memory of one server instance. It is now enforced in the database, with a daily limit on top.
- Notes could be backdated, an owner could set source and timestamps on insert, deleting an inquiry removed its history, a revoked API key could be reactivated, a staff member could probe for e-mail addresses through unique violations, and new tables would have inherited Supabase's broad default privileges. All closed with column privileges, removed delete rights, a trigger, and revoked default privileges.
- Design: ambiguous dates ("Jan 27"), truncated customer names, faint text below WCAG AA contrast, a generic 404 that talked about inquiries, small touch targets on phones and a flat contact list on phones.

## Deliberately not built

- **Creating inquiries by hand in the UI.** New inquiries arrive through the intake API (web form, other systems). A manual form is the obvious next feature.
- **Sending e-mail.** The assistant's questions can be copied; sending needs a mail provider, templates and consent handling.
- **Payments.** A deposit link (for example Stripe Checkout) after "Gewonnen" would be the natural next integration.
- **Two-way calendar sync.** The `.ics` export covers the common case without storing anyone's calendar credentials.
