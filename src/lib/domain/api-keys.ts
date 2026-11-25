import { createHash, randomBytes } from "node:crypto";

const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export interface GeneratedApiKey {
  /** Shown to the owner exactly once. Never stored. */
  raw: string;
  /** "crm_" plus 8 characters, stored to recognise a key in the UI. */
  prefix: string;
  /** SHA-256 hex of the raw key, the only form stored in the database. */
  hash: string;
}

/**
 * Generates an API key with 256 bits of entropy in the secret part. A fast
 * hash is fine here: unlike passwords, these keys are long random strings,
 * so they cannot be recovered from a leaked hash by guessing.
 */
export function generateApiKey(): GeneratedApiKey {
  let prefixBody = "";
  for (const byte of randomBytes(8)) prefixBody += PREFIX_ALPHABET[byte % PREFIX_ALPHABET.length];
  const prefix = `crm_${prefixBody}`;
  const raw = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix, hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Reads the key from "Authorization: Bearer <key>". Returns null when absent or malformed. */
export function readBearerKey(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header.trim());
  return match ? match[1] : null;
}
