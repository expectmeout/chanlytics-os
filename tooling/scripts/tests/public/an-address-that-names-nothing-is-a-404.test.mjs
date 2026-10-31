/**
 * A public page's address that names no page answers 404, decided in the proxy before the page renders.
 *
 * Under Cache Components a page's shell goes out with its 200 before the page's own notFound() runs, so
 * `/yes/no-such-workspace-here` answered 200 with the Not found page in it, and `/b/<slug>` for a workspace with no
 * business on record read as a page that publishes (the nightly's consent spec, red from 13 Oct 2026; the closed-loop
 * audit of 17 Oct, D). The proxy now asks the pages' own readers first (src/server/public/public-page-gate.ts) and
 * rewrites an address that names nothing to a path no route answers, which Next draws as app/not-found.tsx with a 404.
 *
 * The real proxy runs over a database in memory, as the readers' own tests run them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://gate-test.supabase.example";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-only";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const { proxy } = await importSrc("apps/dashboard/proxy.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/service-db.ts");
const { publicPageNamesNothing } = await importSrc("apps/dashboard/src/server/public/public-page-gate.ts");

const APP = "https://app.example.com";
const T = "aaaaaaaa-0000-4000-8000-000000000611";
const BARE = "aaaaaaaa-0000-4000-8000-000000000612";

/** Harbor published both pages (a business on record, a number customers text); Bare has no business on record. */
function world(faults = {}) {
  setServiceClient(
    fakeDb(
      {
        tenants: [
          { id: T, name: "Harbor Moving", slug: "harbor", status: "active", left_empty_at: null },
          { id: BARE, name: "Bare Studio", slug: "bare", status: "active", left_empty_at: null },
        ],
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
        tenant_config: [
          { tenant_id: T, config: {} },
          { tenant_id: BARE, config: {} },
        ],
        tenant_channels: [{ tenant_id: T, kind: "sms", status: "active", number_e164: "+13055550100" }],
        // A lead's own receptionist (decision 0079): one open to try, and one whose thirty days are up.
        lead_previews: [
          { id: "p-open", tenant_id: T, lead_id: "l1", token: "OpenPreviewOpenPreview", state: "ready" },
          { id: "p-ended", tenant_id: T, lead_id: "l2", token: "EndedPreviewEndedPrevi", state: "ended" },
        ],
      },
      faults,
    ),
  );
}

const ask = (path) => proxy(new NextRequest(new URL(path, APP)));
/** Where the proxy sent the address: the page itself, or the path no route answers. */
const outcomeOf = (res) =>
  res.headers.get("x-middleware-next") === "1"
    ? "page"
    : new URL(res.headers.get("x-middleware-rewrite") ?? "about:blank").pathname === "/_none"
      ? "not found"
      : `${res.status}`;

test("REGRESSION: an unknown workspace's opt-in page, form and desk sign are the not-found page, before anything is drawn", async (t) => {
  t.after(() => setServiceClient(null));
  world();
  for (const path of ["/yes/no-such-workspace-here", "/yes/no-such-workspace-here/sign", "/yes/no-such/form"]) {
    assert.equal(outcomeOf(await ask(path)), "not found", path);
  }
  // A slug no workspace could be minted with is the same page: refused before a read.
  for (const path of ["/yes/..%2F..%2Fetc", "/yes/A_B_C", `/yes/${"x".repeat(80)}`, "/yes/%E0%A4%A"]) {
    assert.equal(outcomeOf(await ask(path)), "not found", path);
  }
  // The rewrite carries the page's policy, as every answer of the proxy does.
  assert.ok((await ask("/yes/no-such-workspace-here")).headers.get("content-security-policy") ?? true);
});

test("a workspace's own pages pass to the page, which draws them", async (t) => {
  t.after(() => setServiceClient(null));
  world();
  for (const path of ["/yes/harbor", "/yes/harbor/form", "/yes/harbor/sign", "/b/harbor", "/b/harbor/terms"]) {
    assert.equal(outcomeOf(await ask(path)), "page", path);
  }
  // The slug is read as the page reads it: in any case, and with a trailing slash.
  assert.equal(outcomeOf(await ask("/yes/Harbor/")), "page");
});

test("a lead's own receptionist: a token that names nothing is the not-found page; one named, ended or not, is its page", async (t) => {
  t.after(() => setServiceClient(null));
  world();
  assert.equal(outcomeOf(await ask("/preview/OpenPreviewOpenPreview")), "page");
  assert.equal(outcomeOf(await ask("/preview/EndedPreviewEndedPrevi")), "page", "an ended one says it ended");
  // Make it mine's page (L4), signed in or out: its own page sends one it cannot make theirs back to the preview's.
  assert.equal(outcomeOf(await ask("/preview/OpenPreviewOpenPreview/mine")), "page");
  assert.equal(outcomeOf(await ask("/preview/EndedPreviewEndedPrevi/mine")), "page");
  for (const path of [
    "/preview/NoSuchPreviewNoSuchPre",
    "/preview/NoSuchPreviewNoSuchPre/mine",
    "/preview/short",
    "/preview/..%2F..%2Fetc",
    "/preview/%E0%A4%A",
  ]) {
    assert.equal(outcomeOf(await ask(path)), "not found", path);
  }
});

test("REGRESSION: a business page with no business on record is the not-found page, so a carrier's check reads it as none", async (t) => {
  t.after(() => setServiceClient(null));
  world();
  assert.equal(outcomeOf(await ask("/b/bare")), "not found", "a page that identifies nobody publishes nothing");
  assert.equal(outcomeOf(await ask("/b/bare/terms")), "not found", "nor do its terms");
  assert.equal(outcomeOf(await ask("/b/no-such-workspace-here")), "not found");
  // Its opt-in page stands: it needs the workspace, not a business record.
  assert.equal(outcomeOf(await ask("/yes/bare")), "page");
});

test("a read that fails is the page's to answer, and an address that is no public page is never read", async (t) => {
  t.after(() => setServiceClient(null));
  world({ "tenants.select": { message: "the database is away" } });
  assert.equal(outcomeOf(await ask("/yes/harbor")), "page", "a failed read is a failed page, never a 404");
  let reads = 0;
  const counted = {
    consent: async () => (reads++, null),
    business: async () => (reads++, null),
  };
  for (const path of ["/login", "/w/acme/people", "/yes/harbor/extra/deep", "/b/harbor/terms/more", "/u/token"]) {
    assert.equal(await publicPageNamesNothing(path, counted), false, path);
  }
  assert.equal(reads, 0, "only a public page's own address is looked up");
});
