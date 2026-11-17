/**
 * A Google grant is given back only when nothing else rides it (apps/edge/lib/shared/google/give-back.ts).
 *
 * Google does not revoke one token. Its OAuth guide ("Token revocation") says a revoke removes every scope the Google
 * account gave the whole project and ends every token issued under it, whichever client asked. The Business Profile and
 * the Gmail mailboxes are one Google project (decision 0073, R18), so a grant handed back for one ended the other: an
 * owner whose mailbox was connected, and whose Business Profile connect was refused for having no listing, lost the
 * mailbox without a word; so did one who disconnected the profile, and one whose mailbox another workspace tried to
 * connect.
 *
 * Run over a database in memory with Google answered by the test: the rule alone, then each way a grant is handed back
 * (a profile's disconnect, a profile connect that is refused or cannot keep its token, a mailbox's removal, a mailbox
 * connect that is refused), each with another connection on the same Google account and without one.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { MAILBOX_ENV, b64url, liveCredentials, vault, withEnv } from "../email/mailboxes/_mailbox-world.mjs";

const restore = withEnv({
  ...MAILBOX_ENV,
  GOOGLE_OAUTH_CLIENT_ID: "profile-client.apps.example",
  GOOGLE_OAUTH_CLIENT_SECRET: "profile-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/api/v1/google/callback",
  SUPABASE_URL: null,
  SUPABASE_SERVICE_ROLE_KEY: null,
  RESEND_API_KEY: null,
});

/* ----------------------------------------------------------------------------------------------------- the wire */

const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";

/**
 * Every request that leaves, kept and answered by the case's `answer`. Installed before the imports on purpose: the
 * profile's transport takes `fetch` as it is when its module loads.
 */
const wire = { calls: [], answer: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const call = { url: String(url), method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : "" };
  wire.calls.push(call);
  const a = (await wire.answer?.(call)) ?? { status: 404, json: {} };
  return new Response(JSON.stringify(a.json ?? {}), {
    status: a.status ?? 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
  restore();
});

const { giveGoogleGrantBack } = await import("../../apps/edge/lib/shared/google/give-back.ts");
const { connectProfile, disconnectProfile } = await import("../../apps/edge/lib/google/profile-connection.ts");
const { removeMailbox, runMailboxConnect } = await import("../../apps/edge/lib/connections/mailbox-connect.ts");

/** The tokens Google was asked to take back, in order. */
const givenBack = () => wire.calls.filter((c) => c.url === REVOKE).map((c) => new URLSearchParams(c.body).get("token"));

/**
 * Google, as a case has it: the grant its token endpoint answers, a revoke it takes, one account with `locations`, a
 * Gmail profile and a watch that stops.
 */
function google({ grant = {}, locations = [{ name: "locations/1", title: "Harbor Moving" }], accounts = 200 } = {}) {
  wire.calls = [];
  wire.answer = (c) => {
    const path = c.url.split("?")[0];
    if (path === TOKEN) return { json: grant };
    if (path === REVOKE) return { json: {} };
    if (path.endsWith("/v1/accounts"))
      return accounts === 200
        ? { json: { accounts: [{ name: "accounts/1", accountName: "Harbor" }] } }
        : { status: accounts, json: { error: { message: "boom" } } };
    if (path.endsWith("/locations")) return { json: { locations } };
    if (path.endsWith("/profile")) return { json: { emailAddress: "sam@getharbor.example", historyId: "42" } };
    if (path.endsWith("/stop")) return { json: {} };
    return { status: 404, json: {} };
  };
}

/* ---------------------------------------------------------------------------------------------------- the world */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "11111111-1111-4111-8111-111111111111";
/** One Google account, as Google names it in an id token (`sub`), and another. */
const SAM = "100000000000000000042";
const ADA = "100000000000000000077";
const NOW = new Date("2026-11-17T15:00:00Z");

/** A workspace's Business Profile, connected with this Google account. */
const profile = (tenantId, account, over = {}) =>
  rows.googleConnection({
    tenant_id: tenantId,
    google_sub: account,
    google_email: "sam@getharbor.example",
    location_name: "locations/1",
    location_title: "Harbor Moving",
    ...over,
  });
/** A workspace's Gmail mailbox, connected with this Google account. */
const mailbox = (tenantId, account, over = {}) =>
  rows.mailboxConnection({ tenant_id: tenantId, provider: "google", provider_account: account, ...over });

/** An id token as the token endpoint answers it (unsigned here: it came over TLS from the endpoint itself). */
const idToken = (claims) => `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.`;
const PROFILE_SCOPE = "openid email https://www.googleapis.com/auth/business.manage";
const MAIL_SCOPE =
  "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
/** The grant a Business Profile consent comes back with, for this account. */
const profileGrant = (account, over = {}) => ({
  access_token: "at-profile",
  refresh_token: "rt-profile",
  expires_in: 3600,
  scope: PROFILE_SCOPE,
  id_token: idToken({ sub: account, email: "sam@getharbor.example" }),
  ...over,
});
/** The grant a mailbox consent comes back with, for this account: a verified address on a Google Workspace domain. */
const mailGrant = (account, claims = {}, over = {}) => ({
  access_token: "at-mail",
  refresh_token: "rt-mail",
  expires_in: 3600,
  scope: MAIL_SCOPE,
  id_token: idToken({
    sub: account,
    email: "sam@getharbor.example",
    name: "Sam Rivera",
    email_verified: true,
    hd: "getharbor.example",
    ...claims,
  }),
  ...over,
});

/** The profile's Vault doors over one workspace's token; `put` may be made to fail. */
function profileVault(held = null, put = () => null) {
  const state = { held, drops: 0 };
  return {
    state,
    rpcs: {
      get_google_credentials: () => state.held,
      put_google_credentials: (a) => put(a),
      drop_google_credentials: () => {
        state.held = null;
        state.drops++;
        return true;
      },
    },
  };
}
const PROFILE_TOKEN = { refresh_token: "rt-kept", access_token: "at-kept", expires_at: NOW.getTime() + 3_600_000 };

/* ----------------------------------------------------------------------------------------------------- the rule */

/** The rule asked over these tables: what it answered, and the tokens it handed to Google. */
async function ruled(tables, grant, answer = async () => ({ status: 200 })) {
  const asked = [];
  const outcome = await giveGoogleGrantBack(fakeDb(tables), { token: "rt", ...grant }, async (token) => {
    asked.push(token);
    return answer();
  });
  return [outcome, asked];
}

test("a grant nothing else rides is given back; one Google would not take is said so", async () => {
  assert.deepEqual(await ruled({}, { account: SAM }), ["given", ["rt"]]);
  assert.deepEqual(
    await ruled({ google_connections: [profile(B, ADA)], mailbox_connections: [mailbox(B, ADA)] }, { account: SAM }),
    ["given", ["rt"]],
    "another Google account's connections share nothing with this one",
  );
  assert.deepEqual(await ruled({}, { account: SAM }, async () => ({ status: 400 })), ["refused", ["rt"]]);
  assert.deepEqual(
    await ruled({}, { account: SAM }, async () => {
      throw new Error("no answer");
    }),
    ["refused", ["rt"]],
    "a Google that could not be reached took nothing back",
  );
});

test("a grant a Business Profile rides, in any workspace, is kept: Google is not asked", async () => {
  assert.deepEqual(await ruled({ google_connections: [profile(A, SAM)] }, { account: SAM }), ["held", []]);
  assert.deepEqual(
    await ruled({ google_connections: [profile(B, SAM)] }, { account: SAM }),
    ["held", []],
    "another workspace's profile is ended by the same revoke",
  );
});

test("a grant a mailbox rides is kept while the mailbox is not removed; a removed one, or Microsoft's, holds nothing of Google's", async () => {
  for (const state of ["connected", "paused", "reconnect"])
    assert.deepEqual(
      await ruled({ mailbox_connections: [mailbox(B, SAM, { state })] }, { account: SAM }),
      ["held", []],
      state,
    );
  assert.deepEqual(
    await ruled(
      { mailbox_connections: [mailbox(A, SAM, { state: "held", held_why: "bounces", held_at: NOW.toISOString() })] },
      { account: SAM },
    ),
    ["held", []],
    "a mailbox on hold still reads its mail",
  );
  assert.deepEqual(
    await ruled(
      { mailbox_connections: [mailbox(A, SAM, { state: "removed", removed_at: NOW.toISOString() })] },
      { account: SAM },
    ),
    ["given", ["rt"]],
    "a removed mailbox keeps its row and no token",
  );
  assert.deepEqual(
    await ruled({ mailbox_connections: [mailbox(A, SAM, { provider: "microsoft" })] }, { account: SAM }),
    ["given", ["rt"]],
    "Microsoft's id for an account is not Google's",
  );
});

test("the connection that is leaving does not hold its own grant; another on the same account still does", async () => {
  const box = mailbox(A, SAM);
  assert.deepEqual(await ruled({ google_connections: [profile(A, SAM)] }, { account: SAM, leaving: { profile: A } }), [
    "given",
    ["rt"],
  ]);
  assert.deepEqual(
    await ruled({ google_connections: [profile(A, SAM), profile(B, SAM)] }, { account: SAM, leaving: { profile: A } }),
    ["held", []],
    "the other workspace's profile",
  );
  assert.deepEqual(await ruled({ mailbox_connections: [box] }, { account: SAM, leaving: { mailbox: box.id } }), [
    "given",
    ["rt"],
  ]);
  assert.deepEqual(
    await ruled({ mailbox_connections: [box, mailbox(B, SAM)] }, { account: SAM, leaving: { mailbox: box.id } }),
    ["held", []],
    "the other workspace's mailbox",
  );
  assert.deepEqual(
    await ruled(
      { google_connections: [profile(A, SAM)], mailbox_connections: [box] },
      { account: SAM, leaving: { mailbox: box.id } },
    ),
    ["held", []],
    "a mailbox leaving does not excuse the profile beside it",
  );
});

test("a grant whose Google account is not known, or whose holders could not be read, is kept: not knowing is not alone", async () => {
  assert.deepEqual(await ruled({}, { account: null }), ["unknown", []]);
  assert.deepEqual(await ruled({}, { account: "" }), ["unknown", []]);
  const asked = [];
  const down = fakeDb({}, { "mailbox_connections.select": { message: "the database is away" } });
  assert.equal(
    await giveGoogleGrantBack(down, { account: SAM, token: "rt" }, async (t) => {
      asked.push(t);
      return { status: 200 };
    }),
    "unknown",
  );
  assert.deepEqual(asked, [], "could not check is not a yes");
});

/* --------------------------------------------------------------------------------- the profile, disconnected */

test("disconnecting a Business Profile whose Google account also runs a mailbox drops our token and the row, and leaves the grant with Google", async () => {
  for (const [where, box] of [
    ["the same workspace's mailbox", mailbox(A, SAM)],
    ["another workspace's mailbox", mailbox(B, SAM)],
  ]) {
    const tables = { google_connections: [profile(A, SAM)], mailbox_connections: [box] };
    const v = profileVault(PROFILE_TOKEN);
    google();
    assert.deepEqual(
      await disconnectProfile(fakeDb(tables, {}, v.rpcs), A, U),
      { ok: true, removed: true, revoked: false },
      where,
    );
    assert.deepEqual(givenBack(), [], `${where}: a revoke would have signed the mailbox out`);
    assert.deepEqual(
      [tables.google_connections, v.state.held, v.state.drops],
      [[], null, 1],
      "ours is gone all the same",
    );
    assert.equal(tables.mailbox_connections[0].state, "connected");
    assert.equal(tables.events.at(-1).data.revoked, false, "and the ledger says the grant was not given back");
  }
});

test("disconnecting a Business Profile that is the Google account's only connection gives the grant back", async () => {
  const tables = {
    google_connections: [profile(A, SAM)],
    mailbox_connections: [mailbox(A, ADA), mailbox(B, SAM, { state: "removed", removed_at: NOW.toISOString() })],
  };
  const v = profileVault(PROFILE_TOKEN);
  google();
  assert.deepEqual(await disconnectProfile(fakeDb(tables, {}, v.rpcs), A, U), {
    ok: true,
    removed: true,
    revoked: true,
  });
  assert.deepEqual(givenBack(), ["rt-kept"], "the refresh token: the whole grant");
  assert.deepEqual([tables.google_connections, v.state.held], [[], null]);
});

/* -------------------------------------------------------------------------------------- the profile, refused */

/** Each way a profile connect is refused after Google made a grant: its code, and Google as that case has it. */
const REFUSALS = [
  ["scope_missing", { grant: profileGrant(SAM, { scope: "openid email" }) }],
  ["no_refresh_token", { grant: profileGrant(SAM, { refresh_token: undefined }) }],
  ["accounts_unreadable", { grant: profileGrant(SAM), accounts: 500 }],
  ["no_locations", { grant: profileGrant(SAM), locations: [] }],
  ["not_on_maps", { grant: profileGrant(SAM) }],
];

test("a Business Profile connect that is refused leaves the grant with Google while the same account runs a mailbox", async () => {
  for (const [why, as] of REFUSALS) {
    const tables = { google_connections: [], mailbox_connections: [mailbox(A, SAM)] };
    google(as);
    const r = await connectProfile(fakeDb(tables, {}, profileVault().rpcs), A, U, "4/code", "America/Chicago", NOW);
    assert.deepEqual([r.ok, r.error], [false, why]);
    assert.deepEqual(givenBack(), [], `${why}: the owner's mailbox rides the same grant`);
    assert.deepEqual(tables.google_connections, [], `${why}: and still nothing is connected`);
  }
});

test("a Business Profile connect that is refused gives the grant back when the account runs nothing else", async () => {
  for (const [why, as] of REFUSALS) {
    const tables = {
      google_connections: [profile(B, ADA)],
      mailbox_connections: [mailbox(A, ADA), mailbox(A, SAM, { state: "removed", removed_at: NOW.toISOString() })],
    };
    google(as);
    const r = await connectProfile(fakeDb(tables, {}, profileVault().rpcs), A, U, "4/code", "America/Chicago", NOW);
    assert.deepEqual([r.ok, r.error], [false, why]);
    assert.equal(givenBack().length, 1, `${why}: nothing of ours rides it`);
  }
});

test("connecting again a profile that works, refused this time, does not end the connection it already has", async () => {
  const tables = { google_connections: [profile(A, SAM)] };
  google({ grant: profileGrant(SAM), accounts: 500 });
  const r = await connectProfile(
    fakeDb(tables, {}, profileVault(PROFILE_TOKEN).rpcs),
    A,
    U,
    "4/code",
    "America/Chicago",
    NOW,
  );
  assert.deepEqual([r.ok, r.error], [false, "accounts_unreadable"]);
  assert.deepEqual(givenBack(), [], "the working connection's token is the same grant");
  assert.equal(tables.google_connections[0].location_name, "locations/1");
});

test("a refused connect whose grant names no Google account is left alone: whose it is cannot be told", async () => {
  google({ grant: profileGrant(SAM, { scope: "openid email", id_token: undefined }) });
  const r = await connectProfile(fakeDb({}, {}, profileVault().rpcs), A, U, "4/code", "America/Chicago", NOW);
  assert.deepEqual([r.ok, r.error], [false, "scope_missing"]);
  assert.deepEqual(givenBack(), []);
});

test("a first connect Vault would not keep leaves no row, and leaves the grant with Google while the same account runs a mailbox", async () => {
  const vaultDown = () => {
    throw new Error("vault unreachable");
  };
  const onMaps = [{ name: "locations/1", title: "Harbor Moving", metadata: { placeId: "place-1" } }];
  for (const [boxes, backs] of [
    [[mailbox(B, SAM)], 0],
    [[], 1],
  ]) {
    const tables = { google_connections: [], mailbox_connections: boxes };
    google({ grant: profileGrant(SAM), locations: onMaps });
    const r = await connectProfile(
      fakeDb(tables, {}, profileVault(null, vaultDown).rpcs),
      A,
      U,
      "4/code",
      "America/Chicago",
      NOW,
    );
    assert.deepEqual([r.ok, r.error], [false, "credentials_failed"]);
    assert.deepEqual(tables.google_connections, [], "a row with no token behind it goes");
    assert.equal(givenBack().length, backs, backs ? "alone: given back" : "the mailbox rides it: kept");
  }
});

/* -------------------------------------------------------------------------------------- the mailbox, removed */

/** A mailbox's world: its token in Vault, and the doors its removal and its connect knock on. */
function mailWorld(tables, { creds = {}, refuse = null } = {}) {
  const v = vault(creds);
  const db = fakeDb(
    tables,
    {},
    {
      ...v.rpcs,
      calendar_grant_note: () => false,
      mailbox_connection_connect: () => {
        throw Object.assign(new Error(refuse ?? "not in this case"), { code: "P0001", hint: refuse ?? "" });
      },
    },
  );
  return { ports: { db, log: fakeLog(), now: () => NOW.getTime() }, secrets: v.secrets };
}

test("removing a mailbox whose Google account also runs a Business Profile ends its watch, drops our token, and leaves the grant with Google", async () => {
  for (const [where, tenant] of [
    ["the same workspace's profile", A],
    ["another workspace's profile", B],
  ]) {
    const box = mailbox(A, SAM);
    const tables = { mailbox_connections: [box], google_connections: [profile(tenant, SAM)] };
    const w = mailWorld(tables, { creds: { [box.id]: liveCredentials("at-live") } });
    google();
    await removeMailbox(w.ports, box, U);
    assert.deepEqual(givenBack(), [], `${where}: a revoke would have ended the profile's token`);
    assert.ok(
      wire.calls.some((c) => c.url.endsWith("/stop")),
      "its watch is ended whatever becomes of the grant",
    );
    assert.deepEqual([tables.mailbox_connections[0].state, w.secrets.has(box.id)], ["removed", false]);
    assert.equal(tables.google_connections.length, 1, "the profile stays as it was");
  }
});

test("removing a mailbox that is the Google account's only connection gives the grant back", async () => {
  const box = mailbox(A, SAM);
  const tables = { mailbox_connections: [box], google_connections: [profile(A, ADA)] };
  const w = mailWorld(tables, { creds: { [box.id]: liveCredentials("at-live") } });
  google();
  await removeMailbox(w.ports, box, U);
  assert.deepEqual(givenBack(), ["at-live"]);
  assert.deepEqual([tables.mailbox_connections[0].state, w.secrets.has(box.id)], ["removed", false]);
});

/* -------------------------------------------------------------------------------------- the mailbox, refused */

test("a mailbox connect that is refused leaves the grant with Google while the same account runs a Business Profile", async () => {
  const cases = [
    ["free_mail", mailGrant(SAM, { email: "sam@gmail.com", hd: undefined })],
    ["not_workspace", mailGrant(SAM, { hd: undefined })],
    ["scopes_missing", mailGrant(SAM, {}, { scope: "openid email profile" })],
    ["no_refresh_token", mailGrant(SAM, {}, { refresh_token: undefined })],
  ];
  for (const [why, grant] of cases) {
    const tables = { mailbox_connections: [], google_connections: [profile(A, SAM)] };
    const w = mailWorld(tables);
    google({ grant });
    const r = await runMailboxConnect(w.ports, { tenantId: A, userId: U, provider: "google", code: "4/code" });
    assert.deepEqual([r.ok, r.why], [false, why]);
    assert.deepEqual(givenBack(), [], `${why}: the profile rides the same grant`);
  }
});

test("a mailbox another workspace holds, refused here, is not signed out there", async () => {
  const theirs = mailbox(B, SAM);
  const tables = { mailbox_connections: [theirs], google_connections: [] };
  const w = mailWorld(tables, { refuse: "taken" });
  google({ grant: mailGrant(SAM) });
  const r = await runMailboxConnect(w.ports, { tenantId: A, userId: U, provider: "google", code: "4/code" });
  assert.deepEqual([r.ok, r.why], [false, "taken"]);
  assert.deepEqual(givenBack(), [], "the other workspace's mailbox is this Google account's grant");
  assert.equal(theirs.state, "connected");
});

test("a mailbox connect that is refused gives the grant back when the account runs nothing else", async () => {
  const tables = { mailbox_connections: [mailbox(B, ADA)], google_connections: [profile(A, ADA)] };
  const w = mailWorld(tables);
  google({ grant: mailGrant(SAM, { email: "sam@gmail.com", hd: undefined }) });
  const r = await runMailboxConnect(w.ports, { tenantId: A, userId: U, provider: "google", code: "4/code" });
  assert.deepEqual([r.ok, r.why], [false, "free_mail"]);
  assert.deepEqual(givenBack(), ["rt-mail"]);
});
