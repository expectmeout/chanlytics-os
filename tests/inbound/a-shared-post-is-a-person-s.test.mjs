/**
 * A post or a reel a person shares in a DM is legible to a person and not the receptionist's to answer (decision 0001,
 * step 8): it is handed over the way a pin drop or a contact card is (core inbound/gates.ts), with its link in the
 * words, no apology and no model asked. Typed as text by its adapter (channels instagram-events.ts), it used to reach
 * the model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { text, world } from "./_world.mjs";

const IGSID = "6100000000000001";
const SHARED = "Shared reel (Spring sets): https://www.instagram.com/reel/abc123";
/** An Instagram account's carrier, as lib/instagram/dm-answer.ts makes one: words as written, nothing held. */
const account = {
  channel: "instagram",
  send: async () => ({ ok: true, wamid: "mid.out", status: 200 }),
  body: (t) => t,
  held: null,
};
/** The fixture as inboundFromInstagram makes a shared reel: a share, typed as text, the person by their DM id. */
const asShare = (n) => ({
  ...n,
  channel: "instagram",
  kind: "share",
  type: "text",
  rawType: "reel",
  body: SHARED,
  identity: { externalId: IGSID, phoneE164: null, email: null },
});

test("a shared reel is handed to a person with its link, and the model is never asked", async () => {
  let asked = 0;
  const w = world({ env: { modelKey: "k" }, carrier: account, shape: asShare });
  await w.run(text(SHARED, "mid.share1"), {
    brain: async () => ({ generateReply: async () => ((asked += 1), { text: "Love it!", escalate: false }) }),
  });
  assert.equal(asked, 0, "nothing is composed about a post nobody asked a question of");
  assert.equal(w.seen.sent.length, 0, "no apology and no answer go back");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["non_text"],
    "a person is asked",
  );
  assert.match(w.seen.escalations[0].details, /instagram\.com\/reel\/abc123/, "with the link in front of them");
  assert.equal(w.seen.processed, 1);
});
