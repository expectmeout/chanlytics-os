/**
 * The row factories (_rows.mjs) make rows the database holds: every column the table has, each value one the schema
 * takes, so a fixture that uses one cannot lie about the table's shape. database/fake-db/fake-db-agrees.db.test.mjs inserts
 * the same rows into the replayed stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { rows, TENANT } from "../../_rows.mjs";
import { schemaOf } from "../../_schema.mjs";

const SCHEMA = await schemaOf();
const TABLES = {
  tenant: "tenants",
  config: "tenant_config",
  contact: "contacts",
  conversation: "conversations",
  message: "messages",
  event: "events",
  channel: "tenant_channels",
  line: "lines",
  membership: "memberships",
  billing: "billing_accounts",
};

test("each factory makes a row with every column its table has, and the double takes it as an insert", async () => {
  assert.deepEqual(Object.keys(rows).sort(), Object.keys(TABLES).sort());
  for (const [make, table] of Object.entries(TABLES)) {
    const row = rows[make]();
    assert.deepEqual(Object.keys(row).sort(), Object.keys(SCHEMA.relations[table].columns).sort(), table);
    const tables = {};
    const { error } = await fakeDb(tables).from(table).insert(row);
    assert.equal(error, null, `${table}: ${error?.message}`);
  }
});

test("a factory row takes the test's own values over its defaults, and a fresh id each time", () => {
  const a = rows.contact({ phone_e164: "+13055550101" });
  const b = rows.contact();
  assert.equal(a.phone_e164, "+13055550101");
  assert.equal(a.tenant_id, TENANT);
  assert.equal(b.phone_e164, null, "a column the table lets be null is null");
  assert.notEqual(a.id, b.id);
});

test("a key the table does not have, or a value the database would refuse, is refused where the row is made", () => {
  assert.throws(() => rows.contact({ phone: "+13055550101" }), /contacts has no column phone/);
  assert.throws(
    () => rows.conversation({ state: "closed" }),
    /would refuse this conversations row: .*check constraint/,
  );
  assert.throws(
    () => rows.message({ tenant_id: null }),
    /would refuse this messages row: null value in column "tenant_id"/,
  );
});
