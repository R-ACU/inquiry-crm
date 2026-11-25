-- Demo data for "Lindgrün Catering & Events", a fictional catering business:
-- the German demo, workspace 'de'. The English demo is seed-en.sql (workspace
-- 'en'); both live in the same database and RLS keeps them apart. Every
-- statement here touches only rows of workspace 'de'.
-- Every person, company, address and e-mail address here is invented.
-- E-mail addresses use the reserved .example top-level domain.
--
-- Logins (password for all three: Lindgruen-Demo-2026)
--   lena@lindgruen.example   Lena Hoffmann   owner
--   jonas@lindgruen.example  Jonas Weber     staff
--   mira@lindgruen.example   Mira Schulz     staff

-- ---------------------------------------------------------------------------
-- Demo clock. The data below is written as of Tuesday, 24 November 2026; the
-- seed moves it to the day it runs, so the newest inquiry is from today (or
-- yesterday, if its time of day has not come yet) and the events lie ahead.
--   seed_at   timestamps (inquiries, notes, history, contacts): by whole days,
--             keeping the Berlin time of day
--   seed_on   event dates: by whole weeks, so a Saturday wedding stays on a
--             Saturday; never more than three days off the timestamps
-- Set app.seed_now (e.g. select set_config('app.seed_now', '2027-03-01 12:00+01', false))
-- before running this file to seed as of a fixed moment; tests do that.
-- The app itself never moves a date. Day arithmetic below ("+ interval '2 days'")
-- runs in Berlin time, so it gives the same wall-clock time before and after a move.
-- ---------------------------------------------------------------------------

set timezone to 'Europe/Berlin';

create or replace function pg_temp.seed_now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.seed_now', true), '')::timestamptz, now())
$$;

create or replace function pg_temp.seed_days() returns integer language sql stable as $$
  with d as (
    select ((pg_temp.seed_now() at time zone 'Europe/Berlin')::date - date '2026-11-24') as n
  )
  select case
           -- 08:05 on 24 November is the newest inquiry; it must not land in the future.
           when ((timestamptz '2026-11-24 08:05+01' at time zone 'Europe/Berlin') + make_interval(days => n))
                at time zone 'Europe/Berlin' > pg_temp.seed_now() then n - 1
           else n
         end
    from d
$$;

create or replace function pg_temp.seed_at(ts timestamptz) returns timestamptz language sql stable as $$
  select ((ts at time zone 'Europe/Berlin') + make_interval(days => pg_temp.seed_days())) at time zone 'Europe/Berlin'
$$;

create or replace function pg_temp.seed_on(d date) returns date language sql stable as $$
  select d + (round(pg_temp.seed_days() / 7.0) * 7)::integer
$$;

-- ---------------------------------------------------------------------------
-- Users. The on_auth_user_created trigger creates a staff profile for each,
-- in the workspace named in the app metadata.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('Lindgruen-Demo-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"workspace":"de"}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  pg_temp.seed_at('2026-09-01 09:00+02'), now(),
  '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'lena@lindgruen.example', 'Lena Hoffmann'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'jonas@lindgruen.example', 'Jonas Weber'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'mira@lindgruen.example', 'Mira Schulz')
) as u(id, email, full_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003'
);

update public.profiles set role = 'owner' where id = 'a0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------

insert into public.contacts (id, full_name, company, email, phone, created_by, created_at, workspace) values
  ('c0000000-0000-4000-8000-000000000001', 'Tobias Krüger',   'Nordlicht Software GmbH',          'tobias.krueger@nordlicht-software.example', '040 555 0101', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-14 10:12+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000002', 'Sabine Albers',   'Kanzlei Albers & Partner',         's.albers@kanzlei-albers.example',           '040 555 0102', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-18 15:40+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000003', 'Daniel Yilmaz',   null,                               'daniel.yilmaz@post.example',                '0170 555 0103', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-22 19:05+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000004', 'Katrin Vogel',    'Vogel Architekten',                'k.vogel@vogel-architekten.example',         '040 555 0104', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-25 11:30+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000005', 'Martin Becker',   'Hafenwerk Logistik AG',            'martin.becker@hafenwerk.example',           '040 555 0105', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-29 08:50+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000006', 'Anna Petersen',   null,                               'anna.petersen@post.example',                '0151 555 0106', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-02 21:14+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000007', 'Felix Brandt',    'Brandt Immobilien',                'felix@brandt-immobilien.example',           '040 555 0107', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-05 13:22+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000008', 'Julia Neumann',   'Verband Norddeutscher Gärtnereien', 'j.neumann@gaertnereiverband.example',      '040 555 0108', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-07 09:41+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000009', 'Ömer Aydin',      'Autohaus Aydin',                   'oemer.aydin@autohaus-aydin.example',        '040 555 0109', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-09 16:03+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000010', 'Laura Fischer',   null,                               'laura.fischer@post.example',                '0160 555 0110', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-12 18:27+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000011', 'Henrik Lange',    'Lange Maschinenbau GmbH',          'h.lange@lange-maschinenbau.example',        '04101 555 0111', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-14 10:55+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000012', 'Sophie Wagner',   'Zahnarztpraxis Dr. Wagner',        'praxis@dr-wagner.example',                  '040 555 0112', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-16 12:08+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000013', 'Paul Schröder',   'Schröder & Söhne Bau',             'paul@schroeder-bau.example',                '040 555 0113', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-19 07:46+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000014', 'Clara Hartmann',  'Kulturverein Altstadt e. V.',      'vorstand@kulturverein-altstadt.example',    null,           'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-21 20:30+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000015', 'Niklas Wolf',     'Fernweh Labs',                     'niklas@fernweh-labs.example',               '0176 555 0115', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-23 14:17+02'), 'de'),
  ('c0000000-0000-4000-8000-000000000016', 'Eva Richter',     null,                               'eva.richter@post.example',                  '0157 555 0116', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-27 17:52+01'), 'de'),
  ('c0000000-0000-4000-8000-000000000017', 'Moritz Klein',    'Klein Steuerberatung',             'm.klein@klein-steuer.example',              '040 555 0117', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-29 09:09+01'), 'de'),
  ('c0000000-0000-4000-8000-000000000018', 'Lea Zimmermann',  'Akademie für Gestaltung Nord',     'events@akademie-gestaltung.example',        '040 555 0118', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-02 11:44+01'), 'de'),
  ('c0000000-0000-4000-8000-000000000019', 'Ben Hofmann',     null,                               'ben.hofmann@post.example',                  '0171 555 0119', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-05 22:01+01'), 'de'),
  ('c0000000-0000-4000-8000-000000000020', 'Marie Schmitt',   'Schmitt Druck GmbH',               'marie.schmitt@schmitt-druck.example',       '040 555 0120', 'a0000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-09 08:33+01'), 'de');

-- ---------------------------------------------------------------------------
-- Inquiries: 30 in total, 12 for Jonas, 12 for Mira, 6 not yet assigned.
-- ---------------------------------------------------------------------------

insert into public.inquiries (
  id, contact_id, title, message, status, source, event_type,
  event_date, start_time, end_time, guest_count, budget_cents, location,
  assigned_to, created_at, closed_at, workspace
) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'Weihnachtsfeier Nordlicht Software',
   'Hallo, wir planen unsere Firmenfeier am ' || to_char(pg_temp.seed_on('2026-12-12'), 'FMDD.FMMM.') || ' mit etwa 40 Personen. Gemischt vegetarisch und mit Fleisch, gern Fingerfood und ein warmes Hauptgericht. Unser Budget liegt bei rund 1.500 €. Können Sie uns ein Angebot schicken?',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2026-12-12'), '18:00', '23:00', 40, 150000, 'Nordlicht Software, Speicherstadt 4',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-23 09:14+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'Kanzleiempfang zum Jahresauftakt',
   'Wir laden Mandanten zum Neujahrsempfang ein. Stehempfang mit Fingerfood, Sekt und alkoholfreien Alternativen. Etwa 60 Gäste.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-01-15'), '17:00', '21:00', 60, 320000, 'Kanzlei Albers, Ballindamm 12',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-28 14:02+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   '40. Geburtstag im Garten',
   'Ich werde 40 und möchte im Garten feiern. Grillbuffet mit vegetarischen Optionen, Kuchen am Nachmittag. 35 Gäste, davon 8 Kinder.',
   'won', 'web_form', 'private', pg_temp.seed_on('2027-05-22'), '14:00', '22:00', 35, 180000, 'Privatgarten, Elbchaussee',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-03 20:11+02'), pg_temp.seed_at('2026-10-20 10:30+02'), 'de'),

  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
   'Bürojubiläum Vogel Architekten',
   '20 Jahre Büro. Wir möchten Kunden und Partner in unseren Räumen bewirten, gern regional und saisonal.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-02-04'), '16:00', '20:00', 45, 240000, 'Vogel Architekten, Großer Burstah 7',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-04 11:20+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005',
   'Sommerfest Hafenwerk Logistik',
   'Sommerfest für Belegschaft und Familien, rund 180 Personen. Food-Stationen, Kinderecke mit eigenem Angebot, Getränke über uns.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-06-18'), '15:00', '23:00', 180, 1250000, 'Betriebsgelände Hafenwerk, Halle 3',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-01 08:55+02'), pg_temp.seed_at('2026-11-02 16:40+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000006',
   'Hochzeit Petersen im Mai',
   'Wir heiraten im Mai auf einem Gut in Schleswig-Holstein. 90 Gäste, Menü oder Buffet sind noch offen, eine Torte bringen wir selbst mit.',
   'new', 'web_form', 'wedding', pg_temp.seed_on('2027-05-08'), null, null, 90, 950000, 'Gut Hohenholz, Scheune',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-21 21:37+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000007',
   'Eröffnung Musterwohnung',
   'Kleiner Empfang zur Eröffnung unserer Musterwohnung, Häppchen und Kaffee.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-11-20'), '11:00', '15:00', 30, 90000, 'Neubau Am Kaiserkai',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-06 09:12+02'), pg_temp.seed_at('2026-10-30 12:00+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000008',
   'Jahrestagung Gärtnereiverband',
   'Ganztägige Tagung mit 120 Teilnehmenden: Begrüßungskaffee, zwei Kaffeepausen, Mittagessen. Bitte mit veganer Linie.',
   'quoted', 'manual', 'conference', pg_temp.seed_on('2027-03-11'), '08:30', '17:00', 120, 880000, 'Tagungszentrum am Stadtpark',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-08 10:03+02'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000009',
   'Neuwagenpräsentation Frühjahr',
   'Präsentation neuer Modelle im Showroom, Publikumstag. Kleine Snacks, Kaffee, Kinderpunsch.',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2027-03-20'), '10:00', '16:00', 80, 300000, 'Autohaus Aydin, Showroom',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-18 16:45+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000010',
   '50. Geburtstag Laura Fischer',
   'Abendessen für 50 Personen in einem gemieteten Saal, gern mit Live-Kochstation.',
   'won', 'manual', 'private', pg_temp.seed_on('2027-01-23'), '19:00', '23:30', 50, 260000, 'Saal Haus am See',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-13 18:30+02'), pg_temp.seed_at('2026-11-06 09:15+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000011',
   'Kundentag Lange Maschinenbau',
   'Kundentag mit Werksführung. Frühstück, Mittag und Nachmittagssnack für etwa 150 Personen.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-04-15'), '09:00', '17:00', 150, 720000, 'Werk Lange, Pinneberg',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-15 11:02+02'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000012',
   'Praxisjubiläum 10 Jahre',
   'Kleiner Abend für Team und Familien, 25 Personen.',
   'lost', 'web_form', 'corporate', pg_temp.seed_on('2026-12-02'), '18:00', '22:00', 25, 70000, 'Praxis Dr. Wagner',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-17 12:30+02'), pg_temp.seed_at('2026-11-10 17:20+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000013',
   'Richtfest Neubau Quartier Süd',
   'Richtfest auf der Baustelle mit Handwerkern und Bauherren. Deftiges Essen, Getränke stellen wir.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-02-26'), '12:00', '16:00', 70, 210000, 'Baustelle Quartier Süd',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-20 07:58+02'), pg_temp.seed_at('2026-11-12 14:05+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000014',
   'Vereinsfest 25 Jahre Kulturverein',
   'Unser Verein wird 25. Ein Fest im Hof mit rund 200 Gästen, Buffet und Kuchenspenden der Mitglieder.',
   'new', 'web_form', 'other', pg_temp.seed_on('2027-06-05'), null, null, 200, 400000, 'Innenhof Kulturhaus Altstadt',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-20 20:41+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000015',
   'Team-Offsite Fernweh Labs',
   'Zweitägiges Offsite, wir brauchen Verpflegung für den ersten Tag: Frühstück, Mittag, Snacks. 18 Personen, viele vegan.',
   'new', 'api', 'corporate', pg_temp.seed_on('2027-01-28'), '09:00', '18:00', 18, 120000, 'Seminarhaus Wohldorf',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-22 13:05+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000016', 'c0000000-0000-4000-8000-000000000016',
   'Tauffeier Richter',
   'Mittagessen nach der Taufe für 30 Gäste, gern ein Buffet mit Kinderteller.',
   'won', 'web_form', 'private', pg_temp.seed_on('2027-03-14'), '13:00', '18:00', 30, 110000, 'Gemeindehaus St. Johannis',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-28 17:55+01'), pg_temp.seed_at('2026-11-14 11:00+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000017', 'c0000000-0000-4000-8000-000000000017',
   'Mandantenabend Klein Steuerberatung',
   'Abend mit Vortrag, danach Flying Dinner für 40 Gäste.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-11-12'), '18:30', '22:00', 40, 160000, 'Klein Steuerberatung, Konferenzetage',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-29 09:30+01'), pg_temp.seed_at('2026-11-04 10:10+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000018', 'c0000000-0000-4000-8000-000000000018',
   'Werkschau Akademie für Gestaltung',
   'Abschlussausstellung mit Vernissage, rund 220 Gäste. Fingerfood und Getränkeausgabe an zwei Theken.',
   'quoted', 'manual', 'conference', pg_temp.seed_on('2027-02-12'), '17:00', '22:00', 220, 540000, 'Akademie, Ausstellungshalle',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-03 10:15+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000019', 'c0000000-0000-4000-8000-000000000019',
   'Hochzeit Hofmann und Lorenz',
   'Hochzeit im August, 110 Gäste. Wir wünschen uns ein Menü mit drei Gängen und eine Mitternachtssuppe.',
   'quoted', 'web_form', 'wedding', pg_temp.seed_on('2027-08-21'), null, null, 110, 1400000, 'Landhaus Ohlstedt',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-06 08:12+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000020', 'c0000000-0000-4000-8000-000000000020',
   'Jubiläum 75 Jahre Schmitt Druck',
   'Firmenjubiläum mit Kunden und Belegschaft, 140 Gäste, gesetztes Essen mit Reden.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-04-30'), '18:00', '23:00', 140, 980000, 'Druckerei Schmitt, Maschinenhalle',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-09 09:00+01'), pg_temp.seed_at('2026-11-19 15:45+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000001',
   'Sommerempfang Nordlicht Software',
   'Sommerempfang auf der Dachterrasse für Kunden, 60 Personen.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-07-02'), '17:00', '22:00', 60, 260000, 'Nordlicht Software, Dachterrasse',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-09-15 10:30+02'), pg_temp.seed_at('2026-10-01 13:00+02'), 'de'),

  ('e0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000002',
   'Partnerfrühstück Kanzlei Albers',
   'Frühstück für 20 Partner und Partnerinnen vor der Jahresplanung.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2026-12-10'), '08:00', '10:30', 20, 48000, 'Kanzlei Albers, Ballindamm 12',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-09-19 09:45+02'), pg_temp.seed_at('2026-10-05 10:20+02'), 'de'),

  ('e0000000-0000-4000-8000-000000000023', 'c0000000-0000-4000-8000-000000000005',
   'Betriebsversammlung mit Mittagessen',
   'Mittagessen für 200 Personen nach der Betriebsversammlung, schnell auszugeben.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-12-08'), '11:30', '14:00', 200, 600000, 'Betriebsgelände Hafenwerk, Kantine',
   'a0000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-10 14:20+02'), pg_temp.seed_at('2026-11-16 09:00+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000024', 'c0000000-0000-4000-8000-000000000011',
   'Messestand-Catering Hannover',
   'Verpflegung am Messestand über vier Tage, Kaffee und kleine Snacks für Besucher.',
   'new', 'manual', 'conference', pg_temp.seed_on('2027-04-20'), null, null, 300, null, 'Messegelände Hannover, Halle 17',
   'a0000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-19 10:00+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000025', 'c0000000-0000-4000-8000-000000000007',
   'Weihnachtsessen Brandt Immobilien',
   'Weihnachtsessen für das Team, 25 Personen, gern in unseren Büroräumen.',
   'new', 'api', 'corporate', pg_temp.seed_on('2026-12-18'), '19:00', '23:00', 25, null, 'Brandt Immobilien, Mittelweg 30',
   null, pg_temp.seed_at('2026-11-23 17:22+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000026', 'c0000000-0000-4000-8000-000000000009',
   'Kundenabend im Autohaus',
   'Abendveranstaltung für Stammkunden mit Fingerfood und Barbetrieb.',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2027-02-18'), '18:00', '22:00', 60, 250000, 'Autohaus Aydin, Showroom',
   null, pg_temp.seed_at('2026-11-24 08:05+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000027', 'c0000000-0000-4000-8000-000000000013',
   'Sommerfest Schröder & Söhne',
   'Sommerfest für Mitarbeitende und Familien, Grill und Salate.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-07-10'), null, null, 90, 380000, 'Bauhof Schröder',
   null, pg_temp.seed_at('2026-11-11 07:40+01'), null, 'de'),

  ('e0000000-0000-4000-8000-000000000028', 'c0000000-0000-4000-8000-000000000015',
   'Launch-Party Fernweh Labs',
   'Party zum Produktstart, 80 Gäste, Streetfood und Drinks.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2026-12-04'), '19:00', '23:30', 80, 300000, 'Fernweh Labs, Loft',
   null, pg_temp.seed_at('2026-10-24 15:10+02'), pg_temp.seed_at('2026-11-08 18:00+01'), 'de'),

  ('e0000000-0000-4000-8000-000000000029', 'c0000000-0000-4000-8000-000000000018',
   'Erstsemesterbegrüßung',
   'Begrüßung der neuen Studierenden mit Snacks und Getränken.',
   'lost', 'manual', 'conference', pg_temp.seed_on('2026-10-14'), '10:00', '14:00', 250, 400000, 'Akademie, Foyer',
   null, pg_temp.seed_at('2026-09-08 12:00+02'), pg_temp.seed_at('2026-09-20 09:30+02'), 'de'),

  ('e0000000-0000-4000-8000-000000000030', 'c0000000-0000-4000-8000-000000000010',
   'Silvesterbuffet für die Nachbarschaft',
   'Wir feiern Silvester mit Nachbarn, 30 Personen, warmes Buffet bis Mitternacht.',
   'new', 'api', 'private', pg_temp.seed_on('2026-12-31'), '19:00', '23:30', 30, null, 'Gemeinschaftsraum Hofgarten',
   null, pg_temp.seed_at('2026-11-24 07:30+01'), null, 'de');

-- ---------------------------------------------------------------------------
-- History. Triggers wrote a "created" entry with the seed time; move it to
-- the inquiry's creation time and add the steps the team took since: who
-- assigned what, who moved it, who noted what. Every step is one that RLS
-- would have allowed at that moment: notes and changes come from the owner
-- or from whoever held the inquiry then (tests/db/seed-history.test.ts).
-- ---------------------------------------------------------------------------

update public.inquiry_events e
   set created_at = i.created_at,
       actor_id = case when i.source = 'manual' then 'a0000000-0000-4000-8000-000000000001'::uuid end,
       details = jsonb_build_object('source', i.source, 'status', 'new')
  from public.inquiries i
 where e.inquiry_id = i.id and e.kind = 'created' and i.workspace = 'de';

-- Lena assigns what she entered herself right away, web form and API
-- inquiries within half an hour during office hours, otherwise the next morning.
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, 'a0000000-0000-4000-8000-000000000001', 'assigned',
       jsonb_build_object('from', null, 'to', assigned_to),
       case
         when source = 'manual' then created_at + interval '4 minutes'
         when (created_at at time zone 'Europe/Berlin')::time between time '07:30' and time '17:00'
           then created_at + interval '26 minutes'
         else (((created_at at time zone 'Europe/Berlin')::date + 1) + time '08:35') at time zone 'Europe/Berlin'
       end
  from public.inquiries
 where assigned_to is not null
   and workspace = 'de'
   and id <> 'e0000000-0000-4000-8000-000000000001';

-- The Christmas party went to Mira first; she handed it over (her note below).
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'assigned',
   jsonb_build_object('from', null, 'to', 'a0000000-0000-4000-8000-000000000003'), pg_temp.seed_at('2026-11-23 09:38+01')),
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'assigned',
   jsonb_build_object('from', 'a0000000-0000-4000-8000-000000000003', 'to', 'a0000000-0000-4000-8000-000000000002'), pg_temp.seed_at('2026-11-23 11:14+01'));

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, coalesce(assigned_to, 'a0000000-0000-4000-8000-000000000001'), 'status_changed',
       jsonb_build_object('from', 'new', 'to', 'quoted'),
       least(created_at + interval '2 days', coalesce(closed_at, pg_temp.seed_now()) - interval '1 hour')
  from public.inquiries
 where status in ('quoted', 'won', 'lost') and workspace = 'de';

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, coalesce(assigned_to, 'a0000000-0000-4000-8000-000000000001'), 'status_changed',
       jsonb_build_object('from', 'quoted', 'to', status), closed_at
  from public.inquiries
 where status in ('won', 'lost') and workspace = 'de';

-- Lena closed the Schmitt Druck anniversary herself, once the contract was back.
update public.inquiry_events
   set actor_id = 'a0000000-0000-4000-8000-000000000001'
 where inquiry_id = 'e0000000-0000-4000-8000-000000000020' and kind = 'status_changed' and details ->> 'to' = 'won';

-- Mira entered the venue of the gardeners' conference after a call.
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at) values
  ('e0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000003', 'details_updated', '{}', pg_temp.seed_at('2026-10-12 09:18+02'));

-- ---------------------------------------------------------------------------
-- Notes of the team. Times are Berlin wall-clock time (the seed runs with
-- timezone Europe/Berlin). Staff write only on inquiries they hold; Lena,
-- the owner, writes anywhere.
-- ---------------------------------------------------------------------------

insert into public.inquiry_notes (inquiry_id, author_id, body, created_at)
select ('e0000000-0000-4000-8000-0000000000' || n.inquiry)::uuid, p.id, n.body, pg_temp.seed_at(n.at::timestamptz)
  from (values
    ('01', 'mira',  '2026-11-23 10:52', 'Am Wochenende der Feier bin ich im Urlaub. Jonas hat den Sommerempfang von Nordlicht betreut und kennt Herrn Krüger, kann er übernehmen?'),
    ('01', 'lena',  '2026-11-23 11:16', 'Jonas übernimmt. Nordlicht ist Stammkunde, das Angebot bitte noch diese Woche.'),
    ('01', 'jonas', '2026-11-23 16:20', 'Herrn Krüger auf die Mailbox gesprochen, er ruft morgen früh zurück.'),
    ('02', 'lena',  '2026-10-28 14:08', 'Frau Albers hat angerufen, die Kanzlei hat bei uns schon das Partnerfrühstück gebucht. Sekt und alkoholfreie Alternativen bitte getrennt ausweisen.'),
    ('02', 'mira',  '2026-10-30 16:10', 'Angebot über 3.200 € verschickt. Frau Albers meldet sich nach der Partnerrunde.'),
    ('02', 'mira',  '2026-11-17 10:05', 'Nachgefasst: Die Partner sind dafür, offen ist nur noch die Getränkepauschale.'),
    ('03', 'jonas', '2026-10-04 10:20', 'Mit Herrn Yilmaz telefoniert: zwei Grills, einer nur vegetarisch. Für die Kinder gern Stockbrot.'),
    ('03', 'jonas', '2026-10-20 10:28', 'Zusage per Mail, die Anzahlung ist angefordert.'),
    ('03', 'lena',  '2026-10-20 11:05', 'Bitte den Grillanhänger für den Termin blocken.'),
    ('04', 'mira',  '2026-11-06 11:26', 'Angebot mit regionalem Fingerfood verschickt, Getränke als Option.'),
    ('04', 'lena',  '2026-11-12 16:40', 'Frau Vogel hat mich beim Unternehmerfrühstück angesprochen, sie tendiert zu uns. Bitte nächste Woche nachfassen.'),
    ('04', 'mira',  '2026-11-19 09:30', 'Nachgefasst. Frau Vogel stimmt sich noch mit ihrem Büropartner ab.'),
    ('05', 'lena',  '2026-10-01 09:02', 'Großer Auftrag. Bitte mit zwei Food-Stationen und eigener Kinderecke kalkulieren.'),
    ('05', 'jonas', '2026-10-03 09:00', 'Angebot über 12.500 € verschickt, Getränkeservice inklusive.'),
    ('05', 'jonas', '2026-11-02 16:35', 'Zusage am Telefon, Anzahlung von 30 % vereinbart.'),
    ('05', 'lena',  '2026-11-02 17:10', 'Stark, danke Jonas! Halle 3 schauen wir uns vorher gemeinsam an.'),
    ('06', 'mira',  '2026-11-23 09:40', 'Erstgespräch vereinbart. Frau Petersen schickt vorher den Lageplan vom Gut.'),
    ('07', 'jonas', '2026-10-30 11:58', 'Absage: Der Bauträger lässt den Bäcker aus dem Erdgeschoss liefern.'),
    ('07', 'lena',  '2026-10-30 12:20', 'Schade. Herrn Brandt bitte trotzdem für die Weihnachtsangebote vormerken.'),
    ('08', 'mira',  '2026-10-12 09:20', 'Raumplan beim Tagungszentrum angefragt, Ausgabe vermutlich im Foyer.'),
    ('08', 'lena',  '2026-10-13 08:30', 'Die vegane Linie bitte als eigene Ausgabe planen, nicht nur beschriftet.'),
    ('08', 'mira',  '2026-11-02 14:10', 'Das Angebot liegt beim Vorstand, Entscheidung nach der nächsten Sitzung.'),
    ('09', 'jonas', '2026-11-19 10:20', 'Herr Aydin wünscht zusätzlich eine Kaffeebar mit Barista. Angebot folgt.'),
    ('10', 'mira',  '2026-10-15 18:36', 'Angebot mit Live-Kochstation verschickt, Pasta und Risotto zur Wahl.'),
    ('10', 'mira',  '2026-11-06 09:12', 'Frau Fischer hat zugesagt, der Saal ist bestätigt.'),
    ('11', 'lena',  '2026-10-16 08:45', 'Bitte zwei Varianten anbieten: mit und ohne warmes Mittagessen.'),
    ('11', 'jonas', '2026-10-17 11:05', 'Beide Varianten verschickt.'),
    ('11', 'jonas', '2026-11-10 15:30', 'Herr Lange fragt bei 150 Personen nach Rabatt. Lena, sind 5 % drin?'),
    ('11', 'lena',  '2026-11-10 16:02', '5 % ja, wenn die Zusage bis Monatsende kommt.'),
    ('12', 'mira',  '2026-11-10 17:18', 'Absage: Die Praxis feiert jetzt im Restaurant nebenan.'),
    ('13', 'jonas', '2026-10-22 08:05', 'Angebot mit Erbsensuppe und Grillstation verschickt.'),
    ('13', 'jonas', '2026-11-12 14:03', 'Zusage von Herrn Schröder. Strom gibt es auf der Baustelle, das Zelt stellt die Baufirma.'),
    ('13', 'lena',  '2026-11-12 14:30', 'Prima. Schröder hat auch das Sommerfest angefragt, das mache ich selbst.'),
    ('14', 'mira',  '2026-11-21 11:30', 'Frau Hartmann ruft nach der Vorstandssitzung zurück.'),
    ('15', 'lena',  '2026-11-22 13:35', 'Fernweh hatte die Launch-Party bei uns, Herr Wolf war sehr zufrieden.'),
    ('15', 'jonas', '2026-11-23 09:05', 'Herr Wolf bestätigt: 11 von 18 essen vegan. Ich plane den Tag komplett vegan.'),
    ('16', 'mira',  '2026-11-14 10:58', 'Zusage. Sechs Kinderteller, das Gemeindehaus hat eine Küche.'),
    ('17', 'jonas', '2026-11-04 10:08', 'Absage, unser Angebot war Herrn Klein zu teuer.'),
    ('18', 'lena',  '2026-11-03 10:22', 'Die Akademie hat bei der Erstsemesterbegrüßung abgesagt. Diesmal bitte früh nachfassen.'),
    ('18', 'mira',  '2026-11-12 09:45', 'Nachgefasst. Frau Zimmermann wartet auf die Freigabe vom Rektorat.'),
    ('19', 'jonas', '2026-11-08 11:30', 'Das Paar wünscht ein Probeessen im Februar.'),
    ('19', 'lena',  '2026-11-08 12:05', 'Probeessen gern, den Termin bitte mit der Küche abstimmen.'),
    ('20', 'lena',  '2026-11-09 09:06', 'Gesetztes Essen in der Maschinenhalle: bitte Bühne und Technik für die Reden mit anbieten.'),
    ('20', 'mira',  '2026-11-11 09:03', 'Angebot über 9.800 € verschickt, die Bühne kommt von unserem Verleihpartner.'),
    ('20', 'lena',  '2026-11-19 15:47', 'Vertrag ist unterschrieben zurück. Danke, Mira!'),
    ('21', 'jonas', '2026-10-01 12:58', 'Zusage. Dachterrasse besichtigt, der Lastenaufzug reicht für unsere Wagen.'),
    ('22', 'mira',  '2026-10-05 10:18', 'Zusage, Frühstück mit Eierstation.'),
    ('23', 'mira',  '2026-11-16 09:05', 'Absage: Die Kantine übernimmt selbst. Für das Sommerfest sind wir aber gesetzt.'),
    ('24', 'lena',  '2026-11-19 10:06', 'Herr Lange hat angerufen: vier Messetage, Budget noch offen. Jonas, du kennst ihn vom Kundentag.'),
    ('25', 'lena',  '2026-11-24 07:48', 'Herr Brandt war bei der Musterwohnung abgesprungen. Diesmal bitte schnell antworten.'),
    ('27', 'lena',  '2026-11-13 07:45', 'Angebot verschickt: Grill, drei Salate und Kinderbuffet für 90 Personen.'),
    ('28', 'lena',  '2026-11-08 18:02', 'Zusage. Drei Streetfood-Stände, die Drinks laufen über die Bar im Loft.'),
    ('29', 'lena',  '2026-09-20 09:32', 'Absage, die Akademie nimmt den Caterer der Mensa.')
  ) as n(inquiry, author, at, body)
  join (values
    ('lena',  'a0000000-0000-4000-8000-000000000001'::uuid),
    ('jonas', 'a0000000-0000-4000-8000-000000000002'::uuid),
    ('mira',  'a0000000-0000-4000-8000-000000000003'::uuid)
  ) as p(name, id) on p.name = n.author;

-- Mira had the assistant summarise the association's anniversary and took
-- the draft over. Draft, reservation, note and history entry look exactly
-- as reserve_ai_draft and accept_ai_draft write them.
insert into public.ai_drafts (id, inquiry_id, created_by, summary, questions, suggested_event_type, model, status, decided_by, decided_at, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000003',
   'Der Kulturverein Altstadt feiert sein 25-jähriges Bestehen mit rund 200 Gästen im Innenhof des Kulturhauses. Gewünscht ist ein Buffet, dazu spenden die Mitglieder Kuchen. Das Budget liegt bei rund 4.000 €.',
   '["Von wann bis wann soll das Buffet stehen?", "Gibt es im Innenhof Strom und Wasser für die Ausgabe?", "Sollen wir die gespendeten Kuchen mit ausgeben, und wie viele werden es ungefähr?"]',
   'other', 'mock', 'accepted', 'a0000000-0000-4000-8000-000000000003',
   pg_temp.seed_at('2026-11-21 09:12+01'), pg_temp.seed_at('2026-11-21 09:10+01'));

insert into public.ai_usage (user_id, inquiry_id, created_at, workspace) values
  ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000014', pg_temp.seed_at('2026-11-21 09:10+01'), 'de');

insert into public.inquiry_notes (inquiry_id, author_id, body, created_at)
select d.inquiry_id, d.decided_by,
       'Zusammenfassung: ' || d.summary || E'\n\nRückfragen:\n' || string_agg('- ' || q.value, E'\n' order by q.ordinality),
       d.decided_at
  from public.ai_drafts d
  cross join lateral jsonb_array_elements_text(d.questions) with ordinality as q(value, ordinality)
 where d.id = 'd0000000-0000-4000-8000-000000000001'
 group by d.inquiry_id, d.decided_by, d.summary, d.decided_at;

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select inquiry_id, decided_by, 'ai_draft_accepted', jsonb_build_object('draft_id', id, 'model', model), decided_at
  from public.ai_drafts
 where id = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- One web form inquiry whose e-mail address matched an existing contact.
-- The sender typed a different phone number; intake keeps it with the
-- inquiry as unconfirmed and leaves the contact unchanged.
-- ---------------------------------------------------------------------------

update public.inquiries
   set submitted_contact = jsonb_build_object(
         'name', 'Ömer Aydin',
         'company', 'Autohaus Aydin',
         'email', 'oemer.aydin@autohaus-aydin.example',
         'phone', '0172 555 0190'
       ),
       matched_existing_contact = true
 where id = 'e0000000-0000-4000-8000-000000000026';

reset timezone;
