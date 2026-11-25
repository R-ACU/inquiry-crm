/**
 * Row level security, column privileges and RPC functions, tested against
 * a real Postgres engine (PGlite) running the shipped migrations and seed.
 *
 * Each test switches to the API role PostgREST would use (anon or
 * authenticated) and sets the JWT claims, so auth.uid() resolves exactly as
 * it does on Supabase.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createTestDatabase, SEED, type TestDatabase } from "../support/pg-harness";

let t: TestDatabase;

beforeAll(async () => {
  // Fixed seed moment: the seed then keeps its dates as written.
  t = await createTestDatabase({ seedNow: new Date("2026-11-24T12:00:00Z") });
});

afterAll(async () => {
  await t.close();
});

const PERMISSION_DENIED = { code: "42501" };

function hashKey(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

async function createApiKey(raw: string, options: { revoked?: boolean; limit?: number } = {}) {
  await t.db.query(
    `insert into public.api_keys (name, key_prefix, key_hash, rate_limit_per_minute, created_by, revoked_at, workspace)
     values ($1, $2, $3, $4, $5, $6, 'de')`,
    [
      "Test",
      raw.slice(0, 12),
      hashKey(raw),
      options.limit ?? 20,
      SEED.owner,
      options.revoked ? new Date().toISOString() : null,
    ],
  );
}

describe("schema hygiene", () => {
  it("has RLS enabled on every table in public", async () => {
    const { rows } = await t.db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("pins an empty search_path on every function in public", async () => {
    const { rows } = await t.db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not coalesce(p.proconfig @> array['search_path=""'], false)`,
    );
    expect(rows).toEqual([]);
  });

  it("uses SECURITY DEFINER only for the functions that need it", async () => {
    const { rows } = await t.db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      "accept_ai_draft",
      "current_workspace",
      "discard_ai_draft",
      "handle_new_user",
      "ingest_inquiry",
      "log_ai_draft_decision",
      "log_inquiry_event",
      "login_allowed",
      "record_login_failure",
      "reserve_ai_draft",
      "set_member_role",
    ]);
  });

  it("gives anon nothing in public except the three entry functions", async () => {
    const { rows } = await t.db.query<{ object: string; privilege: string }>(
      `select c.relname as object, p.privilege_type as privilege
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) p
        where n.nspname = 'public' and c.relkind in ('r', 'S', 'v', 'm')
          and p.grantee = 'anon'::regrole
       union all
       select f.proname, 'EXECUTE'
         from pg_proc f join pg_namespace n on n.oid = f.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', f.oid, 'execute')
       order by 1, 2`,
    );
    expect(rows).toEqual([
      { object: "ingest_inquiry", privilege: "EXECUTE" },
      { object: "login_allowed", privilege: "EXECUTE" },
      { object: "record_login_failure", privilege: "EXECUTE" },
    ]);
  });

  it("gives a table or function added by a later migration no rights for anon or authenticated", async () => {
    // Supabase's default privileges would grant everything; the migration revokes them.
    await t.db.transaction(async (tx) => {
      await tx.exec(`
        create table public.later_table (id int primary key);
        create function public.later_function() returns int language sql set search_path = '' as 'select 1';
      `);
      const { rows } = await tx.query<Record<string, boolean>>(
        `select has_table_privilege('anon', 'public.later_table', 'select') as anon_select,
                has_table_privilege('authenticated', 'public.later_table', 'insert') as auth_insert,
                has_function_privilege('anon', 'public.later_function()', 'execute') as anon_exec,
                has_function_privilege('authenticated', 'public.later_function()', 'execute') as auth_exec`,
      );
      expect(rows[0]).toEqual({ anon_select: false, auth_insert: false, anon_exec: false, auth_exec: false });
      await tx.rollback();
    });
  });
});

describe("anon (no session)", () => {
  const tables = ["profiles", "contacts", "inquiries", "inquiry_notes", "inquiry_events", "ai_drafts", "api_keys"];

  for (const table of tables) {
    it(`cannot read ${table}`, async () => {
      await expect(
        t.as("anon", null, (tx) => tx.query(`select * from public.${table}`)),
      ).rejects.toMatchObject(PERMISSION_DENIED);
    });
  }

  it("cannot insert an inquiry directly", async () => {
    await expect(
      t.as("anon", null, (tx) =>
        tx.query(`insert into public.inquiries (contact_id, title) values ($1, 'Spam')`, [SEED.contactOfJonas]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot change roles", async () => {
    await expect(
      t.as("anon", null, (tx) => tx.query(`select public.set_member_role($1, 'owner')`, [SEED.staffJonas])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });
});

describe("staff member A (Jonas)", () => {
  it("sees only inquiries assigned to him", async () => {
    const rows = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query<{ assigned_to: string }>(`select assigned_to from public.inquiries`)).rows,
    );
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.assigned_to === SEED.staffJonas)).toBe(true);
  });

  it("does not see an inquiry of staff member B, even by id", async () => {
    const rows = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`select id from public.inquiries where id = $1`, [SEED.inquiryOfMira])).rows,
    );
    expect(rows).toEqual([]);
  });

  it("does not see unassigned inquiries", async () => {
    const rows = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`select id from public.inquiries where id = $1`, [SEED.unassignedInquiry])).rows,
    );
    expect(rows).toEqual([]);
  });

  it("sees contacts of his inquiries but not contacts of B", async () => {
    const own = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`select id from public.contacts where id = $1`, [SEED.contactOfJonas])).rows,
    );
    const foreign = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`select id from public.contacts where id = $1`, [SEED.contactOfMira])).rows,
    );
    expect(own).toHaveLength(1);
    expect(foreign).toEqual([]);
  });

  it("does not see notes or history of B's inquiries", async () => {
    const [notes, events] = await t.as("authenticated", SEED.staffJonas, async (tx) => [
      (await tx.query(`select id from public.inquiry_notes where inquiry_id = $1`, [SEED.inquiryOfMira])).rows,
      (await tx.query(`select id from public.inquiry_events where inquiry_id = $1`, [SEED.inquiryOfMira])).rows,
    ]);
    expect(notes).toEqual([]);
    expect(events).toEqual([]);
  });

  it("reads the whole team's notes on his inquiries, including one written before a handover", async () => {
    const visible = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query<{ author_id: string }>(`select author_id from public.inquiry_notes`)).rows,
    );
    const { rows: onHisInquiries } = await t.db.query(
      `select n.id from public.inquiry_notes n join public.inquiries i on i.id = n.inquiry_id where i.assigned_to = $1`,
      [SEED.staffJonas],
    );
    expect(visible).toHaveLength(onHisInquiries.length);
    expect(new Set(visible.map((r) => r.author_id))).toEqual(new Set([SEED.owner, SEED.staffJonas, SEED.staffMira]));
  });

  it("cannot make himself owner by updating his profile", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.profiles set role = 'owner' where id = $1`, [SEED.staffJonas]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot make himself owner through the role function", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`select public.set_member_role($1, 'owner')`, [SEED.staffJonas]),
      ),
    ).rejects.toMatchObject({ code: "42501", message: "only an owner can change roles" });

    const { rows } = await t.db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
      SEED.staffJonas,
    ]);
    expect(rows[0].role).toBe("staff");
  });

  it("can rename himself, but nobody else", async () => {
    const result = await t.as("authenticated", SEED.staffJonas, async (tx) => ({
      own: (await tx.query(`update public.profiles set full_name = 'Jonas W.' where id = $1`, [SEED.staffJonas]))
        .affectedRows,
      other: (await tx.query(`update public.profiles set full_name = 'X' where id = $1`, [SEED.staffMira]))
        .affectedRows,
    }));
    expect(result).toEqual({ own: 1, other: 0 });
    await t.db.query(`update public.profiles set full_name = 'Jonas Weber' where id = $1`, [SEED.staffJonas]);
  });

  it("cannot change an inquiry of B", async () => {
    const affected = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`update public.inquiries set status = 'lost' where id = $1`, [SEED.inquiryOfMira]))
        .affectedRows,
    );
    expect(affected).toBe(0);

    const { rows } = await t.db.query<{ status: string }>(`select status from public.inquiries where id = $1`, [
      SEED.inquiryOfMira,
    ]);
    expect(rows[0].status).toBe("quoted");
  });

  it("cannot delete inquiries, not even his own", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) => tx.query(`delete from public.inquiries where id = $1`, [SEED.inquiryOfJonas])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot backdate a note", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.inquiry_notes (inquiry_id, body, created_at) values ($1, 'Alt', '2020-01-01')`, [
          SEED.inquiryOfJonas,
        ]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot delete notes, so the record of an inquiry stays complete", async () => {
    const noteId = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (
        await tx.query<{ id: string }>(`insert into public.inquiry_notes (inquiry_id, body) values ($1, 'Zum Löschen') returning id`, [
          SEED.inquiryOfJonas,
        ])
      ).rows[0].id,
    );
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) => tx.query(`delete from public.inquiry_notes where id = $1`, [noteId])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot change a contact's e-mail, so he cannot probe which addresses exist", async () => {
    // A unique violation on a foreign address would reveal that it exists somewhere in the CRM.
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.contacts set email = 's.albers@kanzlei-albers.example' where id = $1`, [SEED.contactOfJonas]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);

    const affected = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`update public.contacts set phone = '040 555 0199' where id = $1`, [SEED.contactOfJonas])).affectedRows,
    );
    expect(affected).toBe(1);
    await t.db.query(`update public.contacts set phone = '040 555 0101' where id = $1`, [SEED.contactOfJonas]);
  });

  it("cannot hand his inquiry over to someone else", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.inquiries set assigned_to = $1 where id = $2`, [SEED.staffMira, SEED.inquiryOfJonas]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot re-link his inquiry to a foreign contact to read it", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.inquiries set contact_id = $1 where id = $2`, [SEED.contactOfMira, SEED.inquiryOfJonas]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot create inquiries or contacts", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.inquiries (contact_id, title, assigned_to) values ($1, 'Eigene Anfrage', $2)`, [
          SEED.contactOfJonas,
          SEED.staffJonas,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.contacts (full_name) values ('Neu')`),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("can move his own inquiry and the change is logged with him as actor", async () => {
    await t.as("authenticated", SEED.staffJonas, (tx) =>
      tx.query(`update public.inquiries set status = 'quoted' where id = $1`, [SEED.inquiryOfJonas]),
    );
    const { rows } = await t.db.query<{ actor_id: string; details: { from: string; to: string } }>(
      `select actor_id, details from public.inquiry_events
       where inquiry_id = $1 and kind = 'status_changed' order by id desc limit 1`,
      [SEED.inquiryOfJonas],
    );
    expect(rows[0]).toEqual({ actor_id: SEED.staffJonas, details: { from: "new", to: "quoted" } });
    await t.db.query(`update public.inquiries set status = 'new' where id = $1`, [SEED.inquiryOfJonas]);
  });

  it("cannot forge history entries", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.inquiry_events (inquiry_id, kind) values ($1, 'created')`, [SEED.inquiryOfJonas]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("writes notes only on his inquiries and only in his own name", async () => {
    const ok = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`insert into public.inquiry_notes (inquiry_id, body) values ($1, 'Rückruf vereinbart')`, [
        SEED.inquiryOfJonas,
      ])).affectedRows,
    );
    expect(ok).toBe(1);

    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.inquiry_notes (inquiry_id, body) values ($1, 'Hallo')`, [SEED.inquiryOfMira]),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`insert into public.inquiry_notes (inquiry_id, author_id, body) values ($1, $2, 'Im Namen von Mira')`, [
          SEED.inquiryOfJonas,
          SEED.staffMira,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("sees no API keys", async () => {
    const rows = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query(`select id from public.api_keys`)).rows,
    );
    expect(rows).toEqual([]);
  });
});

describe("staff member B (Mira) after a handover", () => {
  it("no longer sees the inquiry she handed over, not even her own note on it", async () => {
    const { rows: written } = await t.db.query(`select id from public.inquiry_notes where inquiry_id = $1 and author_id = $2`, [
      SEED.inquiryOfJonas,
      SEED.staffMira,
    ]);
    expect(written.length).toBeGreaterThan(0);

    const [inquiries, notes] = await t.as("authenticated", SEED.staffMira, async (tx) => [
      (await tx.query(`select id from public.inquiries where id = $1`, [SEED.inquiryOfJonas])).rows,
      (await tx.query(`select id from public.inquiry_notes where inquiry_id = $1`, [SEED.inquiryOfJonas])).rows,
    ]);
    expect(inquiries).toEqual([]);
    expect(notes).toEqual([]);
  });
});

describe("owner (Lena)", () => {
  it("sees all 30 inquiries and 20 contacts", async () => {
    const counts = await t.as("authenticated", SEED.owner, async (tx) => ({
      inquiries: Number((await tx.query<{ n: number }>(`select count(*)::int n from public.inquiries`)).rows[0].n),
      contacts: Number((await tx.query<{ n: number }>(`select count(*)::int n from public.contacts`)).rows[0].n),
    }));
    expect(counts).toEqual({ inquiries: 30, contacts: 20 });
  });

  it("can reassign an inquiry", async () => {
    const affected = await t.as("authenticated", SEED.owner, async (tx) =>
      (await tx.query(`update public.inquiries set assigned_to = $1 where id = $2`, [SEED.staffMira, SEED.unassignedInquiry]))
        .affectedRows,
    );
    expect(affected).toBe(1);
    await t.db.query(`update public.inquiries set assigned_to = null where id = $1`, [SEED.unassignedInquiry]);
  });

  it("can promote and demote members", async () => {
    await t.as("authenticated", SEED.owner, (tx) => tx.query(`select public.set_member_role($1, 'owner')`, [SEED.staffMira]));
    let { rows } = await t.db.query<{ role: string }>(`select role from public.profiles where id = $1`, [SEED.staffMira]);
    expect(rows[0].role).toBe("owner");

    await t.as("authenticated", SEED.owner, (tx) => tx.query(`select public.set_member_role($1, 'staff')`, [SEED.staffMira]));
    ({ rows } = await t.db.query<{ role: string }>(`select role from public.profiles where id = $1`, [SEED.staffMira]));
    expect(rows[0].role).toBe("staff");
  });

  it("cannot demote the last owner", async () => {
    await expect(
      t.as("authenticated", SEED.owner, (tx) => tx.query(`select public.set_member_role($1, 'staff')`, [SEED.owner])),
    ).rejects.toMatchObject({ message: "the last owner cannot be demoted" });
  });

  it("cannot delete an inquiry and with it its history", async () => {
    await expect(
      t.as("authenticated", SEED.owner, (tx) => tx.query(`delete from public.inquiries where id = $1`, [SEED.inquiryOfMira])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    const { rows } = await t.db.query(`select 1 from public.inquiry_events where inquiry_id = $1`, [SEED.inquiryOfMira]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("cannot set internal fields when creating rows", async () => {
    const attempts: [string, unknown[]][] = [
      [`insert into public.inquiries (contact_id, title, source) values ($1, 'Von Hand', 'api')`, [SEED.contactOfJonas]],
      [`insert into public.inquiries (contact_id, title, created_at) values ($1, 'Von Hand', '2020-01-01')`, [SEED.contactOfJonas]],
      [`insert into public.inquiries (contact_id, title, status) values ($1, 'Von Hand', 'won')`, [SEED.contactOfJonas]],
      [`insert into public.inquiries (contact_id, title, closed_at) values ($1, 'Von Hand', now())`, [SEED.contactOfJonas]],
      [`insert into public.inquiries (contact_id, title, matched_existing_contact) values ($1, 'Von Hand', true)`, [SEED.contactOfJonas]],
      [`insert into public.contacts (full_name, created_by) values ('Neu', $1)`, [SEED.staffMira]],
      [`insert into public.contacts (full_name, created_at) values ('Neu', '2020-01-01')`, []],
    ];
    for (const [sql, params] of attempts) {
      await expect(t.as("authenticated", SEED.owner, (tx) => tx.query(sql, params))).rejects.toMatchObject(PERMISSION_DENIED);
    }

    // The same inquiry without internal fields works and is marked as entered by hand.
    const row = await t.as("authenticated", SEED.owner, async (tx) =>
      (
        await tx.query<{ source: string; id: string }>(
          `insert into public.inquiries (contact_id, title) values ($1, 'Von Hand') returning id, source`,
          [SEED.contactOfJonas],
        )
      ).rows[0],
    );
    expect(row.source).toBe("manual");
    await t.db.query(`delete from public.inquiries where id = $1`, [row.id]);
  });

  it("cannot revive a revoked API key", async () => {
    const raw = "crm_revived1_" + "r".repeat(30);
    await createApiKey(raw);
    const { rows } = await t.db.query<{ id: string }>(`select id from public.api_keys where key_hash = $1`, [hashKey(raw)]);
    const id = rows[0].id;

    // Revoking stamps the database time, whatever the client sends.
    await t.as("authenticated", SEED.owner, (tx) =>
      tx.query(`update public.api_keys set revoked_at = '2099-01-01' where id = $1`, [id]),
    );
    const revoked = await t.db.query<{ now_or_earlier: boolean }>(
      `select revoked_at <= now() as now_or_earlier from public.api_keys where id = $1`,
      [id],
    );
    expect(revoked.rows[0].now_or_earlier).toBe(true);

    await expect(
      t.as("authenticated", SEED.owner, (tx) => tx.query(`update public.api_keys set revoked_at = null where id = $1`, [id])),
    ).rejects.toMatchObject({ code: "42501", message: "a revoked api key cannot be changed" });
    await expect(
      t.as("anon", null, (tx) =>
        tx.query(`select public.ingest_inquiry($1, $2)`, [raw, { name: "X", email: "x@post.example", title: "Test" }]),
      ),
    ).rejects.toMatchObject({ code: "PT401" });
  });

  it("cannot read API key hashes", async () => {
    await createApiKey("crm_ownerkey_" + "x".repeat(30));
    await expect(
      t.as("authenticated", SEED.owner, (tx) => tx.query(`select key_hash from public.api_keys`)),
    ).rejects.toMatchObject(PERMISSION_DENIED);

    const rows = await t.as("authenticated", SEED.owner, async (tx) =>
      (await tx.query(`select id, key_prefix from public.api_keys`)).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("AI drafts", () => {
  async function createDraft(userId: string, inquiryId: string) {
    return t.as("authenticated", userId, async (tx) =>
      (
        await tx.query<{ id: string }>(
          `insert into public.ai_drafts (inquiry_id, summary, questions, suggested_event_type, model)
           values ($1, 'Firmenfeier, 40 Personen', '["Uhrzeit?", "Ort?", "Allergien?"]', 'corporate', 'mock')
           returning id`,
          [inquiryId],
        )
      ).rows[0].id,
    );
  }

  it("cannot be created for an inquiry the caller does not see", async () => {
    await expect(createDraft(SEED.staffJonas, SEED.inquiryOfMira)).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot be created as already accepted", async () => {
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(
          `insert into public.ai_drafts (inquiry_id, summary, questions, model, status)
           values ($1, 'x', '["y"]', 'mock', 'accepted')`,
          [SEED.inquiryOfJonas],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("accepting turns the draft into a note in the caller's name, exactly once", async () => {
    const draftId = await createDraft(SEED.staffJonas, SEED.inquiryOfJonas);
    const noteId = await t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query<{ note_id: string }>(`select public.accept_ai_draft($1) as note_id`, [draftId])).rows[0].note_id,
    );

    const { rows } = await t.db.query<{ author_id: string; body: string }>(
      `select author_id, body from public.inquiry_notes where id = $1`,
      [noteId],
    );
    expect(rows[0].author_id).toBe(SEED.staffJonas);
    expect(rows[0].body).toContain("- Allergien?");

    const events = await t.db.query(
      `select 1 from public.inquiry_events where inquiry_id = $1 and kind = 'ai_draft_accepted'`,
      [SEED.inquiryOfJonas],
    );
    expect(events.rows).toHaveLength(1);

    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) => tx.query(`select public.accept_ai_draft($1)`, [draftId])),
    ).rejects.toMatchObject({ message: "draft not found or already decided" });
  });

  it("cannot be edited after creation", async () => {
    const draftId = await createDraft(SEED.staffJonas, SEED.inquiryOfJonas);
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.ai_drafts set summary = 'anders' where id = $1`, [draftId]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("cannot be inserted with a forged creation or decision time", async () => {
    const forged = [
      `insert into public.ai_drafts (inquiry_id, summary, questions, model, created_at)
       values ($1, 'x', '["y"]', 'claude-sonnet-5-5', '2020-01-01')`,
      `insert into public.ai_drafts (inquiry_id, summary, questions, model, decided_at)
       values ($1, 'x', '["y"]', 'claude-sonnet-5-5', '1999-01-01')`,
    ];
    for (const sql of forged) {
      await expect(t.as("authenticated", SEED.staffJonas, (tx) => tx.query(sql, [SEED.inquiryOfJonas]))).rejects.toMatchObject(
        PERMISSION_DENIED,
      );
    }
  });

  it("cannot be marked accepted directly, which would log a decision without its note", async () => {
    const draftId = await createDraft(SEED.staffJonas, SEED.inquiryOfJonas);
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) =>
        tx.query(`update public.ai_drafts set status = 'accepted', decided_at = '1999-01-01' where id = $1`, [draftId]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    const { rows } = await t.db.query<{ status: string }>(`select status from public.ai_drafts where id = $1`, [draftId]);
    expect(rows[0].status).toBe("draft");
  });

  it("is decided with the caller and the database clock, and only on visible inquiries", async () => {
    const draftId = await createDraft(SEED.staffJonas, SEED.inquiryOfJonas);
    await expect(
      t.as("authenticated", SEED.staffMira, (tx) => tx.query(`select public.discard_ai_draft($1)`, [draftId])),
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(
      t.as("authenticated", SEED.staffMira, (tx) => tx.query(`select public.accept_ai_draft($1)`, [draftId])),
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(t.as("anon", null, (tx) => tx.query(`select public.discard_ai_draft($1)`, [draftId]))).rejects.toMatchObject(
      PERMISSION_DENIED,
    );

    await t.as("authenticated", SEED.staffJonas, (tx) => tx.query(`select public.discard_ai_draft($1)`, [draftId]));
    const { rows } = await t.db.query<{ status: string; decided_by: string; recent: boolean }>(
      `select status, decided_by, decided_at > now() - interval '1 minute' as recent from public.ai_drafts where id = $1`,
      [draftId],
    );
    expect(rows[0]).toEqual({ status: "discarded", decided_by: SEED.staffJonas, recent: true });
  });

  it("can be decided by the owner on any inquiry", async () => {
    const draftId = await createDraft(SEED.staffMira, SEED.inquiryOfMira);
    const noteId = await t.as("authenticated", SEED.owner, async (tx) =>
      (await tx.query<{ id: string }>(`select public.accept_ai_draft($1) as id`, [draftId])).rows[0].id,
    );
    const { rows } = await t.db.query<{ author_id: string }>(`select author_id from public.inquiry_notes where id = $1`, [noteId]);
    expect(rows[0].author_id).toBe(SEED.owner);
  });
});

describe("AI draft budget (reserve_ai_draft)", () => {
  async function reserve(userId: string, inquiryId: string) {
    return t.as("authenticated", userId, (tx) => tx.query(`select public.reserve_ai_draft($1)`, [inquiryId]));
  }

  it("allows six drafts per person in ten minutes, counted in the database", async () => {
    await t.db.query(`delete from public.ai_usage`);
    for (let i = 0; i < 6; i += 1) await reserve(SEED.staffJonas, SEED.inquiryOfJonas);
    await expect(reserve(SEED.staffJonas, SEED.inquiryOfJonas)).rejects.toMatchObject({
      code: "PT429",
      message: "draft limit per person reached",
    });
    // Someone else still has their own budget.
    await reserve(SEED.staffMira, SEED.inquiryOfMira);
  });

  it("stops every draft once the daily limit for the whole business is reached", async () => {
    await t.db.query(`delete from public.ai_usage`);
    await t.db.query(
      `insert into public.ai_usage (user_id, created_at, workspace) select $1, now() - interval '1 hour', 'de' from generate_series(1, 100)`,
      [SEED.owner],
    );
    await expect(reserve(SEED.staffMira, SEED.inquiryOfMira)).rejects.toMatchObject({
      code: "PT429",
      message: "daily draft limit reached",
    });
    await t.db.query(`delete from public.ai_usage`);
  });

  it("does not reserve for an inquiry the caller cannot see, and not for anon", async () => {
    await expect(reserve(SEED.staffJonas, SEED.inquiryOfMira)).rejects.toMatchObject({ code: "P0002" });
    await expect(
      t.as("anon", null, (tx) => tx.query(`select public.reserve_ai_draft($1)`, [SEED.inquiryOfMira])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });

  it("keeps the usage table closed to the API", async () => {
    await expect(t.as("authenticated", SEED.owner, (tx) => tx.query(`delete from public.ai_usage`))).rejects.toMatchObject(
      PERMISSION_DENIED,
    );
  });
});

describe("sign-in throttle", () => {
  const allowed = (email: string, client: string) =>
    t.as("anon", null, async (tx) =>
      (await tx.query<{ ok: boolean }>(`select public.login_allowed($1, $2) as ok`, [email, client])).rows[0].ok,
    );
  const fail = (email: string, client: string) =>
    t.as("anon", null, (tx) => tx.query(`select public.record_login_failure($1, $2)`, [email, client]));

  it("locks an e-mail address after five failures, from any client", async () => {
    await t.db.query(`delete from public.login_failures`);
    for (let i = 0; i < 5; i += 1) await fail("Jonas@Lindgruen.example", `198.51.100.${i}`);
    expect(await allowed("jonas@lindgruen.example", "198.51.100.99")).toBe(false);
    expect(await allowed("mira@lindgruen.example", "198.51.100.99")).toBe(true);
  });

  it("locks a client address after twenty failures, whatever the e-mail", async () => {
    await t.db.query(`delete from public.login_failures`);
    for (let i = 0; i < 20; i += 1) await fail(`person${i}@post.example`, "203.0.113.7");
    expect(await allowed("lena@lindgruen.example", "203.0.113.7")).toBe(false);
    expect(await allowed("lena@lindgruen.example", "203.0.113.8")).toBe(true);
  });

  it("forgets failures after fifteen minutes and stores only hashes", async () => {
    await t.db.query(`update public.login_failures set created_at = now() - interval '16 minutes'`);
    expect(await allowed("lena@lindgruen.example", "203.0.113.7")).toBe(true);
    const { rows } = await t.db.query<{ n: number }>(
      `select count(*)::int as n from public.login_failures where email_hash like '%@%' or client_hash like '%.%'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("keeps the failure table closed to the API", async () => {
    await expect(t.as("anon", null, (tx) => tx.query(`select * from public.login_failures`))).rejects.toMatchObject(
      PERMISSION_DENIED,
    );
    await expect(t.as("authenticated", SEED.owner, (tx) => tx.query(`delete from public.login_failures`))).rejects.toMatchObject(
      PERMISSION_DENIED,
    );
  });
});

describe("ingest_inquiry (public intake)", () => {
  const payload = {
    name: "Greta Sommer",
    email: "Greta.Sommer@post.example",
    title: "Gartenfest im Juli",
    message: "Wir planen ein Gartenfest.",
    event_date: "2027-07-17",
    guest_count: 45,
    budget_cents: 200000,
    source: "web_form",
  };

  it("rejects an unknown key", async () => {
    await expect(
      t.as("anon", null, (tx) =>
        tx.query(`select public.ingest_inquiry($1, $2)`, ["crm_unknown_" + "a".repeat(30), payload]),
      ),
    ).rejects.toMatchObject({ code: "PT401" });
  });

  it("rejects a revoked key", async () => {
    const raw = "crm_revoked1_" + "b".repeat(30);
    await createApiKey(raw, { revoked: true });
    await expect(
      t.as("anon", null, (tx) => tx.query(`select public.ingest_inquiry($1, $2)`, [raw, payload])),
    ).rejects.toMatchObject({ code: "PT401" });
  });

  it("creates contact and inquiry for a valid key, without exposing them to anon", async () => {
    const raw = "crm_validkey_" + "c".repeat(30);
    await createApiKey(raw);
    const result = await t.as("anon", null, async (tx) =>
      (await tx.query<{ r: Record<string, string> }>(`select public.ingest_inquiry($1, $2) as r`, [raw, payload])).rows[0].r,
    );
    // Only the inquiry id leaves the database.
    expect(Object.keys(result)).toEqual(["inquiry_id"]);

    const { rows } = await t.db.query(
      `select i.status, i.source, i.assigned_to, c.email, i.matched_existing_contact
       from public.inquiries i join public.contacts c on c.id = i.contact_id where i.id = $1`,
      [result.inquiry_id],
    );
    expect(rows[0]).toEqual({
      status: "new",
      source: "web_form",
      assigned_to: null,
      email: "greta.sommer@post.example",
      matched_existing_contact: false,
    });
  });

  it("intake with an existing customer e-mail does not impersonate the customer", async () => {
    const raw = "crm_imperson_" + "i".repeat(30);
    await createApiKey(raw);
    const contactSql = `select full_name, company, phone, updated_at from public.contacts where id = $1`;
    const before = (await t.db.query(contactSql, [SEED.contactOfJonas])).rows[0];

    const result = await t.as("anon", null, async (tx) =>
      (
        await tx.query<{ r: { inquiry_id: string } }>(`select public.ingest_inquiry($1, $2) as r`, [
          raw,
          {
            ...payload,
            email: "Tobias.Krueger@nordlicht-software.example",
            name: "Angreifer",
            company: "Fremde GmbH",
            phone: "0000 000",
            title: "Bitte Rechnung an neue Adresse",
          },
        ])
      ).rows[0].r,
    );

    // The known contact is untouched.
    expect((await t.db.query(contactSql, [SEED.contactOfJonas])).rows[0]).toEqual(before);

    // The inquiry is linked by e-mail, flagged, and keeps what the sender really typed.
    const { rows } = await t.db.query(
      `select contact_id, matched_existing_contact, submitted_contact from public.inquiries where id = $1`,
      [result.inquiry_id],
    );
    expect(rows[0]).toEqual({
      contact_id: SEED.contactOfJonas,
      matched_existing_contact: true,
      submitted_contact: {
        name: "Angreifer",
        company: "Fremde GmbH",
        email: "tobias.krueger@nordlicht-software.example",
        phone: "0000 000",
      },
    });
    await t.db.query(`delete from public.inquiries where id = $1`, [result.inquiry_id]);
  });

  it("cannot mark its inquiry as manual", async () => {
    const raw = "crm_sourcekey_" + "d".repeat(30);
    await createApiKey(raw);
    const result = await t.as("anon", null, async (tx) =>
      (await tx.query<{ r: { inquiry_id: string } }>(`select public.ingest_inquiry($1, $2) as r`, [
        raw,
        { ...payload, email: "x@post.example", source: "manual" },
      ])).rows[0].r,
    );
    const { rows } = await t.db.query<{ source: string }>(`select source from public.inquiries where id = $1`, [
      result.inquiry_id,
    ]);
    expect(rows[0].source).toBe("api");
  });

  it("enforces the per-key rate limit in the database", async () => {
    const raw = "crm_limited1_" + "e".repeat(30);
    await createApiKey(raw, { limit: 2 });
    const call = (i: number) =>
      t.as("anon", null, (tx) =>
        tx.query(`select public.ingest_inquiry($1, $2)`, [raw, { ...payload, email: `limit${i}@post.example` }]),
      );
    await call(1);
    await call(2);
    await expect(call(3)).rejects.toMatchObject({ code: "PT429" });
  });

  it("lets table constraints reject invalid fields", async () => {
    const raw = "crm_checkkey_" + "f".repeat(30);
    await createApiKey(raw);
    await expect(
      t.as("anon", null, (tx) =>
        tx.query(`select public.ingest_inquiry($1, $2)`, [raw, { ...payload, guest_count: -5 }]),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
