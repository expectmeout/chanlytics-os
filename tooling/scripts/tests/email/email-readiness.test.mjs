/**
 * Whether a campaign's email can be sent, asked of the edge (review item 29, 3 Oct 2026). The edge decides: a mail
 * domain AND the provider's key (apps/edge/lib/email/email.ts emailCanSend), and the dashboard may never hold a key, so
 * `channelsReadyOf` used to count email ready on the domain alone and offer what the run then held every person for.
 *
 * Executed here with a stubbed fetch, through the real dashboard server: the call it makes (a token for the email door
 * that names no workspace and no person), the answer kept five minutes, a "no" and a failure kept thirty seconds and not
 * five minutes, a probe that failed read as "could not be checked" and never as ready, and what the page's readiness
 * says in each case. The edge's side of it is email-wire-door.test.mjs.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { edgeBodyMatches, verifyEdgeToken } from "@chanlytics/channels";
import { CHANNEL_WORDS, OFFERS_BY_EMAIL_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL", "EMAIL_DOMAIN"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { emailWire } = await importSrc("apps/dashboard/src/server/connections/email-readiness.ts");
/** Whether the edge says the wire can send a campaign at all: the first half of its one answer. */
const emailWireReady = async (o) => (await emailWire(o)).ready;
const { channelsReadyOf } = await importSrc("apps/dashboard/src/server/campaigns/channels-ready.ts");
const { READY_TTL_MS } = await importSrc("apps/dashboard/src/server/edge.ts");

const MIN = 60_000;
const real = globalThis.fetch;
after(() => (globalThis.fetch = real));

/** What the edge answers next, as a function of the call: a value is a JSON answer with its status, an Error a network that failed. */
let edge;
let calls;
beforeEach(() => {
  calls = [];
  edge = () => ({ status: 200, body: { ok: true, ready: true } });
  globalThis.fetch = async (url, init) => {
    calls.push({ path: new URL(String(url)).pathname, init });
    const a = edge(calls.length);
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  };
});

/** A clock for each scenario, an hour past the last: nothing one kept is fresh in the next. */
let epoch = 0;
const scenario = () => (epoch += 60 * MIN);

test("it asks the edge's email door, as a call about no workspace and no person, and binds the body it sends", async () => {
  assert.equal(await emailWireReady({ now: scenario() }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/admin/email/wire");
  const v = verifyEdgeToken(SECRET, calls[0].init.headers["x-edge-token"], "/api/admin/email/wire");
  assert.equal(v.ok, true, "a token minted for this door");
  assert.equal(v.claims.ws, null, "about no workspace");
  assert.equal(v.claims.user, null, "and no person");
  assert.equal(edgeBodyMatches(v.claims, calls[0].init.body), true);
  assert.deepEqual(JSON.parse(calls[0].init.body), { op: "status" });
  assert.equal(calls[0].init.headers["x-diag-key"], undefined, "no key beside the token");
});

test("a yes is kept five minutes per lambda and asked again after; a no is kept thirty seconds, so a key set a minute ago does not hide email for five", async () => {
  const t = scenario();
  // A yes is a wire that can send AND offers that can go: an edge that says no to offers is a no (kept briefly, below).
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: true } });
  assert.equal(await emailWireReady({ now: t }), true);
  assert.equal(await emailWireReady({ now: t + READY_TTL_MS - 1 }), true, "inside the five minutes: kept");
  assert.equal(calls.length, 1);
  assert.equal(await emailWireReady({ now: t + READY_TTL_MS }), true, "at five minutes: asked again");
  assert.equal(calls.length, 2);

  const u = scenario();
  edge = () => ({ status: 200, body: { ok: true, ready: false } });
  assert.equal(await emailWireReady({ now: u }), false);
  assert.equal(await emailWireReady({ now: u + 29_999 }), false, "a no inside the thirty seconds: kept");
  assert.equal(calls.length, 3);
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: true } });
  assert.equal(
    await emailWireReady({ now: u + 30_001 }),
    true,
    "the operator set the key: read at once after the half minute",
  );
  assert.equal(calls.length, 4);
  // A caller that must not read a stale answer asks now, and the answer it gets is the one kept.
  edge = () => ({ status: 200, body: { ok: true, ready: false } });
  assert.equal(await emailWireReady({ now: u + 31_000, fresh: true }), false);
  assert.equal(await emailWireReady({ now: u + 32_000 }), false);
  assert.equal(calls.length, 5);
});

test("a probe that failed is not ready and not guessed ready: null, asked again soon, never kept five minutes", async () => {
  for (const failure of [
    () => new Error("connect ECONNREFUSED"),
    () => ({ status: 503, body: { ok: false, error: "no_database" } }),
    () => ({ status: 403, body: { ok: false, error: "token_expired" } }),
    () => ({ status: 200, body: { ok: true } }),
    () => ({ status: 200, body: { ok: true, ready: "yes" } }),
    () => ({ status: 200, body: { ok: false, ready: true } }),
    () => ({ status: 200, body: null }),
  ]) {
    const t = scenario();
    edge = failure;
    assert.equal(await emailWireReady({ now: t }), null, String(failure));
    const asked = calls.length;
    assert.equal(await emailWireReady({ now: t + 10_000 }), null);
    assert.equal(calls.length, asked, "a failure is not asked again inside the half minute");
    edge = () => ({ status: 200, body: { ok: true, ready: true } });
    assert.equal(
      await emailWireReady({ now: t + 31_000 }),
      true,
      "and the edge is asked again after it: not five minutes of a blip",
    );
  }
});

test("a deployment that holds no credential for the edge cannot ask it: could not be checked, and no request leaves", async () => {
  delete process.env.EDGE_CALL_SECRET;
  try {
    assert.equal(await emailWireReady({ now: scenario() }), null);
    assert.equal(calls.length, 0);
  } finally {
    process.env.EDGE_CALL_SECRET = SECRET;
  }
});

/* ---- what the page's readiness says ---- */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADDRESS = "12 Main St, Springfield";
const config = (address) => ({
  brain: {
    business_name: "Marisa's",
    system_prompt: "Answer as the front desk of Marisa's: brief and warm.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { ...(address ? { address } : {}) },
  },
});
const world = () =>
  fakeDb({
    tenant_channels: [],
    lines: [
      {
        tenant_id: A,
        sms_state: "active",
        reg_mock: false,
        messaging_service_sid: "MG1",
        voice_state: "ok",
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
    mailboxes: [{ tenant_id: A, local_part: "hello", offers_paused_at: null, offers_paused_reason: null }],
    // The Business record's postal address, which every offer's foot names: the config as the workspace keeps it.
    tenant_config: [{ tenant_id: A, config: config(ADDRESS) }],
  });
/** The edge answers `answer` from now on, and the page's readiness reads it, as it would a minute after. */
const edgeSays = async (answer) => {
  edge = answer;
  await emailWireReady({ fresh: true });
};
const ready = (supabase) => channelsReadyOf({ supabase }, A, { fresh: false });

test("the page counts email ready only when the edge says it can send AND the workspace has a mailbox; its answer, not the domain's", async () => {
  await edgeSays(() => ({ status: 200, body: { ok: true, ready: true } }));
  const db = world();
  const yes = await ready(db);
  // An edge that says nothing of offers (one deployed before them) is one with no campaigns domain: closed, with the reason.
  assert.deepEqual(yes.email, {
    ready: true,
    why: null,
    offers: { ok: false, why: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain, paused: null },
  });
  assert.deepEqual(
    db.seen.map((q) => q.table),
    ["tenant_channels", "lines", "mailboxes"],
    "the mailbox is read where the wire can send; the configuration only where offers could go (the deployment's reason comes first)",
  );

  await edgeSays(() => ({ status: 200, body: { ok: true, ready: false } }));
  const no = await ready(world());
  assert.deepEqual(
    { ready: no.email.ready, why: no.email.why },
    { ready: false, why: CHANNEL_WORDS.noEmailDomain },
    "the edge holds no key: not switched on here",
  );

  await edgeSays(() => ({ status: 200, body: { ok: true, ready: true } }));
  const noMailbox = fakeDb({ tenant_channels: [], lines: [], mailboxes: [], tenant_config: [] });
  const none = (await ready(noMailbox)).email;
  assert.deepEqual({ ready: none.ready, why: none.why }, { ready: false, why: CHANNEL_WORDS.noMailbox });
});

test("an edge that could not be asked leaves email 'This could not be checked just now.', and the page does not read the mailbox for it", async () => {
  await edgeSays(() => new Error("connect ECONNREFUSED"));
  const db = world();
  const r = await ready(db);
  assert.deepEqual(
    { ready: r.email.ready, why: r.email.why },
    { ready: false, why: "This could not be checked just now." },
  );
  assert.equal(r.email.why, CHANNEL_WORDS.unchecked);
  assert.equal(r.email.offers.why, CHANNEL_WORDS.unchecked, "offers by email could not be checked either: no guess");
  assert.deepEqual(
    db.seen.map((q) => q.table),
    ["tenant_channels", "lines"],
    "no mailbox is read where nothing could be offered",
  );
  // WhatsApp and text are judged by their own rows, as they were: the probe is email's alone.
  assert.equal(r.sms.ready, true);
});

/* ---- offers by email ---- */

test("the edge's answer about offers is read with the other, and kept as long: true, false, or null where the provider could not be asked; an older edge says none", async () => {
  const t = scenario();
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: true } });
  assert.deepEqual(await emailWire({ now: t, fresh: true }), { ready: true, offers: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(
    await emailWire({ now: t + READY_TTL_MS - 1 }),
    { ready: true, offers: true },
    "kept the five minutes",
  );
  assert.equal(calls.length, 1);
  const u = scenario();
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: null } });
  assert.deepEqual(
    await emailWire({ now: u, fresh: true }),
    { ready: true, offers: null },
    "the provider could not be asked: no answer",
  );
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: true } });
  assert.deepEqual(
    await emailWire({ now: u + 31_000 }),
    { ready: true, offers: true },
    "asked again soon, not kept five minutes",
  );
  const v = scenario();
  edge = () => ({ status: 200, body: { ok: true, ready: true } });
  assert.deepEqual(
    await emailWire({ now: v, fresh: true }),
    { ready: true, offers: false },
    "an edge deployed before offers: they are not on",
  );
  edge = () => ({ status: 200, body: { ok: true, ready: false, offers: "yes" } });
  assert.deepEqual(
    await emailWire({ now: v + 31_000, fresh: true }),
    { ready: false, offers: false },
    "anything but true or null is a no",
  );
});

test("only a yes to everything is kept five minutes: a no to offers, whatever the wire says, is kept thirty seconds, so a campaigns domain published a minute ago does not hide offers for five", async () => {
  const t = scenario();
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: false } });
  assert.deepEqual(await emailWire({ now: t, fresh: true }), { ready: true, offers: false });
  assert.equal(calls.length, 1);
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: true } });
  assert.deepEqual(
    await emailWire({ now: t + 29_000 }),
    { ready: true, offers: false },
    "kept briefly: the wire can send, but offers are not on",
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(
    await emailWire({ now: t + 31_000 }),
    { ready: true, offers: true },
    "asked again after thirty seconds, not five minutes: the domain verified in between is seen",
  );
  assert.equal(calls.length, 2);
  // And a yes to both is kept the five minutes, as it was.
  assert.deepEqual(await emailWire({ now: t + 31_000 + READY_TTL_MS - 1 }), { ready: true, offers: true });
  assert.equal(calls.length, 2);
  // A send about to be committed does not read what is kept: fresh asks the edge now, whatever it holds.
  edge = () => ({ status: 200, body: { ok: true, ready: true, offers: false } });
  assert.deepEqual(await emailWire({ now: t + 32_000, fresh: true }), { ready: true, offers: false });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    (await channelsReadyOf({ supabase: world() }, A, { fresh: true })).email.offers.ok,
    false,
    "channelsReadyOf passes it on: the readiness a commit reads is the edge's word now",
  );
  assert.equal(calls.length, 4, "the commit's own ask, not the kept one");
  const before = calls.length;
  await channelsReadyOf({ supabase: world() }, A, { fresh: false });
  assert.equal(calls.length, before, "a page that only draws it reads what is kept (the no, thirty seconds)");
});

test("the page's readiness says offers by email can go only with the campaigns domain, the business's address and no pause: each with its own reason", async () => {
  const edgeOffers = (offers) => edgeSays(() => ({ status: 200, body: { ok: true, ready: true, offers } }));
  const withDb = (over = {}, cfg = config(ADDRESS)) =>
    fakeDb({
      tenant_channels: [],
      lines: [],
      mailboxes: [{ tenant_id: A, local_part: "hello", offers_paused_at: null, offers_paused_reason: null, ...over }],
      tenant_config: cfg === null ? [] : [{ tenant_id: A, config: cfg }],
    });
  await edgeOffers(true);
  const open = (await ready(withDb())).email;
  assert.deepEqual(open, { ready: true, why: null, offers: { ok: true, why: null, paused: null } });
  const noAddress = (await ready(withDb({}, config(null)))).email.offers;
  assert.deepEqual([noAddress.ok, noAddress.why], [false, "Add your business's address to send offers by email."]);
  const paused = (await ready(withDb({ offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "complaints" })))
    .email.offers;
  assert.deepEqual(
    [paused.ok, paused.why, paused.paused],
    [false, OFFERS_BY_EMAIL_WORDS.paused, { at: "2026-10-01T10:00:00Z", reason: "complaints" }],
  );
  // A tenant_config row that is not there is a configuration with no address, and says so (above); a read that fails says "could not be checked".
  const failing = fakeDb(
    {
      tenant_channels: [],
      lines: [],
      mailboxes: [{ tenant_id: A, local_part: "hello", offers_paused_at: null, offers_paused_reason: null }],
      tenant_config: [],
    },
    { "tenant_config.select": { message: "canceling statement due to statement timeout" } },
  );
  const unread = (await ready(failing)).email;
  assert.equal(unread.ready, true, "email itself is as ready as it was");
  assert.equal(unread.offers.why, CHANNEL_WORDS.unchecked);
  // The deployment's side first: no campaigns domain is the reason, whatever else is true.
  await edgeOffers(false);
  const closed = (await ready(withDb({}, config(null)))).email.offers;
  assert.equal(closed.why, OFFERS_BY_EMAIL_WORDS.noCampaignsDomain);
  // A database before 00288 has no pause columns: the mailbox reads as not paused.
  await edgeOffers(true);
  const old = fakeDb({
    tenant_channels: [],
    lines: [],
    mailboxes: [{ tenant_id: A, local_part: "hello" }],
    tenant_config: [{ tenant_id: A, config: config(ADDRESS) }],
  });
  assert.equal((await ready(old)).email.offers.ok, true);
});
