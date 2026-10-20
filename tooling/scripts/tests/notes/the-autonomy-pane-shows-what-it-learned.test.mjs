/**
 * What Settings › Autonomy draws of the owner's corrections (decision 0063), on the stub React: under Replies, how often
 * the owner changed what it wrote (and nothing with none held; Bookings' and Questions' lines are their own rows' on
 * Settings since 18 Oct 2026, business/choices); under the rows a new sequence starts by, what their sequences' batches
 * did (decision 0064); and the notes their
 * corrections suggest, each with what they wrote and Keep as a note or Dismiss, pressed through the pane's one door, the
 * row gone once it answered and its refusal said in its own words. Nothing is drawn where nothing waits or the read failed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, textOf, press } from "../_legacy-react.mjs";

installLegacyReact();
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const { PolicyTable, PolPhoneRows } =
  await import("../../../../apps/dashboard/src/surfaces/settings/autonomy/matrix.tsx");
const { LearnedFromYou } = await import("../../../../apps/dashboard/src/surfaces/settings/autonomy/learned.tsx");
const { autonomyVerbs } = await import("../../../../apps/dashboard/src/surfaces/settings/autonomy/verbs.ts");
const { heldDraftsByClass } = await import("@chanlytics/contracts");
const { uiRows } = await import("../../../../apps/dashboard/src/legacy-bridge/policy-store.ts");

const said = (tree, id) => textOf(byTestId(tree, id)).replace(/\s+/g, " ").trim();
const h = globalThis.React.createElement;
const rows = uiRows({
  rows: [
    { class: "reply", mode: "veto", limits: {} },
    { class: "booking", mode: "auto", limits: {} },
    { class: "faq", mode: "auto", limits: {} },
    { class: "reengage", mode: "ask", limits: {} },
  ],
  role: "owner",
});
const held = heldDraftsByClass([
  { intent: "booking", held: 5, sent: 4, steered: 1, canceled: 0, person_first: 0 },
  { intent: "greeting", held: 6, sent: 5, steered: 0, canceled: 1, person_first: 0 },
]);

test("Replies says how often its drafts were changed, and no other row of the matrix says a line of drafts", () => {
  fresh();
  const tree = again(() => h(PolicyTable, { rows, put() {}, busy: null, lines: { held } }));
  assert.equal(said(tree, "pol-held-reply"), "6 held for you in 30 days: 5 sent as written, 1 stopped");
  assert.equal(byTestId(tree, "pol-held-booking"), null, "a booking's drafts are the booking row's, on Settings");
  assert.equal(byTestId(tree, "pol-held-faq"), null, "no draft held under Questions: no line");
  assert.equal(byTestId(tree, "pol-held-reengage"), null, "a campaign's row holds no receptionist's drafts");
  fresh();
  const phone = again(() => h(PolPhoneRows, { rows, put() {}, busy: null, lines: { held } }));
  assert.match(textOf(byTestId(phone, "pol-phone-reply")), /6 held for you in 30 days/);
  assert.doesNotMatch(textOf(byTestId(phone, "pol-phone-book")), /held for you/);
});

test("a row a new sequence starts by says what its sequences' batches did, and a row with none of its sequences says nothing", () => {
  const evidence = [
    { sequence_id: "q-1", policy_class: "reengage", went: 4, approved: 1, stopped: 1, skipped: 0 },
    { sequence_id: "q-2", policy_class: "reengage", went: 1, approved: 0, stopped: 0, skipped: 1 },
  ];
  fresh();
  const tree = again(() => h(PolicyTable, { rows, put() {}, busy: null, lines: { held, evidence } }));
  assert.equal(
    said(tree, "pol-held-reengage"),
    "2 sequences · Last 90 days: 5 batches went: 1 after your OK, 4 on their own · you stopped 1 · 1 skipped: nobody answered in time",
  );
  assert.equal(byTestId(tree, "pol-held-faq"), null, "a class no sequence is made under says none");
  fresh();
  const phone = again(() => h(PolPhoneRows, { rows, put() {}, busy: null, lines: { evidence } }));
  assert.match(textOf(byTestId(phone, "pol-phone-reengage")), /2 sequences · Last 90 days: 5 batches went/);
});

const S1 = {
  id: "s-1",
  source: "steer",
  title: "Mondays",
  body: "We are closed on Mondays.",
  quote: "tell her we are closed on Mondays now",
  conversation_id: null,
  created_at: "2026-10-16T09:00:00Z",
};
const S2 = {
  ...S1,
  id: "s-2",
  source: "reply",
  title: "Threading",
  body: "We do eyebrow threading.",
  quote: "we do eyebrow threading",
};

test("the notes waiting: each with what the owner wrote; Keep goes through the door, and the row goes once it answered", async () => {
  const flashes = [];
  const asked = [];
  autonomyVerbs.answerFact = async (s, keep) => (
    asked.push([s.id, keep]),
    { ok: true, receipt: `Kept as a note: “${s.title}”` }
  );
  fresh();
  const draw = () => again(() => h(LearnedFromYou, { suggestions: [S1, S2], flash: (f) => flashes.push(f) }));
  let tree = draw();
  assert.match(said(tree, "rec-card-learned"), /^Learned from your corrections/);
  const text = said(tree, "rec-card-learned");
  assert.match(
    text,
    /MondaysWe are closed on Mondays\.You asked for a rewrite: “tell her we are closed on Mondays now”Keep as a noteDismiss/,
  );
  assert.match(text, /ThreadingWe do eyebrow threading\.You replied: “we do eyebrow threading”Keep as a noteDismiss/);
  press(byTestId(tree, "aut-fact-keep"));
  await new Promise((r) => setTimeout(r, 0));
  tree = draw();
  assert.deepEqual(asked, [["s-1", true]]);
  assert.doesNotMatch(said(tree, "rec-card-learned"), /Mondays/, "the answered row is gone at once");
  assert.equal(textOf(flashes.at(-1).msg), "Kept as a note: “Mondays”");
});

test("a refusal is said in its own words and the row stays; nothing is drawn where nothing waits or the read failed", async () => {
  const flashes = [];
  autonomyVerbs.answerFact = async () => ({ ok: false, message: "Your notes are full (10)." });
  fresh();
  const draw = () => again(() => h(LearnedFromYou, { suggestions: [S2], flash: (f) => flashes.push(f) }));
  press(byTestId(draw(), "aut-fact-dismiss"));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(said(draw(), "rec-card-learned"), /Threading/, "the row stays");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.match(textOf(flashes.at(-1).msg), /Not changed — Your notes are full \(10\)\./);
  for (const suggestions of [[], null, undefined]) {
    fresh();
    assert.equal(
      byTestId(
        again(() => h(LearnedFromYou, { suggestions, flash() {} })),
        "rec-card-learned",
      ),
      null,
    );
  }
});
