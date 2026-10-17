/**
 * Ask never drops part of a request without saying so (the operator stress run, 15 Oct 2026, report
 * https://claude.ai/artifact/WT9ijRXRrNfruu2H1JQHtL): "for Robin: turn the receptionist off, add a note that she prefers
 * morning appointments, and put her on a new list called Mornings" made two cards 4 times of 4, and the code's "2 cards to
 * review" answered over the list's refusal a round before; a pause of a Win-back already paused, beside a new gap, made
 * the gap's card and never said it was paused; an operator asking for what an owner approves was told a tool "isn't
 * available".
 *
 * - A turn whose cards leave out a part asked never ends on the cards' count: a proposal refused stands until the same
 *   call makes its card, and a part a card leaves as it is (ProposalOutcome.noted) stands; the round goes back, told
 *   what to say (turn-end.ts turnUnmade). An answer written beside such a card is set aside, as one beside a refused card.
 * - A member below an owner hears who can do what their tools leave out (tools/offer.ts aboveRoleWords), in the turn's
 *   words, never that a tool is missing.
 *
 * Executed: the loop over a scripted model and proposals made by the real `propose` and `refuse`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { answerForCards } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { workspaceFacts, turnWords } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { aboveRoleWords } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { propose, refuse } = await import(at("apps/dashboard/src/server/ask/tools/context.ts"));
const { turnUnmade } = await import(at("apps/dashboard/src/server/ask/turn-end.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROBIN = "abababab-abab-4aba-8aba-abababababa1";
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-15T14:00:00Z");
const NOTHING = { kind: "none", id: "", label: "" };

/** The model's answer, as it writes one: its JSON in a text block. */
const saying = (headline) => ({
  type: "text",
  id: "",
  name: "",
  text: JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NOTHING } },
    do: { open: { source: NOTHING, label: "", now: false }, next: [] },
    language: "en",
  }),
  json: "",
});
/** A call the model makes, by its tool and its input. */
const calling = (name, input) => ({
  type: "tool_use",
  id: `c-${name}.${input.action}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  text: "",
  json: JSON.stringify(input),
});
const roundOf = (blocks) => ({ blocks, stopReason: "tool_use", streamError: null });

/** The model, scripted round by round (a round may be a function of the stream's onText); each request kept. */
function modelSays(rounds) {
  const requests = [];
  return {
    requests,
    round: async (c, onText) => {
      requests.push(c.request);
      const r = rounds.shift();
      if (!r) throw new Error("the loop asked for a round the script does not have");
      return typeof r === "function" ? r(onText) : r;
    },
  };
}

/** Robin's cards, as their builders make them: the receptionist off for her, and her note. */
const MODE = () =>
  propose({
    kind: "person_mode",
    title: "Receptionist off for Robin",
    summary: "The receptionist stays silent with them",
    payload: { contact_id: ROBIN, mode: "never", previous: "inherit", who: "Robin" },
  });
const NOTE = () =>
  propose({
    kind: "note",
    title: "A note on Robin",
    summary: "Prefers morning appointments",
    payload: { contact_id: ROBIN, body: "Prefers morning appointments.", team_only: false, who: "Robin" },
  });
const LIST = () =>
  propose({
    kind: "list",
    title: "List: Mornings",
    summary: "Kept by hand: Robin",
    payload: { name: "Mornings", kept: "hand", ids: [ROBIN], names: ["Robin"], count: 1 },
  });
const STEP_REFUSED = "Step 3 (propose_list.make): name who is on it";
const ALREADY = "“Win-back” is paused, so none of this runs until it is resumed";
const GAP = () =>
  propose(
    {
      kind: "playbook_change",
      title: "Change: Win-back",
      summary: `Reaches a person again after 15 days, where it was 30 · ${ALREADY}`,
      payload: { playbook_id: PB, playbook_name: "Win-back", gap_days: 15, was: { gap_days: 30 } },
    },
    ALREADY,
  );

/** The proposals, by the call: each builder's outcome as the registry would return it. */
const byCall = (made) => async (_t, name, args) => made[`${name}.${args.action}`]();

function turnFor(over = {}) {
  const events = [];
  return {
    events,
    input: {
      ctx: { supabase: fakeDb({}), userId: "u1", email: "ada@example.com", params: {} },
      tenantId: A,
      role: "owner",
      facts: workspaceFacts("Harbor", TZ, null, NOW, []),
      timezone: TZ,
      personLabel: "ada@example.com (owner)",
      language: "en",
      scope: null,
      surface: "today",
      history: [],
      text: "for Robin: turn the receptionist off, add a note that she prefers morning appointments, and put her on a new list called Mornings",
      emit: (ev) => events.push(ev),
      now: NOW,
      ...over,
    },
  };
}
const portsFor = (model, made) => ({
  round: model.round,
  context: async () => null,
  shape: async () => "",
  tool: async () => ({ result: "{}", isError: false }),
  propose: byCall(made),
});
/** What a request told the model last: the text blocks of its last message. */
const toldLast = (request) =>
  request.messages
    .at(-1)
    .content.filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

test("REGRESSION (the stress run's Robin, 4 of 4): a plan refused, then two cards with no words, is never answered by the cards' count: the round goes back, told what no card carries, and the model's words that say it are the answer", async () => {
  const plan = calling("propose_plan", { action: "steps", steps: [] });
  const model = modelSays([
    // A plan is a draft: its round, begun at the turn's own effort, is set aside and asked again at the draft's (effort.ts).
    roundOf([plan]),
    roundOf([plan]),
    roundOf([
      calling("propose_person", { action: "mode", contact_id: ROBIN, mode: "never" }),
      calling("propose_person", { action: "note", contact_id: ROBIN, body: "Prefers morning appointments." }),
    ]),
    roundOf([
      saying(
        "Two cards: the receptionist off for Robin and her note; the Mornings list was not made, since it named nobody.",
      ),
    ]),
  ]);
  const made = {
    "propose_plan.steps": () => refuse(STEP_REFUSED),
    "propose_person.mode": MODE,
    "propose_person.note": NOTE,
  };
  const { input } = turnFor();
  const r = await runAskTurn(input, portsFor(model, made));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.rounds, 3, "a third round, for the words");
  assert.equal(model.requests.length, 4, "the plan's round asked twice, once more for the words");
  assert.equal(
    r.text,
    "Two cards: the receptionist off for Robin and her note; the Mornings list was not made, since it named nobody.",
  );
  assert.notEqual(r.answer.say.headline, answerForCards(r.proposals, "en", null, null).say.headline);
  assert.equal(r.proposals.length, 2);
  const told = toldLast(model.requests[3]);
  assert.match(
    told,
    /^Part of what they asked is no card: propose_plan\.steps was refused \(Step 3 \(propose_list\.make\)/,
  );
  assert.match(told, /Never leave one out\.$/);
});

test("cards alone are still the answer where nothing is owed: every card made in one round, or a refusal its own call made good later", async () => {
  const alone = modelSays([
    roundOf([
      calling("propose_person", { action: "mode", contact_id: ROBIN, mode: "never" }),
      calling("propose_person", { action: "note", contact_id: ROBIN, body: "Prefers morning appointments." }),
    ]),
  ]);
  const r1 = await runAskTurn(
    turnFor().input,
    portsFor(alone, { "propose_person.mode": MODE, "propose_person.note": NOTE }),
  );
  assert.deepEqual([r1.rounds, r1.answer], [1, answerForCards(r1.proposals, "en", null, null)]);

  let tries = 0;
  const retried = modelSays([
    roundOf([calling("propose_list", { action: "make", name: "Mornings", all: [], cannot: "" })]),
    roundOf([calling("propose_list", { action: "make", name: "Mornings", ids: [ROBIN], cannot: "" })]),
  ]);
  const r2 = await runAskTurn(
    turnFor().input,
    portsFor(retried, { "propose_list.make": () => (tries++ === 0 ? refuse("name who is on it") : LIST()) }),
  );
  assert.deepEqual(
    [r2.rounds, r2.text],
    [2, "One card to review: List: Mornings. Approve it, change it or dismiss it: nothing happens until you do."],
    "the list refused, then made by the same call: nothing is owed",
  );
});

test("REGRESSION (the stress run's Win-back, 3 of 3): a card that leaves out a part already so goes back to be said, the model told on the card's result and after it; an answer written beside it, before it knew, is set aside", async () => {
  const text = "pause the Win-back sequence and also make it send twice as often";
  const model = modelSays([
    roundOf([calling("propose_sequence", { action: "change", playbook_id: PB, state: "paused", gap_days: 15 })]),
    roundOf([saying("Win-back is already paused; one card halves its wait, from 30 days to 15.")]),
  ]);
  const r = await runAskTurn(turnFor({ text }).input, portsFor(model, { "propose_sequence.change": GAP }));
  assert.deepEqual(
    [r.rounds, r.text, r.proposals.length],
    [2, "Win-back is already paused; one card halves its wait, from 30 days to 15.", 1],
  );
  const back = model.requests[1].messages.at(-1).content;
  assert.ok(back[0].content.includes(`"also_say":"${ALREADY}: say so in the answer beside the card"`), back[0].content);
  assert.ok(toldLast(model.requests[1]).includes(`Part of what they asked is no card: ${ALREADY}.`));

  const claimed = saying("I proposed pausing the Win-back and halving its wait.");
  const beside = modelSays([
    // Its Say streams as it is written, before the card's result comes back.
    (onText) => {
      onText(claimed.text);
      return roundOf([
        claimed,
        calling("propose_sequence", { action: "change", playbook_id: PB, state: "paused", gap_days: 15 }),
      ]);
    },
    roundOf([saying("Win-back is already paused; one card halves its wait.")]),
  ]);
  const t = turnFor({ text });
  const r2 = await runAskTurn(t.input, portsFor(beside, { "propose_sequence.change": GAP }));
  assert.deepEqual([r2.rounds, r2.text], [2, "Win-back is already paused; one card halves its wait."]);
  assert.deepEqual(
    t.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["I proposed pausing the Win-back and halving its wait.", ""],
    "the answer beside the card, said before it knew, is taken back",
  );
});

test("what a turn owes, kept: a refusal until the same call makes its card, a part left as it is until the turn ends, and nothing owed by a call that refused nothing", () => {
  const u = turnUnmade();
  const cards = { acts: 1, calls: 1, refused: false, made: [{ kind: "note" }] };
  assert.equal(u.alone(cards), "answer");
  u.heard("propose_list.make", { isError: true, refusal: "name who is on it", result: "" });
  assert.equal(u.alone(cards), "owed");
  assert.equal(u.alone({ ...cards, refused: true }), null, "a round with a refusal of its own is the model's anyway");
  assert.equal(u.alone({ ...cards, made: [] }), null);
  assert.equal(u.alone({ ...cards, calls: 2 }), null, "a read beside the cards");
  u.heard("propose_person.note", { isError: false, result: "" });
  assert.equal(u.alone(cards), "owed", "another call's card settles nothing");
  u.heard("propose_list.make", { isError: false, result: "" });
  assert.equal(u.alone(cards), "answer", "the same call, made good");
  u.heard("propose_sequence.change", { isError: false, noted: ALREADY, result: "" });
  assert.equal(u.alone(cards), "owed");
  assert.equal(
    u.words(),
    `Part of what they asked is no card: ${ALREADY}. Propose what you still can, then answer: what the cards do and, in a short clause each, what was not made and why, or what already holds, and what they can do instead. Never leave one out.`,
  );
});

test("a note on how they like answers, its card alone, is never the whole answer (the answer canvas, D): the round goes back to answer the rest; beside another card, the cards answer as ever", () => {
  const u = turnUnmade();
  const style = { acts: 1, calls: 1, refused: false, made: [{ kind: "answer_style" }] };
  assert.equal(u.alone(style), "owed");
  assert.match(
    u.words(),
    /^The note on how they like answers is proposed as its card, which is theirs to press\. Now answer the rest/,
  );
  assert.equal(u.alone({ ...style, acts: 2, calls: 2, made: [{ kind: "answer_style" }, { kind: "note" }] }), "answer");
  u.heard("propose_list.make", { isError: true, refusal: "name who is on it", result: "" });
  assert.equal(u.alone(style), "owed");
  assert.match(
    u.words(),
    /^Part of what they asked is no card: propose_list\.make was refused/,
    "a refusal is said first",
  );
});

test("a member below an owner hears who can do what their tools leave out: an operator, the owner's and the partner's acts by what each does; a partner, the owner's; an owner and a viewer, nothing (a viewer is offered no card at all)", () => {
  const operator = aboveRoleWords("operator");
  assert.match(operator, /^Above their role, so no tool of yours proposes it: only an owner can /);
  for (const doing of [
    "change how the receptionist treats one person",
    "change how the receptionist treats these people",
    "merge two records of one person",
  ])
    assert.ok(operator.split("; only an owner or")[0].includes(doing), doing);
  for (const doing of ["change the workspace's settings", "start a lead search", "find more leads for a search"])
    assert.ok(operator.split("; only an owner or the workspace's partner can ")[1].includes(doing), doing);
  assert.ok(!operator.includes("invite someone to the team"), "no action makes an invitation: the Team page's alone");
  assert.match(operator, /never that a tool is not available/);
  assert.match(operator, /a thread taken over is that one thread, for now/);
  const partner = aboveRoleWords("partner");
  assert.match(partner, /only an owner can change how the receptionist treats one person/);
  assert.ok(!partner.includes("partner can"), "a partner's own acts are theirs");
  assert.equal(aboveRoleWords("owner"), null);
  assert.equal(aboveRoleWords("viewer"), null);
  // Said in the turn's words, after who they are, and never to an owner.
  const words = (role, above) =>
    turnWords({
      role,
      personLabel: `ada@example.com (${role})`,
      scope: null,
      surface: null,
      language: "en",
      timezone: TZ,
      closures: [],
      now: NOW,
      above,
    });
  assert.ok(words("operator", operator).includes(`an operator: they can reply`), "who they are first");
  assert.ok(words("operator", operator).includes(operator));
  assert.ok(!words("owner", null).includes("Above their role"));
});

test("the loop says it in an operator's turn, from the role it is asked as", async () => {
  const model = modelSays([roundOf([saying("Only an owner can find new leads; ask one to.")])]);
  const { input } = turnFor({
    role: "operator",
    personLabel: "ada@example.com (operator)",
    text: "find 50 dentists in Miami",
  });
  await runAskTurn(input, portsFor(model, {}));
  const first = JSON.stringify(model.requests[0].messages);
  assert.ok(first.includes("only an owner or the workspace's partner can"), "the operator's turn says whose it is");
  assert.ok(first.includes("start a lead search"));
  const owner = modelSays([roundOf([saying("Proposing it.")])]);
  await runAskTurn(turnFor().input, portsFor(owner, {}));
  assert.ok(!JSON.stringify(owner.requests[0].messages).includes("Above their role"), "never in an owner's");
});
