/**
 * Two demo businesses share one database: the German demo (workspace "de",
 * supabase/seed.sql) and the English demo ("en", supabase/seed-en.sql). These
 * tests attack the wall between them from both sides, as owners and staff,
 * through tables, column privileges, foreign keys and every SECURITY DEFINER
 * function, against the real migrations in Postgres (PGlite).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createTestDatabase, SEED, SEED_EN, type TestDatabase } from "../support/pg-harness";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase({ seedNow: new Date("2026-11-24T12:00:00Z") });
});

afterAll(async () => {
  await t.close();
});

const PERMISSION_DENIED = { code: "42501" };
const FOREIGN_KEY = { code: "23503" };
const NOT_FOUND = { code: "P0002" };

const PEOPLE = [
  { name: "German owner", id: SEED.owner, own: "de", other: "en" },
  { name: "German staff member", id: SEED.staffJonas, own: "de", other: "en" },
  { name: "English owner", id: SEED_EN.owner, own: "en", other: "de" },
  { name: "English staff member", id: SEED_EN.staffConor, own: "en", other: "de" },
] as const;

/** Rows of every readable table as the given member, with the workspace each row belongs to. */
async function visibleWorkspaces(userId: string) {
  return t.as("authenticated", userId, async (tx) => {
    const { rows } = await tx.query<{ source: string; workspace: string; n: number }>(
      `select 'profiles' as source, workspace, count(*)::int as n from public.profiles group by 2
       union all select 'contacts', workspace, count(*)::int from public.contacts group by 2
       union all select 'inquiries', workspace, count(*)::int from public.inquiries group by 2
       union all select 'api_keys', workspace, count(*)::int from public.api_keys group by 2
       union all select 'notes', i.workspace, count(*)::int
                   from public.inquiry_notes n join public.inquiries i on i.id = n.inquiry_id group by 2
       union all select 'events', i.workspace, count(*)::int
                   from public.inquiry_events e join public.inquiries i on i.id = e.inquiry_id group by 2
       union all select 'drafts', i.workspace, count(*)::int
                   from public.ai_drafts d join public.inquiries i on i.id = d.inquiry_id group by 2`,
    );
    return rows;
  });
}

/** Counts as the superuser, i.e. the truth in the table. */
async function countAll(sql: string, params: unknown[] = []) {
  return Number((await t.db.query<{ n: number }>(sql, params)).rows[0].n);
}

async function createApiKey(raw: string, workspace: "de" | "en", createdBy: string) {
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  const { rows } = await t.db.query<{ id: string }>(
    `insert into public.api_keys (name, key_prefix, key_hash, created_by, workspace)
     values ('Test', $1, $2, $3, $4) returning id`,
    [raw.slice(0, 12), hash, createdBy, workspace],
  );
  return rows[0].id;
}

describe("the seed", () => {
  it("puts three members, 20 contacts and 30 inquiries into each workspace", async () => {
    const { rows } = await t.db.query(
      `select workspace,
              (select count(*)::int from public.profiles p where p.workspace = w.workspace) as members,
              (select count(*)::int from public.contacts c where c.workspace = w.workspace) as contacts,
              (select count(*)::int from public.inquiries i where i.workspace = w.workspace) as inquiries
         from (values ('de'), ('en')) as w(workspace) order by 1`,
    );
    expect(rows).toEqual([
      { workspace: "de", members: 3, contacts: 20, inquiries: 30 },
      { workspace: "en", members: 3, contacts: 20, inquiries: 30 },
    ]);
  });

  it("never links a row to a row of the other workspace", async () => {
    const crossing = await countAll(
      `select count(*)::int as n from (
         select i.id from public.inquiries i join public.contacts c on c.id = i.contact_id where c.workspace <> i.workspace
         union all select i.id from public.inquiries i join public.profiles p on p.id = i.assigned_to where p.workspace <> i.workspace
         union all select n.id from public.inquiry_notes n join public.inquiries i on i.id = n.inquiry_id
                     join public.profiles p on p.id = n.author_id where p.workspace <> i.workspace
         union all select i.id from public.inquiry_events e join public.inquiries i on i.id = e.inquiry_id
                     join public.profiles p on p.id = e.actor_id where p.workspace <> i.workspace
         union all select d.id from public.ai_drafts d join public.inquiries i on i.id = d.inquiry_id
                     join public.profiles p on p.id = d.created_by where p.workspace <> i.workspace
       ) x`,
    );
    expect(crossing).toBe(0);
  });
});

describe.each(PEOPLE)("$name", ({ id, own, other }) => {
  it("sees rows of their own workspace only, in every table", async () => {
    const rows = await visibleWorkspaces(id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.workspace !== own)).toEqual([]);
    expect(rows.find((r) => r.source === "inquiries")!.n).toBeGreaterThan(0);
    expect(rows.find((r) => r.source === "profiles")!.n).toBe(3);
  });

  it("cannot read a row of the other workspace even by id", async () => {
    const theirs = other === "de" ? SEED : SEED_EN;
    const target = other === "de"
      ? { inquiry: SEED.inquiryOfJonas, contact: SEED.contactOfJonas, member: SEED.staffJonas }
      : { inquiry: SEED_EN.inquiryOfConor, contact: SEED_EN.contactOfConor, member: SEED_EN.staffConor };
    const found = await t.as("authenticated", id, async (tx) => ({
      inquiry: (await tx.query(`select 1 from public.inquiries where id = $1`, [target.inquiry])).rows.length,
      contact: (await tx.query(`select 1 from public.contacts where id = $1`, [target.contact])).rows.length,
      member: (await tx.query(`select 1 from public.profiles where id = $1`, [target.member])).rows.length,
      owner: (await tx.query(`select 1 from public.profiles where id = $1`, [theirs.owner])).rows.length,
      notes: (await tx.query(`select 1 from public.inquiry_notes where inquiry_id = $1`, [target.inquiry])).rows.length,
      events: (await tx.query(`select 1 from public.inquiry_events where inquiry_id = $1`, [target.inquiry])).rows.length,
    }));
    expect(found).toEqual({ inquiry: 0, contact: 0, member: 0, owner: 0, notes: 0, events: 0 });
  });

  it("cannot change a row of the other workspace", async () => {
    const target = other === "de"
      ? { inquiry: SEED.inquiryOfJonas, contact: SEED.contactOfJonas }
      : { inquiry: SEED_EN.inquiryOfConor, contact: SEED_EN.contactOfConor };
    const affected = await t.as("authenticated", id, async (tx) => ({
      inquiry: (await tx.query(`update public.inquiries set title = 'Taken over', status = 'lost' where id = $1`, [target.inquiry]))
        .affectedRows,
      contact: (await tx.query(`update public.contacts set phone = '000' where id = $1`, [target.contact])).affectedRows,
    }));
    expect(affected).toEqual({ inquiry: 0, contact: 0 });

    await expect(
      t.as("authenticated", id, (tx) =>
        tx.query(`insert into public.inquiry_notes (inquiry_id, body) values ($1, 'Planted note')`, [target.inquiry]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    await expect(
      t.as("authenticated", id, (tx) =>
        tx.query(
          `insert into public.ai_drafts (inquiry_id, summary, questions, model) values ($1, 'Planted', '["?"]', 'mock')`,
          [target.inquiry],
        ),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    expect(await countAll(`select count(*)::int as n from public.inquiries where id = $1 and title = 'Taken over'`, [target.inquiry])).toBe(0);
  });

  it("cannot move a row into another workspace or choose the workspace of a new row", async () => {
    await expect(
      t.as("authenticated", id, (tx) => tx.query(`update public.profiles set workspace = $1 where id = $2`, [other, id])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    await expect(
      t.as("authenticated", id, (tx) => tx.query(`update public.inquiries set workspace = $1`, [other])),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    await expect(
      t.as("authenticated", id, (tx) =>
        tx.query(`insert into public.contacts (full_name, workspace) values ('Planted', $1)`, [other]),
      ),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });
});

describe("an owner", () => {
  it("creates rows in their own workspace without naming it", async () => {
    const rows = await t.as("authenticated", SEED_EN.owner, async (tx) =>
      (await tx.query<{ id: string; workspace: string }>(
        `insert into public.contacts (full_name, email) values ('Ciara Doyle', 'ciara.doyle@post.example') returning id, workspace`,
      )).rows,
    );
    expect(rows[0].workspace).toBe("en");
    await t.db.query(`delete from public.contacts where id = $1`, [rows[0].id]);
  });

  it("cannot file an inquiry under a contact of the other workspace", async () => {
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) =>
        tx.query(`insert into public.inquiries (contact_id, title) values ($1, 'Borrowed customer')`, [SEED.contactOfJonas]),
      ),
    ).rejects.toMatchObject(FOREIGN_KEY);
    await expect(
      t.as("authenticated", SEED.owner, (tx) =>
        tx.query(`insert into public.inquiries (contact_id, title) values ($1, 'Geliehener Kunde')`, [SEED_EN.contactOfConor]),
      ),
    ).rejects.toMatchObject(FOREIGN_KEY);
  });

  it("cannot assign an inquiry to a member of the other workspace, which would show it to them", async () => {
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) =>
        tx.query(`update public.inquiries set assigned_to = $1 where id = $2`, [SEED.staffJonas, SEED_EN.unassignedInquiry]),
      ),
    ).rejects.toMatchObject(FOREIGN_KEY);
    await expect(
      t.as("authenticated", SEED.owner, (tx) =>
        tx.query(`update public.inquiries set assigned_to = $1 where id = $2`, [SEED_EN.staffConor, SEED.unassignedInquiry]),
      ),
    ).rejects.toMatchObject(FOREIGN_KEY);
  });

  it("cannot change roles in the other workspace, and the last-owner rule counts only their own", async () => {
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.set_member_role($1, 'owner')`, [SEED.staffJonas])),
    ).rejects.toMatchObject({ ...NOT_FOUND, message: "member not found" });
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.set_member_role($1, 'staff')`, [SEED.owner])),
    ).rejects.toMatchObject({ ...NOT_FOUND, message: "member not found" });
    const { rows } = await t.db.query<{ role: string }>(`select role from public.profiles where id = any($1) order by id`, [
      [SEED.owner, SEED.staffJonas],
    ]);
    expect(rows.map((r) => r.role)).toEqual(["owner", "staff"]);

    // The German workspace has an owner too, but that does not make the English owner demotable.
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.set_member_role($1, 'staff')`, [SEED_EN.owner])),
    ).rejects.toMatchObject({ message: "the last owner cannot be demoted" });
  });

  it("sees and revokes only the API keys of their own workspace", async () => {
    const germanKey = await createApiKey("crm_germankey_" + "g".repeat(30), "de", SEED.owner);
    const affected = await t.as("authenticated", SEED_EN.owner, async (tx) => ({
      read: (await tx.query(`select 1 from public.api_keys where id = $1`, [germanKey])).rows.length,
      revoked: (await tx.query(`update public.api_keys set revoked_at = now() where id = $1`, [germanKey])).affectedRows,
    }));
    expect(affected).toEqual({ read: 0, revoked: 0 });
    expect(await countAll(`select count(*)::int as n from public.api_keys where id = $1 and revoked_at is null`, [germanKey])).toBe(1);
  });
});

describe("AI drafts across workspaces", () => {
  async function pendingGermanDraft() {
    return t.as("authenticated", SEED.staffJonas, async (tx) =>
      (await tx.query<{ id: string }>(
        `insert into public.ai_drafts (inquiry_id, summary, questions, model) values ($1, 'Entwurf', '["Wie viele Gäste?"]', 'mock') returning id`,
        [SEED.inquiryOfJonas],
      )).rows[0].id,
    );
  }

  it("cannot be accepted or discarded by the owner of the other workspace", async () => {
    const draftId = await pendingGermanDraft();
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.accept_ai_draft($1)`, [draftId])),
    ).rejects.toMatchObject(NOT_FOUND);
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.discard_ai_draft($1)`, [draftId])),
    ).rejects.toMatchObject(NOT_FOUND);
    expect(await countAll(`select count(*)::int as n from public.ai_drafts where id = $1 and status = 'draft'`, [draftId])).toBe(1);
    await t.db.query(`delete from public.ai_drafts where id = $1`, [draftId]);
  });

  it("become a note in the language of their workspace when accepted", async () => {
    const body = await t.as("authenticated", SEED_EN.staffAoife, async (tx) => {
      const draft = (await tx.query<{ id: string }>(
        `insert into public.ai_drafts (inquiry_id, summary, questions, model)
         values ($1, 'A courtyard party for 200 guests.', '["Is there power in the courtyard?"]', 'mock') returning id`,
        [SEED_EN.inquiryOfAoife],
      )).rows[0].id;
      const noteId = (await tx.query<{ id: string }>(`select public.accept_ai_draft($1) as id`, [draft])).rows[0].id;
      return (await tx.query<{ body: string }>(`select body from public.inquiry_notes where id = $1`, [noteId])).rows[0].body;
    });
    expect(body).toBe("Summary: A courtyard party for 200 guests.\n\nFollow-up questions:\n- Is there power in the courtyard?");
  });

  it("have a budget per workspace: a full German day leaves the English demo its drafts", async () => {
    await t.db.query(`delete from public.ai_usage`);
    await t.db.query(
      `insert into public.ai_usage (user_id, created_at, workspace) select $1, now() - interval '1 hour', 'de' from generate_series(1, 100)`,
      [SEED.owner],
    );
    await expect(
      t.as("authenticated", SEED.staffJonas, (tx) => tx.query(`select public.reserve_ai_draft($1)`, [SEED.inquiryOfJonas])),
    ).rejects.toMatchObject({ code: "PT429", message: "daily draft limit reached" });
    await t.as("authenticated", SEED_EN.staffConor, (tx) => tx.query(`select public.reserve_ai_draft($1)`, [SEED_EN.inquiryOfConor]));
    await expect(
      t.as("authenticated", SEED_EN.owner, (tx) => tx.query(`select public.reserve_ai_draft($1)`, [SEED.inquiryOfJonas])),
    ).rejects.toMatchObject(NOT_FOUND);
    await t.db.query(`delete from public.ai_usage`);
  });
});

describe("public intake across workspaces", () => {
  it("writes into the workspace of the key and matches a known e-mail only there", async () => {
    const raw = "crm_englishky_" + "e".repeat(30);
    await createApiKey(raw, "en", SEED_EN.owner);
    const germanContact = `select full_name, company, phone, updated_at from public.contacts where id = $1`;
    const before = (await t.db.query(germanContact, [SEED.contactOfJonas])).rows[0];
    const germanEmail = (await t.db.query<{ email: string }>(`select email from public.contacts where id = $1`, [SEED.contactOfJonas]))
      .rows[0].email;

    const result = await t.as("anon", null, async (tx) =>
      (await tx.query<{ r: { inquiry_id: string } }>(`select public.ingest_inquiry($1, $2) as r`, [
        raw,
        { name: "Somebody Else", email: germanEmail.toUpperCase(), title: "Christmas lunch", source: "web_form" },
      ])).rows[0].r,
    );

    const { rows } = await t.db.query(
      `select i.workspace, i.matched_existing_contact, c.workspace as contact_workspace, c.full_name
         from public.inquiries i join public.contacts c on c.id = i.contact_id where i.id = $1`,
      [result.inquiry_id],
    );
    // A new English contact, not a link to the German customer with that address.
    expect(rows[0]).toEqual({ workspace: "en", matched_existing_contact: false, contact_workspace: "en", full_name: "Somebody Else" });
    expect((await t.db.query(germanContact, [SEED.contactOfJonas])).rows[0]).toEqual(before);

    const seenBy = async (userId: string) =>
      t.as("authenticated", userId, async (tx) => (await tx.query(`select 1 from public.inquiries where id = $1`, [result.inquiry_id])).rows.length);
    expect(await seenBy(SEED_EN.owner)).toBe(1);
    expect(await seenBy(SEED.owner)).toBe(0);
  });
});

describe("accounts", () => {
  let next = 10;
  async function newUser(appMeta: object, userMeta: object) {
    const id = `f0000000-0000-4000-8000-0000000000${next++}`;
    await t.db.query(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)`,
      [id, `${id}@test.example`, appMeta, userMeta],
    );
    const { rows } = await t.db.query<{ workspace: string; role: string }>(`select workspace, role from public.profiles where id = $1`, [id]);
    await t.db.query(`delete from auth.users where id = $1`, [id]);
    return rows[0];
  }

  it("join the workspace named in the app metadata, which only the platform can set, and never from user metadata", async () => {
    expect(await newUser({ workspace: "en" }, { full_name: "New" })).toEqual({ workspace: "en", role: "staff" });
    expect(await newUser({}, { workspace: "en", role: "owner" })).toEqual({ workspace: "de", role: "staff" });
    expect(await newUser({ workspace: "fr" }, {})).toEqual({ workspace: "de", role: "staff" });
  });

  it("see nothing at all while they have no profile, because no workspace matches", async () => {
    const ghost = "f0000000-0000-4000-8000-000000000099";
    const seen = await t.as("authenticated", ghost, async (tx) => {
      const { rows } = await tx.query<{ n: number }>(
        `select (select count(*) from public.profiles) + (select count(*) from public.contacts)
              + (select count(*) from public.inquiries) + (select count(*) from public.inquiry_notes)
              + (select count(*) from public.inquiry_events) + (select count(*) from public.ai_drafts) as n`,
      );
      return Number(rows[0].n);
    });
    expect(seen).toBe(0);
  });
});
