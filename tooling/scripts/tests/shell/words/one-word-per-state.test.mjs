/**
 * One word per state (the wiring plan's rule 3, task 4.2): a state has one set of words, in contracts, and no page works
 * a state out again.
 *
 * "Waiting on you" named a thread you had taken (People), a thread nobody had (Reports' tile), a run waiting for approval
 * (Sent and Campaigns), a payment Meta was waiting on (a WhatsApp number's row), a group of deals (the Pipeline's rail) and
 * the people who need you (Ask). A teammate's thread was "Ruben has it" in the Inbox and "A teammate has it" beside it. A
 * campaign was "On", "Running" and a bare dot, and "Paused" on the home where its drawer said "Waiting on you". A
 * refused WhatsApp version was five spellings. Asked-to-stop was ten, in three tones.
 *
 * What is held here, by executing the code:
 *  - no label names two different states across tone.ts's label maps and the page-owned words a state is drawn from. A
 *    word two states share is written down below with the one thing it means, and the list of the ones that still name two
 *    things may only get shorter;
 *  - each of the states above is said by one constant everywhere it is said.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROADCAST_STATE_LABELS,
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  HELD_REASONS,
  HELD_WORDS,
  LIFECYCLE_WORDS,
  NEEDS_YOU_WORD,
  PAYMENT_HOLD_WORD,
  PEOPLE_LISTS,
  PEOPLE_TABS,
  PERSON_STATE_LABELS,
  RUN_WAITING_WORDS,
  STOP_WORDS,
  TEMPLATE_STATUS_WORDS,
  heldPill,
  lifecycleChainStateOf,
  lifecycleStateOf,
  messageStandingWords,
  noTemplateWords,
  optOutWords,
  stateLabel,
  stateTone,
  stateWordList,
  todayRunWords,
} from "@chanlytics/contracts";

/* ------------------------------ the words that are not in a map ------------------------------ */

/** A campaign as the home reads it, for the words it says of itself (lifecycleStateOf). */
const campaign = (over = {}) => ({
  trigger: "quiet_30",
  run_hour: 10,
  cadence_days: 30,
  state: "running",
  totals: { waiting: null },
  off: null,
  ...over,
});
const WAITING_RUN = { id: "b1", recipient_count: 3 };
const chain = (state, waiting) => ({ state, next: { waiting_run_id: waiting ? "b1" : null } });
const run = {
  state: "pending_approval",
  recipient_count: 3,
  when: "today 9:00 AM",
  counts: { sent: 0, replied: 0 },
  audience: { kind: "playbook" },
};

/** Every word a state is drawn with that no label map holds: a campaign's, a reach-out's, a run on Today, a payment hold. */
const OTHER_WORDS = () => [
  ["campaign/off", lifecycleStateOf(campaign({ off: "Where deals are off" })).words],
  ["campaign/on", lifecycleStateOf(campaign()).words],
  ["campaign/paused", lifecycleStateOf(campaign({ state: "paused" })).words],
  ["campaign/waiting", lifecycleStateOf(campaign({ totals: { waiting: WAITING_RUN } })).words],
  ["chain/on", lifecycleChainStateOf(chain("running", false)).words],
  ["chain/paused", lifecycleChainStateOf(chain("paused", false)).words],
  ["chain/waiting", lifecycleChainStateOf(chain("running", true)).words],
  ["today/run-waiting", todayRunWords(run).waiting.status[0]],
  ["today/run-late", todayRunWords(run).late.status[0]],
  ["number/payment", PAYMENT_HOLD_WORD],
];

/* ------------------------------------- the one-state list ------------------------------------- */

/**
 * A label several states carry is one state said in several places, or it is a collision. These are the first: each word
 * with the one thing it means and every state that says it. A state that begins to say one of these words has to be written
 * here, with what it means, or the test fails.
 */
const ONE_STATE = {
  "needs you": {
    means: "flagged for a person, and nobody has taken it",
    ids: ["thread/escalated", "thread/needs_you", "standing/escalated", "person/needs_you"],
  },
  "you have it": {
    means: "a thread the member looking has taken",
    ids: ["thread/yours", "standing/yours", "person/waiting_on_you"],
  },
  "a teammate has it": { means: "a thread a teammate has taken", ids: ["thread/theirs", "standing/theirs"] },
  snoozed: { means: "put aside until it wakes", ids: ["thread/snoozed", "standing/snoozed"] },
  "opted out": { means: "asked to stop", ids: ["consent/opted_out", "person/opted_out"] },
  "waiting for your approval": {
    means: "a run waits for its owner's word",
    ids: ["broadcast/pending_approval", "campaign/waiting", "chain/waiting", "today/run-waiting"],
  },
  paused: {
    means: "stopped for now and able to resume: a campaign, the receptionist on a thread, a WhatsApp version",
    ids: ["standing/paused", "template/paused", "campaign/paused", "chain/paused"],
  },
  handled: {
    means: "dealt with, and nothing is left for the owner to do",
    ids: ["thread/decided", "call/handled"],
  },
  interested: {
    means: "the business said it is interested: on a call the owner made, or in a reply to a reach-out",
    ids: ["lead_call_outcome/interested", "reply/interested"],
  },
};

/**
 * The words that still name two different states, each with why. This list may only get shorter: one of these fixed (a
 * state renamed) is deleted from here, and the test fails until it is.
 */
const STILL_TWO_STATES = {
  ready: {
    why: "a Setup step that is done, and a lead not yet contacted: Setup's and Leads' own vocabularies, owed a decision",
    ids: ["lead_stage/ready", "setup/ready"],
  },
};

const wordsOfEveryState = () => [
  ...stateWordList().map(({ kind, value, label }) => ({ id: `${kind}/${value}`, label })),
  ...OTHER_WORDS().map(([id, label]) => ({ id, label })),
];

test("no label names two different states: a word two states share is one thing, written down", () => {
  const byWord = new Map();
  for (const { id, label } of wordsOfEveryState()) {
    const word = label.trim().toLowerCase();
    byWord.set(word, [...(byWord.get(word) ?? []), id]);
  }
  const shared = [...byWord].filter(([, ids]) => ids.length > 1);
  assert.ok(shared.length > 0, "the test sees the words several states share");
  for (const [word, ids] of shared) {
    const said = ONE_STATE[word] ?? STILL_TWO_STATES[word];
    assert.ok(
      said,
      `"${word}" names ${ids.join(", ")}: one state said in several places goes in ONE_STATE with what it means, and two states are a collision to fix`,
    );
    assert.deepEqual([...ids].sort(), [...said.ids].sort(), `the states that say "${word}" are the ones written down`);
  }
  // The other way: a word written down that no longer collides is deleted, so the lists only get shorter.
  const collides = new Set(shared.map(([word]) => word));
  for (const word of [...Object.keys(ONE_STATE), ...Object.keys(STILL_TWO_STATES)])
    assert.ok(collides.has(word), `"${word}" no longer names two states: delete it from the list`);
  // And one that is a collision is never written down as one state.
  for (const word of Object.keys(STILL_TWO_STATES)) assert.ok(!(word in ONE_STATE), word);
  for (const [word, said] of Object.entries(ONE_STATE))
    assert.ok(said.means.length > 10, `"${word}" says what it means`);
});

test("a state said in two places is one word: nothing says Waiting on you for a thread, a run or a payment", () => {
  const every = wordsOfEveryState();
  // "Waiting on you" is Setup's own: a step that waits on the owner to do something.
  assert.deepEqual(
    every.filter(({ label }) => label === "Waiting on you").map(({ id }) => id),
    ["setup/waiting_you"],
  );
  assert.equal(NEEDS_YOU_WORD, "Needs you");
  assert.equal(HELD_WORDS.yours.pill, "You have it");
  assert.equal(RUN_WAITING_WORDS, "Waiting for your approval");
  assert.equal(PAYMENT_HOLD_WORD, "Payment needed");
});

/* ------------------------------------ a thread nobody has, one you have ------------------------------------ */

test("Needs you is a thread flagged that nobody has taken, and People, the Inbox, Reports and the lists say it so", () => {
  assert.equal(stateLabel("thread", "escalated"), NEEDS_YOU_WORD);
  assert.equal(stateLabel("standing", "escalated"), NEEDS_YOU_WORD);
  assert.equal(PERSON_STATE_LABELS.needs_you, NEEDS_YOU_WORD);
  assert.equal(PEOPLE_TABS.find((t) => t.id === "needs_you").label, NEEDS_YOU_WORD);
  assert.equal(PEOPLE_LISTS.find((l) => l.id === "needs_you").label, NEEDS_YOU_WORD);
});

test("You have it is a thread you took: People's state, its tab and its list say what the Inbox's pill says, not Waiting on you", () => {
  for (const said of [
    stateLabel("thread", "yours"),
    stateLabel("standing", "yours"),
    PERSON_STATE_LABELS.waiting_on_you,
    PEOPLE_TABS.find((t) => t.id === "waiting_on_you").label,
    PEOPLE_LISTS.find((l) => l.id === "waiting_on_you").label,
  ])
    assert.equal(said, "You have it");
  // The state's key is the list's id and an address people keep: only its words moved.
  assert.deepEqual(Object.keys(PERSON_STATE_LABELS).includes("waiting_on_you"), true);
});

test("a teammate's thread says who has it where the roster names them, and A teammate where it does not", () => {
  assert.equal(heldPill("yours"), "You have it");
  assert.equal(heldPill("yours", "Ruben"), "You have it", "the member looking is not named to themselves");
  assert.equal(heldPill("theirs", "Ruben"), "Ruben has it");
  assert.equal(heldPill("theirs", "  Ruben Fonseca "), "Ruben Fonseca has it");
  for (const unnamed of [undefined, null, "", "   "])
    assert.equal(heldPill("theirs", unnamed), HELD_WORDS.theirs.pill, `no roster name: ${JSON.stringify(unnamed)}`);
  assert.equal(HELD_WORDS.theirs.pill, "A teammate has it");
  assert.equal(stateLabel("thread", "theirs"), HELD_WORDS.theirs.pill, "the pill's default is the unnamed words");
});

/* --------------------------------------------- a run waiting --------------------------------------------- */

test("a run waiting for its owner is one phrase: its label, a campaign's, a reach-out's, Today's and Coming up's", () => {
  const said = RUN_WAITING_WORDS;
  assert.equal(BROADCAST_STATE_LABELS.pending_approval, said);
  assert.equal(stateLabel("broadcast", "pending_approval"), said);
  assert.equal(LIFECYCLE_WORDS.coming.waiting, said, "Coming up's pill");
  assert.equal(todayRunWords(run).waiting.status[0], said, "Today's row");
  assert.equal(lifecycleStateOf(campaign({ totals: { waiting: WAITING_RUN } })).words, said, "the home and the drawer");
  assert.equal(lifecycleChainStateOf(chain("running", true)).words, said, "a reach-out's");
  // Not the Inbox's word for a thread a person must answer.
  assert.notEqual(said, NEEDS_YOU_WORD);
});

test("a campaign is one state word, and a run waiting for the owner is shown whether or not the campaign is paused", () => {
  const on = lifecycleStateOf(campaign());
  assert.deepEqual([on.words, on.short, on.tone, on.paused], ["On · daily 10:00 AM", "daily 10:00 AM", "ok", false]);
  const paused = lifecycleStateOf(campaign({ state: "paused" }));
  assert.deepEqual([paused.words, paused.tone, paused.paused], ["Paused", "plain", true]);
  const waiting = lifecycleStateOf(campaign({ totals: { waiting: WAITING_RUN } }));
  assert.deepEqual([waiting.words, waiting.tone, waiting.paused], [RUN_WAITING_WORDS, "warn", false]);
  // Pausing leaves a waiting run waiting (by design): the home said Paused, with Resume, and its drawer Waiting on you,
  // with Approve, for the same campaign.
  const both = lifecycleStateOf(campaign({ state: "paused", totals: { waiting: WAITING_RUN } }));
  assert.deepEqual(
    [both.words, both.tone, both.paused],
    [RUN_WAITING_WORDS, "warn", true],
    "the run first; paused still says so",
  );
  assert.equal(
    lifecycleStateOf(campaign({ off: "Not offered here", totals: { waiting: WAITING_RUN } })).words,
    "Not running here",
  );
  // A reach-out reads the same way, and says On where a campaign says the clock it keeps.
  assert.deepEqual(
    [chain("running", false), chain("paused", false), chain("paused", true), chain("running", true)].map((c) => {
      const s = lifecycleChainStateOf(c);
      return [s.words, s.tone, s.paused];
    }),
    [
      ["On", "ok", false],
      ["Paused", "plain", true],
      [RUN_WAITING_WORDS, "warn", true],
      [RUN_WAITING_WORDS, "warn", false],
    ],
  );
});

test("a payment Meta is waiting on names the payment, and is no one's Waiting on you", () => {
  assert.equal(PAYMENT_HOLD_WORD, "Payment needed");
  assert.ok(!/waiting/i.test(PAYMENT_HOLD_WORD));
});

/* ------------------------------------------- a refused WhatsApp version ------------------------------------------- */

test("a refused WhatsApp version is Refused on the row, the pane and the picker, and refused in every sentence", () => {
  assert.equal(TEMPLATE_STATUS_WORDS.rejected, "Refused");
  assert.equal(stateLabel("template", "rejected"), "Refused", "the pill on a row's tag and on the pane");
  assert.equal(stateTone("template", "rejected"), "danger");
  // The Library's per-channel standing line, and the Inbox picker's reasons.
  const message = {
    versions: { whatsapp: { status: "rejected", blocked: null }, email: null, sms: null },
    purpose: "utility",
  };
  assert.equal(messageStandingWords(message).whatsapp, "WhatsApp · refused");
  assert.ok(noTemplateWords({ rejected: 2 }).includes("2 refused by WhatsApp"), noTemplateWords({ rejected: 2 }));
  for (const [status, said] of Object.entries(TEMPLATE_STATUS_WORDS))
    assert.equal(stateLabel("template", status), said, `${status} is the Library's word everywhere it is a pill`);
  assert.ok(!Object.values(TEMPLATE_STATUS_WORDS).some((w) => /reject/i.test(w)), "no one spells a refusal Rejected");
});

/* ------------------------------------------------ asked to stop ------------------------------------------------ */

test("asked to stop is one pill, one tone, one short clause and one sentence wherever it is said", () => {
  assert.equal(STOP_WORDS.pill, "Opted out");
  assert.equal(STOP_WORDS.tone, "plain", "a STOP is news and no wait (decision 0048): never the amber of Needs you");
  for (const kind of ["person", "consent"]) {
    assert.equal(stateLabel(kind, "opted_out"), STOP_WORDS.pill, kind);
    assert.equal(stateTone(kind, "opted_out"), STOP_WORDS.tone, kind);
  }
  assert.equal(STOP_WORDS.said(), "Asked to stop receiving messages");
  assert.equal(STOP_WORDS.said("Dana"), "Dana asked to stop receiving messages");
  assert.equal(HELD_REASONS.opted_out, STOP_WORDS.short, "a hold in a list of reasons");
  assert.equal(ESCALATION_REASON_SHORT.opt_out, STOP_WORDS.short);
  assert.equal(ESCALATION_REASON_LABELS.opt_out, STOP_WORDS.said(), "an Inbox row's subject");
  assert.equal(
    ESCALATION_SUMMARIES.opt_out,
    `${STOP_WORDS.said("They")}. Nothing was sent, and nothing may be.`,
    "the sentence a person reads first",
  );
  assert.ok(optOutWords("Dana").startsWith(`${STOP_WORDS.said("Dana")}.`), "the reply box's sentence");
});
