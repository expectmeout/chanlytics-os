/**
 * A workspace may hold two active WhatsApp numbers on one account: connecting a second leaves the first on
 * (connect-number.ts). The readers that took "the" active row read `.limit(1)` with no order, so either answered,
 * read by read. Run over a database in memory whose rows come newer first, as a read that names no order may find them:
 *
 *   - Meta's notice about one number (its rating, its display name) names it, and is kept on that number's row, under
 *     that number's channel; a notice that names none, or a number not on file, is the account's oldest number's.
 *   - A reader that knows no number (a run's WhatsApp facts) is answered by the oldest, every time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { handleWabaChange } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));
const here = path.dirname(fileURLToPath(import.meta.url));
const { whatsappChannelFacts } = await import(
  pathToFileURL(path.join(here, "../../../../packages/db/dist/index.js")).href
);

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const WABA = "207650000000977";
const number = (id, external, e164, created) => ({
  id,
  tenant_id: T,
  kind: "whatsapp",
  external_id: external,
  waba_id: WABA,
  status: "active",
  number_e164: e164,
  config: { standing_note: id },
  created_at: created,
});
const OLD = number("ch-old", "106540000000971", "+13055550971", "2026-09-01T09:00:00.000Z");
const NEW = number("ch-new", "106540000000972", "+13055550972", "2026-10-01T09:00:00.000Z");

function world() {
  const tables = { tenant_channels: [{ ...NEW }, { ...OLD }], events: [], notifications: [] };
  return { tables, db: fakeDb(tables) };
}
/** Meta's notice that a number's messaging limit moved, naming the number as Meta writes it: its digits. */
const rating = (displayNumber) => ({
  field: "phone_number_quality_update",
  value: {
    ...(displayNumber ? { display_phone_number: displayNumber } : {}),
    event: "UPGRADE",
    current_limit: "TIER_10K",
  },
});
const limits = (tables) =>
  Object.fromEntries(tables.tenant_channels.map((c) => [c.id, c.config.messaging_limit ?? null]));

test("a notice about one of an account's two numbers is kept on that number: its row and its channel's event", async () => {
  for (const [named, on] of [
    ["13055550972", "ch-new"],
    ["13055550971", "ch-old"],
  ]) {
    const w = world();
    assert.equal(await handleWabaChange(w.db, WABA, rating(named), async () => null), "kept");
    assert.deepEqual(
      limits(w.tables),
      { "ch-new": on === "ch-new" ? "TIER_10K" : null, "ch-old": on === "ch-old" ? "TIER_10K" : null },
      `REGRESSION: the notice naming ${named} was kept on whichever row the read found first`,
    );
    assert.deepEqual(
      w.tables.events.map((e) => [e.kind, e.subject_id]),
      [["channel.phone_number_quality_update", on]],
    );
  }
});

test("a notice that names no number, or one not on file, is the account's oldest number's, every time", async () => {
  for (const named of [null, "13055550000"]) {
    const w = world();
    await handleWabaChange(w.db, WABA, rating(named), async () => null);
    assert.deepEqual(limits(w.tables), { "ch-new": null, "ch-old": "TIER_10K" }, String(named));
  }
  const w = world();
  await handleWabaChange(
    w.db,
    WABA,
    { field: "account_review_update", value: { decision: "APPROVED" } },
    async () => null,
  );
  assert.deepEqual(
    w.tables.events.map((e) => [e.kind, e.subject_id]),
    [["channel.account_review_update", "ch-old"]],
  );
});

test("a reader that knows no number is answered by the workspace's oldest active WhatsApp number", async () => {
  const w = world();
  const facts = await whatsappChannelFacts(w.db, T);
  assert.equal(facts.number, "+13055550971", "REGRESSION: an unordered read answered with the newer row");
  assert.deepEqual(facts.config, { standing_note: "ch-old" });
});
