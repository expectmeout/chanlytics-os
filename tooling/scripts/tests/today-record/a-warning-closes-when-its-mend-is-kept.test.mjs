/**
 * A warning closes when the news that mends it is kept (the wiring's second audit, W-channel-team-plus-4; 00421).
 *
 * The bell kept "WhatsApp quality rating flagged" unread and amber after "…back to normal" arrived, a sending domain's hold
 * after the domain sent again, and "A payment did not go through" after the invoice was paid: the good news was kept beside
 * the warning, and the warning asked on, for every member, until each read it. Run on contracts' pairs (NOTICE_MENDS,
 * warningsMendedBy) and how every kind ends (NOTICE_ENDS), and on the edge's door (recordNotification, mendWarnings) over
 * the fake database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  NOTICE_ENDS,
  NOTICE_MENDS,
  OFFERS_NOTICE_WORDS,
  SERVER_NOTIFICATION_KINDS,
  kindsEndedBy,
  warningsMendedBy,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { recordNotification, mendWarnings } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href
);

const TENANT = "11111111-0000-4000-8000-000000000001";
const OTHER = "11111111-0000-4000-8000-000000000002";
const DOMAIN = "22222222-0000-4000-8000-000000000001";
const DOMAIN2 = "22222222-0000-4000-8000-000000000002";
const CHANNEL = "33333333-0000-4000-8000-000000000001";
const CHANNEL2 = "33333333-0000-4000-8000-000000000002";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let seq = 0;
/** A warning the bell kept an hour ago, open. */
const warning = (kind, title, over = {}) => ({
  id: `eeeeeeee-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  tenant_id: TENANT,
  kind,
  title,
  body: "x",
  route: null,
  subject_type: null,
  subject_id: null,
  created_at: new Date(Date.now() - HOUR).toISOString(),
  closed_at: null,
  ...over,
});
// A row the fake keeps carries only the keys it was sent: a missing closed_at is open, as Postgres answers null for it.
const isClosed = (rows, row) => rows.find((r) => r.id === row.id).closed_at != null;

/* ------------------------------------------------------ in contracts ------------------------------------------------------ */

test("every kind the edge keeps says how its row ends, and every warning a mend closes is of a kind said to be mended", () => {
  assert.deepEqual(Object.keys(NOTICE_ENDS).sort(), [...SERVER_NOTIFICATION_KINDS].sort());
  for (const m of NOTICE_MENDS)
    assert.equal(NOTICE_ENDS[m.warns.kind].ends, "mended", `${m.warns.kind}: ${m.warns.title.source}`);
  for (const [kind, end] of Object.entries(NOTICE_ENDS)) {
    if (end.ends === "mended")
      assert.ok(
        NOTICE_MENDS.some((m) => m.warns.kind === kind),
        `${kind} is said to be mended, and nothing mends it`,
      );
    if (end.ends === "news") assert.ok(end.why.trim().length > 0, `${kind} says why nothing closes it`);
  }
  assert.deepEqual(
    kindsEndedBy("hold"),
    ["handoff", "deadman", "call"],
    "the kinds a hold's resolve closes (00421 escalation_closes_its_notices names the same three)",
  );
});

test("a mend names its warning by title: 'back to normal' mends 'flagged' and nothing else, and a warning mends nothing", () => {
  const titles = (by) => warningsMendedBy(by).map((w) => [w.kind, w.title.source, w.sameSubject]);
  // A number's quality and limit are that number's: the pair must be about the same channel.
  assert.deepEqual(titles({ kind: "number", title: "WhatsApp quality rating back to normal" }), [
    ["number", "^WhatsApp quality rating flagged$", true],
  ]);
  assert.deepEqual(titles({ kind: "number", title: "WhatsApp messaging limit raised" }), [
    ["number", "^WhatsApp messaging limit lowered$", true],
  ]);
  // An account's review is the account's, not a number's.
  assert.deepEqual(titles({ kind: "number", title: "WhatsApp account review approved" }), [
    ["number", "^WhatsApp account review rejected$", false],
  ]);
  assert.deepEqual(titles({ kind: "number", title: "WhatsApp quality rating flagged" }), [], "a warning mends nothing");
  assert.deepEqual(
    titles({ kind: "sweep", title: "WhatsApp quality rating back to normal" }),
    [],
    "the kind must match",
  );
  assert.deepEqual(
    titles({ change: "billing.paid" }).map(([, source]) => source),
    ["^A payment did not go through$", "^Your trial ends in three days$"],
  );
  // A version approved mends that version's refusal, pause or disable (the same subject: its name and language), in the
  // edge's own words for them (waba-events.ts statusWord over TEMPLATE_STATUS_WORDS).
  const [version, ...others] = warningsMendedBy({ kind: "template_ready", title: "Template “spring_offer” approved" });
  assert.equal(others.length, 0);
  assert.deepEqual([version.kind, version.sameSubject], ["template_blocked", true]);
  for (const title of [
    "Template “spring_offer” refused",
    "Template “spring_offer” paused",
    "Template “spring_offer” disabled",
  ])
    assert.ok(version.title.test(title), title);
  assert.ok(
    !version.title.test("Template “spring_offer” is now marketing"),
    "REGRESSION: an approval closed a move to marketing, a restriction it does not lift",
  );
  assert.deepEqual(
    titles({ kind: "template_ready", title: "Template “spring_offer” is now utility" }),
    [],
    "REGRESSION: a category change closed a refusal that still stood",
  );
  // The pause notice is closed in SQL by resume_email_offers (00421), by this title: the words and the literal agree.
  const [offers, ...more] = warningsMendedBy({ change: "mailbox.offers_resumed" });
  assert.equal(more.length, 0);
  assert.ok(offers.title.test(OFFERS_NOTICE_WORDS.paused(null).title));
  assert.equal(OFFERS_NOTICE_WORDS.paused(null).title, "Offers and news by email are paused");
});

/* ------------------------------------------------------ on the edge ------------------------------------------------------ */

test("kept good news closes the warning it mends, for everyone: not another number's, another workspace's, one past the bell's window, or itself", async () => {
  const on = (id) => ({ subject_type: "channel", subject_id: id });
  const flagged = warning("number", "WhatsApp quality rating flagged", on(CHANNEL));
  const otherNumber = warning("number", "WhatsApp quality rating flagged", on(CHANNEL2));
  const lowered = warning("number", "WhatsApp messaging limit lowered", on(CHANNEL));
  const theirs = warning("number", "WhatsApp quality rating flagged", { tenant_id: OTHER, ...on(CHANNEL) });
  const old = warning("number", "WhatsApp quality rating flagged", {
    ...on(CHANNEL),
    created_at: new Date(Date.now() - 31 * DAY).toISOString(),
  });
  const rows = [flagged, otherNumber, lowered, theirs, old];
  const db = fakeDb({ notifications: rows });
  const back = {
    kind: "number",
    title: "WhatsApp quality rating back to normal",
    body: "Messages go out as usual.",
    about: { type: "channel", id: CHANNEL },
  };
  const kept = await recordNotification(TENANT, back, db);
  assert.ok(kept, "the good news is kept");
  assert.equal(isClosed(rows, flagged), true, "REGRESSION: 'flagged' stayed unread and amber beside 'back to normal'");
  assert.equal(isClosed(rows, otherNumber), false, "another number's rating is that number's");
  assert.equal(isClosed(rows, lowered), false, "a lowered limit is mended by its raise, not by the rating");
  assert.equal(isClosed(rows, theirs), false, "another workspace's warning is its own");
  assert.equal(isClosed(rows, old), false, "past the bell's window: no longer shown, left as it was");
  assert.equal(isClosed(rows, { id: kept.id }), false, "the good news is not closed by itself");
  // Kept again: nothing more to close, and nothing reopens.
  await recordNotification(TENANT, back, db);
  assert.equal(isClosed(rows, flagged), true);
});

test("a domain's hold is mended by its own domain's resume or release; one that names no domain mends none", async () => {
  const held = warning("sweep", "mail.example.com is held: it bounced", {
    subject_type: "sending_domain",
    subject_id: DOMAIN,
  });
  const heldToo = warning("sweep", "news.example.com is held: it bounced", {
    subject_type: "sending_domain",
    subject_id: DOMAIN2,
  });
  const rows = [held, heldToo];
  const db = fakeDb({ notifications: rows });
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "sending_domain.resumed" },
    subject: null,
    keptId: null,
  });
  assert.deepEqual([isClosed(rows, held), isClosed(rows, heldToo)], [false, false], "a hold is about one domain");
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "sending_domain.resumed" },
    subject: { type: "sending_domain", id: DOMAIN },
    keptId: null,
  });
  assert.deepEqual([isClosed(rows, held), isClosed(rows, heldToo)], [true, false], "the resumed domain's, alone");
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "sending_domain.released" },
    subject: { type: "sending_domain", id: DOMAIN2 },
    keptId: null,
  });
  assert.equal(isClosed(rows, heldToo), true, "a check that passes lifts the hold, and mends its warning too");
});

test("a paid invoice closes the payment that did not go through and the trial's warning; the receptionist's pause waits for 'is back'", async () => {
  const failed = warning("billing", "A payment did not go through");
  const trial = warning("billing", "Your trial ends in three days");
  const paused = warning("billing", "Your receptionist is paused");
  const rows = [failed, trial, paused];
  const db = fakeDb({ notifications: rows });
  await mendWarnings(db, { tenantId: TENANT, by: { change: "billing.paid" }, subject: null, keptId: null });
  assert.deepEqual(
    [failed, trial, paused].map((r) => isClosed(rows, r)),
    [true, true, false],
  );
  await recordNotification(TENANT, { kind: "billing", title: "Your receptionist is back", body: "…" }, db);
  assert.equal(isClosed(rows, paused), true);
});

test("a close that fails is logged and never fails what was kept: the warning stays until it is read", async () => {
  const paused = warning("billing", "Your receptionist is paused");
  const rows = [paused];
  const db = fakeDb({ notifications: rows }, { "notifications.select": { message: "statement timeout" } });
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  let kept;
  try {
    kept = await recordNotification(TENANT, { kind: "billing", title: "Your receptionist is back", body: "…" }, db);
  } finally {
    console.error = real;
  }
  assert.ok(kept, "the good news is kept all the same");
  assert.equal(isClosed(rows, paused), false);
  assert.ok(
    lines.some((l) => l.includes("notice_mend_failed")),
    "and the failure is said, by its event name",
  );
});
