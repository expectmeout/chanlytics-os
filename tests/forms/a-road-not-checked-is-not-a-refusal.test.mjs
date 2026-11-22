/**
 * How a request can be answered (the request page's reply-way.ts), from how its person can be written to.
 *
 * Found on production's own tables on 22 November 2026: where the send door could not be asked how to reach someone,
 * the request's page said "Nothing can be sent to them", which nobody knew. A road that was not checked is told
 * apart from a road that is refused: the first is a read to try again, the second says the door's own reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHANNEL_WORDS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { replyWayOf } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/surfaces/inbox/request/reply-way.ts")).href
);

/** One way of the send door's answer, as GET people/[id]/reach says it. */
const way = (wire, over = {}) => ({
  wire,
  ok: false,
  hold: "no_number",
  why: "No number on their page.",
  carries: wire === "whatsapp" ? "approved" : "words",
  starts: true,
  about: "ours",
  hours_left: null,
  ...over,
});
const reach = (...ways) => ({ ways });

test("an email that can go is the way; the chat they already have, open for a member's words, comes first", () => {
  const email = way("email", { ok: true, hold: null, why: null });
  assert.deepEqual(replyWayOf(reach(way("whatsapp"), email)), { way: email, why: null, unchecked: false });
  const chat = way("whatsapp", { ok: true, hold: null, why: null, carries: "words", starts: false });
  assert.equal(replyWayOf(reach(chat, email)).way, chat);
  // A chat that only an approved message can start is no reply road: the email is.
  const cold = way("whatsapp", { ok: true, hold: null, why: null });
  assert.equal(replyWayOf(reach(cold, email)).way, email);
});

test("a road that is refused says the door's own reason, and is not 'unchecked'", () => {
  const email = way("email", { hold: "not_ready", why: CHANNEL_WORDS.noMailbox });
  assert.deepEqual(replyWayOf(reach(way("whatsapp"), email)), {
    way: null,
    why: "Set up email in Settings › Connections first.",
    unchecked: false,
  });
});

test("a road nobody could ask about is unchecked: no reason is given, since none is known", () => {
  const email = way("email", { hold: "not_ready", why: CHANNEL_WORDS.unchecked });
  assert.deepEqual(replyWayOf(reach(way("whatsapp"), email)), { way: null, why: null, unchecked: true });
  // The same sentence under another hold is that hold's reason, whatever it reads as.
  const held = way("email", { hold: "opted_out", why: CHANNEL_WORDS.unchecked });
  assert.equal(replyWayOf(reach(held)).unchecked, false);
});

test("nothing read yet is nothing known: no way, no reason, and not a failed check", () => {
  assert.deepEqual(replyWayOf(null), { way: null, why: null, unchecked: false });
});
