/**
 * An Instagram DM, recorded at its door and answered by its job (decision 0001, step 8), on the road a text takes
 * (decision 0031): the webhook records the DM through the receptionist's own ingest (core recordInbound, with the
 * account's carrier), schedules its answer as an inbound_answer job, due now, once per message, and acknowledges; the
 * job takes it up again through the whole inbound phase (core answerInbound with `resume`), so a runner killed mid-turn
 * leaves a job the ledger claims again, which answers while the DM is unprocessed and no reply names it, and never writes
 * twice: the account's sender says it is about to speak on the job's row the moment before Instagram is called (jobs
 * markSpoke). A new door has no frozen contract to keep (WhatsApp's process-then-200 was pinned by its App Review), so it
 * takes the road the decision chose for every door.
 *
 * The job carries the DM as Meta sent it (the `messaging[]` item), the account it was written to (the routing key) and
 * the name the door read from the person's profile, and names the message, its thread and its person, so an erasure
 * cancels a job still waiting and scrubs one finished. The door and the job make it into the one inbound shape with the
 * same adapter (channels inboundFromInstagram), so a job a door wrote before a deploy is read as one written after it.
 * A DM the person unsends before its job runs loses its words in the job too (00486 message_unsent).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { inboundFromInstagram, type IgMessaging } from "../packages/channels.js";
import { resolveChannelDetailed, type Database, type Json, type RoutedChannel } from "../packages/db.js";
import { markSpoke, scheduleJobOnce, type ClaimedJob } from "../packages/jobs.js";
import { errField, logger } from "../log.js";
import { recordDmInbound, resumeDmInbound } from "../whatsapp/inbound.js";
import { instagramCarrier, instagramCredentials } from "./credentials.js";

type Db = SupabaseClient<Database>;

/** A value as the ledger keeps it: what JSON carries of it, which is all a job's payload holds. */
const asKept = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

/** The routed account as its Vault read takes it: its row's id, and its reference there. */
const accountRow = (routed: RoutedChannel) => ({ id: routed.channelId, credentials_ref: routed.credentialsRef });

/**
 * The door's half: the DM recorded (or set aside, or a redelivery, and then nothing more), and its answer scheduled as its
 * job. Throws IngestFailed when the write failed, which the webhook answers 503 so Meta sends it again. A schedule that
 * fails may be a write that landed and an answer that did not come back, so nothing is answered here: a job that exists
 * answers it, and the deadman sweep hands a DM with none to a person. A missed answer beats a second one.
 */
export async function recordThenAnswerDm(
  db: Db,
  routed: RoutedChannel,
  item: IgMessaging,
  profileName: string | null,
): Promise<void> {
  const message = inboundFromInstagram(item, profileName);
  if (!message) return;
  // The carrier of the account it was written to: nothing is sent at the door, so its token is not read here.
  const ing = await recordDmInbound(message, routed, instagramCarrier({ outcome: "absent" }));
  if (!ing) return;
  const payload: Json = {
    ig: asKept({ account: routed.externalId, item, profile_name: profileName }),
    message_id: ing.message_id,
    conversation_id: ing.conversation_id,
    contact_id: ing.contact_id,
  };
  try {
    await scheduleJobOnce(db, { tenantId: routed.tenantId, kind: "inbound_answer", dueAt: new Date(), payload });
  } catch (e) {
    logger({ tenant_id: routed.tenantId }).warn("ig_answer_unscheduled", {
      id: message.externalId,
      error: errField(e),
    });
  }
}

/**
 * The job's half (inbound_answer with `ig`, bound by lib/whatsapp/answer-later.ts answerInboundJob): the DM its door
 * recorded, answered. The account's routing is read again and must still be the job's workspace, its token read from the
 * Vault, and the whole inbound phase runs with `resume`. Throws when the payload names no DM, the account is another
 * workspace's now, or a read failed: the ledger tries again until the job has spoken, and after that the sweep hands the
 * DM to a person.
 */
export async function answerDm(db: Db, job: ClaimedJob): Promise<void> {
  const ig = job.payload.ig as { account?: unknown; item?: IgMessaging; profile_name?: unknown } | null | undefined;
  const account = typeof ig?.account === "string" ? ig.account : "";
  if (!account || !ig?.item) throw new Error("inbound_answer: the payload names no Instagram DM");
  const message = inboundFromInstagram(ig.item, typeof ig.profile_name === "string" ? ig.profile_name : null);
  if (!message) throw new Error("inbound_answer: the payload's DM names no id or no sender");
  const { channel: routed } = await resolveChannelDetailed(db, "instagram", account);
  if (!routed) throw new Error("inbound_answer: the account's Instagram channel could not be read, or is not active");
  if (routed.tenantId !== job.tenant_id)
    throw new Error("inbound_answer: the account written to is another workspace's now");
  const read = await instagramCredentials(db, accountRow(routed));
  if (read.outcome === "unavailable")
    throw new Error(`inbound_answer: the account's token could not be read: ${read.error}`);
  logger({ tenant_id: job.tenant_id }).info("ig_answer_taken_up", { id: message.externalId });
  await resumeDmInbound(
    message,
    routed,
    instagramCarrier(read, () => markSpoke(db, job)),
  );
}
