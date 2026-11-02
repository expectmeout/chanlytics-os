/**
 * The lead sheet (the canvas "Lead sheet, redesigned", 1 Nov 2026), run: which state a lead is in, by its own record and its
 * place first, then the add door's answer, then its email (leadSheetStateOf); what stopped and its one fix
 * (leadSheetClosedOf); the verdict; the line under the name, the checks in a line, and Fit's checks, what did not pass
 * first, with why; the one card in every state (leadNowOf); the five lines closed (leadLinesOf) and History
 * (leadHistoryOf); About, each fact once (leadSheetAboutOf); where they stand in a sequence, said the same in every window
 * (placeWordOf); what a held email may become (heldAnswersOf); the record's rail drawn for one lead, or as they'd get it
 * (placeRailOf); the dock in every state, only what to press and none when nothing needs you (leadDockOf); the picker
 * (leadPickerRowsOf) and how New opens (newStartFirst); and the pile's end, by sequence (leadPileEndOf).
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
  leadSheetAboutOf,
  leadSheetWhyOf,
  leadDockOf,
  dockSlotsOf,
  leadNowOf,
  leadLinesOf,
  leadHistoryOf,
  leadPickerRowsOf,
  newStartFirst,
  leadPileEndOf,
  placeWordOf,
  heldAnswersOf,
  placeRailOf,
  runApproveWords,
  LEAD_SHEET_WORDS: W,
  LEAD_DOCK_WORDS: D,
  LEAD_NOW_WORDS: N,
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

test("the checks in a line: a dot a check, a passed one Claude read shaded apart, the count, and what did not pass", () => {
  const line = leadSheetChecksLineOf(card());
  assert.deepEqual(line.dots, ["ok", "ok", "warn", "read"], "a check Claude read is softer than one seen");
  assert.equal(line.words, "3 of 4 checks");
  assert.equal(
    line.exception,
    "phone not confirmed",
    "what did not pass, in its own short words (the canvas's PhoneHalf)",
  );
  const two = card({
    groups: [{ how: "seen", checks: [check("on_maps", "no"), check("in_area", "unknown"), check("mailbox", "yes")] }],
  });
  assert.equal(
    leadSheetChecksLineOf(two).exception,
    "1 failed · 1 couldn't tell: area",
    "several, by how many and what",
  );
  const both = card({
    groups: [{ how: "seen", checks: [check("in_area", "unknown"), check("phone_two_sources", "unknown")] }],
  });
  assert.equal(leadSheetChecksLineOf(both).exception, "2 couldn't tell: area, phone", "each said in a word");
  const area = card({ groups: [{ how: "seen", checks: [check("on_maps", "yes"), check("in_area", "unknown")] }] });
  assert.equal(
    leadSheetChecksLineOf(area).exception,
    "area not confirmed",
    "one that couldn't tell, in its own short words",
  );
  assert.equal(leadSheetChecksLineOf(card({ checkDots: [], groups: [] })), null, "no checks, no line");
});

test("Fit's checks: what did not pass first, each with why, then the rest, and a legend where Claude read one", () => {
  const why = leadSheetWhyOf(card());
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
  assert.equal(why.legend, LEAD_SHEET_CARD_WORDS.read, "Claude read them: the legend says so");
  assert.equal(why.failed, false, "what couldn't be told is a doubt, not a failed check");
  const said = { ...check("in_area", "unknown"), reason: "The listing names the street alone." };
  const told = leadSheetWhyOf(card({ groups: [{ how: "seen", checks: [said] }] }));
  assert.equal(told.exceptions[0].reason, "The listing names the street alone.", "why it did not pass rides with it");
  const noBox = leadSheetWhyOf(card({ groups: [{ how: "seen", checks: [check("mailbox", "no")] }] }));
  assert.equal(noBox.failed, false, "a way in missing is the lead's plain state, and Contact's to say");
  const out = leadSheetWhyOf(card({ groups: [{ how: "seen", checks: [check("in_area", "no")] }] }));
  assert.equal(out.failed, true, "a check that says something of the lead opens Fit by itself");
  assert.equal(
    leadSheetWhyOf(card({ groups: [{ how: "seen", checks: [check("on_maps", "yes")] }] })).legend,
    null,
    "all seen: nothing to tell apart",
  );
  // A place the screen left out before the judge (decision 0085) was read by Chanlytics AI alone, never by Claude.
  const byScreen = (key, answer) => ({ ...check(key, answer, "read"), source: contracts.LEAD_READ_SOURCES.screen });
  assert.equal(
    leadSheetWhyOf(card({ groups: [{ how: "read", checks: [byScreen("kind", "yes"), byScreen("chains", "no")] }] }))
      .legend,
    LEAD_SHEET_CARD_WORDS.readByAi,
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

test("a held email's answers follow why it was held, and Skip this email only from step 2", () => {
  const words = (reason, place) => heldAnswersOf({ reason, detail: null }, place).map((a) => a.words);
  assert.deepEqual(words(null, 1), ["Send anyway", "Take out"], "at step 1 skipping would end their place");
  assert.deepEqual(words(null, 2), ["Send anyway", "Skip this email"]);
  for (const a of heldAnswersOf({ reason: "unbacked_fact", detail: null }, 2)) assert.ok(a.door && a.words.length > 0);
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

const sent = (place) => ({
  id: `x${place}`,
  step_id: `s${place}`,
  place,
  state: "sent",
  reason: null,
  hold_detail: null,
  send_at: null,
  sent_at: "2026-10-14T15:00:00Z",
  drafted_at: null,
  batch_id: null,
});

const nowFacts = (over = {}) => ({
  state: "ready",
  place: null,
  closed: null,
  elsewhere: null,
  verdict: { word: "Strong fit", tone: "ok", out: false },
  fitWord: "Strong fit",
  reason: "An independent salon",
  checks: { dots: ["ok", "warn"], words: "1 of 2 checks", exception: "area not confirmed" },
  blocked: null,
  email: { address: "hi@luxelane.example.com", words: "Checked", tone: "ok" },
  phone: null,
  firstEmail: true,
  steps: 3,
  batch: 17,
  tz: TZ,
  nowMs: NOW,
  ...over,
});
const nowOf = (over) => leadNowOf(nowFacts(over));

test("the card before a sequence: the fit and the reason, what couldn't be told, and the email Add would send", () => {
  const ready = nowOf();
  assert.deepEqual([ready.word, ready.tone, ready.end], ["Strong fit", "ok", "1 of 2 checks"]);
  assert.equal(ready.say, "An independent salon");
  assert.equal(ready.unsure, "Area not confirmed", "read before a lead is added, a sentence's start");
  assert.equal(ready.need, false, "a lead to decide on is no edge: amber is for what waits on you");
  assert.equal(ready.mail, "first", "the email Add would send");
  assert.equal(nowOf({ firstEmail: false }).mail, null, "nothing picked: no email to show");
  const off = nowOf({ blocked: "They have no city, so Add is off." });
  assert.equal(off.unsure, "They have no city, so Add is off.", "why Add would come to nothing, in the doubt's place");
  const review = nowOf({ state: "review", reason: "Two addresses on its site" });
  assert.deepEqual([review.word, review.need], [N.review, true]);
});

test("the card says a way to reach them where it decides it, green only while a call would be answered", () => {
  const phone = { value: "+1 (718) 555-0142", confirmed: false, today: "Open until 6 PM" };
  const call = nowOf({ state: "phone", phone, email: { address: null, words: "No email found", tone: "plain" } });
  assert.deepEqual(
    call.facts.map((f) => [f.kind, f.value, f.note, f.tone]),
    [
      ["phone", phone.value, "Open until 6 PM", "ok"],
      ["mail", "No email found", "Phone only", "plain"],
    ],
  );
  assert.equal(call.mail, null, "no email to read");
  const closed = nowOf({ state: "phone", phone: { ...phone, today: "Closed today" } });
  assert.deepEqual([closed.facts[0].note, closed.facts[0].tone], ["Closed today", "plain"], "closed is no good news");
  const finding = nowOf({ state: "finding", email: { address: "a@b.example.com", words: "Checking…", tone: "plain" } });
  assert.deepEqual([finding.facts[0].value, finding.facts[0].busy], ["a@b.example.com", true]);
});

test("the card while a sequence has them: one status word, what it needs of you, its step, and the email", () => {
  const waiting = nowOf({ place: placeOf("waiting", { checked: true, opening: "Saw your weekend chair." }) });
  assert.deepEqual(
    [waiting.word, waiting.tone, waiting.need, waiting.end, waiting.say, waiting.mail],
    ["Waits for your OK", "warn", true, "Step 1 of 3", N.batch(17), "step"],
  );
  assert.equal(
    nowOf({ place: placeOf("waiting", { checked: false }) }).say,
    N.writing,
    "Approve waits for its opening",
  );
  assert.equal(nowOf({ batch: 1, place: placeOf("waiting") }).say, N.batchOne);
  const held = nowOf({ place: placeOf("held", { why: "unbacked_fact", hold_detail: "busy:stretched" }) });
  assert.equal(held.word, N.held);
  assert.match(held.say, /^The opening guesses how busy they are/);
  assert.deepEqual([held.need, held.mail], [true, "step"]);
  assert.equal(nowOf({ place: placeOf("to_send") }).mail, "draft");
  const wrote = nowOf({
    place: placeOf("replied", {
      at: "2026-10-18T13:00:00Z",
      reply: { intent: "interested", summary: "Asked what it costs.", conversation_id: null },
    }),
  });
  assert.deepEqual(
    [wrote.word, wrote.end, wrote.quote, wrote.say],
    ["Wrote back · interested", "Today", "“Asked what it costs.”", N.stopped],
  );
  const inIt = nowOf({ place: placeOf("in", { place: 2, at: "2026-10-21T13:00:00Z" }) });
  assert.deepEqual([inIt.word, inIt.tone, inIt.need], ["In Bookstore intro", "ok", false]);
  assert.match(inIt.say, /Nothing needs you\.$/);
  assert.equal(nowOf({ place: placeOf("done") }).word, "Done");
  const left = nowOf({ place: placeOf("left", { why: "removed", at: "2026-10-17T15:00:00Z" }) });
  assert.deepEqual(
    [left.word, left.say],
    ["Left Bookstore intro", `Taken out. ${N.sentNothing}`],
    "why, and whether any went",
  );
  const leftAfter = nowOf({ place: placeOf("left", { why: "removed" }, { sends: [sent(1)] }) });
  assert.equal(leftAfter.say, "Taken out.");
});

test("the card for a lead no sequence has: what stopped it, or the sequence the door names", () => {
  const closed = nowOf({
    state: "closed",
    closed: { title: "Not a fit", line: "Nothing is written to them.", fix: "ready" },
  });
  assert.deepEqual([closed.word, closed.say, closed.tone], ["Not a fit", "Nothing is written to them.", "plain"]);
  const out = nowOf({
    state: "closed",
    verdict: { word: "Left out — a chain", tone: "plain", out: true },
    fitWord: "Left out — a chain",
    closed: { title: "Left out", line: "", fix: "put_back" },
  });
  assert.equal(out.word, "Left out — a chain", "the finder's own words, with why");
  const elsewhere = nowOf({ state: "elsewhere", elsewhere: { name: "Florists", written: false } });
  assert.deepEqual([elsewhere.word, elsewhere.say], ["In Florists", N.nothingSent]);
  const written = nowOf({ state: "elsewhere", elsewhere: { name: "Florists", written: true } });
  assert.deepEqual([written.word, written.say], ["Written to by Florists", N.writtenSay]);
});

const lineFacts = (over = {}) => ({
  vm: {
    company: null,
    claimed: true,
    weekSummary: "Open 6 days · 8–6 most days",
    reach: { phone: { value: "+1 (718) 555-0142" } },
    slots: { phone: { state: "unconfirmed" } },
    fit: { word: "Strong fit" },
  },
  checks: { dots: ["ok", "warn"], words: "1 of 2 checks", exception: null },
  email: { address: "hi@luxelane.example.com", words: "Checked", tone: "ok" },
  place: null,
  steps: null,
  pick: { name: "Bookstore intro" },
  canJoin: true,
  history: [{ at: "Oct 12", what: "#7 for “salons”" }],
  ...over,
});
const lineOf = (id, over) => leadLinesOf(lineFacts(over)).find((l) => l.id === id);

test("the five lines: the same five in one order, each saying its answer closed", () => {
  assert.deepEqual(
    leadLinesOf(lineFacts()).map((l) => l.label),
    ["Fit", "Contact", "About", "Sequence", "History"],
  );
  const fit = lineOf("fit");
  assert.deepEqual([fit.value, fit.note, fit.dots], ["Strong", "1 of 2", ["ok", "warn"]], "the line's label says Fit");
  const mail = lineOf("contact");
  assert.deepEqual([mail.value, mail.tick, mail.note, mail.warn], ["hi@luxelane.example.com", true, null, null]);
  const checking = lineOf("contact", { email: { address: "a@b.example.com", words: "Checking…", tone: "plain" } });
  assert.deepEqual([checking.tick, checking.note], [false, "Checking…"]);
  const phone = lineOf("contact", { email: { address: null, words: "No email found", tone: "plain" } });
  assert.deepEqual([phone.value, phone.warn], ["+1 (718) 555-0142", "Not confirmed"], "no address: the phone");
  assert.deepEqual([lineOf("about").value, lineOf("about").note], ["Claimed", "Open 6 days"]);
  const company = { size: "11 - 50 people", people: [{}, {}] };
  const co = lineOf("about", { vm: { ...lineFacts().vm, company } });
  assert.deepEqual([co.label, co.value, co.note], ["Company", "11 - 50 people", "2 named"]);
  assert.deepEqual([lineOf("sequence").value, lineOf("sequence").note], ["Not in one yet", "adds to Bookstore intro"]);
  assert.equal(lineOf("sequence", { canJoin: false }).note, null, "a lead no sequence can take adds nowhere");
  const inIt = lineOf("sequence", { place: placeOf("in", { place: 2 }), steps: 3 });
  assert.deepEqual([inIt.value, inIt.note], ["Bookstore intro", "Step 2 of 3"]);
  assert.deepEqual([lineOf("history").value, lineOf("history").note], ["#7 for “salons”", "Oct 12"]);
  assert.equal(lineOf("history", { history: [] }), undefined, "nothing known yet: History stands down");
});

test("History: how we found them, what a sequence did, and your last call, each said once and oldest first", () => {
  const vm = {
    found: [
      { at: "Oct 12, 2:02 PM", what: "Google Maps · #7 for “salons”" },
      { at: "Oct 12, 2:03 PM", what: "Mailbox · Checked" },
    ],
    worked: { outcome: "voicemail", note: "Back Tuesday", at: "2026-10-16T15:00:00Z" },
  };
  const place = placeOf("left", { why: "removed", at: "2026-10-17T15:00:00Z" }, { sends: [sent(1)] });
  assert.deepEqual(
    leadHistoryOf({ vm, place, tz: TZ, nowMs: NOW }),
    [
      { at: "Oct 12", what: "Google Maps · #7 for “salons”" },
      { at: "Oct 12", what: "Mailbox · Checked" },
      { at: "Oct 16", what: "You added them to Bookstore intro" },
      { at: "Oct 14", what: "Step 1 sent" },
      { at: "Oct 17", what: "Taken out" },
      { at: "Oct 16", what: "Left a voicemail: Back Tuesday" },
    ],
    "the step's day, the note beside the call",
  );
  const quiet = { ...vm, worked: { outcome: null, note: null, at: null } };
  assert.equal(
    leadHistoryOf({ vm: quiet, place: null, tz: TZ, nowMs: NOW }).length,
    2,
    "no sequence, no call: found alone",
  );
});

test("About says each fact once, and a company's source-rights note is a tip, never a heading", () => {
  const place = {
    rated: { score: "4.7", reviews: "113 reviews", low: "19% at 1–2 stars" },
    weekSummary: "Open 6 days · 8–6 most days",
    where: { line: "936 Richmond Ave, Staten Island, NY", href: null },
    distance: "1.2 mi",
    facts: [
      { k: "Kind", v: "Auto repair shop" },
      { k: "Rated", v: "4.7 from 113 reviews" },
      { k: "Listing", v: "Claimed by the owner" },
      { k: "Found at", v: "#7 for “auto repair shop”" },
      { k: "Price", v: "$$" },
    ],
    company: null,
    about: null,
    claimed: true,
  };
  assert.deepEqual(
    leadSheetAboutOf(place).rows.map((r) => [r.k, r.v]),
    [
      ["Hours", "Open 6 days · 8–6 most days"],
      ["Listing", "Claimed by the owner"],
      ["Reviews", "★ 4.7 from 113 reviews · 19% at 1–2 stars"],
      ["Where", "936 Richmond Ave, Staten Island, NY · 1.2 mi"],
      ["Price", "$$"],
    ],
    "Listing once, Kind in the head's line, Found at in History",
  );
  const rights = "From a B2B contact database built from public professional profiles and company sites.";
  const company = leadSheetAboutOf({ ...place, company: { size: "11 - 50 people", source: rights }, facts: [] });
  assert.deepEqual(
    company.rows.map((r) => [r.k, r.tip]),
    [
      ["Size", null],
      ["From", rights],
    ],
  );
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
  ...over,
});
const dockOf = (over) => leadDockOf(dockFacts(over));
const acts = (d) => dockSlotsOf(d).map((s) => s.act);

test("the dock for a lead to decide on: Not a fit, Later and Add to the pick with ▾; the picker where nothing is picked", () => {
  const ready = dockOf();
  assert.equal(ready.x, true);
  assert.equal(ready.later, true);
  assert.deepEqual(acts(ready), ["add"]);
  assert.equal(ready.primary.label, D.addTo("Bookstore intro"));
  assert.equal(ready.primary.split, true, "▾ beside Add: the picker, one press away");
  const none = dockOf({ pick: null });
  assert.deepEqual(acts(none), ["pick"]);
  assert.equal(none.primary.label, D.addToOne);
  assert.deepEqual(acts(dockOf({ blocked: "They have no city" })), ["pick"], "Add can't go: choose another");
  const finding = dockOf({ state: "finding" });
  assert.equal(finding.primary.off, D.checking, "Add waits while the mailbox is checked");
  assert.equal(dockOf({ canLater: false }).later, false, "Later is a search's: none outside one");
});

test("the dock in the other states: Call first, To review, another sequence, a closed lead", () => {
  const phone = dockOf({ state: "phone" });
  assert.deepEqual(acts(phone), ["call"], "the card says there is no email");
  assert.deepEqual(acts(dockOf({ state: "phone", canCall: false })), []);
  const review = dockOf({ state: "review" });
  assert.deepEqual(acts(review), ["exclude", "keep"]);
  assert.equal(review.primary.act, "keep");
  const other = dockOf({ state: "elsewhere", elsewhere: { id: "seq-2", name: "Florists", written: false } });
  assert.deepEqual(acts(other), ["move"]);
  assert.equal(other.primary.label, D.moveTo("Bookstore intro"));
  const written = dockOf({ state: "elsewhere", elsewhere: { id: "seq-2", name: "Florists", written: true } });
  assert.deepEqual(acts(written), ["sequence"]);
  assert.equal(written.primary, null, "a way to look, no primary: nothing to answer");
  const closed = dockOf({
    state: "closed",
    closed: { title: "Not a fit", line: "Nothing is written to them.", fix: "ready" },
  });
  assert.deepEqual(acts(closed), ["ready"]);
  assert.equal(closed.primary, null, "a way back, no primary");
  const bounced = dockOf({ state: "closed", closed: { title: "Their address bounced", line: "", fix: "call" } });
  assert.equal(bounced.primary.act, "call", "the door left is the way on");
  assert.equal(dockOf({ state: "closed", closed: { title: "Gone", line: "", fix: null } }), null, "no fix, no dock");
});

test("Approve says what it does: every email an OK sends, and it waits while an opening is written", () => {
  assert.equal(runApproveWords(17), "Approve all 17");
  assert.equal(runApproveWords(1), "Approve", "one email is no all");
  const waiting = dockOf({ place: placeOf("waiting", { place: 1, checked: true }), batch: 17 });
  assert.deepEqual(
    [waiting.primary.act, waiting.primary.label, waiting.primary.off],
    ["approve", "Approve all 17", null],
  );
  assert.deepEqual(
    waiting.others.map((s) => [s.act, s.label]),
    [["take_out", "Take out"]],
    "leaving this one out stands beside it, at step 1 by the leave verb",
  );
  const later = dockOf({ place: placeOf("waiting", { place: 2, checked: true }), batch: 3 });
  assert.deepEqual(
    later.others.map((s) => [s.act, s.door]),
    [["decide", "skip"]],
    "from step 2 it is Skip this email",
  );
  const writing = dockOf({ place: placeOf("waiting", { checked: false }), batch: 17 });
  assert.equal(writing.primary.off, D.writing, "you read each before it goes");
});

test("while a sequence has them, the dock holds only what needs you there, and no dock while it runs", () => {
  const held = dockOf({ place: placeOf("held", { send_id: "x1", batch_id: "b1", why: "unbacked_fact", place: 1 }) });
  assert.equal(held.primary.door, "rewrite", "the first answer that lets it go is the primary");
  assert.deepEqual(
    held.others.map((s) => s.act),
    ["take_out"],
  );
  assert.deepEqual(
    held.more.map((s) => s.door),
    ["include"],
    "the other answers under its caret",
  );
  assert.equal(dockOf({ place: placeOf("to_send", { place: 2 }) }).toSend, true, "the row every To send draws");
  const replied = dockOf({
    place: placeOf("replied", { reply: { intent: "question", summary: null, conversation_id: null } }),
  });
  assert.deepEqual(acts(replied), ["thread"]);
  assert.equal(dockOf({ place: placeOf("queued") }), null, "up next: nothing needs you");
  assert.equal(dockOf({ place: placeOf("in") }), null, "in it, replies read: nothing");
  const told = dockOf({ place: placeOf("in", {}, { reads_replies: false, sends: [sent(1)] }) });
  assert.deepEqual(acts(told), ["they_wrote"], "sent by hand: only they can say a reply came");
  assert.equal(dockOf({ place: placeOf("left", { why: "removed" }) }), null, "left, and no leave to undo: no foot");
  const back = dockOf({ place: placeOf("left", { why: "removed" }, { put_back: { decision_id: "d1" } }) });
  assert.deepEqual(acts(back), ["return"], "taken out with nothing sent: Put back");
  assert.equal(back.primary, null, "a way back, no primary");
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

test("New opens on a copy of the search's own pick, else Ask's draft over a search, else the newest, else blank", () => {
  const seqs = [seqRow({ id: "a", name: "Auto shops", created_at: "2026-10-01T00:00:00Z" })];
  assert.equal(
    newStartFirst(leadPickerRowsOf(seqs, "a"), true),
    "copy",
    "the search's own pick: the same kind of lead",
  );
  assert.equal(
    newStartFirst(leadPickerRowsOf(seqs, null), true),
    "ask",
    "another sequence is no start for a new search",
  );
  assert.equal(newStartFirst(leadPickerRowsOf(seqs, null), false), "copy", "no search: the newest");
  assert.equal(newStartFirst([], true), "ask");
  assert.equal(newStartFirst([], false), "blank");
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
  assert.equal(end.rows[1].act.label, "Approve all 3", "the words every Approve says");
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
