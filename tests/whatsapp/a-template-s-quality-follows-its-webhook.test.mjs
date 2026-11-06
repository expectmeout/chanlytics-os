/**
 * A template's quality follows its webhook (the Reports lenses spec, K9), run over a database in memory: Meta's
 * message_template_quality_update is kept as the workspace's event, as it always was, and now also moves the quality
 * of the template it names, in that language, in the routed workspace. Meta's four words, in any case, are the only
 * qualities; a template the workspace has no row for yet, a score outside the four and a write the database refuses
 * leave the rows as they were and the webhook acknowledged. The sync (templateRow) says quality through the same
 * function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { handleWabaChange } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));
const { templateRow, mapQuality } = await import(at("apps/edge/lib/whatsapp/meta-templates.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000b1";
const WABA = "207650000000901";
const KIND = "channel.message_template_quality_update";

const template = (id, over = {}) => ({
  id,
  tenant_id: T,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  meta_status: "approved",
  quality: "GREEN",
  ...over,
});

function world(faults = {}) {
  const tables = {
    tenant_channels: [
      {
        id: "ch-1",
        tenant_id: T,
        kind: "whatsapp",
        external_id: "106540000000901",
        waba_id: WABA,
        status: "active",
        number_e164: "+13055550901",
        config: {},
      },
    ],
    templates: [
      template("t-en"),
      template("t-es", { language: "es" }),
      template("t-hours", { name: "hours" }),
      template("t-theirs", { tenant_id: OTHER }),
      template("t-sms", { channel: "sms" }),
    ],
    events: [],
    notifications: [],
  };
  return { tables, db: fakeDb(tables, faults) };
}
const qualities = (tables) => Object.fromEntries(tables.templates.map((t) => [t.id, t.quality]));
const GREEN_ALL = { "t-en": "GREEN", "t-es": "GREEN", "t-hours": "GREEN", "t-theirs": "GREEN", "t-sms": "GREEN" };
const update = (db, over = {}) =>
  handleWabaChange(
    db,
    WABA,
    {
      field: "message_template_quality_update",
      value: {
        previous_quality_score: "GREEN",
        new_quality_score: "YELLOW",
        message_template_id: 123,
        message_template_name: "visit_reminder",
        message_template_language: "en_US",
        ...over,
      },
    },
    async () => null,
  );
const kept = (tables) => tables.events.filter((e) => e.kind === KIND);

async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}

test("an update lands on the template it names, in its language, in the routed workspace, and on no other; the event is kept as Meta sent it and nobody is alerted", async () => {
  const { tables, db } = world();
  assert.equal(await update(db), "kept");
  assert.deepEqual(qualities(tables), { ...GREEN_ALL, "t-en": "YELLOW" });
  assert.deepEqual(
    kept(tables).map((e) => [e.tenant_id, e.subject_id, e.data]),
    [
      [
        T,
        "ch-1",
        {
          waba_id: WABA,
          previous_quality_score: "GREEN",
          new_quality_score: "YELLOW",
          message_template_id: 123,
          message_template_name: "visit_reminder",
          message_template_language: "en_US",
        },
      ],
    ],
    "the history is the kept event",
  );
  assert.equal(tables.notifications.length, 0, "a quality score is nobody's alert");
});

test("Meta's four words land, in any case; every other word, and no word, leaves the quality alone; the event is kept either way", async () => {
  for (const [sent, want] of [
    ["GREEN", "GREEN"],
    ["yellow", "YELLOW"],
    [" RED ", "RED"],
    ["UNKNOWN", "UNKNOWN"],
  ]) {
    const { tables, db } = world();
    tables.templates[0].quality = null; // a template the sync has not scored: every word below is a change
    await update(db, { new_quality_score: sent });
    assert.equal(tables.templates[0].quality, want, `${JSON.stringify(sent)}`);
  }
  for (const sent of ["HIGH", "", null, 7, undefined]) {
    const { tables, db } = world();
    assert.equal(await update(db, { new_quality_score: sent }), "kept");
    assert.deepEqual(qualities(tables), GREEN_ALL, `${JSON.stringify(sent)} is not a quality`);
    assert.equal(kept(tables).length, 1, "and Meta's word is on record all the same");
  }
});

test("an update that names no template we hold creates nothing and changes nothing: no name, no language, no row, another channel's", async () => {
  for (const over of [
    { message_template_name: undefined },
    { message_template_language: undefined },
    { message_template_name: "never_synced" },
    { message_template_language: "fr" },
  ]) {
    const { tables, db } = world();
    const before = tables.templates.length;
    assert.equal(await update(db, over), "kept");
    assert.deepEqual(qualities(tables), GREEN_ALL);
    assert.equal(
      tables.templates.length,
      before,
      "a template Meta names and the sync has not met is left for the sync",
    );
  }
});

test("a write the database refuses costs the template its new word and nothing else: the event is kept, the webhook acknowledged, and the failure is on the log", async () => {
  const { tables, db } = world({ "templates.update": { message: "the database is unavailable" } });
  const { result, lines } = await logged(() => update(db));
  assert.equal(result, "kept");
  assert.deepEqual(qualities(tables), GREEN_ALL);
  assert.equal(kept(tables).length, 1);
  assert.deepEqual(
    lines
      .map(logLineOf)
      .filter(Boolean)
      .map((l) => l.event),
    ["template_quality_write_failed"],
  );
});

test("a write that throws, not only one the database answers with an error, is as harmless: the event is kept, the webhook acknowledged, and the failure is on the log", async () => {
  const { tables, db } = world();
  const dropped = {
    ...db,
    from: (table) => {
      if (table === "templates") throw new Error("the connection dropped");
      return db.from(table);
    },
  };
  const { result, lines } = await logged(() => update(dropped));
  assert.equal(result, "kept");
  assert.deepEqual(qualities(tables), GREEN_ALL);
  assert.equal(kept(tables).length, 1);
  assert.deepEqual(
    lines
      .map(logLineOf)
      .filter(Boolean)
      .map((l) => l.event),
    ["template_quality_write_failed"],
  );
});

test("the sync and the webhook say quality the same way: Meta's four words, and nothing else is a quality", () => {
  const meta = (score) => ({
    id: "9",
    name: "visit_reminder",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    ...(score === undefined ? {} : { quality_score: { score } }),
  });
  assert.equal(templateRow(meta("YELLOW"), T).quality, "YELLOW");
  assert.equal(templateRow(meta("green"), T).quality, "GREEN");
  assert.equal(templateRow(meta("HIGH"), T).quality, null, "a word Meta does not use is no quality");
  assert.equal(templateRow(meta(undefined), T).quality, null);
  assert.equal(mapQuality("UNKNOWN"), "UNKNOWN");
  assert.equal(mapQuality({}), null);
  assert.equal(mapQuality("NA"), null, "NA is a number's word, not a template's: the sweep's own rule adds it");
});
