-- Inquiry CRM: workspaces
--
-- One Supabase project holds two invented businesses that must never see
-- each other: the German demo ('de') and the English demo ('en'). Each is a
-- workspace. Every member belongs to exactly one, set when the account is
-- created and never changeable through the API.
--
--   * profiles, contacts, api_keys and inquiries carry the workspace they
--     belong to. Notes, history and AI drafts belong to an inquiry and are
--     readable only through it, so they follow it.
--   * RLS adds "row.workspace = the caller's workspace" to every policy of
--     those four tables. An owner is owner of their own workspace only.
--   * A trigger refuses any write that would point an inquiry at a contact,
--     an assignee or an API key of another workspace, whoever writes it.
--   * The SECURITY DEFINER functions (which RLS does not cover) check the
--     workspace themselves: role changes, AI draft decisions and the AI
--     budget act inside the caller's workspace, and the public intake writes
--     into the workspace of the API key it was given.
--   * The language of a workspace's own texts (the note written when an AI
--     draft is accepted) follows the workspace.

-- ---------------------------------------------------------------------------
-- The caller's workspace
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column workspace text not null default 'de' check (workspace in ('de', 'en'));
alter table public.profiles alter column workspace drop default;

comment on column public.profiles.workspace is 'The business this member belongs to. Set from app metadata when the account is created; not updatable through the API.';

-- SECURITY DEFINER: the profiles policy below compares every row with the
-- caller's workspace. Reading it with the caller's rights would run that same
-- policy again (infinite recursion). The function reads one value, the
-- caller's own workspace, and nothing else; without a session it is null,
-- and null matches no row.
create function public.current_workspace()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.workspace from public.profiles p where p.id = (select auth.uid());
$$;

revoke execute on function public.current_workspace() from public, anon;
grant execute on function public.current_workspace() to authenticated;

-- A new account joins the workspace named in its app metadata, which only
-- the platform (service role, dashboard, seed) can set; users cannot write
-- app metadata, and public sign-up is disabled. Without one it joins 'de',
-- the original demo. The role still never comes from metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, workspace)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'staff',
    case when new.raw_app_meta_data ->> 'workspace' = 'en' then 'en' else 'de' end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspace columns. Existing rows are the German demo. New rows written
-- through the API get the caller's workspace from the default; the column is
-- in no INSERT or UPDATE grant, so a client cannot choose it.
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column workspace text not null default 'de' check (workspace in ('de', 'en'));
alter table public.contacts alter column workspace set default public.current_workspace();

alter table public.api_keys
  add column workspace text not null default 'de' check (workspace in ('de', 'en'));
alter table public.api_keys alter column workspace set default public.current_workspace();

alter table public.inquiries
  add column workspace text not null default 'de' check (workspace in ('de', 'en'));
alter table public.inquiries alter column workspace set default public.current_workspace();

-- The daily AI budget is counted per business.
alter table public.ai_usage
  add column workspace text not null default 'de' check (workspace in ('de', 'en'));
alter table public.ai_usage alter column workspace drop default;

-- The same customer e-mail may exist once per workspace. A global unique
-- index would let the intake of one workspace link an inquiry to a contact
-- of the other.
drop index public.contacts_email_unique;
create unique index contacts_email_unique on public.contacts (workspace, lower(email)) where email is not null;

create index inquiries_workspace_idx on public.inquiries (workspace);

-- The workspace column is readable like the other columns of an API key
-- (owners of the workspace only, through the policy).
grant select (workspace) on public.api_keys to authenticated;

-- An inquiry and everything it points to live in one workspace. A trigger,
-- not composite foreign keys: a second foreign key between the same tables
-- would make PostgREST's embedding (contact:contacts(...)) ambiguous.
-- Security invoker: the caller's own rights decide what it can find. Through
-- the API a member sees only rows of their own workspace, so a row of the
-- other one is "not found" whether it exists or not; SECURITY DEFINER
-- callers (the intake) and the seed see everything and are checked by the
-- workspace columns. Only changed references are checked, so a staff member
-- moving their own inquiry is not asked about an API key they cannot see.
create function public.guard_inquiry_workspace()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id or new.workspace is distinct from old.workspace)
     and not exists (select 1 from public.contacts c where c.id = new.contact_id and c.workspace = new.workspace) then
    raise exception 'contact not found in this workspace' using errcode = '23503';
  end if;
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to or new.workspace is distinct from old.workspace)
     and not exists (select 1 from public.profiles p where p.id = new.assigned_to and p.workspace = new.workspace) then
    raise exception 'member not found in this workspace' using errcode = '23503';
  end if;
  if new.api_key_id is not null
     and (tg_op = 'INSERT' or new.api_key_id is distinct from old.api_key_id or new.workspace is distinct from old.workspace)
     and not exists (select 1 from public.api_keys k where k.id = new.api_key_id and k.workspace = new.workspace) then
    raise exception 'api key not found in this workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger inquiries_guard_workspace
  before insert or update of contact_id, assigned_to, api_key_id, workspace on public.inquiries
  for each row execute function public.guard_inquiry_workspace();

-- ---------------------------------------------------------------------------
-- Policies: the existing rules, inside the caller's workspace
-- ---------------------------------------------------------------------------

alter policy "profiles: members read team" on public.profiles
  using (workspace = (select public.current_workspace()));

alter policy "inquiries: owner or assignee reads" on public.inquiries
  using (
    workspace = (select public.current_workspace())
    and ((select public.is_owner()) or assigned_to = (select auth.uid()))
  );

alter policy "inquiries: owner creates" on public.inquiries
  with check (workspace = (select public.current_workspace()) and (select public.is_owner()));

alter policy "inquiries: owner or assignee updates" on public.inquiries
  using (
    workspace = (select public.current_workspace())
    and ((select public.is_owner()) or assigned_to = (select auth.uid()))
  )
  with check (
    workspace = (select public.current_workspace())
    and ((select public.is_owner()) or assigned_to = (select auth.uid()))
  );

alter policy "contacts: owner or linked assignee reads" on public.contacts
  using (
    workspace = (select public.current_workspace())
    and (
      (select public.is_owner())
      or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
    )
  );

alter policy "contacts: owner creates" on public.contacts
  with check (workspace = (select public.current_workspace()) and (select public.is_owner()));

alter policy "contacts: owner or linked assignee updates" on public.contacts
  using (
    workspace = (select public.current_workspace())
    and (
      (select public.is_owner())
      or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
    )
  )
  with check (
    workspace = (select public.current_workspace())
    and (
      (select public.is_owner())
      or exists (select 1 from public.inquiries i where i.contact_id = contacts.id)
    )
  );

alter policy "api_keys: owner reads" on public.api_keys
  using (workspace = (select public.current_workspace()) and (select public.is_owner()));

alter policy "api_keys: owner creates" on public.api_keys
  with check (workspace = (select public.current_workspace()) and (select public.is_owner()) and revoked_at is null);

alter policy "api_keys: owner updates" on public.api_keys
  using (workspace = (select public.current_workspace()) and (select public.is_owner()))
  with check (workspace = (select public.current_workspace()) and (select public.is_owner()));

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions: RLS does not apply inside, so each one checks
-- the workspace itself.
-- ---------------------------------------------------------------------------

create or replace function public.set_member_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace text := public.current_workspace();
  v_current public.app_role;
begin
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only an owner can change roles' using errcode = '42501';
  end if;

  -- Lock every owner row of the workspace before counting. Otherwise two
  -- owners demoting each other at the same moment would both count two
  -- owners, and the business would end up with none. The fixed order avoids
  -- deadlocks.
  perform 1 from public.profiles where role = 'owner' and workspace = v_workspace order by id for update;

  -- A member of another workspace is "not found", exactly like an unknown id.
  select role into v_current from public.profiles
   where id = p_user_id and workspace = v_workspace
   for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_current = 'owner' and p_role = 'staff'
     and (select count(*) from public.profiles where role = 'owner' and workspace = v_workspace) = 1 then
    raise exception 'the last owner cannot be demoted' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

create or replace function public.accept_ai_draft(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_draft public.ai_drafts%rowtype;
  v_workspace text;
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
     and i.workspace = public.current_workspace()
     and (i.assigned_to = v_uid or public.is_owner())
   for update of d;

  if not found then
    raise exception 'draft not found or already decided' using errcode = 'P0002';
  end if;

  select workspace into v_workspace from public.inquiries where id = v_draft.inquiry_id;

  update public.ai_drafts
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = v_draft.id;

  select case v_workspace when 'en' then 'Summary: ' else 'Zusammenfassung: ' end
         || v_draft.summary
         || case v_workspace when 'en' then E'\n\nFollow-up questions:\n' else E'\n\nRückfragen:\n' end
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

create or replace function public.discard_ai_draft(p_draft_id uuid)
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
     and i.workspace = public.current_workspace()
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

-- The daily limit counts the drafts of the caller's business only, so one
-- demo cannot use up the other's budget.
create or replace function public.reserve_ai_draft(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_workspace text := public.current_workspace();
  v_mine integer;
  v_all integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.inquiries i
     where i.id = p_inquiry_id
       and i.workspace = v_workspace
       and (i.assigned_to = v_uid or public.is_owner())
  ) then
    raise exception 'inquiry not found' using errcode = 'P0002';
  end if;

  lock table public.ai_usage in share row exclusive mode;

  select count(*) filter (where user_id = v_uid and created_at > now() - interval '10 minutes'),
         count(*)
    into v_mine, v_all
    from public.ai_usage
   where created_at > now() - interval '1 day'
     and workspace = v_workspace;

  if v_mine >= 6 then
    raise exception 'draft limit per person reached' using errcode = 'PT429';
  end if;
  if v_all >= 100 then
    raise exception 'daily draft limit reached' using errcode = 'PT429';
  end if;

  insert into public.ai_usage (user_id, inquiry_id, workspace) values (v_uid, p_inquiry_id, v_workspace);
  delete from public.ai_usage where created_at < now() - interval '2 days';
end;
$$;

-- The intake writes into the workspace of the API key it was given. A known
-- e-mail address is matched only within that workspace.
create or replace function public.ingest_inquiry(p_api_key text, p_payload jsonb)
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
  insert into public.contacts (full_name, company, email, phone, workspace)
  values (
    btrim(p_payload ->> 'name'),
    nullif(btrim(p_payload ->> 'company'), ''),
    v_email,
    nullif(btrim(p_payload ->> 'phone'), ''),
    v_key.workspace
  )
  on conflict (workspace, lower(email)) where email is not null
  do nothing
  returning id into v_contact_id;

  if v_contact_id is null then
    select id into v_contact_id from public.contacts
     where workspace = v_key.workspace and lower(email) = v_email;
    v_matched := true;
  end if;

  insert into public.inquiries (
    contact_id, title, message, source, event_type, event_date, start_time, end_time,
    guest_count, budget_cents, location, api_key_id, submitted_contact, matched_existing_contact, workspace
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
    v_matched,
    v_key.workspace
  )
  returning id into v_inquiry_id;

  update public.api_keys set last_used_at = now() where id = v_key.id;

  -- Only the inquiry id: internal contact ids stay inside the CRM.
  return jsonb_build_object('inquiry_id', v_inquiry_id);
end;
$$;
