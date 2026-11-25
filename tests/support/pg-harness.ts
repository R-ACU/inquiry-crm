/**
 * A Postgres engine that behaves like a Supabase database for the parts this
 * app relies on: the roles anon, authenticated and service_role, an auth
 * schema with auth.users and auth.uid() read from JWT claims, pgcrypto in the
 * extensions schema, and Supabase's permissive default privileges on public.
 *
 * It runs the real migrations and the real seed file, so RLS tests and the
 * local preview exercise exactly the SQL that ships to Supabase.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
/**
 * The seed files in the order supabase/config.toml lists them ([db.seed] sql_paths; a unit test
 * keeps both lists equal): the German demo (workspace "de"), then the English one ("en").
 */
export const SEED_FILES = ["seed.sql", "seed-en.sql"] as const;

const SUPABASE_BOOTSTRAP = /* sql */ `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  confirmation_token varchar(255) default '',
  email_change varchar(255) default '',
  email_change_token_new varchar(255) default '',
  recovery_token varchar(255) default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_id, provider)
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type DbRole = "anon" | "authenticated" | "service_role";

export interface TestDatabase {
  db: PGlite;
  /** Runs fn inside a transaction as the given API role, like PostgREST does. */
  as<T>(role: DbRole, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

/**
 * `seedNow` fixes the moment the seed treats as now (the seed moves its demo
 * dates to that day, see supabase/seed.sql). Without it the seed uses the
 * database clock, which is what the preview wants.
 */
export async function createTestDatabase(options: { seed?: boolean; seedNow?: Date } = {}): Promise<TestDatabase> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_BOOTSTRAP);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(file, "utf8"));
  }
  if (options.seed !== false) {
    if (options.seedNow) await db.query("select set_config('app.seed_now', $1, false)", [options.seedNow.toISOString()]);
    for (const file of SEED_FILES) await db.exec(readFileSync(path.join(ROOT, "supabase", file), "utf8"));
  }

  return {
    db,
    async as(role, userId, fn) {
      return db.transaction(async (tx) => {
        const claims = userId ? { sub: userId, role } : { role };
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await tx.exec(`set local role ${role}`);
        return fn(tx);
      });
    },
    close: () => db.close(),
  };
}

/** Fixed IDs from supabase/seed.sql, so tests read like the scenario they check. */
export const SEED = {
  owner: "a0000000-0000-4000-8000-000000000001",
  staffJonas: "a0000000-0000-4000-8000-000000000002",
  staffMira: "a0000000-0000-4000-8000-000000000003",
  /** Assigned to Jonas. */
  inquiryOfJonas: "e0000000-0000-4000-8000-000000000001",
  /** Assigned to Mira. */
  inquiryOfMira: "e0000000-0000-4000-8000-000000000002",
  /** Not assigned to anyone. */
  unassignedInquiry: "e0000000-0000-4000-8000-000000000025",
  /** Contact that only has inquiries assigned to Mira. */
  contactOfMira: "c0000000-0000-4000-8000-000000000002",
  /** Contact that only has inquiries assigned to Jonas. */
  contactOfJonas: "c0000000-0000-4000-8000-000000000001",
} as const;

export const SEED_PASSWORD = "Lindgruen-Demo-2026";

/** Fixed IDs from supabase/seed-en.sql (workspace "en"). The English seed mirrors the German one row by row. */
export const SEED_EN = {
  owner: "a1000000-0000-4000-8000-000000000001",
  staffConor: "a1000000-0000-4000-8000-000000000002",
  staffAoife: "a1000000-0000-4000-8000-000000000003",
  /** Assigned to Conor. */
  inquiryOfConor: "e1000000-0000-4000-8000-000000000001",
  /** Assigned to Aoife. */
  inquiryOfAoife: "e1000000-0000-4000-8000-000000000002",
  unassignedInquiry: "e1000000-0000-4000-8000-000000000025",
  contactOfConor: "c1000000-0000-4000-8000-000000000001",
  /** The inquiry with the accepted AI draft (assigned to Aoife). */
  inquiryWithDraft: "e1000000-0000-4000-8000-000000000014",
} as const;

export const SEED_PASSWORD_EN = "Larkspur-Demo-2026";
