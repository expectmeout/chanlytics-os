/**
 * An inbound_answer job (bound by lib/ops/jobs-tick.ts): the message its door recorded, answered by its own wire's half
 * (./arrival.ts answerArrival underneath each). A payload says its wire by what it carries, as every door has written it
 * since its job existed, so a job written before a deploy is read by the one after it: `wa` a WhatsApp message
 * (lib/whatsapp/answer-later.ts), `ig` an Instagram DM (lib/instagram/dm-answer.ts), and otherwise a text
 * (lib/sms/inbound-text.ts).
 *
 * Every wire's half is tried again by the ledger only until it speaks: its sender says so on the job's row the moment
 * before the provider is called, so a run killed with the reply in flight, or one that throws after it left,
 * is never run again to write to the person twice (./arrival.ts spokeFirst). A mark that cannot be written throws at the wire, nothing is sent, and
 * the send door answers as it does for any wire it could not use: the thread is flagged for a person and the owner told.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import type { ClaimedJob } from "../packages/jobs.js";
import { answerWhatsapp } from "../whatsapp/answer-later.js";
import { answerDm } from "../instagram/dm-answer.js";
import { answerText } from "../sms/inbound-text.js";

type Db = SupabaseClient<Database>;

/** The wires an answer job answers on. */
type AnswerWire = "whatsapp" | "sms" | "instagram";

/**
 * The wire an answer job is for: its payload says it (`wire`, since 3 Nov 2026). A job its door wrote before then is read
 * by what it carries, as every door wrote it: `wa` a WhatsApp message, `ig` a DM, and otherwise a text. Kept for the
 * jobs a deploy finds waiting, which a day's ledger has long finished.
 */
export function jobWireOf(payload: Record<string, unknown>): AnswerWire {
  const said = payload.wire;
  if (said === "whatsapp" || said === "sms" || said === "instagram") return said;
  return payload.wa ? "whatsapp" : payload.ig ? "instagram" : "sms";
}

/** An answer job, by its wire; its turn answered by `deadline` when the ledger gives one (core answer.ts). */
export function answerInboundJob(db: Db, job: ClaimedJob, deadline?: number): Promise<void> {
  switch (jobWireOf(job.payload)) {
    case "whatsapp":
      return answerWhatsapp(db, job, deadline);
    case "instagram":
      return answerDm(db, job, deadline);
    case "sms":
      return answerText(db, job, deadline);
  }
}
