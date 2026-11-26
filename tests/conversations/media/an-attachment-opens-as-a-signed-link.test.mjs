/**
 * A message's stored attachment opens as a short-lived signed link, run: GET /api/v1/messages/:id/media through route()
 * with its module's own `run`, over a database in memory and a store that signs what it is asked. A member of the named
 * workspace, an attachment the edge has stored, a path under the workspace's own id, signed for five minutes, and a
 * redirect built by hand (Response.redirect()'s headers are immutable, and the route's wrapper stamps its own). Pinned as
 * the route's, message-media.ts's and reads.ts's text in conversations/media/media.test.mjs until 26 Nov 2026.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const media = await importSrc("apps/dashboard/app/api/v1/messages/[id]/media/route.ts");
beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-1111-4111-8111-cccccccccccc";
const P = "dddddddd-1111-4111-8111-dddddddddddd";
const STORED = {
  storage_path: `${T}/media/${M}.jpg`,
  fetch_state: "stored",
  mime_type: "image/jpeg",
  filename: "cut.jpg",
};

/** A viewer of the workspace, its one message with these media, and the store the service signs with. */
function world(rowMedia) {
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: T, role: "viewer", tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's", status: "active", timezone: "America/New_York" }],
    contacts: [{ id: P, tenant_id: T, display_name: "Dani", wa_profile_name: null, phone_e164: null, email: null }],
    conversations: [{ id: C, tenant_id: T, contact_id: P, state: "open", created_at: "2026-01-01T00:00:00Z" }],
    messages: [
      {
        id: M,
        tenant_id: T,
        conversation_id: C,
        contact_id: P,
        direction: "inbound",
        sender: "customer",
        type: "image",
        channel: "whatsapp",
        body: "like this?",
        media: rowMedia,
        status: "received",
        meta: {},
        created_at: "2026-01-01T10:00:00Z",
        channel_ts: null,
      },
    ],
    decisions: [],
  };
  const signed = [];
  const service = fakeDb(tables);
  service.storage = {
    from: (bucket) => ({
      createSignedUrl: async (path, seconds) => {
        signed.push({ bucket, path, seconds });
        return { data: { signedUrl: `https://storage.example/${path}?t=${seconds}` }, error: null };
      },
    }),
  };
  setServiceClient(service);
  return {
    signed,
    ctx: (params) => ({ supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", aal: "aal2", params }),
  };
}
const ask = (id) => new Request(`http://localhost/api/v1/messages/${id}/media?workspace=${T}`);
const refusalOf = (p) =>
  p.then(
    (r) => assert.fail(`the route answered ${r?.status} where it should have refused`),
    (e) => ({ code: e.code, status: e.status }),
  );

test("a stored attachment of this workspace opens as a five-minute signed link, by a redirect the wrapper can stamp", async () => {
  const w = world(STORED);
  const res = await media.GET.run(ask(M), w.ctx({ id: M }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `https://storage.example/${STORED.storage_path}?t=300`);
  assert.deepEqual(
    w.signed.map((s) => [s.path, s.seconds]),
    [[STORED.storage_path, 300]],
    "signed as this workspace's, for five minutes",
  );
  res.headers.set("x-request-id", "stamped");
  assert.equal(res.headers.get("x-request-id"), "stamped", "not Response.redirect(): its headers are immutable");
});

test("nothing else is signed: an attachment not stored yet, none at all, a path outside the workspace", async () => {
  for (const [why, rowMedia] of [
    ["not stored yet", { ...STORED, fetch_state: "pending" }],
    ["no attachment", null],
    ["a path outside the workspace", { ...STORED, storage_path: `${OTHER}/media/${M}.jpg` }],
    ["a path that climbs out", { ...STORED, storage_path: `${T}/../${OTHER}/x.jpg` }],
  ]) {
    const w = world(rowMedia);
    assert.deepEqual(await refusalOf(media.GET.run(ask(M), w.ctx({ id: M }))), { code: "not_found", status: 404 }, why);
    assert.deepEqual(w.signed, [], `${why}: nothing signed`);
  }
});

test("a member of another workspace, naming theirs, finds no message of this one's", async () => {
  const w = world(STORED);
  const theirs = {
    ...w.ctx({ id: M }),
    supabase: fakeDb({
      memberships: [
        {
          user_id: "u1",
          tenant_id: OTHER,
          role: "viewer",
          tenants: { slug: "other" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      tenants: [{ id: OTHER, slug: "other", name: "Other", status: "active", timezone: "America/New_York" }],
      messages: [{ id: M, tenant_id: T, media: STORED }],
    }),
  };
  const req = new Request(`http://localhost/api/v1/messages/${M}/media?workspace=${OTHER}`);
  assert.deepEqual(await refusalOf(media.GET.run(req, theirs)), { code: "not_found", status: 404 });
  assert.deepEqual(w.signed, []);
});
