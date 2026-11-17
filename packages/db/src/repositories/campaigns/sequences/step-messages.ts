import type { SupabaseClient } from "@supabase/supabase-js";
import type { StepMessageRef, TenantId } from "@chanlytics/contracts";
import type { Database } from "../../../types";
import { readAllRows } from "../../../shared/paged";

type Db = SupabaseClient<Database>;

/** A customer step that sends a message, and whether it runs (a paused step sends nothing). */
export type StepMessageRow = StepMessageRef & { running: boolean };

/**
 * Each customer step of the workspace's sequences that sends a message, by its sequence: its place, its message and
 * language, the channels it goes by, and whether it runs. What the list read asks of each step (Campaigns, one tab, 17 Nov
 * 2026): whether its message can go (contracts sequenceMessageOff, call C3) and which messages a search finds a campaign
 * by (call C7), in one read however many sequences there are, a page at a time. A call or a note sends no message, and a
 * cold email's steps are written in their own sheet. On the session's client (its row security decides). A read that
 * fails, or stops short, throws.
 */
export async function listStepMessages(db: Db, tenantId: TenantId): Promise<Map<string, StepMessageRow[]>> {
  const rows = await readAllRows(
    "the steps' messages",
    (from, to) =>
      db
        .from("sequence_steps")
        .select("sequence_id, place, state, template_name, template_language, channels")
        .eq("tenant_id", tenantId)
        .eq("kind", "moment")
        .is("hand", null)
        .not("template_name", "is", null)
        .order("sequence_id")
        .order("place")
        .range(from, to),
    "whole",
  );
  const bySequence = new Map<string, StepMessageRow[]>();
  for (const r of rows) {
    if (!r.template_name) continue;
    const steps = bySequence.get(r.sequence_id) ?? [];
    steps.push({
      place: r.place,
      name: r.template_name,
      language: r.template_language ?? "",
      channels: r.channels,
      running: r.state === "running",
    });
    bySequence.set(r.sequence_id, steps);
  }
  return bySequence;
}
