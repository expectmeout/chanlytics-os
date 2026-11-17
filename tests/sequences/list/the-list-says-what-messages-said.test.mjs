/**
 * The Campaigns list says what the Messages list said (Campaigns, one tab, step 2, 17 Nov 2026), on the campaign it is about:
 *
 *  - C3: a running campaign's step whose message cannot go (WhatsApp refused it or paused it where the step goes by
 *    WhatsApp, it has no version in the step's language, or it is gone) puts the campaign in Needs you, its row naming the
 *    step and why. A step that does not go by WhatsApp is not stopped by WhatsApp's no.
 *  - C13: a running campaign sends a message nothing can carry here now: its row says it waits, quietly, never Needs you.
 *  - C7: a search finds a campaign by the titles of its steps' messages, naming the step.
 *  - C5: the messages nothing sends, one row a name, each saying what can use it.
 *
 * Run on rows as GET sequences answers them and messages as campaignMessagesOf makes them of the template rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_WAITS_WORDS,
  OTHER_MESSAGES_WORDS,
  campaignMessagesOf,
  messageFoundLine,
  otherMessagesOf,
  sequenceGroupOf,
  sequenceMatches,
  sequenceMessageFound,
  sequenceMessageOff,
  sequenceMessageWaits,
  sequenceRowLine,
} from "@chanlytics/contracts";

const AT = { tz: "America/New_York", nowMs: Date.parse("2026-11-17T20:00:00Z"), word: "meeting", twin: null };
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const row = (over = {}) => ({
  id: "seq",
  name: "Asked, didn't book",
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: "2026-11-03T14:03:51Z",
  first: null,
  date: null,
  steps: 2,
  channels: ["whatsapp", "email"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
/** A template row as the workspace holds it: WhatsApp's with its standing, or an email version. */
const tpl = (name, over = {}) => ({
  id: `${name}-${over.channel ?? "whatsapp"}-${over.language ?? "en_US"}`,
  name,
  language: "en_US",
  channel: "whatsapp",
  category: "marketing",
  meta_status: "approved",
  title: null,
  ...over,
});
const step = (place, name, over = {}) => ({ place, name, language: "en_US", channels: ["whatsapp", "email"], ...over });

test("a step whose message cannot go names itself and why, the first by place; WhatsApp's no stops only a step that goes by WhatsApp", () => {
  const messages = campaignMessagesOf([
    tpl("booking_follow_up", { title: "Booking follow-up" }),
    tpl("short_nudge", { meta_status: "rejected", title: "A short nudge" }),
    tpl("spanish_only", { language: "es" }),
    tpl("paused_one", { meta_status: "paused" }),
  ]);
  assert.equal(sequenceMessageOff([step(1, "booking_follow_up")], messages), null, "every step's message can go");
  assert.deepEqual(sequenceMessageOff([step(2, "short_nudge"), step(1, "booking_follow_up")], messages), {
    place: 2,
    why: "refused",
    language: "en_US",
  });
  assert.equal(
    sequenceMessageOff([step(1, "short_nudge", { channels: ["email"] })], messages),
    null,
    "an email step is not stopped by WhatsApp's no",
  );
  assert.equal(sequenceMessageOff([step(1, "paused_one")], messages)?.why, "paused");
  assert.equal(sequenceMessageOff([step(1, "spanish_only")], messages)?.why, "no_version");
  assert.equal(sequenceMessageOff([step(1, "deleted_one")], messages)?.why, "gone");
});

test("a campaign with a stopped step needs you, and its row says which and why, in one word for WhatsApp's no", () => {
  const off = (why, language = "en_US") => row({ message_off: { place: 2, why, language } });
  assert.equal(sequenceGroupOf(off("refused")), "needs");
  assert.equal(sequenceRowLine(off("refused"), AT), "WhatsApp refused step 2’s message");
  assert.equal(sequenceRowLine(off("paused"), AT), "WhatsApp paused step 2’s message");
  assert.equal(sequenceRowLine(off("no_version", "es"), AT), "Step 2’s message has no Spanish version");
  assert.equal(sequenceRowLine(off("gone"), AT), "Step 2’s message is gone · pick another");
  // A server before the change answers none: the row is where it was.
  assert.equal(sequenceGroupOf(row()), "customers");
  assert.equal(sequenceGroupOf(row({ message_off: null })), "customers");
});

test("a campaign whose message nothing can carry here says it waits, quietly: never Needs you, never its next send", () => {
  const ready = {
    whatsapp: { ready: false, why: "No WhatsApp number is connected." },
    sms: { ready: false, why: "No texting line yet." },
    email: { ready: false, why: "Email isn't set up." },
  };
  const messages = campaignMessagesOf([tpl("booking_follow_up")]);
  const sends = row({ messages: [{ place: 1, name: "booking_follow_up", language: "en_US" }] });
  assert.equal(sequenceMessageWaits(sends, messages, ready), true);
  assert.equal(sequenceMessageWaits(sends, messages, null), false, "the channels not read: nothing is said");
  assert.equal(sequenceMessageWaits({ ...sends, state: "paused" }, messages, ready), false, "only a running one");
  const waiting = { ...sends, next: { id: "b", at: "2026-11-18T15:00:00Z", people: 3, state: "scheduled", place: 1 } };
  assert.equal(sequenceRowLine(waiting, { ...AT, waits: true }), MESSAGE_WAITS_WORDS.row);
  assert.equal(sequenceGroupOf(waiting), "customers", "it goes by itself once a channel can: nothing to press");
});

test("a search finds a campaign by its steps' messages' titles, and says which step, never by a word in none", () => {
  const titles = new Map([["short_nudge", "A short nudge"]]);
  const titleOf = (name) => titles.get(name) ?? null;
  const r = row({
    name: "Brooklyn intro",
    messages: [
      { place: 1, name: "intro", language: "en_US" },
      { place: 2, name: "short_nudge", language: "en_US" },
    ],
  });
  assert.equal(sequenceMatches(r, "nudge"), false, "without the titles, its own name alone");
  assert.equal(sequenceMatches(r, "nudge", titleOf), true);
  assert.deepEqual(sequenceMessageFound(r, "nudge", titleOf), { place: 2, title: "A short nudge" });
  assert.equal(messageFoundLine({ place: 2, title: "A short nudge" }), "Step 2 · A short nudge");
  assert.equal(sequenceMatches(r, "invoice", titleOf), false);
  assert.equal(sequenceMatches(r, "brooklyn", titleOf), true, "its own name still finds it");
});

test("the messages nothing sends are one row a name, by title, each saying what can use it", () => {
  const messages = campaignMessagesOf([
    tpl("price_check_in", { title: "Price check-in" }),
    tpl("price_check_in", { language: "es", title: "Price check-in" }),
    tpl("old_welcome", { title: "Old welcome", hidden_at: "2026-10-01T00:00:00Z" }),
    tpl("new_hours", { title: "New hours", meta_status: "pending" }),
    tpl("holiday_hours", { channel: "email", title: "Holiday hours" }),
    tpl("booking_follow_up", { title: "Booking follow-up" }),
  ]);
  const others = otherMessagesOf(messages, (name) => name === "booking_follow_up");
  assert.deepEqual(
    others.map((m) => [m.title, m.line]),
    [
      ["Holiday hours", OTHER_MESSAGES_WORDS.nothing],
      ["New hours", OTHER_MESSAGES_WORDS.checking],
      ["Old welcome", OTHER_MESSAGES_WORDS.hidden],
      ["Price check-in", OTHER_MESSAGES_WORDS.inbox],
    ],
  );
});
