/**
 * The Instagram row of Connections when Meta is in play (decision 0117): a workspace without the switch sees the
 * Instagram row exactly as before; one with it is offered Connect Meta, and an account on Instagram's own login there is
 * offered the move beside its Disconnect; an account connected through Meta is the Meta row, saying what Meta allowed and
 * what it did not, never that a line not built yet works; a lapsed one asks for a reconnect. The lines come from the channel
 * read's `meta_lines`, which the reader makes from the token's permissions (contracts metaLinesOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { metaLinesOf, toChannelVM } from "@chanlytics/contracts";
import { connectionRows } from "../../apps/dashboard/src/surfaces/settings/connections/model/setup.ts";

const NOW = Date.parse("2026-11-09T15:00:00Z");
const H = 3_600_000;
const ALL = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
];

const account = (over = {}) =>
  toChannelVM(
    {
      id: "ch-ig",
      kind: "instagram",
      number_e164: null,
      status: "active",
      created_at: new Date(NOW - 30 * 24 * H).toISOString(),
      last_inbound_at: new Date(NOW - 2 * H).toISOString(),
      handle: "harbor.nails",
      lapsed_at: null,
      ...over,
    },
    new Date(NOW),
  );
const rowOf = (inputs) =>
  connectionRows(
    {
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: null,
      instagram: { ready: true },
      ...inputs,
    },
    NOW,
  ).find((r) => r.kind === "instagram");

test("without the switch, the Instagram row is exactly as before, whether or not an account is connected", () => {
  const none = rowOf({ meta: { ready: false } });
  assert.equal(none.title, "Instagram");
  assert.equal(none.verb.label, "Connect Instagram");
  assert.equal(none.also, undefined);
  const on = rowOf({ channels: [account()], meta: null });
  assert.equal(on.title, "Instagram");
  assert.equal(on.verb.to, "verb:instagram-disconnect");
  assert.equal(on.also, undefined);
  assert.deepEqual(on.notes, []);
});

test("with the switch, an unconnected workspace is offered Connect Meta; an Instagram login account is offered the move", () => {
  const none = rowOf({ meta: { ready: true } });
  assert.equal(none.title, "Meta");
  assert.equal(none.state, "none");
  assert.deepEqual(none.verb, { label: "Connect Meta", to: "verb:meta-connect", who: "owner" });
  assert.match(none.sentence, /answers your Instagram DMs now/);
  const moving = rowOf({ channels: [account()], meta: { ready: true } });
  assert.equal(moving.title, "Instagram");
  assert.equal(moving.verb.to, "verb:instagram-disconnect", "its own Disconnect stays");
  assert.deepEqual(moving.also, { label: "Connect Meta", to: "verb:meta-connect", who: "owner" });
  assert.match(moving.notes[0].text, /its DMs keep flowing/);
});

test("an account connected through Meta is the Meta row: what Meta allowed, what it did not, and a Disconnect of its own", () => {
  const all = rowOf({ channels: [account({ meta_lines: metaLinesOf(ALL) })], meta: { ready: true } });
  assert.equal(all.title, "Meta");
  assert.equal(all.detail, "@harbor.nails");
  assert.equal(all.state, "connected");
  assert.deepEqual(all.verb, { label: "Disconnect", to: "verb:meta-disconnect", who: "owner" });
  assert.deepEqual(
    all.notes.map((n) => n.text),
    [
      "Meta allows: Messages, Post reels, stories and pictures, Trending sounds, Answer comments, Read plays and reach.",
    ],
  );
  assert.match(all.sentence, /answers its DMs/);
  assert.doesNotMatch(all.sentence, /posts|sounds|comments/i, "nothing not built is said to work");
  const some = rowOf({
    channels: [account({ meta_lines: metaLinesOf(["instagram_basic", "instagram_manage_messages"]) })],
    // The switch turned off later: an account already connected through Meta still shows as the Meta row.
    meta: null,
  });
  assert.equal(some.title, "Meta");
  assert.deepEqual(
    some.notes.map((n) => [n.text, n.live ?? false]),
    [
      ["Meta allows: Messages.", false],
      [
        "Not allowed: Post reels, stories and pictures, Trending sounds, Answer comments, Read plays and reach. Instagram did not allow it. Connect again and allow it.",
        true,
      ],
    ],
  );
});

test("a Meta connection whose token lapsed asks for a reconnect; a disconnected one offers Connect again", () => {
  const lapsed = rowOf({
    channels: [account({ meta_lines: metaLinesOf(ALL), lapsed_at: new Date(NOW - H).toISOString() })],
    meta: { ready: true },
  });
  assert.equal(lapsed.state, "attention");
  assert.equal(lapsed.stateWords, "Needs connecting again");
  assert.deepEqual(lapsed.verb, { label: "Connect again", to: "verb:meta-connect", who: "owner" });
  const off = rowOf({
    channels: [account({ status: "disabled", meta_lines: metaLinesOf(ALL) })],
    meta: { ready: true },
  });
  assert.equal(off.title, "Meta");
  assert.equal(off.state, "none");
  assert.equal(off.verb.label, "Connect again");
});
