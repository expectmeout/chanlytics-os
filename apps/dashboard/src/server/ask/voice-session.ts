import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ASK_TURN_BUDGET_MS, type AskLanguage, type AskScope, type PageContext } from "@chanlytics/contracts";
import {
  claimVoiceTurn,
  endVoiceSession as endRow,
  insertVoiceSession,
  moveVoiceSessionContext,
  readVoiceSession as readRow,
  type Database,
  type Json,
  type VoiceSessionRow,
} from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";

/**
 * A voice conversation's session (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1, §3.3, §6): the row
 * the voice route writes as the member, the member's access token sealed inside it, and the claim the brain door makes
 * before it runs a turn. The brain door is called by ElevenLabs with no cookie, so the token is how it runs Ask as
 * this member under RLS: sealed with a secret the database does not hold (ASK_VOICE_SECRET), good for the token's own
 * hour, opened only by the door. The id the browser and the vendor carry is 256 random bits; the row is keyed by its
 * sha256, so a read of the table alone opens nothing. The table is packages/db's (ask-voice-session.ts); this module is
 * the one that knows the secret.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SESSION_ID_BYTES = 32;

/** The cipher's key: the secret, hashed to the 32 bytes AES-256 takes, so the variable may be any string. */
const cipherKeyOf = (secret: string): Buffer => createHash("sha256").update(secret).digest();

/** The token at rest: `base64url(iv ‖ tag ‖ ciphertext)`, a fresh iv each time. */
function sealToken(token: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, cipherKeyOf(secret), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The token back, or null: a wrong secret, a tampered cipher or a value that is not one opens nothing. */
export function openToken(sealed: string, secret: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv(ALGORITHM, cipherKeyOf(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The row's key for the id the browser carries. */
export const sessionHashOf = (plain: string): string => createHash("sha256").update(plain).digest("hex");

/** The id the browser carries (`plain`, hex) and the row's key (`hash`). */
function newSessionId(): { plain: string; hash: string } {
  const plain = randomBytes(SESSION_ID_BYTES).toString("hex");
  return { plain, hash: sessionHashOf(plain) };
}

/** What the browser sends back as the session: the plain id's shape, and nothing else is looked up. */
export const SESSION_ID = /^[0-9a-f]{64}$/;

/**
 * A voice thread is made before its first question (the row needs it); the first spoken question becomes its title
 * (the brain door, through touchThread), as a typed thread's first question is.
 */
export const VOICE_THREAD_TITLE = "Voice";

/**
 * A turn's key: the words and their place in the conversation. The vendor's retry of a slow turn carries both
 * unchanged (the design, §3.3), so it finds the turn already claimed; the same words said again later are at another
 * place, so they are a new turn.
 */
export const turnKeyOf = (position: number, text: string): string =>
  createHash("sha256").update(`${position}:${text.trim()}`).digest("hex");

/**
 * When the access token expires, read off its own `exp`: the wrapper verified the token's signature a moment ago
 * (getClaims), and the claim is read here only to date the row. Null when the token is not a JWT with one.
 */
export function tokenExpiry(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp)
      ? new Date(claims.exp * 1000).toISOString()
      : null;
  } catch {
    return null;
  }
}

interface VoiceSessionStart {
  threadId: string;
  conversationId: string | null;
  accessToken: string;
  tokenExpiresAt: string;
  surface: string | null;
  scope: AskScope | null;
  context: PageContext | null;
  language: AskLanguage;
}

/** A page's context as the column holds it: the schema's own fields, as JSON (an absent field is absent, not undefined). */
const contextColumn = (c: PageContext | null): Json => (c ? (JSON.parse(JSON.stringify(c)) as Json) : null);
/** A scope as the column holds it: its three fields, or none (store.ts holds the thread's the same way). */
const scopeColumn = (s: AskScope | null): Json => (s ? { kind: s.kind, id: s.id, label: s.label } : null);

/** The row, written as the member (RLS: their own, on their own thread); the plain id goes to the browser once. */
export async function createVoiceSession(
  ctx: RouteContext,
  member: Member,
  secret: string,
  input: VoiceSessionStart,
): Promise<{ plain: string }> {
  const { plain, hash } = newSessionId();
  await insertVoiceSession(ctx.supabase, {
    id: hash,
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    thread_id: input.threadId,
    conversation_id: input.conversationId,
    token_cipher: sealToken(input.accessToken, secret),
    token_expires_at: input.tokenExpiresAt,
    surface: input.surface,
    scope: scopeColumn(input.scope),
    context: contextColumn(input.context),
    language: input.language,
  });
  return { plain };
}

type Db = SupabaseClient<Database>;

/** The row by the id the vendor carried, on the service role: the member is known only once it is read. */
export const readVoiceSession = (service: Db, hash: string): Promise<VoiceSessionRow | null> => readRow(service, hash);

/** The scope the row holds, as the turn takes it. */
export const scopeOf = (row: VoiceSessionRow): AskScope | null => (row.scope as AskScope | null) ?? null;
/** The page the row holds, as the turn takes it. */
export const contextOf = (row: VoiceSessionRow): PageContext | null => (row.context as PageContext | null) ?? null;

/** One turn per request key (the design, §3.3): true for the request that owns the turn; a key left longer than the turn's budget may be taken again. */
export const claimTurn = (service: Db, hash: string, turnKey: string, now = new Date()): Promise<boolean> =>
  claimVoiceTurn(service, hash, turnKey, now, ASK_TURN_BUDGET_MS);

/** The conversation over, as the member (the browser's end) or as the service (the webhook's, with its minutes). */
export const endVoiceSession = (
  db: Db,
  hash: string,
  fields: { endedAt: string; durationS?: number },
): Promise<boolean> => endRow(db, hash, fields);

/** The page under the Line changed: the row keeps the new one for the next spoken turn (the member's own row). */
export const moveVoiceContext = (
  db: Db,
  hash: string,
  context: PageContext | null,
  surface: string | null,
): Promise<boolean> => moveVoiceSessionContext(db, hash, { context: contextColumn(context), surface });
