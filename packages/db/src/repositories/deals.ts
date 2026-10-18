/**
 * The deals a workspace's pace is read from (0008, amended): its yeses decided since a moment -- a deal standing won,
 * or ended since -- with their two days, for contracts dealPaceFrom. The edge's playbook sweep (the proposal
 * follow-up, 0006) and the dashboard's People reads read them alike, so the two never judge "waiting" by two paces.
 * Paged, so a busy year is read whole. A read that fails THROWS: each caller says what no pace costs it.
 *
 * And the member's one call that records a deal with its line in the ledger (recordDeal, 00357).
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { readAllRows } from "../paged";

type Db = SupabaseClient<Database>;

/** A yes as its wait is measured: its stage and its two days. */
export interface YesRow {
  stage: string;
  proposed_at: string;
  decided_at: string | null;
}

/** Every yes decided since `since`, under whatever row security the client carries. */
export async function yesesSince(db: Db, tenantId: string, since: Date): Promise<YesRow[]> {
  const rows = await readAllRows<YesRow & { id: string }>("deals", (from, to) =>
    db
      .from("deals")
      .select("id, stage, proposed_at, decided_at")
      .eq("tenant_id", tenantId)
      .in("stage", ["won", "ended"])
      .gte("decided_at", since.toISOString())
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({ stage: r.stage, proposed_at: r.proposed_at, decided_at: r.decided_at }));
}

/**
 * Whether a deal was ever recorded in the workspace (0008, amended 18 Oct 2026). Every workspace has deals; what
 * presumes a business sends proposals (a whole setup's proposal follow-up, Ask's question about proposals, People's
 * deal lists) waits for its first. Under whatever row security the client carries. A read that fails answers false: a
 * nudge left out, never a page.
 */
export async function dealOnFile(db: Db, tenantId: string): Promise<boolean> {
  const r = await db.from("deals").select("id").eq("tenant_id", tenantId).limit(1);
  return !r.error && (r.data?.length ?? 0) > 0;
}

/** What a move may name beside its stage: deal_record's own arguments, by their names without the `p_`. */
export type DealMove = {
  deal_id?: string;
  version?: number;
  service?: string;
  when?: string;
  amount_cents?: number;
  per?: string;
  note?: string;
  evidence?: { message_id: string } | { form: string };
  proposal_url?: string;
  valid_until?: string;
  lost_reason?: string;
  clear?: string[];
};

/**
 * A member records a deal and its line in the ledger together (00357 record_deal), on the member's own session:
 * deal_record with what the move names, then the record_deal decision as theirs, in one transaction. The door's
 * answer with `decision_id` beside it, a refusal it answers (`{ error }`, and then nothing was recorded), or the
 * database's own refusal with its SQLSTATE, which the caller words.
 */
export async function recordDeal(
  db: Db,
  p: { contactId: string; stage: string; move: DealMove; via: string | null; undoOf: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("record_deal", {
    p_contact_id: p.contactId,
    p_stage: p.stage,
    p_move: p.move,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  return { data, error };
}
