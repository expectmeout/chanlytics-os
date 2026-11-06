/**
 * Ask's cold email card says what holds it on its sheet (decision 0088 reached a campaign's card and not this one: on
 * 3 November 2026 both real cold email turns said the hand-over line again beside a card that carried it in its summary
 * alone). The card is built by its own action's handler (act/sequence.ts proposeColdEmail, its words act/leads/cold-email-card.ts)
 * through the real registry over a workspace in memory: with no mailbox connected the owner sends each email, which is the
 * sheet's one hold; with one connected the mailboxes send, a row and no hold. The summary stays what it was, word for
 * word, for the turns stored before the sheet. The model is told the hold beside the card's title, alone and as a plan's
 * step, so the setup rule's last sentence has what to leave out. The Line's rules then see it (contracts holdsAlike,
 * wordsLessHolds), and the Line draws the sheet as it draws a campaign's, EXECUTED on the stub React last.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { holdsAlike, wordsLessHolds } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-11-03T01:05:00Z");
const SEARCH = "64e5040f-ef56-4b74-9680-2d44026f4799";
const HOLD = "Each email is handed to you to send from your own inbox.";
const WAITS = "Its first run is planned once approved, and waits for your say before an email goes.";

/** The 3 November turn's cold email, as the model asked for it: a first email, then one follow-up four days later. */
const INPUT = {
  name: "Personal trainers · Austin",
  search_id: SEARCH,
  steps: [
    {
      subject: "A quick question for {business_name}",
      body: "{{opening}}\n\nHi {first_name},\n\nWould you be open to a short call this week or next?\n\nThanks,",
    },
    { body: "Hi {first_name},\n\nJust following up on my note below.\n\nThanks,", after_days: 4 },
  ],
};

/** The workspace: the Austin search, and its mailboxes as given (none, or one connected). */
const worldOf = (mailboxes) =>
  fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "e2e" }, created_at: "2026-01-01" },
      ],
      tenants: [{ id: A, name: "Chanlytics E2E Studio", timezone: TZ, config: {} }],
      policies: [],
      lead_searches_view: [{ id: SEARCH, tenant_id: A, name: "Personal trainers · Austin" }],
      mailbox_connections: mailboxes,
      profiles: [],
    },
    {},
    {},
  );
/** A mailbox connected and sending, every column as the table holds it. */
const CONNECTED = rows.mailboxConnection({ tenant_id: A, state: "connected" });
const contextOver = (mailboxes) =>
  newToolContext(
    { supabase: worldOf(mailboxes), userId: USER, email: "owner@example.com", params: {} },
    A,
    "operator",
    TZ,
    NOW,
  );
/** The card as the model's call builds it over `mailboxes`, and what the model is told of it; `more` is what else it asks. */
async function card(mailboxes, more = {}) {
  const out = await buildProposal(contextOver(mailboxes), "propose_sequence", {
    action: "cold_email",
    ...INPUT,
    ...more,
  });
  assert.ok(out.proposal, out.result);
  return { card: out.proposal, told: JSON.parse(out.result) };
}

test("with no mailbox connected, the sheet holds the hand-over, read first, over the rows an owner checks; the summary stays what it was", async () => {
  const { card: p } = await card([]);
  assert.equal(p.kind, "reach_out_make");
  assert.equal(p.payload.chain.owner_sends, true, "nobody else can send it");
  assert.deepEqual(p.sheet, {
    holds: [HOLD],
    rows: [
      { label: "To", value: "“Personal trainers · Austin”" },
      { label: "First email", value: "“A quick question for {business_name}”" },
      { label: "Then", value: "After 4 days: a reply in the same thread" },
      { label: "Pace", value: "One every 20 minutes" },
      { label: "Sends", value: WAITS, aside: true },
    ],
  });
  assert.equal(
    p.summary,
    "To “Personal trainers · Austin”, each email handed to you to send from your own inbox, one every 20 minutes: first: “A quick question for {business_name}”; after 4 days: a reply in the same thread. Its first run is planned once approved, and waits for your say before an email goes.",
    "the words a turn stored before the sheet draws, and Copy takes",
  );
});

test("with a mailbox connected nothing holds it: the mailboxes send, a row under the pace", async () => {
  const { card: p } = await card([CONNECTED]);
  assert.equal(p.payload.chain.owner_sends, false);
  assert.deepEqual(p.sheet.holds, []);
  assert.deepEqual(p.sheet.rows.map((r) => [r.label, r.value]).slice(3), [
    ["Pace", "One every 20 minutes"],
    ["From", "Your connected mailboxes"],
    ["Sends", WAITS],
  ]);
  assert.match(p.summary, /, from your connected mailboxes, one every 20 minutes: /);
});

test("the owner asked to send them: the hold stands whatever is connected; one email alone has no Then", async () => {
  const { card: p } = await card([CONNECTED], { owner_sends: true, steps: INPUT.steps.slice(0, 1) });
  assert.deepEqual(p.sheet.holds, [HOLD]);
  assert.deepEqual(
    p.sheet.rows.map((r) => r.label),
    ["To", "First email", "Pace", "Sends"],
    "who sends is said once on the card: as its hold",
  );
});

test("the model is told what holds the card beside its title: alone, and as each step of a plan", async () => {
  const { told } = await card([]);
  assert.deepEqual([told.card, told.holds], ["Cold email: Personal trainers · Austin", [HOLD]]);
  assert.equal("holds" in (await card([CONNECTED])).told, false, "nothing holds it: nothing to leave out");
  const step = { tool: "propose_sequence", action: "cold_email", input: INPUT };
  const plan = await buildProposal(contextOver([]), "propose_plan", {
    action: "steps",
    steps: [step, { ...step, input: { ...INPUT, name: "Dentists · Austin" } }],
  });
  assert.equal(plan.proposals?.length, 2, plan.result);
  assert.deepEqual(
    JSON.parse(plan.result).steps.map((s) => [s.n, s.card, s.holds]),
    [
      [1, "Cold email: Personal trainers · Austin", [HOLD]],
      [2, "Cold email: Dentists · Austin", [HOLD]],
    ],
  );
});

test("the Line's rules see it: two such cards say the hold once over them, and the answer's line that only repeats it is not drawn", async () => {
  const { card: a } = await card([]);
  const { card: b } = await card([], { name: "Dentists · Austin" });
  assert.deepEqual(holdsAlike([a, b]), [HOLD]);
  const own = "No mailbox is connected; to have them go from one, connect it under Settings.";
  assert.equal(wordsLessHolds(`${HOLD}\n${own}`, [a]), own);
  assert.equal(wordsLessHolds(`> [!WARNING]\n> ${HOLD}\n\n${own}`, [a]), own, "a callout left with no words goes");
  // The 3 November answer's line says the hold among words of its own (why, and the door), which no card carries: it stays
  // whole, and leaving the hold out of it is the setup rule's to ask of the model.
  const said =
    "No mailbox is connected, so nothing sends by itself. Each email will be handed to you to send from your own inbox. To have them go from a mailbox, connect one under Settings.";
  assert.equal(wordsLessHolds(said, [a]), said);
});

// Last, since it puts a window on the global: the stub React draws the real card as the Line does (surfaces/ask/card.tsx).
test("the Line draws it as it draws a campaign's: the hold first in its own tone, the rows, and Sends behind Details", async () => {
  const { card: p } = await card([]);
  const { installLegacyReact, fresh, again, all, textOf, press, kitPages } = await import("../../_legacy-react.mjs");
  installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
  Object.assign(globalThis.window, kitPages);
  Object.assign(globalThis, { canDo: () => true, gate: () => ({}) });
  const { AskCards } = await import(at("apps/dashboard/src/surfaces/ask/card.tsx"));
  const { askText } = await import(at("apps/dashboard/src/surfaces/ask/words.ts"));
  const { holdAsk } = await import(at("apps/dashboard/src/surfaces/legacy-verbs.ts"));
  holdAsk({
    commit: async () => ({ ok: true, receipt: "It runs", undo: null }),
    outcome: async () => true,
    undoOpen: () => false,
    cardOpenRoute: () => "campaigns/sequences",
  });
  const W = globalThis.window;
  const draw = () => W.React.createElement(AskCards, { cards: [p], t: askText("en"), onNav() {} });
  fresh();
  const tree = draw();
  const testid = (t2, id) => all(t2, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
  assert.ok(testid(tree, "ask-card-sheet")[0], "a sheet, not the summary");
  assert.deepEqual(
    all(tree, (n) => n.props?.className === "ask-spec-hold").map(textOf),
    [HOLD],
    "the hold, once, in the warn tone",
  );
  const words = textOf(tree);
  assert.match(words, /To“Personal trainers · Austin”/);
  assert.match(words, /First email“A quick question for \{business_name\}”/);
  assert.match(words, /ThenAfter 4 days: a reply in the same thread/);
  assert.match(words, /PaceOne every 20 minutes/);
  assert.doesNotMatch(words, /Its first run is planned/, "Sends waits behind Details");
  assert.equal(words.split("handed to you").length - 1, 1, "the summary is not drawn beside the sheet");
  press(testid(tree, "ask-card-details")[0]);
  assert.match(
    textOf(again(draw)),
    /SendsIts first run is planned once approved, and waits for your say before an email goes\./,
  );
});
