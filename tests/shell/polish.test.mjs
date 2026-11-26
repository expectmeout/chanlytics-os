/**
 * Customer-facing polish: the bell says a thing once and in words, a reply
 * is bounded to the send, the clock names the day, and the developer's
 * footer and the mockup's presence menu are not a customer's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCALATION_REASON_SHORT,
  REPLY_WINDOW_HOURS,
  REPLY_WINDOW_WORDS,
  dedupeFeed,
  tzClock,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { funnelLine } = await importSrc("packages/contracts/src/reports/campaigns/words/lines.ts");

const row = (over) => ({
  key: "x",
  kind: "alert",
  at: 1,
  title: "",
  message: "",
  to: "",
  icon: "",
  tone: "",
  action: "",
  unread: true,
  ...over,
});

test("the bell says a thing once: a kept handoff or call-back row hides while the derived needs-you row for its thread stands", () => {
  const derived = row({ key: "needs:th-c1", kind: "needs_you" });
  const keptSame = row({ key: "n:1", kind: "handoff", about: { type: "conversation", id: "c1" } });
  const keptOther = row({ key: "n:2", kind: "handoff", about: { type: "conversation", id: "c2" } });
  const keptCall = row({ key: "n:3", kind: "call", about: { type: "call", id: "k9" } });
  const keptCallback = row({ key: "n:4", kind: "call", about: { type: "conversation", id: "c1" } });
  assert.deepEqual(
    dedupeFeed([derived, keptSame, keptOther, keptCall, keptCallback]).map((r) => r.key),
    ["needs:th-c1", "n:2", "n:3"],
  );
  assert.deepEqual(
    dedupeFeed([keptSame, keptCallback]).map((r) => r.key),
    ["n:1", "n:4"],
    "answered: the derived row is gone and the record stays",
  );
});

test("the clock names the day when it is not today", () => {
  const tz = "America/New_York";
  const now = new Date("2026-09-06T20:00:00Z"); // 4:00 PM Sunday in New York
  assert.equal(tzClock("2026-09-06T22:46:00Z", tz, now), "6:46 PM");
  assert.equal(tzClock("2026-09-07T22:46:00Z", tz, now), "tomorrow 6:46 PM");
  assert.equal(tzClock("2026-09-09T13:00:00Z", tz, now), "Wed 9:00 AM");
  assert.equal(tzClock(null, tz, now), null);
});

test("the wiring: a handoff is said in the owner's words, about its thread", async () => {
  const { handoffMessage } = await importSrc("apps/edge/lib/inbound/alerts.ts");
  const about = { type: "conversation", id: "c-1" };
  const said = handoffMessage({
    threadId: "13055550100",
    userText: "hi",
    botText: "(no reply sent)",
    reason: "passed to a human",
    who: "Rosa Diaz",
    channel: "whatsapp",
    about,
  });
  // The reason in the Inbox's words (reasonShort of the hold's reason), not a map of the notice's own.
  assert.equal(said.subject, `Rosa Diaz needs a person · ${ESCALATION_REASON_SHORT.human_token}`);
  assert.deepEqual(said.about, about, "about its thread");
  assert.equal(
    handoffMessage({ threadId: "13055550100", userText: "hi", botText: "-", reason: "stale" }).about,
    null,
    "and about nothing it was not told",
  );
  assert.doesNotMatch(`${said.subject} ${said.body}`, /WhatsApp handoff needed/);
  // Every handoff on the message path carries the name and the thread, and reaches the owner once: run in
  // inbound/phases/every-way-out-says-what-the-message-became.test.mjs ("a handoff names who wrote and the thread it is
  // about"). A call said by name, about its call or the thread that needs a call back, runs: voice/calls/retell-door/.
  // The bell shows the feed once, a hold as one row (contracts bellFeed, which hides the kept row by dedupeFeed), over
  // the bridge's own feed: today/record/one-row-for-one-hold.test.mjs.
});

test("a reply to a run is the customer's first words within the reply window after the run reached them, kept with its time", async () => {
  // A reply is an inbound inside the contracts' one window (its value runs in reports-honest.test.mjs), and the FIRST one
  // is kept with its time (slice C). The SQL series keeps the same window: campaign_series, redefined since 00064
  // through 00451, run on the stack (reports/campaigns/campaign-answers.db.test.mjs).
  const { repliedThreads } = await importSrc("apps/dashboard/src/server/campaigns/broadcasts/replied.ts");
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SENT = "2026-11-10T12:00:00.000Z";
  const at = (hours) => new Date(Date.parse(SENT) + hours * 3_600_000).toISOString();
  const inbound = (id, conversation, created) => ({
    id,
    tenant_id: T,
    conversation_id: conversation,
    direction: "inbound",
    sender: "customer",
    created_at: created,
    meta: {},
    body: "Yes please",
  });
  const ctx = {
    supabase: fakeDb({
      messages: [
        inbound("m3", "c-answered", at(30)),
        inbound("m1", "c-answered", at(2)),
        inbound("m2", "c-late", at(REPLY_WINDOW_HOURS + 1)),
      ],
    }),
  };
  const replied = await repliedThreads(
    ctx,
    T,
    new Map([
      ["c-answered", SENT],
      ["c-late", SENT],
      ["c-quiet", SENT],
    ]),
  );
  assert.deepEqual(
    [...replied],
    [["c-answered", at(2)]],
    "the first reply, with its time; one past the window is no reply, and a thread that said nothing is none",
  );
});

test("a campaign's answered share says its window, the one a reply is counted in", () => {
  assert.ok(
    funnelLine({ sent: 40, delivered: 38, read: 20, readOf: 30, replied: 6 }).includes(
      `were answered ${REPLY_WINDOW_WORDS}`,
    ),
  );
  // A long warning wraps beside its glyph, not under it: the stylesheet's own rule, read as a stylesheet is (node draws
  // nothing).
  assert.ok(
    readRaw("apps/dashboard/src/surfaces/today/zones/zones.css").includes(
      ".tz-alert > span {\n  flex: 1 1 auto;\n  min-width: 0;\n}",
    ),
    "a long warning wraps beside its glyph, not under it",
  );
  // Every closing time Today says names its day (tzClock above), in the queue's, the facts', the figures' and the rows'
  // words: today/record/ and today/zones/need-you-acts.test.mjs draw them on a day that is tomorrow's.
  // Nothing of the workshop on a customer's screen: presence was the mockup's, and went with demo mode, and the footer
  // is the customer's. FrameApp.tsx cannot be imported in node, so its footer is still read.
  const app = readCode("apps/dashboard/src/bridge/FrameApp.tsx");
  assert.ok(!app.includes("other surfaces seeded") && !app.includes("liveLabels"), "the footer is the customer's");
});
