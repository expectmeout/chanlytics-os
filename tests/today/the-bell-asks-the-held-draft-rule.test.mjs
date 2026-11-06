/**
 * The bell does not spell the held-draft rule a second time.
 *
 * A reply counting down to send waits on you while it can still be stopped, and the product has ONE predicate for it,
 * replyWaitsOnYou (conversations/standing.ts): the Inbox's Needs you, its buckets, the sidebar's badge and People's
 * Needs you ask it. The bell had its own `veto.endsAtMs > now`, which agreed, and so could drift. It asks the rule now,
 * and this holds the two together at the edges a rule is wrong at: a deadline in the past, at this very moment, a
 * moment ahead, and one that was never said.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotificationFeed, replyWaitsOnYou } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-05T15:00:00Z");

const bellShows = (endsAtMs) =>
  buildNotificationFeed({
    threads: [
      {
        id: "t1",
        real: true,
        needsYou: false,
        who: "Rosa",
        veto: { window: 60, endsAtMs, messageId: "m1", draft: "We open at 10 tomorrow." },
      },
    ],
    now: NOW,
  }).some((i) => i.kind === "held_draft");

test("a held reply is in the bell exactly while replyWaitsOnYou says it waits on you", () => {
  for (const endsAtMs of [NOW - 60_000, NOW - 1, NOW, NOW + 1, NOW + 30_000, undefined, null, Number.NaN]) {
    assert.equal(
      bellShows(endsAtMs),
      replyWaitsOnYou({ endsAtMs }, NOW),
      `the bell and the rule agree for a deadline of ${String(endsAtMs)}`,
    );
  }
  assert.equal(bellShows(NOW + 1), true, "and a reply a moment from sending is still stoppable");
  assert.equal(bellShows(NOW), false, "one whose time has come is not");
});
