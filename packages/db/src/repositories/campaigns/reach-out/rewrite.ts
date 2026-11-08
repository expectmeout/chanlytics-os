/**
 * A member's answer to one held or waiting email of a live run (reach_out_send_decide), Rewrite the opening with what
 * should change among them (00505), its Undo (reach_out_send_rewrite_undo), and the openings emails stand with now.
 * The two doors are the member's own, on their session, checked in SQL; each answers its refusal with its SQLSTATE and
 * its own words (DoorResult), as the workbench's doors do. A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types";
import { answer, type DoorResult } from "./leads";

import { recordOrEmpty, type SchemaSet, type TenantId } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;

/**
 * The member's answer to one email: include, rewrite (with what should change, or none), skip or not a fit. The words
 * are named to the database only when there are some, so a database from before 00505 answers every other press.
 */
export async function decideSendDoor(
  db: Db,
  params: { sendId: string; decision: string; change: string | null },
): Promise<DoorResult<{ send_id: string; decision: string }>> {
  const { data, error } = await db.rpc("reach_out_send_decide", {
    p_send_id: params.sendId,
    p_decision: params.decision,
    ...(params.change ? { p_change: params.change } : {}),
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
export async function sendOpeningsOf(
  db: Db,
  params: { tenantId: TenantId; sendIds: string[] },
): Promise<SendOpening[]> {
  const { data, error } = await db
    .from("sequence_sends")
    .select("id, opening, checked_at, state, reason, rewrite_asked, step_id, sequence_id")
    .eq("tenant_id", params.tenantId)
    .in("id", params.sendIds)
    .not("lead_id", "is", null);
  if (error) throw new Error(`cannot read the emails' openings: ${error.message}`);
  const rows = data ?? [];
  const stepIds = [...new Set(rows.flatMap((r) => [r.step_id, r.sequence_id]).filter((x): x is string => !!x))];
  const steps = stepIds.length
    ? await db.from("sequence_steps").select("id, state").eq("tenant_id", params.tenantId).in("id", stepIds)
    : { data: [], error: null };
  if (steps.error) throw new Error(`cannot read the emails' steps: ${steps.error.message}`);
  const running = new Set((steps.data ?? []).filter((s) => s.state === "running").map((s) => s.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return params.sendIds.flatMap((id) => {
    const found = byId.get(id);
    if (!found) return [];
    const was = recordOrEmpty(found.rewrite_asked).was;
    const paused = !(
      found.step_id &&
      found.sequence_id &&
      running.has(found.step_id) &&
      running.has(found.sequence_id)
    );
    return [
      {
        send_id: id,
        opening: found.opening,
        written: found.checked_at !== null,
        held: found.state === "held" ? found.reason : null,
        paused: found.checked_at === null && paused,
        undo: !!was && typeof was === "object",
      },
    ];
  });
}

/** A send of a step that still goes, or went: one skipped or failed says nothing of what a lead gets. */
const SENDS_THAT_GO: SchemaSet<"sequence_sends.state">[] = ["planned", "held", "claimed", "queued", "drafted", "sent"];

/** The listing's own fields a lead's opening is said from where none is written (contracts FactListing, leadFactOf). */
interface LeadListing {
  business_name: string | null;
  city: string | null;
  hours: Json;
  rating: number | null;
  reviews: number | null;
}

/**
 * What one lead's email at one step opens with, as it stands (Send me a test, 3 Nov 2026: the test said a line still to
 * come where the email had its opening written): the opening its latest send there that still goes was written with,
 * null while none is written or the step has no send for them yet; and the listing's fields the sentence code says is
 * said from. contracts leadOpeningOf reads the two. Read on the member's session; a lead they cannot see has no listing.
 */
export async function findLeadStepOpening(
  db: Db,
  params: { tenantId: TenantId; stepId: string; leadId: string },
): Promise<{ written: string | null; listing: LeadListing | null }> {
  const [send, lead] = await Promise.all([
    db
      .from("sequence_sends")
      .select("opening")
      .eq("tenant_id", params.tenantId)
      .eq("lead_id", params.leadId)
      .eq("step_id", params.stepId)
      .in("state", SENDS_THAT_GO)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("leads")
      .select("business_name, city, hours, rating, reviews")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.leadId)
      .maybeSingle(),
  ]);
  if (send.error) throw new Error(`cannot read the lead's email at its step: ${send.error.message}`);
  if (lead.error) throw new Error(`cannot read the lead's listing: ${lead.error.message}`);
  return { written: send.data?.opening ?? null, listing: lead.data ?? null };
}
