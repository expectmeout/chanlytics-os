/**
 * The lead sheet (the lead-to-sequence canvas, 18 Oct 2026: one scroll, one road), run: which state a lead is in, by its own
 * record and its place first, then the add door's answer, then its email (leadSheetStateOf); what stopped and its one fix
 * (leadSheetClosedOf); the verdict first; the card's lines (the line under the name, the checks line, the ways-in line) and
 * Why's checks, what did not pass first; where they stand in a sequence, said the same in every window (placeWordOf); what
 * a held email may become (heldChoicesOf); the record's rail drawn for one lead, or as they'd get it (placeRailOf); the dock
 * in every state of the States board, only what needs you and nothing when nothing does (leadDockOf); the word beside the
 * name; the picker (leadPickerRowsOf); and the pile's end, by sequence (leadPileEndOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const {
  leadSheetStateOf,
  leadSheetClosedOf,
  leadVerdictOf,
  leadSheetSubOf,
  leadSheetChecksLineOf,
  leadSheetContactLineOf,
  leadSheetWhyOf,
  leadDockOf,
  leadSheetWordOf,
  leadPickerRowsOf,
  leadPileEndOf,
  placeWordOf,
  heldChoicesOf,
  placeRailOf,
  LEAD_SHEET_WORDS: W,
  LEAD_DOCK_WORDS: D,
  LEAD_SHEET_CARD_WORDS,
  PLACE_RAIL_WORDS: R,
} = contracts;

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-18T14:00:00Z");
const clock = { tz: TZ, nowMs: NOW };

const lead = (over = {}) => ({
  cls: "qualified",
  stage: "ready",
  emailState: "ok",
  hasEmail: true,
  canCall: true,
  inSequence: false,
  ...over,
});

/** A lead's place in a sequence (00459 sequence_place), its row filed under `group`. */
const placeOf = (group, row = {}, more = {}) => ({
  sequence: { id: "seq-1", name: "Bookstore intro", state: "on" },
  place: {
    group,
    enrollment_id: "en-1",
    send_id: null,
    batch_id: null,
    place: 1,
    at: null,
    why: null,
    hold_detail: null,
    draft: null,
    reply: null,
    ...row,
  },
  sends: [],
  reads_replies: true,
  owner_sends: false,
  joined: { at: "2026-10-16T15:00:00Z", auto: false },
  ...more,
});

const stateOf = (over = {}, more = {}) =>
  leadSheetStateOf({ lead: lead(over), place: null, check: undefined, email: null, ...more });

test("the state: its record and its place first, then the add door's answer, then what its email says", () => {
  assert.equal(stateOf({ cls: "excluded" }), "closed", "left out by the finder");
  assert.equal(stateOf({ cls: "review" }), "review");
  assert.equal(stateOf({ stage: "converted" }), "replied");
  assert.equal(stateOf({}, { place: placeOf("replied") }), "replied", "their place says they wrote back");
  assert.equal(stateOf({ stage: "archived" }), "closed");
  assert.equal(stateOf({}, { place: placeOf("left", { why: "bounced" }) }), "closed", "a bounce closes the lead");
  assert.equal(stateOf({}, { place: placeOf("in") }), "sequence", "a place is a sequence's, whatever the door says");
  assert.equal(stateOf({}, { check: { why: "elsewhere" } }), "elsewhere");
  assert.equal(stateOf({}, { check: { why: "already" } }), "sequence");
  assert.equal(stateOf({}, { check: { why: "checking" } }), "finding");
  assert.equal(stateOf({}, { check: { why: "no_email" } }), "phone", "an address the door refused, with a number");
  assert.equal(stateOf({ canCall: false }, { check: { why: "no_email" } }), "closed", "and with none");
  assert.equal(stateOf({}, { check: { why: "unconfirmed" } }), "gap", "the sequence's own setting");
  assert.equal(stateOf({ hasEmail: false }), "phone");
  assert.equal(stateOf({ emailState: "checking" }), "finding");
  assert.equal(stateOf({}, { email: { blocked: "They have no city", note: null } }), "gap");
  assert.equal(stateOf(), "ready");
});

test("what stopped, plainly, and the one fix that exists for it", () => {
  assert.equal(
    leadSheetClosedOf({ lead: lead({ cls: "excluded" }), closedReason: null, blocked: null }).fix,
    "put_back",
  );
  const closed = leadSheetClosedOf({ lead: lead({ stage: "archived" }), closedReason: "not_a_fit", blocked: null });
  assert.equal(closed.title, "Not a fit");
  assert.equal(closed.fix, "ready");
  assert.equal(
    leadSheetClosedOf({ lead: lead({ emailState: "invalid" }), closedReason: null, blocked: null }).fix,
    "call",
  );
  assert.equal(
    leadSheetClosedOf({ lead: lead({ hasEmail: false, canCall: false }), closedReason: null, blocked: null }).fix,
    null,
  );
  assert.equal(
    leadSheetClosedOf({ lead: lead(), closedReason: null, blocked: "They're already a customer, so Add is off." }).line,
    "They're already a customer, so Add is off.",
  );
});

test("the verdict first: Strong fit green, Worth a look and Long shot amber, Left out plain and the finder's own", () => {
  assert.deepEqual(leadVerdictOf({ fit: { word: "Strong fit", cls: "strong" } }), {
    word: "Strong fit",
    tone: "ok",
    out: false,
  });
  assert.equal(leadVerdictOf({ fit: { word: "Worth a look", cls: "look" } }).tone, "warn");
  assert.equal(leadVerdictOf({ fit: { word: "Long shot", cls: "long" } }).tone, "warn");
  assert.deepEqual(leadVerdictOf({ fit: { word: "Left out — a chain", cls: "out" } }), {
    word: "Left out — a chain",
    tone: "plain",
    out: true,
  });
});

const dot = (answer, how = "seen") => ({ answer, how });
const peek = (over = {}) => ({
  checkDots: [dot("yes"), dot("yes"), dot("unknown", "read"), dot("yes", "read")],
  checksSummary: "3 checks passed · 1 couldn't tell",
  fit: { word: "Strong fit", cls: "strong", sentence: "An independent salon" },
  stage: "ready",
  ...over,
});

const check = (key, answer, how = "seen") => ({ key, label: key, answer, how, source: "Maps", reason: null });
const card = (over = {}) => ({
  ...peek(),
  groups: [
    { how: "seen", checks: [check("on_maps", "yes"), check("in_area", "yes")] },
    { how: "read", checks: [check("phone_two_sources", "unknown", "read"), check("independent", "yes", "read")] },
  ],
  ...over,
});

test("the line under the name: the kind, the street and the rating, short, on a desk and a phone alike", () => {
  const vm = {
    sub: "Hair salon · $$ · Queens, NY",
    where: { line: "31-12 Ditmars Blvd, Queens, NY 11105", href: null },
    rated: { score: "4.8", count: "212", reviews: "212 reviews", low: null },
    company: null,
  };
  assert.equal(
    leadSheetSubOf(vm),
    "Hair salon · 31-12 Ditmars Blvd · ★ 4.8 (212)",
    "the canvas's PhoneHalf, everywhere",
  );
  assert.equal(
    leadSheetSubOf({ ...vm, where: null, rated: null }),
    "Hair salon · $$ · Queens, NY",
    "the area, no street",
  );
});

test("the checks line: a dot a check, a passed one Claude read shaded apart, the count, and what did not pass, short", () => {
  const line = leadSheetChecksLineOf(card());
  assert.deepEqual(line.dots, ["ok", "ok", "warn", "read"], "a check Claude read is softer than one seen");
  assert.equal(line.words, "3 of 4 checks");
  assert.equal(
    line.exception,
    "phone not confirmed",
    "what did not pass, in its own short words (the canvas's PhoneHalf)",
  );
  assert.equal(line.fit, null, "a strong fit has no word before the count");
  assert.equal(line.tip, "3 checks passed · 1 couldn't tell");
  const two = card({
    groups: [{ how: "seen", checks: [check("on_maps", "no"), check("in_area", "unknown"), check("mailbox", "yes")] }],
  });
  assert.equal(leadSheetChecksLineOf(two).exception, "1 failed · 1 couldn't tell", "several, by how many");
  const area = card({ groups: [{ how: "seen", checks: [check("on_maps", "yes"), check("in_area", "unknown")] }] });
  assert.equal(
    leadSheetChecksLineOf(area).exception,
    "area not confirmed",
    "one that couldn't tell, in its own short words",
  );
  const look = card({ fit: { word: "Worth a look", cls: "look", sentence: "" } });
  assert.equal(leadSheetChecksLineOf(look).fit, "Worth a look", "the fit's word where it is news");
  const out = card({ fit: { word: "Left out — Chain gyms", cls: "out", sentence: "" } });
  assert.equal(
    leadSheetChecksLineOf(out).fit,
    "Left out — Chain gyms",
    "and what left it out, by the owner's criterion",
  );
  assert.equal(leadSheetChecksLineOf(card({ checkDots: [], groups: [] })), null, "no checks, no line");
});

test("the ways-in line: the address, the phone amber where it is not confirmed, the site", () => {
  const vm = (over = {}) => ({
    reach: { email: { address: "hi@luxelane.example.com" }, phone: { value: "+1 (718) 555-0142" } },
    slots: { mailbox: { state: "ok" }, phone: { state: "unconfirmed" } },
    links: { website: { label: "luxelane.example.com", href: "https://luxelane.example.com" }, linkedin: null },
    company: null,
    ...over,
  });
  assert.deepEqual(leadSheetContactLineOf(vm()), {
    email: { text: "hi@luxelane.example.com", warn: false },
    phone: { text: "+1 (718) 555-0142", warn: true },
    site: "site",
  });
  const none = leadSheetContactLineOf(
    vm({ reach: { email: { address: null }, phone: null }, links: { website: null, linkedin: null } }),
  );
  assert.deepEqual(none, { email: { text: LEAD_SHEET_CARD_WORDS.noEmail, warn: true }, phone: null, site: null });
  const company = leadSheetContactLineOf(
    vm({ company: {}, links: { website: null, linkedin: { label: "acme", href: "x" } } }),
  );
  assert.equal(company.site, "LinkedIn", "a company's site is its LinkedIn");
});

test("Why's checks: what did not pass first, the rest folded under how many passed, and a legend where Claude read one", () => {
  const why = leadSheetWhyOf(card());
  assert.equal(why.count, "3 of 4");
  assert.deepEqual(
    why.exceptions.map((c) => c.key),
    ["phone_two_sources"],
  );
  assert.deepEqual(
    why.passed.map((c) => [c.key, c.how]),
    [
      ["on_maps", "seen"],
      ["in_area", "seen"],
      ["independent", "read"],
    ],
  );
  assert.equal(why.fold, "3 passed");
  assert.equal(why.legend, true);
  assert.equal(
    leadSheetWhyOf(card({ groups: [{ how: "seen", checks: [check("on_maps", "yes")] }] })).legend,
    false,
    "all seen: nothing to tell apart",
  );
  assert.equal(leadSheetWhyOf(card({ groups: [] })), null);
});

test("where they stand, the same words in every window: what needs you by its word, else In and the sequence", () => {
  const seq = { name: "Bookstore intro", state: "on" };
  const word = (group, row = {}, named = true, s = seq) =>
    placeWordOf({ group, place: 1, at: null, why: null, ...row }, s, clock, named);
  assert.deepEqual(word("waiting"), { word: "Waits for your OK", tone: "warn", line: "Step 1 · Bookstore intro" });
  assert.deepEqual(word("held", { place: 2 }), { word: "Held", tone: "warn", line: "Step 2 · Bookstore intro" });
  assert.equal(word("to_send").word, "Yours to send");
  assert.equal(word("replied").tone, "warn");
  assert.deepEqual(word("queued"), { word: "In Bookstore intro", tone: "ok", line: "In its next batch" });
  assert.equal(word("queued", {}, true, { name: "Gift shops", state: "draft" }).line, "Joins when you start it");
  assert.equal(word("queued", {}, false).word, "In it", "the sheet's head, beside the name, names no sequence");
  assert.equal(word("in").line, "Between steps");
  assert.deepEqual(word("done"), { word: "Done", tone: "plain", line: "Bookstore intro · every step went" });
  assert.equal(word("left").word, "Left");
});

test("a held email's choices follow why it was held, and Skip this email only from step 2", () => {
  const words = (hold, place) => heldChoicesOf(hold, place).map(([, w]) => w);
  assert.deepEqual(words(null, 1), ["Send as written"], "at step 1 skipping would end their place: Take out says that");
  assert.deepEqual(words(null, 2), ["Send as written", "Skip this email"]);
  for (const [door, w] of heldChoicesOf("unbacked_fact", 2)) assert.ok(typeof door === "string" && w.length > 0);
});

test("the rail for one lead: when they joined, what each send did, the next by when it goes; and as they'd get it", () => {
  const steps = [
    { id: "s1", place: 1, after_days: null, hand: null, only_if: [], kind: "reach_out" },
    { id: "s2", place: 2, after_days: 4, hand: null, only_if: ["no_reply"], kind: "reach_out" },
    { id: "s3", place: 3, after_days: 3, hand: { kind: "call", words: "Call them" }, only_if: [], kind: "reach_out" },
  ];
  const titles = new Map([[1, "A quick one for Persida"]]);
  const preview = placeRailOf({ lens: "preview", steps, titles, seq: "on", place: null, readsReplies: false, clock });
  assert.equal(preview.start.head, R.joinsWhenAdded);
  assert.deepEqual(preview.steps[0].state, { tone: "next", words: R.afterOk }, "step 1 goes after your OK");
  assert.equal(preview.steps[0].how, R.asTheyGet);
  assert.equal(preview.steps[2].how, R.task, "the call is a task for you");
  assert.equal(preview.end.sub, R.toldBy, "no mailbox reads replies: they are told");
  const sent = {
    id: "x1",
    step_id: "s1",
    place: 1,
    state: "sent",
    reason: null,
    hold_detail: null,
    send_at: null,
    sent_at: "2026-10-17T15:00:00Z",
    drafted_at: null,
    batch_id: null,
  };
  const one = placeRailOf({
    lens: "one",
    steps,
    titles,
    seq: "on",
    place: placeOf("in", { place: 2, at: "2026-10-21T13:00:00Z" }, { sends: [sent] }),
    readsReplies: true,
    clock,
  });
  assert.ok(one.start.head.startsWith("You added them"), "when they joined");
  assert.equal(one.steps[0].state.tone, "done");
  assert.ok(one.steps[0].state.words.startsWith("Sent"));
  assert.equal(one.steps[1].state.tone, "next", "the next step says when it goes");
  assert.equal(one.steps[2].state, null, "the rest wait their turn");
  assert.equal(one.end.sub, R.readFrom);
  const held = placeRailOf({
    lens: "one",
    steps,
    titles,
    seq: "on",
    place: placeOf("held", { send_id: "x1" }, { sends: [{ ...sent, state: "held", sent_at: null, reason: null }] }),
    readsReplies: true,
    clock,
  });
  assert.equal(held.steps[0].state.tone, "need", "held: amber, it needs you");
});

const dockFacts = (over = {}) => ({
  state: "ready",
  place: null,
  pick: { id: "seq-1", name: "Bookstore intro", state: "on" },
  blocked: null,
  elsewhere: null,
  canCall: true,
  canLater: true,
  closed: null,
  reading: false,
  tz: TZ,
  nowMs: NOW,
  ...over,
});
const dockOf = (over) => leadDockOf(dockFacts(over));
const acts = (d) => d.acts.map((s) => s.act);

test("the dock for a lead to decide on: Not a fit, Later and Add to the pick with ▾; the picker where nothing is picked", () => {
  const ready = dockOf();
  assert.equal(ready.x, true);
  assert.equal(ready.later, true);
  assert.deepEqual(acts(ready), ["add"]);
  assert.equal(ready.acts[0].label, D.addTo("Bookstore intro"));
  assert.equal(ready.acts[0].split, true, "▾ beside Add: the picker, one press away");
  assert.equal(ready.line, null, "a dock is for pressing: no pointer elsewhere");
  const none = dockOf({ pick: null });
  assert.deepEqual(acts(none), ["pick"]);
  assert.equal(none.acts[0].label, D.addToOne);
  const blocked = dockOf({ blocked: "They have no city, so this email would wait for you." });
  assert.equal(blocked.line, "They have no city, so this email would wait for you.", "why Add can't go, said once");
  assert.deepEqual(acts(blocked), ["pick"]);
  const finding = dockOf({ state: "finding" });
  assert.equal(finding.waiting, true);
  assert.equal(finding.acts[0].off, D.checking, "Add waits while the mailbox is checked");
  assert.equal(dockOf({ canLater: false }).later, false, "Later is a search's: none outside one");
});

test("the dock in the other states of the board: Call first, To review, another sequence, a closed lead", () => {
  const phone = dockOf({ state: "phone" });
  assert.equal(phone.line, D.noEmail.line);
  assert.deepEqual(acts(phone), ["call"]);
  assert.deepEqual(acts(dockOf({ state: "phone", canCall: false })), []);
  const review = dockOf({ state: "review" });
  assert.deepEqual(acts(review), ["exclude", "keep"]);
  const other = dockOf({ state: "elsewhere", elsewhere: { id: "seq-2", name: "Florists", written: false } });
  assert.equal(other.line, "In Florists");
  assert.equal(other.fact, "Nothing sent to them yet");
  assert.deepEqual(acts(other), ["move"]);
  assert.equal(other.acts[0].label, D.moveTo("Bookstore intro"));
  const written = dockOf({ state: "elsewhere", elsewhere: { id: "seq-2", name: "Florists", written: true } });
  assert.equal(written.line, "Written to by Florists");
  assert.deepEqual(acts(written), ["sequence"]);
  const closed = dockOf({
    state: "closed",
    closed: { title: "Not a fit", line: "Nothing is written to them.", fix: "ready" },
  });
  assert.deepEqual(acts(closed), ["ready"]);
  assert.equal(dockOf({ state: "closed", closed: { title: "Gone", line: "", fix: null } }), null, "no fix, no dock");
  assert.equal(dockOf({ reading: true }).waiting, true, "their place still being read: nothing to take back");
});

test("while a sequence has them, the dock holds only what needs you there, and nothing while it runs", () => {
  const waiting = dockOf({ place: placeOf("waiting", { place: 1 }), batchOthers: 6 });
  assert.equal(waiting.line, "Step 1 waits for your OK");
  assert.equal(waiting.fact, "With 6 others in today's batch");
  assert.deepEqual(acts(waiting), ["approve"]);
  const held = dockOf({ place: placeOf("held", { send_id: "x1", batch_id: "b1", why: "unbacked_fact", place: 1 }) });
  assert.deepEqual(
    held.held,
    { sendId: "x1", batchId: "b1", hold: "unbacked_fact", place: 1 },
    "its choices, in place",
  );
  assert.deepEqual(acts(dockOf({ place: placeOf("to_send", { place: 2 }) })), ["open_draft"]);
  const replied = dockOf({
    place: placeOf("replied", { reply: { intent: "question", summary: null, conversation_id: null } }),
  });
  assert.ok(replied.line.startsWith("Wrote back"));
  assert.deepEqual(acts(replied), ["thread"]);
  assert.equal(dockOf({ place: placeOf("queued") }), null, "up next: nothing needs you");
  assert.equal(dockOf({ place: placeOf("in") }), null, "in it, replies read: nothing");
  const byHand = placeOf(
    "in",
    {},
    {
      reads_replies: false,
      sends: [
        {
          id: "x1",
          step_id: "s1",
          place: 1,
          state: "sent",
          reason: null,
          hold_detail: null,
          send_at: null,
          sent_at: "2026-10-14T15:00:00Z",
          drafted_at: null,
          batch_id: null,
        },
      ],
    },
  );
  const told = dockOf({ place: byHand });
  assert.equal(told.fact, "Replies aren't read here");
  assert.deepEqual(acts(told), ["they_wrote"], "sent by hand: only they can say a reply came");
});

test("the word beside the name: their place's word once a sequence has them, else the lead's own", () => {
  assert.deepEqual(leadSheetWordOf({ state: "sequence", place: placeOf("held"), closed: null }), {
    word: "Held",
    tone: "warn",
  });
  assert.equal(leadSheetWordOf({ state: "ready", place: null, closed: null }).word, "To decide");
  assert.equal(leadSheetWordOf({ state: "phone", place: null, closed: null }).word, "Call first");
  assert.equal(leadSheetWordOf({ state: "review", place: null, closed: null }).word, "To review");
  assert.equal(
    leadSheetWordOf({ state: "closed", place: null, closed: { title: "Not a fit", line: "", fix: "ready" } }).word,
    "Not a fit",
  );
});

const seqRow = (over = {}) => ({
  id: "seq-1",
  name: "Bookstore intro",
  starts: "leads",
  state: "on",
  created_at: "2026-10-01T00:00:00Z",
  steps: 3,
  days: 7,
  unwritten: 0,
  in_it: 12,
  ...over,
});

test("the picker: every sequence to leads that has not ended, the pick first, each by its state and one line", () => {
  const rows = leadPickerRowsOf(
    [
      seqRow({ id: "a", name: "Old one", created_at: "2026-09-01T00:00:00Z" }),
      seqRow({
        id: "b",
        name: "Gift shops",
        state: "draft",
        in_it: 4,
        unwritten: 1,
        created_at: "2026-10-10T00:00:00Z",
      }),
      seqRow({ id: "c", name: "Portland retail", state: "paused", steps: 2, days: 3, in_it: 31 }),
      seqRow({ id: "d", name: "Gone", state: "ended" }),
      seqRow({ id: "e", name: "A customer's", starts: "moment" }),
    ],
    "a",
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
    "the pick first, then the newest; none ended, none not to leads",
  );
  assert.equal(rows[0].picked, true);
  assert.equal(rows[0].line, "3 steps over 7 days · 12 in it");
  assert.deepEqual([rows[1].word, rows[1].tone, rows[1].line], ["Draft", "warn", "4 added · emails not written yet"]);
  assert.equal(rows[2].line, "2 steps over 3 days · 31 in it · adds wait until it's on");
});

test("the pile's end, by sequence: a draft says Write the emails, one that's on Approve N, and those for later", () => {
  const end = leadPileEndOf({
    added: [
      { id: "d", name: "Independent bookstores", state: "draft", n: 4, waiting: null },
      { id: "o", name: "Bookstore intro", state: "on", n: 3, waiting: { batchId: "b1", people: 3 } },
    ],
    notFit: 9,
    later: 3,
  });
  assert.equal(end.title, W.end.title(19));
  assert.deepEqual(
    end.rows.map((r) => [r.words, r.word, r.act ? r.act.kind : null]),
    [
      ["4 to Independent bookstores", "Draft", null],
      ["3 to Bookstore intro", "On", "approve"],
      ["9 not a fit", null, null],
      ["3 for later", null, "later"],
    ],
  );
  assert.deepEqual(end.primary, { label: W.end.write, sequenceId: "d" }, "a draft that took leads is written first");
  const on = leadPileEndOf({
    added: [{ id: "o", name: "Bookstore intro", state: "on", n: 2, waiting: null }],
    notFit: 0,
    later: 0,
  });
  assert.equal(on.primary, null, "each row carries its own act: no Done");
  assert.equal(leadPileEndOf({ added: [], notFit: 0, later: 0 }).title, W.end.title(0));
});

test("many at once say who can't join, and what an add left out stays selected", () => {
  assert.equal(W.bulk.noEmail(1), "1 has no email");
  assert.equal(W.bulk.noEmail(2), "2 have no email");
  assert.equal(W.bulk.addTo(5, "Bookstore intro"), "Add 5 to Bookstore intro");
  assert.equal(W.bulk.stay(1), "1 couldn't join and stays selected");
  assert.equal(W.picker.newLineMany(5), "Name it; the 5 wait in it as a draft");
});

test("the picker says when its emails are written in the owner's words, never the code's (30 Oct 2026)", () => {
  // REGRESSION: "Name it now; write the emails after the pile": the pile is the code's name for the leads being decided.
  const W = contracts.LEAD_SHEET_WORDS.picker;
  for (const line of [W.none, W.newLine]) assert.doesNotMatch(line, /pile/i, line);
  assert.equal(W.newLine, "Name it now; write its emails when you're done here");
});
