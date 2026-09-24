/**
 * The deals a workspace's pace is read from (0008, amended): its yeses decided since a moment -- a deal standing won,
 * or ended since -- with their two days, for contracts dealPaceFrom. The edge's playbook sweep (the proposal
 * follow-up, 0006) and the dashboard's People reads read them alike, so the two never judge "waiting" by two paces.
 * Paged, so a busy year is read whole. A read that fails THROWS: each caller says what no pace costs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
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
