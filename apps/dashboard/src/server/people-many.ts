import { NOTE_REFUSALS } from "@chanlytics/contracts";
import { setPersonReplyMode } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { recordDecision } from "@/server/verbs";

/**
 * The same change for many people at once, through the door each would go
 * through alone -- the pattern server/consent.ts set for a yes, applied to
 * the two other things a desk does to a selection: the receptionist's mode
 * and a note.
 *
 * The ids are read back under RLS and held to THIS workspace; an erased
 * person is not written on; what was not ours, or not there, comes back as
 * skipped rather than as a failure.
 */
export interface ManyOutcome {
  done: number;
  failed: { id: string; message: string }[];
  skipped: string[];
}

export const NOTE_LINE_MAX = 200;
export const RECEPTIONIST_MODES = ["auto", "ask", "never", "inherit"] as const;
export type ReceptionistMode = (typeof RECEPTIONIST_MODES)[number];

async function ours<T extends { id: string; tenant_id: string; erased_at: string | null }>(
  ctx: RouteContext,
  tenantId: string,
  ids: string[],
  columns: string,
): Promise<{ rows: T[]; skipped: string[] }> {
  const { data, error } = await ctx.supabase.from("contacts").select(columns).in("id", ids);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as T[]).filter((c) => c.tenant_id === tenantId && !c.erased_at);
  return { rows, skipped: ids.filter((id) => !rows.some((c) => c.id === id)) };
}

/**
 * The receptionist's mode for many: "auto" answers them, "ask" holds every
 * reply for a person, "never" stays out, "inherit" follows the workspace
 * again. The same policy row per person the single door writes
 * (setPersonReplyMode), and the same ledger verb with the mode in it.
 */
export async function setReceptionistMany(
  ctx: RouteContext,
  tenantId: string,
  ids: string[],
  mode: ReceptionistMode,
): Promise<ManyOutcome> {
  const uniq = [...new Set(ids)];
  const { rows, skipped } = await ours<{ id: string; tenant_id: string; erased_at: string | null }>(
    ctx,
    tenantId,
    uniq,
    "id, tenant_id, erased_at",
  );
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const c of rows) {
    try {
      await setPersonReplyMode(ctx.supabase, tenantId, c.id, mode === "inherit" ? null : mode);
    } catch (e) {
      failed.push({ id: c.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    await recordDecision(
      ctx,
      tenantId,
      "contact",
      c.id,
      mode === "auto" || mode === "inherit" ? "resume_agent" : "pause_agent",
      { receptionist_mode: mode, batch: uniq.length },
    );
    done += 1;
  }
  return { done, failed, skipped };
}

/**
 * One note on many people: "class of 12 Sep", "asked for the new stylist".
 * Each person gets it as a note of their own (0007), through the single door
 * a note on one person goes through (person_note_add, source bulk), dated and
 * signed by who wrote it. It used to be a line added under one field, and a
 * person whose field was full was refused.
 */
export async function appendNotesMany(
  ctx: RouteContext,
  tenantId: string,
  ids: string[],
  line: string,
): Promise<ManyOutcome> {
  const uniq = [...new Set(ids)];
  const text = line.trim().slice(0, NOTE_LINE_MAX);
  const { rows, skipped } = await ours<{
    id: string;
    tenant_id: string;
    erased_at: string | null;
  }>(ctx, tenantId, uniq, "id, tenant_id, erased_at");
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const c of rows) {
    const { data, error } = await ctx.supabase.rpc("person_note_add", {
      p_contact_id: c.id,
      p_body: text,
      p_source: "bulk",
    });
    const refused = (data as { error?: string } | null)?.error;
    if (error || refused) {
      failed.push({ id: c.id, message: error?.message ?? NOTE_REFUSALS[refused ?? ""] ?? "Could not add the note." });
      continue;
    }
    done += 1;
  }
  return { done, failed, skipped };
}
