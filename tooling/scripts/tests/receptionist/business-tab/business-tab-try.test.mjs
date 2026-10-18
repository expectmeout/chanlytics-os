/**
 * Settings › How it answers, Try it (business/try/try-it.tsx, contracts business-tab/try-it.ts): a message written as
 * a customer would, answered by the receptionist as it stands, and why. What each answer says (tryItVM, over the eval
 * door's `then`), and the card on the page: one row and its act at rest, the box in a fold the act opens, the answer
 * and its reasons drawn under the message, a refusal under the box, six messages at most, Close letting the
 * conversation go, and nothing for a role that may not change the settings.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, REPLY_DELAY_DEFAULT_MS, TRY_IT_WORDS, TRY_IT_MAX_EXCHANGES, tryItVM } from "@chanlytics/contracts";
import { unmount, all, find, byTestId, textOf, press, settle, classes } from "../../_legacy-react.mjs";
import { W, drawTab, redrawTab, foldOf, openFold, openFolds } from "../../_business-tab-harness.mjs";

after(() => unmount());

// The card's door, as the page imports it: by the same path the app's modules are imported by (the parts harness says
// why), so a stand-in assigned here is the one the card calls.
const BIZ = "../../../../../apps/dashboard/src/surfaces/settings/business";
const { tryVerbs } = await import(`${BIZ}/try/verbs.ts`);

const META = {
  intent: "hours",
  confidence: 0.92,
  reason: "asked the hours",
  facts_used: ["hours", "closures"],
  language: "en",
};
const THEN = {
  mode: "auto",
  text: "We're open Saturday 9 to 3.",
  changed: null,
  escalate: false,
  reason: null,
  hold_ms: 0,
  held_for: null,
  min_confidence: 0,
};
const answer = (then = {}, over = {}) => ({
  text: "We're open Saturday 9 to 3.",
  meta: META,
  then: { ...THEN, ...then },
  ...over,
});

/* ------------------------------------ what each answer says ------------------------------------ */

test("an answer says what a customer would read, what it read the message as, how sure, what it leaned on, its reason, and that it sends on its own", () => {
  const vm = tryItVM(answer());
  assert.equal(vm.said, "We're open Saturday 9 to 3.");
  assert.equal(vm.wrote, null, "nothing replaced its words");
  assert.deepEqual(
    vm.rows.map((r) => [r.label, r.value]),
    [
      ["Read it as", "Hours"],
      ["How sure", "92%"],
      ["Leaned on", "hours, closures"],
      ["Its reason", "asked the hours"],
    ],
  );
  assert.deepEqual(vm.then, { words: "It would send this right away.", tone: "sends" });
  assert.equal(
    tryItVM(answer({}, { meta: { ...META, facts_used: [] } })).rows.find((r) => r.key === "leaned").value,
    TRY_IT_WORDS.noFacts,
    "an answer that leaned on nothing of yours says so",
  );
});

test("what happens next, by the reply row's mode, the hold and a hand-off, each in the Autonomy pane's own words", () => {
  const words = (then, over) => tryItVM(answer(then, over)).then;
  assert.deepEqual(words({ mode: "veto", hold_ms: REPLY_DELAY_DEFAULT_MS, held_for: "veto_window" }), {
    words: "It would wait 30 seconds for you to stop it, then send this.",
    tone: "waits",
  });
  assert.deepEqual(
    words(
      { hold_ms: REPLY_DELAY_DEFAULT_MS, held_for: "low_confidence", min_confidence: 0.9 },
      { meta: { ...META, confidence: 0.62 } },
    ),
    { words: "It is 62% sure, under your 90%, so it would wait 30 seconds for you, then send this.", tone: "waits" },
  );
  assert.equal(
    words({ mode: "veto", hold_ms: 2 * MIN_MS, held_for: "veto_window" }).words,
    "It would wait 2 minutes for you to stop it, then send this.",
  );
  assert.deepEqual(words({ mode: "ask" }), {
    words: "Replies are set to Asks you, so it would not answer this: it waits for you.",
    tone: "yours",
  });
  assert.equal(
    words({ mode: "never" }).words,
    "Replies are set to Stays quiet, so it would not answer this: it stays out.",
  );
  // A hand-off: the words go out, and the conversation is a person's, said by why.
  assert.deepEqual(words({ escalate: true, reason: "human_token" }, { meta: { ...META, reason: "wants the owner" } }), {
    words: "It would send this right away. Then the conversation is yours: it hands this to you.",
    tone: "yours",
  });
  assert.equal(
    words({ escalate: true, reason: "policy_ask", changed: "booking" }).words,
    "It would send this right away. Then the conversation is yours: Book · reschedule is set to Asks you.",
  );
  assert.equal(
    words({ escalate: true, reason: "booking_request" }).words,
    "It would send this right away. Then the conversation is yours: asked to book a time — confirm it or say you can't.",
  );
});

test("where your rules replaced its words, the customer's line is what is said and what it wrote is shown beside it", () => {
  const vm = tryItVM(
    answer(
      {
        text: "Prices are quoted in person.",
        changed: "price",
        escalate: true,
        reason: "policy_block",
      },
      { text: "A cut is $40." },
    ),
  );
  assert.equal(vm.said, "Prices are quoted in person.");
  assert.equal(vm.wrote, "A cut is $40.");
  assert.equal(
    vm.then.words,
    "It would send this right away. Then the conversation is yours: your rule never lets it quote a price.",
  );
  assert.equal(
    tryItVM(answer({}, { booking: { slot: "2026-10-18T10:00", service: "Cut" } })).then.words,
    "It would send this right away. It would ask your team to confirm the time it offered.",
    "a picked time is a request a person confirms",
  );
  assert.deepEqual(
    tryItVM({ text: "x", meta: null, then: null }),
    { said: "x", wrote: null, rows: [], then: { words: TRY_IT_WORDS.failed, tone: "yours" } },
    "an answer with no record and no verdict says it could not answer",
  );
});

/* ------------------------------------ the card ------------------------------------ */

const asked = [];
/** The door stood in: what it was asked, and the answer it gives (or the refusal). */
const standIn = (reply) => {
  asked.length = 0;
  tryVerbs.ask = async (text, history) => {
    asked.push({ text, history });
    return reply(text, history);
  };
};
/** The box a customer's message is written in: the kit's field, inside the fold. */
const boxOf = (tree) => find(foldOf(tree, "try"), (n) => n.type === "input" && classes(n).includes("rec-input"));
const formOf = (tree) => find(foldOf(tree, "try"), (n) => n.type === "form");
const write = (tree, text) => boxOf(tree).props.onChange({ target: { value: text } });
const send = async (tree) => {
  await formOf(tree).props.onSubmit({ preventDefault() {} });
  await settle();
};

test("at rest Try it is one row and its act; the act opens the box under it, and an answer draws under the message with why", async () => {
  standIn((text) => ({ ok: true, vm: tryItVM(answer({}, { text: `Re: ${text}` })) }));
  let tree = drawTab({ part: "receptionist" });
  const card = byTestId(tree, "rec-card-try");
  assert.ok(card, "the last card of How it answers");
  assert.equal(textOf(byTestId(card, "rec-row-try")).includes(TRY_IT_WORDS.row.value), true);
  assert.deepEqual(openFolds(tree), [], "nothing open at rest: the box is in a closed fold");

  openFold(tree, "try");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["try"]);
  write(tree, "Are you open Saturday?");
  tree = redrawTab();
  await send(tree);
  tree = redrawTab();
  assert.deepEqual(
    asked,
    [{ text: "Are you open Saturday?", history: [] }],
    "the first message, with nothing before it",
  );
  const turn = byTestId(tree, "bt-try-turn-0");
  assert.ok(turn, "the message and its answer");
  assert.match(textOf(turn), /Are you open Saturday\?/);
  assert.match(textOf(turn), /We're open Saturday 9 to 3\./, "what a customer would read");
  for (const words of [
    "Read it as",
    "Hours",
    "92%",
    "hours, closures",
    "asked the hours",
    "It would send this right away.",
  ])
    assert.ok(textOf(turn).includes(words), words);
  assert.equal(boxOf(tree).props.value, "", "the box is empty for the next message");

  // The next message carries the conversation so far: what was written and what the customer read back.
  write(tree, "And Sunday?");
  tree = redrawTab();
  await send(tree);
  tree = redrawTab();
  assert.deepEqual(asked[1].history, [
    { role: "user", content: "Are you open Saturday?" },
    { role: "assistant", content: "We're open Saturday 9 to 3." },
  ]);
  assert.ok(byTestId(tree, "bt-try-turn-1"));

  // Start over lets the conversation go and keeps the box.
  press(byTestId(tree, "bt-try-again"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "bt-try-turn-0"), null);
  assert.deepEqual(openFolds(tree), ["try"]);
});

test("a refusal is said under the box and keeps what was written; six messages and the box gives way to starting over; Close lets it go", async () => {
  standIn(() => ({ ok: false, message: "It could not answer just now." }));
  let tree = drawTab({ part: "receptionist" });
  openFold(tree, "try");
  tree = redrawTab();
  write(tree, "Hi");
  tree = redrawTab();
  await send(tree);
  tree = redrawTab();
  const problem = find(foldOf(tree, "try"), (n) => n.type === W.FieldError);
  assert.equal(problem.props.message, "It could not answer just now.");
  assert.equal(boxOf(tree).props.value, "Hi", "the words stay to send again");

  standIn((text) => ({ ok: true, vm: tryItVM(answer({ text: `Re: ${text}` })) }));
  for (let i = 0; i < TRY_IT_MAX_EXCHANGES; i++) {
    write(tree, `Message ${i}`);
    tree = redrawTab();
    await send(tree);
    tree = redrawTab();
  }
  assert.equal(all(tree, (n) => /^bt-try-turn-\d+$/.test(n.props?.["data-testid"] || "")).length, 6);
  assert.equal(boxOf(tree), null, "no box past six");
  assert.equal(textOf(byTestId(tree, "bt-try-full")), TRY_IT_WORDS.full);

  press(byTestId(tree, "rec-fold-close-try"));
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);
  openFold(tree, "try");
  tree = redrawTab();
  assert.equal(byTestId(tree, "bt-try-turn-0"), null, "opened again, it starts empty: nothing of a try is kept");
});

test("a role that may not change the settings is offered no Try it at all", () => {
  const was = W.ST_STORE;
  try {
    W.ST_STORE = { can: () => false, myRole: () => "viewer" };
    const tree = drawTab({ part: "receptionist" });
    assert.equal(byTestId(tree, "rec-card-try"), null);
  } finally {
    W.ST_STORE = was;
  }
});
