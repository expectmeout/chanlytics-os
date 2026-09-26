/**
 * The two mail doors, run: POST /api/admin/setup-request and
 * /api/admin/signup-notify over a database in memory and a captured wire to
 * the mail transport. Until 13 Sep 2026 setup-request's text was pinned by
 * four assertions in setup.test.mjs and signup-notify's by nothing at all;
 * neither POST had ever been called.
 *
 * Both doors exist for the one thing Postgres cannot do: send the email. The
 * database already holds the ask (setup_request) or the workspace
 * (create_workspace); the dashboard calls the door afterwards and treats a
 * failure as a shrug. So what is proven here is the mail itself -- who it
 * goes to, what it says, what it never says -- and every way the door
 * declines: the knock, a mailbox that is not configured, a key that is
 * missing, a transport that refuses.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The
// platform's mailbox and the transport's key are set here and taken away per
// case; the doors read them at the call, not at import. No Supabase
// credentials, so `setPg(null)` really is no database.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test, second@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const SETUP = "/api/admin/setup-request";
const SIGNUP = "/api/admin/signup-notify";
const DOORS = {
  [SETUP]: (await import(at("apps/edge/api/admin/setup-request.ts"))).POST,
  [SIGNUP]: (await import(at("apps/edge/api/admin/signup-notify.ts"))).POST,
};
after(() => setPg(null));

/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Another workspace, which a token about A must never speak for. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** A workspace that does not exist. */
const GHOST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KEY = "diag-key-for-this-file";

/* ------------------------------- the knock -------------------------------- */

const token = (aud, o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? aud, {
    workspace: "workspace" in o ? o.workspace : A,
    user: "u1",
  });
const knock = (aud, body, headers = { "x-edge-token": token(aud) }) =>
  DOORS[aud](
    new Request(`http://edge${aud}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];
/** The body each door needs to get past its own validation, when the case is about something else. */
const plain = (aud) => (aud === SETUP ? { what: "line" } : { email: "owner@example.com" });

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
/** The edge before it has the secret: the key decides, and a token is ignored. */
const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

const tenants = () => [
  {
    id: A,
    name: "Harbor Moving",
    slug: "harbor-moving",
    timezone: "America/New_York",
    status: "active",
    created_at: "2026-09-13T14:00:00Z",
  },
  {
    id: B,
    name: "Billing probe",
    slug: "billing-probe",
    timezone: "Europe/Madrid",
    status: "active",
    created_at: "2026-09-12T09:30:00Z",
  },
];
/** The tables a mail door might be tempted by are here, empty, so a read of any of them would show in `seen`. */
const world = (over = {}) => ({
  tenants: tenants(),
  notifications: [],
  contacts: [],
  messages: [],
  conversations: [],
  ...over,
});
function use(tables) {
  const db = fakeDb(tables);
  setPg(db);
  return db;
}
const asked = (db) => db.seen.map((s) => `${s.table}.${s.op}`);

/* --------------------------------- the wire ------------------------------- */

/** Every request to the transport, captured and answered by `reply`; a delivered mail is Resend's 200 with an id. */
function wire(reply = () => ({ status: 200, body: { id: "email_1" } })) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      signal: init?.signal ?? null,
    };
    seen.push(req);
    const a = reply(req);
    return new Response(JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    seen,
    /** What Resend was asked to send, in order: { from, to, subject, text }. */
    mail: () => seen.filter((r) => r.url === "https://api.resend.com/emails").map((r) => r.body),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A wire nothing may reach. The transport swallows a failure and answers false, so the proof is `seen`, not the throw. */
const unreachable = (why) =>
  wire(() => {
    throw new Error(why);
  });

/* --------------------------------- the door ------------------------------- */

test("both doors: a token for another door, a forgery and no credential at all are 403 before the mailbox, the database or the wire is consulted; a body naming another workspace than the token is refused; without the secret the key decides", async () => {
  const db = use(world());
  const net = unreachable("a refused knock must not reach the transport");
  try {
    for (const [aud, other] of [
      [SETUP, SIGNUP],
      [SIGNUP, SETUP],
    ]) {
      const body = plain(aud);
      assert.deepEqual(
        await answer(await knock(aud, body, { "x-edge-token": token(other) })),
        [403, { ok: false, error: "token_audience" }],
        `${aud}: a token for the other mail door opens nothing here`,
      );
      assert.deepEqual(
        await answer(await knock(aud, body, { "x-edge-token": token(aud, { secret: "not-the-secret" }) })),
        [403, { ok: false, error: "token_signature" }],
        aud,
      );
      assert.deepEqual(await answer(await knock(aud, body, {})), [403, { ok: false }], aud);
      assert.deepEqual(
        await answer(await knock(aud, body, { "x-edge-token": "garbage", "x-diag-key": KEY })),
        [403, { ok: false, error: "token_malformed" }],
        `${aud}: no falling back from a bad token to a key`,
      );
      assert.deepEqual(
        await answer(await knock(aud, { ...body, tenant_id: B })),
        [403, { ok: false, error: "workspace_mismatch" }],
        `${aud}: a token about A may not speak for B`,
      );
      // Minted while the edge still has the secret, presented once it does not.
      const minted = token(aud);
      await keyed(async () => {
        assert.deepEqual(
          await answer(await knock(aud, body, { "x-diag-key": "not-the-key" })),
          [403, { ok: false }],
          aud,
        );
        assert.deepEqual(
          await answer(await knock(aud, body, { "x-edge-token": minted })),
          [403, { ok: false }],
          `${aud}: a token ahead of the secret opens nothing on its own`,
        );
      });
    }
  } finally {
    net.restore();
  }
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  assert.equal(net.seen.length, 0, "and nothing was sent");
});

test("both doors: without the platform's mailbox they say so and read nothing; without a database they say that; the mailbox is read at the call, not at import", async () => {
  const db = use(world());
  const net = unreachable("a door with nowhere to send must not reach the transport");
  try {
    for (const aud of [SETUP, SIGNUP]) {
      for (const patch of [
        { LEAD_TO: undefined },
        { LEAD_FROM: undefined },
        { LEAD_TO: "" },
        { LEAD_TO: undefined, LEAD_FROM: undefined },
      ]) {
        await withEnv(patch, async () => {
          assert.deepEqual(
            await answer(await knock(aud, plain(aud))),
            [503, { ok: false, error: "no_platform_mailbox" }],
            `${aud} ${JSON.stringify(patch)}`,
          );
        });
      }
    }
    assert.equal(db.seen.length, 0, "the mailbox is checked before the workspace is read");
    setPg(null);
    for (const aud of [SETUP, SIGNUP]) {
      assert.deepEqual(await answer(await knock(aud, plain(aud))), [503, { ok: false, error: "no_database" }], aud);
    }
  } finally {
    net.restore();
  }
  assert.equal(net.seen.length, 0);
});

/* ------------------------------ setup-request ----------------------------- */

const HOW =
  "Set it up from the edge, dry run first:\n" +
  '  POST /api/admin/voice-provision  { "tenant_id": "<id>", "area_code": <3 digits> }   (x-diag-key)\n' +
  'then the same body with "apply": true. Their Setup page reads the line as ready by itself once the row exists.';

test("setup-request: a known `what` and a workspace on record, or nothing; the platform hears from the workspace's own name who asked, the id, and how to set the line up -- and never a customer's word", async () => {
  const tables = world();
  const db = use(tables);
  const net = wire();
  try {
    const bad = [400, { ok: false, error: "tenant_id and a known `what` are required" }];
    assert.deepEqual(await answer(await knock(SETUP, {})), bad, "no `what`");
    assert.deepEqual(await answer(await knock(SETUP, { what: "fax machine" })), bad, "a `what` nobody offers");
    assert.deepEqual(await answer(await knock(SETUP, { what: ["line"] })), bad, "not a string");
    assert.deepEqual(await answer(await knock(SETUP, "not json")), bad);
    await keyed(async () => {
      assert.deepEqual(
        await answer(await knock(SETUP, { what: "line" }, { "x-diag-key": KEY })),
        bad,
        "a key holder is about no workspace: the body must name one",
      );
      assert.deepEqual(
        await answer(await knock(SETUP, { what: "line", tenant_id: "harbor-moving" }, { "x-diag-key": KEY })),
        bad,
        "and name it by id",
      );
    });
    assert.equal(db.seen.length, 0, "refused before the workspace is read");
    assert.deepEqual(
      await answer(await knock(SETUP, { what: "line" }, { "x-edge-token": token(SETUP, { workspace: GHOST }) })),
      [404, { ok: false, error: "no such workspace" }],
    );
    assert.equal(net.seen.length, 0, "nothing sent for any refusal");

    const readsBefore = db.seen.length;
    const [status, body] = await answer(await knock(SETUP, { what: "line", by: "  ada@example.com  " }));
    assert.deepEqual([status, body], [200, { ok: true, what: "line", tenant: "harbor-moving" }]);
    assert.equal(net.seen.length, 1, "one mail");
    const [req] = net.seen;
    assert.equal(req.url, "https://api.resend.com/emails");
    assert.equal(req.method, "POST");
    assert.equal(req.headers.Authorization, "Bearer re_test_only");
    assert.ok(
      req.signal instanceof AbortSignal,
      "with a timeout on the request: this is a 60s invocation that still has to answer",
    );
    const m = req.body;
    assert.equal(m.from, "Pager <pager@platform.test>");
    assert.deepEqual(
      m.to,
      ["ops@platform.test", "second@platform.test"],
      "the platform's own mailboxes, every one of them: this is about a workspace, not addressed to one",
    );
    assert.equal(m.subject, "Harbor Moving asked for a phone line");
    assert.equal(
      m.text,
      `Harbor Moving (harbor-moving) asked for a phone line.\nRequested by: ada@example.com\nWorkspace id: ${A}\n\n${HOW}\n`,
      "the workspace's own name and id, who asked (trimmed), and how to set the line up: from the edge, dry run first",
    );
    assert.deepEqual(
      asked(db).slice(readsBefore),
      ["tenants.select"],
      "the workspace's row is the only thing read: no contact, no message, no conversation is anywhere near this",
    );
    assert.ok(
      asked(db).every((q) => q === "tenants.select"),
      "and nothing else was, for any refusal either",
    );
    assert.deepEqual(tables.notifications, [], "a platform notice has no workspace and so no bell");

    // Nobody named: a member.
    assert.equal((await knock(SETUP, { what: "line", by: "   " })).status, 200);
    assert.match(net.mail()[1].text, /\nRequested by: a member\n/);
    // A key holder naming the workspace -- support, from the console -- gets the same mail about that workspace.
    await keyed(async () => {
      assert.deepEqual(
        await answer(await knock(SETUP, { what: "line", tenant_id: B, by: "support" }, { "x-diag-key": KEY })),
        [200, { ok: true, what: "line", tenant: "billing-probe" }],
      );
    });
    assert.equal(net.mail()[2].subject, "Billing probe asked for a phone line");
    assert.match(
      net.mail()[2].text,
      new RegExp(
        `^Billing probe \\(billing-probe\\) asked for a phone line\\.\\nRequested by: support\\nWorkspace id: ${B}\\n`,
      ),
    );
    // The token's own workspace named in the body is fine.
    assert.equal((await knock(SETUP, { what: "line", tenant_id: A })).status, 200);
    assert.equal(net.mail().length, 4);
  } finally {
    net.restore();
  }
});

test("setup-request: a port and a repair each tell the platform what was asked for and what to do next (S8, S14)", async () => {
  use(world());
  const net = wire();
  try {
    assert.deepEqual(
      await answer(await knock(SETUP, { what: "port", by: "ada@example.com" })),
      [200, { ok: true, what: "port", tenant: "harbor-moving" }],
      "REGRESSION: a port was a `what` nobody offers",
    );
    assert.deepEqual(await answer(await knock(SETUP, { what: "repair", by: "ada@example.com" })), [
      200,
      { ok: true, what: "repair", tenant: "harbor-moving" },
    ]);
    const [port, repair] = net.mail();
    assert.equal(port.subject, "Harbor Moving asked to bring their phone number");
    assert.match(port.text, /port-out PIN/, "what the carrier will ask for");
    assert.match(port.text, /keep their current service/, "and the one thing that loses a number");
    assert.equal(repair.subject, "Harbor Moving asked for their business settings to be repaired");
    assert.match(repair.text, /broken\.issues/, "where the problems are listed");
    // An office phone system's forwarding, set up with a person on a call (00173).
    assert.deepEqual(await answer(await knock(SETUP, { what: "forwarding", by: "ada@example.com" })), [
      200,
      { ok: true, what: "forwarding", tenant: "harbor-moving" },
    ]);
    const forwarding = net.mail()[2];
    assert.equal(forwarding.subject, "Harbor Moving asked for help setting up forwarding in their office phone system");
    assert.match(forwarding.text, /before any voicemail/, "the one thing that keeps calls away");
  } finally {
    net.restore();
  }
});

test("setup-request: a transport that refuses is a 502 the dashboard shrugs at -- the ask is already on record -- and without the transport's key nothing is even attempted", async () => {
  use(world());
  const refused = wire(() => ({ status: 401, body: { statusCode: 401, message: "API key is invalid" } }));
  try {
    assert.deepEqual(
      await answer(await knock(SETUP, { what: "line" })),
      [502, { ok: false, what: "line", tenant: "harbor-moving" }],
      "asked, and Resend said no",
    );
    assert.equal(refused.seen.length, 1);
  } finally {
    refused.restore();
  }
  const down = wire(() => {
    throw new TypeError("fetch failed");
  });
  try {
    assert.deepEqual(
      await answer(await knock(SETUP, { what: "line" })),
      [502, { ok: false, what: "line", tenant: "harbor-moving" }],
      "a transport that cannot be reached is the same shrug, not a throw",
    );
  } finally {
    down.restore();
  }
  const none = unreachable("without a key nothing may be attempted");
  try {
    await withEnv({ RESEND_API_KEY: undefined }, async () => {
      assert.deepEqual(await answer(await knock(SETUP, { what: "line" })), [
        502,
        { ok: false, what: "line", tenant: "harbor-moving" },
      ]);
    });
    assert.equal(none.seen.length, 0, "no key, no request");
  } finally {
    none.restore();
  }
});

/* ------------------------------ signup-notify ----------------------------- */

test("signup-notify: a workspace on record and its owner's address, or nothing; the platform hears the name, the slug, the owner, the zone, the id and when -- and that nothing is provisioned until they ask", async () => {
  const tables = world();
  const db = use(tables);
  const net = wire();
  try {
    const bad = [400, { ok: false, error: "tenant_id and email are required" }];
    assert.deepEqual(await answer(await knock(SIGNUP, {})), bad, "no address");
    assert.deepEqual(await answer(await knock(SIGNUP, { email: "   " })), bad, "a blank one");
    assert.deepEqual(await answer(await knock(SIGNUP, "not json")), bad);
    await keyed(async () => {
      assert.deepEqual(
        await answer(await knock(SIGNUP, { email: "owner@example.com" }, { "x-diag-key": KEY })),
        bad,
        "a key holder must name the workspace",
      );
    });
    assert.equal(db.seen.length, 0, "refused before the workspace is read");
    assert.deepEqual(
      await answer(
        await knock(SIGNUP, { email: "owner@example.com" }, { "x-edge-token": token(SIGNUP, { workspace: GHOST }) }),
      ),
      [404, { ok: false, error: "no such workspace" }],
    );
    assert.equal(net.seen.length, 0, "nothing sent for any refusal");

    const readsBefore = db.seen.length;
    const [status, body] = await answer(await knock(SIGNUP, { email: "  owner@example.com  " }));
    assert.deepEqual([status, body], [200, { ok: true, tenant: "harbor-moving" }]);
    assert.equal(net.seen.length, 1);
    const [req] = net.seen;
    assert.equal(req.url, "https://api.resend.com/emails");
    assert.equal(req.headers.Authorization, "Bearer re_test_only");
    const m = req.body;
    assert.equal(m.from, "Pager <pager@platform.test>");
    assert.deepEqual(
      m.to,
      ["ops@platform.test", "second@platform.test"],
      "the platform's own mailboxes: about a workspace, not addressed to one",
    );
    assert.equal(m.subject, "New workspace: Harbor Moving");
    assert.equal(
      m.text,
      `Harbor Moving (harbor-moving) signed up.\nOwner: owner@example.com\nTime zone: America/New_York\nWorkspace id: ${A}\nCreated: 2026-09-13T14:00:00Z\n\nTheir Setup page tells them what to do next; nothing is provisioned until they ask.\n`,
      "the owner's address as given, trimmed; the workspace's own facts; no customer content exists yet and none is here",
    );
    assert.deepEqual(asked(db).slice(readsBefore), ["tenants.select"], "the workspace's row is the only thing read");
    assert.ok(
      asked(db).every((q) => q === "tenants.select"),
      "and nothing else was, for any refusal either",
    );
    assert.deepEqual(tables.notifications, [], "a platform notice has no workspace and so no bell");

    await keyed(async () => {
      assert.deepEqual(
        await answer(await knock(SIGNUP, { tenant_id: B, email: "b@example.com" }, { "x-diag-key": KEY })),
        [200, { ok: true, tenant: "billing-probe" }],
      );
    });
    assert.equal(net.mail()[1].subject, "New workspace: Billing probe");
    assert.match(net.mail()[1].text, /\nOwner: b@example\.com\nTime zone: Europe\/Madrid\n/);
  } finally {
    net.restore();
  }
});

test("signup-notify: a transport that refuses is a 502 -- the workspace exists and its owner is in it -- and without the transport's key nothing is attempted", async () => {
  use(world());
  const refused = wire(() => ({ status: 500, body: { message: "internal" } }));
  try {
    assert.deepEqual(await answer(await knock(SIGNUP, { email: "owner@example.com" })), [
      502,
      { ok: false, tenant: "harbor-moving" },
    ]);
    assert.equal(refused.seen.length, 1);
  } finally {
    refused.restore();
  }
  const none = unreachable("without a key nothing may be attempted");
  try {
    await withEnv({ RESEND_API_KEY: undefined }, async () => {
      assert.deepEqual(await answer(await knock(SIGNUP, { email: "owner@example.com" })), [
        502,
        { ok: false, tenant: "harbor-moving" },
      ]);
    });
    assert.equal(none.seen.length, 0, "no key, no request");
  } finally {
    none.restore();
  }
});
