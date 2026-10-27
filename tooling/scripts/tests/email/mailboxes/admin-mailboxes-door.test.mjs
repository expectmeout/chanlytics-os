/**
 * The mailboxes door, run (decision 0056): POST /api/admin/mailboxes over a database in memory, the providers' token
 * endpoints, Gmail, Graph and DNS answered by the test. Who may knock (a token minted for this door, about this
 * workspace), and each op:
 *   readiness  the providers this deployment offers, and only the public half of each client;
 *   connect    the code exchanged; a grant without send and read, without lasting access, or of a free mailbox refused
 *              and given back; the mailbox's row made, its token kept in Vault and never on the row, its records read,
 *              the Activity log told; a mailbox another workspace holds refused by the database's own word;
 *   pause, unpause, resume, settings, test, check, remove   each from the states it may, each answering the page's row.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { MAILBOX_ENV, b64url, dnsAnswers, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const SECRET = "edge-secret-for-this-file";
const restore = withEnv({ ...MAILBOX_ENV, EDGE_CALL_SECRET: SECRET, DIAG_KEY: null, VERCEL_ENV: null });
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const door = await importSrc("apps/edge/api/admin/mailboxes.ts");
let dnsRestore = () => {};
after(() => {
  setPg(null);
  dnsRestore();
  restore();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const AUD = "/api/admin/mailboxes";

/** DNS for getharbor.example: SPF names Google, DKIM published, no DMARC; every other name has nothing. */
beforeEach(() => {
  dnsRestore();
  dnsRestore = dnsAnswers({
    txt: async (name) => {
      if (name === "getharbor.example") return [["v=spf1 include:_spf.google.com ~all"]];
      if (name === "google._domainkey.getharbor.example") return [["v=DKIM1; k=rsa; p=MIGf"]];
      throw Object.assign(new Error("none"), { code: "ENODATA" });
    },
    mx: async () => [{ exchange: "aspmx.l.google.com", priority: 1 }],
  });
});

/** The workspace, its website on another host (so a mailbox on getharbor.example is not its customer domain). */
function world({ boxes = [], refuse = null, creds = {}, said = [] } = {}) {
  const v = vault(creds);
  const tables = {
    tenants: [{ id: A, name: "Harbor Moving" }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving",
            system_prompt: "You answer for Harbor Moving, a moving company in Austin, Texas.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { website: "https://harbormoving.example" },
          },
        },
      },
    ],
    mailbox_connections: boxes,
    events: [],
    notifications: [],
    // 00483: what the workspace said of its senders.
    mailbox_senders: said.map(([sender, verdict]) => ({ tenant_id: A, sender, verdict })),
  };
  const kept = [];
  const rpcs = {
    ...v.rpcs,
    // 00478: a message from before Chanlytics, once by its provider id.
    ingest_before: (a) => {
      const again = kept.some((k) => k.p_message_external_id === a.p_message_external_id);
      if (!again) kept.push(a);
      return { is_new: !again, conversation_id: `c-${a.p_external}`, contact_id: `p-${a.p_external}`, person: "known" };
    },
    // 00423's connect: made, or found again; its refusals by their hint.
    mailbox_connection_connect: (a) => {
      if (refuse) throw Object.assign(new Error(refuse.message), { code: "P0001", hint: refuse.hint });
      const was = tables.mailbox_connections.find(
        (m) => m.tenant_id === a.p_tenant_id && m.provider_account === a.p_account && m.state !== "removed",
      );
      if (was) {
        Object.assign(was, { state: "connected" });
        return { id: was.id, made: false, state: "connected" };
      }
      const row = rows.mailboxConnection({
        tenant_id: a.p_tenant_id,
        provider: a.p_provider,
        provider_account: a.p_account,
        address: a.p_address,
        host: a.p_address.split("@")[1],
        from_name: a.p_from_name,
        scopes: a.p_scopes,
        customer_domain: a.p_customer_domain,
        connected_by: a.p_user_id,
      });
      tables.mailbox_connections.push(row);
      return { id: row.id, made: true, state: "connected" };
    },
  };
  setPg(fakeDb(tables, {}, rpcs));
  return { tables, secrets: v.secrets, kept };
}
async function ask(body) {
  const raw = JSON.stringify({ tenant_id: A, user_id: U, ...body });
  const res = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace: A, user: U, body: raw }),
      },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}
/** Google's id token, as its token endpoint answers it (unsigned here: it came over TLS from the endpoint itself). */
const idToken = (claims) => `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.`;
const SCOPES =
  "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
const grant = (over = {}) => ({
  access_token: "ya29.fresh",
  refresh_token: "1//fresh",
  expires_in: 3599,
  scope: SCOPES,
  token_type: "Bearer",
  id_token: idToken({
    sub: "100000000000000000009",
    email: "Sam@GetHarbor.example",
    name: "Sam Rivera",
    email_verified: true,
    hd: "getharbor.example",
  }),
  ...over,
});
/** The profile of a Google account with no Gmail behind it (a consumer account made with a business address). */
const NO_GMAIL = {
  status: 400,
  json: { error: { code: 400, message: "Mail service not enabled", errors: [{ reason: "failedPrecondition" }] } },
};
/**
 * Google answering: its token endpoint with `g`, its revoke, and the profile (the connect's look for a mailbox, and the
 * cursor a watch starts from).
 */
const google = (g = grant(), profile = { json: { emailAddress: "sam@getharbor.example", historyId: "4242" } }) =>
  providers((c) => {
    if (c.url === "https://oauth2.googleapis.com/token") return { json: g };
    if (c.url === "https://oauth2.googleapis.com/revoke") return { json: {} };
    if (c.url.endsWith("/profile")) return profile;
    return { status: 404 };
  });

test("who may knock: a token for this door about this workspace; the key alone, or another workspace's token, opens nothing", async () => {
  world();
  const raw = JSON.stringify({ op: "readiness", tenant_id: A });
  const keyOnly = await door.POST(new Request(`http://edge${AUD}`, { method: "POST", body: raw }));
  assert.equal(keyOnly.status, 403);
  const theirs = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", body: raw }),
      },
      body: raw,
    }),
  );
  assert.equal(theirs.status, 403);
});

test("readiness: the providers offered here, and only the public half of each client", async () => {
  world();
  const [status, body] = await ask({ op: "readiness" });
  assert.equal(status, 200);
  assert.deepEqual(body.providers, ["google", "microsoft"]);
  assert.deepEqual(body.oauth.google, {
    client_id: MAILBOX_ENV.GOOGLE_MAIL_CLIENT_ID,
    redirect_uri: MAILBOX_ENV.MAILBOX_OAUTH_REDIRECT,
  });
  assert.ok(!JSON.stringify(body).includes(MAILBOX_ENV.GOOGLE_MAIL_CLIENT_SECRET), "never a secret");
  assert.equal(body.audience, null, "Google's consent screen unsaid where the deployment says nothing of it");
  const said = withEnv({ GOOGLE_OAUTH_AUDIENCE: "unverified" });
  try {
    assert.equal((await ask({ op: "readiness" }))[1].audience, "unverified", "the Business Profile app's own (R18)");
  } finally {
    said();
  }
  const back = withEnv({ MICROSOFT_MAIL_CLIENT_SECRET: null });
  try {
    assert.deepEqual(
      (await ask({ op: "readiness" }))[1].providers,
      ["google"],
      "a client without its secret is not offered",
    );
  } finally {
    back();
  }
});

test("connect: the code exchanged, the mailbox's row made, its token in Vault and never on the row, its records read, the log told", async () => {
  const w = world();
  const net = google();
  try {
    const [status, body] = await ask({ op: "connect", provider: "google", code: "4/code" });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.made, true);
    assert.deepEqual(
      [
        body.mailbox.address,
        body.mailbox.provider,
        body.mailbox.state,
        body.mailbox.from_name,
        body.mailbox.customer_domain,
      ],
      ["sam@getharbor.example", "google", "connected", "Sam Rivera", false],
    );
    assert.deepEqual(body.mailbox.dns, { spf: "found", dkim: "found", dmarc: "missing", mx: "found" });
    assert.ok(!JSON.stringify(body).includes("1//fresh"), "the page is never told a token");
    const row = w.tables.mailbox_connections[0];
    assert.equal(w.secrets.get(row.id).refresh_token, "1//fresh", "kept in Vault");
    assert.equal(row.sync_cursor, "4242", "its cursor starts now: nothing already in the inbox is read");
    assert.deepEqual(
      w.tables.events.map((e) => [e.kind, e.data.address, e.data.again]),
      [["mailbox_connection.connected", "sam@getharbor.example", false]],
    );
    const exchange = Object.fromEntries(new URLSearchParams(net.calls[0].body));
    assert.deepEqual([exchange.code, exchange.grant_type], ["4/code", "authorization_code"]);
    assert.equal(exchange.code_verifier, undefined, "no verifier handed, none sent");
    // The same account again is the same row, connected again; Google's consent asked with PKCE carries its verifier.
    const verifier = "v".repeat(43);
    const [, again] = await ask({ op: "connect", provider: "google", code: "4/again", code_verifier: verifier });
    const exchanged = net.calls.filter((c) => c.url === "https://oauth2.googleapis.com/token").at(-1);
    assert.equal(Object.fromEntries(new URLSearchParams(exchanged.body)).code_verifier, verifier);
    const [bad] = await ask({ op: "connect", provider: "google", code: "4/x", code_verifier: "short" });
    assert.equal(bad, 400, "a verifier that is not one is refused before Google is asked");
    assert.equal(again.made, false);
    assert.equal(w.tables.mailbox_connections.length, 1);
  } finally {
    net.restore();
  }
});

test("connect refused: no send and read, no lasting access, a free mailbox, another workspace's, past the limits; each grant given back", async () => {
  const cases = [
    [
      grant({ scope: "openid email profile https://www.googleapis.com/auth/gmail.send" }),
      null,
      400,
      "scope_missing",
      "scopes_missing",
    ],
    [grant({ refresh_token: undefined }), null, 400, "no_refresh_token", "no_refresh_token"],
    [
      grant({ id_token: idToken({ sub: "1", email: "sam@gmail.com", email_verified: true }) }),
      null,
      400,
      "free_mail",
      "free_mail",
    ],
    [
      grant({
        id_token: idToken({ sub: "1", email: "sam@getharbor.example", email_verified: false, hd: "getharbor.example" }),
      }),
      null,
      400,
      "no_account",
      "unverified",
    ],
    [
      grant({ id_token: idToken({ sub: "1", email: "sam@getharbor.example", email_verified: "true" }) }),
      null,
      400,
      "no_account",
      "not_workspace",
    ],
    [grant(), null, 400, "no_account", "no_mailbox", NO_GMAIL],
    [grant(), { hint: "taken", message: "This mailbox writes for another workspace." }, 409, "mailbox_taken", "taken"],
    [grant(), { hint: "too_many", message: "Ten is the most." }, 409, "too_many", "too_many"],
    [
      grant(),
      { hint: "too_many_on_domain", message: "Three on one domain." },
      409,
      "too_many_on_domain",
      "too_many_on_domain",
    ],
  ];
  for (const [g, refuse, status, code, reason, profile] of cases) {
    const w = world({ refuse });
    const net = google(g, profile);
    try {
      const [s, body] = await ask({ op: "connect", provider: "google", code: "4/code" });
      assert.deepEqual([s, body.error, body.reason], [status, code, reason], reason);
      assert.deepEqual(w.tables.mailbox_connections, [], `${reason}: no row`);
      assert.equal(w.secrets.size, 0, `${reason}: no token kept`);
      assert.equal(
        net.calls.filter((c) => c.url === "https://oauth2.googleapis.com/revoke").length,
        1,
        `${reason}: the grant given back`,
      );
    } finally {
      net.restore();
    }
  }
  world();
  assert.deepEqual((await ask({ op: "connect", provider: "yahoo", code: "c" }))[0], 400);
});

test("a Reconnect is for its own mailbox: another account signed in connects nothing, and the signed-out one stays to be fixed", async () => {
  const box = rows.mailboxConnection({ tenant_id: A, state: "reconnect", provider: "google", provider_account: "999" });
  const w = world({ boxes: [box] });
  const net = google();
  try {
    const [s, body] = await ask({ op: "connect", provider: "google", code: "4/code", mailbox_id: box.id });
    assert.deepEqual([s, body.error, body.reason], [400, "no_account", "wrong_account"]);
    assert.deepEqual(
      w.tables.mailbox_connections.map((m) => [m.id, m.state]),
      [[box.id, "reconnect"]],
    );
    assert.equal(w.secrets.size, 0);
    assert.equal(net.calls.filter((c) => c.url === "https://oauth2.googleapis.com/revoke").length, 1);
    assert.equal((await ask({ op: "connect", provider: "google", code: "4/code", mailbox_id: "nope" }))[0], 400);
  } finally {
    net.restore();
  }
});

test("a token Vault would not keep leaves no row saying connected: a new mailbox goes, its grant given back", async () => {
  const w = world();
  const net = google();
  try {
    // The vault's door refuses the write (a Vault outage), not the compare-and-set's 40001.
    setPg(
      fakeDb(
        w.tables,
        {},
        {
          ...vault().rpcs,
          put_mailbox_credentials: () => {
            throw new Error("vault: connection refused");
          },
          mailbox_connection_connect: (a) => {
            const row = rows.mailboxConnection({
              tenant_id: a.p_tenant_id,
              provider: a.p_provider,
              provider_account: a.p_account,
              address: a.p_address,
              host: a.p_address.split("@")[1],
            });
            w.tables.mailbox_connections.push(row);
            return { id: row.id, made: true, state: "connected" };
          },
        },
      ),
    );
    const [s, body] = await ask({ op: "connect", provider: "google", code: "4/code" });
    assert.deepEqual([s, body.reason], [502, "failed"]);
    assert.deepEqual(
      w.tables.mailbox_connections.map((m) => m.state),
      ["removed"],
      "nothing says connected without its token",
    );
    assert.equal(net.calls.filter((c) => c.url === "https://oauth2.googleapis.com/revoke").length, 1);
  } finally {
    net.restore();
  }
});

test("the owner's verbs: each from the states it may, each answering the page's row; another workspace's mailbox is not found", async () => {
  const box = rows.mailboxConnection({ tenant_id: A, state: "connected" });
  const w = world({ boxes: [box], creds: { [box.id]: liveCredentials("ya29.sam") } });
  const id = box.id;
  let [s, body] = await ask({ op: "pause", mailbox_id: id });
  assert.deepEqual([s, body.mailbox.state], [200, "paused"]);
  assert.deepEqual((await ask({ op: "pause", mailbox_id: id }))[1].error, "not_connected", "paused already");
  [s, body] = await ask({ op: "unpause", mailbox_id: id });
  assert.deepEqual([s, body.mailbox.state], [200, "connected"]);
  assert.deepEqual((await ask({ op: "resume", mailbox_id: id }))[1].error, "not_held");
  Object.assign(w.tables.mailbox_connections[0], {
    state: "held",
    held_why: "bounces",
    held_at: "2026-10-12T00:00:00Z",
  });
  [s, body] = await ask({ op: "resume", mailbox_id: id });
  assert.deepEqual([s, body.mailbox.state, body.mailbox.held_why], [200, "connected", null]);
  assert.ok(w.tables.mailbox_connections[0].counted_since > "2026-10-12", "its count starts again");
  [s, body] = await ask({
    op: "settings",
    mailbox_id: id,
    from_name: "Sam at Harbor",
    daily_cap: 30,
    signature: "Sam",
  });
  assert.deepEqual(
    [s, body.mailbox.from_name, body.mailbox.daily_cap, body.mailbox.signature],
    [200, "Sam at Harbor", 30, "Sam"],
  );
  assert.deepEqual((await ask({ op: "settings", mailbox_id: id, daily_cap: 80 }))[1], {
    ok: false,
    error: "invalid",
    detail: "bad_cap",
  });
  [s, body] = await ask({ op: "check", mailbox_id: id });
  assert.deepEqual([s, body.mailbox.dns.dmarc], [200, "missing"]);
  assert.deepEqual(
    w.tables.events.map((e) => e.kind),
    ["mailbox_connection.paused", "mailbox_connection.unpaused", "mailbox_connection.resumed"],
  );
  assert.equal((await ask({ op: "pause", mailbox_id: "22222222-2222-4222-8222-222222222222" }))[0], 404);
  assert.equal((await ask({ op: "wave", mailbox_id: id }))[1].error, "unknown_op");
});

test("a test goes from the mailbox to itself through its own provider; remove ends its watch, gives its grant back and drops its token", async () => {
  const box = rows.mailboxConnection({ tenant_id: A });
  const w = world({ boxes: [box], creds: { [box.id]: liveCredentials("ya29.sam") } });
  const net = providers((c) => {
    if (c.url.endsWith("/messages/send")) return { json: { id: "g-test", threadId: "t" } };
    if (c.url.includes("/messages/g-test")) return { json: { payload: { headers: [] } } };
    if (c.url.endsWith("/stop") || c.url.endsWith("/revoke")) return { json: {} };
    return { status: 404 };
  });
  try {
    const [s, body] = await ask({ op: "test", mailbox_id: box.id });
    assert.deepEqual([s, body], [200, { ok: true, sent: true }]);
    const raw = Buffer.from(JSON.parse(net.calls[0].body).raw, "base64url").toString("utf8");
    assert.match(raw, /^To: sam@getharbor\.example\r$/m, "to itself");
    const [rs, rbody] = await ask({ op: "remove", mailbox_id: box.id });
    assert.deepEqual([rs, rbody], [200, { ok: true, removed: true }]);
    assert.equal(w.tables.mailbox_connections[0].state, "removed");
    assert.equal(w.secrets.has(box.id), false, "its token dropped");
    assert.ok(
      net.calls.some((c) => c.url.endsWith("/stop")),
      "its watch ended",
    );
    assert.ok(
      net.calls.some((c) => c.url.endsWith("/revoke")),
      "its grant given back",
    );
    assert.equal((await ask({ op: "pause", mailbox_id: box.id }))[0], 404, "a removed mailbox is not found");
  } finally {
    net.restore();
  }
});

test("bring in: a sender the owner said is a person, their mail of the six months and since read through each mailbox and kept in their thread, once", async () => {
  const box = rows.mailboxConnection({ tenant_id: A, connected_at: "2026-10-20T15:00:00Z" });
  const w = world({
    boxes: [box],
    creds: { [box.id]: liveCredentials("ya29.sam") },
    said: [["rosa@example.com", "person"]],
  });
  const message = (id) => ({
    id,
    threadId: `t-${id}`,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    internalDate: String(Date.parse("2026-10-21T10:00:00Z")),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Rosa Diaz <rosa@example.com>" },
        { name: "To", value: "sam@getharbor.example" },
        { name: "Subject", value: "Signed: moving quote" },
        { name: "Message-ID", value: `<${id}@example.com>` },
      ],
      body: { data: b64url("Signed and sent back.") },
    },
  });
  const net = providers((c) => {
    if (c.url.includes("/messages?"))
      return {
        json: {
          messages: [
            { id: "q1", threadId: "t-q1" },
            { id: "q2", threadId: "t-q2" },
          ],
        },
      };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    return id ? { json: message(id) } : { status: 404 };
  });
  try {
    const [s, body] = await ask({ op: "bring_in", address: "Rosa@Example.com" });
    assert.deepEqual([s, body], [200, { ok: true, kept: 2 }]);
    const list = new URL(net.calls.find((c) => c.url.includes("/messages?")).url);
    assert.match(list.searchParams.get("q"), /^after:\d+ before:\d+ from:rosa@example\.com$/, "only their mail");
    assert.deepEqual(
      w.kept.map((k) => [k.p_external, k.p_direction, k.p_message_external_id]),
      [
        ["rosa@example.com", "inbound", "q1"],
        ["rosa@example.com", "inbound", "q2"],
      ],
      "Gmail filing them under Updates leaves nothing: the owner said they are a person",
    );
    const [again] = await ask({ op: "bring_in", address: "rosa@example.com" });
    assert.equal(again, 200);
    assert.equal(w.kept.length, 2, "kept once by their provider id");
    assert.equal((await ask({ op: "bring_in", address: "not an address" }))[0], 400);
  } finally {
    net.restore();
  }
});
