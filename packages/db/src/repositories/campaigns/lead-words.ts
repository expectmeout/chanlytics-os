/**
 * A lead's own words at one step of a sequence (00543 sequence_lead_words, decision 0096): what that lead gets there in
 * place of the step's words. The door is the member's, on their session, checked in SQL, and answers its refusal with its
 * SQLSTATE and its own words (DoorResult). The reads are the sender's and the check's, on the service role, and a member's
 * under row security. A read that fails throws: an email never falls back to the step's words because a read did not land.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadEmailText, LeadStepWordsDto } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { readAllRows } from "../../paged";
import { answer, type DoorResult } from "./reach-out-leads";

type Db = SupabaseClient<Database>;

/** How many ids one `in` list carries: two hundred keep a request line under the gateway's 8 KiB (414). */
const IDS_IN_CHUNK = 200;
const chunksOf = (ids: readonly string[]): string[][] => {
  const unique = [...new Set(ids)];
  return Array.from({ length: Math.ceil(unique.length / IDS_IN_CHUNK) }, (_, i) =>
    unique.slice(i * IDS_IN_CHUNK, (i + 1) * IDS_IN_CHUNK),
  );
};

/** What the door answers: the send it held against a claim, where one stands, and the words that stood before, for Undo. */
export interface LeadWordsAnswer {
  step_id: string;
  lead_id: string;
  send_id: string | null;
  was: LeadEmailText | null;
}

/**
 * Save a lead's words at a step, or, with none, put the step's back. `checkedWords` is the mark of the words now in force,
 * which a checked send takes so its sender sends them; `needsLine` says those words name {{opening}}.
 */
export async function setLeadWords(
  db: Db,
  p: { stepId: string; leadId: string; words: LeadEmailText | null; checkedWords: string; needsLine: boolean },
): Promise<DoorResult<LeadWordsAnswer>> {
  const { data, error } = await db.rpc("sequence_lead_words_set", {
    p_step_id: p.stepId,
    p_lead_id: p.leadId,
    ...(p.words ? { p_body: p.words.body, ...(p.words.subject === null ? {} : { p_subject: p.words.subject }) } : {}),
    p_checked_words: p.checkedWords,
    p_needs_line: p.needsLine,
  });
  return answer(data, error);
}

/** One lead's own words at every step they have some. Read on the member's session. */
export async function leadWordsOf(db: Db, tenantId: string, leadId: string): Promise<LeadStepWordsDto[]> {
  const { data, error } = await db
    .from("sequence_lead_words")
    .select("step_id, subject, body, written_at")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId);
  if (error) throw new Error(`cannot read the lead's own words: ${error.message}`);
  return (data ?? []).map((r) => ({ step_id: r.step_id, subject: r.subject, body: r.body, at: r.written_at }));
}

/** One lead's own words at one step, or none: the step's stand. */
export async function leadStepWordsOf(
  db: Db,
  p: { tenantId: string; stepId: string; leadId: string },
): Promise<LeadEmailText | null> {
  const { data, error } = await db
    .from("sequence_lead_words")
    .select("subject, body")
    .eq("tenant_id", p.tenantId)
    .eq("step_id", p.stepId)
    .eq("lead_id", p.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead's own words: ${error.message}`);
  return data ? { subject: data.subject, body: data.body } : null;
}

/** What one send of a lead's said as it went: its email, subject and words; null where it wrote none. */
export async function leadSentEmailOf(
  db: Db,
  p: { tenantId: string; leadId: string; sendId: string },
): Promise<LeadEmailText | null> {
  const send = await db
    .from("sequence_sends")
    .select("message_id")
    .eq("tenant_id", p.tenantId)
    .eq("lead_id", p.leadId)
    .eq("id", p.sendId)
    .maybeSingle();
  if (send.error) throw new Error(`cannot read the send: ${send.error.message}`);
  if (!send.data?.message_id) return null;
  const message = await db
    .from("messages")
    .select("body, meta")
    .eq("tenant_id", p.tenantId)
    .eq("id", send.data.message_id)
    .maybeSingle();
  if (message.error) throw new Error(`cannot read the email: ${message.error.message}`);
  if (!message.data) return null;
  const subject = (message.data.meta as { email?: { subject?: unknown } } | null)?.email?.subject;
  return { subject: typeof subject === "string" ? subject : null, body: message.data.body ?? "" };
}

/** The key a lead's words at a step are found under, read by leadWordsAtSteps' caller. */
export const leadStepKey = (stepId: string, leadId: string): string => `${stepId}:${leadId}`;

/** The own words of these leads, by step and lead (leadStepKey), however many they are: a run's, or a tick's sends. */
export async function leadWordsOfLeads(db: Db, leadIds: readonly string[]): Promise<Map<string, LeadEmailText>> {
  const out = new Map<string, LeadEmailText>();
  for (const ids of chunksOf(leadIds)) {
    const rows = await readAllRows("the leads' own words", (from, to) =>
      db
        .from("sequence_lead_words")
        .select("step_id, lead_id, subject, body")
        .in("lead_id", ids)
        .order("step_id")
        .order("lead_id")
        .range(from, to),
    );
    for (const r of rows) out.set(leadStepKey(r.step_id, r.lead_id), { subject: r.subject, body: r.body });
  }
  return out;
}

/** How many leads keep their own words at each of these steps: what "for everyone" leaves out. */
export async function ownWordsAtSteps(
  db: Db,
  tenantId: string,
  stepIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const ids of chunksOf(stepIds)) {
    const rows = await readAllRows("who keeps their own words", (from, to) =>
      db
        .from("sequence_lead_words")
        .select("step_id, lead_id")
        .eq("tenant_id", tenantId)
        .in("step_id", ids)
        .order("step_id")
        .order("lead_id")
        .range(from, to),
    );
    for (const r of rows) out.set(r.step_id, (out.get(r.step_id) ?? 0) + 1);
  }
  return out;
}
