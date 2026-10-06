/**
 * POST /api/admin/whatsapp/standing, run: an owner asks what Meta holds about the workspace's number now. Over a database in
 * memory, a vault that answers the number's own credentials, and a captured wire to Meta's Graph API that answers what the
 * test writes (the reading itself, and the keeping and the telling, are held in number-standing.test.mjs; this holds the door
 * around them).
 *   - the knock: a token for another door, a forgery and no credential are 403; a body naming another workspace than the
 *     token is refused; no database is a 503; none of it reaches Meta;
 *   - the workspace's number: none (or a disabled one) is 409 no_channel, a channel that cannot be read 503, no credentials
 *     (or a vault that did not answer) 503 no_token; another workspace's number is never read;
 *   - Meta not answering is 502 meta_failed and keeps nothing; an answer is kept whole, told to the owner when the number is
 *     BLOCKED and new, and the door answers { ok, kept, can_send } and nothing of Meta's words;
 *   - the token Meta is asked with is the workspace's own, and no answer or log line carries it.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers, signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { GRAPH_VERSION } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const door = await import(at("apps/edge/api/admin/whatsapp/standing.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const AUD = "/api/admin/whatsapp/standing";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OWNER_MAIL = "owner@harbor.test";
const PHONE = "1234567890123";
const WABA = "9876543210987";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/* ------------------------------- the knock -------------------------------- */

const tokenFor = (raw, o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: OWNER,
    body: raw,
  });
const knock = (body = {}, headers) => {
  const raw = JSON.stringify(body);
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...(headers ?? { "x-edge-token": tokenFor(raw) }), "content-type": "application/json" },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];
/** The door's log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

const channel = (over = {}) => ({
  id: "wa-a",
  tenant_id: A,
  kind: "whatsapp",
  external_id: PHONE,
  number_e164: "+13055550142",
  waba_id: WABA,
  status: "active",
  credentials_ref: "wa-creds-wa-a",
  config: {},
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The database the door will find: the workspace's number, its vault, its owner's mailbox, and the keeping door answering `answers` in turn. */
function use({ channels = [channel()], vault, faults = {}, answers = [] } = {}) {
  const tables = {
    tenant_channels: channels,
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER_MAIL] } } }],
  };
  const kept = [];
  const db = fakeDb(tables, faults, {
    get_channel_credentials: vault ?? (() => ({ access_token: TOKEN, phone_id: PHONE })),
    channel_keep_standing: (args) => {
      kept.push(args);
      return answers.shift() ?? "first";
    },
  });
  setPg(db);
  return { tables, db, kept };
}

/** Meta's Graph, as far as this door can see it, and the mail transport: every request kept. */
function wire(script) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    seen.push({ url: u, init });
    if (u.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
    const a = script(u.replace(GRAPH, ""));
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    graph: () => seen.filter((r) => r.url.startsWith(GRAPH)),
    mail: () => seen.filter((r) => r.url.startsWith("https://api.resend.com/")).map((r) => JSON.parse(r.init.body)),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
const BLOCKED = {
  body: {
    id: PHONE,
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: "BLOCKED",
      entities: [
        {
          entity_type: "WABA",
          id: WABA,
          can_send_message: "BLOCKED",
          errors: [
            {
              error_code: 141006,
              error_description: "A payment method is required to send messages",
              possible_solution: "Add a payment method in WhatsApp Manager",
            },
          ],
        },
      ],
    },
  },
};
const VERIFIED = {
  body: {
    id: WABA,
    business_verification_status: "not_verified",
    whatsapp_business_manager_messaging_limit: "TIER_250",
  },
};
/** The account has no payment method on file, and says which business owns it. */
const FUNDING = { body: { id: WABA } };
const OWNED = { body: { id: WABA, owner_business_info: { id: "410540000000001" } } };
const metaSays =
  (phone, waba = VERIFIED, funding = FUNDING, owner = OWNED) =>
  (p) =>
    p.startsWith(`/${PHONE}?`)
      ? phone
      : p.startsWith(`/${WABA}?fields=primary_funding_id`)
        ? funding
        : p.startsWith(`/${WABA}?fields=owner_business_info`)
          ? owner
          : p.startsWith(`/${WABA}?`)
            ? waba
            : { status: 404 };
const unreachable = () =>
  wire(() => {
    throw new Error("a refused knock must not reach Meta");
  });

test("the knock: a token for another door, a forgery and no credential are 403; a body naming another workspace than the token is refused; no database is a 503 -- and none of it reaches Meta or the database", async () => {
  const { db } = use();
  const net = unreachable();
  try {
    assert.deepEqual(
      await answer(await knock({}, { "x-edge-token": tokenFor("{}", { aud: "/api/admin/whatsapp/connect" }) })),
      [403, { ok: false, error: "token_audience" }],
    );
    assert.deepEqual(await answer(await knock({}, { "x-edge-token": tokenFor("{}", { secret: "not-the-secret" }) })), [
      403,
      { ok: false, error: "token_signature" },
    ]);
    assert.deepEqual(await answer(await knock({}, {})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ tenant_id: B })), [403, { ok: false, error: "workspace_mismatch" }]);
    assert.equal(db.seen.length, 0);
    setPg(null);
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
});

test("the workspace's number: none, or a disabled one, is a 409; a read that fails is a 503; no credentials, or a vault that did not answer, is a 503 -- and Meta is asked of none of them", async () => {
  const net = unreachable();
  try {
    for (const channels of [[], [channel({ status: "disabled" })], [channel({ tenant_id: B, id: "wa-b" })]]) {
      use({ channels });
      assert.deepEqual(
        await answer(await knock({})),
        [409, { ok: false, error: "no_channel" }],
        JSON.stringify(channels).slice(0, 60),
      );
    }
    use({ faults: { "tenant_channels.select": { message: "connection reset" } } });
    const read = await answer(await knock({}));
    assert.deepEqual([read[0], read[1].error], [503, "channel_read_failed"]);
    use({ vault: () => ({}) });
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_token" }]);
    use({
      vault: () => {
        throw new Error("the vault did not answer");
      },
    });
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_token" }]);
  } finally {
    net.restore();
  }
});

test("Meta not answering is a 502 and keeps nothing; the owner's token is the number's own and nothing of Meta's words comes back", async () => {
  const { kept, tables } = use();
  const w = wire(
    metaSays({ status: 400, body: { error: { message: "Object with ID '1234567890123' does not exist", code: 100 } } }),
  );
  const log = quiet();
  let res;
  try {
    res = await answer(await knock({}));
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual(res, [502, { ok: false, error: "meta_failed" }]);
  assert.deepEqual([kept, tables.notifications], [[], []]);
  assert.deepEqual(
    w.graph().map((r) => r.init.headers.authorization),
    Array(4).fill(`Bearer ${TOKEN}`),
    "the phone and the account's three reads, each with the business's own token, never the environment's",
  );
  assert.ok(
    !log.lines.some((l) => l.includes(TOKEN) || l.includes("1234567890123") || l.includes("3055550142")),
    "no token, no number in what the door said",
  );
});

test("an answer is kept whole and told to the owner once: BLOCKED and new is a notice on the bell and in the owner's mail; the same again is not; the door answers what was kept and the word, never Meta's words", async () => {
  const { kept, tables } = use({ answers: ["first", "same", "gone"] });
  const w = wire(metaSays(BLOCKED));
  const log = quiet();
  let first, same, gone;
  try {
    first = await answer(await knock({}));
    same = await answer(await knock({}));
    gone = await answer(await knock({}));
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual(first, [200, { ok: true, kept: "first", can_send: "BLOCKED" }]);
  assert.deepEqual(same, [200, { ok: true, kept: "same", can_send: "BLOCKED" }]);
  assert.deepEqual(gone, [409, { ok: false, error: "no_channel" }], "a channel switched off while the read was out");
  assert.deepEqual(
    w
      .graph()
      .slice(0, 4)
      .map((r) => r.url.replace(GRAPH, "")),
    [
      `/${PHONE}?fields=health_status,name_status,verified_name`,
      `/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`,
      `/${WABA}?fields=primary_funding_id`,
      `/${WABA}?fields=owner_business_info{id}`,
    ],
    "the number as Meta knows it and the account it belongs to (its verification, its funding and its owner), both from the channel's row",
  );
  const held = (k) => [
    k.p_tenant_id,
    k.p_channel_id,
    k.p_standing.can_send,
    k.p_standing.verification,
    k.p_standing.has_payment_method,
    k.p_standing.owner_business_id,
  ];
  assert.deepEqual(kept.map(held), [
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
  ]);
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
    [[A, "number", "admin/integrations", "WhatsApp can't send from your number"]],
    "told once: the second read was the same word, the third was gone",
  );
  assert.deepEqual(
    w.mail().map((m) => [m.to, m.subject]),
    [[[OWNER_MAIL], "WhatsApp can't send from your number"]],
  );
  for (const res of [first, same, gone])
    assert.ok(!JSON.stringify(res).includes("payment"), "nothing of what Meta said");
  assert.ok(!log.lines.some((l) => l.includes(TOKEN)), "and no token in a line");
});

test("another workspace's number is never read: the door acts on the token's workspace and its own channel", async () => {
  const { kept } = use({
    channels: [
      channel(),
      channel({ id: "wa-b", tenant_id: B, external_id: "5555555555555", waba_id: "6666666666666" }),
    ],
  });
  const w = wire(metaSays(BLOCKED));
  try {
    await answer(await knock({}));
  } finally {
    w.restore();
  }
  assert.ok(
    w.graph().every((r) => !r.url.includes("5555555555555") && !r.url.includes("6666666666666")),
    "B's ids are not on the wire",
  );
  assert.deepEqual(
    kept.map((k) => k.p_channel_id),
    ["wa-a"],
  );
});
