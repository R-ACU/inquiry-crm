/**
 * A small PostgREST stand-in for local preview and tests.
 *
 * It translates the subset of the PostgREST HTTP API that supabase-js sends
 * for this app into SQL and runs it inside a transaction as the API role of
 * the caller (anon or authenticated, with JWT claims set). Authorization is
 * therefore decided by the real RLS policies and column privileges from
 * supabase/migrations, exactly as on Supabase.
 *
 * Supported: select with columns, aliases and one level of nested embeds
 * (to-one and to-many, resolved from foreign keys), filters eq, neq, gt,
 * gte, lt, lte, like, ilike, is, in and not.<op>, order, limit, offset,
 * single-object responses, insert, update, delete with return=representation,
 * and RPC calls.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";

export interface Caller {
  role: "anon" | "authenticated";
  claims: Record<string, unknown>;
}

export interface RestResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type SelectItem =
  | { kind: "star" }
  | { kind: "column"; name: string; alias: string }
  | { kind: "embed"; alias: string; table: string; hint?: string; items: SelectItem[] };

interface ForeignKey {
  name: string;
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) throw new RestError(400, "PGRST100", `invalid identifier: ${name}`);
  return `"${name}"`;
}

export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string | null = null,
  ) {
    super(message);
  }
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSelect(select: string | null): SelectItem[] {
  if (!select || select === "*") return [{ kind: "star" }];
  return splitTopLevel(select).map((raw): SelectItem => {
    if (raw === "*") return { kind: "star" };
    const embed = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!([a-z_][a-z0-9_]*))?\((.*)\)$/s.exec(raw);
    if (embed) {
      const [, alias, table, hint, inner] = embed;
      return { kind: "embed", alias: alias ?? table, table, hint, items: parseSelect(inner || "*") };
    }
    const column = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)$/.exec(raw);
    if (!column) throw new RestError(400, "PGRST100", `unsupported select item: ${raw}`);
    return { kind: "column", alias: column[1] ?? column[2], name: column[2] };
  });
}

/** Splits "a,b,\"c,d\"" inside in.(...) into values. */
function parseList(list: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of list) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

const OPERATORS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "like",
  ilike: "ilike",
};

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

export class PostgrestEmulator {
  private foreignKeys: ForeignKey[] = [];

  constructor(private readonly db: PGlite) {}

  async init() {
    const { rows } = await this.db.query<ForeignKey>(`
      select con.conname as name, src.relname as table, a.attname as column,
             ref.relname as "refTable", ra.attname as "refColumn"
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace n on n.oid = src.relnamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = con.confkey[1]
      where con.contype = 'f' and n.nspname = 'public'`);
    this.foreignKeys = rows;
  }

  private resolveEmbed(fromTable: string, item: Extract<SelectItem, { kind: "embed" }>) {
    const matchesHint = (fk: ForeignKey) => !item.hint || item.hint === fk.column || item.hint === fk.name;
    const toOne = this.foreignKeys.filter((fk) => fk.table === fromTable && fk.refTable === item.table && matchesHint(fk));
    if (toOne.length === 1) {
      return { cardinality: "one" as const, localColumn: toOne[0].column, remoteColumn: toOne[0].refColumn };
    }
    const toMany = this.foreignKeys.filter((fk) => fk.table === item.table && fk.refTable === fromTable && matchesHint(fk));
    if (toMany.length === 1) {
      return { cardinality: "many" as const, localColumn: toMany[0].refColumn, remoteColumn: toMany[0].column };
    }
    throw new RestError(
      300,
      "PGRST201",
      `Could not embed ${item.table} from ${fromTable}: ${toOne.length + toMany.length} relationships match`,
    );
  }

  private selectList(table: string, items: SelectItem[], alias: string, depth: number): string {
    return items
      .map((item) => {
        if (item.kind === "star") return `${alias}.*`;
        if (item.kind === "column") return `${alias}.${ident(item.name)} as ${ident(item.alias)}`;
        if (depth > 1) throw new RestError(400, "PGRST100", "only one level of embedding is supported");
        const rel = this.resolveEmbed(table, item);
        const inner = `t${depth + 1}`;
        const sub = `select ${this.selectList(item.table, item.items, inner, depth + 1)} from public.${ident(item.table)} ${inner} where ${inner}.${ident(rel.remoteColumn)} = ${alias}.${ident(rel.localColumn)}`;
        return rel.cardinality === "one"
          ? `(select row_to_json(x) from (${sub} limit 1) x) as ${ident(item.alias)}`
          : `(select coalesce(json_agg(x), '[]'::json) from (${sub}) x) as ${ident(item.alias)}`;
      })
      .join(", ");
  }

  private whereClause(params: URLSearchParams, alias: string, values: unknown[]): string {
    const conditions: string[] = [];
    for (const [key, raw] of params) {
      if (RESERVED_PARAMS.has(key)) continue;
      if (key.includes(".")) throw new RestError(400, "PGRST100", `filters on embedded resources are not supported: ${key}`);
      let expression = raw;
      let negate = false;
      if (expression.startsWith("not.")) {
        negate = true;
        expression = expression.slice(4);
      }
      const dot = expression.indexOf(".");
      const op = expression.slice(0, dot);
      const value = expression.slice(dot + 1);
      const column = `${alias}.${ident(key)}`;
      let condition: string;
      if (op in OPERATORS) {
        values.push(op === "like" || op === "ilike" ? value.replace(/\*/g, "%") : value);
        condition = `${column} ${OPERATORS[op]} $${values.length}`;
      } else if (op === "is") {
        const literal = { null: "null", true: "true", false: "false" }[value];
        if (!literal) throw new RestError(400, "PGRST100", `invalid is value: ${value}`);
        condition = `${column} is ${literal}`;
      } else if (op === "in") {
        const list = /^\((.*)\)$/.exec(value);
        if (!list) throw new RestError(400, "PGRST100", `invalid in list: ${value}`);
        const placeholders = parseList(list[1]).map((v) => {
          values.push(v);
          return `$${values.length}`;
        });
        condition = placeholders.length ? `${column} in (${placeholders.join(", ")})` : "false";
      } else {
        throw new RestError(400, "PGRST100", `unsupported operator: ${op}`);
      }
      conditions.push(negate ? `not (${condition})` : condition);
    }
    return conditions.length ? `where ${conditions.join(" and ")}` : "";
  }

  private orderClause(params: URLSearchParams, alias: string): string {
    const order = params.get("order");
    if (!order) return "";
    const terms = order.split(",").map((term) => {
      const [column, ...modifiers] = term.split(".");
      const direction = modifiers.includes("desc") ? "desc" : "asc";
      const nulls = modifiers.includes("nullsfirst") ? " nulls first" : modifiers.includes("nullslast") ? " nulls last" : "";
      return `${alias}.${ident(column)} ${direction}${nulls}`;
    });
    return `order by ${terms.join(", ")}`;
  }

  private pagination(params: URLSearchParams): string {
    const parts: string[] = [];
    const limit = params.get("limit");
    const offset = params.get("offset");
    if (limit !== null) parts.push(`limit ${Number.parseInt(limit, 10)}`);
    if (offset !== null) parts.push(`offset ${Number.parseInt(offset, 10)}`);
    return parts.join(" ");
  }

  /** Columns for RETURNING: only what the select asks for, so column privileges behave like PostgREST. */
  private returningList(items: SelectItem[]): string {
    if (items.some((i) => i.kind === "embed")) {
      throw new RestError(400, "PGRST100", "embedding in mutations is not supported by the local emulator");
    }
    return items
      .map((i) => (i.kind === "column" ? `t0.${ident(i.name)} as ${ident(i.alias)}` : "t0.*"))
      .join(", ");
  }

  private async asCaller<T>(caller: Caller, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(caller.claims)]);
      await tx.exec(`set local role ${caller.role}`);
      return fn(tx);
    });
  }

  async handle(
    method: string,
    path: string,
    params: URLSearchParams,
    headers: Headers,
    body: unknown,
    caller: Caller,
  ): Promise<RestResponse> {
    try {
      const rpc = /^\/rpc\/([a-z_][a-z0-9_]*)$/.exec(path);
      if (rpc) return await this.rpc(rpc[1], body, caller);

      const tableMatch = /^\/([a-z_][a-z0-9_]*)$/.exec(path);
      if (!tableMatch) throw new RestError(404, "PGRST125", `Invalid path ${path}`);
      const table = tableMatch[1];
      const items = parseSelect(params.get("select"));
      const wantsObject = (headers.get("accept") ?? "").includes("application/vnd.pgrst.object+json");
      const prefer = headers.get("prefer") ?? "";
      const wantsRepresentation = prefer.includes("return=representation");
      const values: unknown[] = [];

      let sql: string;
      if (method === "GET" || method === "HEAD") {
        sql = `select coalesce(json_agg(r), '[]'::json) as rows from (select ${this.selectList(table, items, "t0", 0)} from public.${ident(table)} t0 ${this.whereClause(params, "t0", values)} ${this.orderClause(params, "t0")} ${this.pagination(params)}) r`;
      } else if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        if (rows.length === 0 || typeof rows[0] !== "object" || rows[0] === null) {
          throw new RestError(400, "PGRST102", "Empty or invalid json");
        }
        const columns = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
        values.push(JSON.stringify(rows));
        const columnList = columns.map(ident).join(", ");
        const insert = `insert into public.${ident(table)} as t0 (${columnList}) select ${columnList} from json_populate_recordset(null::public.${ident(table)}, $1::json)`;
        sql = wantsRepresentation
          ? `with changed as (${insert} returning ${this.returningList(items)}) select coalesce(json_agg(changed), '[]'::json) as rows from changed`
          : `with changed as (${insert} returning 1) select '[]'::json as rows from (select count(*) from changed) c`;
      } else if (method === "PATCH") {
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          throw new RestError(400, "PGRST102", "Empty or invalid json");
        }
        const columns = Object.keys(body);
        values.push(JSON.stringify(body));
        const assignments = columns.map((c) => `${ident(c)} = patch.${ident(c)}`).join(", ");
        const where = this.whereClause(params, "t0", values).replace(/^where /, "and ");
        const update = `update public.${ident(table)} t0 set ${assignments} from (select * from json_populate_record(null::public.${ident(table)}, $1::json)) patch where true ${where}`;
        sql = wantsRepresentation
          ? `with changed as (${update} returning ${this.returningList(items)}) select coalesce(json_agg(changed), '[]'::json) as rows from changed`
          : `with changed as (${update} returning 1) select '[]'::json as rows from (select count(*) from changed) c`;
      } else if (method === "DELETE") {
        const del = `delete from public.${ident(table)} t0 ${this.whereClause(params, "t0", values)}`;
        sql = wantsRepresentation
          ? `with changed as (${del} returning ${this.returningList(items)}) select coalesce(json_agg(changed), '[]'::json) as rows from changed`
          : `with changed as (${del} returning 1) select '[]'::json as rows from (select count(*) from changed) c`;
      } else {
        throw new RestError(405, "PGRST117", `Unsupported method ${method}`);
      }

      const rows = await this.asCaller(caller, async (tx) => {
        const result = await tx.query<{ rows: unknown[] }>(sql, values);
        return result.rows[0]?.rows ?? [];
      });

      if (wantsObject) {
        if (rows.length !== 1) {
          throw new RestError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${rows.length} rows`);
        }
        return { status: 200, body: rows[0] };
      }
      if (method === "POST") return { status: 201, body: wantsRepresentation ? rows : undefined };
      if ((method === "PATCH" || method === "DELETE") && !wantsRepresentation) return { status: 204 };
      return { status: 200, body: rows };
    } catch (error) {
      return toErrorResponse(error, caller);
    }
  }

  private async rpc(name: string, body: unknown, caller: Caller): Promise<RestResponse> {
    const args = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const fn = await this.db.query<{ returns_void: boolean }>(
      `select p.prorettype = 'void'::regtype as returns_void from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [name],
    );
    if (fn.rows.length === 0) throw new RestError(404, "PGRST202", `Could not find the function public.${name}`);

    const values: unknown[] = [];
    const namedArgs = Object.entries(args).map(([key, value]) => {
      values.push(value !== null && typeof value === "object" ? JSON.stringify(value) : value);
      return `${ident(key)} => $${values.length}`;
    });
    const call = `public.${ident(name)}(${namedArgs.join(", ")})`;

    const result = await this.asCaller(caller, async (tx) => {
      if (fn.rows[0].returns_void) {
        await tx.query(`select ${call}`, values);
        return undefined;
      }
      return (await tx.query<{ result: unknown }>(`select to_json(${call}) as result`, values)).rows[0]?.result;
    });
    return result === undefined ? { status: 204 } : { status: 200, body: result };
  }
}

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  hint?: string;
}

/** Maps Postgres errors to PostgREST's HTTP status codes and error body. */
export function toErrorResponse(error: unknown, caller: Caller): RestResponse {
  if (error instanceof RestError) {
    return { status: error.status, body: { code: error.code, message: error.message, details: error.details, hint: null } };
  }
  const pg = error as PgError;
  const code = pg.code ?? "XX000";
  let status = 400;
  if (/^PT\d{3}$/.test(code)) status = Number(code.slice(2));
  else if (code === "42501") status = caller.role === "anon" ? 401 : 403;
  else if (code === "23505" || code === "23503") status = 409;
  else if (code === "P0002") status = 404;
  else if (code === "42883" || code === "42P01") status = 404;
  else if (code.startsWith("08") || code.startsWith("53") || code === "XX000") status = 500;
  return {
    status,
    body: { code, message: pg.message ?? "Unknown error", details: pg.detail ?? null, hint: pg.hint ?? null },
  };
}
