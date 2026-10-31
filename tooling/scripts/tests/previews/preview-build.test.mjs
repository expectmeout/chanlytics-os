/**
 * A lead's own receptionist built (decision 0079; apps/edge/lib/previews/build.ts, the preview_build job), over a
 * database in memory with the lead's website answered by the test: the receptionist the first run would give the lead's
 * listing, written through the settings' write schema, with everything its site said worn and no price; a site that
 * cannot be read leaves the listing alone; a lead with no name fails with why; a throw is tried again and the last try
 * fails the preview itself; the switch off builds nothing. And how one is asked for (previews/make.ts): made by its door
 * under the name the lead is called by and its state's zone, its build scheduled once while it waits. Made-up leads only.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { guardrailsInForce } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const was = process.env.LEAD_PREVIEWS;
after(() => {
  if (was === undefined) delete process.env.LEAD_PREVIEWS;
  else process.env.LEAD_PREVIEWS = was;
});
beforeEach(() => {
  process.env.LEAD_PREVIEWS = "on";
});
const { previewBuilder } = await importSrc("apps/edge/lib/previews/build.ts");
/** One build, as the job runner hands it, with the website read by the test. */
const buildPreview = (db, job, deadline, read) => previewBuilder(db, read).build(job, deadline);
const { askPreview } = await importSrc("apps/edge/lib/previews/make.ts");

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The world a build finds: the sender's lead, its preview building, the preview's own config as 00017 made it. */
function world({ lead = {}, preview = {} } = {}) {
  const tables = {
    leads: [
      {
        id: LEAD,
        tenant_id: OURS,
        kind: "place",
        stage: "ready",
        erased_at: null,
        blanked_at: null,
        business_name: "Fixture Barbers",
        category: "Barber shop",
        street: "12 Main St",
        city: "Austin",
        region: "TX",
        postal_code: "78701",
        phone_e164: "+15125550142",
        website_host: "fixture-barbers.example.com",
        hours: DAYS.map((day) => ({ day, hours: day === "Sunday" ? "Closed" : "9 AM to 6 PM" })),
        ...lead,
      },
    ],
    lead_previews: [
      {
        id: ID,
        tenant_id: OURS,
        lead_id: LEAD,
        preview_tenant_id: WS,
        state: "building",
        token: "t".repeat(22),
        ...preview,
      },
    ],
    tenant_config: [{ tenant_id: WS, config: {}, version: 1, updated_at: "2026-10-30T12:00:00Z", updated_by: null }],
  };
  const built = [];
  const db = fakeDb(
    tables,
    {},
    {
      preview_built: (a) => {
        built.push({ ok: a.p_ok, why: a.p_why ?? null });
        const row = tables.lead_previews.find((r) => r.id === a.p_id && r.state === "building");
        if (row)
          Object.assign(row, a.p_ok ? { state: "ready" } : { state: "failed", failed_why: a.p_why ?? "build_failed" });
        return !!row;
      },
    },
  );
  return { db, tables, built };
}

const job = (attempts = 1) => ({
  id: "job-1",
  tenant_id: OURS,
  kind: "preview_build",
  payload: { preview_id: ID },
  attempts,
});
const DEADLINE = () => Date.now() + 60_000;

/** The site as the website read keeps it: its services and prices, a day closed, a rule, an answer, its words. */
const SITE = {
  facts: {
    services: [
      { name: "Fade", price_note: "$35", duration_min: 30 },
      { name: "Beard trim", price_note: "from $15", duration_min: null },
    ],
    closed: [{ date: "2026-12-24", until: null }],
    rules: ["Cancel 24 hours ahead"],
    answers: [{ q: "Do you take walk-ins?", a: "Yes, until 5 PM." }],
    description: "A neighbourhood barber.",
    look: null,
  },
  error: null,
};
const reads = [];
const siteSays =
  (kept = SITE) =>
  async (_db, tenantId, url) => {
    reads.push({ tenantId, url });
    return kept;
  };

test("built: the listing's receptionist with the site worn, no price, on the preview's own workspace", async () => {
  reads.length = 0;
  const { db, tables, built } = world();
  await buildPreview(db, job(), DEADLINE(), siteSays());
  assert.deepEqual(
    reads,
    [{ tenantId: WS, url: "https://fixture-barbers.example.com" }],
    "read on the preview's workspace",
  );
  assert.deepEqual(built, [{ ok: true, why: null }]);
  const cfg = tables.tenant_config[0];
  assert.equal(cfg.version, 2, "through the settings' compare-and-swap");
  const brain = cfg.config.brain;
  assert.equal(brain.business_name, "Fixture Barbers");
  assert.deepEqual(brain.profile.hours.mon, { open: "09:00", close: "18:00" });
  assert.deepEqual(brain.profile.services, [{ name: "Fade", duration_min: 30 }, { name: "Beard trim" }], "no price");
  assert.deepEqual(brain.profile.closures, [{ date: "2026-12-24" }]);
  assert.deepEqual(brain.profile.booking_rules.notes, ["Cancel 24 hours ahead"]);
  assert.deepEqual(
    brain.profile.notes.map((n) => n.title),
    ["Do you take walk-ins?", "About the business"],
  );
  assert.equal(guardrailsInForce(brain.profile.guardrails).never_quote_prices, true);
  assert.equal(tables.lead_previews[0].state, "ready");
});

test("a site that cannot be read, or none at all, leaves the listing's receptionist alone, still ready", async () => {
  const thrown = world();
  await buildPreview(thrown.db, job(), DEADLINE(), async () => {
    throw new Error("the site timed out");
  });
  assert.deepEqual(thrown.built, [{ ok: true, why: null }]);
  assert.equal(thrown.tables.tenant_config[0].config.brain.profile.services, undefined);

  reads.length = 0;
  const noSite = world({ lead: { website_host: null } });
  await buildPreview(noSite.db, job(), DEADLINE(), siteSays());
  assert.deepEqual(reads, [], "nothing to read");
  assert.deepEqual(noSite.built, [{ ok: true, why: null }]);
});

test("a lead with no name to give it fails with why, and writes nothing", async () => {
  const { db, tables, built } = world({ lead: { business_name: "  " } });
  await buildPreview(db, job(), DEADLINE(), siteSays());
  assert.deepEqual(built, [{ ok: false, why: "no_name" }]);
  assert.equal(tables.tenant_config[0].version, 1);
  assert.equal(tables.lead_previews[0].failed_why, "no_name");
});

test("a throw is tried again; the last try fails the preview itself, so nothing waits on it for ever", async () => {
  const first = world();
  first.tables.tenant_config.length = 0;
  await assert.rejects(buildPreview(first.db, job(1), DEADLINE(), siteSays()), /config could not be read/);
  assert.deepEqual(first.built, []);
  const last = world();
  last.tables.tenant_config.length = 0;
  await buildPreview(last.db, job(2), DEADLINE(), siteSays());
  assert.deepEqual(last.built, [{ ok: false, why: "build_failed" }]);
});

test("one built already, or ended, is left as it is; the switch off builds nothing", async () => {
  const ready = world({ preview: { state: "ready" } });
  await buildPreview(ready.db, job(), DEADLINE(), siteSays());
  assert.deepEqual(ready.built, []);
  assert.equal(ready.tables.tenant_config[0].version, 1);

  process.env.LEAD_PREVIEWS = "";
  const off = world();
  await buildPreview(off.db, job(), DEADLINE(), siteSays());
  assert.deepEqual(off.built, []);
  assert.equal(off.tables.lead_previews[0].state, "building", "left for when the switch is on");
});

/** The world a request for a preview finds: the lead, and preview_make answering as the door does. */
function asking(state = "building") {
  const tables = { ...world().tables, lead_previews: [], jobs: [] };
  const asked = [];
  const db = fakeDb(
    tables,
    {},
    {
      preview_make: (a) => {
        asked.push(a);
        return { id: ID, token: "t".repeat(22), state, preview_tenant_id: WS, made: state === "building" };
      },
    },
  );
  return { db, tables, asked };
}

test("asked for: made under the name it is called by and its state's zone, its build scheduled once", async () => {
  const { db, tables, asked } = asking();
  const lead = tables.leads[0];
  lead.business_name = "Fixture Barbers | Austin's Best Fades";
  const made = await askPreview(db, { tenantId: OURS, leadId: LEAD, by: null });
  assert.equal(made.ok, true);
  assert.deepEqual(
    [asked[0].p_name, asked[0].p_timezone, asked[0].p_tenant_id, asked[0].p_lead_id],
    ["Fixture Barbers", "America/Chicago", OURS, LEAD],
  );
  await askPreview(db, { tenantId: OURS, leadId: LEAD, by: null });
  const jobs = tables.jobs.filter((j) => j.kind === "preview_build");
  assert.equal(jobs.length, 1, "one build while one waits");
  assert.deepEqual(jobs[0].payload, { preview_id: ID });
  assert.equal(jobs[0].tenant_id, OURS, "on the sender's workspace");
});

test("asked for one that is ready schedules nothing; with the switch off nothing is made", async () => {
  const ready = asking("ready");
  assert.equal((await askPreview(ready.db, { tenantId: OURS, leadId: LEAD, by: null })).ok, true);
  assert.deepEqual(ready.tables.jobs, []);
  process.env.LEAD_PREVIEWS = "";
  const off = asking();
  const refused = await askPreview(off.db, { tenantId: OURS, leadId: LEAD, by: null });
  assert.equal(refused.ok, false);
  assert.deepEqual(off.asked, []);
});
