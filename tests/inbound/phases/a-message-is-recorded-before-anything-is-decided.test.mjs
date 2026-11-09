/**
 * The ingest phase (core inbound/ingest.ts): what is set aside and recorded, what a redelivery and a job taken up again
 * do, what a refused write costs, and what travels with the message into its row.
 *
 * The verb runs for real over the receptionist's world (../_world.mjs): its gates as themselves, everything outside
 * them (the database, the memory, the runtime, the sink, the alerts, the pager, the model) as fakes handed in through
 * its ports. What is asserted is what a customer, an owner and the platform would see. Split by phase out of
 * tests/whatsapp/inbound-executed.test.mjs (the inbound review of 3 Nov 2026, D4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FROM, GREETING, text, world } from "../_world.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { IngestFailed } = await import(at("apps/edge/lib/inbound/persist.ts"));
const { jobWireOf } = await import(at("apps/edge/lib/inbound/answer-job.ts"));

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

test("the line a message came in on travels with its ingest, for the first touch the database stamps (K3)", async () => {
  const w = world();
  await w.run(text("hi"));
  // The door's ingest and its job's: both carry the routed channel's id, the line that took the message.
  assert.deepEqual(w.seen.lines, ["c1", "c1"], "the routed channel's id: the line that took the message");
});

test("an answer job says the wire it answers on, and one its door wrote before it did is read by what it carries", () => {
  assert.equal(jobWireOf({ wire: "whatsapp", wa: {} }), "whatsapp");
  assert.equal(jobWireOf({ wire: "instagram", ig: {} }), "instagram");
  assert.equal(jobWireOf({ wire: "sms", text: {} }), "sms");
  // Before 3 Nov 2026 a payload said nothing of its wire.
  assert.deepEqual(
    [jobWireOf({ wa: {} }), jobWireOf({ ig: {} }), jobWireOf({ text: {} })],
    ["whatsapp", "instagram", "sms"],
  );
  // A word nobody wrote is not believed: what the payload carries decides.
  assert.equal(jobWireOf({ wire: "email", wa: {} }), "whatsapp");
});
