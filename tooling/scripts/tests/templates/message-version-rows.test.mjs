/**
 * One read of a message's rows (packages/db repositories/templates.ts, messageVersionRowsOf): the workspace's template rows
 * that share a message's name and language, whatever their channel, named by any one version's id or by the name and
 * language. The real built function runs over a database in memory; contracts' campaignMessageOf picks the versions out
 * of what it answers, so these rows go to it as they are.
 *
 * Held here: the WhatsApp, email and text rows of a message come back whichever of them names it, and another language
 * of the same name, or another name, does not; only the asking workspace's rows come back, and another workspace's id
 * names nothing; a reach-out's email (a name of its own, edited in place) belongs to no message, by its id or its name,
 * and takes none of its siblings with it; an id nobody holds answers none; a read that fails throws, on either of its
 * two trips, naming the function. The columns are the ones campaignMessageOf reads, and a refused WhatsApp version's
 * words reach it.
 *
 * Rows are made by a local factory: `_rows.mjs` has none for templates, so this one fills every column the table has,
 * and a column a migration adds fails it by name, as `_rows.mjs` does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignMessageOf, messageHolds, reachOutRowName, versionComponents } from "@chanlytics/contracts";
import { messageVersionRowsOf } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { AT, TENANT, uuid } from "../_rows.mjs";
import { schemaOf } from "../_schema.mjs";

const SCHEMA = await schemaOf();
const COLUMNS = Object.keys(SCHEMA.relations.templates.columns).sort();

const A = TENANT;
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NAME = "autumn_note";
const LANGUAGE = "en_US";

/** The columns messageVersionRowsOf answers, which campaignMessageOf and the pages that draw a version read. */
const ANSWERED = [
  "id",
  "channel",
  "name",
  "language",
  "meta_status",
  "category",
  "variables",
  "hidden_at",
  "title",
  "source",
  "components",
  "body_preview",
  "rejected_reason",
].sort();

const SLOTS = [{ position: 1, label: "First name", example: "Dani" }];

/** A row as the templates table holds it: WhatsApp's is Meta's, an email's or a text's is written here and approved at once. */
function template(over = {}) {
  const channel = over.channel ?? "whatsapp";
  const words = { subject: channel === "email" ? "A note, {{1}}" : null, body: "Hi {{1}}, a note from Harbor Studio." };
  const row = {
    id: uuid(),
    tenant_id: A,
    channel,
    name: NAME,
    language: LANGUAGE,
    meta_status: "approved",
    category: "utility",
    meta_id: channel === "whatsapp" ? `tpl_${uuid()}` : null,
    components: channel === "whatsapp" ? [{ type: "BODY", text: words.body }] : versionComponents(channel, words),
    body_preview: words.body,
    variables: SLOTS,
    quality: null,
    rejected_reason: null,
    synced_at: null,
    source: channel === "whatsapp" ? "meta" : "chanlytics",
    created_by: null,
    hidden_at: null,
    title: null,
    created_at: AT,
    updated_at: AT,
    ...over,
  };
  const have = Object.keys(row).sort();
  assert.deepEqual(have, COLUMNS, "the factory fills every column the templates table has (database.types.ts)");
  return row;
}

/** The three versions of the message in one language. */
const versions = (over = {}) => ({
  w: template({ channel: "whatsapp", ...over }),
  e: template({ channel: "email", ...over }),
  t: template({ channel: "sms", ...over }),
});

/** A database in memory over these rows, and the rows' table to read back what it holds. */
const world = (templates, faults) => fakeDb({ templates }, faults);

/** What a read answered, as the pairs a test compares: the rows' ids, in a fixed order. */
const idsOf = (rows) => rows.map((r) => r.id).sort();
const reads = (db) => db.seen.filter((q) => q.table === "templates").length;

test("by an email version's id, every version of the message comes back, and nothing of another language or name", async () => {
  const own = versions();
  const spanish = template({ channel: "email", language: "es_ES" });
  const another = template({ channel: "whatsapp", name: "spring_offer" });
  const db = world([own.w, own.e, own.t, spanish, another]);
  const answered = await messageVersionRowsOf(db, A, { id: own.e.id });
  assert.deepEqual(
    idsOf(answered),
    idsOf([own.w, own.e, own.t]),
    "WhatsApp, email and text, the email itself among them",
  );
  assert.deepEqual(
    answered.map((r) => r.channel).sort(),
    ["email", "sms", "whatsapp"],
    "whatever the channel of the row that named it",
  );
  assert.equal(reads(db), 2, "the row that names the message, then its rows");
  for (const row of answered)
    assert.deepEqual(Object.keys(row).sort(), ANSWERED, "the columns campaignMessageOf reads");
});

test("by a WhatsApp or a text version's id, the same rows come back", async () => {
  const own = versions();
  const db = world([own.w, own.e, own.t, template({ channel: "email", language: "es_ES" })]);
  for (const named of [own.w, own.t])
    assert.deepEqual(
      idsOf(await messageVersionRowsOf(db, A, { id: named.id })),
      idsOf([own.w, own.e, own.t]),
      named.channel,
    );
});

test("by name and language, the same rows come back in one read", async () => {
  const own = versions();
  const db = world([
    own.w,
    own.e,
    own.t,
    template({ channel: "email", language: "es_ES" }),
    template({ channel: "sms", name: "spring_offer" }),
  ]);
  const answered = await messageVersionRowsOf(db, A, { name: NAME, language: LANGUAGE });
  assert.deepEqual(idsOf(answered), idsOf([own.w, own.e, own.t]));
  assert.equal(reads(db), 1, "no row to name it first");
  assert.deepEqual(
    await messageVersionRowsOf(db, A, { name: NAME, language: "fr_FR" }),
    [],
    "a language it has no version in",
  );
  assert.deepEqual(
    await messageVersionRowsOf(db, A, { name: "no_such_message", language: LANGUAGE }),
    [],
    "a name it has none of",
  );
});

test("a message with no WhatsApp version comes back by any of its versions, and a refused one carries its words", async () => {
  const own = versions();
  const refused = template({
    channel: "whatsapp",
    name: "winter_note",
    meta_status: "rejected",
    rejected_reason: "TAG_CONTENT_MISMATCH",
  });
  const onlyOwn = [
    template({ channel: "email", name: "winter_note" }),
    template({ channel: "sms", name: "winter_note" }),
  ];
  const db = world([own.w, own.e, own.t, refused, ...onlyOwn]);

  // The rows go to campaignMessageOf as they are: its anchor, the channels it holds, and Meta's refusal in its words.
  const refusedRows = await messageVersionRowsOf(db, A, { id: onlyOwn[0].id });
  const message = campaignMessageOf(refusedRows, "winter_note", LANGUAGE);
  assert.equal(message?.anchor.channel, "whatsapp", "the refused WhatsApp row anchors it");
  assert.equal(message?.versions.whatsapp?.status, "rejected");
  assert.match(message?.versions.whatsapp?.reason ?? "", /tag content mismatch/, "rejected_reason is read");
  assert.deepEqual(messageHolds(message), { whatsapp: false, email: true, sms: true });

  const noWhatsApp = world(onlyOwn);
  const email = campaignMessageOf(
    await messageVersionRowsOf(noWhatsApp, A, { id: onlyOwn[1].id }),
    "winter_note",
    LANGUAGE,
  );
  assert.equal(email?.anchor.channel, "email", "with no WhatsApp row, the email anchors it");
  assert.deepEqual(messageHolds(email), { whatsapp: false, email: true, sms: true });
});

test("another workspace's rows are never returned, and its id names nothing", async () => {
  const mine = versions();
  const theirs = versions({ tenant_id: B });
  const db = world([mine.w, mine.e, theirs.w, theirs.e, theirs.t]);

  assert.deepEqual(
    idsOf(await messageVersionRowsOf(db, A, { name: NAME, language: LANGUAGE })),
    idsOf([mine.w, mine.e]),
  );
  assert.deepEqual(idsOf(await messageVersionRowsOf(db, A, { id: mine.e.id })), idsOf([mine.w, mine.e]));
  assert.deepEqual(
    idsOf(await messageVersionRowsOf(db, B, { name: NAME, language: LANGUAGE })),
    idsOf([theirs.w, theirs.e, theirs.t]),
  );

  assert.deepEqual(
    await messageVersionRowsOf(db, A, { id: theirs.e.id }),
    [],
    "their version's id is no message of ours",
  );
  const alone = world([theirs.w, theirs.e]);
  assert.deepEqual(
    await messageVersionRowsOf(alone, A, { name: NAME, language: LANGUAGE }),
    [],
    "and a workspace with none has none",
  );
});

test("a reach-out's email belongs to no message, by its id or its name, and its siblings do not come with it", async () => {
  const stepName = reachOutRowName("11111111-2222-4333-8444-555555555555");
  const email = template({ channel: "email", name: stepName });
  const text = template({ channel: "sms", name: stepName });
  const own = versions();
  const db = world([email, text, own.w, own.e]);

  assert.deepEqual(await messageVersionRowsOf(db, A, { id: email.id }), [], "by its id");
  assert.deepEqual(await messageVersionRowsOf(db, A, { name: stepName, language: LANGUAGE }), [], "by its name");
  assert.deepEqual(
    idsOf(await messageVersionRowsOf(db, A, { id: own.e.id })),
    idsOf([own.w, own.e]),
    "a message beside it is whole",
  );
});

test("an id nobody holds is no message", async () => {
  const own = versions();
  const db = world([own.w, own.e]);
  assert.deepEqual(await messageVersionRowsOf(db, A, { id: "99999999-9999-4999-8999-999999999999" }), []);
  assert.deepEqual(await messageVersionRowsOf(world([]), A, { id: own.e.id }), [], "nor in an empty table");
});

test("a read that fails throws, naming the function, on either trip", async () => {
  const own = versions();
  const down = { message: "the database is down", code: "08006" };
  const failing = (templates) => world(templates, { "templates.select": down });
  const expected = { message: "messageVersionRowsOf: the database is down" };

  await assert.rejects(
    messageVersionRowsOf(failing([own.e]), A, { name: NAME, language: LANGUAGE }),
    expected,
    "by name",
  );
  await assert.rejects(
    messageVersionRowsOf(failing([own.e]), A, { id: own.e.id }),
    expected,
    "by id, the row that names it",
  );

  // The second trip: the first answers, the one for its siblings is the one that fails.
  const templates = [own.w, own.e, own.t];
  const well = world(templates);
  const unwell = failing(templates);
  let trips = 0;
  const flaky = { from: (table) => (++trips === 1 ? well : unwell).from(table) };
  await assert.rejects(messageVersionRowsOf(flaky, A, { id: own.e.id }), expected, "by id, the rows beside it");
  assert.equal(trips, 2, "the failure was the second trip's");
});
