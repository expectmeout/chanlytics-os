/**
 * A workspace its last member left is ended (00262): paused, its plan cancelled, nobody to answer its customers. Its public
 * pages stayed up all the same: the sign-up page and its QR asked customers for a yes nobody would answer, and the indexed
 * business page kept the legal name, the street, the email and "answers its customers" (the wiring's second audit, X4-2).
 * Now both readers find nothing for it, so every page of it is Not found and unindexed, and a workspace that is only paused
 * (billing, which is reversible, and whose URLs the carriers re-vet) keeps its pages.
 *
 * The real readers (src/server/public/consent-page.ts, business-page.ts) run over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { consentPageFor } = await import(at("apps/dashboard/src/server/public/consent-page.ts"));
const { businessPageFor } = await import(at("apps/dashboard/src/server/public/business-page.ts"));

const T = "aaaaaaaa-0000-4000-8000-000000000419";

/** A workspace that published both pages: a business on record, a number customers text. */
function world(tenant) {
  setServiceClient(
    fakeDb({
      tenants: [{ id: T, name: "Harbor Moving", slug: "harbor", status: "active", left_empty_at: null, ...tenant }],
      business_records: [
        {
          tenant_id: T,
          legal_name: "Harbor Moving LLC",
          trade_name: null,
          street: "1 Example Street",
          city: "Miami",
          region: "FL",
          postal_code: "33101",
          country: "US",
          email: "owner@example.com",
          website: null,
        },
      ],
      tenant_config: [{ tenant_id: T, config: {} }],
      tenant_channels: [{ tenant_id: T, kind: "sms", status: "active", number_e164: "+13055550100" }],
    }),
  );
}

test("REGRESSION: an ended workspace's sign-up page and business page are Not found; a paused one keeps both", async (t) => {
  t.after(() => setServiceClient(null));

  world({ status: "paused", left_empty_at: "2026-10-01T00:00:00Z" });
  assert.equal(await consentPageFor("harbor"), null, "no sign-up page asks for a yes nobody will answer");
  world({ slug: "ended-harbor", status: "paused", left_empty_at: "2026-10-01T00:00:00Z" });
  assert.equal(await businessPageFor("ended-harbor"), null, "no business page publishes who ran it");

  // Paused by billing, and nobody left: the pages stand for the carriers' re-vet, as before.
  world({ slug: "paused-harbor", status: "paused" });
  assert.ok(await consentPageFor("paused-harbor"));
  assert.ok(await businessPageFor("paused-harbor"));
});
