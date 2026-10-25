/**
 * A sequence's head draws what its judge offers (decision 0072, contracts sequenceActsOf), and nothing else: the head's
 * one act, its More on a desk and on a phone, a draft's notice and a phone's dock, drawn over records as GET
 * sequences/:id answers them. Where the judge and the page used to part: a sequence on and never run offers Discard,
 * not End it; one that ran, End it, not Discard; a sequence to leads is let go of while it has written nothing, renamed
 * like any, and never ended.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEQUENCE_ACT_WORDS, SEQUENCE_WORDS, sequenceActsOf, stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId } from "../../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";

installLegacyReact({
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  useHotkey: () => {},
});
const S = "../../../../../apps/dashboard/src";
(await import(`${S}/legacy-bridge/zone.ts`)).installClock();
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { useRecordActs, HeadActs, RecordNotice, phoneFootOf } = await import(
  `${S}/surfaces/campaigns/sequences/record-acts.tsx`
);

const needs = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const first = (state) => ({
  id: "q1",
  kind: "moment",
  trigger: "quiet_30",
  state,
  policy_class: "reengage",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: "2026-09-01T10:00:00.000Z",
  template_name: "come_back",
  template_language: "en_US",
});
/** A record as GET sequences/:id answers it: a moment's sequence on, by default, its first step running. */
const rec = (over = {}, past = {}) => ({
  sequence: {
    id: "q1",
    name: "Win-back",
    starts: "moment",
    state: "on",
    mode: "ask",
    created_at: "2026-09-01T12:00:00Z",
    first: first(over.state === "on" || over.state === undefined ? "running" : "paused"),
    date: null,
    steps: 1,
    channels: ["whatsapp"],
    needs,
    next: null,
    last: null,
    in_it: 0,
    ...over,
  },
  steps: [],
  timezone: ZONE,
  word: "appointment",
  chain: null,
  ...past,
});

/** The record's head, its notice and, on a phone, its dock, drawn as the record draws them. */
function Head({ record, phone }) {
  const a = useRecordActs(
    record,
    () => {},
    () => {},
    { step() {}, how() {} },
  );
  const h = globalThis.React.createElement;
  return h(
    "div",
    null,
    h(HeadActs, { a, phone }),
    h(RecordNotice, { a, tab: "steps" }),
    phone ? phoneFootOf(a, "steps") : null,
  );
}
const draw = (record, phone = false) => {
  fresh();
  return again(() => globalThis.React.createElement(Head, { record, phone }));
};
/** What the head's More lists, by its words. */
const moreOf = (tree) =>
  all(tree, (n) => Array.isArray(n.props?.groups))
    .flatMap((m) => m.props.groups.flatMap((g) => g.items.map((i) => i.label)))
    .filter((label, i, labels) => labels.indexOf(label) === i);
const DISCARD = `${SEQUENCE_WORDS.discard}…`;
const END = `${SEQUENCE_WORDS.end}…`;

test("a sequence on and never run offers Discard in its More, never End it; one that ran, End it, never Discard", () => {
  const fresh = draw(rec({}, { ran: false }));
  assert.ok(moreOf(fresh).includes(DISCARD), "on and never run: Discard");
  assert.ok(!moreOf(fresh).includes(END), "and no End it, which would take it away the same");
  assert.ok(byTestId(fresh, "sq-state"), "its one act, Pause");
  const ran = draw(rec({}, { ran: true }));
  assert.ok(moreOf(ran).includes(END), "one that ran: End it");
  assert.ok(!moreOf(ran).includes(DISCARD), "and no Discard, which its door refuses");
  assert.ok(moreOf(ran).includes(SEQUENCE_ACT_WORDS.rename));
  // Its past unread: no Discard, which might be refused; End it stays, going the same either way.
  const unread = draw(rec());
  assert.ok(!moreOf(unread).includes(DISCARD) && moreOf(unread).includes(END));
});

test("a draft starts from its head and is discarded from its notice; never ended", () => {
  const tree = draw(rec({ state: "draft" }));
  assert.ok(byTestId(tree, "sq-start"), "Start, its one act");
  assert.ok(byTestId(tree, "sq-discard-ask"), "Discard, on its notice");
  assert.ok(!moreOf(tree).includes(END));
  assert.ok(!moreOf(tree).includes(DISCARD), "a draft's Discard is its notice's, not its More's too");
  const phone = draw(rec({ state: "draft" }), true);
  assert.ok(moreOf(phone).includes(DISCARD), "a phone's More holds it");
  assert.ok(byTestId(phone, "sq-start"), "and its dock, Start");
});

test("a sequence to leads is let go of while it has written nothing, renamed like any, and never ended", () => {
  const leads = (over, past) => rec({ starts: "leads", ...over }, past);
  const draft = draw(leads({ state: "draft" }));
  assert.ok(byTestId(draft, "sq-discard-ask"), "a draft to leads is discarded: its door takes it");
  assert.ok(moreOf(draft).includes(SEQUENCE_ACT_WORDS.rename), "and renamed");
  const wrote = draw(leads({}, { wrote: true }));
  assert.ok(!moreOf(wrote).includes(DISCARD), "one that wrote is paused, never let go of");
  assert.ok(!moreOf(wrote).includes(END), "nor ended");
  assert.ok(moreOf(wrote).includes(SEQUENCE_ACT_WORDS.rename));
  const quiet = draw(leads({}, { wrote: false }));
  assert.ok(moreOf(quiet).includes(DISCARD), "one on that wrote nothing is let go of");
});

test("the head draws each act its judge offers, for every record above, and none it does not", () => {
  // Pause and Turn on are the head's one act on a desk; the rest are its More's. A draft's Discard is its notice's.
  const MORE = { run_now: SEQUENCE_ACT_WORDS.runNow, rename: SEQUENCE_ACT_WORDS.rename, end: END };
  for (const record of [
    rec({}, { ran: true }),
    rec({}, { ran: false }),
    rec({ state: "paused" }, { ran: true }),
    rec({ starts: "leads" }, { wrote: true }),
  ]) {
    const acts = sequenceActsOf(record, { tz: ZONE, nowMs: Date.now() });
    const more = moreOf(draw(record));
    for (const [act, words] of Object.entries(MORE))
      assert.equal(more.includes(words), acts[act].ok, `${act}: ${words}`);
    assert.equal(more.includes(DISCARD), acts.discard.ok, "discard");
  }
});
