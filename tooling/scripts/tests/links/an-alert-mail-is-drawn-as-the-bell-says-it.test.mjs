/**
 * An alert mail is drawn, beside its words (the emails-and-forms review, 28 Oct 2026). Every alert went out as plain
 * text: its facts as "Label: value" lines, a call's whole transcript pasted in, its one action a bare address at the
 * bottom. Now the same words go as text and as HTML (contracts noticeMailHtml): the facts a table, a summary set apart,
 * the transcript left to the page the mail links, and one button whose words are the bell's for the same row.
 *
 * Run: the layout on its own, then the real notify over a database in memory with a transport that keeps what it is
 * handed, the HTML its fifth argument.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appLink, noticeMailHtml, openItLine } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.example.test";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"]) delete process.env[k];

const { notify, mail } = await import(at("apps/edge/lib/ops/notify.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORIGIN = "https://app.example.test";
const PAGE = `${ORIGIN}/w/harbor/inbox/th-1`;

const drawn = (over = {}) =>
  noticeMailHtml({
    kind: "deadman",
    subject: "Still waiting: a customer has had no answer for 2 hours",
    body:
      "A conversation was handed to a human 2 hours ago and is still open.\n\n" +
      "Customer: ana@example.com\nFlagged because: Wrote by email\n\n" +
      "Open it in the Inbox to reply.",
    route: "inbox/th-1",
    href: PAGE,
    workspace: "Harbor Moving",
    settingsHref: `${ORIGIN}/w/harbor/settings/notifications`,
    ...over,
  });

test("the facts are a table, the rest paragraphs, and the one button opens the page the text links", () => {
  const html = drawn();
  assert.match(
    html,
    /<td[^>]*>Customer<\/td><td[^>]*>ana@example\.com<\/td>/u,
    "a fact is a row: its label, its value",
  );
  assert.match(html, /<td[^>]*>Flagged because<\/td>/u);
  assert.match(html, /<p[^>]*>A conversation was handed to a human 2 hours ago and is still open\.<\/p>/u);
  assert.equal(html.split(`href="${PAGE}"`).length, 2, "one link to the page: the button");
  assert.match(
    html,
    /<a href="https:\/\/app\.example\.test\/w\/harbor\/inbox\/th-1"[^>]*>Open the Inbox<\/a>/u,
    "the bell's words",
  );
  assert.match(html, /<h1[^>]*>Still waiting: a customer has had no answer for 2 hours<\/h1>/u);
  assert.match(html, />Needs you</u, "a warning's chip, as the bell draws the row in amber");
  assert.match(html, /Harbor Moving’s alert list/u, "the foot says why this address hears it");
  assert.match(html, /href="https:\/\/app\.example\.test\/w\/harbor\/settings\/notifications"/u, "and where to choose");
});

test("a call's summary is set apart, its transcript is left to its page, and nothing of it reaches the mail's HTML", () => {
  const html = drawn({
    kind: "call",
    subject: "Rosa phoned · 2 min",
    route: null,
    body:
      "They wanted: A balayage appointment.\r\nOutcome: Booked.\r\n\r\nFrom (212) 555-0142 · 2 min · Customer hung up\r\n\r\n" +
      "Summary:\r\nRosa asked for Saturday and booked 10 AM.\r\n\r\nTranscript:\r\nAgent: Hello!\r\nUser: My card number is 4111",
  });
  assert.match(html, /<p[^>]*>Summary<\/p><p class="quote[^>]*>Rosa asked for Saturday and booked 10 AM\.<\/p>/u);
  assert.doesNotMatch(html, /My card number/u, "the customer's own words stay on the call's page");
  assert.match(html, /The transcript is on its page: <a href="https:\/\/app\.example\.test\/w\/harbor\/inbox\/th-1"/u);
  assert.doesNotMatch(html, /\r/u, "line ends from a provider are read as lines");
  assert.doesNotMatch(html, />Needs you</u, "a call is news: no chip");
});

test("good news wears its own chip, and an alert with no page has no button", () => {
  const html = drawn({
    kind: "number",
    subject: "Your phone line is ready: (212) 555-0100",
    body: "Calls to it reach your receptionist.",
    href: null,
  });
  assert.match(html, />Good news</u);
  assert.doesNotMatch(html, /border-radius:10px;background:#c4452e/u, "no button where nothing opens");
});

test("words are escaped, and an address in them is a link", () => {
  const html = drawn({
    subject: "<b>Rosa</b> & co",
    body: "They wrote <script>alert(1)</script>: see https://example.com/a?b=1&c=2.",
  });
  assert.doesNotMatch(html, /<script>|<b>Rosa/u);
  assert.match(html, /&lt;b&gt;Rosa&lt;\/b&gt; &amp; co/u);
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2"[^>]*>https:\/\/example\.com\/a\?b=1&amp;c=2<\/a>\./u,
  );
});

test("the platform's own alert says so, and names no workspace", () => {
  const html = drawn({ kind: "alert", workspace: null, settingsHref: null, href: null });
  assert.match(html, /A Chanlytics platform alert\./u);
  assert.doesNotMatch(html, /alert list/u);
});

test("notify sends the drawn mail beside the text: the same link, the workspace read with it", async () => {
  const sent = [];
  const sendMail = async (m) => (sent.push(m), true);
  const db = fakeDb({
    notifications: [],
    jobs: [],
    tenants: [{ id: T, name: "Harbor Moving", slug: "harbor", timezone: "UTC", status: "active" }],
  });
  // A target whose loader read only the recipients: the workspace is read once, for the link and the name.
  const target = { tenantId: T, notifications: { escalation_emails: ["owner@harbor.test"] }, isEnvDefault: false };
  const ok = await notify(
    target,
    { kind: "handoff", subject: "A customer needs you", body: "Customer: ana@example.com", route: "inbox/th-1" },
    { db, sendMail },
  );
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  const link = `${ORIGIN}${appLink("harbor", "inbox/th-1")}`;
  assert.ok(sent[0].text.endsWith(openItLine(link)), "the text is as it was");
  assert.ok(sent[0].html.includes(`href="${link}"`), "the drawing opens the same page");
  assert.ok(sent[0].html.includes(">Harbor Moving<"), "and names the workspace at its top");
  assert.ok(!sent[0].html.includes("Open it:"), "the link is a button, not the text's line");
});

test("the copy the platform gets for a workspace nobody can be told in keeps the customer's words out of its drawing", async () => {
  const sent = [];
  const sendMail = async (m) => (sent.push(m), true);
  const target = { tenantId: T, notifications: null, isEnvDefault: false };
  await mail(
    target,
    { subject: "Rosa wrote", body: "Rosa: my address is 1 Main St", redactedBody: "A customer wrote to a workspace." },
    { sendMail },
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["ops@platform.test"]);
  assert.doesNotMatch(sent[0].html, /Main St|Rosa/u);
  assert.match(sent[0].html, /A customer wrote to a workspace\./u);
});
