/**
 * The WhatsApp handler's named steps, run as truth tables: how late a
 * message is, whether the thread may be answered, how long a reply waits and
 * why, what layer two does to the words, what a held thread says, and what a message became (the one rule behind every
 * stamp, handled.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode } from "../_source.mjs";
import { formatPhoneDisplay } from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../../..");
const steps = await import(pathToFileURL(path.join(ROOT, "packages/core/src/inbound/steps.ts")).href);
const { ageVerdict, holdPlan, layerTwo, holdCopy, STALE_MS, STALE_REPLY_MS } = steps;
const { handledOf, escalationOf, processedAfter } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/src/inbound/handled.ts")).href
);

const brainCfg = { phone_display: "(305) 555-0100", booking_link: "https://book.example/marisa", fallbacks: {} };
const NOW = 1_800_000_000_000;
/** The zone and the clock layer two reads the owner's notes at (contracts notesInForce). */
const CLOCK = { tz: "America/New_York", now: new Date(NOW) };

test("age: fresh inside ten minutes, late inside two hours, stale beyond — and no timestamp is now", () => {
  const at = (msAgo) => String(Math.floor((NOW - msAgo) / 1000));
  assert.equal(ageVerdict(at(0), NOW).verdict, "fresh");
  assert.equal(ageVerdict(at(STALE_MS - 1), NOW).verdict, "fresh");
  assert.equal(ageVerdict(at(STALE_MS + 1000), NOW).verdict, "late");
  assert.equal(ageVerdict(at(STALE_REPLY_MS - 1000), NOW).verdict, "late");
  assert.equal(ageVerdict(at(STALE_REPLY_MS + 1000), NOW).verdict, "stale");
  assert.deepEqual(ageVerdict(undefined, NOW), { ageMs: 0, verdict: "fresh" });
  assert.ok(ageVerdict(at(STALE_MS + 1000), NOW).ageMs > STALE_MS, "the age travels with the verdict for the log");
});

test("the hold: veto always waits in its window; auto waits only below the dial; the dial off means no wait", () => {
  const limits = { reply_delay_ms: 90_000, min_confidence: 0.7 };
  const veto = holdPlan("veto", limits, { confidence: 0.99 });
  assert.equal(veto.delayMs, 90_000);
  assert.deepEqual([veto.heldForConfidence, veto.source], [false, "veto_window"]);
  const sure = holdPlan("auto", limits, { confidence: 0.9 });
  assert.deepEqual([sure.delayMs, sure.heldForConfidence, sure.source], [0, false, "veto_window"]);
  const unsure = holdPlan("auto", limits, { confidence: 0.4 });
  assert.deepEqual(
    [unsure.delayMs, unsure.heldForConfidence, unsure.source, unsure.minConfidence],
    [90_000, true, "low_confidence", 0.7],
  );
  const noMeta = holdPlan("auto", limits, undefined);
  assert.equal(noMeta.heldForConfidence, false, "no confidence on record is not low confidence");
  const dialOff = holdPlan("auto", { reply_delay_ms: 90_000 }, { confidence: 0.1 });
  assert.deepEqual([dialOff.delayMs, dialOff.heldForConfidence], [0, false]);
});

test("layer two: a price blocks the send; under ask a link is taken back and an answer is replaced; compliance keeps its words; nothing else is touched", () => {
  const base = {
    escalate: false,
    escalationReason: "human_token",
    brainCfg,
    policy: { booking: { mode: "ask" }, faq: { mode: "ask" } },
    ...CLOCK,
  };
  const price = layerTwo({ ...base, replyText: "A blowout is $45 today.", intent: "pricing" });
  assert.equal(price.priceBlocked, true);
  assert.match(price.replyText, /^Good question! A member of our team will follow up here with the details shortly\./);
  assert.equal(
    price.escalationReason,
    "policy_ask",
    "the ask class still applies after the price block; the words are the price block's",
  );
  assert.equal(price.escalate, true);
  const link = layerTwo({ ...base, replyText: `Book here: ${brainCfg.booking_link}`, intent: "booking" });
  assert.deepEqual(
    [link.askClass, link.complied, link.escalate, link.escalationReason],
    ["booking", false, true, "policy_ask"],
  );
  assert.match(link.replyText, /confirm your booking with you shortly/);
  const complied = layerTwo({
    ...base,
    replyText: "A member of our team will confirm your booking shortly.",
    escalate: true,
    intent: "booking",
  });
  assert.deepEqual(
    [complied.complied, complied.replyText],
    [true, "A member of our team will confirm your booking shortly."],
  );
  const answered = layerTwo({ ...base, replyText: "We open at 9 and do balayage.", intent: "services" });
  assert.deepEqual([answered.askClass, answered.complied, answered.escalationReason], ["faq", false, "policy_ask"]);
  assert.match(answered.replyText, /get back to you with the details shortly/);
  const handedOff = layerTwo({
    ...base,
    replyText: "Let me get a colleague to answer that.",
    escalate: true,
    intent: "pricing",
  });
  assert.deepEqual([handedOff.complied, handedOff.replyText], [true, "Let me get a colleague to answer that."]);
  const plain = layerTwo({
    ...base,
    policy: { booking: { mode: "auto" }, faq: { mode: "auto" } },
    replyText: `Book here: ${brainCfg.booking_link}`,
    intent: "booking",
  });
  assert.deepEqual(
    [plain.askClass, plain.complied, plain.escalate, plain.escalationReason, plain.priceBlocked],
    [null, null, false, "human_token", false],
  );
  assert.equal(plain.replyText, `Book here: ${brainCfg.booking_link}`);
});

test("layer two: the urgent line names the number the facts resolve to, and a workspace with none ends the sentence cleanly", () => {
  const base = {
    escalate: false,
    escalationReason: "human_token",
    policy: { booking: { mode: "ask" }, faq: { mode: "ask" } },
    ...CLOCK,
  };
  // The three replies layer two writes itself: the price block, the booking taken back, the answer held.
  const replaced = (cfg, known) =>
    [
      { replyText: "A blowout is $45 today.", intent: "pricing" },
      { replyText: `Book here: ${cfg.booking_link}`, intent: "booking" },
      { replyText: "We open at 9 and do balayage.", intent: "services" },
    ].map((m) => layerTwo({ ...base, ...m, brainCfg: cfg, known }).replyText);

  for (const t of replaced(brainCfg, undefined))
    assert.ok(t.endsWith(" For anything urgent, call (305) 555-0100."), `a typed number is the one named: ${t}`);

  const LINE = "+13055550123";
  const untyped = { ...brainCfg, phone_display: undefined };
  const answering = { channels: [{ kind: "voice", number_e164: LINE, status: "active" }] };
  for (const t of replaced(untyped, answering))
    assert.ok(
      t.endsWith(` For anything urgent, call ${formatPhoneDisplay(LINE)}.`),
      `no typed number: the line the receptionist answers, formatted for a person: ${t}`,
    );

  const bare = replaced(untyped, null);
  assert.deepEqual(
    bare,
    [
      "Good question! A member of our team will follow up here with the details shortly.",
      "A member of our team will confirm your booking with you shortly.",
      "A member of our team will get back to you with the details shortly.",
    ],
    "no number anywhere: the sentence ends where it ends",
  );
  for (const t of bare) assert.ok(!/undefined|call\s*\./.test(t), `never "call undefined." or "call .": ${t}`);
});

test("layer two: a note's price goes out through its last day on the business's day, and the draft naming it is held after", () => {
  // "Never quote a price" off (decision 0051), and an offer note the plan writes, ending on 30 November.
  const open = {
    ...brainCfg,
    profile: {
      hours: { mon: { open: "09:00", close: "17:00" } },
      guardrails: { never_quote_prices: false },
      notes: [
        { title: "Offer: Colour for $60 all November", text: "Colour is $60 all November.", until: "2026-11-30" },
      ],
    },
  };
  const draft = (now) =>
    layerTwo({
      replyText: "Yes, colour is still $60.",
      escalate: false,
      escalationReason: "human_token",
      brainCfg: open,
      policy: null,
      intent: "pricing",
      language: "en",
      known: null,
      tz: "America/New_York",
      now,
    });
  const lastNight = draft(new Date("2026-11-30T23:00:00-05:00"));
  assert.deepEqual([lastNight.priceBlocked, lastNight.replyText], [false, "Yes, colour is still $60."]);
  const after = draft(new Date("2026-12-01T12:00:00-05:00"));
  assert.deepEqual(
    [after.priceBlocked, after.escalate, after.escalationReason],
    [true, true, "policy_block"],
    "the ended offer's price is held, as any price nobody wrote",
  );
  assert.doesNotMatch(after.replyText, /60/, "the customer never reads the expired figure");
});

test("a held thread says why, to the Inbox and to the alert, and a broken config is named as a mistake", () => {
  const person = holdCopy({ brainCfg, personMode: "never", replyMode: "never", configBroken: false });
  assert.deepEqual(
    [person.personHold, person.reason, person.botText, person.why],
    [true, "person_hold", "(held — you handle this person yourself)", "this person is set to never"],
  );
  assert.match(person.details, /You set the receptionist to 'never' for this person/);
  const policy = holdCopy({ brainCfg, personMode: null, replyMode: "ask", configBroken: false });
  assert.deepEqual([policy.personHold, policy.reason, policy.why], [false, "policy_block", "reply mode ask"]);
  assert.match(policy.details, /Reply mode is 'ask'/);
  const broken = holdCopy({ brainCfg: null, personMode: null, replyMode: "auto", configBroken: true });
  assert.deepEqual([broken.reason, broken.why], ["policy_block", "settings could not be read"]);
  assert.match(broken.details, /invalid field/);
  const none = holdCopy({ brainCfg: null, personMode: "never", replyMode: "auto", configBroken: false });
  assert.deepEqual([none.personHold, none.why], [false, "no persona configured"], "no persona is never a person hold");
  assert.match(none.details, /No brain profile configured/);
});

test("the shape: the webhook, the message path, the bookkeeping, the alerts, the steps — each in its file, the path using the steps", () => {
  // The webhook's GET and POST are imported and run in whatsapp-door.test.mjs.
  // The message path is a verb over ports now, and apps/edge/lib/whatsapp/inbound.ts
  // is its adapter: handleInbound keeps its name and its seven parameters, which
  // whatsapp-door.test.mjs and inbound-executed.test.mjs CALL rather than read.
  // The verb is answer.ts's order of phases, each declared in a module beside it
  // (decision 0001), in the order it calls them; what each one does is run there.
  const HOME = {
    openInbound: "context",
    ingestMessage: "ingest",
    modeInForce: "gates",
    firstGates: "gates",
    tooLate: "reply-gates",
    seeingOf: "unreadable",
    unreadableGate: "unreadable",
    wordsOf: "unreadable",
    confirmedYes: "reply-gates",
    heldForThePerson: "reply-gates",
    photoOf: "unreadable",
    modelTurn: "model-turn",
    planTheHold: "dispatch",
    heldOrKept: "dispatch",
    sendNow: "dispatch",
  };
  const src = Object.fromEntries(
    ["answer", ...new Set(Object.values(HOME))].map((m) => [m, readCode(`packages/core/src/inbound/${m}.ts`)]),
  );
  assert.ok(src.answer.includes("export async function answerInbound("));
  const calls = Object.keys(HOME).map((f) => src.answer.indexOf(`${f}(`));
  assert.ok(
    calls.every((at) => at > 0),
    "answer.ts calls every phase",
  );
  assert.deepEqual(
    [...calls].sort((a, b) => a - b),
    calls,
    `and in this order: ${Object.keys(HOME).join(", ")}`,
  );
  for (const [f, m] of Object.entries(HOME))
    assert.ok(new RegExp(`export (async )?function ${f}\\(`).test(src[m]), `${f} is ${m}.ts's`);
  // Each phase asks the steps (steps.ts) for its decisions.
  for (const [m, s] of [
    ["reply-gates", "const { ageMs, verdict: age } = ageVerdict(raw.timestamp ?? undefined);"],
    ["reply-gates", "const held = unattendedHold({"],
    ["dispatch", "const plan = holdPlan(replyMode, replyLimits, brainMeta);"],
    ["model-turn", "const two = layerTwo({"],
    ["reply-gates", "const hold = holdCopy({"],
  ])
    assert.ok(src[m].includes(s), `${m}.ts: ${s}`);
  const inbound = Object.values(src).join("\n");
  assert.ok(
    !inbound.includes("violatesNoPrices(") && !inbound.includes("policyAskClass("),
    "the words are checked in one place",
  );
  const persist = readCode("apps/edge/lib/whatsapp/persist.ts");
  for (const s of [
    "export async function pgIngest(",
    "export async function pgSafe<T>(",
    "export function pgSink(",
    "export async function queueReply(",
    "export async function pgThread(",
  ])
    assert.ok(persist.includes(s), s);
  const alerts = readCode("apps/edge/lib/whatsapp/alerts.ts");
  for (const s of ["export async function alertStaff(", "export async function alertUnroutable("])
    assert.ok(alerts.includes(s), s);
  assert.ok(!alerts.includes("sendText("), "the customer is not texted from the alerts module: the door does that");
  // The tenant's credentials or none: waCfgFor answers null for a tenant with
  // nothing in the vault, and the door refuses rather than sending on the
  // environment's pair (per-tenant-credentials.test.mjs runs the resolver,
  // deliver.test.mjs runs the door).
  assert.ok(
    src.ingest.includes("whatsapp: ports.sender(ports.waCfg(rt, isEnvDefault)),") &&
      /const send = \(text: string, meta\?: Record<string, Json>, purpose\?: SendPurpose, kind\?: "system"\) =>\s*sink\.deliver\(from, wire\(text\), meta, purpose, kind\);/.test(
        src.ingest,
      ),
    "the customer is texted on the tenant's credentials, through the door, or not at all",
  );
});

/* ---------- what a message became (K1): the one rule behind every stamp ---------- */

test("handled: a handoff exactly when an escalation landed; else a queued reply is held, a reply that left or covers it is ai, and nothing is blocked", () => {
  // Every combination of the two facts a way out has: three of the escalation, four of the reply.
  const table = {
    landed: { sent: "handoff", queued: "handoff", covered: "handoff", none: "handoff" },
    failed: { sent: "ai", queued: "held", covered: "ai", none: "blocked" },
    none: { sent: "ai", queued: "held", covered: "ai", none: "blocked" },
  };
  let combinations = 0;
  for (const [escalation, row] of Object.entries(table))
    for (const [reply, want] of Object.entries(row)) {
      assert.equal(handledOf({ escalation, reply }), want, `escalation ${escalation}, reply ${reply}`);
      combinations += 1;
    }
  assert.equal(combinations, 12, "3 escalations x 4 replies");
  // An escalation the database refused is no handoff, and asking nobody is the same as a refused write.
  for (const reply of ["sent", "queued", "covered", "none"])
    assert.equal(
      handledOf({ escalation: "failed", reply }),
      handledOf({ escalation: "none", reply }),
      `a refused escalation changes nothing of a reply that is ${reply}`,
    );
});

test("handled: an escalation landed when the sink says it opened, changed or refreshed one; a write that failed, or did not answer, asked nobody", () => {
  for (const landed of ["opened", "changed", "refreshed"]) assert.equal(escalationOf(landed), "landed", landed);
  assert.equal(escalationOf("failed"), "failed");
  assert.equal(escalationOf(undefined), "failed", "Postgres off or a write that threw: the sink answers nothing");
});

test("handled: the message is processed once its escalation has answered, saying what it became; a refused or thrown escalation still marks it", async () => {
  const sink = () => {
    const calls = [];
    return { calls, processed: async (how, intent) => calls.push([how ?? null, intent ?? null]) };
  };
  // Nobody was asked: it is marked at once, with the reply's own fate.
  const quiet = sink();
  await processedAfter(quiet, null, "covered", "hours");
  assert.deepEqual(quiet.calls, [["ai", "hours"]]);
  const bare = sink();
  await processedAfter(bare, null, "none");
  assert.deepEqual(bare.calls, [["blocked", null]]);

  // A person was asked: the verdict waits for the write to answer, and is not made before it.
  const waiting = sink();
  let answer;
  const asked = new Promise((resolve) => (answer = resolve));
  const done = processedAfter(waiting, asked, "sent", "hours");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(waiting.calls, [], "not before the escalation has answered");
  answer("refreshed");
  await done;
  assert.deepEqual(waiting.calls, [["handoff", "hours"]]);

  // The write refused, or the call threw: nobody was asked, and the message is still marked processed.
  const refusedWrite = sink();
  await processedAfter(refusedWrite, Promise.resolve("failed"), "queued", "money");
  assert.deepEqual(refusedWrite.calls, [["held", "money"]]);
  const thrown = sink();
  await processedAfter(thrown, Promise.reject(new Error("connection reset")), "none");
  assert.deepEqual(
    thrown.calls,
    [["blocked", null]],
    "an escalation that threw never costs the message its processed_at",
  );
});
