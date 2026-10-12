/**
 * The WhatsApp handler, executed.
 *
 * handleInbound runs for real here: its pure gates as themselves, its world
 * (the database, the memory, the tenant runtime, the sink, the alerts, the
 * pager, the model) as fakes handed in through ports.ts. What is asserted is
 * what a customer, an owner and the platform would see: what left on the wire
 * and labelled how, what was escalated, who was told, and what the memory
 * holds afterwards.
 *
 * The memory below is modelled the way Postgres holds it, because that is the
 * only memory there is: `ingest` records the customer's words and answers
 * `is_new` (which IS the redelivery gate), the sink's `deliver` is what makes
 * a reply part of the history, `pause` is what takes the receptionist out of
 * the thread, and `thread` reads all three back. Nothing the handler mutates
 * in hand is remembered — it reports, and the rows are the record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  optInConfirmation,
  formatPhoneDisplay,
  HANDLED_OUTCOMES,
  HOUR_MS,
  STOP_ENDED_OFFERS_SOURCE,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleInbound, recordInboundMessage, resumeInbound } = await import(at("apps/edge/lib/whatsapp/inbound.ts"));
const { IngestFailed, pgSink } = await import(at("apps/edge/lib/whatsapp/persist.ts"));

const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";
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
const FROM = "13055550100";
const routed = {
  channelId: "c1",
  tenantId: "t1",
  kind: "whatsapp",
  externalId: "p1",
  numberE164: "+13055550199",
  credentialsRef: null,
  config: {},
};
const runtime = (over = {}) => ({
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
const text = (body, id = "wamid.1", from = FROM) => ({
  from,
  id,
  type: "text",
  timestamp: String(Math.floor(Date.now() / 1000)),
  text: { body },
});
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const ingested = (n) => ({
  message_id: "m-in",
  conversation_id: "conv1",
  contact_id: "k1",
  is_new: true,
  consent: n.optOut ? "opted_out" : "unknown",
  dnc: !!n.optOut,
  paused_until: null,
});

/**
 * A hold the database took is told from its event, once, after the commit (core SUBSCRIBERS.owner_notice, decision 0043;
 * events/an-event-is-delivered-to-its-subscriber.test.mjs); the handler tells, in its own words, only a hold it could
 * not write (`escalateAnswer: "failed"`).
 */
const FROM_ITS_EVENT = "the hold is written, so its event tells the owner, not the handler (decision 0043)";

/** The handler's world, recording everything that crosses it. */
function world(over = {}) {
  // The rows, as Postgres would hold them for this one conversation.
  const memory = { history: [], replies: [], pausedUntil: 0, textedBefore: false };
  const delivered = new Set();
  const seen = {
    sent: [],
    escalations: [],
    alerts: [],
    pages: [],
    pauses: [],
    // Asked and landed (opened, changed or refreshed); an escalation the database refused is `refused`, nobody was asked.
    refused: [],
    // Messages marked processed, and every stamp: one a way out wrote beside processed_at (`marked`), or alone (noteHandled).
    processed: 0,
    handled: [],
    queued: [],
    usage: [],
    unreachable: 0,
    media: 0,
    purposes: [],
    emails: [],
    // The line each message was ingested on (the verb's fifth argument), for the first touch the database stamps (K3).
    lines: [],
    // What each ingest was told about the visit (the verb's sixth argument): `{ jobFollows: true }` at the door of a message a job answers next.
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
        pause: async (iso) => {
          seen.pauses.push(iso);
          memory.pausedUntil = Date.parse(iso);
        },
        usage: async (u) => {
          seen.usage.push(u);
        },
        // How the write landed, as upsertEscalation answers it; "failed" is a write the database refused.
        escalate: async (reason, details) => {
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
    ports.persist.ingest = async (db, tenant, n, channel, line, visit) => {
      seen.lines.push(line ?? null);
      seen.visits.push(visit ?? null);
      const rec = await recordIngest(db, tenant, n, channel);
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
  /** The door's half of a text answered after its acknowledgement: recorded, nothing answered (recordInboundMessage). */
  const record = async (m) => {
    const unbind = bind(m);
    try {
      return await recordInboundMessage(m, "t1", routed, over.carrier ?? null, ports);
    } finally {
      unbind();
    }
  };
  const run = async (m, extra = {}, resume = false) => {
    const unbind = bind(m);
    const before = {
      handled: seen.handled.length,
      escalations: seen.escalations.length,
      processed: seen.processed,
    };
    const all = { ...ports, ...extra };
    const out = await (
      resume
        ? resumeInbound(m, "t1", routed, over.carrier ?? null, all)
        : handleInbound(m, value, "t1", routed, !!over.isEnvDefault, over.carrier ?? null, all)
    ).finally(unbind);
    // The rule behind every stamp (contracts HANDLED_OUTCOMES), in both directions, over EVERY message the world
    // processed or escalated for: it carries a stamp, one of the four words, and the stamp is a handoff exactly when an
    // escalation LANDED for it (a write the database refused asked nobody). A way out that marks the message or asks a
    // person and says nothing fails here, as one that says the wrong word does. A message the world neither processed nor
    // escalated for (a redelivery, a failed send whose escalation was refused) is owed no stamp. A rejection
    // (IngestFailed) propagates before the check.
    const asked = seen.escalations.length > before.escalations;
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

test("no model key: the workspace's greeting leaves labelled a fallback, the thread goes to a person, the platform is paged once", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(w.seen.sent, [
    { to: FROM, body: GREETING, meta: { ack: true, fallback: "no_model" }, channel: "whatsapp" },
  ]);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].reason, "brain_error");
  assert.match(w.seen.escalations[0].details, /no model key/);
  assert.match(w.seen.escalations[0].details, /do you have time tomorrow/, "the customer's words travel with it");
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.deepEqual(
    w.seen.pages.map((p) => p.key),
    ["brain_unavailable"],
  );
  // A hold the database refused is told here, by the customer's name, opening the thread it names.
  const unwritten = world({ escalateAnswer: "failed" });
  await unwritten.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(
    unwritten.seen.refused.map((e) => e.reason),
    ["brain_error"],
  );
  assert.deepEqual(
    unwritten.seen.alerts.map((a) => [a.reason, a.who, a.route]),
    [["no model", "Dana", "inbox/th-conv1"]],
  );
  assert.equal(
    unwritten.seen.alerts[0].target.slug,
    "harbor",
    "the alert's mail links the workspace's own page: its address word rides with the recipients the runtime read",
  );
  assert.equal(w.seen.pauses.length, 1, "the thread is handed over for the pause window");
  assert.equal(w.seen.processed, 1);
  const t = w.thread();
  assert.ok(t.pausedUntil > Date.now(), "the memory says a person has it");
  assert.deepEqual(
    t.history.map((h) => h.role),
    ["user", "assistant"],
  );
  // Labelled an acknowledgement, so it does not spend the cap that exists to
  // stop loops -- the same rule that keeps three photos in a morning from
  // silencing the receptionist for the day (reply-cap.test.mjs).
  assert.equal(t.replies.length, 0);
});

test("a hold that cannot be written: the veto window sends now and says so; the confidence floor sends nothing and hands the thread to a person", async () => {
  const sure = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
  const unsure = { ...sure, confidence: 0.3 };
  const model = (meta) => ({
    brain: async () => ({ generateReply: async () => ({ text: "We open at 9.", escalate: false, meta }) }),
  });
  // queueReply answers false in this world: no hold can be written.
  const veto = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } }),
  });
  await veto.run(text("when do you open?"), model(sure));
  assert.equal(veto.seen.sent.length, 1, "the veto window is a comfort: the reply goes now rather than late");
  assert.equal(veto.seen.escalations.length, 0);
  assert.equal(veto.seen.processed, 1);

  const floor = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await floor.run(text("when do you open?"), model(unsure));
  assert.equal(
    floor.seen.sent.length,
    0,
    "the floor is a policy: a reply the model is not sure of never sends itself, whatever the database did",
  );
  assert.equal(floor.seen.escalations.length, 1);
  assert.equal(floor.seen.escalations[0].reason, "policy_block");
  assert.match(floor.seen.escalations[0].details, /not sure enough/);
  assert.match(floor.seen.escalations[0].details, /could not be written/);
  assert.match(floor.seen.escalations[0].details, /when do you open/, "the customer's words travel with it");
  assert.equal(floor.seen.pauses.length, 1, "the thread is a person's for the pause window");
  assert.deepEqual(floor.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(floor.seen.processed, 1, "marked handled: the redelivery gate holds");
  const t = floor.thread();
  assert.ok(t.pausedUntil > Date.now());
  assert.deepEqual(
    t.history.map((h) => h.role),
    ["user"],
    "the unsent words are not remembered as said",
  );
  // Nor could the handoff be written: the owner is told here, that nothing was sent.
  const unwritten = world({
    escalateAnswer: "failed",
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await unwritten.run(text("when do you open?"), model(unsure));
  assert.equal(unwritten.seen.alerts.length, 1, "the owner is told");
  assert.match(unwritten.seen.alerts[0].reason, /nothing was sent/);

  // Sure enough under the same floor: the reply goes (the hold was never asked for).
  const fine = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await fine.run(text("when do you open?"), model(sure));
  assert.equal(fine.seen.sent.length, 1);
});

test("the same customer's next text inside the pause is recorded and not answered", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  assert.equal(w.seen.sent.length, 1, "nothing more left");
  assert.equal(w.seen.escalations.length, 1, "no second escalation");
  assert.equal(w.seen.processed, 2, "but the message is handled");
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user", "assistant", "user"],
    "and remembered",
  );
});

test("a redelivered message id is a duplicate: nothing happens twice", async () => {
  const w = world();
  await w.run(text("hi", "wamid.9"));
  await w.run(text("hi", "wamid.9"));
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.escalations.length, 1);
});

test("a text answered after its acknowledgement: the door records it and says nothing, and its job answers it once", async () => {
  const w = world();
  const m = text("hi, do you have time tomorrow?", "wamid.r1");
  const ing = await w.record(m);
  assert.equal(ing?.message_id, "m-in", "the door holds the row its job will name");
  assert.deepEqual(
    [w.seen.sent, w.seen.escalations, w.seen.processed],
    [[], [], 0],
    "recorded, and nothing answered, asked or stamped",
  );
  assert.deepEqual(
    w.thread().history.map((h) => h.content),
    ["hi, do you have time tomorrow?"],
    "the words are on record before the door answers Twilio",
  );

  await w.run(m, {}, true);
  assert.deepEqual(
    w.seen.sent.map((s) => s.body),
    [GREETING],
    "its job answers it, though its ingest is a redelivery",
  );
  assert.equal(w.seen.escalations.length, 1);

  // Claimed again after it finished (its runner died before the ledger heard): the message is processed, so nothing.
  await w.run(m, {}, true);
  assert.equal(w.seen.sent.length, 1, "processed is answered, and never twice");
  // And a redelivery that is not its job is the duplicate it always was.
  await w.run(m);
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.escalations.length, 1);
});

test("a text's job claimed again after its runner died mid-turn: a reply already names the message, so it says nothing twice, asks nobody, and leaves the stamp to the deadman sweep", async () => {
  const asked = [];
  const w = world({
    answered: async (_db, tenant, ing) => {
      asked.push([tenant, ing.message_id]);
      return true;
    },
  });
  const m = text("are you open saturday?", "wamid.r2");
  await w.record(m);
  await w.run(m, {}, true);
  assert.deepEqual(asked, [["t1", "m-in"]], "asked of the message the door recorded, before anything else");
  assert.deepEqual([w.seen.sent, w.seen.escalations], [[], []], "nothing said, nobody asked");
  assert.deepEqual(
    [w.seen.handled, w.seen.processed],
    [[], 0],
    "and no stamp guessed: whatever the reply became (left, waiting, withdrawn, refused), the sweep finds it and stamps",
  );

  // An adapter with no such mark is nothing known to have answered.
  const none = world();
  const e = text("and monday?", "wamid.r4");
  await none.record(e);
  await none.run(e, {}, true);
  assert.equal(none.seen.sent.length, 1, "no mark to read: answered");
});

test("a short code is a sender, never a person: recorded, marked handled, nothing sent", async () => {
  const w = world();
  await w.run(text("Your code is 482913", "wamid.3", "12345"));
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.unreachable, 1);
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.escalations.length, 0);
});

test("a one-time code from an ordinary number is a service, never a person: recorded, marked handled, nothing sent; a person's own code is answered", async () => {
  // 11 Oct 2026: verification codes from long numbers were answered with a sales reply.
  const codes = [
    "Your verification code is 482913. It expires in 10 minutes.",
    "G-482913 is your Google verification code.",
    "482913 is your login code. Do not share this code with anyone.",
    "Use 4829 to sign in to your account.",
  ];
  for (const [i, body] of codes.entries()) {
    const w = world();
    await w.run(text(body, `wamid.otp${i}`));
    assert.equal(w.seen.sent.length, 0, body);
    assert.equal(w.seen.processed, 1, `${body}: recorded and handled`);
    assert.equal(w.seen.escalations.length, 0, body);
    assert.equal(w.seen.unreachable, 0, `${body}: the sender can be written to; it is the words that are a service's`);
  }
  // A person's text with a number in it is theirs: a door code, a booking reference.
  const meta = { intent: "booking", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
  for (const [i, body] of [
    "The gate code is 4829, see you Tuesday",
    "My confirmation code is 482913, can I move it?",
    // The review of 11 Oct 2026: each of these was set aside by the first draft, which took any number near a word.
    "I need a one time deep clean for my 1200 sq ft apartment",
    "one-time move, about 1800 sq ft",
    "Can I pay a security deposit of 2500",
    "I can't log in to your booking page, error 5003",
    "Our building security closes at 5, I'm in apartment 1204",
  ].entries()) {
    let asked = 0;
    const w = world({ env: { modelKey: "k" } });
    await w.run(text(body, `wamid.person${i}`), {
      brain: async () => ({ generateReply: async () => ((asked += 1), { text: "Thanks!", escalate: false, meta }) }),
    });
    assert.equal(asked, 1, `${body}: the receptionist was asked`);
  }
});

test("an ingest the database refuses is not swallowed: IngestFailed surfaces and a copy reaches the mailbox", async () => {
  const w = world({
    ingest: async () => {
      throw new IngestFailed("connection reset");
    },
  });
  await assert.rejects(
    () => w.run(text("hi")),
    (e) => e instanceof IngestFailed,
  );
  assert.equal(w.seen.alerts.length, 1);
  assert.equal(w.seen.alerts[0].reason, "message not recorded");
  assert.equal(w.seen.sent.length, 0, "nothing is said to a customer whose words were not kept");
});

test("a message the database kept, whose yes did not land, still surfaces as IngestFailed but is not mailed as lost", async () => {
  // db AnswerNotKept, as the edge's pgIngest passes it on (kept): the provider sends the message again, or the job is tried
  // again, and either visit writes the yes. The words are on record, so no copy goes to the workspace saying they are not.
  const w = world({
    ingest: async () => {
      throw new IngestFailed("marketing_consent_write_failed: connection reset", true);
    },
  });
  await assert.rejects(
    () => w.run(text("YES OFFERS")),
    (e) => e instanceof IngestFailed && e.kept === true,
  );
  assert.deepEqual(w.seen.alerts, [], "nothing says the words were lost: they were not");
  assert.equal(w.seen.sent.length, 0, "and nothing is said to a customer whose yes is not yet kept");
});

test("only the door of a message a job answers next leaves a failed yes to that job: the job's visit and the webhook's raise it", async () => {
  const w = world();
  await w.record(text("YES OFFERS", "wamid.job-1"));
  assert.deepEqual(w.seen.visits, [{ jobFollows: true }], "the door that schedules the answer says so");
  await w.run(text("YES OFFERS", "wamid.job-1"), {}, true);
  assert.deepEqual(
    w.seen.visits.at(-1),
    null,
    "the job that answers it asks for nothing: a yes that fails there is raised",
  );
  await w.run(text("YES OFFERS", "wamid.direct-1"));
  assert.deepEqual(w.seen.visits.at(-1), null, "and so does a webhook that answers in its own request");
});

test("STOP records the opt-out, opens no hold, tells nobody itself, answers nothing, and keeps no second copy of the answer", async () => {
  // A STOP is news, not a wait (decision 0048): the answer is the consent its ingest wrote with its event, the owner is told
  // once on the bell from that event (SUBSCRIBERS.consent_notice), and nothing is asked of a person who can do nothing.
  const w = world();
  await w.run(text("STOP"));
  assert.equal(w.seen.sent.length, 0);
  assert.deepEqual(w.seen.escalations, [], "no hold: nothing in Needs you, Today's queue or the badge");
  assert.deepEqual(w.seen.alerts, [], "and no handoff mail or push: the consent event is what tells the owner");
  assert.equal(w.seen.processed, 1);
  // The answer lives in `contacts.consent` and nowhere else. It used to be
  // cached on the Blob thread as well, for the case where Postgres did not
  // answer -- which cost a read and a write in front of every brain call and
  // is a case that can no longer arise: a thread that cannot be read never
  // reaches the consent gate, it goes to a person.
  assert.equal("optedOut" in w.thread(), false, "no second copy to go stale");
  assert.deepEqual(
    w.thread().history.map((h) => h.content),
    ["STOP"],
    "the words are on record; nothing was said back",
  );
});

test("a memory that cannot be read hands the conversation to a person, and answers nothing", async () => {
  // THE BEHAVIOUR WITH NOWHERE TO FALL BACK TO. Postgres is the only memory,
  // so a read that did not answer leaves the receptionist not knowing whether
  // a human has taken this thread over, what was already said, or how many
  // replies have gone out today. Every gate below would be answering from an
  // invented empty history -- it would greet a customer mid-conversation and
  // talk over the person handling it. So it does not answer at all.
  //
  // The customer's message is already on record: the ingest runs first, and
  // that is what makes this safe rather than a loss.
  const w = world({ unreadable: true });
  await w.run(text("hi, is my 3pm still on?"));
  assert.equal(w.seen.sent.length, 0, "nothing is said from a history nobody could read");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["state_unavailable"],
  );
  assert.match(w.seen.escalations[0].details, /could not read this thread's history/);
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(w.seen.processed, 1, "marked handled, so a redelivery does not open it twice");
  assert.equal(w.seen.pauses.length, 0, "the receptionist did not speak, so it claims no pause");
});

test("a workspace on ask holds every message for a person and says why", async () => {
  const w = world({ rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await w.run(text("can I book Friday?"));
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].reason, "policy_block");
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(w.seen.pages.length, 0, "a workspace's own setting is not the platform's condition");
});

test("START is confirmed in the campaign's own words without the model, and YES OFFERS confirms offers and nothing else", async () => {
  // Every recurring program owes the person who opted in an immediate
  // confirmation, however the yes was given. The words are the ones the
  // campaign files as its opt-in message; which question was answered decides
  // which confirmation goes, and neither confirms the other -- what the live
  // campaign was refused for three times.
  const w = world();
  await w.run(text("START"));
  const visit = optInConfirmation("Harbor Nails", "conversational");
  assert.deepEqual(w.seen.sent, [
    { to: FROM, body: visit, meta: { ack: true, confirmation: "conversational" }, channel: "whatsapp" },
  ]);
  assert.match(visit, /^Harbor Nails: /);
  assert.match(visit, /appointments/);
  assert.doesNotMatch(visit, /offer/i);
  assert.equal(w.seen.escalations.length, 0, "a yes is not a problem for a person");
  assert.equal(w.seen.processed, 1);
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user", "assistant"],
    "and the memory holds it",
  );

  await w.run(text("YES OFFERS", "wamid.2"));
  const offers = optInConfirmation("Harbor Nails", "marketing");
  assert.equal(w.seen.sent.length, 2);
  assert.equal(w.seen.sent[1].body, offers);
  assert.deepEqual(w.seen.sent[1].meta, { ack: true, confirmation: "marketing" });
  assert.match(offers, /offers and news/);
  assert.doesNotMatch(offers, /appointment/i);
});

test("YES OFFERS is not the way back in from a STOP: an opted-out person gets nothing, and START is", async () => {
  // One word opening both programs is what the carriers refuse (30913); the way
  // back in is START, as their own reply to a STOP says.
  const w = world({ ingest: async (_db, _tenant, n) => ({ ...ingested(n), consent: "opted_out", dnc: true }) });
  await w.run(text("YES OFFERS"));
  assert.equal(w.seen.sent.length, 0);
  await w.run(text("START", "wamid.2"));
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.sent[0].body, optInConfirmation("Harbor Nails", "conversational"));
});

/**
 * The person's consent as the database keeps it since 00361: a message's STOP or START is written by the take that
 * keeps it, and a message taken in again (a text's answer job, a redelivery) reads the consent that stands. The door
 * refuses whatever is sent to a person who said STOP, as deliver does.
 */
function consentOnRecord() {
  const record = { consent: "unknown", dnc: false };
  const kept = new Set();
  return {
    record,
    ingest: async (_db, _tenant, n) => {
      if (!kept.has(n.messageId)) {
        kept.add(n.messageId);
        if (n.optOut) Object.assign(record, { consent: "opted_out", dnc: true });
        if (n.optIn) Object.assign(record, { consent: "opted_in", dnc: false });
      }
      return { ...ingested(n), ...record };
    },
    get delivered() {
      return record.consent === "opted_out" ? { outcome: "refused", reason: "opted_out", messageId: null } : undefined;
    },
  };
}

test("a START whose answer is taken up after the person said STOP is held by the STOP: nothing confirmed, nobody told they said yes", async () => {
  const kept = consentOnRecord();
  const w = world(kept);
  const start = text("START", "wamid.y1");
  await w.record(start);
  await w.run(text("STOP", "wamid.y2"));
  assert.deepEqual(w.seen.escalations, [], "a STOP opens no hold (decision 0048)");
  // The START's job, run late: its ingest is a redelivery, and the record holds the STOP that came after it.
  await w.run(start, {}, true);
  assert.deepEqual(w.seen.sent, [], "no confirmation of a yes the STOP since took back");
  assert.deepEqual(w.seen.escalations, [], "and nobody is told the customer said yes and was not confirmed");
  assert.deepEqual(w.seen.alerts, [], "the STOP's one notice is the consent event's, on the bell");
  assert.equal(kept.record.consent, "opted_out", "the STOP stands");
});

test("a START answered by its job, taken in again with the yes its door wrote on record, is confirmed as a new START is", async () => {
  const visit = optInConfirmation("Harbor Nails", "conversational");
  const later = world(consentOnRecord());
  const start = text("START", "wamid.y3");
  await later.record(start);
  await later.run(start, {}, true);
  assert.deepEqual(
    later.seen.sent.map((s) => [s.body, s.meta]),
    [[visit, { ack: true, confirmation: "conversational" }]],
  );
  assert.equal(later.seen.escalations.length, 0);
  // And a START taken in once, after a STOP, is the way back it always was.
  const back = world(consentOnRecord());
  await back.run(text("STOP", "wamid.y4"));
  await back.run(text("START", "wamid.y5"));
  assert.deepEqual(
    back.seen.sent.map((s) => s.body),
    [visit],
  );
});

test("a YES OFFERS answered after the person took back their yes to offers is held by that no: nothing confirmed, nobody told they said yes", async () => {
  // Its yes was written when the door kept it (00361); the person then said no more offers, and the answer's job, run
  // late, takes the message in again. The door would refuse the confirmation (no_marketing_consent), and a person used
  // to be told the customer said yes and was never confirmed, when the customer's last word was no.
  const offers = (marketingConsent) => ({
    leads: {
      read: async () => ({ name: null }),
      personReplyMode: async () => null,
      offersAnswer: async () => ({ marketingConsent, marketingConsentSource: null }),
    },
  });
  const yes = text("YES OFFERS", "wamid.o1");
  const takenBack = world(consentOnRecord());
  await takenBack.record(yes);
  await takenBack.run(yes, offers("opted_out"), true);
  assert.deepEqual(takenBack.seen.sent, [], "no confirmation of a yes the person since took back");
  assert.equal(takenBack.seen.escalations.length, 0, "and nobody is asked to send it by hand");
  // The same answer while the yes stands is confirmed in the program's words, as a new YES OFFERS is.
  const stands = world(consentOnRecord());
  await stands.record(yes);
  await stands.run(yes, offers("opted_in"), true);
  assert.deepEqual(
    stands.seen.sent.map((m) => m.body),
    [optInConfirmation("Harbor Nails", "marketing")],
  );
  // A YES OFFERS taken in once is confirmed whatever an earlier answer said: it is the person's newest word.
  const fresh = world(consentOnRecord());
  await fresh.run(text("YES OFFERS", "wamid.o2"), offers("opted_out"));
  assert.deepEqual(
    fresh.seen.sent.map((m) => m.body),
    [optInConfirmation("Harbor Nails", "marketing")],
  );
});

test("a START does not bring back a yes to offers a STOP ended: WhatsApp says how to get them again, a text says the filed words alone", async () => {
  // A STOP ends the yes to offers (00323), and a START is a yes to messages about their visit and nothing more. The
  // person is told once, after the filed words, on WhatsApp alone: the texting line's confirmation is the campaign's
  // filed opt-in message word for word, and offers are never offered there (30896).
  const filed = optInConfirmation("Harbor Nails", "conversational");
  const ended = { marketingConsent: "unknown", marketingConsentSource: STOP_ENDED_OFFERS_SOURCE };
  // The gate reads one row, by the id the ingest answered: never the whole account of the person the reply reads.
  const asked = [];
  const leads = (answer) => ({
    leads: {
      read: async () => {
        throw new Error("the START gate does not read the lead context");
      },
      personReplyMode: async () => null,
      offersAnswer: async (_db, tenant, contact) => {
        asked.push([tenant, contact]);
        return answer();
      },
    },
  });

  const w = world();
  await w.run(
    text("START"),
    leads(async () => ended),
  );
  assert.deepEqual(w.seen.sent, [
    {
      to: FROM,
      body: `${filed} Offers and news stay off. Reply YES OFFERS to get them here again.`,
      meta: { ack: true, confirmation: "conversational" },
      channel: "whatsapp",
    },
  ]);
  assert.equal(asked.length, 1, "one read");
  assert.equal(asked[0][1], "k1", "by the person the ingest named");

  // By text, the filed words and not one more.
  const sms = world({
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
      consent: null,
    },
  });
  await sms.run(
    text("START"),
    leads(async () => ended),
  );
  assert.equal(sms.seen.sent.length, 1);
  assert.equal(sms.seen.sent[0].body, filed);
  assert.equal(asked.length, 1, "and a text does not even ask");

  // Nobody is asked a second time, and a no is not argued with: only a yes a stop ended is spoken of.
  for (const lead of [
    { marketingConsent: "unknown", marketingConsentSource: null },
    { marketingConsent: "unknown", marketingConsentSource: "operator" },
    { marketingConsent: "opted_out", marketingConsentSource: "customer_message" },
    // A no WhatsApp reported, and a yes that stands (one given again since the stop).
    { marketingConsent: "opted_out", marketingConsentSource: "whatsapp" },
    { marketingConsent: "opted_in", marketingConsentSource: "customer_message" },
    // Nobody by that id.
    null,
  ]) {
    const other = world();
    await other.run(
      text("START"),
      leads(async () => lead),
    );
    assert.equal(other.seen.sent[0].body, filed, JSON.stringify(lead));
  }

  // A row that cannot be read costs the sentence, never the confirmation.
  const unread = world();
  await unread.run(
    text("START"),
    leads(async () => {
      throw new Error("the database is away");
    }),
  );
  assert.equal(unread.seen.sent.length, 1);
  assert.equal(unread.seen.sent[0].body, filed);
  assert.equal(unread.seen.escalations.length, 0);
});

/* -------------------------------------------------------------------------
 * What the owner is told, and whether it is true.
 * ---------------------------------------------------------------------- */

test("a handoff names the wire the customer wrote on, and promises a pause only where one happened", async () => {
  // The email hardcoded "WhatsApp" and hardcoded the pause, so an owner with
  // both wires connected opened the wrong app, and one told "the receptionist
  // is paused on this thread for 24h" by a branch that paused nothing replied
  // at their leisure and was talked over by the bot's next reply. These are the handler's own words, for a hold the
  // database refused; a written one is told from its event, whose pause line reads the thread's own pause.
  const held = world({ escalateAnswer: "failed", rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await held.run(text("can I book Friday?"));
  assert.equal(held.seen.alerts.length, 1);
  assert.equal(held.seen.alerts[0].pauseHours, null, "'ask' never pauses the thread, so the email must not say it did");
  assert.equal(held.seen.alerts[0].channel, "whatsapp");
  assert.equal(held.seen.pauses.length, 0);

  // The escalating reply DOES pause, and says so.
  const paged = world({ escalateAnswer: "failed" });
  await paged.run(text("hi"));
  assert.equal(paged.seen.alerts[0].pauseHours, 24);
  assert.equal(paged.seen.pauses.length, 1);

  const sms = world({
    escalateAnswer: "failed",
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
      consent: null,
    },
  });
  await sms.run(text("are you open?"));
  assert.equal(
    sms.seen.alerts[0].channel,
    "sms",
    "a text is not a WhatsApp message, and the owner opens the thread this names",
  );
});

test("a redelivered pin drop escalates and emails once, not once per redelivery", async () => {
  // Meta redelivers undelivered webhooks with backoff for days. The dedupe gate
  // used to sit BELOW this branch, so on the memory path every redelivery
  // re-opened the handoff and sent the owner another email.
  const w = world();
  const pin = {
    from: FROM,
    id: "wamid.loc",
    type: "location",
    timestamp: String(Math.floor(Date.now() / 1000)),
    location: { latitude: 25.7, longitude: -80.2 },
  };
  await w.run(pin);
  await w.run(pin);
  assert.equal(w.seen.escalations.length, 1, "one escalation for one pin drop");
  assert.deepEqual(w.seen.alerts, [], `and its one notice: ${FROM_ITS_EVENT}`);
  assert.equal(w.seen.sent.length, 0, "a pin drop is readable: no apology");
});

test("a STOP, redelivered, opens no handoff at all: it is news told once from its consent event, never a wait", async () => {
  const w = world();
  await w.run(text("STOP"));
  await w.run(text("STOP"));
  assert.deepEqual(w.seen.escalations, []);
  assert.deepEqual(w.seen.alerts, []);
  assert.equal(w.seen.sent.length, 0, "and nothing is said back, however often it is delivered");
});

test("a thumbs-up or a system notice is kept and handled, and nothing is said, escalated, paused or downloaded", async () => {
  // Nothing was asked of us. A thumbs-up on the receptionist's reply used to be answered "sorry, I can't read that",
  // then the receptionist went silent on that customer for a day, an escalation opened and the owner was emailed. The
  // kinds are asked before the unreadable branch (gates.ts, then unreadable.ts), and either order failing shows here:
  // a thumbs-up carries its emoji as words, so it would be answered, and one without an emoji would be apologised for.
  const at = String(Math.floor(Date.now() / 1000));
  for (const m of [
    {
      from: FROM,
      id: "wamid.like",
      type: "reaction",
      timestamp: at,
      reaction: { message_id: "wamid.1", emoji: "\u{1F44D}" },
    },
    { from: FROM, id: "wamid.unlike", type: "reaction", timestamp: at, reaction: { message_id: "wamid.1" } },
    {
      from: FROM,
      id: "wamid.system",
      type: "system",
      timestamp: at,
      system: { body: "Dana changed their number", type: "customer_changed_number" },
    },
  ]) {
    const w = world();
    await w.run(m);
    assert.equal(w.seen.sent.length, 0, `${m.id}: nothing is said`);
    assert.equal(w.seen.escalations.length, 0, `${m.id}: nobody is asked`);
    assert.equal(w.seen.alerts.length, 0, `${m.id}: nobody is told`);
    assert.equal(w.seen.pauses.length, 0, `${m.id}: the receptionist is not muted`);
    assert.equal(w.seen.media, 0, `${m.id}: nothing is downloaded`);
    assert.equal(w.seen.processed, 1, `${m.id}: and it is handled`);
  }
});

test("a person set to Never who sends a voice note hears nothing back, and the thread still reaches a person", async () => {
  // The person's own mode is looked up once, before the first branch that can speak. It sat below the non-text
  // branch, so a Never person who sent a photo got the canned "I can't read attachments" text from the receptionist
  // that was told to stay out.
  const w = world();
  const lookups = [];
  await w.run(
    {
      from: FROM,
      id: "wamid.never",
      type: "audio",
      timestamp: String(Math.floor(Date.now() / 1000)),
      audio: { id: "a-never", mime_type: "audio/ogg" },
    },
    {
      leads: {
        read: async () => ({ name: null }),
        personReplyMode: async (...args) => {
          lookups.push(args);
          return "never";
        },
      },
    },
  );
  assert.equal(lookups.length, 1, "exactly one lookup");
  assert.equal(w.seen.sent.length, 0, "no acknowledgement from the receptionist that was told to stay out");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["non_text"],
  );
  assert.match(w.seen.escalations[0].details, /this person is set to 'never'/);
  assert.deepEqual(w.seen.alerts, [], `a person is told: ${FROM_ITS_EVENT}`);
  assert.equal(w.seen.pauses.length, 0, "nothing was said, so nothing is paused");
  assert.equal(w.seen.processed, 1);
});

test("an acknowledgement that did not send neither pauses the thread nor is reported as sent", async () => {
  // The outcome used to be discarded: a refusal or a failure at the wire still
  // paused the receptionist for a day and still told the owner the customer had
  // been acknowledged.
  const w = world({
    escalateAnswer: "failed",
    delivered: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: null, messageId: null },
  });
  await w.run({
    from: FROM,
    id: "wamid.vn",
    type: "audio",
    timestamp: String(Math.floor(Date.now() / 1000)),
    audio: { id: "a1", mime_type: "audio/ogg" },
  });
  assert.equal(w.seen.sent.length, 1, "it was attempted");
  assert.equal(w.seen.pauses.length, 0, "but nothing reached the customer, so the receptionist is not muted");
  assert.equal(w.thread().pausedUntil, 0);
  assert.equal(w.seen.alerts[0].pauseHours, null);
  assert.match(w.seen.alerts[0].botText, /could not be sent/);
  assert.match(w.seen.refused[0].details, /could not be sent/);
});

test("an opt-in confirmation that did not send is not remembered as said, and somebody is told", async () => {
  // The turn was pushed into the memory and persisted BEFORE the send, and the
  // outcome then dropped — so the bot believed it had named the program, the
  // frequency, the rates, HELP and STOP to somebody who heard nothing.
  const w = world({
    escalateAnswer: "failed",
    delivered: { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null },
  });
  await w.run(text("START"));
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user"],
    "only what the customer actually said",
  );
  assert.deepEqual(
    w.seen.refused.map((e) => e.reason),
    ["send_failed"],
  );
  assert.equal(w.seen.alerts[0].reason, "opt-in not confirmed", "a hold the database refused is told here");
  assert.equal(w.seen.processed, 1, "the message is still handled");
});

test("a workspace whose settings could not be READ is not told it has no persona", async () => {
  // loadTenantRuntime's failed read carries loadFailed and no brain, so an outage
  // read as "No brain profile configured" and sent the owner to Settings to fix
  // a database blip.
  const w = world({ rt: runtime({ brain: null, policy: {}, loadFailed: true }) });
  await w.run(text("hi"));
  assert.equal(w.seen.escalations.length, 1);
  assert.match(w.seen.escalations[0].details, /could not be reached/);
  assert.doesNotMatch(w.seen.escalations[0].details, /No brain profile configured/);
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  // An outage that refuses the hold as well is told here, in the same words.
  const unwritten = world({ escalateAnswer: "failed", rt: runtime({ brain: null, policy: {}, loadFailed: true }) });
  await unwritten.run(text("hi"));
  assert.equal(unwritten.seen.alerts[0].reason, "the workspace's settings could not be reached");
});

test("the rate cap, the budget and a paused workspace all keep the customer's words", async () => {
  // The thread pause above them pushed the turn; these three saved the thread
  // without it, so when the cap reset the receptionist answered the message
  // before the one it never saw.
  const capped = world({ rt: runtime({ policy: { reply: { mode: "auto", limits: { max_replies_day: 0 } } } }) });
  await capped.run(text("actually make it 3pm, not 2pm"));
  assert.deepEqual(
    capped.seen.escalations.map((e) => e.reason),
    ["rate_cap"],
  );
  assert.equal(capped.seen.sent.length, 0);
  assert.ok(
    capped.thread().history.some((h) => h.content === "actually make it 3pm, not 2pm"),
    "the correction has to survive the cap, or tomorrow's reply confirms 2pm",
  );

  const paused = world({ rt: runtime({ paused: true }) });
  await paused.run(text("are you open?"));
  assert.deepEqual(
    paused.seen.escalations.map((e) => e.reason),
    ["paused"],
  );
  assert.ok(paused.thread().history.some((h) => h.content === "are you open?"));
});

test("the pilot allowlist matches however the number is written", async () => {
  // Meta delivers `from` as bare digits and the natural way to write the env
  // var is the E.164 spelling with its "+", so a raw string compare matched
  // nothing — including the tester the list was written for, whose messages
  // were persisted, marked handled and never answered.
  const spelt = world({ isEnvDefault: true, env: { allowlist: `+${FROM}` } });
  await spelt.run(text("hi"));
  assert.equal(spelt.seen.sent.length, 1, "the allowlisted tester is answered whichever spelling the env var uses");

  const other = world({ isEnvDefault: true, env: { allowlist: "+13055550999" } });
  await other.run(text("hi"));
  assert.equal(other.seen.sent.length, 0, "and the list still gates everyone else");
  assert.equal(other.seen.processed, 1, "recorded and marked handled, as before");
});

const photo = (id = "wamid.pic", caption = undefined) => ({
  from: FROM,
  id,
  type: "image",
  timestamp: String(Math.floor(Date.now() / 1000)),
  image: { id: "media-1", mime_type: "image/jpeg", ...(caption ? { caption } : {}) },
});

test("a workspace that will not answer never pays to download the photo", async () => {
  // The fetch ran above the gates: an 8s metadata call, up to 25MB with a 15s
  // timeout, a storage upload and a base64 of the whole buffer — paid in full
  // and then discarded by the branch that discovered billing had stopped.
  const vision = { features: { vision: true } };
  const paused = world({ rt: runtime({ ...vision, paused: true }) });
  await paused.run(photo());
  assert.deepEqual(
    paused.seen.escalations.map((e) => e.reason),
    ["paused"],
  );
  assert.equal(paused.seen.media, 0, "nothing was downloaded for a reply that was never going to happen");

  const capped = world({
    rt: runtime({ ...vision, policy: { reply: { mode: "auto", limits: { max_replies_day: 0 } } } }),
  });
  await capped.run(photo());
  assert.deepEqual(
    capped.seen.escalations.map((e) => e.reason),
    ["rate_cap"],
  );
  assert.equal(capped.seen.media, 0);

  // And a workspace that WILL answer still gets its bytes.
  const live = world({ rt: runtime(vision) });
  await live.run(photo());
  assert.equal(live.seen.media, 1);
});

test("a photo the receptionist meant to read and could not is handed over, never answered from the caption", async () => {
  // The fetch used to sit above the routing, so a failed one fell into the
  // unreadable branch through `!photo`. Below the gates that accident is gone
  // and the handoff has to be said out loud — otherwise the model answers a
  // question about a picture nobody saw.
  const w = world({ rt: runtime({ features: { vision: true } }), media: null });
  await w.run(photo("wamid.pic2", "is this shade too dark?"));
  assert.equal(w.seen.media, 1, "it was attempted");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["non_text"],
  );
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.sent.length, 1, "only the canned acknowledgement");
  assert.deepEqual(w.seen.sent[0].meta, { ack: true });
});

test("an unreadable attachment still reaches storage, and a redelivery of it does not escalate twice", async () => {
  const w = world();
  const note = {
    from: FROM,
    id: "wamid.vn2",
    type: "audio",
    timestamp: String(Math.floor(Date.now() / 1000)),
    audio: { id: "a2", mime_type: "audio/ogg" },
  };
  await w.run(note);
  assert.equal(w.seen.media, 1, "the attachment is stored even though nobody may look at it");
  await w.run(note);
  assert.equal(w.seen.escalations.length, 1);
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
});

test("an old voice note or sticker Meta sent again after an outage is a person's: no acknowledgement and no pause, handed over as too late, its attachment still kept", async () => {
  // The gate for what the receptionist will not read ran before the message's age, so an attachment hours old got the
  // canned acknowledgement and paused the thread: an automated reply out of nowhere, past the two-hour horizon.
  const at = (hoursAgo) => String(Math.floor((Date.now() - hoursAgo * HOUR_MS) / 1000));
  for (const [name, m] of [
    ["a voice note", { type: "audio", audio: { id: "a-old", mime_type: "audio/ogg" } }],
    ["a sticker", { type: "sticker", sticker: { id: "s-old", mime_type: "image/webp" } }],
  ]) {
    const w = world({ escalateAnswer: "failed" });
    await w.run({ from: FROM, id: `wamid.old-${m.type}`, timestamp: at(3), ...m });
    assert.deepEqual(w.seen.sent, [], `${name}: REGRESSION, the canned acknowledgement went out three hours late`);
    assert.deepEqual([w.seen.pauses, w.thread().pausedUntil], [[], 0], `${name}: nothing was said, so nothing paused`);
    assert.deepEqual(
      w.seen.refused.map((e) => e.reason),
      ["stale"],
      name,
    );
    assert.match(w.seen.refused[0].details, /minutes late — too old to answer automatically/, name);
    assert.deepEqual(
      w.seen.alerts.map((a) => [a.userText, a.botText]),
      [[`[${m.type}]`, "(no reply sent — arrived too late to answer automatically)"]],
      `${name}: a person is told what it was, here, since the database refused the hold`,
    );
    assert.equal(w.seen.media, 1, `${name}: kept for the person it is handed to`);
    assert.equal(w.seen.processed, 1, name);
  }

  // Late but inside the horizon, the customer is still in the conversation: acknowledged and handed over, as always.
  const w = world();
  await w.run({ from: FROM, id: "wamid.late-vn", type: "audio", timestamp: at(0.5), audio: { id: "a-late" } });
  assert.equal(w.seen.sent.length, 1, "the acknowledgement");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["non_text"],
  );
  assert.equal(w.seen.pauses.length, 1);
});

test("the confirmation of a YES OFFERS names itself marketing at the door, and everything else is a reply", async () => {
  // The sink stamped every send "conversational", so the one genuinely
  // marketing message this handler writes reached the door claiming to be a
  // reply — and the two rules that exist for it, the marketing yes and offers
  // never going by text, were never asked.
  const w = world();
  await w.run(text("hi"));
  await w.run(text("START", "wamid.2"));
  await w.run(text("YES OFFERS", "wamid.3"));
  assert.deepEqual(w.seen.purposes, ["conversational", "conversational", "marketing"]);
});

test("a confirmation the door refuses reaches a person, not just the log", async () => {
  // `no_marketing_consent` is the one to expect: the OFFERS answer is recorded
  // best-effort a moment earlier and the door fails closed without it, so a
  // consent write that did not land would leave a customer subscribed to
  // nothing and told nothing.
  const w = world({
    escalateAnswer: "failed",
    delivered: { outcome: "refused", reason: "no_marketing_consent", messageId: null },
  });
  await w.run(text("YES OFFERS"));
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user"],
    "nothing is remembered as said",
  );
  assert.deepEqual(
    w.seen.refused.map((e) => e.reason),
    ["send_failed"],
  );
  assert.match(w.seen.refused[0].details, /no_marketing_consent/);
  assert.equal(w.seen.alerts[0].reason, "opt-in not confirmed", "a hold the database refused is told here");
  assert.equal(w.seen.processed, 1);
});

/* ------------------------- in the business's name, as it is now (S5) ------------------------- */

// The three messages sent when the receptionist cannot answer were written once, with the number and the booking link
// baked in. They may now name {business}, {booking link} and {phone}, each filled as the message goes out.

test("REGRESSION (S5): a voice note's acknowledgement gives the line the receptionist answers, as it is now -- the number was baked in the day the message was written", async () => {
  const LINE = "+13055550123";
  const rt = runtime({
    brain: {
      ...runtime().brain,
      fallbacks: {
        ...runtime().brain.fallbacks,
        non_text: "Thanks for your message! For anything urgent, call us at {phone}.",
      },
    },
    known: {
      workspace: { name: "Harbor Nails", timezone: null },
      channels: [{ kind: "voice", number_e164: LINE, status: "active" }],
      listing: null,
    },
  });
  const w = world({ rt });
  await w.run({
    from: FROM,
    id: "wamid.vn9",
    type: "audio",
    timestamp: String(Math.floor(Date.now() / 1000)),
    audio: { id: "a9", mime_type: "audio/ogg" },
  });
  assert.deepEqual(
    w.seen.sent.map((s) => s.body),
    [`Thanks for your message! For anything urgent, call us at ${formatPhoneDisplay(LINE)}.`],
  );
});

test("REGRESSION (S5): with no model key the greeting names the business and its booking link as they are now", async () => {
  const rt = runtime({
    brain: {
      ...runtime().brain,
      booking_link: "https://book.example/harbor",
      fallbacks: {
        ...runtime().brain.fallbacks,
        greeting: "Thanks for writing to {business}. Book at {booking link}.",
      },
    },
  });
  const w = world({ rt });
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(
    w.seen.sent.map((s) => s.body),
    ["Thanks for writing to Harbor Nails. Book at https://book.example/harbor."],
  );
});

test("REGRESSION (S5): the holding message is filled as it goes out, whether the model hands it back or fails outright", async () => {
  const rt = runtime({
    brain: {
      ...runtime().brain,
      fallbacks: { ...runtime().brain.fallbacks, error: "Sorry — {business} will reply here soon." },
    },
  });
  const handedBack = world({ rt, env: { modelKey: "k" } });
  await handedBack.run(text("are you open?"), {
    brain: async () => ({
      generateReply: async (_h, _t, _s, fallback) => ({ text: fallback, escalate: true, reason: "refusal" }),
    }),
  });
  assert.deepEqual(
    handedBack.seen.sent.map((s) => s.body),
    ["Sorry — Harbor Nails will reply here soon."],
    "handed to the model filled, so what it hands back is filled",
  );
  const failed = world({ rt, env: { modelKey: "k" } });
  await failed.run(text("are you open?", "wamid.2"), {
    brain: async () => ({
      generateReply: async () => {
        throw new Error("model down");
      },
    }),
  });
  assert.deepEqual(
    failed.seen.sent.map((s) => s.body),
    ["Sorry — Harbor Nails will reply here soon."],
  );
});

test("the writer is read without the message being answered: the reader is handed its id, which was stored first", async () => {
  // 11 Oct 2026: every writer was "Returning contact. Last in touch today." (db readLeadContext says why).
  const asked = [];
  const meta = { intent: "booking", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
  const w = world({ env: { modelKey: "k" } });
  await w.run(text("do you have anything saturday?"), {
    leads: {
      read: async (...args) => (asked.push(args.slice(2)), { name: null }),
      describe: () => "First time reaching out.",
      personReplyMode: async () => null,
    },
    brain: async () => ({ generateReply: async () => ({ text: "We do, at 10.", escalate: false, meta }) }),
  });
  assert.deepEqual(
    asked,
    [[`+${FROM}`, 1, "m-in"]],
    "the person's number, one turn, and the message the ingest stored",
  );
});

/* ------------------------------------------ one reply per thread at a time (00284, category 15) */

const sure = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
const answers = (words) => ({
  brain: async () => ({
    generateReply: async () => ({ text: words, escalate: false, meta: sure, usage: { input_tokens: 40 } }),
  }),
});
const modelWorld = (turn) => world({ env: { modelKey: "sk-test" }, turn });

test("a message whose thread's turn a newer message holds is handled and answered by that one: the model is not asked, nothing is sent", async () => {
  const claims = [];
  const w = modelWorld({
    claim: async (_db, tenant, conversation, message) => {
      claims.push([tenant, conversation, message]);
      return false;
    },
    holds: async () => {
      throw new Error("a turn that was never held is not asked again");
    },
  });
  await w.run(text("when do you open?"), {
    brain: async () => {
      throw new Error("the model must not be asked for a message a newer one answers");
    },
  });
  assert.deepEqual(claims, [["t1", "conv1", "m-in"]], "claimed for this message, in its thread");
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.escalations.length, 0, "the newer message answers both: nobody is handed a thread for this");
  assert.equal(w.seen.processed, 1, "handled, so a redelivery is the duplicate it is");
});

test("a turn a newer message took while the model was answering: the words are not sent, the tokens are counted as spent", async () => {
  const w = modelWorld({ claim: async () => true, holds: async () => false });
  await w.run(text("when do you open?"), answers("We open at 9."));
  assert.equal(w.seen.sent.length, 0, "the newer message's reply goes; this one's does not go after it");
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.usage.length, 1, "the model was asked, and says so");
  assert.equal(w.seen.usage[0].held, "superseded", "a reply that did not go out, so no first-reply milestone");
  assert.equal(w.seen.usage[0].input_tokens, 40);
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user"],
    "the unsent words are not remembered as said",
  );
});

test("a message that holds its thread's turn is answered as it always was", async () => {
  const held = [];
  const w = modelWorld({
    claim: async () => true,
    holds: async (_db, conversation, message) => {
      held.push([conversation, message]);
      return true;
    },
  });
  await w.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(held, [["conv1", "m-in"]], "asked again once the model had answered, before the words went out");
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
  );
});

test("the turn's bookkeeping never costs a reply: a claim or a check that cannot be read, or an adapter with none, is a turn held", async () => {
  const broken = modelWorld({
    claim: async () => {
      throw new Error("claim_reply_turn: connection reset");
    },
    holds: async () => {
      throw new Error("holds_reply_turn: connection reset");
    },
  });
  await broken.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(
    broken.seen.sent.map((m) => m.body),
    ["We open at 9."],
  );
  assert.equal(broken.seen.processed, 1);

  const none = modelWorld(undefined);
  await none.run(text("when do you open?"), answers("We open at 9."));
  assert.equal(none.seen.sent.length, 1);
});

test("a message with a photo the receptionist looks at takes no part in the turn: its picture is seen by its own model turn only, so a newer text does not answer for it", async () => {
  const refuses = (what) => async () => {
    throw new Error(`a photo must not ${what} the thread's turn`);
  };
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ features: { vision: true } }),
    media: { mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) },
    turn: { claim: refuses("claim"), holds: refuses("ask for") },
  });
  await w.run(photo("wamid.pic9", "is this shade too dark?"), answers("A little, yes."));
  assert.equal(w.seen.media, 1, "the picture was fetched for the model");
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["A little, yes."],
    "and answered, whoever else holds the thread",
  );
  assert.equal(w.seen.processed, 1);
});

/* ------------------------------------- what each message became (K1) -------------------------------------- */

const handledOf = (w) => w.seen.handled.map((s) => [s.how, s.intent]);
const reply = (words, meta = sure, escalate = false) => ({
  brain: async () => ({ generateReply: async () => ({ text: words, escalate, meta, usage: { input_tokens: 40 } }) }),
});
const never = {
  brain: async () => {
    throw new Error("the model must not be asked");
  },
};
const refused = { outcome: "refused", reason: "paused", messageId: null };
const failed = { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null };
const voice = (id = "wamid.vn") => ({
  from: FROM,
  id,
  type: "audio",
  timestamp: String(Math.floor(Date.now() / 1000)),
  audio: { id: "a1", mime_type: "audio/ogg" },
});
const veto = runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } });
const floor = runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } });
const onAsk = runtime({ policy: { reply: { mode: "ask", limits: {} } } });
const unsure = { ...sure, confidence: 0.3 };
// A first delivery that reached us three hours after it was sent: past the two the receptionist may still answer in.
const lateText = (id = "wamid.late") => ({
  ...text("when do you open?", id),
  timestamp: String(Math.floor((Date.now() - 3 * HOUR_MS) / 1000)),
});
// A texting line the carriers have not approved: every message on it is held for a person.
const carriersHold = {
  channel: "sms",
  send: async () => ({ ok: true, wamid: "s1", status: 200 }),
  body: (t) => t,
  held: { reason: "carriers", details: "The line is not approved for texting yet." },
  consent: null,
};
// A day's model budget of a thousand tokens, and (in the world's `tokensUsed`) more than that spent.
const overBudget = runtime({ policy: { reply: { mode: "auto", limits: { max_llm_tokens_day: 1000 } } } });

test("each way out says what the message became, and what it was about where the model read it; every outcome the set declares is reached and none it does not", async () => {
  const live = { env: { modelKey: "sk-test" } };
  const cases = [
    ["a reply that left", world(live), text("when do you open?"), reply("We open at 9."), [["ai", "hours"]]],
    [
      "a reply that left and handed over",
      world(live),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["handoff", "hours"]],
    ],
    [
      "a reply waiting out the veto window",
      world({ ...live, rt: veto, queue: true }),
      text("when do you open?"),
      reply("We open at 9."),
      [["held", "hours"]],
    ],
    [
      "a held reply that asks for a person",
      world({ ...live, rt: veto, queue: true }),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["handoff", "hours"]],
    ],
    [
      "a reply the confidence floor holds",
      world({ ...live, rt: floor, queue: true }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["held", "hours"]],
    ],
    [
      "a floor hold that could not be written",
      world({ ...live, rt: floor }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["handoff", "hours"]],
    ],
    [
      "a reply the wire refused",
      world({ ...live, delivered: refused }),
      text("when do you open?"),
      reply("We open at 9."),
      [["blocked", "hours"]],
    ],
    [
      // An escalation landed, so a person was asked: the message says so. It is NOT marked processed (the deadman finishes it).
      "a reply that could not be delivered is a handoff, and the message stays unprocessed",
      world({ ...live, delivered: failed }),
      text("when do you open?"),
      reply("We open at 9."),
      [["handoff", "hours"]],
      "unprocessed",
    ],
    ["no model key: the holding message and a person", world(), text("hi"), {}, [["handoff", null]]],
    [
      "a thumbs-up",
      world(),
      {
        from: FROM,
        id: "wamid.like",
        type: "reaction",
        timestamp: String(Math.floor(Date.now() / 1000)),
        reaction: { message_id: "wamid.1", emoji: "\u{1F44D}" },
      },
      {},
      [["blocked", null]],
    ],
    ["a short code", world(), text("Your code is 482913", "wamid.3", "12345"), {}, [["blocked", null]]],
    [
      "a sender off the pilot allowlist",
      world({ isEnvDefault: true, env: { allowlist: "+13055550999" } }),
      text("hi"),
      {},
      [["blocked", null]],
    ],
    // News, not a wait (decision 0048): nobody is asked, so it is not a handoff.
    ["STOP", world(), text("STOP"), {}, [["blocked", null]]],
    ["a yes, confirmed", world(), text("START"), {}, [["ai", null]]],
    ["a yes whose confirmation did not go", world({ delivered: failed }), text("START"), {}, [["handoff", null]]],
    ["a workspace on ask", world({ rt: onAsk }), text("can I book Friday?"), {}, [["handoff", null]]],
    ["a voice note, acknowledged and handed over", world(), voice(), {}, [["handoff", null]]],
    [
      "a photo it meant to read and could not",
      world({ rt: runtime({ features: { vision: true } }), media: null }),
      photo("wamid.pic2", "is this shade too dark?"),
      {},
      [["handoff", null]],
    ],
    [
      "the thread's turn is a newer message's",
      world({ ...live, turn: { claim: async () => false, holds: async () => true } }),
      text("when do you open?"),
      never,
      [["ai", null]],
    ],
    [
      "the turn was taken while the model answered",
      world({ ...live, turn: { claim: async () => true, holds: async () => false } }),
      text("when do you open?"),
      reply("We open at 9."),
      [["ai", "hours"]],
    ],
    [
      "the carriers' hold: a line not approved for texting",
      world({ carrier: carriersHold }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
    ["a message that arrived too late to answer", world(), lateText(), {}, [["handoff", null]]],
    [
      "the day's model budget is spent",
      world({ rt: overBudget, tokensUsed: 5000 }),
      text("when do you open?"),
      never,
      [["handoff", null]],
    ],
  ];
  const reached = new Set();
  for (const [name, w, message, extra, want, unprocessed] of cases) {
    await w.run(message, extra);
    assert.deepEqual(handledOf(w), want, name);
    assert.equal(
      w.seen.processed,
      unprocessed ? 0 : want.length,
      `${name}: marked processed exactly where the way out finishes the message`,
    );
    for (const [how] of want) reached.add(how);
  }
  assert.deepEqual(
    [...reached].sort(),
    [...HANDLED_OUTCOMES].sort(),
    "every declared outcome is stamped by some way out, and none that is not declared",
  );
});

test("a handoff is an escalation that LANDED: one the database refused asked nobody, and the message says what else became of it", async () => {
  const live = { env: { modelKey: "sk-test" }, escalateAnswer: "failed" };
  const cases = [
    // The reply's own fate decides it when nobody was asked.
    [
      "a reply that left and asked for a person, the escalation refused: the receptionist answered and nobody was asked",
      world(live),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["ai", "hours"]],
    ],
    [
      "a held reply that asks for a person, the escalation refused: it waits and nobody was asked",
      world({ ...live, rt: veto, queue: true }),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["held", "hours"]],
    ],
    [
      "a floor hold that could not be written and an escalation that could not either: nothing went out and nobody was asked",
      world({ ...live, rt: floor }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["blocked", "hours"]],
    ],
    [
      "no model key, the escalation refused: the holding message left and nobody was asked",
      world({ escalateAnswer: "failed" }),
      text("hi"),
      {},
      [["ai", null]],
    ],
    [
      "STOP, the escalation refused: nothing went out and nobody was asked",
      world({ escalateAnswer: "failed" }),
      text("STOP"),
      {},
      [["blocked", null]],
    ],
    [
      "a workspace on ask, the escalation refused",
      world({ rt: onAsk, escalateAnswer: "failed" }),
      text("can I book Friday?"),
      {},
      [["blocked", null]],
    ],
    [
      "a voice note acknowledged, the escalation refused: the receptionist spoke and nobody was asked",
      world({ escalateAnswer: "failed" }),
      voice(),
      {},
      [["ai", null]],
    ],
    [
      "a yes whose confirmation did not go and whose escalation was refused: nothing went out and nobody was asked",
      world({ delivered: failed, escalateAnswer: "failed" }),
      text("START"),
      {},
      [["blocked", null]],
    ],
    [
      "a reply that could not be delivered, the escalation refused: nobody was asked, so nothing is stamped and the message stays unfinished",
      world({ ...live, delivered: failed }),
      text("when do you open?"),
      reply("We open at 9."),
      [],
      "unprocessed",
    ],
    [
      "the carriers' hold, the escalation refused: nothing was said and nobody was asked",
      world({ carrier: carriersHold, escalateAnswer: "failed" }),
      text("hi"),
      {},
      [["blocked", null]],
    ],
    [
      "a message that arrived too late, the escalation refused",
      world({ escalateAnswer: "failed" }),
      lateText(),
      {},
      [["blocked", null]],
    ],
    [
      "the day's model budget is spent, the escalation refused",
      world({ rt: overBudget, tokensUsed: 5000, escalateAnswer: "failed" }),
      text("when do you open?"),
      never,
      [["blocked", null]],
    ],
    // A hold already open is still a person asked, and so is a changed one.
    [
      "a workspace on ask, the hold refreshed",
      world({ rt: onAsk, escalateAnswer: "refreshed" }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
    [
      "a workspace on ask, the hold changed",
      world({ rt: onAsk, escalateAnswer: "changed" }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
  ];
  for (const [name, w, message, extra, want, unprocessed] of cases) {
    await w.run(message, extra);
    assert.deepEqual(handledOf(w), want, name);
    assert.equal(
      w.seen.processed,
      unprocessed ? 0 : want.length,
      `${name}: marked processed exactly where the way out finishes the message`,
    );
    assert.equal(
      w.seen.escalations.length,
      want.filter(([how]) => how === "handoff").length,
      `${name}: a person is asked exactly where the message is a handoff`,
    );
  }
});

test("a thread a person holds sets a message aside, and a voice note on it: nobody is asked, so the stamp is blocked", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  await w.run(voice("wamid.vn3"));
  assert.deepEqual(handledOf(w), [
    ["handoff", null],
    ["blocked", null],
    ["blocked", null],
  ]);
  assert.equal(w.seen.escalations.length, 1, "one hold, and nobody asked twice");
});

test("a stamp the database refuses never costs the customer their reply: the real sink's processed, over a database without the door", async () => {
  const doors = [];
  const db = fakeDb(
    {},
    {},
    {
      mark_processed: () => {
        doors.push("mark_processed");
        return null;
      },
      message_stamp_handled: () => {
        doors.push("message_stamp_handled");
        throw new Error("connection reset");
      },
    },
  );
  const w = world({ env: { modelKey: "sk-test" }, realProcessed: (ing) => pgSink(db, "t1", ing).processed });
  await w.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
    "the reply left",
  );
  assert.deepEqual(
    doors,
    ["mark_processed", "message_stamp_handled"],
    "processed_at was written, and the stamp was tried",
  );
});

test("a reply that could not be delivered, over the real sink: the stamp is written and processed_at is not, so the deadman sweep still finds the message", async () => {
  const doors = [];
  const db = fakeDb(
    {},
    {},
    {
      mark_processed: () => {
        doors.push("mark_processed");
        return null;
      },
      message_stamp_handled: (a) => {
        doors.push(["message_stamp_handled", a.p_handled, a.p_intent ?? null]);
        return null;
      },
    },
  );
  const w = world({ env: { modelKey: "sk-test" }, delivered: failed, forwardTo: (ing) => pgSink(db, "t1", ing) });
  await w.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
    "the send was tried, and failed",
  );
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["send_failed"],
    "a person was asked",
  );
  assert.deepEqual(
    doors,
    [["message_stamp_handled", "handoff", "hours"]],
    "the message says it was handed over, and was never marked processed: processed_at stays unwritten",
  );
});

test("the line a message came in on travels with its ingest, for the first touch the database stamps (K3)", async () => {
  const w = world();
  await w.run(text("hi"));
  assert.deepEqual(w.seen.lines, ["c1"], "the routed channel's id: the line that took the message");
});

/* ------------------------------------------ the ask for the yes to offers: the conversation's channel reaches the note */

test("the model is told who the person is with the conversation's channel: a text is said to be one, and is never told it has not been asked for the yes to offers", async () => {
  // A text rides this road on the WhatsApp prompt, which says WhatsApp. The ask for the yes to offers is for WhatsApp
  // alone (contracts offers-ask.ts), so the lead note carries the channel and withholds the sentence that lets it ask.
  const lead = {
    contactId: "k1",
    conversationId: "conv1",
    name: "Dana",
    returning: true,
    lastSeenAt: null,
    history: [{ role: "user", content: "hi" }],
    optedOut: false,
    marketingConsent: "unknown",
    offersAskedAt: null,
  };
  const leads = { read: async () => lead, personReplyMode: async () => null };
  const asked = async (over) => {
    const notes = [];
    const w = world({ env: { modelKey: "sk-test" }, ...over });
    await w.run(text("are you open?"), {
      leads,
      brain: async () => ({
        generateReply: async (_h, _t, _s, _f, leadNote) => {
          notes.push(leadNote);
          return { text: "We open at 9.", escalate: false, meta: sure };
        },
      }),
    });
    assert.equal(notes.length, 1, "the model was asked once");
    return notes[0];
  };
  const onWhatsApp = await asked({});
  assert.match(onWhatsApp, /Has not been asked for the yes to offers\./);
  assert.doesNotMatch(onWhatsApp, /text message/);

  const byText = await asked({
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
      consent: null,
    },
  });
  assert.match(byText, /This conversation is by text message, not WhatsApp\./);
  assert.doesNotMatch(byText, /Has not been asked/);
});

test("a message held before the model is held for that hold, not for the day's tokens: an 'ask' workspace and a paused one, both over their budget", async () => {
  // The one order (core reply-posture.ts unattendedHold): a held message makes no model call, so its own hold is what
  // the Inbox says. Before it, the budget was asked first and either one read "budget".
  const limits = { max_llm_tokens_day: 1000 };
  for (const [name, rt, reason] of [
    ["ask", runtime({ policy: { reply: { mode: "ask", limits } } }), "policy_block"],
    ["paused", runtime({ paused: true, policy: { reply: { mode: "auto", limits } } }), "paused"],
  ]) {
    const w = world({ rt, tokensUsed: 5000 });
    await w.run(text("when do you open?"), {});
    assert.deepEqual(
      w.seen.escalations.map((e) => e.reason),
      [reason],
      `${name}: held for its own reason, never "budget"`,
    );
    assert.equal(w.seen.sent.length, 0, `${name}: nothing was said`);
  }
  // Over budget and free to answer is still the budget's.
  const free = world({ rt: runtime({ policy: { reply: { mode: "auto", limits } } }), tokensUsed: 5000 });
  await free.run(text("when do you open?"), {});
  assert.deepEqual(
    free.seen.escalations.map((e) => e.reason),
    ["budget"],
  );
});
