/**
 * What a sequence's tabs say past its flow (decision 0060, contracts sequence-tab-words.ts and sequence-words.ts), executed
 * on batches as the readers answer them: History's period, its four figures counted from the batches Reports counts (never
 * one that has not gone), whether the pages read reach back over a period, a day's row; a lead's step done, going now or
 * still to come; a message's WhatsApp standing; and the list tokens a new sequence may start on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_MIN_N,
  SEQUENCE_EDIT_WORDS,
  SEQUENCE_NEEDS_WORDS,
  SEQUENCE_PEOPLE_WORDS,
  batchWent,
  historyCovers,
  historyDayWords,
  historyDays,
  historyFigures,
  historyIn,
  historySince,
  historyStamp,
  historyUpcomingWords,
  isListToken,
  leadStepStand,
  listStartsSentence,
  peopleNeedsOf,
  stepApprovalOf,
  waitingEmailsOf,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-15T16:00:00Z");
const batch = (id, runFor, state, counts = {}, over = {}) => ({
  id,
  state,
  run_for: runFor,
  at: `${runFor}T13:00:00Z`,
  scheduled_for: `${runFor}T13:00:00Z`,
  finished_at: null,
  people: 14,
  failure: null,
  place: 1,
  counts,
  ...over,
});
const B = [
  batch("b5", "2026-10-16", "pending_approval"),
  batch("b4", "2026-10-15", "sent", { sent: 13, delivered: 12, read: 11, replied: 2 }),
  batch("b3", "2026-10-13", "sent", { sent: 9, delivered: 9, read: 8, replied: 1, held: 1 }),
  batch("b2", "2026-10-12", "canceled"),
  batch("b1", "2026-08-01", "sent", { sent: 40, delivered: 40, read: 30, replied: 4 }),
];

test("History's period: its first business day, and the batches on or after it", () => {
  assert.equal(historySince("30", TZ, NOW), "2026-09-16");
  assert.equal(historySince("90", TZ, NOW), "2026-07-18");
  assert.equal(historySince("all", TZ, NOW), null);
  assert.deepEqual(
    historyIn(B, "2026-09-16", TZ).map((b) => b.id),
    ["b5", "b4", "b3", "b2"],
  );
  assert.equal(historyIn(B, null, TZ).length, 5);
});

test("the four figures count what went and what came of it, never a batch that has not gone, and a share of none is a dash", () => {
  const f = Object.fromEntries(historyFigures(historyIn(B, "2026-09-16", TZ)).map((x) => [x.id, x]));
  assert.deepEqual(
    ["sent", "delivered", "read", "replied"].map((id) => [f[id].value, f[id].meta]),
    [
      ["22", null],
      ["95%", "21 of 22"],
      ["19", "on WhatsApp"],
      ["3", "14% of those sent"],
    ],
  );
  assert.equal(f.delivered.n, 22, "a share says what it is of, for the kit to grey too few");
  assert.deepEqual(
    [f.sent.minN, f.delivered.minN, f.read.minN],
    [null, REPORT_MIN_N, null],
    "a share is greyed by Reports' own fewest, a count never",
  );
  assert.deepEqual(
    B.map(batchWent),
    [false, true, true, false, true],
    "what went is what History counts and opens onto",
  );
  assert.ok(
    Object.values(f).every((x) => x.definition.length > 20),
    "each label says what it counts",
  );
  const none = Object.fromEntries(historyFigures([B[0], B[3]]).map((x) => [x.id, x]));
  assert.deepEqual([none.sent.value, none.delivered.value, none.delivered.meta], ["0", "—", null]);
  assert.equal(historyDays(historyIn(B, "2026-09-16", TZ), TZ), 2, "the days it sent, not the days it was asked to");
});

test("History shows only the figures its sequence can know: Read on WhatsApp, and no Delivered for a mailbox's email", () => {
  const ids = (of) => historyFigures(B, of).map((x) => x.id);
  assert.deepEqual(ids({ starts: "moment", channels: ["whatsapp", "email"] }), [
    "sent",
    "delivered",
    "read",
    "replied",
  ]);
  assert.deepEqual(
    ids({ starts: "moment", channels: ["email"] }),
    ["sent", "delivered", "replied"],
    "email says no read",
  );
  assert.deepEqual(
    ids({ starts: "leads", channels: ["email"] }),
    ["sent", "replied"],
    "a mailbox never says it arrived",
  );
});

test("the pages read cover a period once they reach back past its first day, or there is nothing older", () => {
  const first = { batches: B.slice(0, 3), more: true };
  assert.equal(historyCovers(first, "2026-09-16", TZ), false, "the last page read stops inside the period");
  assert.equal(historyCovers({ batches: B, more: true }, "2026-09-16", TZ), true);
  assert.equal(historyCovers({ batches: B.slice(0, 3), more: false }, "2026-09-16", TZ), true);
  assert.equal(historyCovers({ batches: B, more: true }, null, TZ), false, "all of it needs every page");
});

test("a day's row: what it went to, or why it did not go, with the step where a sequence has several", () => {
  // Delivered is the figures' over the period; a day says what was read and what came back, a zero said in words.
  assert.deepEqual(historyDayWords(B[1], null), { end: "13 sent", said: "11 read · 2 replied" });
  assert.deepEqual(historyDayWords(B[2], "step 2"), {
    end: "9 sent",
    said: "step 2 · 8 read · 1 replied · 1 held",
  });
  assert.deepEqual(historyDayWords(B[0], null), { end: "Waits for you", said: "14 people" });
  assert.deepEqual(historyDayWords({ ...B[0], people: 0 }, null), { end: "Waits for you", said: "" }, "never 0 people");
  assert.deepEqual(historyDayWords(B[3], null), { end: "Canceled", said: "Nothing went" });
  const failed = batch(
    "b6",
    "2026-10-14",
    "failed",
    { sent: 2, failed: 12 },
    { failure: "The number was disconnected" },
  );
  assert.deepEqual(historyDayWords(failed, null), {
    end: "Failed",
    said: "0 read · no replies · 12 failed · The number was disconnected",
  });
});

test("History's rows say their day by name and their time; the batch to come says how it goes", () => {
  const at = (iso) => Date.parse(iso);
  // NOW is noon in New York on Thu, Oct 15.
  assert.equal(historyStamp(at("2026-10-15T13:00:00Z"), TZ, NOW), "Today · 9:00 AM");
  assert.equal(historyStamp(at("2026-10-14T13:00:00Z"), TZ, NOW), "Yesterday · 9:00 AM");
  assert.equal(historyStamp(at("2026-10-16T13:00:00Z"), TZ, NOW), "Tomorrow · 9:00 AM");
  assert.match(historyStamp(at("2026-10-11T13:00:00Z"), TZ, NOW), /^Sun.* · 9:00 AM$/);
  assert.deepEqual(historyUpcomingWords(3, "auto"), { end: "3 people", said: "Next · goes on its own" });
  assert.deepEqual(historyUpcomingWords(null, null), { end: "", said: "Next · waits for your OK" }, "none set asks");
});

test("Send N as written covers the held that judge the lead, never words the check could not back", () => {
  const held = (id, why) => ({
    group: "held",
    send_id: id,
    name: id,
    lead_id: null,
    batch_id: "b1",
    why,
    hold_detail: null,
  });
  const vm = peopleNeedsOf(
    [held("a", "chain"), held("b", "unbacked_fact"), held("c", "reads_like_spam"), held("d", "abroad")],
    { timezone: TZ, now: NOW },
  );
  assert.deepEqual(
    vm.held.map((h) => h.id),
    ["a", "b", "c", "d"],
    "every held email is laid out",
  );
  assert.deepEqual(
    vm.asIs.map((h) => h.id),
    ["a", "d"],
    "a chain and a business abroad may go as written; a claim or words like spam are answered one by one",
  );
});

test("who wrote back is listed by name with their thread; a server before 00455 says only how many", () => {
  const row = (over) => ({
    group: "in",
    contact_id: null,
    lead_id: null,
    enrollment_id: null,
    send_id: null,
    batch_id: null,
    name: null,
    place: 1,
    at: null,
    why: null,
    hold_detail: null,
    draft: null,
    reply: null,
    ...over,
  });
  const vm = peopleNeedsOf(
    [
      row({
        group: "replied",
        lead_id: "l1",
        name: "Moss & Spine",
        why: "question",
        reply: { intent: "question", summary: "Asks if Tuesdays work", conversation_id: "c1" },
      }),
      row({
        group: "replied",
        contact_id: "p1",
        name: null,
        why: "interested",
        reply: { intent: "interested", summary: null, conversation_id: null },
      }),
      row({ group: "in", lead_id: "l2", enrollment_id: "e2" }),
    ],
    { timezone: TZ, now: NOW },
  );
  assert.deepEqual(
    vm.wroteBack,
    [
      {
        key: "l1",
        name: "Moss & Spine",
        said: "Wrote back · a question",
        summary: "Asks if Tuesdays work",
        answer: "inbox/th-c1",
        to: "clients/leads:p-l1",
      },
      {
        key: "p1",
        name: SEQUENCE_PEOPLE_WORDS.someone,
        said: "Wrote back · interested",
        summary: null,
        answer: null,
        to: "clients/p1",
      },
    ],
    "each by name, what they said, its thread to answer in, and their page",
  );
  const before = peopleNeedsOf([{ group: "in", lead_id: "l2", enrollment_id: "e2", name: "x", place: 1 }], {
    timezone: TZ,
    now: NOW,
  });
  assert.equal(before.wroteBack, null, "a read with no reply field is a server before 00455: no rows, only the count");
  assert.deepEqual(
    peopleNeedsOf([row({})], { timezone: TZ, now: NOW }).wroteBack,
    [],
    "after 00455 and nobody wrote back: none",
  );
});

test("a lead's step is done, going now or still to come; a message's WhatsApp standing has its tone", () => {
  assert.deepEqual(
    [1, 2, 3].map((place) => leadStepStand(place, place === 1 ? 31 : 0, 2)),
    ["done", "now", "later"],
  );
  assert.deepEqual(
    [1, 2].map((place) => leadStepStand(place, place === 1 ? 31 : 0, null)),
    ["done", "later"],
    "with no batch to come, a step that sent is done",
  );
  assert.deepEqual(stepApprovalOf("approved"), { label: "Approved", tone: "ok" });
  assert.deepEqual(stepApprovalOf("pending"), { label: "In review", tone: "warn" });
  assert.deepEqual(stepApprovalOf("rejected"), { label: "Not approved", tone: "danger" });
  assert.equal(stepApprovalOf(null), null);
});

test("a new sequence starts on a list by the token the composer writes; the editor and Needs you say what a press reaches", () => {
  assert.ok(isListToken("seg:clients"));
  assert.ok(isListToken("list:3f6c1a52-0d1e-4b8a-9c2f-5e7d8a9b0c1d"));
  for (const bad of ["seg:", "seg:Clients!", "list:abc", "clients", "list:3f6c1a52-0d1e-4b8a-9c2f-5e7d8a9b0c1d/x"])
    assert.equal(isListToken(bad), false, bad);
  assert.match(SEQUENCE_EDIT_WORDS.reaches(false), /already waiting keeps their day/);
  assert.equal(SEQUENCE_NEEDS_WORDS.sendAll(1), "Send 1 anyway");
  assert.equal(SEQUENCE_NEEDS_WORDS.sendAll(3), "Send 3 anyway");
  assert.equal(SEQUENCE_NEEDS_WORDS.wentAll(1), "1 email goes as written");
  assert.equal(SEQUENCE_PEOPLE_WORDS.takeOutAll(4), "Take these 4 out");
  assert.equal(SEQUENCE_EDIT_WORDS.days(1), "1 day");
  // A list's start reads the same on a record and on a draft about to be made.
  assert.equal(listStartsSentence("Clients", 10), "Someone joins Clients, at 10:00 AM");
  assert.equal(listStartsSentence(null, null), "Someone joins the list");
});

test("an email waiting for your OK shows the opening it carries, and may be rewritten or left out before you approve (30 Oct 2026)", () => {
  const waiting = (id, over = {}) => ({
    group: "waiting",
    send_id: id,
    name: `Shop ${id}`,
    lead_id: `lead-${id}`,
    enrollment_id: null,
    contact_id: null,
    batch_id: "b1",
    place: 1,
    at: "2026-10-30T13:00:00Z",
    why: null,
    hold_detail: null,
    opening: "Shop a runs Monday through Saturday with a 4.8 rating across 66 reviews.",
    checked: true,
    ...over,
  });
  const [written, again, plain, later] = waitingEmailsOf([
    waiting("a"),
    waiting("b", { opening: null, checked: false }),
    waiting("c", { opening: null }),
    waiting("d", { place: 2 }),
  ]);
  // The sentence it goes with, as the business reads it, and both answers quiet: nothing is wrong with it.
  assert.equal(written.id, "a");
  assert.equal(written.batchId, "b1");
  assert.equal(written.opening, "“Shop a runs Monday through Saturday with a 4.8 rating across 66 reviews.”");
  assert.deepEqual(
    written.answers.map((a) => [a.door, a.words, a.lead]),
    [
      ["rewrite", "Rewrite the opening", false],
      ["take_out", SEQUENCE_PEOPLE_WORDS.takeOut, false],
    ],
  );
  // Asked again: said so, and not rewritten twice while the check writes it.
  assert.equal(again.opening, SEQUENCE_PEOPLE_WORDS.writing);
  assert.equal(again.checking, true);
  assert.deepEqual(
    again.answers.map((a) => a.door),
    ["take_out"],
  );
  // A step whose words have no opening: nothing to rewrite.
  assert.equal(plain.opening, null);
  assert.deepEqual(
    plain.answers.map((a) => a.door),
    ["take_out"],
  );
  // From step 2 an email is skipped, its lead staying in for the steps after.
  assert.deepEqual(
    later.answers.map((a) => a.door),
    ["rewrite", "skip"],
  );
  // A server before this read carries no opening: its rows are drawn as they were, with no answers.
  assert.deepEqual(waitingEmailsOf([{ ...waiting("e"), opening: undefined, checked: undefined }]), []);
  // Only those waiting: a held email has its own row (peopleNeedsOf).
  assert.deepEqual(waitingEmailsOf([{ ...waiting("f"), group: "held", why: "chain" }]), []);
});

test("a held email shows the opening it would send with the words the check refused marked, why in plain words, and what one reason they share (30 Oct 2026)", () => {
  const held = (id, why, detail, opening) => ({
    group: "held",
    send_id: id,
    name: id,
    lead_id: `lead-${id}`,
    batch_id: "b1",
    place: 1,
    why,
    hold_detail: detail,
    opening,
    checked: true,
  });
  const a = held(
    "a",
    "unbacked_fact",
    "calls:does someone answer every one",
    "You're open 24 hours. When calls come in at 2 AM, does someone answer every one?",
  );
  const b = held(
    "b",
    "unbacked_fact",
    "calls:calls come in but the salon isn't open",
    "MyssBerri closes at 3 PM, hours when calls come in but the salon isn’t open.",
  );
  const c = held("c", "chain", "site:3", "KVITKA has a 4.8 rating across 201 reviews.");
  const vm = peopleNeedsOf([a, b, c], { timezone: TZ, now: NOW });
  const [va, vb, vc] = vm.held;
  assert.equal(va.why, "The opening guesses at their calls; we found nothing that says so");
  assert.deepEqual(va.opening, {
    before: "You're open 24 hours. When calls come in at 2 AM, ",
    said: "does someone answer every one",
    after: "?",
  });
  // The reader's straight apostrophe finds the opening's curly one, and the opening keeps its own.
  assert.deepEqual(vb.opening, {
    before: "MyssBerri closes at 3 PM, hours when ",
    said: "calls come in but the salon isn’t open",
    after: ".",
  });
  // A hold about who they are shows the opening as it would go, nothing marked.
  assert.deepEqual(vc.opening, { before: "KVITKA has a 4.8 rating across 201 reviews.", said: null, after: "" });
  // Words the opening does not hold show it whole; no opening shows none.
  const lost = peopleNeedsOf([held("d", "unbacked_fact", "busy:not in it", "A 4.9.")], { timezone: TZ, now: NOW });
  assert.deepEqual(lost.held[0].opening, { before: "A 4.9.", said: null, after: "" });
  const none = peopleNeedsOf([held("e", "unbacked_fact", "busy:x", null)], { timezone: TZ, now: NOW });
  assert.equal(none.held[0].opening, null);
  // Those held for their words are rewritten in one press; one reason they share is said once, with what a rewrite does.
  assert.deepEqual(
    vm.rewrite.map((h) => h.id),
    ["a", "b"],
  );
  assert.equal(vm.cause, "Same reason for 2 of 3: the opening guesses at their calls.");
  assert.equal(vm.advice, "A rewrite says only what we found on them.");
  const all = peopleNeedsOf([a, b], { timezone: TZ, now: NOW });
  assert.equal(all.cause, "Same reason for all 2: the opening guesses at their calls.");
  // Two reasons, or one email, say no shared reason; holds stored before their kind read as a detail.
  const mixed = peopleNeedsOf([a, held("f", "unbacked_fact", "busy:x", "A.")], { timezone: TZ, now: NOW });
  assert.equal(mixed.cause, null);
  assert.equal(peopleNeedsOf([a], { timezone: TZ, now: NOW }).cause, null);
  const old = peopleNeedsOf(
    [held("g", "unbacked_fact", "clearly you're busy", "A."), held("h", "unbacked_fact", "calls go somewhere", "B.")],
    { timezone: TZ, now: NOW },
  );
  assert.equal(old.cause, "Same reason for all 2: the opening says something we found nothing on.");
  // Nothing held for its words: no rewrite, no advice.
  const lead = peopleNeedsOf([c], { timezone: TZ, now: NOW });
  assert.deepEqual([lead.rewrite, lead.cause, lead.advice], [[], null, null]);
  assert.equal(SEQUENCE_NEEDS_WORDS.rewriteAll(7), "Rewrite all 7");
  assert.equal(SEQUENCE_NEEDS_WORDS.sendAll(2), "Send 2 anyway");
});
