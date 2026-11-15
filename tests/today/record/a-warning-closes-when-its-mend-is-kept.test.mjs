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
  TEMPLATE_NOTICE_TITLES,
  kindsEndedBy,
  warningsMendedBy,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { recordNotification, mendWarnings } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/shared/alerts/notify.ts")).href
);
const { describeWabaChange } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/waba-events.ts")).href
);

const TENANT = "11111111-0000-4000-8000-000000000001";
const OTHER = "11111111-0000-4000-8000-000000000002";
const MAILBOX = "22222222-0000-4000-8000-000000000001";
const MAILBOX2 = "22222222-0000-4000-8000-000000000002";
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
  // A version approved mends that version's refusal, hold or turn-off (the same subject: its name and language), under
  // the titles the edge keeps them by (TEMPLATE_NOTICE_TITLES, which waba-events.ts reads) and under those of before
  // 13 Nov 2026, which a warning kept then still carries.
  const [version, ...others] = warningsMendedBy({
    kind: "template_ready",
    title: TEMPLATE_NOTICE_TITLES.approved("Spring offer"),
  });
  assert.equal(others.length, 0);
  assert.deepEqual([version.kind, version.sameSubject], ["template_blocked", true]);
  // An approval as an offer, and a message WhatsApp sends again, mend the same warnings; one filed as an offer mends none.
  for (const by of ["approvedOffer", "resumed"])
    assert.deepEqual(
      titles({ kind: "template_ready", title: TEMPLATE_NOTICE_TITLES[by]("Spring offer") }),
      [["template_blocked", version.title.source, true]],
      by,
    );
  assert.deepEqual(titles({ kind: "template_ready", title: TEMPLATE_NOTICE_TITLES.offer("Spring offer") }), []);
  for (const title of [
    TEMPLATE_NOTICE_TITLES.rejected("Spring offer"),
    TEMPLATE_NOTICE_TITLES.paused("Spring offer"),
    TEMPLATE_NOTICE_TITLES.disabled("Spring offer"),
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

// WhatsApp's news of a message, in the edge's own words (waba-events.ts describeWabaChange), never written again here: on
// 13 Nov 2026 the edge said its titles in plainer words, the pair went on looking for the old ones, and an approval
// closed nothing.
const told = (field, value) =>
  describeWabaChange(
    { field, value: { message_template_name: "spring_offer", message_template_language: "en_US", ...value } },
    null,
  );
const status = (event, over = {}) => told("message_template_status_update", { event, ...over });
/** That news as the bell kept it an hour ago: a warning about its message, open. */
const keptAs = (words) =>
  warning(words.kind, words.subject, { subject_type: words.about.type, subject_id: words.about.id });

test("WhatsApp's approval of a message closes that message's refusal, hold and turn-off, each under the title the edge keeps it by", async () => {
  const refused = keptAs(status("REJECTED"));
  const held = keptAs(status("PAUSED"));
  const off = keptAs(status("DISABLED"));
  const spanish = keptAs(status("REJECTED", { message_template_language: "es" }));
  const another = keptAs(status("REJECTED", { message_template_name: "winback_offer" }));
  const moved = keptAs(told("template_category_update", { new_category: "MARKETING" }));
  // A refusal kept before 13 Nov 2026 is on the bell for its thirty days, under that day's title.
  const before = warning("template_blocked", "Template “spring_offer” refused", {
    subject_type: "template",
    subject_id: "spring_offer:en_US",
  });
  const rows = [refused, held, off, spanish, another, moved, before];
  const db = fakeDb({ notifications: rows });
  const approved = status("APPROVED");
  const kept = await recordNotification(
    TENANT,
    { kind: approved.kind, title: approved.subject, body: approved.body, route: approved.route, about: approved.about },
    db,
  );
  assert.ok(kept, "the approval is kept");
  assert.equal(
    isClosed(rows, refused),
    true,
    `REGRESSION (13 Nov 2026): “${refused.title}” stayed open beside “${approved.subject}”`,
  );
  assert.equal(isClosed(rows, held), true, `“${held.title}” stayed open beside the approval`);
  assert.equal(isClosed(rows, off), true, `“${off.title}” stayed open beside the approval`);
  assert.equal(isClosed(rows, before), true, "a refusal kept under the title of before is that message's too");
  assert.equal(isClosed(rows, spanish), false, "another language's refusal still stands");
  assert.equal(isClosed(rows, another), false, "another message's refusal is its own");
  assert.equal(isClosed(rows, moved), false, "an approval does not lift a move to offers");
});

test("a hold that ends closes that message's hold without a word: no other message's, and no refusal's words are sent back by it", async () => {
  const held = keptAs(status("PAUSED"));
  const off = keptAs(status("DISABLED"));
  const another = keptAs(status("PAUSED", { message_template_name: "winback_offer" }));
  const rows = [held, off, another];
  const db = fakeDb({ notifications: rows });
  // WhatsApp's unpause (Meta: other_info.title UNPAUSE) is news told to nobody (alert false): it mends, as "back to normal" does.
  const again = status("APPROVED", { other_info: { title: "UNPAUSE" } });
  assert.equal(again.alert, false);
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { kind: again.kind, title: again.subject },
    subject: again.about,
    keptId: null,
  });
  assert.equal(isClosed(rows, held), true, `“${held.title}” stayed open after “${again.subject}”`);
  assert.equal(isClosed(rows, off), true, "a message turned back on is no longer off");
  assert.equal(isClosed(rows, another), false, "another message's hold is its own");
});

test("a mailbox's hold is mended by its own resume, its sign-out by connecting it again, and either by its removal", async () => {
  const held = warning("sweep", "sam@example.com is held: it bounced", {
    subject_type: "mailbox_connection",
    subject_id: MAILBOX,
  });
  const heldToo = warning("sweep", "jo@example.com is held: it bounced", {
    subject_type: "mailbox_connection",
    subject_id: MAILBOX2,
  });
  const signedOut = warning("sweep", "sam@example.com needs reconnecting", {
    subject_type: "mailbox_connection",
    subject_id: MAILBOX,
  });
  const rows = [held, heldToo, signedOut];
  const db = fakeDb({ notifications: rows });
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "mailbox_connection.resumed" },
    subject: null,
    keptId: null,
  });
  assert.deepEqual([isClosed(rows, held), isClosed(rows, heldToo)], [false, false], "a hold is about one mailbox");
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "mailbox_connection.resumed" },
    subject: { type: "mailbox_connection", id: MAILBOX },
    keptId: null,
  });
  assert.deepEqual(
    [isClosed(rows, held), isClosed(rows, heldToo), isClosed(rows, signedOut)],
    [true, false, false],
    "the resumed mailbox's hold, alone: a resume mends no sign-out",
  );
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "mailbox_connection.connected" },
    subject: { type: "mailbox_connection", id: MAILBOX },
    keptId: null,
  });
  assert.equal(isClosed(rows, signedOut), true, "connected again, its sign-out is mended");
  await mendWarnings(db, {
    tenantId: TENANT,
    by: { change: "mailbox_connection.removed" },
    subject: { type: "mailbox_connection", id: MAILBOX2 },
    keptId: null,
  });
  assert.equal(isClosed(rows, heldToo), true, "a mailbox removed leaves no warning about it");
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
