/**
 * Reach out's shared words (packages/contracts reach-out.ts), run: the foot a campaign email carries, which says
 * less than the law asks for no email, and the unsubscribe page's sentences for each thing it can be showing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignFooter,
  campaignFooterHtml,
  unsubscribePageWords,
  whyFrom,
  WHY_FROM_MAPS,
} from "@chanlytics/contracts";
import { buildEmailRequest, hostedIdentity } from "@chanlytics/channels";

const URL_ =
  "https://app.chanlytics.com/u/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcdefghijklmnopqrstuvwxy";
const FOOT = {
  why: WHY_FROM_MAPS,
  business: "Chanlytics",
  address: "410 Baylor St, Austin, TX 78703",
  unsubscribeUrl: URL_,
};

test("the foot says why, that it is marketing, who and where, and the two ways to say no, in five lines", () => {
  assert.equal(
    campaignFooter(FOOT),
    [
      "I found your business on Google Maps.",
      "This is a marketing email.",
      "Chanlytics · 410 Baylor St, Austin, TX 78703",
      `Not interested? Reply "no thanks" and I won't write again.`,
      `Unsubscribe: ${URL_}`,
    ].join("\n"),
  );
  assert.equal(
    campaignFooter({ ...FOOT, business: "  Chanlytics  " }).split("\n")[2],
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

test("in HTML the foot is the canvas's: one line to say no, the link reading Unsubscribe; the text keeps the address", () => {
  const html = campaignFooterHtml(FOOT);
  // CAN-SPAM asks a commercial email to say it is one: both forms of the foot say it, in the same words.
  assert.match(html, /<p>I found your business on Google Maps\.<br>This is a marketing email\.<br>Chanlytics · /);
  assert.match(
    html,
    /Not interested\? Reply &quot;no thanks&quot; and I won&#39;t write again · <a href="https:\/\/app\.chanlytics\.com\/u\/[^"]+">Unsubscribe<\/a>/,
  );
  assert.doesNotMatch(html.replace(/href="[^"]+"/, ""), /app\.chanlytics\.com/, "the address shows only as the link");
  assert.match(campaignFooterHtml({ ...FOOT, business: "Best <Movers>" }), /Best &lt;Movers&gt;/, "escaped");
  const r = buildEmailRequest({
    identity: hostedIdentity(
      { local_part: "chanlytics", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Ruben" },
      "mail.chanlytics.com",
    ),
    to: "coach@example.com",
    parent: null,
    subject: "The calls you miss",
    body: "A 4.9 from 212 reviews says people find you.",
    signature: null,
    actor: "ai",
    campaign: { unsubscribeUrl: URL_, footer: campaignFooter(FOOT), footerHtml: campaignFooterHtml(FOOT) },
    messageId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  });
  assert.ok(r.html.endsWith(campaignFooterHtml(FOOT)), "the HTML ends with the foot as the canvas draws it");
  assert.ok(r.text.endsWith(campaignFooter(FOOT)), "the text keeps the address, which plain text needs");
  assert.throws(
    () =>
      buildEmailRequest({
        identity: hostedIdentity(
          { local_part: "c", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "R" },
          "mail.chanlytics.com",
        ),
        to: "coach@example.com",
        parent: null,
        subject: "Hi",
        body: "x",
        signature: null,
        actor: "ai",
        campaign: { unsubscribeUrl: URL_, footer: campaignFooter(FOOT), footerHtml: "<p>no link</p>" },
        messageId: "11111111-1111-4111-8111-111111111111",
        tenantId: "22222222-2222-4222-8222-222222222222",
      }),
    /footer carries its unsubscribe link/,
  );
});

test("why they hear from you comes from where the business was found", () => {
  assert.equal(whyFrom("maps"), WHY_FROM_MAPS);
  assert.equal(whyFrom("something new"), "I came across your business online.");
});

test("the page names the email it is about, and a press that did not go through can be pressed again", () => {
  const ask = unsubscribePageWords({ kind: "ask", business: "Best Movers", sender: "sam@harbor-mail.com" });
  assert.match(ask.body, /emails like the one from sam@harbor-mail\.com again/);
  const done = unsubscribePageWords({ kind: "done", business: "Best Movers", sender: "sam@harbor-mail.com" });
  assert.match(done.lead, /You're unsubscribed from emails from sam@harbor-mail\.com\./);
  const failed = unsubscribePageWords({ kind: "unavailable", retry: true });
  assert.equal(failed.button, "Try again");
  assert.match(failed.body, /Or reply to the email and ask them to stop\./);
  assert.equal(unsubscribePageWords({ kind: "unavailable" }).button, null, "no secret: nothing a press could do");
});
