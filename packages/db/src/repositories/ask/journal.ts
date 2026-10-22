/**
 * Ask's journal, the note sweep's side (decision 0070, 00471): the days due (ask_journal_write's due, which stamps each
 * as it hands it over, so a day is written once), what happened on one of them (both ledgers, as Settings › Activity
 * reads them), and the door the entry goes through (ask_journal_write's keep). Service role throughout: the sweep reads every
 * workspace's day and writes none of its rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_NOISE_KINDS, ACTIVITY_NOISE_PREFIXES } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** One day handed over: its workspace, the day by its clock, the day's span as instants, and how the workspace speaks. */
export interface AskJournalDueRow {
  tenant_id: string;
  day: string;
  day_from: string;
  day_to: string;
  timezone: string;
  locale: string;
}

/** The sweep's batch (ask_journal_write, due): at most `limit` days due, each stamped looking as it is handed over. */
export async function askJournalDue(db: Db, limit: number): Promise<AskJournalDueRow[]> {
  const { data, error } = await db.rpc("ask_journal_write", { p_act: "due", p_limit: limit });
  if (error) throw new Error(`ask_journal_write due: ${error.message}`);
  const days = (data && typeof data === "object" && !Array.isArray(data) ? data.days : null) ?? [];
  if (!Array.isArray(days)) return [];
  return days.flatMap((d) => {
    const r = (d && typeof d === "object" && !Array.isArray(d) ? d : {}) as Record<string, Json | undefined>;
    const text = (k: string): string => {
      const v = r[k];
      return typeof v === "string" ? v : "";
    };
    return text("tenant_id") && text("day")
      ? [
          {
            tenant_id: text("tenant_id"),
            day: text("day"),
            day_from: text("day_from"),
            day_to: text("day_to"),
            timezone: text("timezone") || "UTC",
            locale: text("locale") || "en",
          },
        ]
      : [];
  });
}

/** One row of the decisions ledger, as Settings › Activity reads it. */
export interface JournalDecisionRow {
  id: string;
  verb: string;
  subject_type: string;
  subject_id: string;
  actor_type: string;
  actor_user_id: string | null;
  payload: Json;
  created_at: string;
}

/** One row of the events ledger, as Settings › Activity reads it. */
export interface JournalEventRow {
  id: string;
  kind: string;
  category: string;
  subject_type: string | null;
  subject_id: string | null;
  data: Json;
  created_at: string;
}

/**
 * What happened in one workspace between two instants, as Settings › Activity reads it: its decisions and its events
 * (the log's noise left out, as the page leaves it out), newest first, at most `limit` of each. Never its members'
 * questions to Ask: those are each member's own.
 */
export async function askJournalDayRows(
  db: Db,
  p: { tenantId: string; from: string; to: string; limit: number },
): Promise<{ decisions: JournalDecisionRow[]; events: JournalEventRow[] }> {
  let events = db
    .from("events")
    .select("id, kind, category, subject_type, subject_id, data, created_at")
    .eq("tenant_id", p.tenantId)
    .gte("created_at", p.from)
    .lt("created_at", p.to);
  for (const prefix of ACTIVITY_NOISE_PREFIXES) events = events.not("kind", "like", `${prefix}%`);
  for (const kind of ACTIVITY_NOISE_KINDS) events = events.neq("kind", kind);
  const [d, e] = await Promise.all([
    db
      .from("decisions")
      .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, payload, created_at")
      .eq("tenant_id", p.tenantId)
      .gte("created_at", p.from)
      .lt("created_at", p.to)
      .order("created_at", { ascending: false })
      .limit(p.limit),
    events.order("created_at", { ascending: false }).limit(p.limit),
  ]);
  if (d.error) throw new Error(`decisions: ${d.error.message}`);
  if (e.error) throw new Error(`events: ${e.error.message}`);
  return { decisions: d.data ?? [], events: e.data ?? [] };
}

/**
 * The names the members who acted on a day gave themselves (profiles.display_name), by user id, for the journal's lines:
 * a member who gave none is absent, and the line says "A teammate". Never their sign-in address: the journal is the
 * business's diary, not its directory.
 */
export async function journalMemberNames(db: Db, userIds: readonly string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const { data, error } = await db
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", [...userIds]);
  if (error) throw new Error(`profiles: ${error.message}`);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.display_name?.trim()) out[r.user_id] = r.display_name.trim();
  return out;
}

/**
 * Keep a day (ask_journal_write, keep): its entry, or none for a quiet day, or `failed` for a day the model would not
 * write. The door's refusal as it said it (too_long, not_found), else null.
 */
export async function keepAskJournal(
  db: Db,
  p: { tenantId: string; day: string; text: string | null; rowsRead: number; failed?: boolean },
): Promise<{ refused: string | null }> {
  const { data, error } = await db.rpc("ask_journal_write", {
    p_act: "keep",
    p_tenant_id: p.tenantId,
    p_day: p.day,
    p_text: p.failed ? "" : (p.text ?? ""),
    p_rows_read: p.failed ? -1 : p.rowsRead,
  });
  if (error) throw new Error(`ask_journal_write keep: ${error.message}`);
  const refused = (data as { error?: unknown } | null)?.error;
  return { refused: typeof refused === "string" ? refused : null };
}
