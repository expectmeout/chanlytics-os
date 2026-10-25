/**
 * Embedded Signup's two edge doors, run: POST /api/admin/whatsapp/connect and
 * GET /api/admin/whatsapp/signup-config, over a database in memory and a
 * captured wire to Meta's Graph API. Until 13 Sep 2026 their text was pinned
 * by one file and neither had ever been called.
 *
 * Connect turns what the browser was handed -- a one-time code and the ids
 * of the WABA and the number the business chose -- into a working line: the
 * code becomes the business's own token (the app secret is spent here and
 * nowhere else), the number and its WABA are read back, the app subscribes
 * to the WABA, the number is registered for Cloud API with a PIN we keep,
 * the channel row is written scoped to THIS workspace, and the token goes
 * into Vault through the one function that may write a credential. Executed
 * here: the knock and the workspace rule; a number another workspace holds
 * refused before Meta is asked, and a read that failed refused rather than
 * read as "nobody"; every Graph refusal named; registration belonging to the
 * number, not the app; the race between the read and the insert decided by
 * whose row it is; a credential that cannot be written disabling the row.
 * Nothing that comes back or is logged carries the token or the secret.
 *
 * Signup-config says whether the browser can start at all, and why not.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

// Both doors read these at call time; each test file is its own process. The
// app id is set so what reaches Meta as client_id can be told from the default.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.META_APP_SECRET = "meta-app-secret-nobody-may-see";
process.env.META_APP_ID = "424242424242424";
for (const k of [
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_ES_CONFIG_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_ID",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { DEFAULT_META_APP_ID, GRAPH_VERSION } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const connect = await import(at("apps/edge/api/admin/whatsapp/connect.ts"));
const signup = await import(at("apps/edge/api/admin/whatsapp/signup-config.ts"));
after(() => setPg(null));

const CONNECT = "/api/admin/whatsapp/connect";
const CONFIG = "/api/admin/whatsapp/signup-config";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111";
const PHONE = "1234567890123";
const WABA = "9876543210987";
const CODE = "AQBx-one-time-code-from-the-browser";
const TOKEN = "EAAB-business-token-nobody-may-see";
const SECRET = process.env.META_APP_SECRET;
const APP = process.env.META_APP_ID;
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** What the browser hands the dashboard, and the dashboard hands this door. */
const signedUp = (over = {}) => ({
  tenant_id: A,
  user_id: OWNER,
  code: CODE,
  phone_number_id: PHONE,
  waba_id: WABA,
  ...over,
});

/* ------------------------------- the knock -------------------------------- */

const token = (aud, o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? aud, {
    workspace: "workspace" in o ? o.workspace : A,
    user: OWNER,
  });
const knock = (body, headers = { "x-edge-token": token(CONNECT) }) =>
  connect.POST(
    new Request(`http://edge${CONNECT}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const ask = (headers = { "x-edge-token": token(CONFIG, { workspace: null }) }) =>
  signup.GET(new Request(`http://edge${CONFIG}`, { headers }));
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/** The door's log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

/** Another workspace's row on this number, or this workspace's own from an earlier connection. */
const held = (tenant_id, over = {}) => ({
  id: `wa-${tenant_id.slice(0, 8)}`,
  tenant_id,
  kind: "whatsapp",
  external_id: PHONE,
  number_e164: "+15551234567",
  waba_id: WABA,
  status: "active",
  credentials_ref: `wa-creds-wa-${tenant_id.slice(0, 8)}`,
  config: { verified_name: "Old name", registration: "registered" },
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The database the door will find, and the vault's memory of what it was handed. */
function use(over = {}, faults = {}, { vault, rpcs = {} } = {}) {
  const tables = { tenant_channels: [], events: [], ...over };
  const kept = [];
  const standings = [];
  const db = fakeDb(tables, faults, {
    put_channel_credentials:
      vault ??
      ((args) => {
        kept.push(args);
        return null;
      }),
    // What Meta holds about the number, kept (00338): the door's own words are held in a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs.
    channel_keep_standing: (args) => {
      standings.push(args);
      return "first";
    },
    ...rpcs,
  });
  setPg(db);
  return { tables, db, kept, standings };
}
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/**
 * Meta, as far as this door can see it: the four calls answered from a
 * script keyed by path, each request kept. A case overrides one answer to
 * refuse; anything unexpected throws.
 */
function meta({
  number = {},
  numberRefused,
  register,
  exchange,
  waba,
  subscribe,
  onRegister,
  health,
  wabaStanding,
  funding,
  owner,
  grants,
  numbers,
} = {}) {
  const seen = [];
  const real = globalThis.fetch;
  const strip = (u) => u.replace(GRAPH, "");
  const reply = (req) => {
    const p = strip(req.url);
    if (p.startsWith("/oauth/access_token?"))
      return exchange ?? { body: { access_token: TOKEN, token_type: "bearer" } };
    // What Meta holds about the number, read once the line is written: a number that may send, in a verified business.
    if (p.startsWith(`/${PHONE}?fields=health_status`))
      return (
        health ?? {
          body: {
            id: PHONE,
            verified_name: "Harbor Moving",
            name_status: "APPROVED",
            health_status: { can_send_message: "AVAILABLE", entities: [] },
          },
        }
      );
    if (p.startsWith(`/${WABA}?fields=business_verification_status`))
      return (
        wabaStanding ?? {
          body: {
            id: WABA,
            business_verification_status: "verified",
            whatsapp_business_manager_messaging_limit: "TIER_250",
          },
        }
      );
    // ...and whether the account has a payment method, and the business that owns it: a funded account, by default.
    if (p.startsWith(`/${WABA}?fields=primary_funding_id`))
      return funding ?? { body: { id: WABA, primary_funding_id: "100200300400500" } };
    if (p.startsWith(`/${WABA}?fields=owner_business_info`))
      return owner ?? { body: { id: WABA, owner_business_info: { id: "410540000000001" } } };
    // The token's own grant, and the account's numbers: asked only for an id the browser did not hear.
    if (p.startsWith("/debug_token?"))
      return (
        grants ?? {
          body: {
            data: {
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_messaging", target_ids: [WABA] },
                { scope: "whatsapp_business_management", target_ids: [WABA] },
              ],
            },
          },
        }
      );
    if (p.startsWith(`/${WABA}/phone_numbers?fields=`))
      return (
        numbers ?? {
          body: {
            data: [
              {
                id: PHONE,
                display_phone_number: "+1 555-123-4567",
                verified_name: "Harbor Moving",
                quality_rating: "GREEN",
                code_verification_status: "VERIFIED",
                platform_type: "NOT_APPLICABLE",
              },
            ],
          },
        }
      );
    if (p.startsWith(`/${PHONE}?fields=`))
      return (
        numberRefused ?? {
          body: {
            id: PHONE,
            display_phone_number: "+1 555-123-4567",
            verified_name: "Harbor Moving",
            quality_rating: "GREEN",
            code_verification_status: "VERIFIED",
            platform_type: "NOT_APPLICABLE",
            ...number,
          },
        }
      );
    if (p === `/${WABA}?fields=id,name`) return waba ?? { body: { id: WABA, name: "Harbor Moving WABA" } };
    if (p === `/${WABA}/subscribed_apps`) return subscribe ?? { body: { success: true } };
    if (p === `/${PHONE}/register`) {
      onRegister?.();
      return register ?? { body: { success: true } };
    }
    throw new Error(`Meta was asked something this door never asks: ${req.method} ${p}`);
  };
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    seen.push(req);
    const a = reply(req);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    paths: () => seen.map((r) => `${r.method} ${strip(r.url).split("?")[0]}`),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A wire nothing may reach. */
function unreachable(why) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error(why);
  };
  return {
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** Meta's own refusal, as the Graph API phrases one. */
const refused = (status, message, code) => ({ status, body: { error: { message, type: "OAuthException", code } } });
const printed = (x) => JSON.stringify(x);

/* ================================= connect ================================= */

test("connect, the door: a token for another door, a forgery and no credential are 403; without the app secret the door is shut with a 503; a body naming another workspace than the token is refused; the code is required and an id, when given, is Meta's; no database is a 503 -- and none of it reaches Meta or the database", async () => {
  const { db } = use();
  const net = unreachable("a refused connection must not reach Meta");
  try {
    assert.deepEqual(await answer(await knock(signedUp(), { "x-edge-token": token(CONFIG) })), [
      403,
      { ok: false, error: "token_audience" },
    ]);
    assert.deepEqual(
      await answer(await knock(signedUp(), { "x-edge-token": token(CONNECT, { secret: "not-the-secret" }) })),
      [403, { ok: false, error: "token_signature" }],
    );
    assert.deepEqual(await answer(await knock(signedUp(), {})), [403, { ok: false }]);
    assert.deepEqual(
      await answer(await withEnv({ META_APP_SECRET: undefined }, () => knock(signedUp()))),
      [503, { ok: false, error: "no_app_credentials" }],
      "only the secret can turn the code into a token",
    );
    assert.deepEqual(await answer(await knock(signedUp({ tenant_id: B }))), [
      403,
      { ok: false, error: "workspace_mismatch" },
    ]);
    const required = {
      ok: false,
      error: "bad_request",
      detail: "tenant_id, user_id and code required; phone_number_id and waba_id, when given, Meta's ids",
    };
    // An id the browser did not hear is absent, never malformed: the edge reads it from the token's grant (below).
    for (const body of [
      signedUp({ code: "" }),
      signedUp({ code: "x".repeat(2001) }),
      signedUp({ phone_number_id: "12345" }),
      signedUp({ phone_number_id: "abc123456789" }),
      signedUp({ waba_id: "x" }),
    ])
      assert.deepEqual(await answer(await knock(body)), [400, required], printed(body));
    await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
      assert.deepEqual(
        await answer(await knock(signedUp({ tenant_id: undefined }), { "x-diag-key": "diag-key-for-this-file" })),
        [400, required],
        "a key-holder must name the workspace",
      );
      // ... and the person: a key names none, so the body must.
      for (const user_id of [undefined, "not-a-person"])
        assert.deepEqual(
          await answer(await knock(signedUp({ user_id }), { "x-diag-key": "diag-key-for-this-file" })),
          [400, required],
          "a key-holder must name a person",
        );
    });
    assert.equal(db.seen.length, 0);
    // A token names the person, and the door writes down the token's, not a body's: a body without one, or with a name
    // that is no person's, is still the token's owner, and reaches Meta's exchange (refused here, by the wire above).
    for (const user_id of [undefined, "not-a-person"])
      assert.deepEqual(
        (await answer(await knock(signedUp({ user_id }))))[1].error,
        "exchange_failed",
        `the token's person stands in for ${String(user_id)}`,
      );
    setPg(null);
    assert.deepEqual(await answer(await knock(signedUp())), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
});

test("connect, before Meta is asked: a number another workspace holds is refused with nothing sent or written, and a read that failed is refused too -- never read as nobody holding the number", async () => {
  const taken = use({ tenant_channels: [held(B)] });
  const net = unreachable("a number held elsewhere must not be connected twice");
  try {
    assert.deepEqual(await answer(await knock(signedUp())), [409, { ok: false, error: "number_taken" }]);
    assert.equal(writes(taken.db, "tenant_channels").length + taken.kept.length, 0);
    assert.equal(taken.tables.tenant_channels[0].tenant_id, B, "B's row is exactly as it was");
    // REGRESSION: a pooler blip on this read used to mean "nobody", and the
    // upsert then moved a live number between workspaces.
    const blip = use({ tenant_channels: [held(B)] }, { "tenant_channels.select": { message: "connection reset" } });
    assert.deepEqual(await answer(await knock(signedUp())), [503, { ok: false, error: "channel_read_failed" }]);
    assert.equal(writes(blip.db, "tenant_channels").length, 0);
  } finally {
    net.restore();
  }
});

test("connect, Meta refusing at each of its four steps: the step is named in the answer with Meta's own words, nothing after it is asked, and nothing is written", async () => {
  const steps = [
    [
      "exchange_failed",
      { exchange: refused(400, "Invalid verification code format.", 100) },
      ["GET /oauth/access_token"],
    ],
    // The number and its WABA are asked for together, so both are on the wire whichever refuses.
    [
      "number_unreadable",
      { numberRefused: refused(400, "Unsupported get request.", 100) },
      ["GET /oauth/access_token", `GET /${PHONE}`, `GET /${WABA}`],
    ],
    [
      "waba_unreadable",
      { waba: refused(400, "Unsupported get request.", 100) },
      ["GET /oauth/access_token", `GET /${PHONE}`, `GET /${WABA}`],
    ],
    [
      "subscribe_failed",
      { subscribe: refused(403, "(#200) Requires whatsapp_business_management permission", 200) },
      ["GET /oauth/access_token", `GET /${PHONE}`, `GET /${WABA}`, `POST /${WABA}/subscribed_apps`],
    ],
    [
      "register_failed",
      { register: refused(400, "(#100) Invalid parameter", 100) },
      [
        "GET /oauth/access_token",
        `GET /${PHONE}`,
        `GET /${WABA}`,
        `POST /${WABA}/subscribed_apps`,
        `POST /${PHONE}/register`,
      ],
    ],
  ];
  for (const [error, script, asked] of steps) {
    const { db, kept } = use();
    const m = meta(script);
    let res;
    try {
      res = await knock(signedUp());
    } finally {
      m.restore();
    }
    const [status, body] = await answer(res);
    assert.equal(status, 502, error);
    assert.equal(body.error, error);
    assert.ok(typeof body.detail === "string" && body.detail.length > 0, `${error}: Meta's own words come back`);
    assert.deepEqual(m.paths(), asked, error);
    assert.equal(
      writes(db, "tenant_channels").length + kept.length + writes(db, "events").length,
      0,
      `${error}: nothing written`,
    );
  }
});

test("connect, the whole way: the code becomes the business's token as the app this deployment speaks for; the number and its WABA are read with it; the app subscribes; the number is registered with a PIN we keep; the row is written for THIS workspace and the token goes to Vault through the one door -- and neither the token nor the secret comes back or is logged", async () => {
  const { tables, db, kept } = use();
  const m = meta();
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(
    m.paths(),
    [
      "GET /oauth/access_token",
      `GET /${PHONE}`,
      `GET /${WABA}`,
      `POST /${WABA}/subscribed_apps`,
      `POST /${PHONE}/register`,
      `GET /${PHONE}`,
      `GET /${WABA}`,
      `GET /${WABA}`,
      `GET /${WABA}`,
    ],
    "the four Graph calls, in order, and then the four that read what Meta holds about the number",
  );
  const exchange = new URL(m.seen[0].url);
  assert.deepEqual(
    [
      exchange.searchParams.get("client_id"),
      exchange.searchParams.get("client_secret"),
      exchange.searchParams.get("code"),
    ],
    [APP, SECRET, CODE],
    "the app id from the environment, the secret spent here and nowhere else, the browser's code",
  );
  assert.equal(m.seen[0].headers.authorization, undefined, "no token yet: this is the call that makes one");
  for (const r of m.seen.slice(1))
    assert.equal(
      r.headers.authorization,
      `Bearer ${TOKEN}`,
      `${r.url}: the business's own token, never the environment's`,
    );
  assert.equal(
    m.seen[1].url,
    `${GRAPH}/${PHONE}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
  );
  const pin = m.seen[4].body.pin;
  assert.deepEqual(m.seen[4].body, { messaging_product: "whatsapp", pin });
  assert.match(pin, /^\d{6}$/, "a six-digit PIN from the platform's randomness");

  // The row: routing key, number, WABA, and what Meta calls it -- this workspace's.
  assert.equal(tables.tenant_channels.length, 1);
  const row = tables.tenant_channels[0];
  assert.deepEqual(
    [row.tenant_id, row.kind, row.external_id, row.number_e164, row.waba_id, row.status],
    [A, "whatsapp", PHONE, "+15551234567", WABA, "active"],
  );
  const { connected_at, ...config } = row.config;
  assert.deepEqual(config, {
    verified_name: "Harbor Moving",
    quality_rating: "GREEN",
    waba_name: "Harbor Moving WABA",
    connected_by: OWNER,
    registration: "registered",
  });
  assert.ok(Number.isFinite(Date.parse(connected_at)));
  const update = writes(db, "tenant_channels").find((s) => s.op === "update");
  assert.deepEqual(
    update.filters,
    [
      ["eq", "kind", "whatsapp"],
      ["eq", "external_id", PHONE],
      ["eq", "tenant_id", A],
    ],
    "scoped to THIS workspace on the way in: the write cannot reach another workspace's row even if the read was answered wrongly",
  );
  // The token, in Vault, through the one function that may write a credential -- with the PIN Meta was given.
  assert.deepEqual(kept, [
    { p_channel_id: row.id, p_secret: { access_token: TOKEN, phone_id: PHONE, pin, waba_id: WABA } },
  ]);
  assert.equal(
    writes(db, "tenant_channels").some((s) => "credentials_ref" in (s.values ?? {})),
    false,
    "the row never carries the token; Vault does",
  );
  // The platform's event, and what the dashboard is told.
  // The connection, and the workspace's first line that answers (the funnel's milestone, written once).
  assert.deepEqual(
    tables.events.map((e) => e.kind),
    ["channel.connected", "workspace.activated"],
  );
  assert.deepEqual(tables.events[1].data, { milestone: "line_live", via: "whatsapp" });
  const ev = tables.events[0];
  assert.deepEqual(
    [ev.tenant_id, ev.kind, ev.category, ev.subject_type, ev.subject_id],
    [A, "channel.connected", "system", "channel", row.id],
  );
  assert.deepEqual(ev.data, {
    kind: "whatsapp",
    phone_number_id: PHONE,
    waba_id: WABA,
    number_e164: "+15551234567",
    verified_name: "Harbor Moving",
    by: OWNER,
  });
  assert.deepEqual(body, {
    ok: true,
    channel_id: row.id,
    phone_number_id: PHONE,
    waba_id: WABA,
    ids_from: "message",
    number_e164: "+15551234567",
    verified_name: "Harbor Moving",
    quality_rating: "GREEN",
    registration: "registered",
  });
  for (const secret of [TOKEN, SECRET, pin, CODE]) {
    assert.ok(!printed(body).includes(secret), `${secret} is not in the answer`);
    assert.ok(!log.lines.some((l) => l.includes(secret)), `${secret} is not in the log`);
  }
  assert.ok(
    log.lines.some((l) => l.includes('"event":"wa_connected"') && l.includes(row.id)),
    "the log says which channel connected",
  );
});

test("connect, the ids the window did not hand back: the token itself is asked which account it grants (as the app, the secret in no URL) and the account which number it has; one number is the business that signed up, connected as if named; a number held elsewhere is refused once it is known; and what the token cannot say is named, with nothing written", async () => {
  // 8 October 2026: three sign-ups finished on Meta's side (PARTNER_APP_INSTALLED, 17:47 to 17:49 UTC) and the page heard
  // no ids, so each code was thrown away and nothing was connected; the settings rate bucket shows the route never called.
  const unheard = { phone_number_id: undefined, waba_id: undefined };
  const { tables, kept } = use();
  const m = meta();
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp(unheard)));
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(
    m.paths().slice(0, 4),
    ["GET /oauth/access_token", "GET /debug_token", `GET /${WABA}/phone_numbers`, `GET /${PHONE}`],
    "the token first, then its grant, then the account's numbers, then the connection as ever",
  );
  const grant = m.seen[1];
  assert.equal(grant.headers.authorization, `Bearer ${APP}|${SECRET}`, "the app asks Meta's introspection as the app");
  assert.ok(!grant.url.includes(SECRET), "and the secret rides in no URL");
  assert.equal(new URL(grant.url).searchParams.get("input_token"), TOKEN, "about the token the code became");
  assert.equal(
    m.seen[2].headers.authorization,
    `Bearer ${TOKEN}`,
    "the account's numbers, with the business's own token",
  );
  const row = tables.tenant_channels[0];
  assert.deepEqual([row.tenant_id, row.external_id, row.waba_id, row.status], [A, PHONE, WABA, "active"]);
  assert.deepEqual([body.phone_number_id, body.waba_id, body.ids_from], [PHONE, WABA, "token"]);
  assert.equal(kept[0].p_secret.phone_id, PHONE, "the credential names the number found");
  for (const secret of [TOKEN, SECRET, CODE])
    assert.ok(!log.lines.some((l) => l.includes(secret)), `${secret} is not in the log`);
  assert.ok(
    log.lines.some(
      (l) =>
        l.includes('"event":"wa_connect_found"') &&
        l.includes('"waba_from":"token"') &&
        l.includes('"number_from":"account"'),
    ),
    "the log says where each id came from",
  );

  // The window named the account and not the number (FINISH_ONLY_WABA): only the account is asked.
  const half = use();
  const m2 = meta();
  try {
    [status, body] = await answer(await knock(signedUp({ phone_number_id: undefined })));
  } finally {
    m2.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(m2.paths().slice(0, 3), ["GET /oauth/access_token", `GET /${WABA}/phone_numbers`, `GET /${PHONE}`]);
  assert.equal(half.tables.tenant_channels.length, 1);
  assert.equal(body.ids_from, "token");

  // The number found is another workspace's: refused once it is known, with nothing subscribed, registered or written.
  const theirs = use({ tenant_channels: [held(B)] });
  const m3 = meta();
  try {
    [status, body] = await answer(await knock(signedUp(unheard)));
  } finally {
    m3.restore();
  }
  assert.deepEqual([status, body], [409, { ok: false, error: "number_taken" }]);
  assert.deepEqual(m3.paths(), ["GET /oauth/access_token", "GET /debug_token", `GET /${WABA}/phone_numbers`]);
  assert.equal(writes(theirs.db, "tenant_channels").length + theirs.kept.length, 0);
  assert.equal(theirs.tables.tenant_channels[0].tenant_id, B, "B's row is exactly as it was");

  // What the token cannot say is named in the answer, nothing after it is asked, and nothing is written.
  const lookedUp = ["GET /oauth/access_token", "GET /debug_token", `GET /${WABA}/phone_numbers`];
  const cases = [
    [
      "grant_unreadable",
      { grants: refused(400, "Invalid OAuth access token.", 190) },
      ["GET /oauth/access_token", "GET /debug_token"],
    ],
    [
      "waba_not_granted",
      { grants: { body: { data: { is_valid: true, granular_scopes: [{ scope: "whatsapp_business_messaging" }] } } } },
      ["GET /oauth/access_token", "GET /debug_token"],
    ],
    ["number_unreadable", { numbers: refused(400, "Unsupported get request.", 100) }, lookedUp],
    ["number_missing", { numbers: { body: { data: [] } } }, lookedUp],
    ["number_ambiguous", { numbers: { body: { data: [{ id: PHONE }, { id: "1234567890124" }] } } }, lookedUp],
  ];
  for (const [error, script, asked] of cases) {
    const { db, kept: kept2 } = use();
    const mm = meta(script);
    let res;
    try {
      res = await knock(signedUp(unheard));
    } finally {
      mm.restore();
    }
    const [s, b] = await answer(res);
    assert.equal(s, 502, error);
    assert.equal(b.error, error);
    assert.deepEqual(mm.paths(), asked, error);
    assert.equal(
      writes(db, "tenant_channels").length + kept2.length + writes(db, "events").length,
      0,
      `${error}: nothing written`,
    );
    if (error === "number_ambiguous") assert.equal(b.detail, "2 numbers on the account", "how many, never which");
  }
});

test("connect, what Meta holds about the number: read once the line and its token are written, kept whole through the door, and told to the owner when Meta says the number cannot send -- the payment method Meta asks for at the end of its window is the problem its fixture names; a read that fails never fails the connection", async () => {
  const blocked = {
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
  const { tables, standings } = use({
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } }],
  });
  // The account has no payment method on file (its funding read answers without a funding id), and says who owns it.
  const m = meta({ health: blocked, funding: { body: { id: WABA } } });
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200, printed(body));
  const [phoneRead, wabaRead, fundingRead, ownerRead] = m.seen.slice(-4);
  assert.equal(phoneRead.url, `${GRAPH}/${PHONE}?fields=health_status,name_status,verified_name`);
  assert.equal(
    wabaRead.url,
    `${GRAPH}/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`,
  );
  assert.equal(fundingRead.url, `${GRAPH}/${WABA}?fields=primary_funding_id`);
  assert.equal(ownerRead.url, `${GRAPH}/${WABA}?fields=owner_business_info{id}`);
  for (const r of [phoneRead, wabaRead, fundingRead, ownerRead])
    assert.equal(r.headers.authorization, `Bearer ${TOKEN}`, r.url);
  const row = tables.tenant_channels[0];
  assert.deepEqual(standings, [
    {
      p_tenant_id: A,
      p_channel_id: row.id,
      p_standing: {
        can_send: "BLOCKED",
        problems: [
          {
            entity: "WABA",
            code: 141006,
            said: "A payment method is required to send messages",
            fix: "Add a payment method in WhatsApp Manager",
          },
        ],
        notes: [],
        name: "Harbor Moving",
        name_status: "APPROVED",
        verification: "verified",
        limit: "TIER_250",
        has_payment_method: false,
        owner_business_id: "410540000000001",
        waba_id: WABA,
      },
    },
  ]);
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
    [[A, "number", "admin/integrations", "WhatsApp can't start conversations from your number"]],
    "the owner's bell says it now, not at the next six-hourly read",
  );
  assert.ok(
    tables.notifications[0].body.includes("+1 (555) 123-4567: Meta needs a payment method on your WhatsApp account"),
  );
  assert.ok(!printed(body).includes("BLOCKED"), "and the connection's answer is the connection's, unchanged");

  // Meta cannot be asked, or refuses: the connection stands.
  const down = use();
  const m2 = meta({ health: { status: 500, body: { error: { message: "Service unavailable", code: 2 } } } });
  const log2 = quiet();
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log2.restore();
    m2.restore();
  }
  assert.equal(status, 200, "a standing that could not be read does not undo a connection");
  assert.equal(down.tables.tenant_channels.length, 1);
  assert.deepEqual(down.standings, [], "nothing was kept");
  assert.ok(log2.lines.some((l) => l.includes('"event":"wa_standing_read_failed"')));
});

test("connect, the app this deployment speaks for: with no META_APP_ID set the code is exchanged as the one live app -- the same default signup-config hands the browser, so the sign-up and the exchange can never be two different apps", async () => {
  const { tables } = use();
  const m = meta();
  const log = quiet();
  let status;
  try {
    status = (await withEnv({ META_APP_ID: undefined }, () => knock(signedUp()))).status;
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200);
  assert.notEqual(DEFAULT_META_APP_ID, APP, "and the case means something: the default is not the id this file set");
  assert.equal(
    new URL(m.seen[0].url).searchParams.get("client_id"),
    DEFAULT_META_APP_ID,
    "a deployment that names no app would otherwise start Embedded Signup against one app and spend the browser's code against another, and Meta refuses a code that was not issued for the app asking",
  );
  assert.equal(tables.tenant_channels.length, 1, "and the line is connected all the same");
});

test("connect, registration belongs to the number: one already on Cloud API is not registered again; one Meta says is already registered is done; one whose own two-step PIN stands in the way is named as such and nothing is written", async () => {
  // Already on Cloud API: re-registering with a fresh PIN would only trip its two-step verification.
  const cloud = use();
  const m1 = meta({ number: { platform_type: "CLOUD_API" } });
  let body;
  try {
    [, body] = await answer(await knock(signedUp()));
  } finally {
    m1.restore();
  }
  assert.ok(!m1.paths().includes(`POST /${PHONE}/register`), "left alone");
  assert.equal(body.registration, "already_registered");
  assert.equal(cloud.kept[0].p_secret.pin, null, "no PIN of ours to keep");
  assert.equal(cloud.tables.tenant_channels[0].config.registration, "already_registered");

  // Meta's own words for a registration that had already happened: done, not failed; the PIN we offered is kept for a re-registration.
  const done = use();
  const m2 = meta({ register: refused(400, "This phone number is already registered.", 133010) });
  try {
    [, body] = await answer(await knock(signedUp()));
  } finally {
    m2.restore();
  }
  assert.equal(body.ok, true);
  assert.equal(body.registration, "already_registered");
  assert.match(done.kept[0].p_secret.pin, /^\d{6}$/);

  // Two-step verification on, and the PIN offered is not its PIN: this flow never asks for one.
  const walled = use();
  const m3 = meta({ register: refused(400, "Two step verification PIN Mismatch", 133005) });
  let status;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m3.restore();
  }
  assert.deepEqual(
    [status, body.error, body.detail],
    [502, "pin_required", "Two step verification PIN Mismatch"],
    "the PIN wall has its own name",
  );
  assert.equal(walled.tables.tenant_channels.length + walled.kept.length + walled.tables.events.length, 0);
});

test("connect, keeping the WhatsApp Business app (coexistence, decision 0073, R12, R21): Meta's own flow registered the number, so it is never registered again and no PIN of ours is kept; the row says the app is kept; and the app's contacts and chats are asked for: both rows of what came in queued, each source's ask now and its settling a day and two hours on", async () => {
  const notes = [];
  const w = use({ jobs: [] }, {}, { rpcs: { import_ledger_note: (args) => (notes.push(args), null) } });
  const m = meta();
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp({ keep_app: true })));
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.ok(
    !m.paths().includes(`POST /${PHONE}/register`),
    "a PIN of ours would trip the app's own two-step verification",
  );
  assert.equal(body.registration, "coexistence");
  assert.equal(w.kept[0].p_secret.pin, null);
  const row = w.tables.tenant_channels[0];
  assert.deepEqual([row.status, row.config.coexistence, row.config.registration], ["active", true, "coexistence"]);
  assert.deepEqual(
    notes.map((n) => [n.p_source, n.p_state, n.p_cursor.channel]),
    [
      ["whatsapp_contacts", "queued", row.id],
      ["whatsapp_history", "queued", row.id],
    ],
  );
  const parts = w.tables.jobs.map((j) => [
    j.kind,
    j.payload.source,
    j.payload.seq.split(":")[1],
    j.payload.connection_id,
  ]);
  assert.deepEqual(parts, [
    ["history_import", "whatsapp_contacts", "1", row.id],
    ["history_import", "whatsapp_contacts", "2", row.id],
    ["history_import", "whatsapp_history", "1", row.id],
    ["history_import", "whatsapp_history", "2", row.id],
  ]);
  const [ask, settle] = w.tables.jobs;
  assert.equal(Date.parse(settle.due_at) - Date.parse(ask.due_at), 26 * 3_600_000, "settled a day and two hours on");

  // A number of the business's own (no app kept): registered with a PIN we keep, and nothing asked of the app.
  const plain = use(
    { jobs: [] },
    {},
    { rpcs: { import_ledger_note: () => assert.fail("nothing is brought from an app not kept") } },
  );
  const m2 = meta();
  try {
    [, body] = await answer(await knock(signedUp()));
  } finally {
    m2.restore();
  }
  assert.equal(body.registration, "registered");
  assert.equal(plain.tables.jobs.length, 0);
  assert.equal(plain.tables.tenant_channels[0].config.coexistence, undefined);
});

test("connect, whose row it is: this workspace connecting its own number again updates its row in place; a row that appears between the read and the insert is refused when it is another workspace's and accepted when it is this one's own double-submit", async () => {
  // A re-connection: the workspace's own row already holds the number.
  const own = use({ tenant_channels: [held(A)] });
  const m1 = meta();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m1.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.equal(own.tables.tenant_channels.length, 1, "one row, still");
  assert.equal(body.channel_id, `wa-${A.slice(0, 8)}`, "the same row");
  assert.equal(own.tables.tenant_channels[0].config.verified_name, "Harbor Moving", "brought up to date");
  assert.equal(
    writes(own.db, "tenant_channels").some((s) => s.op === "insert"),
    false,
  );
  assert.equal(own.kept[0].p_channel_id, `wa-${A.slice(0, 8)}`, "the vault secret, named by the channel, is updated");

  // Somebody got there between the read and the insert. The insert trips the
  // unique index on (kind, external_id); the fault below is that index, and it
  // puts the other party's row in place as it refuses, the way a race would.
  const raced = (whose) => {
    const tables = { tenant_channels: [], events: [] };
    const faults = {
      get "tenant_channels.insert"() {
        tables.tenant_channels.push(held(whose, { config: { registration: "registered" } }));
        return { message: "duplicate key value violates unique constraint", code: "23505" };
      },
    };
    return use(tables, faults);
  };
  const theirs = raced(B);
  const m2 = meta();
  const log = quiet();
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log.restore();
    m2.restore();
  }
  assert.deepEqual(
    [status, body],
    [409, { ok: false, error: "number_taken" }],
    "another workspace's is the 409 this door exists to give",
  );
  assert.equal(theirs.kept.length, 0, "and no credential of theirs is overwritten");
  assert.equal(theirs.tables.tenant_channels[0].tenant_id, B);
  assert.ok(log.lines.some((l) => l.includes('"event":"wa_connect_number_taken"') && l.includes('"at":"insert"')));

  const mine = raced(A);
  const m3 = meta();
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m3.restore();
  }
  assert.equal(
    status,
    200,
    "the owner ran Embedded Signup twice because the first attempt outlasted their patience: their own number is not somebody else's",
  );
  assert.equal(body.channel_id, `wa-${A.slice(0, 8)}`, "the row the first attempt made");
  assert.equal(
    mine.kept[0].p_channel_id,
    `wa-${A.slice(0, 8)}`,
    "the token from this attempt goes into that row's vault entry",
  );
});

test("connect, a credential that cannot be written: the row would ride the environment token -- not this business's -- so it is disabled, the answer says so, and no event says the channel connected", async () => {
  const { tables, db } = use(
    {},
    {},
    {
      vault: () => {
        throw new Error("vault.create_secret: permission denied");
      },
    },
  );
  const m = meta();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m.restore();
  }
  assert.deepEqual([status, body], [500, { ok: false, error: "credentials_failed" }]);
  assert.equal(tables.tenant_channels.length, 1);
  assert.equal(tables.tenant_channels[0].status, "disabled");
  assert.deepEqual(writes(db, "tenant_channels").at(-1).values, { status: "disabled" });
  assert.ok(
    !writes(db, "tenant_channels").some((w) => w.values?.status === "active"),
    "the row was never active: a number routes only once its token is in Vault, so a crash between the two writes cannot leave a number that takes every message and answers none",
  );
  assert.equal(tables.events.length, 0);
  assert.ok(!printed(body).includes(TOKEN));
});

test("connect, the order of the writes: the row is made disabled, the token goes into Vault, and only then does the number route; a row from an earlier connection keeps its own status until the token is in", async () => {
  const fresh = use();
  const m1 = meta();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m1.restore();
  }
  assert.equal(status, 200, printed(body));
  const made = fresh.db.seen.findIndex((s) => s.table === "tenant_channels" && s.op === "insert");
  const kept = fresh.db.seen.findIndex((s) => s.rpc === "put_channel_credentials");
  const live = fresh.db.seen.findIndex(
    (s) => s.table === "tenant_channels" && s.op === "update" && s.values?.status === "active",
  );
  assert.ok(
    made >= 0 && kept > made && live > kept,
    `made ${made}, kept ${kept}, live ${live}: insert, Vault, then active`,
  );
  assert.equal(fresh.db.seen[made].values[0].status, "disabled", "a new row is written disabled");
  assert.equal(fresh.tables.tenant_channels[0].status, "active", "and routes once the token is in");

  // An earlier connection's row, active and taking messages: it is not switched off while Meta is asked and the
  // token rewritten, so no message in between is told unroutable; it is confirmed active at the end.
  const again = use({ tenant_channels: [held(A)] });
  const m2 = meta();
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    m2.restore();
  }
  assert.equal(status, 200, printed(body));
  const touched = writes(again.db, "tenant_channels").map((w) => w.values?.status ?? null);
  assert.deepEqual(
    touched.filter((v) => v === "disabled"),
    [],
    "never disabled on the way: the only status written is active, after the token",
  );
  assert.equal(again.tables.tenant_channels[0].status, "active");
});

/* ============================== signup-config ============================== */

test("signup-config: behind the same knock; the app id (the browser hands it to Meta's SDK) and the configuration id when there is one; not ready without the secret, or without the configuration, each named; the secret's value never comes back", async () => {
  assert.deepEqual(await answer(await ask({ "x-edge-token": token(CONNECT, { workspace: null }) })), [
    403,
    { ok: false, error: "token_audience" },
  ]);
  assert.deepEqual(await answer(await ask({})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await ask()),
    [
      200,
      {
        ok: true,
        app_id: APP,
        config_id: null,
        graph_version: GRAPH_VERSION,
        ready: false,
        reason: "no_config_id",
        keep_app: false,
      },
    ],
    "the secret is set, the flow is not: the Integrations pane says so instead of drawing a button that would open nothing",
  );
  const ready = await withEnv({ META_ES_CONFIG_ID: "es-config-7" }, async () => answer(await ask()));
  assert.deepEqual(
    ready,
    [
      200,
      {
        ok: true,
        app_id: APP,
        config_id: "es-config-7",
        graph_version: GRAPH_VERSION,
        ready: true,
        reason: null,
        keep_app: false,
      },
    ],
    "what the browser needs to start",
  );
  // Keeping the WhatsApp Business app (coexistence, decision 0073, R12): offered only where the configuration made in
  // Meta's dashboard offers it (META_ES_KEEP_APP), and never by a door that cannot start at all.
  const keeps = await withEnv({ META_ES_CONFIG_ID: "es-config-7", META_ES_KEEP_APP: "1" }, async () =>
    answer(await ask()),
  );
  assert.equal(keeps[1].keep_app, true);
  const keepsNothing = await withEnv({ META_ES_CONFIG_ID: undefined, META_ES_KEEP_APP: "1" }, async () =>
    answer(await ask()),
  );
  assert.deepEqual([keepsNothing[1].ready, keepsNothing[1].keep_app], [false, false]);
  const noSecret = await withEnv({ META_APP_SECRET: undefined, META_ES_CONFIG_ID: "es-config-7" }, async () =>
    answer(await ask()),
  );
  assert.deepEqual(
    [noSecret[1].ready, noSecret[1].reason],
    [false, "no_app_secret"],
    "without the secret no code could ever be exchanged, whatever the browser starts",
  );
  const defaulted = await withEnv({ META_APP_ID: undefined }, async () => answer(await ask()));
  assert.equal(
    defaulted[1].app_id,
    DEFAULT_META_APP_ID,
    "the one live app unless told otherwise -- the same default the token introspection uses",
  );
  for (const [, body] of [ready, noSecret, defaulted])
    assert.ok(!printed(body).includes(SECRET), "presence, never the value");
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
    assert.equal(
      (await ask({ "x-diag-key": "diag-key-for-this-file" })).status,
      200,
      "the key opens it while there is no secret",
    );
  });
});
