/**
 * Leads while a reach-out writes, and a lead's story (Reach out Part 6: H8–H11; contracts reach-out-leads.ts), executed:
 * the line under each lead's stage for every state it can be in, by the business's clock; the strip over the search,
 * running, paused and with nothing more planned; the peek's story and its three doors; and what a person's page says
 * of the reach-out that found them. And the send door's rule for a stopped lead (H10): a skip, never a wait.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outreachRefusalOf,
  isWaitRefusal,
  reachOutLineOf,
  reachOutPersonOf,
  reachOutStripOf,
  reachOutTimelineOf,
  PURPOSE_REFUSALS,
} from "@chanlytics/contracts";

const TZ = "America/Chicago";
// Monday 28 September 2026, 10:00 in Chicago.
const NOW = Date.parse("2026-09-28T15:00:00.000Z");
const line = (over = {}) => ({
  lead_id: "l1",
  stage: "nurture",
  closed_reason: null,
  sent: 1,
  first_sent_at: "2026-09-22T15:00:00.000Z",
  last_sent_at: "2026-09-22T15:00:00.000Z",
  next_at: null,
  held: false,
  handed: false,
  bounced: false,
  bounced_at: null,
  reply: null,
  away_until: null,
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  ...over,
});
const said = (over) => reachOutLineOf(line(over), NOW, TZ);

test("the line under a lead's stage says where it stands, first that holds", () => {
  assert.equal(said({}), "Written Tue");
  assert.equal(said({ sent: 2, last_sent_at: "2026-09-26T15:00:00.000Z" }), "Written Tue · nudged Sat");
  assert.equal(said({ next_at: "2026-09-30T15:00:00.000Z" }), "Written Tue · next Wed");
  assert.equal(said({ held: true, next_at: "2026-09-30T15:00:00.000Z" }), "Written Tue · a nudge waits for your say");
  assert.equal(
    said({ reply: { intent: "interested", claim: "person", read_at: "2026-09-24T15:00:00.000Z", undone: false } }),
    "Wrote back Thu · interested",
  );
  assert.equal(
    said({ reply: { intent: "question", claim: "automated", read_at: "2026-09-28T14:00:00.000Z", undone: false } }),
    "Wrote back today · a question",
  );
  assert.equal(
    said({ reply: { intent: "no", claim: "person", read_at: "2026-09-23T15:00:00.000Z", undone: false } }),
    "Said no Wed",
  );
  assert.equal(
    said({
      reply: { intent: "not_now", claim: "person", read_at: "2026-09-23T15:00:00.000Z", undone: false },
      resume_at: "2027-01-12T15:00:00.000Z",
    }),
    "Not now · until Jan 12, 2027",
  );
  assert.equal(said({ closed_reason: "said_no", stage: "archived" }), "Said no");
  assert.equal(said({ bounced: true, bounced_at: "2026-09-23T15:00:00.000Z" }), "Bounced Wed · address dropped");
  assert.equal(said({ stopped_at: "2026-09-25T15:00:00.000Z" }), "Stopped Fri");
  assert.equal(said({ away_until: "2026-10-02T05:00:00.000Z" }), "Written Tue · away until Oct 2");
  assert.equal(said({ booked_at: "2026-10-01T18:30:00.000Z", stage: "converted" }), "Booked Thu 1:30 PM");
  // An automatic reply is not their answer, and an undone reading is no reading.
  assert.equal(
    said({ reply: { intent: "away", claim: "auto_reply", read_at: "2026-09-23T15:00:00.000Z", undone: false } }),
    "Written Tue",
  );
  assert.equal(
    said({ reply: { intent: "no", claim: "person", read_at: "2026-09-23T15:00:00.000Z", undone: true } }),
    "Written Tue",
  );
});

test("a lead not written yet says when, or that it waits; one the chain never touched says nothing", () => {
  const planned = { sent: 0, first_sent_at: null, last_sent_at: null };
  assert.equal(said({ ...planned, next_at: "2026-09-28T16:12:00.000Z" }), "Today 11:12 AM");
  assert.equal(said({ ...planned, next_at: "2026-09-29T14:40:00.000Z" }), "Tomorrow 9:40 AM");
  assert.equal(said({ ...planned, held: true }), "Held for your say");
  assert.equal(said({ ...planned, handed: true }), "Handed to you");
  assert.equal(said(planned), null);
});

const lines = (over = {}) => ({
  chain: { root_id: "r1", name: "Trainers in Austin", state: "running" },
  written_to: 44,
  today: 18,
  next: { at: "2026-09-28T16:12:00.000Z", business: "Zilker Kettlebell Club", host: "mail.example.com" },
  held: 0,
  waiting_run_id: null,
  leads: [],
  ...over,
});
const chain = { domains: [{ host: "mail.example.com", sent_days: 0 }] };

test("the strip says how many, today's of the day's share, the next and where from", () => {
  const s = reachOutStripOf(lines(), chain, NOW, TZ);
  assert.equal(s.title, "Writing to 44 businesses");
  assert.deepEqual(s.parts, ["18 of 30 today", "next 11:12 AM, Zilker Kettlebell Club", "from mail.example.com"]);
  assert.equal(s.running, true);
  assert.equal(s.progress, 0.6);
  assert.deepEqual(s.going, { label: "How it's going", to: "outbound/r1" });
  assert.deepEqual(s.toggle, { label: "Pause", pause: true });
  assert.equal(s.waiting, null);
});

test("the strip, paused, with nothing planned, with holds and a run waiting", () => {
  const paused = reachOutStripOf(lines({ chain: { root_id: "r1", name: "T", state: "paused" } }), chain, NOW, TZ);
  assert.equal(paused.title, "Paused · 44 businesses written to");
  assert.deepEqual(paused.parts, ["18 of 30 today", "nothing goes while it is paused"]);
  assert.deepEqual(paused.toggle, { label: "Resume", pause: false });
  const quiet = reachOutStripOf(lines({ next: null, held: 2, waiting_run_id: "b9" }), null, NOW, TZ);
  assert.deepEqual(quiet.parts, ["18 today", "nothing more planned yet", "2 held for your say"]);
  assert.equal(quiet.progress, null);
  assert.deepEqual(quiet.waiting, { label: "A run waits for you", to: "broadcasts/run:b9" });
  const tomorrow = reachOutStripOf(
    lines({ next: { at: "2026-09-29T14:40:00.000Z", business: null, host: null } }),
    chain,
    NOW,
    TZ,
  );
  assert.deepEqual(tomorrow.parts, ["18 of 30 today", "next tomorrow 9:40 AM"]);
});

const story = (over = {}) => ({
  lead_id: "l1",
  business_name: "Zilker Kettlebell Club",
  stage: "converted",
  closed_reason: null,
  found_at: "2026-09-20T15:00:00.000Z",
  email_state: "ok",
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  chain: { root_id: "r1", name: "Trainers in Austin", state: "running" },
  search: { id: "s1", name: "Trainers · Austin", asked: "personal trainers in Austin", fit: "strong" },
  conversation_id: "c1",
  sends: [
    {
      id: "s1",
      n: 0,
      hand: null,
      state: "sent",
      reason: null,
      send_at: "2026-09-22T15:00:00.000Z",
      sent_at: "2026-09-22T15:00:00.000Z",
      angle: "their rating",
      host: "mail.example.com",
      message_id: "m1",
      email_status: "delivered",
      bounced: false,
    },
    {
      id: "s2",
      n: 1,
      hand: null,
      state: "planned",
      reason: null,
      send_at: "2026-09-30T15:00:00.000Z",
      sent_at: null,
      angle: null,
      host: null,
      message_id: null,
      email_status: null,
      bounced: false,
    },
    {
      id: "s3",
      n: 1,
      hand: null,
      state: "skipped",
      reason: "run_canceled",
      send_at: "2026-09-24T15:00:00.000Z",
      sent_at: null,
      angle: null,
      host: null,
      message_id: null,
      email_status: null,
      bounced: false,
    },
  ],
  readings: [
    {
      message_id: "m2",
      read_at: "2026-09-24T15:00:00.000Z",
      intent: "interested",
      claim: "person",
      summary: "Wants a demo",
      undone: false,
      until_at: null,
      can_undo: false,
    },
  ],
  can_stop: true,
  ...over,
});

test("the peek's story is each email and each reading, oldest first, with its doors", () => {
  const vm = reachOutTimelineOf(story(), NOW, TZ);
  assert.equal(vm.label, "Reach out · Trainers in Austin");
  assert.deepEqual(
    vm.lines.map((l) => [l.when, l.text]),
    [
      ["Tue 10:00 AM", "Your email · from mail.example.com · angle: their rating · delivered"],
      ["Thu 10:00 AM", "They wrote back · read as interested"],
      ["Wed 10:00 AM", "A short nudge · planned"],
    ],
  );
  assert.deepEqual(vm.read, { label: "Read what went out", to: "inbox/th-c1" });
  assert.deepEqual(vm.stop, { label: "Stop writing to them" });
  assert.equal(vm.undo, null);
  assert.equal(vm.stopped, null);
});

test("a stopped lead says so and offers no stop; a no that may be undone offers its undo", () => {
  const stopped = reachOutTimelineOf(story({ stopped_at: "2026-09-25T15:00:00.000Z", can_stop: false }), NOW, TZ);
  assert.equal(stopped.stopped, "You stopped writing to them Fri");
  assert.equal(stopped.stop, null);
  const no = reachOutTimelineOf(
    story({
      readings: [
        {
          message_id: "m3",
          read_at: "2026-09-27T15:00:00.000Z",
          intent: "no",
          claim: "person",
          summary: null,
          undone: false,
          until_at: null,
          can_undo: true,
        },
      ],
    }),
    NOW,
    TZ,
  );
  assert.deepEqual(no.undo, { label: "Read as no · undo", messageId: "m3" });
  const away = reachOutTimelineOf(
    story({
      readings: [
        {
          message_id: "m4",
          read_at: "2026-09-27T15:00:00.000Z",
          intent: "away",
          claim: "auto_reply",
          summary: null,
          undone: false,
          until_at: "2026-10-02T05:00:00.000Z",
          can_undo: false,
        },
      ],
    }),
    NOW,
    TZ,
  );
  assert.ok(away.lines.some((l) => l.text === "An automatic reply · away until Oct 2"));
  const skipped = reachOutTimelineOf(
    story({ sends: [{ ...story().sends[1], state: "skipped", reason: "owner_stopped" }], readings: [] }),
    NOW,
    TZ,
  );
  assert.deepEqual(
    skipped.lines.map((l) => l.text),
    ["A short nudge · you stopped writing to them"],
  );
  // No chain: nothing to stop, and no thread yet: nothing to read.
  const bare = reachOutTimelineOf(story({ chain: null, conversation_id: null, sends: [], readings: [] }), NOW, TZ);
  assert.equal(bare.stop, null);
  assert.equal(bare.read, null);
  assert.equal(bare.label, "Reach out · Trainers · Austin");
});

test("a person's page names the reach-out's emails, says how each reply was read, and where they were found", () => {
  const vm = reachOutPersonOf(story(), NOW, TZ);
  assert.deepEqual(vm.emails.get("m1"), {
    who: "Reach out · Trainers in Austin",
    sub: "Your email · angle: their rating · from mail.example.com · delivered",
  });
  assert.equal(vm.emails.size, 1);
  assert.equal(vm.readings.get("m2"), "Read as interested · the chain stopped · Talking");
  assert.deepEqual(vm.found, {
    at: Date.parse("2026-09-20T15:00:00.000Z"),
    text: "Found on Google Maps by “personal trainers in Austin” · strong fit · address checked",
  });
  assert.equal(vm.about, "Trainers in Austin · wrote back Thu · interested");
  const booked = reachOutPersonOf(story({ booked_at: "2026-10-01T18:30:00.000Z" }), NOW, TZ);
  assert.equal(booked.about, "Trainers in Austin · booked Thu 1:30 PM");
  const written = reachOutPersonOf(story({ readings: [] }), NOW, TZ);
  assert.equal(written.about, "Trainers in Austin · written Tue");
  assert.equal(reachOutPersonOf(story({ chain: null }), NOW, TZ).about, null);
});

test("a stopped lead is a skip at the send door, never a wait, in words of its own", () => {
  const facts = { leadStage: "nurture", suppressed: false, wroteBack: false, away: false };
  assert.equal(outreachRefusalOf({ ...facts, stopped: true }), "outreach_stopped");
  assert.equal(outreachRefusalOf(facts), null);
  // Wrote back and away still come first: their words say more.
  assert.equal(outreachRefusalOf({ ...facts, wroteBack: true, stopped: true }), "outreach_wrote_back");
  assert.equal(outreachRefusalOf({ ...facts, away: true, stopped: true }), "outreach_away");
  assert.equal(isWaitRefusal("outreach_stopped"), false);
  assert.match(PURPOSE_REFUSALS.outreach_stopped, /You stopped writing to this business/);
});
