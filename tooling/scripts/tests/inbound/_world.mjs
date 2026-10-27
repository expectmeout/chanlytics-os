/**
 * The receptionist's world, as inbound-executed.test.mjs (whatsapp/) runs the message path over it: the edge's adapter
 * (apps/edge/lib/whatsapp/inbound.ts) for real, its pure gates as themselves, and everything outside them (the database,
 * the memory, the tenant runtime, the sink, the alerts, the pager, the model) as fakes handed in through ports.ts. A
 * fixture is a WhatsApp message as Meta sends it, handed over in the one shape its door makes of it (decision 0001, step
 * 3), on the world's line when the world has one.
 *
 * The memory below is modelled the way Postgres holds it, because that is the
 * only memory there is: `ingest` records the customer's words and answers
 * `is_new` (which IS the redelivery gate), the sink's `deliver` is what makes
 * a reply part of the history, `pause` is what takes the receptionist out of
 * the thread, and `thread` reads all three back. Nothing the handler mutates
 * in hand is remembered — it reports, and the rows are the record.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HANDLED_OUTCOMES } from "@chanlytics/contracts";
import { inboundFromWhatsapp } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleInbound, recordInboundMessage, resumeInbound } = await import(at("apps/edge/lib/whatsapp/inbound.ts"));

export const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";
const NOTIFICATIONS = () => ({
  escalation_emails: ["owner@riverside.example"],
  from: "Riverside Studio <hello@platform.test>",
});
const BRAIN = () => ({
  business_name: "Harbor Nails",
  booking_link: "https://booking.example/riverside",
  system_prompt:
    "You are the assistant for Harbor Nails, answering inbound customer messages. Be warm, brief and honest, and offer to have a person follow up.",
  fallbacks: {
    greeting: GREETING,
    error: "Thanks for writing to Harbor Nails! A member of the team will reply here soon.",
    non_text: "Thanks for your message! A member of the team will take a look and reply here soon.",
  },
});
export const FROM = "13055550100";
export const routed = {
  channelId: "c1",
  tenantId: "t1",
  kind: "whatsapp",
  externalId: "p1",
  numberE164: "+13055550199",
  credentialsRef: null,
  config: {},
};
export const runtime = (over = {}) => ({
  tenantId: "t1",
  slug: "harbor",
  brain: BRAIN(),
  notifications: NOTIFICATIONS(),
  calendar: null,
  features: null,
  policy: { reply: { mode: "auto", limits: {} } },
  waCreds: { accessToken: "tok", phoneId: "p1" },
  paused: false,
  loadFailed: false,
  configBroken: false,
  ...over,
});
export const text = (body, id = "wamid.1", from = FROM) => ({
  from,
  id,
  type: "text",
  timestamp: String(Math.floor(Date.now() / 1000)),
  text: { body },
});
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
export const ingested = (n) => ({
  message_id: "m-in",
  conversation_id: "conv1",
  contact_id: "k1",
  is_new: true,
  consent: n.consent.optOut ? "opted_out" : "unknown",
  dnc: n.consent.optOut,
  paused_until: null,
});

/**
 * A hold the database took is told from its event, once, after the commit (core SUBSCRIBERS.owner_notice, decision 0043;
 * events/an-event-is-delivered-to-its-subscriber.test.mjs); the handler tells, in its own words, only a hold it could
 * not write (`escalateAnswer: "failed"`).
 */
export const FROM_ITS_EVENT = "the hold is written, so its event tells the owner, not the handler (decision 0043)";

/** The handler's world, recording everything that crosses it. */
export function world(over = {}) {
  // The rows, as Postgres would hold them for this one conversation.
  // A thread a person already has (`pausedUntil`): taken over, or claimed by their reply, with no hold open.
  const memory = { history: [], replies: [], pausedUntil: over.pausedUntil ?? 0, textedBefore: false };
  const delivered = new Set();
  const seen = {
    sent: [],
    escalations: [],
    alerts: [],
    pages: [],
    pauses: [],
    // Asked and landed (opened, changed or refreshed); an escalation the database refused is `refused`, nobody was asked.
    refused: [],
    underHold: [],
    // Messages marked processed, and every stamp: one a way out wrote beside processed_at (`marked`), or alone (noteHandled).
    processed: 0,
    handled: [],
    queued: [],
    // The owner told of a reply that waits to go in their name (decision 0064: the sink's replyHeld).
    heldTold: [],
    usage: [],
    unreachable: 0,
    media: 0,
    purposes: [],
    emails: [],
    // The line each message was ingested on (the verb's fourth argument), for the first touch the database stamps (K3).
    lines: [],
    // What each ingest was told about the visit (the verb's fifth argument): `{ jobFollows: true }` at the door of a message a job answers next.
    visits: [],
  };
  const rt = over.rt ?? runtime();
  const recordIngest = over.ingest ?? (async (_db, _tenant, n) => ingested(n));
  // The workspace's model tokens in the last 24 hours, for the day's budget (reply-gates.ts heldForThePerson).
  const tokensUsed = over.tokensUsed ?? 0;
  const ports = {
    db: () => fakeDb({}),
    runtime: async () => rt,
    leads: { read: async () => ({ name: null }), personReplyMode: async () => null },
    calendar: { openings: async () => null, visits: async () => null },
    budget: { tokensLast24h: async () => tokensUsed },
    persist: {
      // What readThreadState returns for the conversation the ingest named,
      // or an UNKNOWN thread when there is nothing to read it against.
      thread: async (_db, _tenant, ing) =>
        ing && !over.unreadable
          ? structuredClone({
              history: memory.history,
              pausedUntil: memory.pausedUntil,
              replies: memory.replies,
              textedBefore: memory.textedBefore,
            })
          : { history: [], pausedUntil: -1, replies: [], unknown: true },
      // Persist first, with the atomic is_new claim that IS the redelivery
      // gate. Bound per run, where the message id is known.
      ingest: recordIngest,
      sink: (_db, _tenant, ing, _rt, channel) => ({
        on: !!ing,
        deliver: async (to, body, meta, purpose) => {
          seen.sent.push({ to, body, meta: meta ?? null, channel });
          // The port's own default, mirrored: what reaches the door is what counts.
          seen.purposes.push(purpose ?? "conversational");
          const out = over.delivered ?? { outcome: "sent", messageId: "m-out", externalId: "wamid.out" };
          // The door writes the row, and the row IS the memory: only a reply
          // that actually left is something "we said".
          if (out.outcome === "sent") {
            memory.history.push({ role: "assistant", content: body });
            // A text of ours that left, and only a text (db readThreadState asks the texting wire's rows).
            if (channel === "sms") memory.textedBefore = true;
            if (!meta?.ack) memory.replies.push(Date.now());
          }
          return out;
        },
        // What the real sink does with it is sink-says-what-a-message-became.test.mjs's; a case may hand in the real one.
        processed: over.realProcessed
          ? over.realProcessed(ing)
          : async (how, intent) => {
              seen.processed += 1;
              seen.handled.push({ how: how ?? null, intent: intent ?? null, marked: true });
              await over.forwardTo?.(ing).processed(how, intent);
            },
        // The stamp alone, for the way out that leaves its message unprocessed on purpose (a send that failed).
        noteHandled: async (how, intent) => {
          seen.handled.push({ how: how ?? null, intent: intent ?? null, marked: false });
          await over.forwardTo?.(ing).noteHandled(how, intent);
        },
        allowlistSkip: async () => {},
        unreachableSender: async () => {
          seen.unreachable += 1;
        },
        noteEmail: async (address) => {
          seen.emails.push(address);
        },
        vetoFallback: async () => {},
        replyHeld: async (n) => {
          seen.heldTold.push(n);
        },
        pause: async (iso) => {
          seen.pauses.push(iso);
          memory.pausedUntil = Date.parse(iso);
        },
        usage: async (u) => {
          seen.usage.push(u);
        },
        // How the write landed, as upsertEscalation answers it; "failed" is a write the database refused.
        escalate: async (reason, details) => {
          // The door's one rule this world keeps (00454): a message under a hold already open is that hold's, whatever
          // its reason, and nothing is written.
          const open = seen.escalations.at(-1);
          if (reason === "wrote_while_held" && open && open.reason !== reason && !over.escalateAnswer) {
            seen.underHold.push({ reason, details });
            return "refreshed";
          }
          const how = over.escalateAnswer ?? "opened";
          (how === "failed" ? seen.refused : seen.escalations).push({ reason, details });
          return how;
        },
        media: async () => {
          seen.media += 1;
          return over.media ?? null;
        },
      }),
      // A hold that can be written, when a case asks for one (`queue: true`): the draft's id, as queueDraft answers.
      queueReply: async (_db, _tenant, _ing, _to, body, delayMs, _L, source) => {
        if (!over.queue) return false;
        seen.queued.push({ body, delayMs, source });
        return "m-queued";
      },
      // The thread's reply turn (00284), when a case models one.
      ...(over.turn ? { turn: over.turn } : {}),
      // Whether a reply names the message already (a text's answer taken up again), when a case models one.
      ...(over.answered ? { answered: over.answered } : {}),
    },
    alertStaff: async (thread, userText, botText, reason, ctx) => {
      seen.alerts.push({
        thread,
        userText,
        botText,
        reason,
        pauseHours: ctx.pausedHours ?? null,
        route: ctx.route,
        who: ctx.who,
        channel: ctx.channel,
        target: ctx.target,
      });
    },
    page: async (_ports, key, subject, body) => {
      seen.pages.push({ key, subject, body });
      return "sent";
    },
    sender: () => async () => ({ ok: true, wamid: "x", status: 200 }),
    brain: async () => {
      throw new Error("the model must not be reached in this test");
    },
    env: { allowlist: "", modelKey: undefined, ...(over.env ?? {}) },
  };
  // The messages stamped processed, by id: what an ingest of one already recorded answers (`processed`).
  const processedIds = new Set();
  /** The ingest bound for this message: its words on record before anything else can fail, its id the redelivery key. */
  const bind = (m) => {
    const key = `in:${m.id}`;
    const isNew = !delivered.has(key);
    delivered.add(key);
    const body = m.text?.body ?? null;
    if (isNew && body) memory.history.push({ role: "user", content: body });
    ports.persist.ingest = async (db, tenant, n, line, visit) => {
      seen.lines.push(line ?? null);
      seen.visits.push(visit ?? null);
      const rec = await recordIngest(db, tenant, n);
      return (
        rec && {
          ...rec,
          is_new: rec.is_new === false ? false : isNew,
          processed: processedIds.has(m.id),
          paused_until: memory.pausedUntil ? new Date(memory.pausedUntil).toISOString() : null,
        }
      );
    };
    const sink = ports.persist.sink;
    ports.persist.sink = (...args) => {
      const made = sink(...args);
      return {
        ...made,
        processed: async (...how) => {
          processedIds.add(m.id);
          await made.processed(...how);
        },
      };
    };
    return () => {
      ports.persist.sink = sink;
    };
  };
  /** The fixture in the one shape its door hands over (decision 0001, step 3): on the world's line when it has one. */
  const shaped = (m) => ({ ...inboundFromWhatsapp(m, value), ...(over.carrier ? { channel: "sms" } : {}) });
  /** The door's half of a text answered after its acknowledgement: recorded, nothing answered (recordInboundMessage). */
  const record = async (m) => {
    const unbind = bind(m);
    try {
      return await recordInboundMessage(shaped(m), "t1", routed, over.carrier ?? null, ports);
    } finally {
      unbind();
    }
  };
  const run = async (m, extra = {}, resume = false) => {
    const unbind = bind(m);
    const before = {
      handled: seen.handled.length,
      escalations: seen.escalations.length,
      underHold: seen.underHold.length,
      processed: seen.processed,
    };
    const all = { ...ports, ...extra };
    const out = await (
      resume
        ? resumeInbound(shaped(m), "t1", routed, over.carrier ?? null, all)
        : handleInbound({ inbound: shaped(m), carrier: over.carrier ?? null }, "t1", routed, !!over.isEnvDefault, all)
    ).finally(unbind);
    // The rule behind every stamp (contracts HANDLED_OUTCOMES), in both directions, over EVERY message the world
    // processed or escalated for: it carries a stamp, one of the four words, and the stamp is a handoff exactly when an
    // escalation LANDED for it (a write the database refused asked nobody). A way out that marks the message or asks a
    // person and says nothing fails here, as one that says the wrong word does. A message the world neither processed nor
    // escalated for (a redelivery, a failed send whose escalation was refused) is owed no stamp. A rejection
    // (IngestFailed) propagates before the check.
    // A message under a hold already open landed on it (00454): a person was asked, by the hold that was open.
    const asked = seen.escalations.length > before.escalations || seen.underHold.length > before.underHold;
    const marked = seen.processed > before.processed;
    const stamps = seen.handled.slice(before.handled);
    if (asked || marked) {
      assert.ok(stamps.length > 0, `${m.id}: processed or escalated, and it never said what the message became`);
    }
    assert.ok(stamps.length <= 1, `${m.id}: said what the message became more than once`);
    for (const s of stamps) {
      assert.ok(HANDLED_OUTCOMES.includes(s.how), `${m.id}: a way out that says nothing of what the message became`);
      assert.equal(
        s.how === "handoff",
        asked,
        `${m.id}: handed to a person exactly when an escalation landed (stamped ${s.how})`,
      );
    }
    return out;
  };
  const thread = () => structuredClone(memory);
  return { run, record, seen, thread };
}
