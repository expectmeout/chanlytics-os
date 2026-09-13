/**
 * The deadman sweep, run: POST /api/cron/deadman over a database in memory
 * and a captured wire to the mailer. Until 13 Sep 2026 its text was pinned
 * and its POST had never been called.
 *
 * An escalation nobody picked up in two hours is a candidate. A workspace
 * with somebody on file is told -- a row on its bell of kind `deadman`, and a
 * mail carrying the customer to the workspace's OWN mailbox -- and the
 * escalation is stamped, so it is raised at most once however long it stays
 * open. A workspace with nobody on file is not warned from here at all and
 * its escalation is left unstamped; the platform is told through the pager
 * that remembers, one page per workspace per six hours, carrying the
 * workspace and never the customer. Only a delivered warning earns the stamp.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, wire, refusedAtTheDoor, vault } from "./_cron-doors-world.mjs";

// Each test file is its own process, so this is the whole environment. The
// mailer and the platform mailbox are configured; no workspace is the
// environment's own, so the env pair is nobody's mailbox but the platform's.
process.env.BLOB_SHADOW = "off";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/deadman.ts"));
after(() => setPg(null));

const H = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** Harbor Moving: its owner is on file. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A self-serve workspace in its default state: nobody on file. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "owner@harbor.test";
const CUSTOMER = "+16465550123";
const DETAIL = "asked for a quote on moving a piano";

/** One row of deadman_candidates(): an open escalation, three hours old, nobody stamped it. */
const waiting = (id, tenant, over = {}) => ({
  escalation_id: id,
  tenant_id: tenant,
  conversation_id: `cv-${id}`,
  reason: "customer_asked_for_human",
  details: DETAIL,
  opened_at: ago(3 * H),
  phone_e164: CUSTOMER,
  ...over,
});

/* -------------------------------------------------------------- the world */

function world(candidates, { deadman_candidates = () => candidates } = {}) {
  const tables = {
    tenant_config: [
      { tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } },
      { tenant_id: B, config: {} },
    ],
    tenant_channels: [
      { tenant_id: A, kind: "whatsapp", status: "active", external_id: "wa-harbor" },
      { tenant_id: B, kind: "whatsapp", status: "active", external_id: "wa-probe" },
    ],
    notifications: [],
    operator_pages: [],
  };
  const marks = [];
  const db = fakeDb(tables, {}, {
    ...vault,
    deadman_candidates,
    deadman_mark_alerted: (a) => { marks.push(a.p_ids); return a.p_ids.length; },
  });
  setPg(db);
  return { db, tables, marks, tick: () => knock(POST, "deadman") };
}
const bell = (w, tenant) => w.tables.notifications.filter((n) => n.tenant_id === tenant);

/* -------------------------------------------------------------- the door */

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "deadman", setPg);
});

/* --------------------------------------------------------------- nobody */

test("nobody has waited two hours: the sweep asks for exactly that and does nothing else", async () => {
  const w = world([]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0 }]);
    assert.deepEqual(w.db.seen.filter((s) => s.rpc === "deadman_candidates").map((s) => s.args), [{ p_older_than: "2 hours" }], "how long a customer may wait on a human before this is a problem");
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.marks, []);
  } finally { line.restore(); }
});

/* -------------------------------------------------------- somebody on file */

test("a workspace with its owner on file: a row of kind deadman on its bell, a mail carrying the customer to ITS mailbox, the escalation stamped once", async () => {
  const w = world([waiting("e-a1", A)]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 1 }]);

    const rows = bell(w, A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "deadman");
    assert.equal(rows[0].route, "inbox", "the bell sends the reader to the Inbox");
    assert.equal(rows[0].title, "Still waiting: a customer has had no answer for 3 hours");
    assert.match(rows[0].body, new RegExp(`Customer: \\${CUSTOMER}`));
    assert.match(rows[0].body, /Flagged because: customer_asked_for_human/);
    assert.match(rows[0].body, new RegExp(`Detail: ${DETAIL}`));

    const mail = line.mail();
    assert.equal(mail.length, 1, "the owner's mail, and no platform note: the workspace could be reached");
    assert.deepEqual(mail[0].to, [OWNER], "the workspace's own mailbox, never the platform's");
    assert.equal(mail[0].from, "Pager <pager@platform.test>", "sent from the platform's verified sender, since the workspace set none");
    assert.equal(mail[0].subject, rows[0].title);
    assert.ok(mail[0].text.includes(CUSTOMER) && mail[0].text.includes(DETAIL), "full detail: this mailbox belongs to the business whose customer it is");

    assert.deepEqual(w.marks, [["e-a1"]], "stamped: raised once however long it stays open");
    assert.deepEqual(w.tables.operator_pages, [], "nothing for the pager");
  } finally { line.restore(); }
});

test("a mail the mailer refuses earns no stamp: the bell row stays (it is the workspace's own record) and the next tick will try again", async () => {
  const w = world([waiting("e-a2", A)]);
  const refused = wire(() => new Response("invalid api key", { status: 401 }));
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 0 }]);
    assert.equal(bell(w, A).length, 1, "the row first, addressed or not");
    assert.equal(refused.mail().length, 1, "it tried");
    assert.deepEqual(w.marks, [], "undelivered: not stamped, so the customer is not marked as handled");
  } finally { refused.restore(); }
});

/* ---------------------------------------------------------- nobody on file */

test("a workspace with nobody on file: skipped -- no bell, no mail, never stamped -- and the platform paged once per workspace, by a row that remembers across ticks; the page names the workspace and never the customer", async () => {
  // Two open escalations in the same workspace, and the rows come back next
  // tick because nothing was stamped: the flood this pager exists to prevent.
  const w = world([waiting("e-b1", B), waiting("e-b2", B, { conversation_id: "cv-other", phone_e164: "+19175550199" })]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 0 }]);
    assert.deepEqual(bell(w, B), [], "not warned from here at all: nobody would see it");
    assert.deepEqual(w.marks, [], "left unstamped, so it is raised the moment somebody is on file");

    const mail = line.mail();
    assert.equal(mail.length, 1, "one page for the workspace, not one per escalation");
    assert.deepEqual(mail[0].to, ["ops@platform.test"]);
    assert.equal(mail[0].subject, "[Chanlytics] A workspace has a customer waiting and nobody to tell");
    assert.ok(mail[0].text.includes(`workspace ${B}`), "names the workspace");
    assert.match(mail[0].text, /Settings › Notifications/, "and what to do");
    for (const secret of [CUSTOMER, "+19175550199", DETAIL, "cv-"]) assert.ok(!mail[0].text.includes(secret), `never the customer: ${secret}`);

    assert.equal(w.tables.operator_pages.length, 1);
    const page = w.tables.operator_pages[0];
    assert.equal(page.key, `deadman_unaddressable:${B}`);
    assert.equal(page.count, 1);
    assert.ok(page.alerted_at, "stamped as told, because it was");

    // Ten minutes later the same rows come back. Counted; not re-paged.
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 0 }]);
    assert.equal(line.mail().length, 1, "one page per workspace per six hours");
    assert.equal(w.tables.operator_pages[0].count, 2);
    assert.deepEqual(bell(w, B), []);
    assert.deepEqual(w.marks, []);
  } finally { line.restore(); }
});

test("both in one tick: the reachable workspace is warned and stamped, the unreachable one is paged, and neither hears about the other", async () => {
  const w = world([waiting("e-b3", B), waiting("e-a3", A), waiting("e-b4", B)]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 3, flagged: 1 }]);
    assert.deepEqual(w.marks, [["e-a3"]]);
    assert.deepEqual(bell(w, A).map((r) => r.kind), ["deadman"]);
    assert.deepEqual(bell(w, B), []);
    const mail = line.mail();
    assert.deepEqual(mail.map((m) => m.to), [[OWNER], ["ops@platform.test"]], "the owner's warning, then the platform's page");
    assert.ok(!mail[1].text.includes(A) && !mail[0].text.includes(B), "one business is never described in another's mail");
    assert.deepEqual(w.tables.operator_pages.map((p) => p.key), [`deadman_unaddressable:${B}`]);
  } finally { line.restore(); }
});

/* ------------------------------------------------------- cannot be read */

test("candidates that cannot be read are a 500, and nothing is told", async () => {
  const w = world(null, { deadman_candidates: () => { throw new Error("permission denied for function deadman_candidates"); } });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [500, { ok: false }]);
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally { line.restore(); }
});
