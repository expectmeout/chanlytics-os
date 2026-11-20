/**
 * An ad that can't run is mailed once (decision 0050, call 15; Ruben, 20 November 2026): the edge's lib/ads/mail.ts,
 * run over a database in memory with the mail handed to a transport of the test's own.
 *
 * The database rings `ad_refused` and `ad_unpaid` owing their mail (00662, held by
 * the-bell-rings-for-an-owner-s-ads.db.test.mjs); after each good read the account's job sends what is owed. What must
 * hold: one mail a cause, whatever number of owners hears it; never twice; one mail a read, naming each cause where
 * there are several; nothing for a cause that cleared first, for a business that turned the mail off, or with no
 * address of its own; and a mail that failed, or a read with no time left for one, leaves it owed for the next read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { mailAdNotices } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ads/mail.ts")).href);

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SECOND_OWNER = "33333333-3333-4333-8333-333333333333";
const AD = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const OTHER_AD = "4f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const MAILBOX = { escalation_emails: ["owner@salon.example"], from: "Salon <hi@salon.example>" };

let seq = 0;
/** A bell row as 00662's ring writes it: owing its mail from the moment it rings. */
const rung = (kind, over = {}) => {
  seq += 1;
  return {
    id: `0000000${seq}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.slice(-36),
    tenant_id: TENANT,
    kind,
    title: kind === "ad_refused" ? "“Spring offer” not approved by Meta" : "“Spring offer” can't run",
    body:
      kind === "ad_refused"
        ? "Meta said: “Your ad names a medical condition.” Fix it in Meta, and Meta checks it again."
        : "Meta couldn't charge your card. Fix the payment method in Meta.",
    route: `campaigns/ads:ad:${AD}`,
    subject_type: "ad",
    subject_id: AD,
    recipient_user_id: OWNER,
    closed_at: null,
    mail_due_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 60_000).toISOString(),
    ...over,
  };
};

/** A workspace with its bell rows and its notification settings, and the mail it sends. */
function world(rows, { notifications = MAILBOX, sent = true } = {}) {
  const mails = [];
  const db = fakeDb({
    notifications: rows,
    tenant_config: [{ tenant_id: TENANT, version: 1, config: { notifications } }],
    tenants: [{ id: TENANT, slug: "harbor-salon", name: "Harbor Salon" }],
  });
  const ports = {
    send: async (from, to, subject, text) => {
      mails.push({ from, to, subject, text });
      return sent;
    },
  };
  const mail = (deadline = Date.now() + 60_000) => mailAdNotices(db, TENANT, { deadline, ports });
  const owed = () => rows.filter((row) => row.mail_due_at !== null).map((row) => row.kind);
  return { db, mails, mail, owed };
}

test("a refusal is mailed once, in the bell's own words, and is owed nothing after", async () => {
  const w = world([rung("ad_refused")]);
  assert.equal(await w.mail(), 1);
  assert.equal(w.mails.length, 1);
  assert.deepEqual(w.mails[0].to, ["owner@salon.example"]);
  assert.equal(w.mails[0].subject, "“Spring offer” not approved by Meta");
  assert.match(w.mails[0].text, /^Meta said: “Your ad names a medical condition\.” Fix it in Meta/);
  assert.deepEqual(w.owed(), []);
  // The next read finds nothing owed: never a second mail while the row is open.
  assert.equal(await w.mail(), 0);
  assert.equal(w.mails.length, 1);
});

test("one cause heard by two owners is one mail, and both rows are owed nothing", async () => {
  const w = world([rung("ad_unpaid"), rung("ad_unpaid", { recipient_user_id: SECOND_OWNER })]);
  assert.equal(await w.mail(), 1);
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].subject, "“Spring offer” can't run");
  assert.deepEqual(w.owed(), []);
});

test("several causes rung by one read go in one mail that names each", async () => {
  const w = world([
    rung("ad_refused"),
    rung("ad_refused", { subject_id: OTHER_AD, title: "“Autumn offer” not approved by Meta" }),
    rung("ad_unpaid"),
  ]);
  assert.equal(await w.mail(), 3);
  assert.equal(w.mails.length, 1, "one mail a read, however many ads Meta turned down");
  assert.equal(w.mails[0].subject, "Your ads need you in Meta");
  for (const title of [
    "“Spring offer” not approved by Meta",
    "“Autumn offer” not approved by Meta",
    "“Spring offer” can't run",
  ])
    assert.ok(w.mails[0].text.includes(title), title);
  assert.deepEqual(w.owed(), []);
});

test("a cause that cleared before its mail went is owed nothing, and not mailed", async () => {
  const w = world([rung("ad_refused", { closed_at: new Date().toISOString() })]);
  assert.equal(await w.mail(), 0);
  assert.equal(w.mails.length, 0);
  assert.deepEqual(w.owed(), []);
});

test("a business that turned the mail off, or has no address of its own, is told by the bell alone", async () => {
  const off = world([rung("ad_refused")], { notifications: { ...MAILBOX, email_off: ["ad_refused", "ad_unpaid"] } });
  assert.equal(await off.mail(), 0);
  assert.equal(off.mails.length, 0);
  assert.deepEqual(off.owed(), [], "the choice stands: nothing is kept for later");
  const nobody = world([rung("ad_unpaid")], { notifications: {} });
  assert.equal(await nobody.mail(), 0);
  assert.equal(nobody.mails.length, 0);
  assert.deepEqual(nobody.owed(), []);
});

test("a mail that failed stays owed and goes with the next read; a read with no time left sends nothing", async () => {
  const rows = [rung("ad_refused")];
  const failing = world(rows, { sent: false });
  assert.equal(await failing.mail(), null);
  assert.deepEqual(failing.owed(), ["ad_refused"], "still owed");
  const late = world(rows);
  assert.equal(await late.mail(Date.now() + 1_000), null, "too little of the read's time left for one mail");
  assert.equal(late.mails.length, 0);
  assert.deepEqual(late.owed(), ["ad_refused"]);
  assert.equal(await late.mail(), 1, "the next read sends it");
  assert.deepEqual(late.owed(), []);
});

test("the three that are news are never mailed, owed or not", async () => {
  const w = world([rung("ad_ended", { title: "“Spring offer” ended", body: "It ran until Tue 10 Nov." })]);
  assert.equal(await w.mail(), 0);
  assert.equal(w.mails.length, 0);
  assert.deepEqual(w.owed(), ["ad_ended"], "not this sender's row");
});
