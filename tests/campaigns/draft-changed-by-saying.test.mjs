/**
 * A draft changed by a line (decision 0129 step 2; server drafts/sequence-change.ts and campaigns/sequences/draft-judge.ts,
 * the page's sequences/new/change.ts), over a stand-in model: what it is told and what is kept of what it answers.
 *
 * The line under New's draft says what to change, and Ask is told the draft as it stands, in the shape it answers in, by
 * the request's keys, with the one rule a change adds; who it was for stays where the answer names no one the request
 * lists, a number the standing email already said is its owner's to keep, and the line it was drafted from stays on top.
 * On the page, a step that says what it said is the step it was, what the owner set by hand that Ask never names stays,
 * what changed is said by its place, and what Ask drafted keeps Ask's own words for a step the change left alone.
 *
 * And what the first real run found (11 Nov 2026, live, the demo workspace): a step a change rewrote in words that cannot
 * be kept stays as it stood, said with why; the drafter is told every version of a message names the same values; a step
 * that cannot be kept says why in a clause; Ask is asked once more, told which step and why, and the better of its two
 * answers is kept; a change that names no step leaves a message the business holds as it is; a signature stands alone.
 *
 * What the model itself writes is not proven here: that is read from real drafts, on the demo workspace.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const SRC = "../../apps/dashboard/src";
const { setModelStream } = await import(`${SRC}/server/shared/model-json.ts`);
const { draftSequenceFrom } = await import(`${SRC}/server/drafts/sequence.ts`);
const { draftKept } = await import(`${SRC}/server/campaigns/sequences/draft-judge.ts`);
const { DRAFT_BODY } = await import(`${SRC}/server/campaigns/sequences/bodies.ts`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const C = await import(`${SRC}/surfaces/campaigns/sequences/new/change.ts`);
const { NEW_WORDS } = await import("../../packages/contracts/src/index.ts");

let calls;
/** The model, answering every call with one answer: a text event and a stop, as the gateway streams them. */
const answerWith = (one) =>
  setModelStream(async function* (call) {
    calls.push(call);
    yield { type: "text", index: 0, text: JSON.stringify(one) };
    yield { type: "stop", stopReason: "end_turn" };
  });
beforeEach(() => {
  calls = [];
});

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
/** Who a moment or a search reaches, as Campaigns counts it: everyone on it can hear it. */
const reach = (n) => ({ candidates: n, held: 0, pool: n, noYes: 0, stopped: 0, noNumber: 0, saidYes: n });
/** A made-up salon: one moment after a visit, one message it holds, one search with leads ready, a mailbox. */
const KNOWN = {
  business: "Harbor Studio",
  localNow: "2026-10-20T14:30",
  moments: [
    {
      key: "m1",
      trigger: "visited",
      label: "the day after a visit",
      hint: "The day after a visit",
      cls: "booking",
      visits: true,
      proposal: false,
      count: 6,
      pool: reach(6),
    },
  ],
  lists: [],
  everyone: 40,
  everyonePool: reach(40),
  searches: [{ key: "s1", id: ID(9), label: "Personal trainers · Austin", ready: 2, checking: 0 }],
  messages: [
    {
      key: "k1",
      templateId: ID(1),
      title: "Visit follow-up",
      body: "Hi {{1}}, thanks for coming in.",
      offer: false,
      channels: ["whatsapp", "sms"],
      slots: ["first_name"],
    },
  ],
  running: [],
  ready: ["whatsapp", "email", "sms"],
  classModes: { booking: "veto", campaign: "ask", outreach: "ask" },
  mailbox: { ids: [ID(8)], label: "maya@example.com" },
};

const WRITE_NONE = { title: "", offer: false, whatsapp: "", email_subject: "", email_body: "", text: "" };
/** One step of Ask's answer, every field the schema asks for, with what the case says. */
const step = (parts) => ({
  does: "message",
  after_days: 0,
  only_if: [],
  message: "",
  texts: [],
  write: WRITE_NONE,
  subject: "",
  body: "",
  words: "",
  ...parts,
});
const answer = (parts) => ({
  kind: "sequence",
  audience: "people",
  who: "m1",
  name: "Thank you, then win-back",
  hour: 10,
  when: "",
  steps: [],
  cannot: "",
  ...parts,
});
const LINE = { words: "Thank them the next day, then invite them back in 4 weeks if they haven't booked" };

/** One of the business's messages as the page holds it, and a sequence built by hand on the moment after a visit. */
const held = {
  template_id: "t-1",
  title: "Visit follow-up",
  body: "Hi {{1}}, thanks for coming in!",
  channels: ["whatsapp", "sms"],
  params: [{ kind: "first_name" }],
  offer: false,
  written: null,
};
const sequence = () => ({
  ...M.draftByHand("sequence", "people", "Harbor Studio"),
  name: "Thank you, then win-back",
  who: { kind: "moment", trigger: "visited", label: "the day after a visit" },
});

/** One step of a draft that stands, as the page tells Ask it: Ask's own step, its held message by its id. */
const stood = ({ template_id = null, ...parts } = {}) => {
  const one = { ...step(parts), template_id };
  delete one.message;
  return one;
};
const COME_BACK = {
  ...WRITE_NONE,
  title: "Come back",
  offer: true,
  whatsapp: "Hi {{first name}}, it has been a while. Come back and see us: {{booking link}} See you soon.",
};
const STANDS = {
  said: LINE.words,
  kind: "sequence",
  audience: "people",
  name: "Thank you, then win-back",
  who: { kind: "moment", trigger: "visited", label: "the day after a visit" },
  hour: 10,
  when: "",
  steps: [stood({ template_id: ID(1) }), stood({ after_days: 28, only_if: ["no_booking"], write: COME_BACK })],
};
const WHO_ASKS = { tenantId: "t1", userId: "u1" };

test("a line said under a draft changes the draft that stands: Ask is told it in the shape it answers in, by the request's keys, with the one rule a change adds, and the line it was drafted from stays on top (decision 0129 step 2)", async () => {
  const shorter = { ...COME_BACK, whatsapp: "Hi {{first name}}, come back and see us: {{booking link}} See you soon." };
  answerWith(
    answer({
      steps: [step({ message: "k1" }), step({ after_days: 28, only_if: ["no_booking"], write: shorter })],
    }),
  );
  const out = await draftSequenceFrom(KNOWN, { words: "Make the second one shorter", stands: STANDS }, WHO_ASKS);
  const told = JSON.stringify(calls[0].request.messages);
  assert.match(told, /The draft as it stands, in the shape you answer in:\\n<record>/, "the draft is data");
  assert.match(told, /\\"who\\":\\"m1\\"/, "who by the request's key");
  assert.match(told, /\\"message\\":\\"k1\\"/, "a held message by its key");
  assert.equal(told.includes(ID(1)), false, "never by its id");
  assert.match(told, /it has been a while\. Come back and see us/, "a written message's words as they stand");
  assert.match(told, /What the owner first said it should do: Thank them the next day/);
  assert.match(told, /What the owner wants changed: Make the second one shorter/);
  assert.doesNotMatch(told, /What the owner says it should do/);
  assert.match(JSON.stringify(calls[0].request.system), /Where the request holds a draft as it stands/);
  // Judged as any draft is, and the line it was drafted from stays on top.
  assert.equal(out.said, LINE.words);
  assert.equal(out.steps[0].message.template_id, ID(1));
  assert.match(
    out.steps[1].message.written.versions.whatsapp.body,
    /^Hi \{\{1\}\}, come back and see us: \{\{2\}\} See you soon\.$/,
  );
  assert.deepEqual([out.steps[1].after_days, out.steps[1].only_if], [28, ["no_booking"]]);
  // A first draft is told no draft, and no rule about one.
  answerWith(answer({ steps: [step({ message: "k1" })] }));
  await draftSequenceFrom(KNOWN, LINE, WHO_ASKS);
  assert.doesNotMatch(JSON.stringify(calls[1].request.system), /a draft as it stands/);
  assert.doesNotMatch(JSON.stringify(calls[1].request.messages), /The draft as it stands/);
});

test("changed, a draft keeps who it was for where the answer names no one the request lists, and a number its email already said is its owner's to keep (decision 0129 step 2)", async () => {
  const picked = { kind: "leads", ids: [ID(5)], label: "3 picked on Leads" };
  const email = {
    subject: "A week of answered calls",
    body: "{{opening}}\n\nWe answer every call for 40 studios like yours. Want us to cover a week?",
  };
  const stands = {
    ...STANDS,
    said: "",
    audience: "leads",
    name: "Studios",
    who: picked,
    steps: [stood(email)],
  };
  const answered = answer({ audience: "leads", who: "", name: "Studios", steps: [step(email)] });
  answerWith(answered);
  const out = await draftSequenceFrom(KNOWN, { words: "Warmer", stands }, WHO_ASKS);
  assert.deepEqual(out.who, picked, "who it was for stays");
  assert.match(
    JSON.stringify(calls[0].request.messages),
    /Who it is for is already chosen, <record>3 picked on Leads<\/record>/,
  );
  assert.match(out.steps[0].email.body, /40 studios/, "the number it already said is kept");
  assert.equal(out.said, "", "a draft built by hand has no line on top");
  // The same email in a first draft is Ask's own claim, which nothing backs: its words are left for the owner to write.
  const first = draftKept({ ...answered, who: "s1" }, KNOWN, { words: "Email the studios we found" });
  assert.equal(first.steps[0].email.body, "");
});

test("REGRESSION (the live run of 11 Nov 2026): a step a change rewrote in words that cannot be kept stays as it stood, and the draft says so; the drafter is told every version of a message names the same values", async () => {
  // "Make the second one shorter": the WhatsApp words shortened past a value the email still names, which the message
  // door refuses. The step came back gone; it stays as it stood.
  const broken = {
    ...COME_BACK,
    whatsapp: "Hi {{first name}}, come back and see us.",
    email_subject: "Come back",
    email_body: "Hi {{first name}}, come back and see us: {{booking link}}",
  };
  const rewritten = answer({
    steps: [step({ message: "k1" }), step({ after_days: 28, only_if: ["no_booking"], write: broken })],
  });
  answerWith(rewritten);
  const out = await draftSequenceFrom(KNOWN, { words: "Make the second one shorter", stands: STANDS }, WHO_ASKS);
  assert.equal(out.steps.length, 2, "no step is lost");
  assert.match(
    out.steps[1].message.written.versions.whatsapp.body,
    /it has been a while\. Come back and see us: \{\{2\}\} See you soon\.$/,
    "the step as it stood",
  );
  const differ = NEW_WORDS.cannot.why.valuesDiffer;
  assert.equal(out.cannot, NEW_WORDS.cannot.stepStays(2, differ), "and why its new words could not be kept");
  assert.match(JSON.stringify(calls[0].request.system), /Every version of one message names the same values/);
  // With what Ask says it left out, both are said.
  answerWith({ ...rewritten, cannot: "Left out: “much”. It is short already." });
  const both = await draftSequenceFrom(KNOWN, { words: "Much shorter", stands: STANDS }, WHO_ASKS);
  assert.equal(both.cannot, `Left out: “much”. It is short already. ${NEW_WORDS.cannot.stepStays(2, differ)}`);
  // A first draft has nothing to fall back to: the step is left out, and the draft says which and why.
  const first = draftKept(rewritten, KNOWN, LINE);
  assert.deepEqual([first.steps.length, first.cannot], [1, NEW_WORDS.cannot.stepLeftOut(2, differ)]);
  // Nor has a change whose answer holds other steps than the draft that stands: places no longer answer each other.
  answerWith({ ...rewritten, steps: [...rewritten.steps, step({ after_days: 7, write: broken })] });
  const more = await draftSequenceFrom(KNOWN, { words: "Add a third", stands: STANDS }, WHO_ASKS);
  assert.deepEqual(
    [more.steps.length, more.cannot],
    [1, `${NEW_WORDS.cannot.stepLeftOut(2, differ)} ${NEW_WORDS.cannot.stepLeftOut(3, differ)}`],
  );
});

/** The model, answering each call in turn (the last answer again once they run out); a function is a call that fails. */
const answerInTurn = (...answers) => {
  let turn = 0;
  setModelStream(async function* (call) {
    calls.push(call);
    const next = answers[Math.min(turn++, answers.length - 1)];
    if (typeof next === "function") throw next();
    yield { type: "text", index: 0, text: JSON.stringify(next) };
    yield { type: "stop", stopReason: "end_turn" };
  });
};

test("where a step's words cannot be kept, Ask is asked once more, told which step and why, and the better of its two answers is kept; a second call that fails leaves the first standing (decision 0129 step 2)", async () => {
  const broken = {
    ...COME_BACK,
    whatsapp: "Hi {{first name}}, come back and see us.",
    email_subject: "Come back",
    email_body: "Hi {{first name}}, come back and see us: {{booking link}}",
  };
  const mended = { ...broken, whatsapp: "Hi {{first name}}, come back and see us: {{booking link}} See you soon." };
  const drafted = (write) =>
    answer({ steps: [step({ message: "k1" }), step({ after_days: 28, only_if: ["no_booking"], write })] });
  // A first draft: the second step's versions disagree, Ask is told, and its second answer is the draft.
  answerInTurn(drafted(broken), drafted(mended));
  const out = await draftSequenceFrom(KNOWN, LINE, WHO_ASKS);
  assert.equal(calls.length, 2, "asked once more, and no more than once");
  const again = calls[1].request.messages;
  assert.deepEqual(
    again.map((m) => m.role),
    ["user", "assistant", "user"],
  );
  assert.equal(again[0].content, calls[0].request.messages[0].content, "told what it was told");
  assert.deepEqual(JSON.parse(again[1].content), drafted(broken), "with what it answered");
  assert.match(again[2].content, /step 2: its email or text names a value its WhatsApp words don’t/);
  assert.deepEqual([out.steps.length, out.cannot], [2, null], "the second answer holds, and nothing is left out");
  assert.match(out.steps[1].message.written.versions.whatsapp.body, /come back and see us: \{\{2\}\} See you soon\.$/);
  // A change the same way: the step is the mended one, never the one that stood, and nothing is said to be left.
  calls.length = 0;
  answerInTurn(drafted(broken), drafted(mended));
  const changed = await draftSequenceFrom(KNOWN, { words: "Shorter", stands: STANDS }, WHO_ASKS);
  assert.equal(calls.length, 2);
  assert.match(
    changed.steps[1].message.written.versions.whatsapp.body,
    /^Hi \{\{1\}\}, come back and see us: \{\{2\}\} See you soon\.$/,
  );
  assert.equal(changed.cannot, null);
  // A second answer that is no better leaves the first: asked twice, never a third time.
  calls.length = 0;
  answerInTurn(drafted(broken));
  const same = await draftSequenceFrom(KNOWN, LINE, WHO_ASKS);
  assert.deepEqual([calls.length, same.steps.length], [2, 1]);
  // A second call that fails leaves the first answer standing: the draft is not lost to it.
  calls.length = 0;
  answerInTurn(drafted(broken), () => new Error("the model is away"));
  const kept = await draftSequenceFrom(KNOWN, LINE, WHO_ASKS);
  assert.deepEqual([calls.length, kept.steps.length], [2, 1]);
  // An answer that holds is asked for once.
  calls.length = 0;
  answerInTurn(drafted(mended));
  await draftSequenceFrom(KNOWN, LINE, WHO_ASKS);
  assert.equal(calls.length, 1);
});

test("why a step cannot be kept is said in a clause: no words, a value New does not know, a booking's value on a later step, versions that disagree, or the message door's own words", () => {
  const WHY = NEW_WORDS.cannot.why;
  const second = (write) =>
    draftKept(answer({ steps: [step({ message: "k1" }), step({ after_days: 7, write })] }), KNOWN, LINE).cannot;
  const base = { ...WRITE_NONE, title: "Nudge", whatsapp: "Hi {{first name}}, see you soon." };
  assert.equal(second({ ...base, whatsapp: "" }), NEW_WORDS.cannot.stepLeftOut(2, WHY.noWords));
  assert.equal(second({ ...base, whatsapp: "Hi {{pet name}}" }), NEW_WORDS.cannot.stepLeftOut(2, WHY.unknownValue));
  assert.equal(
    second({ ...base, whatsapp: "Hi {{first name}}, see you {{booked time}}." }),
    NEW_WORDS.cannot.stepLeftOut(2, WHY.onlyFirst),
  );
  assert.equal(
    second({ ...base, email_subject: "{{business name}} misses you", email_body: "Hi {{first name}}, see you soon." }),
    NEW_WORDS.cannot.stepLeftOut(2, WHY.valuesDiffer),
  );
  // What the message door refuses is said in the door's words, as a clause.
  const long = second({ ...base, whatsapp: `Hi {{first name}}, ${"see you soon. ".repeat(120)}` });
  assert.match(long, /^Step 2 was left out: .+[^.]\.$/, long);
  // A step that names no message and writes none says so; a call with no words is left out as it was.
  const none = draftKept(answer({ steps: [step({ message: "k1" }), step({ after_days: 7 })] }), KNOWN, LINE);
  assert.equal(none.cannot, NEW_WORDS.cannot.stepLeftOut(2, WHY.noMessage));
  const call = draftKept(
    answer({ steps: [step({ message: "k1" }), step({ does: "call", after_days: 7 })] }),
    KNOWN,
    LINE,
  );
  assert.equal(call.cannot, NEW_WORDS.cannot.stepDropped);
});

test("the drafter's rules for a change and for a signature: a change that names no step leaves a held message as it is and says so, and a name signing a message stands on a line of its own", async () => {
  answerWith(
    answer({ steps: [step({ message: "k1" }), step({ after_days: 28, only_if: ["no_booking"], write: COME_BACK })] }),
  );
  await draftSequenceFrom(KNOWN, { words: "warmer", stands: STANDS }, WHO_ASKS);
  const rules = JSON.stringify(calls[0].request.system);
  assert.match(
    rules,
    /a change that names no step \(warmer, shorter\) is made to the messages written in `write` alone/,
  );
  assert.match(rules, /Only where the owner names that step or its message/);
  assert.match(rules, /is one of your own messages, so it stays as it is/);
  assert.match(rules, /signed with stands on a line of its own, last/);
});

test("the draft's door takes a change of one word where a draft stands, and still asks a first line to say enough; a draft that stands is taken whole or not at all", () => {
  assert.equal(DRAFT_BODY.safeParse({ words: "Shorter" }).success, false, "a first line says what it should do");
  assert.equal(DRAFT_BODY.safeParse({ words: "Shorter", stands: STANDS }).success, true);
  assert.equal(DRAFT_BODY.safeParse({ words: "   ", stands: STANDS }).success, false);
  assert.equal(DRAFT_BODY.safeParse({ words: "Shorter", stands: { ...STANDS, steps: [] } }).success, false);
  assert.equal(DRAFT_BODY.safeParse({ words: "Shorter", stands: { ...STANDS, id: "x" } }).success, false);
  assert.equal(DRAFT_BODY.safeParse(LINE).success, true);
});

/** A message Ask wrote, as the draft holds one: numbered, with the values it takes. */
const askWrote = (whatsapp) => ({
  template_id: null,
  title: "Come back",
  body: whatsapp,
  channels: ["whatsapp"],
  params: [{ kind: "first_name" }],
  offer: true,
  written: {
    name: "come_back",
    category: "marketing",
    versions: { whatsapp: { body: whatsapp } },
    slots: [{ position: 1, label: "First name", example: "Dani", kind: "first_name" }],
  },
});
/** A two-step sequence as the page holds it: a held message with a value typed, then one Ask wrote four weeks later. */
const twoSteps = () => {
  const typed = { ...held, params: [{ kind: "first_name" }, { kind: "text", value: "20% off" }] };
  const first = M.setMessage(sequence(), 0, typed);
  const second = M.setMessage(M.addStep(first, "message"), 1, askWrote("Hi {{1}}, it has been a while."), ["whatsapp"]);
  return { ...M.setWait(second, 1, 28), said: LINE.words };
};

test("the page tells Ask the draft as it stands: each step in the shape Ask answers one in, a held message by its id with what was typed, written words with their values by name (decision 0129 step 2)", () => {
  const stands = C.standsOf(twoSteps());
  assert.deepEqual(
    [stands.said, stands.kind, stands.audience, stands.name, stands.who.trigger, stands.hour, stands.when],
    [LINE.words, "sequence", "people", "Thank you, then win-back", "visited", 10, ""],
  );
  assert.deepEqual(
    [stands.steps[0].template_id, stands.steps[0].texts, stands.steps[0].write.title, stands.steps[0].after_days],
    ["t-1", ["20% off"], "", 0],
  );
  assert.deepEqual(
    [stands.steps[1].template_id, stands.steps[1].write.title, stands.steps[1].write.offer, stands.steps[1].after_days],
    [null, "Come back", true, 28],
  );
  assert.equal(stands.steps[1].write.whatsapp, "Hi {{first name}}, it has been a while.");
  // A one-off says when as Ask says one, and the door takes what the page tells.
  const once = { ...M.draftByHand("once", "people", "Harbor Studio"), who: M.everyoneOf(true) };
  assert.equal(C.standsOf(once).when, "now");
  assert.equal(C.standsOf(M.setAt(once, "2026-10-23T09:00")).when, "2026-10-23 09:00");
  assert.equal(
    DRAFT_BODY.safeParse({ words: "Shorter", stands: { ...stands, steps: [stands.steps[1]] } }).success,
    true,
    "the door takes a step as the page tells it",
  );
});

test("Ask's answer is taken as the draft changed: a step that says what it said is the step it was, what the owner set by hand stays, what changed is said by its place, and what Ask drafted keeps Ask's words where the change left a step alone (decision 0129 step 2)", () => {
  const before = { ...twoSteps(), mode: "veto" };
  // Ask answers the whole draft: the first step as it stood (a second writing of it), the second shorter, the hour moved.
  const answered = {
    ...before,
    mode: "ask",
    run_hour: 11,
    steps: [
      JSON.parse(JSON.stringify(before.steps[0])),
      { ...before.steps[1], message: askWrote("Hi {{1}}, come back.") },
    ],
  };
  const after = C.changedFrom(before, answered);
  assert.equal(after.steps[0], before.steps[0], "the step it was, never a second writing of it");
  assert.equal(after.steps[1].message.written.versions.whatsapp.body, "Hi {{1}}, come back.");
  assert.equal(after.mode, "veto", "how each batch is decided stays as the owner set it");
  assert.deepEqual(C.changesOf(before, after), { steps: [2], said: "Ask changed when it goes and step 2" });
  // Renamed, the first step is still the step it was, under the sequence's new name, which it carries.
  const named = { ...before, steps: [{ ...before.steps[0], name: before.name }, before.steps[1]] };
  const renamed = C.changedFrom(named, {
    ...named,
    name: "Welcome back",
    steps: [{ ...JSON.parse(JSON.stringify(named.steps[0])), name: "Welcome back" }, named.steps[1]],
  });
  assert.deepEqual(
    [renamed.steps[0].name, renamed.steps[0].message === named.steps[0].message, C.changesOf(named, renamed).said],
    ["Welcome back", true, "Ask changed its name"],
  );
  assert.equal(M.setName(named, "By hand").steps[0].name, "By hand", "a name typed is its first step's too");
  assert.equal(M.setName(before, "By hand").steps[0].name, before.steps[0].name, "a step under another name keeps it");
  // Nothing changed is said so; a one-off's one step is its message, and fewer steps is said once.
  assert.deepEqual(C.changesOf(before, C.changedFrom(before, before)), { steps: [], said: "Ask changed nothing" });
  const fewer = C.changedFrom(before, { ...before, name: "Thank you", steps: [before.steps[0]] });
  assert.equal(C.changesOf(before, fewer).said, "Ask changed its name and how many steps it has");
  const once = M.setMessage({ ...M.draftByHand("once", "people", "x"), who: M.everyoneOf(true) }, 0, askWrote("Hi"));
  const onceAfter = C.changedFrom(once, { ...once, steps: [{ ...once.steps[0], message: askWrote("Hello") }] });
  assert.equal(C.changesOf(once, onceAfter).said, "Ask changed the message");
  // To another list, how its batches are decided is the new draft's own; a one-off's channels stay with its message.
  const moved = C.changedFrom(before, { ...answered, who: { kind: "list", token: "seg:vip", label: "VIP clients" } });
  assert.equal(moved.mode, "ask");
  const narrowed = { ...once, channels: [] };
  assert.deepEqual(
    C.changedFrom(narrowed, { ...narrowed, channels: ["whatsapp"], at: "2026-10-23T09:00" }).channels,
    [],
  );
  // What Ask drafted: its own first words where the owner edited a step the change left alone, the change's where it wrote.
  const drafted = { ...before, steps: [before.steps[0], { ...before.steps[1], hand: "as Ask first drafted it" }] };
  const kept = C.draftedAfter(drafted, before, after);
  assert.equal(kept.steps[0], drafted.steps[0]);
  assert.equal(kept.steps[1], after.steps[1], "the step the change wrote is Ask's as it came");
  assert.equal(C.draftedAfter(null, before, after), null, "a draft Ask never drafted keeps none");
});
