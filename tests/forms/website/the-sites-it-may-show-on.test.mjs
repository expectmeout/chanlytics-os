/**
 * The sites a form may show on, as its owner keeps them under Share › On your website (00692; the Forms plan, F4), run
 * through the dashboard's own routes over a database in memory. The first site makes the form's website link, the one
 * link whose code is the framed address; each after joins its list, read by the one rule for a website's address; one
 * removed leaves the rest. The sheet says when a request last came from each site, never that it works.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, emailWire, FORM, formWorld } from "../_form-requests.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sheet = await import(at("apps/dashboard/app/api/v1/forms/sheet/route.ts"));
const links = await import(at("apps/dashboard/app/api/v1/forms/links/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { FORM_SITES_MAX } = await import("@chanlytics/contracts");

const wire = emailWire(getEmailWire);
beforeEach(async () => {
  setRateStore(memoryStore());
  await wire.says(true);
});
after(() => {
  setServiceClient(null);
  wire.undo();
});

const U = "11111111-1111-4111-8111-111111111111";

/** The salon's world with one member signed in, in the role named. */
function world(role = "owner") {
  const made = formWorld({
    more: {
      memberships: [
        {
          user_id: U,
          tenant_id: A,
          role,
          tenants: { slug: "luma-salon", name: "Luma Salon", timezone: "America/New_York" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      messages: [],
    },
  });
  setServiceClient(made.db);
  const ctx = { supabase: made.db, userId: U, email: "ada@example.com", params: {} };
  const address = (route, query = "") => `http://localhost/api/v1/${route}?workspace=${A}${query}`;
  return {
    ...made,
    site: (act, site) =>
      links.POST.run(
        new Request(address("forms/links"), { method: "POST", body: JSON.stringify({ act, form_id: FORM, site }) }),
        ctx,
      ),
    sheetOf: () => sheet.GET.run(new Request(address("forms/sheet", `&form=${FORM}`)), ctx),
  };
}

const websiteOf = (w) => w.tables.links.find((link) => Array.isArray(link.sites));

async function refused(p, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.status, status, e.message);
    if (words) assert.match(e.message, words);
    return true;
  });
}

test("the first site makes the form's website link, read as a host without its www.; each after joins its list", async () => {
  const w = world();
  await w.site("site_add", "https://www.Luma-Salon.com/book?x=1");
  const website = websiteOf(w);
  assert.deepEqual(website.sites, ["luma-salon.com"]);
  assert.equal(website.place, "Your website");
  assert.equal(website.printed, false);
  assert.match(website.code, /^[a-hjkmnp-z2-9]{6}$/, "its code is the framed address");
  await w.site("site_add", "luma-salon.com");
  await w.site("site_add", "shop.luma-salon.com");
  assert.deepEqual(websiteOf(w).sites, ["luma-salon.com", "shop.luma-salon.com"], "a site twice is once");
  assert.equal(w.tables.links.filter((link) => Array.isArray(link.sites)).length, 1, "one website a form");
  await w.site("site_remove", "https://luma-salon.com");
  assert.deepEqual(websiteOf(w).sites, ["shop.luma-salon.com"], "one removed leaves the rest");
});

test("what names no site is refused in words, and so is a site past the most a form may show on", async () => {
  const w = world();
  for (const typed of ["not a website", "localhost", "ana@example.com"])
    await refused(w.site("site_add", typed), 400, /isn't a website's address/);
  assert.equal(websiteOf(w), undefined, "and nothing was made");
  for (let n = 1; n <= FORM_SITES_MAX; n++) await w.site("site_add", `site${n}.example`);
  await refused(w.site("site_add", "one-more.example"), 409, /at most/);
  await refused(world().site("site_remove", "luma-salon.com"), 404, /isn't here any more/);
});

test("a viewer may read the website and not change it", async () => {
  const w = world("viewer");
  await refused(w.site("site_add", "luma-salon.com"), 403);
  assert.equal(websiteOf(w), undefined);
});

test("the sheet lists the website apart from the places, each site saying when a request last came from it", async () => {
  const w = world();
  await w.site("site_add", "luma-salon.com");
  await w.site("site_add", "luma-spa.example");
  const website = websiteOf(w);
  w.tables.form_entries.push({
    id: "e-web",
    tenant_id: A,
    contact_id: "c1",
    form: "request",
    form_id: FORM,
    version_id: "11111111-1111-4111-8111-111111111111",
    link_id: website.id,
    answers: {},
    words: "0".repeat(64),
    owed: [],
    effects: {},
    state: "accepted",
    test: false,
    held_why: null,
    source: { code: website.code, page: `/f/${website.code}`, site: "luma-salon.com" },
    created_at: "2026-11-22T10:00:00Z",
  });
  const data = await w.sheetOf();
  const row = data.links.find((link) => link.sites !== null);
  assert.deepEqual(row.sites, [
    { host: "luma-salon.com", last_entry_at: "2026-11-22T10:00:00Z" },
    { host: "luma-spa.example", last_entry_at: null },
  ]);
  assert.ok(
    data.links.filter((link) => link.id !== website.id).every((link) => link.sites === null),
    "every other place has no sites",
  );
});
