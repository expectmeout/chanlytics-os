/**
 * A day of previews has a limit (decision 0079's sprint, step 2; contracts PREVIEW_LIMITS.aDay). What nobody pressed for
 * (a sequence that carries the link, a reply that makes one) makes fifty a UTC day for a workspace, and no more:
 *
 *   the ask         refused as the day's limit, and nothing made; a member's press is never counted out; a lead that
 *                   has one already is answered it; yesterday's count for nothing
 *   the sender      the email that would have made the fifty-first is HELD and planned again an hour on, never
 *                   skipped and never asked again in minutes; a workspace found full is asked once a tick
 *
 * Made-up businesses only.
 */
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_LIMITS } from "@chanlytics/contracts";
import { fakeDb, fakeLog } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { askPreview } = await importSrc("apps/edge/lib/previews/make.ts");
const { claimedTurns } = await importSrc("apps/edge/lib/campaigns/reach-out/sender/lanes.ts");
const { previewForWords } = await importSrc("apps/edge/lib/campaigns/reach-out/sender/their-preview.ts");

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-15T15:00:00Z");
const TODAY = "2026-11-15T09:00:00Z";

const leadRow = (id) => ({
  id,
  tenant_id: WS,
  kind: "place",
  stage: "ready",
  erased_at: null,
  blanked_at: null,
  business_name: "Fixture Barbers",
  city: "Austin",
  region: "TX",
});
/** `n` previews this workspace made at `at`, each for a lead of its own. */
const made = (n, at = TODAY) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    tenant_id: WS,
    lead_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    state: "ready",
    created_at: at,
  }));
/** The lead, the previews that stand, and preview_make answering as the door does. */
function world(previews = []) {
  const tables = { leads: [leadRow(LEAD), leadRow(OTHER)], lead_previews: previews, jobs: [] };
  const asked = [];
  const db = fakeDb(
    tables,
    {},
    {
      preview_make: (a) => {
        asked.push(a);
        const standing = tables.lead_previews.find((r) => r.lead_id === a.p_lead_id);
        return standing
          ? { id: standing.id, token: "t".repeat(22), state: standing.state, preview_tenant_id: null, made: false }
          : { id: "new", token: "t".repeat(22), state: "building", preview_tenant_id: WS, made: true };
      },
    },
  );
  return { db, tables, asked };
}

const was = process.env.LEAD_PREVIEWS;
beforeEach(() => {
  process.env.LEAD_PREVIEWS = "on";
});
afterEach(() => {
  if (was === undefined) delete process.env.LEAD_PREVIEWS;
  else process.env.LEAD_PREVIEWS = was;
});

test("the limit is fifty a day, and a day is the UTC day", async () => {
  assert.equal(PREVIEW_LIMITS.aDay, 50);
  const refused = async (previews) =>
    !(await askPreview(world(previews).db, { tenantId: WS, leadId: LEAD, by: null }, NOW)).ok;
  assert.equal(await refused(made(49)), false);
  assert.equal(await refused(made(50)), true);
  assert.equal(await refused(made(50, "2026-11-14T23:59:59Z")), false, "yesterday's");
  assert.equal(await refused(made(50, "2026-11-15T00:00:00Z")), true, "from midnight UTC");
});

test("what nobody pressed for is refused once the day's are made, and nothing is made", async () => {
  const full = world(made(50));
  const refused = await askPreview(full.db, { tenantId: WS, leadId: LEAD, by: null }, NOW);
  assert.deepEqual([refused.ok, refused.reason], [false, "limit"]);
  assert.deepEqual(full.asked, [], "its door is never asked");
  assert.deepEqual(full.tables.jobs, []);
  const room = world(made(49));
  assert.equal((await askPreview(room.db, { tenantId: WS, leadId: LEAD, by: null }, NOW)).ok, true);
  assert.equal(room.asked.length, 1);
});

test("a member's press is never counted out, and a lead that has one already is answered it", async () => {
  const full = world(made(50));
  const pressed = await askPreview(full.db, { tenantId: WS, leadId: LEAD, by: USER }, NOW);
  assert.equal(pressed.ok, true);
  assert.equal(full.asked[0].p_by, USER);
  // One of today's fifty is this lead's own: a reply that asks for it is given it.
  const theirs = world([...made(49), { id: "mine", tenant_id: WS, lead_id: LEAD, state: "ready", created_at: TODAY }]);
  const standing = await askPreview(theirs.db, { tenantId: WS, leadId: LEAD, by: null }, NOW);
  assert.deepEqual([standing.ok, standing.value.id, standing.value.made], [true, "mine", false]);
});

const SEND = (id, lead = LEAD) => ({ id, tenant_id: WS, lead_id: lead, step_id: "s1" });
const tickOf = (db) => ({
  db,
  now: NOW,
  lane: null,
  log: fakeLog(),
  reads: null,
  replan: [],
  later: [],
  soon: [],
  said: new Set(),
  capped: new Set(),
  cappedSends: new Set(),
});

test("the sender holds the email for the day and plans it again an hour on: never skipped, never asked again in minutes", async () => {
  const full = world(made(50));
  const tick = tickOf(full.db);
  const first = SEND("5e000000-0000-4000-8000-000000000001");
  const slot = await previewForWords(tick, first);
  assert.equal(slot.slot.state, "building", "held as one being made is, not gone: gone would skip the email");
  assert.deepEqual([...tick.capped], [WS]);
  assert.equal(claimedTurns(tick, first).hold("preview_building"), "held");
  assert.deepEqual([tick.soon.length, tick.later.length], [0, 1], "the hour, not the minutes of a build");
  // A second email of the same workspace in the same tick is not asked about at all.
  const before = full.tables.lead_previews.length;
  const second = SEND("5e000000-0000-4000-8000-000000000002", OTHER);
  full.tables.lead_previews.length = 0;
  const again = await previewForWords(tick, second);
  assert.equal(again.slot.state, "building");
  assert.equal(before, 50);
  assert.deepEqual(full.asked, [], "the day was found full once: its door is not asked for the rest of the tick");
  claimedTurns(tick, second).hold("preview_building");
  assert.deepEqual([tick.soon.length, tick.later.length], [0, 2]);
});

test("with room in the day the sender asks as before, and its email waits minutes for the build", async () => {
  const room = world(made(3));
  const tick = tickOf(room.db);
  const send = SEND("5e000000-0000-4000-8000-000000000003");
  const slot = await previewForWords(tick, send);
  assert.equal(slot.slot.state, "building");
  assert.equal(room.asked.length, 1);
  claimedTurns(tick, send).hold("preview_building");
  assert.deepEqual([tick.soon.length, tick.later.length], [1, 0]);
  assert.deepEqual([...tick.capped], []);
});
