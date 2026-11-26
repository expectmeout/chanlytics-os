/**
 * The ad account's card as its server read answers it (GET ads/account, server/readers/ads/ad-account.ts), run on the
 * dashboard's own code over a database in memory, with the edge's word answered where the edge would be. Settled on
 * 20 November 2026: the card counts only what Chanlytics can read, so it can always say it is ready.
 *
 * What must hold. Three checks, each one Chanlytics reads from what is kept of the account: active, a payment method,
 * the Page. The Page's link to the number AI answers is no check: Meta shares a Page's WhatsApp numbers only with an
 * app holding its Page Public Content or Metadata Access, so the read says what Chanlytics can know of it and no more.
 * AI's own number named on the Page says it is linked; AI answering no number says so; anything else is unsaid.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { adAccount } = await import(at("apps/dashboard/src/server/readers/ads/ad-account.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AI_NUMBER = "+15550100142";
const NOW = new Date("2026-11-20T15:00:00Z");

const real = globalThis.fetch;
beforeEach(() => {
  readerCache.clear();
  // The edge offers Ads in every workspace here: what is under test is the card, not the switch.
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        ready: true,
        on: true,
        writes: "sandbox",
        app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
});
after(() => {
  globalThis.fetch = real;
});

let seat = 0;
/** A workspace of its own (the edge's word is kept by workspace a while), with its account and AI's number. */
function seated({ standing, config, aiNumber = AI_NUMBER }) {
  seat += 1;
  const tenantId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seat).padStart(12, "0")}`;
  const db = fakeDb({
    memberships: [{ user_id: USER, tenant_id: tenantId, role: "owner", created_at: "2026-01-01T00:00:00Z" }],
    ad_accounts: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        tenant_id: tenantId,
        platform: "meta",
        external_id: "1000000000000001",
        name: "Harbor ads",
        currency: "USD",
        timezone: "America/New_York",
        status: "connected",
        standing,
        config: { scopes: ["ads_read", "ads_management"], ...config },
        connected_at: "2026-11-18T10:00:00Z",
        disconnected_at: null,
        revoked_at: null,
        read_at: "2026-11-20T14:00:00Z",
        read_error: null,
      },
    ],
    tenant_channels: aiNumber
      ? [
          {
            tenant_id: tenantId,
            kind: "whatsapp",
            number_e164: aiNumber,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]
      : [],
  });
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return readerContext(ctx, { tenantId, role: "owner" }, NOW);
}

const cardOf = async (seatedRc) => (await adAccount.read(seatedRc)).data.meta;

test("a ready account counts three checks, all met, and its WhatsApp link is unsaid where Meta names no number", async () => {
  const card = await cardOf(
    seated({ standing: { account: "active", funding: "ok" }, config: { page_id: "100200300400500" } }),
  );
  assert.deepEqual(card.checks, [
    { id: "account-active", ok: true },
    { id: "payment", ok: true },
    { id: "page-linked", ok: true },
  ]);
  assert.equal(card.whatsapp_link, "unsaid");
});

test("the link is AI's number only where Meta named that number, and none where AI answers no number", async () => {
  const page = { page_id: "100200300400500" };
  const standing = { account: "active", funding: "ok" };
  const named = await cardOf(seated({ standing, config: { ...page, page_whatsapp: "15550100142" } }));
  assert.equal(named.whatsapp_link, "ai_number");
  // Another number named says nothing of AI's, which may be linked beside it (a Page holds up to fifty).
  const other = await cardOf(seated({ standing, config: { ...page, page_whatsapp: "15550109999" } }));
  assert.equal(other.whatsapp_link, "unsaid");
  const none = await cardOf(seated({ standing, config: page, aiNumber: null }));
  assert.equal(none.whatsapp_link, "no_number");
  // AI answering no number is no check of the card's: the three are met all the same.
  assert.ok(none.checks.every((check) => check.ok === true));
});

test("what Meta has not said is not known, and a check not met is said as not met", async () => {
  const unread = await cardOf(seated({ standing: {}, config: { page_id: "100200300400500" } }));
  assert.deepEqual(
    unread.checks.map((check) => check.ok),
    [null, null, true],
  );
  const unpaid = await cardOf(seated({ standing: { account: "active", funding: "none" }, config: {} }));
  assert.deepEqual(
    unpaid.checks.map((check) => check.ok),
    [true, false, false],
  );
});
