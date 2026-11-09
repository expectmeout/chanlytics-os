/**
 * The reply gates (core inbound/reply-gates.ts, unreadable.ts): too late, what may not be read, a yes to confirm, and
 * every hold a person, the day's cap, the billing pause, the mode or the budget puts on a reply.
 *
 * The verb runs for real over the receptionist's world (../_world.mjs): its gates as themselves, everything outside
 * them (the database, the memory, the runtime, the sink, the alerts, the pager, the model) as fakes handed in through
 * its ports. What is asserted is what a customer, an owner and the platform would see. Split by phase out of
 * tests/whatsapp/inbound-executed.test.mjs (the inbound review of 3 Nov 2026, D4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optInConfirmation, formatPhoneDisplay, HOUR_MS } from "@chanlytics/contracts";
import { FROM, FROM_ITS_EVENT, runtime, text, world } from "../_world.mjs";
import { photo, handledOf, voice } from "./_fixtures.mjs";

test("the same customer's next text inside the pause is recorded and not answered", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  assert.equal(w.seen.sent.length, 1, "nothing more left");
  assert.equal(w.seen.escalations.length, 1, "no second escalation");
  // The receptionist's own hold is open (it handed the thread over), so the message is that hold's: nothing written.
  assert.deepEqual(
    w.seen.underHold.map((h) => h.reason),
    ["wrote_while_held"],
    "asked as written while held, and kept under the hold that was open",
  );
  assert.equal(w.seen.processed, 2, "but the message is handled");
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user", "assistant", "user"],
    "and remembered",
  );
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

test("a START by text is confirmed in the name its campaign was filed under, not a name the business took since (X4-5)", async () => {
  // The carriers approved the campaign's opt-in message with the name it was filed under, and only a new campaign
  // changes it: a business renamed in Settings is still confirmed in the name the carriers hold.
  const carrier = {
    channel: "sms",
    send: async () => ({ ok: true, wamid: "s1", status: 200 }),
    body: (t) => t,
    held: null,
  };
  const renamed = { rt: runtime({ known: { workspace: { name: "Harbor Nails & Spa" } } }), carrier };
  const asked = [];
  const filing = {
    names: async (_db, tenant) => (asked.push(tenant), { campaign: "Harbor Nails", brand: "Harbor Nails LLC" }),
  };
  const sms = world(renamed);
  await sms.run(text("START"), { filing });
  assert.equal(sms.seen.sent.length, 1);
  assert.equal(sms.seen.sent[0].body, optInConfirmation("Harbor Nails", "conversational"));
  assert.deepEqual(asked, ["t1"], "one read, of this workspace");

  // A filing that kept no name: the workspace's, which no owner could change before 00439. A read that fails holds
  // nothing back: the yes is confirmed in the workspace's name.
  for (const names of [
    async () => ({ campaign: null, brand: "Harbor Nails LLC" }),
    async () => {
      throw new Error("the read failed");
    },
  ]) {
    const older = world(renamed);
    await older.run(text("START"), { filing: { names } });
    assert.equal(older.seen.sent[0].body, optInConfirmation("Harbor Nails & Spa", "conversational"));
  }

  // WhatsApp files nothing with the carriers: the receptionist's name, and nobody asks for a filing's.
  const wa = world({ rt: renamed.rt });
  await wa.run(text("START"), { filing });
  assert.equal(wa.seen.sent[0].body, optInConfirmation("Harbor Nails", "conversational"));
  assert.equal(asked.length, 1, "a WhatsApp START reads no filing");
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
  assert.match(w.seen.escalations[0].details, /this person is set to Stays quiet/);
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

test("a yes taken while the workspace is paused is held as the pause's, in its words, not as a reply that failed to deliver (the wiring's second audit, X4-1)", async () => {
  const { YES_WHILE_PAUSED } = await import("@chanlytics/contracts");
  const w = world({
    escalateAnswer: "failed",
    delivered: { outcome: "refused", reason: "paused", messageId: null },
  });
  await w.run(text("YES OFFERS"));
  assert.deepEqual(
    w.seen.refused.map((e) => e.reason),
    ["paused"],
  );
  assert.equal(w.seen.refused[0].details, YES_WHILE_PAUSED.details);
  assert.doesNotMatch(w.seen.refused[0].details, /did not go out/);
  assert.equal(w.seen.alerts[0].reason, "paused");
});

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

test("a thread a person holds keeps a message, and a voice note on it, under the hold that is open: a person is asked, once", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  await w.run(voice("wamid.vn3"));
  // Set aside with nobody asked, both were "blocked" and waited unseen past the pause (the closed-loop audit, B): each is
  // now the open hold's, so a person is asked, by the hold already open (00454).
  assert.deepEqual(handledOf(w), [
    ["handoff", null],
    ["handoff", null],
    ["handoff", null],
  ]);
  assert.equal(w.seen.escalations.length, 1, "one hold, and nobody asked twice");
  assert.equal(w.seen.underHold.length, 2, "each later message landed on it");
  assert.equal(w.seen.sent.length, 1, "and nothing more was said");
});

test("REGRESSION: a customer who writes after a person took the thread with no hold open is held for that person, and told once", async () => {
  // A person replied (which resolves the thread's holds) or took it over (which opens none): the thread is theirs for
  // the pause, and no hold is open. The message was set aside, nobody was told, and the pause's end handed the thread
  // back with it unanswered (the closed-loop audit of 17 Oct 2026, B).
  const w = world({ pausedUntil: Date.now() + 60 * 60 * 1000 });
  await w.run(text("can we move it to Saturday?", "wamid.after-reply"));
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["wrote_while_held"],
    "held for the person who has the thread",
  );
  assert.match(w.seen.escalations[0].details, /while your team had this thread/);
  assert.equal(w.seen.sent.length, 0, "the receptionist stays out");
  assert.deepEqual(handledOf(w), [["handoff", null]]);
  // A voice note in the same stretch is the same hold's: refreshed, never a second one.
  await w.run(voice("wamid.vn-after-reply"));
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["wrote_while_held", "wrote_while_held"],
    "the door refreshes the open hold of its own reason (a second write, no second row)",
  );
  assert.match(w.seen.escalations[1].details, /They sent a \w+ message while your team had this thread/);
  assert.equal(w.seen.sent.length, 0);
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
