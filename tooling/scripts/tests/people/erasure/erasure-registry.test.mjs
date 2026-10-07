/**
 * Every personal column has an erasure strategy (decision 0036): the registry in packages/db held to the schema a
 * replay builds.
 *
 * What each leg of an erasure reaches is written in its own code; the registry says it per column, so a column that can
 * hold a person's words says how an erasure reaches it. The ratchet "personal columns with no erasure strategy"
 * (repo/code-health-ratchets.test.mjs, baselines/erasure-strategies.json) holds the count of columns it does not name
 * to fall; this holds the registry itself: no entry for a column the schema no longer has, every leg one the erasure
 * runs, every age one the privacy page states.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RETENTION_DAYS, SCHEMA_SETS } from "@chanlytics/contracts";
import { ERASURE_LEGS, ERASURE_STRATEGIES } from "@chanlytics/db";
import { personalColumns } from "../../_measures.mjs";

const entries = Object.entries(ERASURE_STRATEGIES).flatMap(([table, columns]) =>
  Object.entries(columns).map(([column, strategy]) => ({ name: `${table}.${column}`, strategy })),
);

test("the columns that can hold a person's words are read from the schema: a workspace's tables, word types, no closed set", () => {
  const columns = personalColumns();
  assert.ok(columns.length > 250, `the schema's word columns are read (${columns.length})`);
  for (const c of ["contacts.email", "messages.body", "person_notes.body", "calls.transcript", "provider_events.body"])
    assert.ok(columns.includes(c), `${c} is one`);
  assert.ok(!columns.includes("contacts.id"), "a uuid holds no words");
  assert.ok(!columns.includes("profiles.full_name"), "an account's own table is not a workspace's");
  assert.ok(Object.hasOwn(SCHEMA_SETS, "provider_events.provider") && !columns.includes("provider_events.provider"));
  assert.ok(
    !columns.some((c) => /^events_y\d{4}m\d{2}\./.test(c) || c.startsWith("events_default.")),
    "a partition is read through its parent",
  );
});

test("every entry names a word column of a workspace table as the schema builds it", () => {
  const columns = new Set(personalColumns());
  assert.deepEqual(
    entries.map((e) => e.name).filter((n) => !columns.has(n)),
    [],
    "an entry for a column the schema no longer has, or that holds no words: drop it",
  );
});

test("every strategy names a leg the erasure runs, or an age the privacy page states", () => {
  const legs = new Set(Object.keys(ERASURE_LEGS));
  const wrong = [];
  for (const { name, strategy } of entries) {
    if (strategy.kind === "with_person" && !legs.has(strategy.by)) wrong.push(`${name}: ${strategy.by}`);
    if (strategy.kind === "scrubbed" && (strategy.by.length === 0 || strategy.by.some((b) => !legs.has(b))))
      wrong.push(`${name}: ${strategy.by.join(", ")}`);
    if (strategy.kind === "by_age" && !Object.hasOwn(RETENTION_DAYS, strategy.days))
      wrong.push(`${name}: ${strategy.days}`);
  }
  assert.deepEqual(wrong, []);
  const used = new Set(entries.flatMap(({ strategy: s }) => (s.kind === "with_person" ? [s.by] : (s.by ?? []))));
  assert.deepEqual(
    [...legs].filter((l) => !used.has(l)),
    [],
    "every leg the erasure runs reaches a column the registry names",
  );
});

test("a message's words are counted, not named: a message is immutable (00326) until an exception is costed", () => {
  assert.equal(ERASURE_STRATEGIES.messages?.body, undefined);
  assert.equal(ERASURE_STRATEGIES.messages?.template_vars, undefined);
  assert.equal(ERASURE_STRATEGIES.messages?.media?.kind, "with_person", "the person's own messages go with them");
});

test("what the trigger legs reach is named for them: the notes, the events, the answers, the address, the deals, the leads", () => {
  const by = (name) => {
    const [table, column] = name.split(".");
    const s = ERASURE_STRATEGIES[table]?.[column];
    return s && "by" in s ? [s.by].flat() : [];
  };
  assert.ok(by("person_notes.body").includes("notes_trigger") && by("person_notes.body").includes("notes_scrub"));
  assert.ok(by("contacts.notes").includes("notes_trigger"));
  assert.deepEqual(by("events.data"), ["events_trigger"]);
  assert.deepEqual(by("contacts.marketing_consent_source"), ["consent_trigger"]);
  assert.deepEqual(by("contacts.email"), ["email_trigger"]);
  assert.deepEqual(by("deals.note"), ["deals_trigger"]);
  assert.deepEqual(by("leads.phone_e164"), ["leads_trigger"]);
});
