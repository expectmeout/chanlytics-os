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

/** An answer job, by what its door recorded. */
export function answerInboundJob(db: Db, job: ClaimedJob): Promise<void> {
  if (job.payload.wa) return answerWhatsapp(db, job);
  return job.payload.ig ? answerDm(db, job) : answerText(db, job);
}
