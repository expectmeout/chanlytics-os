/**
 * Reach out's shared words (packages/contracts reach-out.ts), run: the foot a campaign email carries, which says
 * less than the law asks for no email, and the unsubscribe page's sentences for each thing it can be showing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignFooter, unsubscribePageWords, WHY_FROM_MAPS } from "@chanlytics/contracts";
import { buildEmailRequest, hostedIdentity } from "@chanlytics/channels";

const URL_ =
  "https://app.chanlytics.com/u/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcdefghijklmnopqrstuvwxy";
const FOOT = {
  why: WHY_FROM_MAPS,
  business: "Chanlytics",
  address: "410 Baylor St, Austin, TX 78703",
  unsubscribeUrl: URL_,
};

test("the foot says why, who and where, and the two ways to say no, in four lines", () => {
  assert.equal(
    campaignFooter(FOOT),
    [
      "I found your business on Google Maps.",
      "Chanlytics · 410 Baylor St, Austin, TX 78703",
      `Not interested? Reply "no thanks" and I won't write again.`,
      `Unsubscribe: ${URL_}`,
    ].join("\n"),
  );
  assert.equal(
    campaignFooter({ ...FOOT, business: "  Chanlytics  " }).split("\n")[1],
    "Chanlytics · 410 Baylor St, Austin, TX 78703",
  );
});

test("a foot missing any part the law asks for is never made", () => {
  for (const k of ["why", "business", "address", "unsubscribeUrl"])
    assert.throws(() => campaignFooter({ ...FOOT, [k]: "  " }), /why, who, where and how to stop/, k);
});

test("the foot is the last thing a campaign email says, after the signature", () => {
  const r = buildEmailRequest({
    identity: hostedIdentity(
      { local_part: "chanlytics", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Ruben at Chanlytics" },
      "mail.chanlytics.com",
    ),
    to: "coach@example.com",
    parent: null,
    subject: "The calls you miss mid-session",
    body: "A 4.9 from 212 reviews says people find you.",
    signature: "Ruben",
    actor: "ai",
    campaign: { unsubscribeUrl: URL_, footer: campaignFooter(FOOT) },
    messageId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  });
  assert.ok(r.text.endsWith(campaignFooter(FOOT)));
  assert.ok(r.text.indexOf("Ruben") < r.text.indexOf(WHY_FROM_MAPS));
});

test("the page's words: only the page that asks has a button, and nothing reads 'undefined' or 'null'", () => {
  const views = [
    { kind: "ask", business: "Best Movers" },
    { kind: "ask", business: null },
    { kind: "ask", business: "   " },
    { kind: "done", business: "Best Movers" },
    { kind: "done", business: null },
    { kind: "bad_link" },
    { kind: "unavailable" },
  ];
  for (const v of views) {
    const w = unsubscribePageWords(v);
    assert.equal(w.button !== null, v.kind === "ask", JSON.stringify(v));
    for (const s of [w.title, w.lead, w.body, w.button, w.foot].filter((x) => x !== null))
      assert.doesNotMatch(s, /undefined|null|\s{2}/, `${JSON.stringify(v)}: ${s}`);
  }
  assert.equal(unsubscribePageWords(views[0]).lead, "Stop emails from Best Movers?");
  assert.equal(unsubscribePageWords(views[1]).lead, "Stop these emails?");
  assert.equal(unsubscribePageWords(views[2]).lead, "Stop these emails?", "a blank name is no name");
  assert.equal(unsubscribePageWords(views[3]).lead, "You're unsubscribed.");
  assert.match(unsubscribePageWords(views[3]).body, /^Best Movers won't send you emails like that one again\.$/);
  assert.match(unsubscribePageWords(views[0]).body, /they can still answer you/);
});
