/**
 * A connected mailbox signs what it sends as its owner signs in Gmail (00487, the email canvas's lane B). On production on
 * 27 Oct 2026 a reply sent from Need you reached RJ Capital ending on "Talk soon," with nothing under it: a reply was
 * never signed, and hi@ had no signature saved. Gmail keeps the owner's signature (users.settings.sendAs, which the
 * gmail.readonly the grant holds reads); it is kept on the mailbox, sent as Gmail's markup in what the mailbox sends, and
 * said everywhere else as words.
 *
 *   - What it signs with: none where its owner turned it off, their own words, Gmail's, else the name it sends as
 *     (contracts mailboxSignsOf, one rule for the send and the page).
 *   - Gmail's as words, and as markup cleaned of anything that runs or loads a page (channels mailbox-signature.ts).
 *   - The email carries the markup in its HTML, in Gmail's block, and the words in its text (buildEmailRequest).
 *   - Gmail asked, and kept: read when due, once a day, and a failed read keeps what was (edge mailbox-signature.ts).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailRequest,
  cleanGmailSignature,
  connectedIdentity,
  gmailSignature,
  gmailSignatureWords,
  mailboxDtoOf,
  mailboxSignatureOf,
} from "@chanlytics/channels";
import { mailboxSignsOf } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { MAILBOX_ENV, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const restore = withEnv(MAILBOX_ENV);
after(restore);
const { gmailSignatureDue, keepGmailSignature } = await importSrc("apps/edge/lib/email/mailbox/mailbox-signature.ts");
const { logger } = await importSrc("apps/edge/lib/log.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = Date.parse("2026-10-27T18:00:00Z");

// The shape Gmail keeps a signature in: its own blocks, a logo it hosts, a linked address.
const GMAIL =
  '<div dir="ltr"><div><b>Ruben Segura</b></div><div>Founder, Chanlytics</div>' +
  '<div><img src="https://ci3.googleusercontent.com/mail-sig/logo" width="160" height="24"></div>' +
  '<div><a href="https://chanlytics.agency">chanlytics.agency</a> | ' +
  '<a href="mailto:hi@chanlytics.agency">hi@chanlytics.agency</a></div></div>';

const box = (over = {}) =>
  rows.mailboxConnection({
    tenant_id: T,
    address: "hi@chanlytics.agency",
    host: "chanlytics.agency",
    from_name: "Ruben Segura",
    ...over,
  });

/* ------------------------------ what it signs with ------------------------------ */

test("what it signs with: none where it is off, their own words, Gmail's, else the name it sends as", () => {
  const r = { signature: null, signature_off: false, from_name: "Ruben Segura", gmail_signature_at: null };
  assert.deepEqual(mailboxSignsOf(r, "Ruben Segura\nChanlytics"), {
    from: "gmail",
    words: "Ruben Segura\nChanlytics",
    gmail_read_at: null,
    gmail: "Ruben Segura\nChanlytics",
  });
  assert.equal(mailboxSignsOf({ ...r, signature: "Ruben, Chanlytics" }, "Gmail's").from, "own");
  assert.equal(mailboxSignsOf({ ...r, signature: "Ruben", signature_off: true }, "Gmail's").words, null, "off: none");
  assert.deepEqual(
    mailboxSignsOf(r, null),
    { from: "name", words: "Ruben Segura", gmail_read_at: null, gmail: null },
    "REGRESSION: with nothing set, a reply ended on 'Talk soon,' and nothing under it",
  );
});

test("Gmail's signature as words: its lines, its links by their words, its logo left out", () => {
  assert.equal(
    gmailSignatureWords(GMAIL)?.replace(/\u00a0/g, " "),
    "Ruben Segura\nFounder, Chanlytics\nchanlytics.agency | hi@chanlytics.agency",
  );
  assert.equal(gmailSignatureWords("<div><br></div>"), null, "a signature of nothing is none");
});

test("Gmail's markup as an email carries it: nothing that runs or loads a page, the rest as it was", () => {
  const dirty =
    `${GMAIL}<script>alert(1)</script><style>p{}</style>` +
    '<a href="javascript:alert(2)" onclick="x()">tap</a><iframe src="https://example.com/x"></iframe>';
  const clean = cleanGmailSignature(dirty);
  assert.ok(clean.startsWith(GMAIL), "Gmail's own blocks, logo and links are kept");
  for (const gone of ["<script", "alert(1)", "<style", "javascript:", "onclick", "<iframe"])
    assert.ok(!clean.includes(gone), `left out: ${gone}`);
  assert.equal(cleanGmailSignature("<script>alert(1)</script>"), null, "nothing left: none");
  assert.equal(cleanGmailSignature(`<div>${"x".repeat(10_001)}</div>`), null, "past what a mailbox keeps: none");
});

test("a mailbox's signature: the words always, Gmail's markup only where it signs with Gmail's", () => {
  assert.deepEqual(mailboxSignatureOf(box({ gmail_signature: GMAIL })), {
    text: gmailSignatureWords(GMAIL),
    html: GMAIL,
  });
  assert.deepEqual(mailboxSignatureOf(box({ gmail_signature: GMAIL, signature: "Ruben · Chanlytics" })), {
    text: "Ruben · Chanlytics",
    html: null,
  });
  assert.deepEqual(mailboxSignatureOf(box()), { text: "Ruben Segura", html: null }, "its name, with nothing set");
  assert.equal(mailboxSignatureOf(box({ gmail_signature: GMAIL, signature_off: true })), null);
  // The page's row says the same thing, as words.
  assert.equal(mailboxDtoOf(box({ gmail_signature: GMAIL })).signs.from, "gmail");
});

/* ------------------------------- the email itself ------------------------------- */

const reply = (signed) =>
  buildEmailRequest({
    identity: connectedIdentity(box()),
    to: "ruben@rjcapital.example",
    parent: { messageId: "p1", rfcMessageId: "<p1@mail.gmail.com>", references: [], subject: "test need you" },
    body: "Hi Ruben,\n\nThanks for reaching out.\n\nTalk soon,",
    signature: signed?.text ?? null,
    signatureHtml: signed?.html ?? null,
    actor: "human",
    messageId: "m1",
    tenantId: T,
  });

test("the email carries Gmail's markup under its words, in Gmail's block, and the words in its text", () => {
  const r = reply(mailboxSignatureOf(box({ gmail_signature: GMAIL })));
  assert.ok(r.html.startsWith("<p>Hi Ruben,</p>"), "the words first, as paragraphs");
  assert.ok(r.html.includes(`<div class="gmail_signature" data-smartmail="gmail_signature">${GMAIL}</div>`));
  assert.ok(r.text.endsWith(`Talk soon,\n\n${gmailSignatureWords(GMAIL)}`), "and the words part says it as words");
  // Their own words, or the name, are words in both parts, escaped as the body is.
  const named = reply(mailboxSignatureOf(box()));
  assert.ok(named.html.endsWith("<p>Ruben Segura</p>"));
  assert.ok(named.text.endsWith("Talk soon,\n\nRuben Segura"));
  assert.ok(!reply(null).text.includes("Ruben Segura"), "none, where it is off");
});

/* ------------------------------- Gmail asked, and kept ------------------------------- */

test("Gmail is asked for the address's own signature; an address it does not send as has none", async () => {
  const net = providers((c) =>
    c.url.endsWith("/settings/sendAs/hi%40chanlytics.agency")
      ? { json: { sendAsEmail: "hi@chanlytics.agency", signature: GMAIL } }
      : { status: 404, json: {} },
  );
  try {
    assert.deepEqual(await gmailSignature("ya29.t", "hi@chanlytics.agency"), { ok: true, html: GMAIL });
    assert.deepEqual(await gmailSignature("ya29.t", "other@chanlytics.agency"), { ok: true, html: null });
    assert.equal(net.calls[0].headers.Authorization, "Bearer ya29.t");
  } finally {
    net.restore();
  }
});

test("read when it is due (never yet, or a day on), kept cleaned; a read that fails keeps what was", async () => {
  const fresh = box({ gmail_signature_at: new Date(NOW - 60 * 60 * 1000).toISOString() });
  assert.equal(gmailSignatureDue(box(), NOW), true, "never read");
  assert.equal(gmailSignatureDue(fresh, NOW), false, "read an hour ago");
  assert.equal(gmailSignatureDue({ ...fresh, gmail_signature_at: "2026-10-26T17:00:00Z" }, NOW), true, "a day on");
  assert.equal(gmailSignatureDue(box({ provider: "microsoft" }), NOW), false, "Gmail's alone");
  assert.equal(gmailSignatureDue(box({ state: "reconnect" }), NOW), false, "signed out: not read");

  const row = box();
  const v = vault({ [row.id]: liveCredentials("ya29.sam") });
  const tables = { mailbox_connections: [row] };
  const db = fakeDb(tables, {}, v.rpcs);
  const net = providers(() => ({ json: { signature: `${GMAIL}<script>x()</script>` } }));
  try {
    const kept = await keepGmailSignature(db, row, "ya29.sam", logger({ tenant_id: T }), NOW);
    assert.equal(kept.gmail_signature, GMAIL, "kept, cleaned");
    assert.equal(kept.gmail_signature_at, new Date(NOW).toISOString());
  } finally {
    net.restore();
  }
  const refused = providers(() => ({ status: 403, json: { error: { status: "PERMISSION_DENIED" } } }));
  try {
    const kept = await keepGmailSignature(
      db,
      tables.mailbox_connections[0],
      "ya29.sam",
      logger({ tenant_id: T }),
      NOW + 1,
    );
    assert.equal(kept.gmail_signature, GMAIL, "what was read before stands");
    assert.equal(kept.gmail_signature_at, new Date(NOW).toISOString(), "and so does when");
  } finally {
    refused.restore();
  }
});

test("a signature laid out in a table, or in spans set as blocks, reads line by line (0077: they ran together)", () => {
  // A signature generator's table: one line a row, and the logo's cell beside the words.
  const rows =
    '<table><tbody><tr><td><img src="https://example.com/logo.png"></td><td><table><tr><td>Sam Reyes</td></tr>' +
    '<tr><td>Founder, Harbor Moving Co</td></tr><tr><td><a href="https://example.com">example.com</a></td></tr>' +
    "</table></td></tr></tbody></table>";
  assert.equal(gmailSignatureWords(rows), "Sam Reyes\nFounder, Harbor Moving Co\nexample.com");
  // One cell of spans, each set as a block: what Gmail draws as four lines.
  const spans =
    '<table><tr><td><span style="display:block;font-weight:bold">Sam Reyes</span>' +
    '<span style="display: block">Founder, Harbor Moving Co</span>' +
    '<span style="display:block"><a href="https://example.com">example.com</a>&nbsp; | &nbsp;sam@example.com</span>' +
    '<span style="DISPLAY:BLOCK">410 Baylor St, Austin, TX</span></td></tr></table>';
  assert.equal(
    gmailSignatureWords(spans),
    // The &nbsp; around the bar stay what they are: the email is plain text, and they hold its spacing.
    "Sam Reyes\nFounder, Harbor Moving Co\nexample.com  |  sam@example.com\n410 Baylor St, Austin, TX",
  );
  // Words set inline stay on their line.
  assert.equal(gmailSignatureWords("<div>Sam <b>Reyes</b>, <i>Founder</i></div>"), "Sam Reyes, Founder");
});
