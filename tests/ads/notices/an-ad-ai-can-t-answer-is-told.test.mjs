/**
 * A running ad AI can't answer (apps/edge/lib/ads/chat/answered.ts keepWaysIn; decision 0050, call 11), as each read of
 * an account judges it, over a database in memory whose door is 00676's ad_way_in_keep.
 *
 * What must hold. Every ad made here that its owner has on is judged by the one rule (contracts adWayInOf) against the
 * exact number it names, from what Settings keeps of the number, billing and the stop, read once; what stands in its way
 * is handed to the door with the bell's words, which say what it can still spend. An ad that does not run, or one AI
 * answers, hands nothing in its way, so its row closes. An ad made in Meta is never judged here: Chanlytics does not know
 * the number it opens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { keepWaysIn, readWayIn } = await import(at("apps/edge/lib/ads/chat/answered.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));

const T = "abababab-7777-4000-8000-000000000001";
const ACCOUNT = "acacacac-7777-4000-8000-000000000001";
const AD = (n) => `adadadad-7777-4000-8000-00000000000${n}`;

const adRow = (n, over = {}) => ({
  id: AD(n),
  tenant_id: T,
  account_id: ACCOUNT,
  platform: "meta",
  origin: "chanlytics",
  name: `Ad ${n}`,
  version: 2,
  status: "made",
  intent: "on",
  platform_ad_id: `2385000000000030${n}`,
  platform_campaign_id: `2385000000000040${n}`,
  platform_state: "ACTIVE",
  ends_at: "2026-12-08T22:00:00Z",
  budget_kind: "total",
  budget_minor: 7000,
  budget_left_minor: 6420,
  launch: null,
  paused_by: null,
  way_in: null,
  way_in_at: null,
  approved: { whatsapp: "+1 (305) 555-0142" },
  created_at: "2026-11-18T10:00:00Z",
  ...over,
});

function world({ canSend = "BLOCKED", status = "active", stopped = null, number = "+13055550142" } = {}) {
  const handed = [];
  const tables = {
    tenants: [{ id: T, name: "Harbor Studio", status, sending_stopped_at: stopped }],
    tenant_channels: [
      {
        id: "c5c5c5c5-7777-4000-8000-000000000001",
        tenant_id: T,
        kind: "whatsapp",
        status: "active",
        number_e164: number,
        config: canSend === null ? {} : { standing: { can_send: canSend, problems: [] } },
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    ads: [
      adRow(1),
      adRow(2, { intent: "paused", platform_state: "CAMPAIGN_PAUSED" }),
      adRow(3, { origin: "platform", approved: null }),
      adRow(4, { approved: { whatsapp: "+1 305 555 0199" } }),
    ],
  };
  const rpcs = {
    ad_way_in_keep: ({ p_ways }) => {
      handed.push(p_ways);
      return { moved: p_ways.filter((way) => way.way_in).length, rung: 0, closed: 0 };
    },
  };
  const db = fakeDb(tables, {}, rpcs);
  const keep = () =>
    keepWaysIn(db, logger({ tenant_id: T }), {
      tenantId: T,
      account: { id: ACCOUNT, currency: "USD", timezone: "America/New_York" },
    });
  return { db, handed, keep };
}

test("an ad on whose number Meta stopped is handed as blocked, with the bell's words saying what it can still spend", async () => {
  const w = world();
  await w.keep();
  const [ways] = w.handed;
  const byId = Object.fromEntries(ways.map((way) => [way.ad_id, way]));
  assert.deepEqual(Object.keys(byId).sort(), [AD(1), AD(2), AD(4)], "every ad made here, and none made in Meta");
  assert.equal(byId[AD(1)].way_in, "blocked");
  assert.equal(byId[AD(1)].title, "“Ad 1” is on, and AI can't answer it");
  assert.match(byId[AD(1)].body, /It can still spend \$64\.20 of its total\./);
  assert.equal(byId[AD(2)].way_in, null, "a paused ad spends nothing: nothing stands in its way to tell");
  assert.equal(byId[AD(4)].way_in, "no_number", "the exact number it names, not a number the workspace has");
});

test("AI answers it: nothing stands in its way, so its row closes; not known is said as such, for the door's hour", async () => {
  const open = world({ canSend: "AVAILABLE" });
  await open.keep();
  assert.equal(open.handed[0].find((way) => way.ad_id === AD(1)).way_in, null);
  const unknown = world({ canSend: null });
  await unknown.keep();
  assert.equal(unknown.handed[0].find((way) => way.ad_id === AD(1)).way_in, "unread");
});

test("billing paused and AI stopped close it too, in the one rule's order; the launch's own check reads the same now", async () => {
  const paused = world({ canSend: "AVAILABLE", status: "paused" });
  await paused.keep();
  assert.equal(paused.handed[0].find((way) => way.ad_id === AD(1)).way_in, "paused");
  const stopped = world({ canSend: "AVAILABLE", stopped: "2026-11-21T10:00:00Z" });
  await stopped.keep();
  assert.equal(stopped.handed[0].find((way) => way.ad_id === AD(1)).way_in, "stopped");
  assert.equal(await readWayIn(world({ canSend: "AVAILABLE" }).db, T, "+1 (305) 555-0142"), "open");
  assert.equal(await readWayIn(world({ canSend: "LIMITED" }).db, T, "13055550142"), "open");
  assert.equal(await readWayIn(world().db, T, "+1 (305) 555-0142"), "blocked");
});
