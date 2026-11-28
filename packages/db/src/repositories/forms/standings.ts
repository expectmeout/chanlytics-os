/**
 * Where an entry of a form stands (form_entries_standing, 00726), read from its links and their messages under the
 * member's own row rules, by the rule the open requests and their count read (form_requests_open). Nothing is kept apart
 * from the record: answered, sending, open and aged are each read, never stored. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/**
 * Where one entry stands. `answered`: a member's word, a conversation that took it over, or a reply that left, said in
 * `how` with when. `sending`: its only answer is a reply still waiting to go. `aged`: nobody answered it and its sixty
 * days in Needs you passed. `unreached`: a reply to it failed. Held and test are the entry's own columns, read beside
 * this.
 */
export interface FormEntryStanding {
  standing: "answered" | "sending" | "open" | "aged";
  how: "marked" | "conversation" | "reply" | null;
  at: string | null;
  conversationId: string | null;
  unreached: boolean;
}

/** A standing's word, read back; an entry whose word nobody knows is open. */
const standingKept = (kept: unknown): FormEntryStanding["standing"] =>
  kept === "answered" || kept === "sending" || kept === "aged" ? kept : "open";

const textOrNull = (kept: unknown): string | null => (typeof kept === "string" && kept ? kept : null);

/** Where the named entries stand, by entry id; one the member may not read is not among them. */
export async function readFormEntryStandings(
  db: Db,
  tenantId: TenantId,
  entryIds: readonly string[],
): Promise<Map<string, FormEntryStanding>> {
  if (entryIds.length === 0) return new Map();
  const { data, error } = await db.rpc("form_entries_standing", { p_tenant_id: tenantId, p_entry_ids: [...entryIds] });
  if (error) throw new DbFailure(error, "form_entries_standing");
  const lines: unknown[] = Array.isArray(data) ? data : [];
  return new Map(
    lines.flatMap((line) => {
      const row = recordOrEmpty(line);
      if (typeof row.id !== "string") return [];
      const how = row.how === "marked" || row.how === "conversation" || row.how === "reply" ? row.how : null;
      const stands: FormEntryStanding = {
        standing: standingKept(row.standing),
        how,
        at: textOrNull(row.at),
        conversationId: textOrNull(row.conversation_id),
        unreached: row.unreached === true,
      };
      return [[row.id, stands] as const];
    }),
  );
}
