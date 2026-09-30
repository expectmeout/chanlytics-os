/**
 * The doors that act on one workspace's call or draft (whisper, stop-call, hand-over, steer) name the workspace and
 * the person, and the edge checks the row is the workspace's before it acts (defect 26: five door tokens named no
 * workspace or person, so a session that could reach one door could speak into, end or hand over any call whose id it
 * had, through the provider's key, which answers for every workspace).
 *
 * Run end to end, both apps in one process: the dashboard's own functions mint the token and send the request, the
 * request is handed to the edge's real door, and the door's provider calls are captured. A fake database holds two
 * workspaces' calls and drafts. The same request sent twice, or with its body changed, is refused by the token's nonce
 * and body hash (apps/edge/lib/admin-auth.ts); another workspace's id is a row that is not there.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { verifyEdgeToken, edgeBodyMatches } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
process.env.EDGE_PROVIDERS = "live";
process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];

const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const live = await importSrc("apps/dashboard/src/server/conversations/live-call.ts");
const control = await importSrc("apps/dashboard/src/server/conversations/thread-control.ts");
const whisper = await importSrc("apps/edge/api/admin/whisper.ts");
const stop = await importSrc("apps/edge/api/admin/stop-call.ts");
const handOver = await importSrc("apps/edge/api/admin/hand-over.ts");
const steer = await importSrc("apps/edge/api/admin/steer.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ME = "11111111-1111-4111-8111-111111111111";
const CALL_A = "call_a1b2c3d4e5f6";
const CALL_B = "call_b1b2c3d4e5f6";
const DRAFT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const DRAFT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const LINE = "+13055550100";

const DOORS = {
  "/api/admin/whisper": whisper,
  "/api/admin/stop-call": stop,
  "/api/admin/hand-over": handOver,
  "/api/admin/steer": steer,
};

function world() {
  return fakeDb({
    calls: [
      { id: "row-a", tenant_id: A, retell_call_id: CALL_A },
      { id: "row-b", tenant_id: B, retell_call_id: CALL_B },
    ],
    conversations: [
      { id: "conv-a", tenant_id: A, contact_id: "person-a", channel: "whatsapp", state: "open" },
      { id: "conv-b", tenant_id: B, contact_id: "person-b", channel: "whatsapp", state: "open" },
    ],
    messages: [
      { id: DRAFT_A, tenant_id: A, conversation_id: "conv-a", sender: "ai", status: "queued", body: "See you at four" },
      { id: DRAFT_B, tenant_id: B, conversation_id: "conv-b", sender: "ai", status: "queued", body: "See you at five" },
    ],
  });
}

/**
 * The wire: a request to an edge door goes to the real door; anything else is the provider's, captured and answered
 * ok. `requests` keeps each edge request (to replay or change it), `provider` each call that reached the provider.
 */
function wire() {
  const requests = [];
  const provider = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const door = DOORS[path];
    if (door) {
      requests.push({ path, init });
      return door.POST(new Request(String(url), init));
    }
    provider.push({ url: String(url), method: init?.method });
    return new Response(init?.method === "POST" && String(url).includes("stop-call") ? null : "{}", {
      status: String(url).includes("stop-call") ? 204 : 200,
    });
  };
  return {
    requests,
    provider,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
const asker = (workspace) => ({ workspace, user: ME });

/** The dashboard's three call functions, by door, each called for the call given. */
const CALLS = {
  "/api/admin/whisper": (call, who) => live.whisperLiveCall(call, { text: "Offer them the 4:30", trigger: false }, who),
  "/api/admin/stop-call": (call, who) => live.stopLiveCall(call, who),
  "/api/admin/hand-over": (call, who) => live.handOverLiveCall(call, LINE, who),
};

after(() => setPg(null));

test("the dashboard's token names the workspace, the person and the body; the edge door opens for the workspace's own call", async () => {
  for (const [path, act] of Object.entries(CALLS)) {
    setPg(world());
    const w = wire();
    try {
      assert.deepEqual(await act(CALL_A, asker(A)), { ok: true }, path);
      assert.equal(w.provider.length, 1, `${path}: one call to the provider, for the call named`);
      const { init } = w.requests[0];
      assert.equal(init.headers["x-diag-key"], undefined, "no key rides beside a token");
      const v = verifyEdgeToken(SECRET, init.headers["x-edge-token"], path);
      assert.equal(v.ok, true);
      assert.deepEqual([v.claims.ws, v.claims.user], [A, ME], `${path}: names both`);
      assert.equal(edgeBodyMatches(v.claims, init.body), true, `${path}: bound to the body it carries`);
    } finally {
      w.restore();
    }
  }
});

test("another workspace's call is not found, on each door, and nothing reaches the provider; nor is a call the database does not know", async () => {
  for (const [path, act] of Object.entries(CALLS)) {
    setPg(world());
    const w = wire();
    try {
      assert.deepEqual(await act(CALL_B, asker(A)), { ok: false, reason: "not_found" }, `${path}: B's call, A's token`);
      assert.deepEqual(
        await act("call_zzzzzzzzzzzz", asker(A)),
        { ok: false, reason: "not_found" },
        `${path}: unknown`,
      );
      assert.equal(w.provider.length, 0, `${path}: the provider was never spoken to`);
      // B's own token still opens B's call: the refusal is about whose it is, not about the call.
      assert.deepEqual(await act(CALL_B, asker(B)), { ok: true }, `${path}: B acts on B's call`);
      assert.equal(w.provider.length, 1);
    } finally {
      w.restore();
    }
  }
});

test("a call that cannot be read is a 503 and never a yes: the door does not guess whose it is", async () => {
  for (const [path, act] of Object.entries(CALLS)) {
    setPg(fakeDb({ calls: [] }, { "calls.select": { message: "connection reset" } }));
    const w = wire();
    try {
      assert.deepEqual(await act(CALL_A, asker(A)), { ok: false, reason: "read_failed" }, path);
      assert.equal(w.provider.length, 0, path);
    } finally {
      w.restore();
    }
  }
});

test("a token opens its door once and for its body only: the same request again is replayed, one with the call changed is not the request that was signed", async () => {
  for (const path of Object.keys(CALLS)) {
    setPg(world());
    const w = wire();
    try {
      assert.deepEqual(await CALLS[path](CALL_A, asker(A)), { ok: true });
      const sent = w.requests[0];
      // The same request, bit for bit, again.
      const again = await DOORS[path].POST(new Request(`https://edge.test${path}`, sent.init));
      assert.deepEqual([again.status, (await again.json()).error], [403, "token_replayed"], `${path}: a replay`);
      // A fresh token for another call, with the body swapped for this one's: the signed body is not this one.
      const other = wire();
      try {
        assert.deepEqual(await CALLS[path](CALL_A, asker(A)), { ok: true });
        const fresh = other.requests[0].init;
        const forged = { ...fresh, body: fresh.body.replace(CALL_A, CALL_B) };
        const before = other.provider.length;
        const res = await DOORS[path].POST(new Request(`https://edge.test${path}`, forged));
        assert.deepEqual([res.status, (await res.json()).error], [403, "token_body"], `${path}: the call id changed`);
        assert.equal(other.provider.length, before, `${path}: nothing was sent for the forged body`);
      } finally {
        other.restore();
      }
    } finally {
      w.restore();
    }
  }
});

test("steer: another workspace's draft is a draft that is not there for the token's workspace, and is left as it was", async () => {
  setPg(world());
  const w = wire();
  try {
    const refused = await control.steerDraft(DRAFT_B, "Say five thirty instead", asker(A));
    assert.deepEqual(refused, { ok: false, reason: "not_found" }, "the answer a made-up id gets: no oracle for ids");
    assert.equal(w.provider.length, 0, "no model was asked about a draft that is not A's");
  } finally {
    w.restore();
  }
});
