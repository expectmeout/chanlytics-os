/**
 * A visit that has ended and nobody has marked asks "Did they come?" on the person's page too (decision 0047; D1-visit-mark of the
 * wiring plan, task 4.4).
 *
 * Kept and Missed could be pressed in one place, the Calendar's panel, which the owner had to open from the board to find the
 * block. The person's History and Up next now carry the same two presses on a visit nobody has marked (Coming up's rows are
 * doors and ask nothing, canvas A), through the same door (POST calendar/visits/[id]) and the same gate, and the word the
 * Calendar's panel says (Past, never 'Past visit'). The presses sit beside the row's door and not in it: a press inside a
 * link is the link's.
 *
 * Run on the page's parts drawn on the stub React over the person's view model (the timeline the History draws, Coming up),
 * and on the shared parts (VisitAsk, VisitActs, VisitState) with the door handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPersonVM } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  byTestId,
  textOf,
  classes,
  press,
  settle,
} from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact({
  __DEMO_MODE: false,
  appNavigate: () => {},
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
});
const W = globalThis.window;
const P = "apps/dashboard/src/surfaces";
const { PersonTimeline } = await importSrc(`${P}/people/person/timeline.tsx`);
const { comingUpSection } = await importSrc(`${P}/people/person/sections.tsx`);
const { VisitAsk, VisitActs, VisitState } = await importSrc(`${P}/visit-line.tsx`);

const H = 3_600_000;
const TZ = "America/New_York";
/** Friday 18 September 2026, 4 PM in New York. */
const NOW = Date.parse("2026-09-18T20:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const ROW = {
  id: "p-maria",
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 0,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: null,
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: null,
  last_message_direction: null,
  last_message_sender: null,
  last_inbound_text: null,
  last_inbound_at: null,
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: null,
  earliest_row_at: null,
  has_backfill: false,
  has_chat: false,
  queued_reply_at: null,
};
/** A visit of Maria's `fromH` hours from now, an hour long, on the record's row `r-<id>`. */
const visit = (id, fromH, over = {}) => ({
  id,
  start: iso(NOW + fromH * H),
  end: iso(NOW + (fromH + 1) * H),
  title: "Colour",
  all_day: false,
  via: "phone",
  record_id: `r-${id}`,
  ...over,
});
const person = (visits) =>
  toPersonVM(
    {
      row: ROW,
      identities: [],
      conversations: [],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, all: visits },
    },
    TZ,
    new Date(NOW),
  );
/** Ended and unmarked (a), kept (k), missed (m); under way and unmarked (u); still ahead (f). */
const vm = () =>
  person([
    visit("a", -48),
    visit("k", -72, { said: "kept" }),
    visit("m", -96, { said: "missed" }),
    visit("u", -0.25),
    visit("f", 30),
  ]);

/** The History as the page draws it: the timeline without the visits ahead (Coming up's). */
const history = (p) => {
  fresh();
  return W.React.createElement(PersonTimeline, {
    items: p.timeline.filter((i) => !i.ahead),
    initials: p.initials,
    name: p.name,
  });
};
const hasClass = (name) => (n) => classes(n).includes(name);
const buttonsOf = (tree) => all(tree, (n) => n.type === "button").map((n) => textOf(n).trim());

test("History: a visit nobody has marked asks 'Did they come?' beside its door, not in it; a marked one is the link it was", () => {
  const tree = history(vm());
  const rows = all(tree, hasClass("cl-tl-row")).filter((n) => /Colour/.test(textOf(n)));
  assert.deepEqual(
    rows.map((n) => /(Past|Kept|Missed|Booked) · Colour/.exec(textOf(n))?.[0]),
    ["Past · Colour", "Kept · Colour", "Missed · Colour"],
    "one word for a visit that has ended: Past, as the Calendar's panel says it; the visit under way and the one ahead are Coming up's",
  );
  const [ended, kept, missed] = rows;
  assert.equal(ended.props["data-testid"], "timeline-visit-asking");
  assert.notEqual(ended.type, "a", "a press inside a link is the link's: the row is not one");
  assert.ok(textOf(ended).includes("Did they come?"), textOf(ended));
  const ask = byTestId(ended, "timeline-visit-ask");
  assert.deepEqual(buttonsOf(ask), ["Kept", "Missed"], "the two presses, never Cancelled");
  const door = all(ended, (n) => n.type === "a" && n.props["data-testid"] === "timeline-open")[0];
  assert.equal(textOf(door).trim(), "Open the appointment", "the row's door is words of its own, a link");
  assert.match(door.props.href, /calendar\/2026-09-1[67]:a-r-a$/, door.props.href);
  assert.equal(all(ended, hasClass("cl-tl-go")).length, 0, "no arrow: the row is not the door");
  // A kept visit and a missed one are links, as every row with somewhere to go is, and ask nothing. The row is the door
  // itself, whole, so it draws no arrow of its own (canvas A, D3).
  for (const r of [kept, missed]) {
    assert.equal(r.type, "a");
    assert.equal(byTestId(r, "timeline-visit-ask"), null);
    assert.equal(all(r, hasClass("cl-tl-go")).length, 0, "the row is the door: no arrow of its own");
  }
});

test("Coming up: each visit is its door and asks nothing (canvas A: whether they came is Up next's to ask); a visit under way and nobody has marked is Up next's question, with the same two presses; a guess says so in the one set of words", () => {
  const p = person([visit("u", -0.25, { via: "name" }), visit("f", 30)]);
  fresh();
  const section = comingUpSection(p.comingUp);
  const items = all(section, hasClass("cl-prof-up-item"));
  assert.equal(items.length, 2);
  const [under, ahead] = items;
  assert.ok(byTestId(under, "person-visit-ahead"), "the door is a link of its own");
  assert.equal(byTestId(under, "person-visit-ask"), null, "under way: Up next asks it, not Coming up");
  assert.equal(byTestId(ahead, "person-visit-ask"), null, "ahead: nothing to say yet");
  assert.ok(textOf(under).includes("matched by name"), textOf(under));
  assert.ok(!textOf(ahead).includes("matched"), "an exact match is not a guess to say");
  assert.equal(comingUpSection([]), false, "nothing coming up, no section");
  // Up next asks the one under way, today's, in plain words ("come today", never "come on Today"), with Kept and Missed.
  const asked = p.next.rows.find((r) => r.act.kind === "visit");
  assert.equal(asked?.title, "Did Maria come today?");
  assert.equal(asked.act.label, "Kept · Missed");
  assert.equal(asked.act.line.id, p.comingUp[0].visit.id, "the visit under way, the one Coming up draws first");
});

test("a press says the word through the door, on the record's row, and the word replaces the presses until the page reads again; a refusal is the door's sentence and the presses stay", async () => {
  const line = vm().timeline.find((i) => i.id === "v-a").visit;
  const asked = [];
  let answer = async () => ({ ok: true });
  const door = (id, status) => {
    asked.push([id, status]);
    return answer();
  };
  const thunk = () => W.React.createElement(VisitAsk, { line, testid: "ask", door });
  fresh();
  let tree = again(thunk);
  assert.deepEqual(buttonsOf(tree), ["Kept", "Missed"]);
  assert.equal(byTestId(tree, "ask-act-kept").props.disabled, false);
  // Refused: the door's own sentence, and both presses are still there.
  answer = async () => ({ ok: false, message: "It hasn't begun yet: whether they came is said once it has." });
  press(byTestId(tree, "ask-act-missed"));
  await settle();
  tree = again(thunk);
  assert.deepEqual(asked, [["r-a", "missed"]]);
  assert.equal(
    textOf(byTestId(tree, "ask-act-refused")),
    "It hasn't begun yet: whether they came is said once it has.",
  );
  assert.deepEqual(buttonsOf(tree), ["Kept", "Missed"]);
  // Taken: the word, said where the presses were.
  answer = async () => ({ ok: true });
  press(byTestId(tree, "ask-act-kept"));
  await settle();
  tree = again(thunk);
  assert.deepEqual(asked.at(-1), ["r-a", "kept"]);
  assert.equal(textOf(byTestId(tree, "ask-act-said")), "Kept");
  assert.deepEqual(buttonsOf(tree), [], "said once: the presses are gone until the page reads again");
  // A visit marked since (the page read again) asks nothing, and a visit with nothing to say has no presses at all.
  const marked = vm().timeline.find((i) => i.id === "v-k").visit;
  fresh();
  assert.equal(W.React.createElement(VisitAsk, { line: marked, testid: "x" }).rendered, null);
  assert.equal(W.React.createElement(VisitActs, { mark: line.mark, acts: [], testid: "y" }).rendered, null);
});

test("how a visit stands is the kit's pill in the tone its state wears; nothing while it is ahead", () => {
  fresh();
  const past = W.React.createElement(VisitState, {
    state: { text: "Past", tone: "past", pill: "plain" },
    unmarked: true,
    testid: "s",
  });
  const pill = byTestId(past, "s");
  assert.equal(textOf(pill), "Past");
  assert.ok(classes(pill).includes("pill"), "the kit's pill");
  assert.equal(
    pill.props.title,
    "Not marked yet",
    "and what it is on hover, where a word alone would leave the owner guessing",
  );
  const kept = byTestId(
    W.React.createElement(VisitState, { state: { text: "Kept", tone: "kept", pill: "ok" }, testid: "k" }),
    "k",
  );
  assert.ok(classes(kept).includes("pill-ok"));
  assert.equal(W.React.createElement(VisitState, { state: null }).rendered, null);
});
