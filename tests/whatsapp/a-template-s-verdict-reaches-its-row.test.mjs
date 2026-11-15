/**
 * A template's verdict reaches its row before the bell says it (the wiring's second audit, R11 S11-6). Meta's notice that a
 * template was approved or rejected is written on the row the sync keeps, by name and language, and the bell tells it.
 * A notice that found no row was a status kept nowhere: the bell said "Template approved" over a Library still saying
 * pending, and the campaign on it stayed blocked until someone pressed Sync. Now the write counts its rows, looks once more
 * after a moment (Meta can decide before the request that made the template has written its row), and where none is on
 * file still, syncs the workspace's templates from Meta before the notice is told.
 *
 * Run over a database in memory, Meta's notice as its webhook carries it, and the clock by hand for the moment's wait.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappOffersOpen } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { describeWabaChange, handleWabaChange } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const WABA = "207650000000977";
const channel = {
  id: "ch-1",
  tenant_id: T,
  kind: "whatsapp",
  external_id: "106540000000971",
  waba_id: WABA,
  status: "active",
  number_e164: "+13055550971",
  config: {},
  created_at: "2026-09-01T09:00:00.000Z",
};
const template = (over = {}) => ({
  id: "tpl-1",
  tenant_id: T,
  channel: "whatsapp",
  name: "winback_offer",
  language: "en_US",
  meta_status: "pending",
  rejected_reason: null,
  source: "chanlytics",
  created_at: "2026-10-14T09:00:00.000Z",
  updated_at: "2026-10-14T09:00:00.000Z",
  ...over,
});
/** Meta's notice that a template was decided, with its reason ("NONE" where it gave none). */
const verdict = (event, reason = "NONE", name = "winback_offer") => ({
  field: "message_template_status_update",
  value: { event, message_template_name: name, message_template_language: "en_US", reason },
});
const updatesOf = (db) => db.seen.filter((q) => q.table === "templates" && q.op === "update");
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

test("a verdict on a template on file is written on its row at once, and the bell is told", async () => {
  const tables = { tenant_channels: [{ ...channel }], templates: [template()], events: [] };
  const db = fakeDb(tables);
  assert.equal(await handleWabaChange(db, WABA, verdict("REJECTED", "INVALID_FORMAT"), async () => null), "alerted");
  assert.equal(tables.templates[0].meta_status, "rejected", "the Library says what the bell says");
  assert.equal(tables.templates[0].rejected_reason, "INVALID_FORMAT", "and why Meta refused it");
  assert.equal(updatesOf(db).length, 1, "one write: the row was there");
  // Approved again: the status is Meta's newest, and a reason of "NONE" is no reason kept.
  assert.equal(await handleWabaChange(db, WABA, verdict("APPROVED"), async () => null), "alerted");
  assert.deepEqual([tables.templates[0].meta_status, tables.templates[0].rejected_reason], ["approved", null]);
  // A quality flag is no verdict: the template stays approved on its row, in one write fewer, and nobody is told.
  const before = updatesOf(db).length;
  assert.equal(await handleWabaChange(db, WABA, verdict("FLAGGED"), async () => null), "kept");
  assert.deepEqual([tables.templates[0].meta_status, updatesOf(db).length], ["approved", before]);
});

test("a verdict that finds no row looks again after a moment, then syncs the workspace's templates from Meta before the bell is told, and never invents a row", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tables = { tenant_channels: [{ ...channel }], templates: [], events: [] };
    const db = fakeDb(tables);
    let settled = false;
    const told = handleWabaChange(db, WABA, verdict("REJECTED"), async () => null).then((r) => {
      settled = true;
      return r;
    });
    await flush();
    assert.equal(updatesOf(db).length, 1, "the first write found no row");
    assert.equal(settled, false, "and nothing is told before the row is looked for again");
    t.mock.timers.tick(2_000);
    assert.equal(await told, "alerted", "the verdict is told all the same");
    assert.equal(updatesOf(db).length, 2, "looked for once more after the moment");
    assert.equal(
      tables.templates.length,
      0,
      "no row invented: the sync is Meta's to fill, and with no token here it fills none",
    );
  } finally {
    t.mock.timers.reset();
  }
});

/* ------------------------------------- one verdict, told once (15 Nov 2026) ------------------------------------- */

/**
 * WhatsApp's notice that it files a message as another kind (Meta, template_category_update: the kind before and the
 * kind now). On 14 Nov 2026 a ready-made follow-up filed as a notice was filed as an offer eight minutes after it was
 * written, while WhatsApp was still checking it: the owner got a "Needs you" mail with nothing to do, and a day later a
 * second mail that it "can be sent now", which for an offer on a US number it could not.
 */
const refiled = (to, from = "UTILITY") => ({
  field: "template_category_update",
  value: {
    message_template_name: "winback_offer",
    message_template_language: "en_US",
    previous_category: from,
    new_category: to,
  },
});
/** WhatsApp's approval as its webhook carries it: the kind it approved the message as, and anything else it said. */
const approvedAs = (category, number, over = {}) =>
  describeWabaChange(
    {
      field: "message_template_status_update",
      value: {
        event: "APPROVED",
        reason: "NONE",
        message_template_name: "winback_offer",
        message_template_language: "en_US",
        message_template_category: category,
        ...over,
      },
    },
    number,
  );
const US_NUMBER = "+13055550971";
const UK_NUMBER = "+442079460958";

test("a message WhatsApp files as an offer while it is still checking it takes the kind on its row, and nobody is told before its verdict", async () => {
  const tables = { tenant_channels: [{ ...channel }], templates: [template({ category: "utility" })], events: [] };
  const db = fakeDb(tables);
  assert.equal(
    await handleWabaChange(db, WABA, refiled("MARKETING"), async () => null),
    "kept",
    "REGRESSION (14 Nov 2026): a Needs you mail about a message WhatsApp had not decided yet",
  );
  assert.equal(tables.templates[0].category, "marketing", "the Library says the kind at once");
  // A message with no row yet is one still on its way in: its verdict says the kind, and nobody is told before it.
  const none = { tenant_channels: [{ ...channel }], templates: [], events: [] };
  assert.equal(await handleWabaChange(fakeDb(none), WABA, refiled("MARKETING"), async () => null), "kept");
});

test("a message already approved that WhatsApp now files as an offer is told once; filed back as a notice, nobody is told", async () => {
  const tables = {
    tenant_channels: [{ ...channel }],
    templates: [template({ meta_status: "approved", category: "utility" })],
    events: [],
  };
  const db = fakeDb(tables);
  assert.equal(await handleWabaChange(db, WABA, refiled("MARKETING"), async () => null), "alerted");
  assert.equal(tables.templates[0].category, "marketing");
  assert.equal(await handleWabaChange(db, WABA, refiled("UTILITY", "MARKETING"), async () => null), "kept");
  assert.equal(tables.templates[0].category, "utility", "the row follows WhatsApp's word either way");
  // What it is told as: news about that message, in the owner's words, with where an offer can go from this number.
  const news = (number) => describeWabaChange(refiled("MARKETING"), number);
  assert.deepEqual(news(UK_NUMBER), {
    kind: "template_ready",
    route: "campaigns/messages/winback_offer",
    about: { type: "template", id: "winback_offer:en_US" },
    subject: "WhatsApp now treats “Win-back (earlier)” as an offer",
    body: "From now on it goes to people who said yes to offers.",
    alert: true,
  });
  assert.equal(news(US_NUMBER).body, whatsappOffersOpen(US_NUMBER).why, "a US number's offers, as every page says it");
  assert.equal(describeWabaChange(refiled("UTILITY", "MARKETING"), US_NUMBER), null, "not worth a word");
});

test("the verdict says once what WhatsApp approved the message as, and where an offer can go from this number", () => {
  assert.deepEqual(approvedAs("UTILITY", US_NUMBER), {
    kind: "template_ready",
    route: "campaigns/messages/winback_offer",
    about: { type: "template", id: "winback_offer:en_US" },
    subject: "WhatsApp approved “Win-back (earlier)”",
    body: "“Win-back (earlier)” is ready to send.",
    alert: true,
  });
  const offer = approvedAs("MARKETING", UK_NUMBER);
  const offerUs = approvedAs("MARKETING", US_NUMBER);
  // An offer says its kind in the title, so the mail's subject and the bell's line say who it reaches before it is opened.
  assert.deepEqual(offer, {
    kind: "template_ready",
    route: "campaigns/messages/winback_offer",
    about: { type: "template", id: "winback_offer:en_US" },
    subject: "WhatsApp approved “Win-back (earlier)” as an offer",
    body: "It goes to people who said yes to offers.",
    alert: true,
  });
  assert.equal(offerUs.subject, offer.subject);
  assert.equal(
    offerUs.body,
    whatsappOffersOpen(US_NUMBER).why,
    "REGRESSION (15 Nov 2026): an offer on a US number was told it “can be sent now”",
  );
  // An approval that says no kind (an older notice) is told as ready, as it was.
  assert.equal(approvedAs(undefined, US_NUMBER).body, "“Win-back (earlier)” is ready to send.");
  for (const told of [
    approvedAs("UTILITY", US_NUMBER),
    offer,
    offerUs,
    describeWabaChange(refiled("MARKETING"), US_NUMBER),
  ])
    assert.ok(
      !/24-hour|window|template|\bMeta\b|marketing|utility|category/i.test(`${told.subject} ${told.body}`),
      `a provider's word reached the owner: ${told.subject} ${told.body}`,
    );
});

test("a hold that ends is kept as “sending again” and tells nobody: the row can be sent, and the hold was said to end by itself", async () => {
  const unpaused = approvedAs("MARKETING", US_NUMBER, {
    other_info: { title: "UNPAUSE", description: "Your WhatsApp message template has been unpaused." },
  });
  assert.deepEqual(unpaused, {
    kind: "template_ready",
    route: "campaigns/messages/winback_offer",
    about: { type: "template", id: "winback_offer:en_US" },
    subject: "WhatsApp is sending “Win-back (earlier)” again",
    body: "“Win-back (earlier)” can be sent again. What was waiting on it goes out by itself.",
    alert: false,
  });
  // A message WhatsApp turned back on (Meta: REINSTATED, "no longer flagged or disabled") is the same news.
  const tables = {
    tenant_channels: [{ ...channel }],
    templates: [template({ meta_status: "paused" })],
    events: [],
  };
  const db = fakeDb(tables);
  assert.equal(await handleWabaChange(db, WABA, verdict("REINSTATED"), async () => null), "kept");
  assert.equal(
    tables.templates[0].meta_status,
    "approved",
    "REGRESSION: a message turned back on stayed held on its row",
  );
  assert.equal(describeWabaChange(verdict("REINSTATED"), US_NUMBER).subject, unpaused.subject);
});
