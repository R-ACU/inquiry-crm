-- Inquiry CRM: initial schema
--
-- Access model
--   owner  sees and changes everything, manages roles and API keys
--   staff  sees only inquiries assigned to them and the contacts of those inquiries
--   anon   has no table privileges at all; it may only call public.ingest_inquiry,
--          which checks a hashed API key before it writes anything, and the
--          two sign-in throttle functions
--
-- Every table has RLS enabled. Policies are written per command, each with
-- USING and/or WITH CHECK as the command requires. Column privileges narrow
-- what an INSERT or UPDATE may touch, because a policy cannot compare old
-- and new rows.
-- Functions are SECURITY INVOKER unless they must write somewhere the caller
-- cannot; those few are SECURITY DEFINER with an empty search_path.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('owner', 'staff');
create type public.inquiry_status as enum ('new', 'quoted', 'won', 'lost');
create type public.inquiry_source as enum ('manual', 'web_form', 'api');
create type public.event_type as enum ('corporate', 'wedding', 'private', 'conference', 'other');
create type public.draft_status as enum ('draft', 'accepted', 'discarded');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Role changes only through public.set_member_role.';

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  company text check (char_length(company) <= 160),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 40),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contacts_email_unique on public.contacts (lower(email)) where email is not null;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null check (key_prefix ~ '^crm_[a-z0-9]{8}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  rate_limit_per_minute integer not null default 20 check (rate_limit_per_minute between 1 and 600),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.api_keys.key_hash is 'SHA-256 of the raw key. The raw key is shown once and never stored.';

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  message text not null default '' check (char_length(message) <= 5000),
  status public.inquiry_status not null default 'new',
  source public.inquiry_source not null default 'manual',
  event_type public.event_type,
  event_date date,
  start_time time,
  end_time time,
  guest_count integer check (guest_count between 1 and 5000),
  budget_cents bigint check (budget_cents between 0 and 100000000),
  location text check (char_length(location) <= 200),
  assigned_to uuid references public.profiles (id) on delete set null,
  api_key_id uuid references public.api_keys (id) on delete set null,
  -- What the sender typed, kept as submitted. Intake matches contacts by
  -- e-mail only and never overwrites an existing contact with these values,
  -- so a sender cannot pose as a known customer.
  submitted_contact jsonb check (submitted_contact is null or jsonb_typeof(submitted_contact) = 'object'),
  matched_existing_contact boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_times_need_date check (start_time is null or event_date is not null),
  constraint inquiries_end_after_start check (end_time is null or (start_time is not null and end_time > start_time))
);

create index inquiries_assigned_to_idx on public.inquiries (assigned_to);
create index inquiries_contact_id_idx on public.inquiries (contact_id);
create index inquiries_status_idx on public.inquiries (status);
create index inquiries_api_key_recent_idx on public.inquiries (api_key_id, created_at);

create table public.inquiry_notes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index inquiry_notes_inquiry_idx on public.inquiry_notes (inquiry_id, created_at);

create table public.inquiry_events (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('created', 'status_changed', 'assigned', 'details_updated', 'ai_draft_accepted', 'ai_draft_discarded')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index inquiry_events_inquiry_idx on public.inquiry_events (inquiry_id, created_at);

comment on table public.inquiry_events is 'Append-only history. Written by triggers only; no API role may insert, update or delete rows, and inquiries cannot be deleted through the API.';

create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  summary text not null check (char_length(summary) between 1 and 2000),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 5),
  suggested_event_type public.event_type,
  model text not null check (char_length(model) <= 80),
  status public.draft_status not null default 'draft',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_drafts_inquiry_idx on public.ai_drafts (inquiry_id, created_at);
create index ai_drafts_created_by_idx on public.ai_drafts (created_by, created_at);

-- One row per requested AI draft, written by public.reserve_ai_draft before
-- the model is called. The limits on paid API calls are counted here, in the
-- database, so they hold across serverless instances and restarts.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at);

comment on table public.ai_usage is 'Reservations for AI drafts. No API role has privileges; only public.reserve_ai_draft writes here.';

-- Failed sign-ins per e-mail address and per client address, both stored as
-- SHA-256 hashes. The app signs in on the server, so Supabase Auth sees the
-- server's address for every user; this table gives each address and each
-- client their own limit.
create table public.login_failures (
  id bigint generated always as identity primary key,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index login_failures_email_idx on public.login_failures (email_hash, created_at);
create index login_failures_client_idx on public.login_failures (client_hash, created_at);
create index login_failures_created_idx on public.login_failures (created_at);

comment on table public.login_failures is 'Sign-in throttling. No API role has privileges; only the two login functions read and write here.';

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Security invoker on purpose: every authenticated user may read profiles,
-- so no privilege escalation is needed to answer "is the caller an owner?".
create function public.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'owner'
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.set_closed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('won', 'lost') then
      new.closed_at := now();
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- SECURITY DEFINER: the history table has no INSERT privilege for any API
-- role, so users cannot forge entries. The trigger writes on their behalf and
-- records auth.uid() as the actor.
create function public.log_inquiry_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.inquiry_events (inquiry_id, actor_id, kind, details)
    values (new.id, v_actor, 'created', jsonb_build_object('source', new.source, 'status', new.status));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.inquiry_events (inquiry_id, actor_id, kind, details)
    values (new.id, v_actor, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.inquiry_events (inquiry_id, actor_id, kind, details)
    values (new.id, v_actor, 'assigned', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;

  if (new.title, new.message, new.event_type, new.event_date, new.start_time, new.end_time,
      new.guest_count, new.budget_cents, new.location)
     is distinct from
     (old.title, old.message, old.event_type, old.event_date, old.start_time, old.end_time,
      old.guest_count, old.budget_cents, old.location) then
    insert into public.inquiry_events (inquiry_id, actor_id, kind, details)
    values (new.id, v_actor, 'details_updated', '{}'::jsonb);
  end if;

  return new;
end;
$$;

create function public.log_ai_draft_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'discarded') then
    insert into public.inquiry_events (inquiry_id, actor_id, kind, details)
    values (
      new.inquiry_id,
      (select auth.uid()),
      case new.status when 'accepted' then 'ai_draft_accepted' else 'ai_draft_discarded' end,
      jsonb_build_object('draft_id', new.id, 'model', new.model)
    );
  end if;
  return new;
end;
$$;

-- A revoked key stays revoked: no update may touch it again, and the
-- revocation time is always the database clock, never a value from the
-- client. A WITH CHECK clause cannot do this, because it does not see the
-- old row.
create function public.guard_api_key_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    raise exception 'a revoked api key cannot be changed' using errcode = '42501';
  end if;
  if new.revoked_at is not null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

-- SECURITY DEFINER: runs when Supabase Auth creates a user. The role is never
-- taken from user metadata, so a sign-up cannot request owner rights.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'staff'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create trigger inquiries_set_closed_at
  before update of status on public.inquiries
  for each row execute function public.set_closed_at();

create trigger inquiries_log_insert
  after insert on public.inquiries
  for each row execute function public.log_inquiry_event();

create trigger inquiries_log_update
  after update on public.inquiries
  for each row execute function public.log_inquiry_event();

create trigger ai_drafts_log_decision
  after update of status on public.ai_drafts
  for each row execute function public.log_ai_draft_decision();

create trigger api_keys_guard_update
  before update on public.api_keys
  for each row execute function public.guard_api_key_update();

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: the role column is not updatable by any API role.
-- This function is the only way to change it, and only an owner may call it.
create function public.set_member_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.app_role;
begin
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only an owner can change roles' using errcode = '42501';
  end if;

  -- Lock every owner row before counting. Otherwise two owners demoting
  -- each other at the same moment would both count two owners, and the
  -- business would end up with none. The fixed order avoids deadlocks.
  perform 1 from public.profiles where role = 'owner' order by id for update;

  select role into v_current from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_current = 'owner' and p_role = 'staff'
     and (select count(*) from public.profiles where role = 'owner') = 1 then
    raise exception 'the last owner cannot be demoted' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- SECURITY DEFINER: no API role may UPDATE ai_drafts, so a draft can only
-- be decided through these two functions. That keeps three things true no
-- matter how the API is called: the decision is recorded with the caller and
-- the database clock, a draft is decided once, and "accepted" always comes
-- with its note. RLS does not apply inside, so each function checks itself
-- that the caller may see the inquiry (owner or assignee).
create function public.accept_ai_draft(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_draft public.ai_drafts%rowtype;
  v_note_id uuid;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select d.* into v_draft
    from public.ai_drafts d
    join public.inquiries i on i.id = d.inquiry_id
   where d.id = p_draft_id
     and d.status = 'draft'
     and (i.assigned_to = v_uid or public.is_owner())
   for update of d;

  if not found then
    raise exception 'draft not found or already decided' using errcode = 'P0002';
  end if;

  update public.ai_drafts
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = v_draft.id;

  select 'Zusammenfassung: ' || v_draft.summary || E'\n\nRückfragen:\n'
         || string_agg('- ' || q.value, E'\n' order by q.ordinality)
    into v_body
    from jsonb_array_elements_text(v_draft.questions) with ordinality as q(value, ordinality);

  insert into public.inquiry_notes (inquiry_id, author_id, body)
  values (v_draft.inquiry_id, v_uid, left(v_body, 4000))
  returning id into v_note_id;

  if v_draft.suggested_event_type is not null then
    update public.inquiries
       set event_type = v_draft.suggested_event_type
     where id = v_draft.inquiry_id and event_type is null;
  end if;

  return v_note_id;
end;
$$;

create function public.discard_ai_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_draft_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select d.id into v_draft_id
    from public.ai_drafts d
    join public.inquiries i on i.id = d.inquiry_id
   where d.id = p_draft_id
     and d.status = 'draft'
     and (i.assigned_to = v_uid or public.is_owner())
   for update of d;

  if not found then
    raise exception 'draft not found or already decided' using errcode = 'P0002';
  end if;

  update public.ai_drafts
     set status = 'discarded', decided_by = v_uid, decided_at = now()
   where id = v_draft_id;
end;
$$;

-- SECURITY DEFINER: the usage table is not readable by any API role, and the
-- daily limit must count every member's drafts, not only the visible ones.
-- The app calls this before it calls the model, so a request over the limit
-- never costs anything. A table lock serialises concurrent reservations.
create function public.reserve_ai_draft(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_mine integer;
  v_all integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.inquiries i
     where i.id = p_inquiry_id and (i.assigned_to = v_uid or public.is_owner())
  ) then
    raise exception 'inquiry not found' using errcode = 'P0002';
  end if;

  lock table public.ai_usage in share row exclusive mode;

  select count(*) filter (where user_id = v_uid and created_at > now() - interval '10 minutes'),
         count(*)
    into v_mine, v_all
    from public.ai_usage
   where created_at > now() - interval '1 day';

  if v_mine >= 6 then
    raise exception 'draft limit per person reached' using errcode = 'PT429';
  end if;
  if v_all >= 100 then
    raise exception 'daily draft limit reached' using errcode = 'PT429';
  end if;

  insert into public.ai_usage (user_id, inquiry_id) values (v_uid, p_inquiry_id);
  delete from public.ai_usage where created_at < now() - interval '2 days';
end;
$$;

-- SECURITY DEFINER (both login functions): the sign-in form has no session,
-- so they run as anon, and login_failures must stay unreadable for anon.
-- Limits: 5 failures per e-mail address and 20 per client address within
-- 15 minutes. Known and unknown addresses get the same answer.
create function public.login_allowed(p_email text, p_client text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
  v_client text := encode(sha256(convert_to(coalesce(p_client, ''), 'UTF8')), 'hex');
begin
  return (select count(*) from public.login_failures
           where email_hash = v_email and created_at > now() - interval '15 minutes') < 5
     and (select count(*) from public.login_failures
           where client_hash = v_client and created_at > now() - interval '15 minutes') < 20;
end;
$$;

create function public.record_login_failure(p_email text, p_client text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
  v_client text := encode(sha256(convert_to(coalesce(p_client, ''), 'UTF8')), 'hex');
begin
  if char_length(coalesce(p_email, '')) > 254 or char_length(coalesce(p_client, '')) > 100 then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  -- Once a limit is reached, more rows add nothing. Skipping them keeps the
  -- table small when someone calls this function in a loop.
  if public.login_allowed(p_email, p_client) then
    insert into public.login_failures (email_hash, client_hash) values (v_email, v_client);
  end if;
  delete from public.login_failures where created_at < now() - interval '1 day';
end;
$$;

-- SECURITY DEFINER: the public intake endpoint has no user session. Instead
-- of handing the app a service-role key that bypasses all of RLS, the anon
-- role may call exactly this function. It hashes the presented key, rejects
-- unknown or revoked keys, enforces the per-key rate limit inside the
-- database (so it holds across serverless instances), and writes one contact
-- and one inquiry. Table CHECK constraints validate every field again.
create function public.ingest_inquiry(p_api_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_keys%rowtype;
  v_recent integer;
  v_email text := lower(nullif(btrim(p_payload ->> 'email'), ''));
  v_contact_id uuid;
  v_matched boolean := false;
  v_inquiry_id uuid;
begin
  if p_api_key is null or char_length(p_api_key) not between 20 and 200 then
    raise exception 'invalid api key' using errcode = 'PT401';
  end if;

  select * into v_key
    from public.api_keys
   where key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
     and revoked_at is null
   for update;

  if not found then
    raise exception 'invalid api key' using errcode = 'PT401';
  end if;

  select count(*) into v_recent
    from public.inquiries
   where api_key_id = v_key.id
     and created_at > now() - interval '1 minute';

  if v_recent >= v_key.rate_limit_per_minute then
    raise exception 'rate limit exceeded' using errcode = 'PT429';
  end if;

  if v_email is null then
    raise exception 'email is required' using errcode = '22023';
  end if;

  -- A new address creates a contact. A known address links the inquiry to
  -- that contact but changes nothing about it: the e-mail is not verified,
  -- so name, company and phone from the request are only stored with the
  -- inquiry (submitted_contact) and shown to staff as unconfirmed.
  insert into public.contacts (full_name, company, email, phone)
  values (
    btrim(p_payload ->> 'name'),
    nullif(btrim(p_payload ->> 'company'), ''),
    v_email,
    nullif(btrim(p_payload ->> 'phone'), '')
  )
  on conflict (lower(email)) where email is not null
  do nothing
  returning id into v_contact_id;

  if v_contact_id is null then
    select id into v_contact_id from public.contacts where lower(email) = v_email;
    v_matched := true;
  end if;

  insert into public.inquiries (
    contact_id, title, message, source, event_type, event_date, start_time, end_time,
    guest_count, budget_cents, location, api_key_id, submitted_contact, matched_existing_contact
  )
  values (
    v_contact_id,
    btrim(p_payload ->> 'title'),
    coalesce(p_payload ->> 'message', ''),
    (case when p_payload ->> 'source' = 'web_form' then 'web_form' else 'api' end)::public.inquiry_source,
    (p_payload ->> 'event_type')::public.event_type,
    (p_payload ->> 'event_date')::date,
    (p_payload ->> 'start_time')::time,
    (p_payload ->> 'end_time')::time,
    (p_payload ->> 'guest_count')::integer,
    (p_payload ->> 'budget_cents')::bigint,
    nullif(btrim(p_payload ->> 'location'), ''),
    v_key.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', btrim(p_payload ->> 'name'),
      'company', nullif(btrim(p_payload ->> 'company'), ''),
      'email', v_email,
      'phone', nullif(btrim(p_payload ->> 'phone'), '')
    )),
    v_matched
  )
  returning id into v_inquiry_id;

  update public.api_keys set last_used_at = now() where id = v_key.id;

  -- Only the inquiry id: internal contact ids stay inside the CRM.
  return jsonb_build_object('inquiry_id', v_inquiry_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants broad table privileges to anon and authenticated by
-- default and relies on RLS. We start from zero instead and grant only
-- what the app needs, so a missing policy fails closed twice.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- The same for everything a later migration creates. Supabase's default
-- privileges would otherwise give every new table and function full rights
-- for anon and authenticated, and one forgotten RLS line would open it.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- INSERT and UPDATE are granted per column. Everything not listed comes from
-- defaults, triggers or functions: ids, timestamps, authors, status, source,
-- API key and intake fields. Nothing deletes rows through the API: notes and
-- history are a record, and erasing personal data is an operator task.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- E-mail is not updatable: a unique violation on change would tell a staff
-- member whether an address exists anywhere in the CRM.
grant select on public.contacts to authenticated;
grant insert (full_name, company, email, phone) on public.contacts to authenticated;
grant update (full_name, company, phone) on public.contacts to authenticated;

grant select on public.inquiries to authenticated;
grant insert (contact_id, title, message, event_type, event_date, start_time, end_time,
              guest_count, budget_cents, location, assigned_to)
  on public.inquiries to authenticated;
grant update (title, message, status, event_type, event_date, start_time, end_time,
              guest_count, budget_cents, location, assigned_to)
  on public.inquiries to authenticated;

grant select on public.inquiry_notes to authenticated;
grant insert (inquiry_id, body) on public.inquiry_notes to authenticated;

grant select on public.inquiry_events to authenticated;

-- Drafts are inserted pending; deciding goes through accept_ai_draft and
-- discard_ai_draft only.
grant select on public.ai_drafts to authenticated;
grant insert (inquiry_id, summary, questions, suggested_event_type, model) on public.ai_drafts to authenticated;

-- The hash never leaves the database, not even for owners.
grant select (id, name, key_prefix, rate_limit_per_minute, created_by, last_used_at, revoked_at, created_at)
  on public.api_keys to authenticated;
grant insert (name, key_prefix, key_hash, rate_limit_per_minute) on public.api_keys to authenticated;
grant update (name, revoked_at) on public.api_keys to authenticated;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;
grant execute on function public.accept_ai_draft(uuid) to authenticated;
grant execute on function public.discard_ai_draft(uuid) to authenticated;
grant execute on function public.reserve_ai_draft(uuid) to authenticated;
grant execute on function public.ingest_inquiry(text, jsonb) to anon, authenticated;
grant execute on function public.login_allowed(text, text) to anon, authenticated;
grant execute on function public.record_login_failure(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.api_keys enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_notes enable row level security;
alter table public.inquiry_events enable row level security;
alter table public.ai_drafts enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions touch these two.
alter table public.ai_usage enable row level security;
alter table public.login_failures enable row level security;

-- profiles: the team list is visible to every member; each member may edit
-- their own name. Role changes go through set_member_role.
create policy "profiles: members read team"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles: members update own name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- inquiries: owners see all, staff see what is assigned to them.
create policy "inquiries: owner or assignee reads"
  on public.inquiries for select to authenticated
  using ((select public.is_owner()) or assigned_to = (select auth.uid()));

create policy "inquiries: owner creates"
  on public.inquiries for insert to authenticated
  with check ((select public.is_owner()));

-- Staff may work on their own inquiries but cannot hand them to someone
-- else: the row must still be assigned to them after the update.
create policy "inquiries: owner or assignee updates"
  on public.inquiries for update to authenticated
  using ((select public.is_owner()) or assigned_to = (select auth.uid()))
  with check ((select public.is_owner()) or assigned_to = (select auth.uid()));

-- contacts: visible to owners and to staff who hold an inquiry of that
-- contact. The subquery runs under the inquiries policy above.
create policy "contacts: owner or linked assignee reads"
  on public.contacts for select to authenticated
  using (
    (select public.is_owner())
    or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
  );

create policy "contacts: owner creates"
  on public.contacts for insert to authenticated
  with check ((select public.is_owner()));

create policy "contacts: owner or linked assignee updates"
  on public.contacts for update to authenticated
  using (
    (select public.is_owner())
    or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
  )
  with check (
    (select public.is_owner())
    or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
  );

-- notes: readable with the inquiry; written in one's own name only.
create policy "notes: readable with inquiry"
  on public.inquiry_notes for select to authenticated
  using (exists (select 1 from public.inquiries i where i.id = inquiry_notes.inquiry_id));

create policy "notes: author writes on visible inquiry"
  on public.inquiry_notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.inquiries i where i.id = inquiry_notes.inquiry_id)
  );

-- events: read-only for everyone; rows come from triggers.
create policy "events: readable with inquiry"
  on public.inquiry_events for select to authenticated
  using (exists (select 1 from public.inquiries i where i.id = inquiry_events.inquiry_id));

-- ai_drafts: created as pending drafts by whoever may see the inquiry, and
-- decided exactly once by a person through accept_ai_draft or
-- discard_ai_draft. The limit on paid model calls is public.reserve_ai_draft.
create policy "drafts: readable with inquiry"
  on public.ai_drafts for select to authenticated
  using (exists (select 1 from public.inquiries i where i.id = ai_drafts.inquiry_id));

create policy "drafts: created pending on visible inquiry"
  on public.ai_drafts for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
    and decided_by is null
    and exists (select 1 from public.inquiries i where i.id = ai_drafts.inquiry_id)
  );

-- api_keys: owners only.
create policy "api_keys: owner reads"
  on public.api_keys for select to authenticated
  using ((select public.is_owner()));

create policy "api_keys: owner creates"
  on public.api_keys for insert to authenticated
  with check ((select public.is_owner()) and revoked_at is null);

create policy "api_keys: owner updates"
  on public.api_keys for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
