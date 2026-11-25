-- Demo data for "Larkspur Catering & Events", a fictional catering business in
-- Dublin: the English demo, workspace 'en'. It is the counterpart of seed.sql
-- (the German demo, workspace 'de') and runs after it, in the same database
-- session; RLS keeps the two apart. Every statement here touches only rows of
-- workspace 'en'.
-- Every person, company, address and e-mail address here is invented.
-- E-mail addresses use the reserved .example top-level domain.
--
-- Logins (password for all three: Larkspur-Demo-2026)
--   niamh@larkspur.example   Niamh Byrne   owner
--   conor@larkspur.example   Conor Walsh   staff
--   aoife@larkspur.example   Aoife Kelly   staff

-- ---------------------------------------------------------------------------
-- Demo clock. Same as in seed.sql: the data below is written as of Tuesday,
-- 24 November 2026; the seed moves it to the day it runs, so the newest
-- inquiry is from today (or yesterday, if its time of day has not come yet)
-- and the events lie ahead. The helpers replace the ones seed.sql created in
-- this session, now in Irish time.
--   seed_at   timestamps: by whole days, keeping the Dublin time of day
--   seed_on   event dates: by whole weeks, so a Saturday wedding stays on a
--             Saturday; never more than three days off the timestamps
-- Set app.seed_now before running the seed files to seed as of a fixed moment.
-- Day arithmetic below ("+ interval '2 days'") runs in Dublin time, so it gives
-- the same wall-clock time before and after a move.
-- ---------------------------------------------------------------------------

set timezone to 'Europe/Dublin';

create or replace function pg_temp.seed_now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.seed_now', true), '')::timestamptz, now())
$$;

create or replace function pg_temp.seed_days() returns integer language sql stable as $$
  with d as (
    select ((pg_temp.seed_now() at time zone 'Europe/Dublin')::date - date '2026-11-24') as n
  )
  select case
           -- 08:05 on 24 November is the newest inquiry; it must not land in the future.
           when ((timestamptz '2026-11-24 08:05+00' at time zone 'Europe/Dublin') + make_interval(days => n))
                at time zone 'Europe/Dublin' > pg_temp.seed_now() then n - 1
           else n
         end
    from d
$$;

create or replace function pg_temp.seed_at(ts timestamptz) returns timestamptz language sql stable as $$
  select ((ts at time zone 'Europe/Dublin') + make_interval(days => pg_temp.seed_days())) at time zone 'Europe/Dublin'
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
  extensions.crypt('Larkspur-Demo-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"workspace":"en"}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  pg_temp.seed_at('2026-09-01 09:00+01'), now(),
  '', '', '', ''
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'niamh@larkspur.example', 'Niamh Byrne'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'conor@larkspur.example', 'Conor Walsh'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'aoife@larkspur.example', 'Aoife Kelly')
) as u(id, email, full_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003'
);

update public.profiles set role = 'owner' where id = 'a1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------

insert into public.contacts (id, full_name, company, email, phone, created_by, created_at, workspace) values
  ('c1000000-0000-4000-8000-000000000001', 'Declan Doyle',     'Corrib Software Ltd',             'declan.doyle@corribsoftware.example',     '01 555 0101', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-14 10:12+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000002', 'Siobhan Gallagher', 'Gallagher & Partners Solicitors', 's.gallagher@gallagher-solicitors.example',   '01 555 0102', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-18 15:40+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000003', 'Cian Doherty',     null,                              'cian.doherty@post.example',               '087 555 0103', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-22 19:05+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000004', 'Ruth Fitzgerald',  'Fitzgerald Architects',           'ruth@fitzgerald-architects.example',      '01 555 0104', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-25 11:30+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000005', 'Martin Brennan',   'Liffey Freight DAC',              'martin.brennan@liffeyfreight.example',    '01 555 0105', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-09-29 08:50+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000006', 'Ciara Murphy',     null,                              'ciara.murphy@post.example',               '086 555 0106', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-02 21:14+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000007', 'Fergal Brady',     'Brady Property Group',            'fergal@bradyproperty.example',            '01 555 0107', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-05 13:22+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000008', 'Jennifer Nolan',   'Leinster Growers Association',    'j.nolan@leinstergrowers.example',         '01 555 0108', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-07 09:41+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000009', 'Eoin Kavanagh',    'Kavanagh Motors',                 'eoin.kavanagh@kavanagh-motors.example',   '01 555 0109', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-09 16:03+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000010', 'Laura Finnegan',   null,                              'laura.finnegan@post.example',             '085 555 0110', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-12 18:27+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000011', 'Hugh Lynch',       'Lynch Engineering Ltd',           'h.lynch@lynch-engineering.example',       '045 555 0111', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-14 10:55+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000012', 'Sophie Whelan',    'Whelan Dental Practice',          'info@whelan-dental.example',              '01 555 0112', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-16 12:08+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000013', 'Patrick Sheehan',  'Sheehan & Sons Construction',     'paddy@sheehan-construction.example',      '01 555 0113', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-19 07:46+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000014', 'Clodagh Hennessy', 'Old Quarter Arts Society CLG',    'chair@oldquarter-arts.example',           null,          'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-21 20:30+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000015', 'Niall Ward',       'Wanderlight Labs',                'niall@wanderlight-labs.example',          '086 555 0115', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-23 14:17+01'), 'en'),
  ('c1000000-0000-4000-8000-000000000016', 'Emer Reilly',      null,                              'emer.reilly@post.example',                '083 555 0116', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-27 17:52+00'), 'en'),
  ('c1000000-0000-4000-8000-000000000017', 'Michael Keane',    'Keane Tax Advisers',              'm.keane@keane-tax.example',               '01 555 0117', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-10-29 09:09+00'), 'en'),
  ('c1000000-0000-4000-8000-000000000018', 'Lorna Quinn',      'Liffeyside School of Design',     'events@liffeyside-design.example',        '01 555 0118', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-02 11:44+00'), 'en'),
  ('c1000000-0000-4000-8000-000000000019', 'Brian Hogan',      null,                              'brian.hogan@post.example',                '087 555 0119', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-05 22:01+00'), 'en'),
  ('c1000000-0000-4000-8000-000000000020', 'Maeve Smyth',      'Smyth Print Ltd',                 'maeve.smyth@smyth-print.example',         '01 555 0120', 'a1000000-0000-4000-8000-000000000001', pg_temp.seed_at('2026-11-09 08:33+00'), 'en');

-- ---------------------------------------------------------------------------
-- Inquiries: 30 in total, 12 for Conor, 12 for Aoife, 6 not yet assigned.
-- ---------------------------------------------------------------------------

insert into public.inquiries (
  id, contact_id, title, message, status, source, event_type,
  event_date, start_time, end_time, guest_count, budget_cents, location,
  assigned_to, created_at, closed_at, workspace
) values
  ('e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'Corrib Software Christmas party',
   'Hello, we are planning our company Christmas party on ' || to_char(pg_temp.seed_on('2026-12-12'), 'FMDD/FMMM') || ' with about 40 people. A mix of vegetarian and meat, finger food and a hot main course would be great. Our budget is around €1,500. Could you send us a quote?',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2026-12-12'), '18:00', '23:00', 40, 150000, 'Corrib Software, 4 Hanover Quay',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-23 09:14+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002',
   'Client reception to start the year',
   'We are inviting clients to a New Year reception. Standing reception with finger food, sparkling wine and alcohol-free alternatives. About 60 guests.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-01-15'), '17:00', '21:00', 60, 320000, 'Gallagher & Partners, 12 Molesworth Street',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-28 14:02+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003',
   '40th birthday in the garden',
   'I am turning 40 and would like to celebrate in the garden. Barbecue buffet with vegetarian options, cake in the afternoon. 35 guests, 8 of them children.',
   'won', 'web_form', 'private', pg_temp.seed_on('2027-05-22'), '14:00', '22:00', 35, 180000, 'Private garden, Dalkey',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-03 20:11+01'), pg_temp.seed_at('2026-10-20 10:30+01'), 'en'),

  ('e1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000004',
   'Fitzgerald Architects office anniversary',
   '20 years of the practice. We would like to host clients and partners in our own premises, ideally with local, seasonal food.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-02-04'), '16:00', '20:00', 45, 240000, 'Fitzgerald Architects, 7 Pembroke Street Upper',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-04 11:20+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000005',
   'Liffey Freight summer party',
   'Summer party for staff and families, around 180 people. Food stations, a kids'' corner with its own offer, drinks through you.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-06-18'), '15:00', '23:00', 180, 1250000, 'Liffey Freight depot, Unit 3',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-01 08:55+01'), pg_temp.seed_at('2026-11-02 16:40+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000006',
   'Murphy wedding',
   'We are getting married at a country house in County Wicklow. 90 guests, whether it will be a set menu or a buffet is still open, we are bringing the wedding cake ourselves.',
   'new', 'web_form', 'wedding', pg_temp.seed_on('2027-05-08'), null, null, 90, 950000, 'Knockaree House, The Old Barn',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-21 21:37+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000007',
   'Show apartment launch',
   'Small reception for the launch of our show apartment, bites and coffee.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-11-20'), '11:00', '15:00', 30, 90000, 'New development, Grand Canal Dock',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-06 09:12+01'), pg_temp.seed_at('2026-10-30 12:00+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000008',
   'Leinster Growers annual conference',
   'Full-day conference with 120 delegates: welcome coffee, two coffee breaks, lunch. Please include a vegan line.',
   'quoted', 'manual', 'conference', pg_temp.seed_on('2027-03-11'), '08:30', '17:00', 120, 880000, 'Parkside Conference Centre',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-08 10:03+01'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000009',
   'New model showcase',
   'Presentation of new models in the showroom, public open day. Small snacks, coffee, hot apple juice for the kids.',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2027-03-20'), '10:00', '16:00', 80, 300000, 'Kavanagh Motors, Showroom',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-18 16:45+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000010',
   'Laura Finnegan''s 50th birthday',
   'Dinner for 50 people in a hired hall, ideally with a live cooking station.',
   'won', 'manual', 'private', pg_temp.seed_on('2027-01-23'), '19:00', '23:30', 50, 260000, 'Hall at Seaview House',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-13 18:30+01'), pg_temp.seed_at('2026-11-06 09:15+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000011',
   'Lynch Engineering customer day',
   'Customer day with a plant tour. Breakfast, lunch and an afternoon snack for around 150 people.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-04-15'), '09:00', '17:00', 150, 720000, 'Lynch Engineering plant, Naas',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-15 11:02+01'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000012',
   'Practice 10th anniversary',
   'Small evening for the team and their families, 25 people.',
   'lost', 'web_form', 'corporate', pg_temp.seed_on('2026-12-02'), '18:00', '22:00', 25, 70000, 'Whelan Dental Practice',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-17 12:30+01'), pg_temp.seed_at('2026-11-10 17:20+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000013', 'c1000000-0000-4000-8000-000000000013',
   'Southgate Quarter topping-out',
   'Topping-out ceremony on site with tradespeople and clients. Hearty food, we supply the drinks.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-02-26'), '12:00', '16:00', 70, 210000, 'Southgate Quarter building site',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-20 07:58+01'), pg_temp.seed_at('2026-11-12 14:05+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000014', 'c1000000-0000-4000-8000-000000000014',
   'Old Quarter Arts Society at 25',
   'Our society turns 25. A party in the courtyard with around 200 guests, a buffet and cakes donated by members.',
   'new', 'web_form', 'other', pg_temp.seed_on('2027-06-05'), null, null, 200, 400000, 'Courtyard, Old Quarter Arts Centre',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-20 20:41+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000015', 'c1000000-0000-4000-8000-000000000015',
   'Wanderlight Labs team offsite',
   'Two-day offsite, we need catering for the first day: breakfast, lunch, snacks. 18 people, many of them vegan.',
   'new', 'api', 'corporate', pg_temp.seed_on('2027-01-28'), '09:00', '18:00', 18, 120000, 'Glenmore Retreat House',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-22 13:05+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000016', 'c1000000-0000-4000-8000-000000000016',
   'Reilly christening lunch',
   'Lunch after the christening for 30 guests, ideally a buffet with a children''s menu.',
   'won', 'web_form', 'private', pg_temp.seed_on('2027-03-14'), '13:00', '18:00', 30, 110000, 'St Colman''s Parish Hall',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-28 17:55+00'), pg_temp.seed_at('2026-11-14 11:00+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000017', 'c1000000-0000-4000-8000-000000000017',
   'Keane Tax Advisers client evening',
   'Evening with a talk, followed by canapés and bowl food for 40 guests.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-11-12'), '18:30', '22:00', 40, 160000, 'Keane Tax Advisers, conference floor',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-10-29 09:30+00'), pg_temp.seed_at('2026-11-04 10:10+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000018', 'c1000000-0000-4000-8000-000000000018',
   'Liffeyside School of Design graduate show',
   'Final-year exhibition with an opening night, around 220 guests. Finger food and drinks service at two bars.',
   'quoted', 'manual', 'conference', pg_temp.seed_on('2027-02-12'), '17:00', '22:00', 220, 540000, 'School of Design, exhibition hall',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-03 10:15+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000019', 'c1000000-0000-4000-8000-000000000019',
   'Hogan and Moran wedding',
   'Our wedding with 110 guests. We would like a three-course menu and a late-night supper.',
   'quoted', 'web_form', 'wedding', pg_temp.seed_on('2027-08-21'), null, null, 110, 1400000, 'Carrigmore Country House',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-06 08:12+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000020',
   'Smyth Print at 75',
   'Company anniversary with clients and staff, 140 guests, seated dinner with speeches.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-04-30'), '18:00', '23:00', 140, 980000, 'Smyth Print, press hall',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-11-09 09:00+00'), pg_temp.seed_at('2026-11-19 15:45+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000001',
   'Corrib Software summer reception',
   'Summer reception on the roof terrace for clients, 60 people.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2027-07-02'), '17:00', '22:00', 60, 260000, 'Corrib Software, roof terrace',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-09-15 10:30+01'), pg_temp.seed_at('2026-10-01 13:00+01'), 'en'),

  ('e1000000-0000-4000-8000-000000000022', 'c1000000-0000-4000-8000-000000000002',
   'Gallagher & Partners partners'' breakfast',
   'Breakfast for 20 partners ahead of the annual planning.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2026-12-10'), '08:00', '10:30', 20, 48000, 'Gallagher & Partners, 12 Molesworth Street',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-09-19 09:45+01'), pg_temp.seed_at('2026-10-05 10:20+01'), 'en'),

  ('e1000000-0000-4000-8000-000000000023', 'c1000000-0000-4000-8000-000000000005',
   'Staff meeting with lunch',
   'Lunch for 200 people after the staff meeting, needs to be served quickly.',
   'lost', 'manual', 'corporate', pg_temp.seed_on('2026-12-08'), '11:30', '14:00', 200, 600000, 'Liffey Freight depot, canteen',
   'a1000000-0000-4000-8000-000000000003', pg_temp.seed_at('2026-10-10 14:20+01'), pg_temp.seed_at('2026-11-16 09:00+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000024', 'c1000000-0000-4000-8000-000000000011',
   'Trade show stand at the RDS',
   'Catering at the trade show stand over four days, coffee and small snacks for visitors.',
   'new', 'manual', 'conference', pg_temp.seed_on('2027-04-20'), null, null, 300, null, 'RDS Dublin, Hall 2',
   'a1000000-0000-4000-8000-000000000002', pg_temp.seed_at('2026-11-19 10:00+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000025', 'c1000000-0000-4000-8000-000000000007',
   'Brady Property Group Christmas dinner',
   'Christmas dinner for the team, 25 people, ideally in our own offices.',
   'new', 'api', 'corporate', pg_temp.seed_on('2026-12-18'), '19:00', '23:00', 25, null, 'Brady Property Group, 14 Fitzwilliam Place',
   null, pg_temp.seed_at('2026-11-23 17:22+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000026', 'c1000000-0000-4000-8000-000000000009',
   'Customer evening at the dealership',
   'Evening event for loyal customers with finger food and a bar.',
   'new', 'web_form', 'corporate', pg_temp.seed_on('2027-02-18'), '18:00', '22:00', 60, 250000, 'Kavanagh Motors, Showroom',
   null, pg_temp.seed_at('2026-11-24 08:05+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000027', 'c1000000-0000-4000-8000-000000000013',
   'Sheehan & Sons summer party',
   'Summer party for staff and families, barbecue and salads.',
   'quoted', 'manual', 'corporate', pg_temp.seed_on('2027-07-10'), null, null, 90, 380000, 'Sheehan yard',
   null, pg_temp.seed_at('2026-11-11 07:40+00'), null, 'en'),

  ('e1000000-0000-4000-8000-000000000028', 'c1000000-0000-4000-8000-000000000015',
   'Wanderlight Labs launch party',
   'Party for the product launch, 80 guests, street food and drinks.',
   'won', 'manual', 'corporate', pg_temp.seed_on('2026-12-04'), '19:00', '23:30', 80, 300000, 'Wanderlight Labs, the Loft',
   null, pg_temp.seed_at('2026-10-24 15:10+01'), pg_temp.seed_at('2026-11-08 18:00+00'), 'en'),

  ('e1000000-0000-4000-8000-000000000029', 'c1000000-0000-4000-8000-000000000018',
   'Freshers'' welcome',
   'Welcome for the new students with snacks and drinks.',
   'lost', 'manual', 'conference', pg_temp.seed_on('2026-10-14'), '10:00', '14:00', 250, 400000, 'School of Design, foyer',
   null, pg_temp.seed_at('2026-09-08 12:00+01'), pg_temp.seed_at('2026-09-20 09:30+01'), 'en'),

  ('e1000000-0000-4000-8000-000000000030', 'c1000000-0000-4000-8000-000000000010',
   'New Year''s Eve buffet for the neighbours',
   'We are celebrating New Year''s Eve with the neighbours, 30 people, a hot buffet until midnight.',
   'new', 'api', 'private', pg_temp.seed_on('2026-12-31'), '19:00', '23:30', 30, null, 'Courtyard community room',
   null, pg_temp.seed_at('2026-11-24 07:30+00'), null, 'en');

-- ---------------------------------------------------------------------------
-- History. Triggers wrote a "created" entry with the seed time; move it to
-- the inquiry's creation time and add the steps the team took since: who
-- assigned what, who moved it, who noted what. Every step is one that RLS
-- would have allowed at that moment: notes and changes come from the owner
-- or from whoever held the inquiry then (tests/db/seed-history.test.ts).
-- ---------------------------------------------------------------------------

update public.inquiry_events e
   set created_at = i.created_at,
       actor_id = case when i.source = 'manual' then 'a1000000-0000-4000-8000-000000000001'::uuid end,
       details = jsonb_build_object('source', i.source, 'status', 'new')
  from public.inquiries i
 where e.inquiry_id = i.id and e.kind = 'created' and i.workspace = 'en';

-- Niamh assigns what she entered herself right away, web form and API
-- inquiries within half an hour during office hours, otherwise the next morning.
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, 'a1000000-0000-4000-8000-000000000001', 'assigned',
       jsonb_build_object('from', null, 'to', assigned_to),
       case
         when source = 'manual' then created_at + interval '4 minutes'
         when (created_at at time zone 'Europe/Dublin')::time between time '07:30' and time '17:00'
           then created_at + interval '26 minutes'
         else (((created_at at time zone 'Europe/Dublin')::date + 1) + time '08:35') at time zone 'Europe/Dublin'
       end
  from public.inquiries
 where assigned_to is not null
   and workspace = 'en'
   and id <> 'e1000000-0000-4000-8000-000000000001';

-- The Christmas party went to Aoife first; she handed it over (her note below).
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at) values
  ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'assigned',
   jsonb_build_object('from', null, 'to', 'a1000000-0000-4000-8000-000000000003'), pg_temp.seed_at('2026-11-23 09:38+00')),
  ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'assigned',
   jsonb_build_object('from', 'a1000000-0000-4000-8000-000000000003', 'to', 'a1000000-0000-4000-8000-000000000002'), pg_temp.seed_at('2026-11-23 11:14+00'));

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, coalesce(assigned_to, 'a1000000-0000-4000-8000-000000000001'), 'status_changed',
       jsonb_build_object('from', 'new', 'to', 'quoted'),
       least(created_at + interval '2 days', coalesce(closed_at, pg_temp.seed_now()) - interval '1 hour')
  from public.inquiries
 where status in ('quoted', 'won', 'lost') and workspace = 'en';

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select id, coalesce(assigned_to, 'a1000000-0000-4000-8000-000000000001'), 'status_changed',
       jsonb_build_object('from', 'quoted', 'to', status), closed_at
  from public.inquiries
 where status in ('won', 'lost') and workspace = 'en';

-- Niamh closed the Smyth Print anniversary herself, once the contract was back.
update public.inquiry_events
   set actor_id = 'a1000000-0000-4000-8000-000000000001'
 where inquiry_id = 'e1000000-0000-4000-8000-000000000020' and kind = 'status_changed' and details ->> 'to' = 'won';

-- Aoife entered the venue of the growers' conference after a call.
insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at) values
  ('e1000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000003', 'details_updated', '{}', pg_temp.seed_at('2026-10-12 09:18+01'));

-- ---------------------------------------------------------------------------
-- Notes of the team. Times are Dublin wall-clock time (the seed runs with
-- timezone Europe/Dublin). Staff write only on inquiries they hold; Niamh,
-- the owner, writes anywhere.
-- ---------------------------------------------------------------------------

insert into public.inquiry_notes (inquiry_id, author_id, body, created_at)
select ('e1000000-0000-4000-8000-0000000000' || n.inquiry)::uuid, p.id, n.body, pg_temp.seed_at(n.at::timestamptz)
  from (values
    ('01', 'aoife', '2026-11-23 10:52', 'I am on holiday over the weekend of the party. Conor looked after the Corrib summer reception and knows Mr Doyle, could he take over?'),
    ('01', 'niamh', '2026-11-23 11:16', 'Conor takes over. Corrib is a regular client, please get the quote out this week.'),
    ('01', 'conor', '2026-11-23 16:20', 'Left a voicemail for Mr Doyle, he will call back first thing tomorrow.'),
    ('02', 'niamh', '2026-10-28 14:08', 'Ms Gallagher rang, the firm has already booked the partners'' breakfast with us. Please list the sparkling wine and the alcohol-free alternatives separately.'),
    ('02', 'aoife', '2026-10-30 16:10', 'Quote for €3,200 sent. Ms Gallagher will get back to us after the partners'' meeting.'),
    ('02', 'aoife', '2026-11-17 10:05', 'Followed up: the partners are in favour, only the drinks package is still open.'),
    ('03', 'conor', '2026-10-04 10:20', 'Spoke to Mr Doherty: two barbecues, one of them vegetarian only. For the children, marshmallows to toast.'),
    ('03', 'conor', '2026-10-20 10:28', 'Confirmed by email, deposit requested.'),
    ('03', 'niamh', '2026-10-20 11:05', 'Please block the barbecue trailer for the date.'),
    ('04', 'aoife', '2026-11-06 11:26', 'Quote with local finger food sent, drinks as an option.'),
    ('04', 'niamh', '2026-11-12 16:40', 'Ms Fitzgerald spoke to me at the business breakfast, she is leaning towards us. Please follow up next week.'),
    ('04', 'aoife', '2026-11-19 09:30', 'Followed up. Ms Fitzgerald is still checking with her business partner.'),
    ('05', 'niamh', '2026-10-01 09:02', 'Big job. Please price it with two food stations and a kids'' corner of its own.'),
    ('05', 'conor', '2026-10-03 09:00', 'Quote for €12,500 sent, drinks service included.'),
    ('05', 'conor', '2026-11-02 16:35', 'Confirmed by phone, 30% deposit agreed.'),
    ('05', 'niamh', '2026-11-02 17:10', 'Brilliant, thanks Conor! We will look at the depot together beforehand.'),
    ('06', 'aoife', '2026-11-23 09:40', 'First meeting booked. Ms Murphy will send the site plan of the house beforehand.'),
    ('07', 'conor', '2026-10-30 11:58', 'Declined: the developer is getting the café on the ground floor to deliver.'),
    ('07', 'niamh', '2026-10-30 12:20', 'Shame. Please still pencil in Mr Brady for the Christmas quotes.'),
    ('08', 'aoife', '2026-10-12 09:20', 'Asked the conference centre for the floor plan, serving will probably be in the foyer.'),
    ('08', 'niamh', '2026-10-13 08:30', 'Please plan the vegan line as its own serving point, not just labelled.'),
    ('08', 'aoife', '2026-11-02 14:10', 'The quote is with the board, decision after their next meeting.'),
    ('09', 'conor', '2026-11-19 10:20', 'Mr Kavanagh would also like a coffee bar with a barista. Quote to follow.'),
    ('10', 'aoife', '2026-10-15 18:36', 'Quote with a live cooking station sent, pasta and risotto to choose from.'),
    ('10', 'aoife', '2026-11-06 09:12', 'Ms Finnegan has accepted, the hall is confirmed.'),
    ('11', 'niamh', '2026-10-16 08:45', 'Please offer two options: with and without a hot lunch.'),
    ('11', 'conor', '2026-10-17 11:05', 'Both options sent.'),
    ('11', 'conor', '2026-11-10 15:30', 'Mr Lynch is asking for a discount at 150 people. Niamh, is 5% possible?'),
    ('11', 'niamh', '2026-11-10 16:02', 'Yes to 5% if we have the acceptance by the end of the month.'),
    ('12', 'aoife', '2026-11-10 17:18', 'Declined: the practice is now celebrating at the restaurant next door.'),
    ('13', 'conor', '2026-10-22 08:05', 'Quote with hearty soup and a grill station sent.'),
    ('13', 'conor', '2026-11-12 14:03', 'Mr Sheehan confirmed. There is power on site, and the builders are putting up the marquee.'),
    ('13', 'niamh', '2026-11-12 14:30', 'Great. Sheehan has also asked about the summer party, I will take that one myself.'),
    ('14', 'aoife', '2026-11-21 11:30', 'Ms Hennessy will call back after the committee meeting.'),
    ('15', 'niamh', '2026-11-22 13:35', 'Wanderlight had their launch party with us, Mr Ward was very happy.'),
    ('15', 'conor', '2026-11-23 09:05', 'Mr Ward confirms: 11 of 18 eat vegan. I will plan the whole day vegan.'),
    ('16', 'aoife', '2026-11-14 10:58', 'Confirmed. Six children''s plates, the parish hall has a kitchen.'),
    ('17', 'conor', '2026-11-04 10:08', 'Declined, our quote was too expensive for Mr Keane.'),
    ('18', 'niamh', '2026-11-03 10:22', 'The school turned us down for the freshers'' welcome. Please follow up early this time.'),
    ('18', 'aoife', '2026-11-12 09:45', 'Followed up. Ms Quinn is waiting for sign-off from the dean''s office.'),
    ('19', 'conor', '2026-11-08 11:30', 'The couple would like a tasting before the big day.'),
    ('19', 'niamh', '2026-11-08 12:05', 'Happy to do a tasting, please agree the date with the kitchen.'),
    ('20', 'niamh', '2026-11-09 09:06', 'Seated dinner in the press hall: please offer a stage and sound for the speeches as well.'),
    ('20', 'aoife', '2026-11-11 09:03', 'Quote for €9,800 sent, the stage comes from our hire partner.'),
    ('20', 'niamh', '2026-11-19 15:47', 'The contract is signed and back. Thanks, Aoife!'),
    ('21', 'conor', '2026-10-01 12:58', 'Confirmed. Viewed the roof terrace, the goods lift is big enough for our trolleys.'),
    ('22', 'aoife', '2026-10-05 10:18', 'Confirmed, breakfast with an egg station.'),
    ('23', 'aoife', '2026-11-16 09:05', 'Declined: the canteen is doing it in-house. We are confirmed for the summer party though.'),
    ('24', 'niamh', '2026-11-19 10:06', 'Mr Lynch rang: four trade show days, budget still open. Conor, you know him from the customer day.'),
    ('25', 'niamh', '2026-11-24 07:48', 'Mr Brady dropped out after the show apartment launch. Please reply quickly this time.'),
    ('27', 'niamh', '2026-11-13 07:45', 'Quote sent: barbecue, three salads and a children''s buffet for 90 people.'),
    ('28', 'niamh', '2026-11-08 18:02', 'Confirmed. Three street food stalls, the drinks run through the bar in the loft.'),
    ('29', 'niamh', '2026-09-20 09:32', 'Declined, the school is going with the caterer of its canteen.')
  ) as n(inquiry, author, at, body)
  join (values
    ('niamh', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('conor', 'a1000000-0000-4000-8000-000000000002'::uuid),
    ('aoife', 'a1000000-0000-4000-8000-000000000003'::uuid)
  ) as p(name, id) on p.name = n.author;

-- Aoife had the assistant summarise the society's anniversary and took the
-- draft over. Draft, reservation, note and history entry look exactly as
-- reserve_ai_draft and accept_ai_draft write them for workspace 'en'.
insert into public.ai_drafts (id, inquiry_id, created_by, summary, questions, suggested_event_type, model, status, decided_by, decided_at, created_at) values
  ('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000003',
   'The Old Quarter Arts Society is celebrating its 25th anniversary with around 200 guests in the courtyard of the arts centre. A buffet is wanted, and members are donating cakes. The budget is around €4,000.',
   '["What time should the buffet be open from and until?", "Are there power and water in the courtyard for the serving area?", "Should we serve the donated cakes as well, and roughly how many will there be?"]',
   'other', 'mock', 'accepted', 'a1000000-0000-4000-8000-000000000003',
   pg_temp.seed_at('2026-11-21 09:12+00'), pg_temp.seed_at('2026-11-21 09:10+00'));

insert into public.ai_usage (user_id, inquiry_id, created_at, workspace) values
  ('a1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000014', pg_temp.seed_at('2026-11-21 09:10+00'), 'en');

insert into public.inquiry_notes (inquiry_id, author_id, body, created_at)
select d.inquiry_id, d.decided_by,
       'Summary: ' || d.summary || E'\n\nFollow-up questions:\n' || string_agg('- ' || q.value, E'\n' order by q.ordinality),
       d.decided_at
  from public.ai_drafts d
  cross join lateral jsonb_array_elements_text(d.questions) with ordinality as q(value, ordinality)
 where d.id = 'd1000000-0000-4000-8000-000000000001'
 group by d.inquiry_id, d.decided_by, d.summary, d.decided_at;

insert into public.inquiry_events (inquiry_id, actor_id, kind, details, created_at)
select inquiry_id, decided_by, 'ai_draft_accepted', jsonb_build_object('draft_id', id, 'model', model), decided_at
  from public.ai_drafts
 where id = 'd1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- One web form inquiry whose e-mail address matched an existing contact.
-- The sender typed a different phone number; intake keeps it with the
-- inquiry as unconfirmed and leaves the contact unchanged.
-- ---------------------------------------------------------------------------

update public.inquiries
   set submitted_contact = jsonb_build_object(
         'name', 'Eoin Kavanagh',
         'company', 'Kavanagh Motors',
         'email', 'eoin.kavanagh@kavanagh-motors.example',
         'phone', '087 555 0190'
       ),
       matched_existing_contact = true
 where id = 'e1000000-0000-4000-8000-000000000026';

reset timezone;
