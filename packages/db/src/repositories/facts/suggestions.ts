/**
 * An owner's correction, looked at once and kept as a note for the receptionist or not (decision 0063, 00448).
 *
 * The note sweep reads a batch of corrections through `listFactCorrectionsBatch` (fact_candidates, which stamps each as it
 * hands it over, so a look is taken once) and says a look that passed through `suggestFact` (fact_suggest, which tells
 * the bell). A member reads what waits through `listFactSuggestionsWaiting`, under their own session's RLS, and answers it
 * through `answerFactSuggestion` (fact_suggestion_answer): the note itself is the settings write's.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { recordOrNull, DbFailure } from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** One correction, as the batch hands it over: what the gates and the model read. */
export interface FactCorrectionRow {
  id: string;
  tenant_id: TenantId;
  conversation_id: string | null;
  source: "steer" | "reply";
  /** The owner's own words. */
  words: string;
  /** The draft the owner rewrote, or the receptionist's last reply before the hold; null when there was none. */
  said: string | null;
  /** The customer's last texts before it, oldest first. */
  asked: string[];
  /** What the notes and the services already say. */
  known: string[];
  notes_count: number;
  workspace_today: number;
}

const texts = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/**
 * The sweep's batch (fact_candidates): at most `limit` corrections of the last three days nobody has looked at, each
 * stamped as it is handed over. Service role.
 */
export async function listFactCorrectionsBatch(db: Db, limit: number): Promise<FactCorrectionRow[]> {
  const { data, error } = await db.rpc("fact_candidates", { p_limit: limit });
  if (error) throw new DbFailure(error, "fact_candidates");
  return (data ?? []).flatMap((row) =>
    row.source === "steer" || row.source === "reply"
      ? [
          {
            id: row.id,
            tenant_id: row.tenant_id,
            conversation_id: row.conversation_id ?? null,
            source: row.source,
            words: row.words ?? "",
            said: row.said ?? null,
            asked: texts(row.asked),
            known: texts(row.known),
            notes_count: row.notes_count ?? 0,
            workspace_today: row.workspace_today ?? 0,
          },
        ]
      : [],
  );
}

/**
 * A look that passed becomes a suggestion, and a line on the bell (fact_suggest). Service role. The door's refusal as it
 * said it (empty, too_long, not_found), else null.
 */
export async function suggestFact(
  db: Db,
  params: { id: string; title: string; body: string; quote: string },
): Promise<{ refused: string | null }> {
  const { data, error } = await db.rpc("fact_suggest", {
    p_id: params.id,
    p_title: params.title,
    p_body: params.body,
    p_quote: params.quote,
  });
  if (error) throw new DbFailure(error, "fact_suggest");
  const refused = recordOrNull(data)?.error;
  return { refused: typeof refused === "string" ? refused : null };
}

/** A suggestion waiting for its answer, as the Autonomy pane draws it. */
export interface FactSuggestionRow {
  id: string;
  source: "steer" | "reply";
  title: string;
  body: string;
  quote: string;
  conversation_id: string | null;
  created_at: string;
}

/** How many suggestions the pane lists at most: the newest first. */
const WAITING_MAX = 20;

/**
 * The workspace's suggestions waiting, newest first, as the caller may see them (RLS: their workspace's own). A row the
 * table holds with words missing is not one a member can keep, and is left out.
 */
export async function listFactSuggestionsWaiting(db: Db, tenantId: TenantId): Promise<FactSuggestionRow[]> {
  const { data, error } = await db
    .from("fact_suggestions")
    .select("id, source, title, body, quote, conversation_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("state", "suggested")
    .order("created_at", { ascending: false })
    .limit(WAITING_MAX);
  if (error) throw new DbFailure(error, "fact_suggestions_waiting");
  return (data ?? []).flatMap((r) =>
    (r.source === "steer" || r.source === "reply") && r.title && r.body && r.quote
      ? [{ ...r, source: r.source, title: r.title, body: r.body, quote: r.quote }]
      : [],
  );
}

/** One suggestion, waiting or not, as the caller may see it; null for none. */
export async function findFactSuggestionById(
  db: Db,
  id: string,
): Promise<(FactSuggestionRow & { tenant_id: TenantId; state: string }) | null> {
  const { data, error } = await db
    .from("fact_suggestions")
    .select("id, tenant_id, state, source, title, body, quote, conversation_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DbFailure(error, "fact_suggestion_by_id");
  if (!data || (data.source !== "steer" && data.source !== "reply") || !data.title || !data.body || !data.quote)
    return null;
  return { ...data, source: data.source, title: data.title, body: data.body, quote: data.quote };
}

/**
 * A member answers a suggestion (fact_suggestion_answer), on their own session: kept, with the settings version the note
 * was written in, or dismissed. The door's answer as it gave it (a refusal is `{ error: answered }`), and the database's
 * error for one it threw (not found, not signed in).
 */
export async function answerFactSuggestion(
  db: Db,
  params: { id: string; keep: boolean; configVersion: number | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("fact_suggestion_answer", {
    p_id: params.id,
    p_keep: params.keep,
    ...(params.configVersion !== null ? { p_config_version: params.configVersion } : {}),
  });
  return { data, error };
}
