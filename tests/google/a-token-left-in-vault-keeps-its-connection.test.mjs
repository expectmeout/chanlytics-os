/**
 * A disconnect that could not take the token out of Vault stops there (apps/edge/lib/google/profile-connection.ts). The
 * drop's answer went unread, so with Vault down the owner was told the profile was gone, the row that points at the token
 * was deleted, and the token stayed in Vault with nothing left to find it by; when the revoke had failed too, it was still
 * a live grant. Run over a database in memory, with Vault as each case has it and no call that reaches Google: a Vault that
 * cannot be read has no token to hand back, and neither does one holding none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { disconnectProfile } = await import("../../apps/edge/lib/google/profile-connection.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const world = () => ({
  google_connections: [rows.googleConnection({ tenant_id: T })],
  google_reviews: [rows.googleReview({ tenant_id: T, origin: "profile", review_id: "g-1" })],
  notifications: [],
  events: [],
});
const vaultDown = {
  get_google_credentials: () => {
    throw new Error("vault unavailable");
  },
  drop_google_credentials: () => {
    throw new Error("vault unavailable");
  },
};

test("a token Vault would not drop stops the disconnect: it throws, and the row that points at it, the reviews and the ledger stay as they were", async () => {
  const tables = world();
  const before = structuredClone(tables);
  await assert.rejects(disconnectProfile(fakeDb(tables, {}, vaultDown), T), /vault unavailable/);
  assert.deepEqual(
    tables,
    before,
    "REGRESSION: the row went and the answer said ok, with the token still in Vault and nothing pointing at it",
  );
});

test("Vault back, the disconnect a person tries again finishes: the token dropped, the row, the reviews and the ledger's line", async () => {
  const tables = world();
  await assert.rejects(disconnectProfile(fakeDb(tables, {}, vaultDown), T));
  const drops = [];
  const db = fakeDb(
    tables,
    {},
    {
      get_google_credentials: () => null,
      drop_google_credentials: ({ p_tenant_id }) => {
        drops.push(p_tenant_id);
        return true;
      },
    },
  );
  assert.deepEqual(await disconnectProfile(db, T), { ok: true, removed: true, revoked: false });
  assert.deepEqual(drops, [T]);
  assert.deepEqual([tables.google_connections, tables.google_reviews], [[], []]);
  assert.deepEqual(
    tables.events.map((e) => e.kind),
    ["google.disconnected"],
  );
});
