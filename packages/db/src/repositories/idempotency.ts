/**
 * A reply's idempotency key (0004): the receipt kept under the caller's key,
 * so a replayed POST is answered with the first send instead of a second one.
 *
 * The key is a row the reply CLAIMS before it writes anything else, on the
 * table's unique (tenant_id, key). Two callers under one key at once used to
 * both read "no receipt yet" and both send; now the insert is the race, and
 * Postgres picks the one winner. The winner completes its row with the
 * receipt (`keepIdempotencyReceipt`), written only onto the row that still
 * carries its stamp. A loser is shown what the holder left, and core's reply
 * decides what that means: a replay, a refusal, or a hold to take over
 * (`takeIdempotencyKey`, by the stamp it was read at, so of two callers who
 * both read an abandoned hold exactly one takes it, and the caller taken over
 * finds its stamp gone when it comes to keep its receipt). A claim whose
 * reply failed before its job is let go (`releaseIdempotencyKey`), by its own
 * stamp, so a retry is not told its reply is in progress.
 *
 * The stamp is `created_at`, written by the claim and the takeover in the
 * verb's own ISO spelling and compared in Postgres, so the spelling PostgREST
 * reads it back in matches it too (idempotency-claim.db.test.mjs proves both).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

/** What the key's holder left: a receipt once kept, and nothing while its reply is still on its way. */
export interface IdempotencyHold {
  response: Json | null;
  created_at: string;
  request_hash: string | null;
}
export type IdempotencyClaim = { won: true } | { won: false; held: IdempotencyHold | null };

const HOLD_COLUMNS = "response, created_at, request_hash";

/**
 * The key claimed: won when this caller's row is the one on the unique, else
 * the hold that is there. `held` is null when the row went between the claim
 * and the read (its holder let it go), which the caller treats as in progress.
 */
export async function claimIdempotencyKey(
  db: Db,
  p: { tenantId: string; key: string; route: string; requestHash: string; nowIso: string },
): Promise<IdempotencyClaim> {
  // ON CONFLICT DO NOTHING, with the inserted row read back: PostgREST returns
  // only what was inserted, so a row already there answers with none.
  const claimed = await db
    .from("idempotency_keys")
    .upsert(
      {
        tenant_id: p.tenantId,
        key: p.key,
        route: p.route,
        request_hash: p.requestHash,
        response: null,
        created_at: p.nowIso,
      },
      { onConflict: "tenant_id,key", ignoreDuplicates: true },
    )
    .select("key");
  if (claimed.error) throw new Error(`idempotency claim: ${claimed.error.message}`);
  if ((claimed.data ?? []).length > 0) return { won: true };
  const held = await db
    .from("idempotency_keys")
    .select(HOLD_COLUMNS)
    .eq("tenant_id", p.tenantId)
    .eq("key", p.key)
    .maybeSingle();
  if (held.error) throw new Error(`idempotency lookup: ${held.error.message}`);
  return { won: false, held: held.data };
}

/**
 * A hold taken over, written only onto the row as it was read (`from` is the
 * stamp the reader saw): true iff this caller holds the key now. Another
 * caller who read the same hold and took it first moved the stamp, and this
 * one changes nothing and is told so.
 */
export async function takeIdempotencyKey(
  db: Db,
  p: { tenantId: string; key: string; requestHash: string; nowIso: string; from: string },
): Promise<boolean> {
  const taken = await db
    .from("idempotency_keys")
    .update({ request_hash: p.requestHash, response: null, created_at: p.nowIso })
    .eq("tenant_id", p.tenantId)
    .eq("key", p.key)
    .eq("created_at", p.from)
    .select("key");
  if (taken.error) throw new Error(`idempotency take: ${taken.error.message}`);
  return (taken.data ?? []).length > 0;
}

/**
 * The row stamped `nowIso` let go, whatever it holds, and only that one: a
 * caller lets go only when its send did not happen, and another caller's
 * takeover moved the stamp, so this never removes anyone else's row.
 */
export async function releaseIdempotencyKey(
  db: Db,
  p: { tenantId: string; key: string; nowIso: string },
): Promise<void> {
  const released = await db
    .from("idempotency_keys")
    .delete()
    .eq("tenant_id", p.tenantId)
    .eq("key", p.key)
    .eq("created_at", p.nowIso);
  if (released.error) throw new Error(`idempotency release: ${released.error.message}`);
}

/**
 * The receipt kept under the key, completing its claim, written only onto the
 * row that still carries the claim's stamp: true iff it does. False is a key
 * another caller took over since (the hold outlived HOLD_EXPIRY_MS), and the
 * caller must not go on to send. The stamp stays, so the replay window runs
 * from the claim, which is this send.
 */
export async function keepIdempotencyReceipt(
  db: Db,
  p: { tenantId: string; key: string; requestHash: string; response: Json; stamp: string },
): Promise<boolean> {
  const kept = await db
    .from("idempotency_keys")
    .update({ request_hash: p.requestHash, response: p.response })
    .eq("tenant_id", p.tenantId)
    .eq("key", p.key)
    .eq("created_at", p.stamp)
    .select("key");
  if (kept.error) throw new Error(`idempotency receipt: ${kept.error.message}`);
  return (kept.data ?? []).length > 0;
}
