/**
 * The schema's names, as docs/naming.md says them, read from the schema a replay builds (supabase/schema.sql), so it runs
 * with no stack. An applied name is never renamed, so what was named before the rule (6 November 2026) is listed by
 * name; the lists hold today's exceptions and no new one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "../../_source.mjs";

const schema = () => readRaw("supabase/schema.sql");
const partitions = (sql) => new Set([...sql.matchAll(/ATTACH PARTITION public\.(\w+)/g)].map((m) => m[1]));
const tablesIn = (sql) => {
  const parts = partitions(sql);
  return [...sql.matchAll(/^CREATE TABLE public\.(\w+) \(/gm)].map((m) => m[1]).filter((t) => !parts.has(t));
};
const functionsIn = (sql) => [...new Set([...sql.matchAll(/^CREATE FUNCTION public\.(\w+)\(/gm)].map((m) => m[1]))];

/** What a function does said first, where the rule says its domain comes first (`lead_set_stage`, `reach_out_claim`). */
const STARTS_WITH_A_VERB =
  /^(add|apply|approve|assign|cancel|claim|clear|complete|consume|create|delete|disable|enable|ensure|find|finish|get|grant|insert|list|load|make|mark|merge|move|pause|put|read|record|refresh|register|reject|release|remove|rename|reset|restore|resume|revoke|save|send|set|start|stop|sync|take|touch|trigger|undo|update|upsert|write)_/;

/** The tables named before the rule that are not plural. */
const SINGULAR_TABLES = new Set(
  "ai_usage conversation_channel_state erasure_keying event_outbox files_let_go lead_platform mailbox_left partner_reversals_waiting reach_out_check_spend tenant_config waitlist".split(
    " ",
  ),
);

/** A foreign key whose column is not named for the table it references: named so before the rule, and kept. */
const KEYS_NAMED_OTHERWISE = new Set([
  "google_listing_days.tenant_id",
  "google_reviews.tenant_id",
  "partner_earnings.payout_id",
]);

const singularOf = (table) =>
  table
    .replace(/ies$/, "y")
    .replace(/(ch|sh|x|ss)es$/, "$1")
    .replace(/s$/, "");

/** `{ from, column, to }` for each single-column foreign key whose column is an id. */
const foreignKeysIn = (sql) =>
  [
    ...sql.matchAll(
      /^ALTER TABLE ONLY public\.(\w+)\n\s+ADD CONSTRAINT \w+ FOREIGN KEY \((\w+)\) REFERENCES public\.(\w+)/gm,
    ),
  ]
    .map(([, from, column, to]) => ({ from, column, to }))
    .filter(({ column }) => column.endsWith("_id"));

/** A column is named for its table when it ends with the table's name, or with one of its words: `step_id` for `sequence_steps`. */
const namedForItsTable = (column, to) => {
  const stem = column.replace(/_id$/, "");
  const table = singularOf(to);
  return table === stem || table.endsWith(`_${stem}`) || stem.endsWith(`_${table}`) || stem === "id";
};

test("a table is plural, or was named before the rule", () => {
  const sql = schema();
  const offenders = tablesIn(sql).filter((t) => !t.endsWith("s") && !SINGULAR_TABLES.has(t));
  assert.deepEqual(offenders, [], "a new table is plural snake_case (docs/naming.md)");
  const gone = [...SINGULAR_TABLES].filter((t) => !tablesIn(sql).includes(t));
  assert.deepEqual(gone, [], "take it off SINGULAR_TABLES: the schema no longer has it");
});

test("every name is under Postgres's 63 bytes, where it truncates", () => {
  const sql = schema();
  assert.deepEqual(
    [...tablesIn(sql), ...functionsIn(sql)].filter((n) => Buffer.byteLength(n) > 63),
    [],
  );
});

test("a function's domain comes first, or it was named before the rule", () => {
  const sql = schema();
  const held = new Set(readBefore());
  const offenders = functionsIn(sql).filter((f) => STARTS_WITH_A_VERB.test(f) && !held.has(f));
  assert.deepEqual(offenders, [], "a new function is <domain>_<verb>[_<object>] (docs/naming.md)");
  const gone = [...held].filter((f) => !functionsIn(sql).includes(f));
  assert.deepEqual(gone, [], "take it off tests/repo/names/sql-functions-before-the-rule.json: it was dropped");
});

test("a foreign key is named for its table, or was named before the rule", () => {
  const sql = schema();
  const offenders = foreignKeysIn(sql)
    .filter(({ from, column, to }) => !namedForItsTable(column, to) && !KEYS_NAMED_OTHERWISE.has(`${from}.${column}`))
    .map(({ from, column, to }) => `${from}.${column} -> ${to}`);
  assert.deepEqual(offenders, [], "a foreign key is named for the table it references (docs/naming.md)");
});

test("the rules read a schema and refuse what they should", () => {
  const sql = [
    "CREATE TABLE public.leads (",
    ");",
    "CREATE TABLE public.waitlist (",
    ");",
    "CREATE TABLE public.leads_2026 (",
    ");",
    "ALTER TABLE ONLY public.leads ATTACH PARTITION public.leads_2026 FOR VALUES FROM (1) TO (2);",
    "CREATE FUNCTION public.lead_set_stage(p uuid) RETURNS void",
    "CREATE FUNCTION public.set_lead_stage(p uuid) RETURNS void",
    "ALTER TABLE ONLY public.deals",
    "    ADD CONSTRAINT deals_lead FOREIGN KEY (lead_id) REFERENCES public.leads(id);",
    "ALTER TABLE ONLY public.deals",
    "    ADD CONSTRAINT deals_owner FOREIGN KEY (list_id) REFERENCES public.segments(id);",
  ].join("\n");
  assert.deepEqual(tablesIn(sql), ["leads", "waitlist"], "a partition is read through its table");
  assert.deepEqual(
    functionsIn(sql).filter((f) => STARTS_WITH_A_VERB.test(f)),
    ["set_lead_stage"],
  );
  assert.deepEqual(
    foreignKeysIn(sql)
      .filter(({ column, to }) => !namedForItsTable(column, to))
      .map((k) => k.column),
    ["list_id"],
  );
  assert.equal(namedForItsTable("step_id", "sequence_steps"), true);
  assert.equal(namedForItsTable("reply_to_id", "replies"), false);
});

/** The functions named before the rule that say their verb first, kept in a list a review can read. */
function readBefore() {
  return JSON.parse(readRaw("tests/repo/names/sql-functions-before-the-rule.json"));
}
