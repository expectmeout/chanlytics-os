/**
 * A member's answer to one held or waiting email of a live run (reach_out_send_decide), Rewrite the opening with what
 * should change among them (00505), its Undo (reach_out_send_rewrite_undo), and the openings emails stand with now.
 * The two doors are the member's own, on their session, checked in SQL; each answers its refusal with its SQLSTATE and
 * its own words (DoorResult), as the workbench's doors do. A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { answer, type DoorResult } from "./reach-out-leads";

type Db = SupabaseClient<Database>;

/**
 * The member's answer to one email: include, rewrite (with what should change, or none), skip or not a fit. The words
 * are named to the database only when there are some, so a database from before 00505 answers every other press.
 */
export async function decideSendDoor(
  db: Db,
  p: { sendId: string; decision: string; change: string | null },
): Promise<DoorResult<{ send_id: string; decision: string }>> {
  const { data, error } = await db.rpc("reach_out_send_decide", {
    p_send_id: p.sendId,
    p_decision: p.decision,
    ...(p.change ? { p_change: p.change } : {}),
  });
  return answer(data, error);
}

/** What Undo put back: the opening, and whether the email waits or is held again as it was. */
interface RewriteUndoAnswer {
  send_id: string;
  opening: string;
  state: "planned" | "held";
}

/** The member's Undo of Rewrite the opening: the opening it replaced, and how it stood, back (00505). */
export async function undoSendRewrite(db: Db, sendId: string): Promise<DoorResult<RewriteUndoAnswer>> {
  const { data, error } = await db.rpc("reach_out_send_rewrite_undo", { p_send_id: sendId });
  return answer(data, error);
}

/** The opening an email stands with now, as its check left it (contracts ReachOutOpeningDto). */
interface SendOpening {
  send_id: string;
  opening: string | null;
  /** The check has read its words: the opening is written (or the words need none). */
  written: boolean;
  /** Why the check held it, or null. */
  held: string | null;
  /** Its sequence or its step is paused: the check writes nothing until it runs (sequence_unchecked). */
  paused: boolean;
  /** Its owner's Rewrite can be undone: the opening it replaced is kept. */
  undo: boolean;
}

/**
 * The openings these emails stand with, read on the member's session (sequence_sends_member_select), in the order asked;
 * one they cannot see is left out.
 */
export async function sendOpeningsOf(db: Db, p: { tenantId: string; sendIds: string[] }): Promise<SendOpening[]> {
  const { data, error } = await db
    .from("sequence_sends")
    .select("id, opening, checked_at, state, reason, rewrite_asked, step_id, sequence_id")
    .eq("tenant_id", p.tenantId)
    .in("id", p.sendIds)
    .not("lead_id", "is", null);
  if (error) throw new Error(`cannot read the emails' openings: ${error.message}`);
  const rows = data ?? [];
  const stepIds = [...new Set(rows.flatMap((r) => [r.step_id, r.sequence_id]).filter((x): x is string => !!x))];
  const steps = stepIds.length
    ? await db.from("sequence_steps").select("id, state").eq("tenant_id", p.tenantId).in("id", stepIds)
    : { data: [], error: null };
  if (steps.error) throw new Error(`cannot read the emails' steps: ${steps.error.message}`);
  const running = new Set((steps.data ?? []).filter((s) => s.state === "running").map((s) => s.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return p.sendIds.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const asked = r.rewrite_asked;
    const was = asked && typeof asked === "object" && !Array.isArray(asked) ? (asked as { was?: unknown }).was : null;
    const paused = !(r.step_id && running.has(r.step_id) && running.has(r.sequence_id));
    return [
      {
        send_id: id,
        opening: r.opening,
        written: r.checked_at !== null,
        held: r.state === "held" ? r.reason : null,
        paused: r.checked_at === null && paused,
        undo: !!was && typeof was === "object",
      },
    ];
  });
}
