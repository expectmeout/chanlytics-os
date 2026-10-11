/**
 * Rewrite a held draft to the owner's instruction — the text whisper.
 *
 * The door is api/admin/steer.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this the
 * knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The phone receptionist can be whispered to mid-call; the WhatsApp one
 * could only be stopped. Now a draft that is waiting its turn can be sent
 * back with one line — "mention Saturday is full", "shorter, in Spanish" —
 * and rewritten by the same brain, with the same prompt, the same memory and
 * the same rules, then queued again to wait like the first one did.
 *
 * Order matters and is deliberate: the new draft is queued FIRST, then the
 * old one is retired with its job. If the new one cannot be queued the old
 * one still stands; if the old one cannot be retired the new one is taken
 * back, so two drafts never race to the customer. A rewrite that quotes a
 * price is refused and the old draft is left alone.
 *
 * Internal endpoint -- the per-call token, called by the dashboard's steer
 * route after RLS has proved the draft belongs to the operator's workspace and
 * the role door has been checked there. The token names that workspace, and a
 * draft of another is refused. Body: { message_id, text }.
 */
import { json, refuse } from "../http.js";
import { tokenWorkspace, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { readThreadState, readLeadContext, describeLead, oldestActiveChannel, withdrawQueued } from "../packages/db.js";
import {
  resolveSystemPrompt,
  describeNow,
  frameSteer,
  violatesNoPrices,
  namesMoney,
  replyDelayMs,
  fallbackMessages,
  UUID,
} from "../packages/contracts.js";
import { smsBody } from "../packages/channels.js";
import { brainCallOf, generateReply } from "./brain.js";
import { queueDraft } from "./draft-queue.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";

const MAX_CHARS = 500;

const steerLog = logger();

/**
 * The model as a port. Production passes nothing and gets the real brain; a
 * test hands in an answer, because lib/brain.ts speaks to the Anthropic SDK
 * and has no seam of its own. Anything else that may arrive in this position
 * carries no generateReply and changes nothing. BOTH branches are run in
 * tooling/scripts/tests/steer-door.test.mjs: most cases hand a brain in, and
 * the last three call POST the way Vercel calls it and watch the real brain
 * reach the model.
 */
export interface BrainPort {
  generateReply?: typeof generateReply;
}

/**
 * Whether a rewrite may not go out: a price never goes out, nor money a person decides (a refund, a discount, a
 * deposit). Both are refused as policy_block_price, the one code the two apps read whichever deploys first; the log
 * line says which, and never the words.
 */
function rewriteBlocked(text: string, messageId: string): boolean {
  if (violatesNoPrices(text)) {
    steerLog.warn("steer_policy_block_price", { message_id: messageId });
    return true;
  }
  if (!namesMoney(text)) return false;
  steerLog.warn("steer_policy_block_money", { message_id: messageId });
  return true;
}

/**
 * The message the door was named, for the workspace the token names. A token minted for one workspace opens only that
 * workspace's drafts: another's is a draft that is not there, the answer a made-up id gets, so the door cannot be
 * used to find out which ids exist. A knock that names none (a preview's key) reads the id as it always did.
 */
/**
 * The customer's message a draft answers (meta.reply_to, written by the draft writer and carried by each rewrite), or
 * nothing.
 */
function replyToOf(meta: unknown): string | undefined {
  const replyTo = typeof meta === "object" && meta ? (meta as { reply_to?: unknown }).reply_to : undefined;
  return typeof replyTo === "string" ? replyTo : undefined;
}

/**
 * Who the customer is, as the reply being rewritten found them: the message the draft answers (its reply_to) is not
 * their history (db readLeadContext's `answering`). Nothing when they cannot be read, which costs the note, never the
 * rewrite.
 */
async function leadNoteOf(
  db: NonNullable<ReturnType<typeof pg>>,
  m: { tenant_id: string; meta: unknown },
  phone: string,
  timezone: string,
  channel: "whatsapp" | "sms",
): Promise<string | undefined> {
  try {
    const lead = await readLeadContext(db, m.tenant_id, phone, 1, replyToOf(m.meta));
    return describeLead(lead, undefined, timezone, channel);
  } catch (e) {
    steerLog.warn("steer_lead_context_unavailable", { error: errField(e) });
    return undefined;
  }
}

function draftOf(db: NonNullable<ReturnType<typeof pg>>, messageId: string, workspace: string | null) {
  const draft = db
    .from("messages")
    .select("id, tenant_id, conversation_id, contact_id, sender, status, meta, channel, sending_at")
    .eq("id", messageId);
  return (workspace ? draft.eq("tenant_id", workspace) : draft).maybeSingle();
}

/**
 * The door's refusal of a draft that cannot be rewritten, or null when it can: it is not the receptionist's draft
 * waiting its turn, or its send job has claimed it (sending_at, 00352) and it is on its way to the customer, queued only
 * until the provider answers. There is nothing left to rewrite then, and the model is not asked.
 */
function notRewritable(m: { sender: string; status: string; sending_at: string | null }): Response | null {
  if (m.sender !== "ai" || m.status !== "queued") return refuse(409, "not_a_held_draft");
  return m.sending_at ? refuse(409, "already_sent") : null;
}

/**
 * The words as they wait for the wire, shaped as the draft they replace was (core inbound ingest.ts, `wire`): a text
 * carries the rates, STOP and HELP line when no text of ours has reached this person yet, and never runs past the
 * carrier's ceiling. Queued as the model wrote them, a steered first text went out without the line the carriers'
 * filing promises.
 */
function wordsForTheWire(channel: "whatsapp" | "sms", text: string, textedBefore: boolean): string {
  return channel === "sms" ? smsBody(text, !textedBefore) : text;
}

/**
 * The old draft retired for the rewrite that was queued in its place: null when it was, else the door's answer, and
 * the rewrite is taken back with its send.
 *
 * Counted, not just attempted. The filters are the whole guard: the model takes seconds, and in those seconds the
 * tick can claim the old draft's job and send it. Its row stays queued until the provider answers, so it is asked for
 * unclaimed too (sending_at, 00352): `queued` alone retired a draft already on its way, under a row that then said
 * canceled. Either way the update matches NOTHING and reports no error, and uncounted, the rewrite queued a moment ago
 * went out behind the reply it was meant to replace — two answers to one message. Zero rows is the race, and it is
 * handled exactly like a failure to retire.
 */
async function retireForTheRewrite(
  db: NonNullable<ReturnType<typeof pg>>,
  old: { id: string; tenant_id: string },
  newId: string,
): Promise<Response | null> {
  // Through the one door (00387): the old draft and its send job, only while no run has claimed it.
  const failed = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const retired = await withdrawQueued(db, {
    tenantId: old.tenant_id,
    messageIds: [old.id],
    reason: { reason: "steered", replaced_by: newId },
  }).then(
    (ids) => ({ ids, error: null as string | null }),
    (e: unknown) => ({ ids: [] as string[], error: failed(e) }),
  );
  if (retired.ids.length) return null;
  const lost = retired.error === null;
  steerLog.error(lost ? "steer_lost_race" : "steer_retire_failed", {
    message_id: old.id,
    error: retired.error ?? undefined,
  });
  // The rewrite taken back the same way, with its job.
  await withdrawQueued(db, {
    tenantId: old.tenant_id,
    messageIds: [newId],
    reason: { reason: lost ? "steer_lost_race" : "steer_rolled_back" },
  }).catch((e: unknown) => steerLog.error("steer_retire_failed", { message_id: newId, error: failed(e) }));
  return lost ? refuse(409, "already_sent") : refuse(500, "could_not_retire_old_draft");
}

export async function steerHeldDraft(
  auth: Admitted,
  body: Partial<{ message_id?: string; text?: string }>,
  brain?: BrainPort | null,
): Promise<Response> {
  const ask = brain?.generateReply ?? generateReply;
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
  const workspace = tokenWorkspace(auth, "/api/admin/steer");
  const messageId = String(body.message_id || "");
  const text = String(body.text || "").trim();
  if (!UUID.test(messageId) || !text || text.length > MAX_CHARS) {
    return refuse(400, "bad_request", `message_id + text (1-${MAX_CHARS} chars) required`);
  }

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const { data: m, error: mErr } = await draftOf(db, messageId, workspace);
  if (mErr) return refuse(500, "message_read_failed");
  if (!m) return refuse(404, "not_found");
  const held = notRewritable(m);
  if (held) return held;

  const { data: conv } = await db
    .from("conversations")
    .select("id, contacts (phone_e164)")
    .eq("id", m.conversation_id)
    .eq("tenant_id", m.tenant_id)
    .maybeSingle();
  const phone = conv?.contacts?.phone_e164 ?? null;
  if (!phone) return refuse(409, "no_phone");

  // The wire the draft is already on. A held reply to a text is an `sms` row,
  // and looking the tenant up on WhatsApp alone both refused every steer for a
  // texting-only workspace and, where a WhatsApp channel happened to exist,
  // rewrote the reply against the wrong channel.
  const channel: "whatsapp" | "sms" = m.channel === "sms" ? "sms" : "whatsapp";
  // Its oldest active one, where a workspace holds two of the kind; a read that failed finds none, as it always did.
  const routed = await oldestActiveChannel(db, m.tenant_id, channel).catch(() => null);
  if (!routed) return refuse(409, "no_channel");
  const rt = await loadTenantRuntime(db, routed);
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");

  // The same memory the reply was written from. The held draft itself is not
  // in it (only delivered replies are), and the customer's latest words are
  // its last turn — those are what the rewrite answers.
  const thread = await readThreadState(db, m.tenant_id, m.conversation_id, null);
  const lastUser = [...thread.history].reverse().find((t) => t.role === "user");
  if (!lastUser) return refuse(409, "nothing_to_answer");

  const leadNote = await leadNoteOf(db, m, phone, rt.timezone ?? "UTC", channel);

  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof generateReply>>;
  try {
    r = await ask(
      thread.history,
      lastUser.content,
      resolveSystemPrompt(rt.brain, channel, rt.timezone, new Date(), rt.policy, rt.known),
      fallbackMessages(rt.brain, rt.known).error,
      leadNote,
      describeNow(rt.timezone, new Date(), rt.brain.profile?.closures),
      undefined,
      frameSteer(text),
      brainCallOf(m.tenant_id, rt, { subjectId: m.conversation_id }),
    );
  } catch (e) {
    steerLog.error("steer_brain_failed", { error: errField(e) });
    return refuse(502, "brain_failed");
  }
  // The same second door the handler keeps: no price, no money a person decides; the original draft stays.
  if (rewriteBlocked(r.text, messageId)) return refuse(409, "policy_block_price");
  const words = wordsForTheWire(channel, r.text, thread.textedBefore);

  const delayMs =
    typeof m.meta === "object" && m.meta && typeof (m.meta as { delay_ms?: unknown }).delay_ms === "number"
      ? (m.meta as { delay_ms: number }).delay_ms
      : replyDelayMs("veto", rt.policy?.reply?.limits);

  // New first, then retire the old — see the header.
  const newId = await queueDraft(
    db,
    {
      tenantId: m.tenant_id,
      conversationId: m.conversation_id,
      contactId: m.contact_id,
      toPhone: phone,
      body: words,
      delayMs,
      source: "steered",
      brainMeta: r.meta,
      // The rewrite goes out on the wire the draft it replaces was written for.
      // Unsaid, the row defaulted to WhatsApp, so a steered text was sent over
      // WhatsApp to a number that had only ever texted — and the customer's own
      // thread never got its answer.
      channel,
      extra: { steer: text, steered_from: m.id, escalate: r.escalate, reply_to: replyToOf(m.meta) },
    },
    steerLog,
  );
  if (!newId) return refuse(502, "could_not_queue");

  // Then the old one, counted (retireForTheRewrite): a draft the tick sent or claimed meanwhile takes the rewrite back.
  const lost = await retireForTheRewrite(db, m, newId);
  if (lost) return lost;

  // The words are the owner's and the model's and stay out of the log.
  steerLog.info("admin_steer", {
    message_id: m.id,
    new_message_id: newId,
    chars: text.length,
    ms: Date.now() - t0,
    escalate: r.escalate,
    delay_ms: delayMs,
  });
  return json(200, {
    ok: true,
    message_id: newId,
    text: words,
    meta: r.meta ?? null,
    escalate: r.escalate,
    delay_ms: delayMs,
  });
}
