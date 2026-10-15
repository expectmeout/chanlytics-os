/**
 * A sole proprietor files as one person, with no tax id, and the street on their record is often their home. The indexed
 * business page (/b/<slug>) printed it under "Address" for anyone to read (the wiring's second audit, X4-5; Ruben, 15
 * October 2026). Now the page says where such a business is by city, state and ZIP, and the carriers hold the street from
 * the filing. The public load asks the database whether the business has a tax id (00439 sole_proprietor_of) and never
 * reads the tax id itself.
 *
 * The real reader (src/server/public/business-page.ts) runs over a database in memory, and the page's own view model says
 * what the page prints.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { businessPageVM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { businessPageFor } = await import(at("apps/dashboard/src/server/public/business-page.ts"));

const T = "aaaaaaaa-0000-4000-8000-000000000439";

/** A workspace that published its page, with the tax id given or not. */
function world(ein) {
  const db = fakeDb({
    tenants: [{ id: T, name: "Harbor Moving", slug: "harbor", status: "active", left_empty_at: null }],
    business_records: [
      {
        tenant_id: T,
        legal_name: "Harbor Moving LLC",
        trade_name: null,
        street: "1 Example Street",
        street_secondary: "Unit 2",
        city: "Miami",
        region: "FL",
        postal_code: "33101",
        country: "US",
        contact_email: "owner@example.com",
        contact_first_name: "Ada",
        contact_last_name: "Lovelace",
        contact_phone: "+13055550199",
        contact_title: "Owner",
        contact_job_position: "CEO",
        website_url: "",
        about: "Moves homes and offices across Miami.",
        industry: "PROFESSIONAL_SERVICES",
        business_type: ein?.trim() ? "Limited Liability Corporation" : "Sole Proprietorship",
        company_type: "private",
        ein,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    tenant_config: [{ tenant_id: T, config: {} }],
    tenant_channels: [{ tenant_id: T, kind: "sms", status: "active", number_e164: "+13055550100" }],
  });
  setServiceClient(db);
  return db;
}

const addressOf = (facts) => businessPageVM(facts).identity.find((f) => f.label === "Address")?.value ?? null;

test("a sole proprietor's page says where by city; a business with a tax id says its street, as before", async (t) => {
  t.after(() => setServiceClient(null));

  world(null);
  const one = await businessPageFor("harbor");
  assert.equal(one.soleProprietor, true);
  assert.equal(addressOf(one), "Miami, FL 33101, US");
  assert.doesNotMatch(
    JSON.stringify(businessPageVM(one)),
    /Example Street|Unit 2/,
    "the street is nowhere on the page",
  );

  world("  ");
  assert.equal((await businessPageFor("harbor")).soleProprietor, true, "a blank tax id is none");

  const db = world("12-3456789");
  const firm = await businessPageFor("harbor");
  assert.equal(firm.soleProprietor, false);
  assert.match(addressOf(firm), /^1 Example Street, Unit 2, Miami, FL 33101, US$/);
  // Asked as a yes or no: the load never selects the tax id itself.
  assert.ok(
    db.seen.some((s) => s.rpc === "sole_proprietor_of" && s.args.p_tenant_id === T),
    "the page asks the database",
  );
  assert.doesNotMatch(JSON.stringify(firm), /12-3456789/, "the tax id never reaches the page's facts");
});
