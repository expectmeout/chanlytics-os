/**
 * The deals a workspace's pace is read from (0008, amended): its yeses decided since a moment -- a deal standing won,
 * or ended since -- with their two days, for contracts dealPaceFrom. The edge's playbook sweep (the proposal
 * follow-up, 0006) and the dashboard's People reads read them alike, so the two never judge "waiting" by two paces.
 * Paged, so a busy year is read whole. A read that fails THROWS: each caller says what no pace costs it.
 *
 * And the member's one call that records a deal with its line in the ledger (recordDeal, 00357), and a person's open
 * deals as a card names one (openDealsOf: Ask's step, which stands on the deal it names).
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { readAllRows } from "../../shared/paged";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** A yes as its wait is measured: its stage and its two days. */
export interface YesRow {
  stage: string;
  proposed_at: string;
  decided_at: string | null;
}

/** Every yes decided since `since`, under whatever row security the client carries. */
export async function listYesesSince(db: Db, tenantId: TenantId, since: Date): Promise<YesRow[]> {
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
export async function getDealOnFile(db: Db, tenantId: TenantId): Promise<boolean> {
  const r = await db.from("deals").select("id").eq("tenant_id", tenantId).limit(1);
  return !r.error && (r.data?.length ?? 0) > 0;
}

/** An open deal of a person's, as a card names it: its id and its service. */
export interface OpenDealRow {
  id: string;
  service: string | null;
}

/**
 * A person's open deals (a proposal out, a client: 0029, one per service), newest first, under whatever row security the
 * client carries. A read that fails THROWS: a card is never proposed against deals it could not read.
 */
export async function openDealsOf(db: Db, tenantId: TenantId, contactId: ContactId): Promise<OpenDealRow[]> {
  const result = await db
    .from("deals")
    .select("id, service")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .in("stage", ["proposed", "won"])
    .order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map((d) => ({ id: d.id, service: d.service }));
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
  params: { contactId: ContactId; stage: string; move: DealMove; via: string | null; undoOf: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("record_deal", {
    p_contact_id: params.contactId,
    p_stage: params.stage,
    p_move: params.move,
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.undoOf ? { p_undo_of: params.undoOf } : {}),
  });
  return { data, error };
}

/** The columns a deal is read with (contracts DealDto): a person's read of their deals, and the deal door's answer. */
export const DEAL_DTO_COLUMNS =
  "id, contact_id, service, stage, proposed_at, decided_at, ended_at, amount_cents, per, currency, note, version, created_at, proposal_url, valid_until, lost_reason";

/** A person's deals, as a DealDto reads them. */
export const listDealRowsOf = async (db: SupabaseClient<Database>, tenantId: TenantId, contactId: ContactId) =>
  db.from("deals").select(DEAL_DTO_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId);

/** One page (`from` to `to`) of the workspace's deals, as the deals report counts them. */
export const pageDealReport = async (db: SupabaseClient<Database>, tenantId: TenantId, from: number, to: number) =>
  db
    .from("deals")
    .select("stage, proposed_at, decided_at, amount_cents, per, currency, lost_reason, contact_id")
    .eq("tenant_id", tenantId)
    .order("id")
    .range(from, to);
