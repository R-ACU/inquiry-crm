/**
 * A small Supabase Auth (GoTrue) stand-in: password sign-in, refresh,
 * current user and sign-out. Passwords are checked with pgcrypto against
 * auth.users, so the seed's bcrypt hashes work unchanged. Tokens are HS256
 * JWTs signed with a local, preview-only secret.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { PGlite } from "@electric-sql/pglite";
import type { RestResponse } from "./postgrest";

const TOKEN_TTL_SECONDS = 3600;

interface UserRow {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function authError(status: number, errorCode: string, message: string): RestResponse {
  return { status, body: { code: status, error_code: errorCode, msg: message } };
}

export class GoTrueEmulator {
  private readonly refreshTokens = new Map<string, { userId: string; sessionId: string }>();
  private readonly secret: Uint8Array;

  constructor(
    private readonly db: PGlite,
    jwtSecret: string,
  ) {
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  /** Returns the verified claims of an access token, or null. */
  async verify(token: string): Promise<Record<string, unknown> | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ["HS256"], audience: "authenticated" });
      return payload as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async loadUser(id: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      `select id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       from auth.users where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  private toUser(row: UserRow) {
    return {
      id: row.id,
      aud: "authenticated",
      role: "authenticated",
      email: row.email,
      email_confirmed_at: row.email_confirmed_at,
      app_metadata: row.raw_app_meta_data,
      user_metadata: row.raw_user_meta_data,
      identities: [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async issueSession(row: UserRow, sessionId: string = randomUUID()) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      email: row.email,
      role: "authenticated",
      aal: "aal1",
      session_id: sessionId,
      app_metadata: row.raw_app_meta_data,
      user_metadata: row.raw_user_meta_data,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(row.id)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(this.secret);

    const refreshToken = randomBytes(24).toString("base64url");
    this.refreshTokens.set(refreshToken, { userId: row.id, sessionId });
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: TOKEN_TTL_SECONDS,
      expires_at: now + TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      user: this.toUser(row),
    };
  }

  async handle(method: string, path: string, params: URLSearchParams, headers: Headers, body: unknown): Promise<RestResponse> {
    const input = (body ?? {}) as Record<string, unknown>;

    if (method === "POST" && path === "/token" && params.get("grant_type") === "password") {
      const email = String(input.email ?? "").trim().toLowerCase();
      const password = String(input.password ?? "");
      const { rows } = await this.db.query<{ id: string }>(
        `select id from auth.users
         where lower(email) = $1 and encrypted_password = extensions.crypt($2, encrypted_password)`,
        [email, password],
      );
      if (rows.length === 0) return authError(400, "invalid_credentials", "Invalid login credentials");
      const user = await this.loadUser(rows[0].id);
      return { status: 200, body: await this.issueSession(user!) };
    }

    if (method === "POST" && path === "/token" && params.get("grant_type") === "refresh_token") {
      const token = String(input.refresh_token ?? "");
      const entry = this.refreshTokens.get(token);
      if (!entry) return authError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      this.refreshTokens.delete(token);
      const user = await this.loadUser(entry.userId);
      if (!user) return authError(400, "user_not_found", "User not found");
      return { status: 200, body: await this.issueSession(user, entry.sessionId) };
    }

    const bearer = /^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1];
    const claims = bearer ? await this.verify(bearer) : null;

    if (method === "GET" && path === "/user") {
      if (!claims?.sub) return authError(403, "bad_jwt", "invalid JWT");
      const user = await this.loadUser(String(claims.sub));
      if (!user) return authError(403, "user_not_found", "User from sub claim in JWT does not exist");
      return { status: 200, body: this.toUser(user) };
    }

    if (method === "POST" && path === "/logout") {
      if (claims?.session_id) {
        for (const [token, entry] of this.refreshTokens) {
          if (entry.sessionId === claims.session_id) this.refreshTokens.delete(token);
        }
      }
      return { status: 204 };
    }

    return authError(404, "not_found", `Not supported by the local emulator: ${method} ${path}`);
  }
}
