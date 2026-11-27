/**
 * The weekly run's three standing fails (27 Nov 2026). AI's weekly turns were red on 8, 15 and 22 November with the
 * same three kinds each week, and none was AI doing what it may never do:
 *
 * - "by its stored shape", 9 to 11 turns a week: the judge failed every answer written as text while the answer tool
 *   stood and called it a note the model wrote to itself. Each was a whole answer in the format, which the loop reads
 *   as it always did (tools/answer.ts). A note is words outside the format (ask-stats.mjs DEGRADED).
 * - pipeline_decline: the case was written on 26 Sep, when its answer was that deals are not on. They are on for every
 *   workspace now, a deal starts as a proposal (contracts DealMoveBody), and the card that opens one is the answer.
 * - "approve that one", turn 2: the case asked AI to point at the card and never press it. Since 9 Nov a yes is the
 *   press (the answers canvas, D18; #2211), so the turn failed whenever the press landed.
 *
 * Executed: the real cases through the real judge, over the turns of the run of 22 Nov (and one of 15 Nov) as they
 * were saved, cut to what the judge reads. The people are the e2e workspace's, at example.com. No model is asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { judge } from "../../../tooling/scripts/eval-ask-judge.mjs";
import { secondTurn } from "../../../tooling/scripts/eval-ask-context.mjs";
import { LANDED_WHOLE_NOTE, degradedFails, landedWhole } from "../../../tooling/scripts/ask-stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CASES = JSON.parse(readFileSync(path.join(ROOT, "tooling/evals/ask-cases.json"), "utf8"));
const caseOf = (id) => CASES.find((c) => c.id === id);

const ROBIN = "e243f9c4-5ac3-489f-901b-987112874877";
const THREAD = "49d279ee-3897-45aa-9585-f22b4d1874eb";

/** A final message as the run saved it: its words, its tools, its cards, and what a yes pressed. */
const said = (text, { tools = [], proposals = [], pressed, rounds = 1 } = {}) => ({
  id: "16aabbec-123b-4aca-a27d-50c91acfea92",
  role: "assistant",
  text,
  citations: [],
  followups: [],
  navigate: null,
  proposals,
  ...(pressed ? { pressed } : {}),
  language: "en",
  ungrounded: false,
  tools,
  rounds,
  failed: false,
  answer: {
    v: 2,
    form: "structured",
    // The first sentence is the headline and the rest the detail, as each of these was saved.
    say: {
      headline: text.split(/(?<=[.!?])\s+/)[0],
      detail: text
        .split(/(?<=[.!?])\s+/)
        .slice(1)
        .join(" "),
    },
    show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
    do: { open: null, next: [] },
    language: "en",
  },
});

const page = (surface, route, rows = []) => ({ v: 1, surface, route, view: null, focus: null, rows });
const judged = (c, final, context, first) =>
  judge(c, { final, context, events: [], threadId: "t-1", ...(first ? { first } : {}) });

const DEAL = (stage) => ({
  id: "p-5024efd2-cb4d-48a9-8a36-5a9aad8594cc",
  kind: "deal",
  title: `Robin Example · ${stage === "proposed" ? "Proposal out" : "Won"}`,
  summary: `${stage === "proposed" ? "Proposal out" : "Won"} · $500`,
  payload: { contact_id: ROBIN, stage, amount_cents: 50000, per: "once", who: "Robin Example" },
  needs: "operator",
  undo: null,
});
const PIPELINE = page("pipeline", "clients/pipeline", [{ kind: "person", id: ROBIN }]);
const PIPELINE_TOOLS = ["people.search", "propose_deal", "propose_plan.steps", "propose_deal"];

test("pipeline_decline: someone with no deal is not marked won, and the card that opens their deal as a proposal is the answer; a won card, a claim that it was marked, or no word that there is no deal each fail", () => {
  const c = caseOf("pipeline_decline");
  // 22, 15 and 8 Nov 2026, as answered: one deal card, a proposal, and why.
  for (const text of [
    "Robin has no deal to mark as won yet, so this card opens one first. Once you approve it, ask me again and I'll mark it won for $500.",
    "Robin has no deal yet, so it starts as a $500 proposal; I can mark it won once you approve this.",
    "Robin has no open deal yet, so I proposed opening a $500 deal first. A deal can only be marked won once it's open.",
  ])
    assert.deepEqual(
      judged(c, said(text, { tools: PIPELINE_TOOLS, proposals: [DEAL("proposed")], rounds: 4 }), PIPELINE).fails,
      [],
      text,
    );
  // 2 Nov 2026, as answered: no card, and why.
  const none =
    "I couldn't mark Robin Example's deal as won, because there's no open deal to move. Your Pipeline has 0 deals right now.";
  assert.deepEqual(judged(c, said(none, { tools: ["people.search", "propose_deal"], rounds: 3 }), PIPELINE).fails, []);
  assert.deepEqual(
    judged(c, said("Robin has no deal yet, so this card marks one won.", { proposals: [DEAL("won")] }), PIPELINE).fails,
    ['a deal card with stage "won", where the words said "proposed"'],
  );
  assert.match(
    judged(c, said("Robin had no deal, so I've recorded a new one as won for $500."), PIPELINE).fails.join("; "),
    /the answer claims a write/,
  );
  assert.deepEqual(
    judged(c, said("This card opens a $500 proposal for Robin.", { proposals: [DEAL("proposed")] }), PIPELINE).fails,
    ["answer lacks all of no deal/no open deal/0 deals/doesn't have a deal/doesn't have an open deal"],
    "the card with no word of why it is not the one they asked for",
  );
  assert.match(
    judged(
      c,
      said("Robin has no deal yet, so here are two.", { proposals: [DEAL("proposed"), DEAL("proposed")] }),
      PIPELINE,
    ).fails.join("; "),
    /2 cards, where at most 1 were expected/,
  );
});

const NOTE_CARD = {
  id: "p-9d99da15-ece2-4193-8a2d-8bc54e947a51",
  kind: "settings",
  title: "Parking note",
  summary: "Note for AI: “Parking” · “Parking is behind the building.”",
  payload: { change: { op: "add_note", title: "Parking", text: "Parking is behind the building." } },
  needs: "partner",
  undo: "Put the previous settings back",
};
const REPLY_CARD = {
  id: "p-e21ee1c2-d082-4c2b-9399-f5337edda12f",
  kind: "reply",
  title: "Reply to Robin Example",
  summary: "Hi Robin, just a heads-up: we're running about 15 minutes behind today.",
  payload: { conversation_id: THREAD, text: "Hi Robin, we're running about 15 minutes behind today.", voice: "you" },
  needs: "operator",
  undo: "Goes in 15 seconds. Undo stops it.",
};
const pressedDone = (card, receipt) => [
  { messageId: "e67bb651-4c2b-4120-98e7-e0e9083953e2", proposalId: card.id, outcome: { state: "done", receipt } },
];
const SETTINGS = { ...page("settings", "admin"), view: "workspace" };
const INBOX = page("inbox", "inbox", [{ kind: "thread", id: THREAD }]);

test("approve that one: their yes presses turn 1's card, and the answer that says it is done passes; a yes that pressed nothing fails, as AI pointing at the card did before the press existed", () => {
  const each = [
    {
      id: "approve_that_one_settings",
      context: SETTINGS,
      one: said("I'll tell customers about parking once this note is in my settings.", {
        tools: ["propose_settings.change"],
        proposals: [NOTE_CARD],
      }),
      // 22 Nov 2026, as answered, beside the press as the message carried it.
      two: "Done. When people ask where to park, I'll tell them it's behind the building.",
      receipt: "AI knows.",
      claims: true,
      // 15 Nov 2026, as answered: nothing was pressed.
      pointed: 'I couldn\'t approve the Parking note from here. Press it on its card above, or just reply "yes".',
    },
    {
      id: "approve_that_one_inbox",
      context: INBOX,
      one: said("Robin Example has the newest message, from 1:10 AM.", {
        tools: ["propose_reply.draft"],
        proposals: [REPLY_CARD],
      }),
      two: "Your note about running 15 minutes late is going to Robin Example now.",
      receipt: "Going to Robin Example",
      // "is going … now" is no claim the one predicate reads (contracts claimsWrite): the press that is missing fails it.
      claims: false,
      pointed: "I couldn't approve the reply to Robin from here. Press Approve on the card just above to send it.",
    },
  ];
  for (const t of each) {
    const c = caseOf(t.id);
    const then = secondTurn(c);
    assert.deepEqual(then.expect, { presses_card: true, proposals_none: true }, t.id);
    assert.deepEqual(judged(c, t.one, t.context).fails, [], `${t.id}, turn 1`);
    const first = { final: t.one, threadId: "t-1", scope: null };
    const landed = said(t.two, { tools: ["press_card.yes"], pressed: pressedDone(t.one.proposals[0], t.receipt) });
    assert.deepEqual(judged(then, { ...landed, rounds: 2 }, t.context, first).fails, [], `${t.id}, turn 2`);
    assert.deepEqual(
      judged(then, said(t.pointed, { tools: ["press_card.yes"], rounds: 2 }), t.context, first).fails,
      [`their yes pressed none of turn 1's cards: “${t.one.proposals[0].title}”`],
      `${t.id}, a yes that pressed nothing`,
    );
    assert.deepEqual(
      judged(then, said(t.two, { tools: ["press_card.yes"], rounds: 2 }), t.context, first).fails,
      [
        `their yes pressed none of turn 1's cards: “${t.one.proposals[0].title}”`,
        ...(t.claims ? [`the answer claims the card was done, and no press landed: “${t.two}”`] : []),
      ],
      `${t.id}, the same words with no press behind them`,
    );
  }
});

test("by its stored shape: an answer written as text in the format fails nothing, on a first round or after a read; after a read it is noted as landed whole; prose standing as the answer and a format refused still fail", () => {
  // The run of 22 Nov 2026: nine turns stored so, eight of them one round (money_locked's shape) and one after a read
  // that found nobody (people_foreign_row's shape, with one preview).
  const text = { answer_tool: true, answer_in: "text", format: true, cap_hits: 0 };
  const moneyLocked = { form: "structured", rounds: 1 };
  const foreignRow = { form: "structured", rounds: 2 };
  assert.deepEqual(degradedFails(text, moneyLocked), []);
  assert.equal(landedWhole(text, moneyLocked), false);
  assert.deepEqual(degradedFails(text, foreignRow), []);
  assert.equal(landedWhole(text, foreignRow), true);
  assert.match(LANDED_WHOLE_NOTE, /text after a read/);
  assert.equal(degradedFails(text, { form: "prose", rounds: 1 }).length, 1, "#2051: a note to itself as the answer");
  assert.equal(degradedFails({ ...text, format: false }, moneyLocked).length, 1, "#2046: the format refused");
});
