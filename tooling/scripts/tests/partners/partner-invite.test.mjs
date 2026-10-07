/**
 * An existing workspace brings in a partner (decision 0020), run: the words (a code or a whole link, the owner's card
 * in each state, what joining says, the partner's email); the six routes over a database in memory, each declaring
 * its policy and mapping the functions' own refusals; joining asking for the second factor before the database is
 * asked; the email's one way (the edge, by the partner's own address); and the edge's door, which writes only to the
 * account the invitation names.
 *
 * Who may ask, join and decline, and the rule on credit, are the database's, proved against the stack in
 * partner-invite.db.test.mjs.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import {
  PARTNER_INVITE_DAYS,
  PartnerInviteSchema,
  partnerCodeFrom,
  partnerInvitationWords,
  partnerInviteEmail,
  partnerJoinedWords,
  workspacePartnerVM,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_FROM = "Chanlytics <hello@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.example.com";
for (const k of ["DIAG_KEY", "SUPABASE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const team = await import(at("apps/dashboard/app/api/v1/team/partner/route.ts"));
const invitations = await import(at("apps/dashboard/app/api/v1/partner/invitations/route.ts"));
const accept = await import(at("apps/dashboard/app/api/v1/partner/invitations/[id]/accept/route.ts"));
const decline = await import(at("apps/dashboard/app/api/v1/partner/invitations/[id]/decline/route.ts"));
const { sendPartnerInvite } = await import(at("apps/dashboard/src/server/workspace/partner-invite.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/partner-invite.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setPg(null));

const USER = "99999999-9999-4999-8999-999999999999";
const PARTNER_USER = "88888888-8888-4888-8888-888888888888";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DAY = 86_400_000;

const tables = (role = "owner") => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01" }],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
});
const ctxFor = (rpcs = {}, { role = "owner", aal = "aal2", params = {} } = {}) => ({
  supabase: fakeDb(tables(role), {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  aal,
  params,
  headers: {},
});
const inA = (method = "GET", body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const post = (body) =>
  new Request("http://localhost/api/v1/x", { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
const refusal = (code, message) => () => {
  throw Object.assign(new Error(message), { code });
};
const refused = async (p, code, status, message) =>
  assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status);
    if (message) assert.match(e.message, message);
    return true;
  });

/* ------------------------------------------------------------ the words */

test("a partner's code, typed or inside their link, lower-cased; the form takes one line and nothing else", () => {
  assert.equal(partnerCodeFrom("  Ada-Co "), "ada-co");
  assert.equal(partnerCodeFrom("https://app.chanlytics.com/p/Ada-Co"), "ada-co");
  assert.equal(partnerCodeFrom("app.chanlytics.com/p/ada-co?utm=x#y"), "ada-co");
  assert.equal(partnerCodeFrom("not a code"), "not a code", "passed on, for the database to say it names nobody");
  assert.equal(
    partnerCodeFrom("https://example.com/p/abc%E0"),
    "abc",
    "a link cut mid-escape gives the code before it",
  );
  // A link or a code pasted from a sentence brings its punctuation; no code begins or ends with any.
  for (const pasted of [
    "https://app.chanlytics.com/p/ada-co.",
    "(https://app.chanlytics.com/p/ada-co)",
    "<app.chanlytics.com/p/ada-co>",
    "ada-co,",
    '"Ada-Co"',
    "/p/ada-co-",
  ])
    assert.equal(partnerCodeFrom(pasted), "ada-co", pasted);
  assert.equal(PartnerInviteSchema.safeParse({ code: "ada-co" }).success, true);
  assert.equal(PartnerInviteSchema.safeParse({ code: "  " }).success, false);
  assert.equal(PartnerInviteSchema.safeParse({ code: "ada-co", role: "owner" }).success, false);
  assert.equal(PARTNER_INVITE_DAYS, 14);
});

test("the owner's card, state by state: none asks, waiting takes back, declined and expired ask again, a partner is said", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const none = workspacePartnerVM({ partner: null, invitation: null }, now);
  assert.deepEqual([none.state, none.canInvite, none.canWithdraw, none.sentence], ["none", true, false, null]);
  const open = { code: "ada-co", sentAt: "2026-09-27T12:00:00Z", expiresAt: "2026-10-11T12:00:00Z", declinedAt: null };
  const waiting = workspacePartnerVM({ partner: null, invitation: open }, now);
  assert.deepEqual([waiting.state, waiting.canInvite, waiting.canWithdraw], ["waiting", false, true]);
  assert.match(waiting.sentence, /^Waiting for ada-co to accept/);
  const declined = workspacePartnerVM(
    { partner: null, invitation: { ...open, declinedAt: "2026-09-28T00:00:00Z" } },
    now,
  );
  assert.deepEqual([declined.state, declined.canInvite, declined.canWithdraw], ["declined", true, false]);
  assert.match(declined.sentence, /^ada-co declined on/);
  const expired = workspacePartnerVM(
    { partner: null, invitation: { ...open, expiresAt: "2026-09-28T00:00:00Z" } },
    now,
  );
  assert.equal(expired.state, "expired");
  const joined = workspacePartnerVM(
    { partner: { code: "ada-co", origin: "invite", since: "2026-09-28T00:00:00Z", seated: true }, invitation: null },
    now,
  );
  assert.deepEqual([joined.state, joined.canInvite, joined.canWithdraw], ["partner", false, false]);
  assert.match(joined.sentence, /^ada-co is your partner: they joined at your invitation/);
  const removed = workspacePartnerVM(
    { partner: { code: "ada-co", origin: "invite", since: "2026-09-28T00:00:00Z", seated: false }, invitation: null },
    now,
  );
  assert.match(
    removed.sentence,
    /^ada-co was your partner: .* are no longer on your team\. A workspace has one partner\.$/,
  );
  assert.equal(removed.canInvite, false, "the credit stays, and so does the one partner a workspace has");
  assert.match(
    workspacePartnerVM({
      partner: { code: "bo", origin: "link", since: "2026-09-01T00:00:00Z", seated: true },
      invitation: null,
    }).sentence,
    /came to you through their link/,
  );
});

test("what the partner is shown and sent: who asked and until when; whether joining earns a share", () => {
  const row = {
    workspaceId: A,
    workspace: "Harbor",
    sentAt: "2026-09-27T12:00:00Z",
    expiresAt: "2026-10-11T12:00:00Z",
  };
  assert.match(partnerInvitationWords(row), /^Harbor asks you to be its partner\. Open until /);
  assert.match(partnerJoinedWords("Harbor", true), /your share is written as for a workspace you brought/);
  assert.match(partnerJoinedWords("Harbor", false), /already paying when you joined, so it earns you no share/);
  const mail = partnerInviteEmail({ workspace: "Harbor", expiresAt: row.expiresAt, signInUrl: "https://app/login" });
  assert.equal(mail.subject, "Harbor asks you to be its partner on Chanlytics");
  assert.match(mail.body, /never touch its billing or its team\./);
  assert.match(mail.body, /Settings › Partner to join or decline: https:\/\/app\/login/);
});

/* ------------------------------------------------------------ the owner's routes */

test("the owner's routes: the workspace's, the owner's, counted; the code taken from a link; the function's refusals mapped", async () => {
  assert.deepEqual(team.GET.policy, { kind: "read", scope: "workspace", role: "owner", rate: null, spend: false });
  // Who sits on the team is the owner's to change with a live session, as an invitation to a person is.
  for (const h of [team.POST, team.DELETE])
    assert.deepEqual(h.policy, {
      kind: "write",
      scope: "workspace",
      role: "owner",
      rate: "partner_invite",
      spend: false,
      fresh: true,
    });
  assert.equal(RATE.partner_invite.limit, 20);

  const asked = [];
  const rpcs = {
    partner_invite: (a) => {
      asked.push(a);
      if (a.p_code.startsWith("nobody"))
        throw Object.assign(new Error("No active partner has that code."), { code: "P0002" });
      return { code: a.p_code, sent_at: "2026-09-28T00:00:00Z", expires_at: "2026-10-12T00:00:00Z" };
    },
    partner_invite_withdraw: (a) => {
      asked.push(["withdraw", a]);
      return null;
    },
    workspace_partner: () => ({ partner: null, invitation: { code: "ada-co", sent_at: "s", expires_at: "e" } }),
  };
  const r = await team.POST.run(inA("POST", { code: "https://app.chanlytics.com/p/Ada-Co" }), ctxFor(rpcs));
  assert.deepEqual(r, { code: "ada-co", expiresAt: "2026-10-12T00:00:00Z", sent: false }, "off production, no email");
  assert.deepEqual(asked[0], { p_tenant: A, p_code: "ada-co" });
  await refused(team.POST.run(inA("POST", { code: "nobody" }), ctxFor(rpcs)), "not_found", 404, /No active partner/);
  await refused(
    team.POST.run(inA("POST", { code: "https://app.chanlytics.com/p/nobody%E0" }), ctxFor(rpcs)),
    "not_found",
    404,
    /No active partner/,
  );
  assert.deepEqual(await team.DELETE.run(inA("DELETE"), ctxFor(rpcs)), { withdrawn: true });
  assert.deepEqual(asked.at(-1), ["withdraw", { p_tenant: A }]);
  const card = await team.GET.run(inA(), ctxFor(rpcs));
  assert.deepEqual(card, {
    partner: null,
    invitation: { code: "ada-co", sentAt: "s", expiresAt: "e", declinedAt: null },
  });

  // An operator is refused at the door, before the function is asked.
  const before = asked.length;
  await refused(team.POST.run(inA("POST", { code: "ada-co" }), ctxFor(rpcs, { role: "operator" })), "forbidden", 403);
  await refused(team.GET.run(inA(), ctxFor(rpcs, { role: "operator" })), "forbidden", 403);
  assert.equal(asked.length, before);
  await refused(
    team.POST.run(
      inA("POST", { code: "ada-co" }),
      ctxFor({ partner_invite: refusal("55000", "This workspace already has a partner.") }),
    ),
    "conflict",
    409,
    /already has a partner/,
  );
});

/* ------------------------------------------------------------ the partner's routes */

test("the partner's routes: on the account, counted; joining asks for the second factor before the database is asked", async () => {
  assert.deepEqual(invitations.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  for (const h of [accept.POST, decline.POST])
    assert.deepEqual(h.policy, {
      kind: "write",
      scope: "account",
      role: null,
      rate: "partner_invite_answer",
      spend: false,
    });

  const asked = [];
  const rpcs = {
    partner_invitations_mine: () => [{ tenant_id: A, workspace: "Harbor", sent_at: "s", expires_at: "e" }],
    partner_invite_accept: (a) => {
      asked.push(["accept", a]);
      return [{ id: A, slug: "harbor", name: "Harbor", earns: false }];
    },
    partner_invite_decline: (a) => {
      asked.push(["decline", a]);
      return null;
    },
  };
  assert.deepEqual(await invitations.GET.run(new Request("http://localhost/api/v1/x"), ctxFor(rpcs)), {
    invitations: [{ workspaceId: A, workspace: "Harbor", sentAt: "s", expiresAt: "e" }],
  });
  await refused(accept.POST.run(post(), ctxFor(rpcs, { aal: "aal1", params: { id: A } })), "mfa_required", 403);
  assert.deepEqual(asked, [], "nothing asked of the database without the second factor");
  assert.deepEqual(await accept.POST.run(post(), ctxFor(rpcs, { params: { id: A } })), {
    workspace: { id: A, slug: "harbor", name: "Harbor" },
    earns: false,
  });
  assert.deepEqual(await decline.POST.run(post(), ctxFor(rpcs, { params: { id: B } })), { declined: true });
  assert.deepEqual(asked, [
    ["accept", { p_tenant: A }],
    ["decline", { p_tenant: B }],
  ]);
  await refused(accept.POST.run(post(), ctxFor(rpcs, { params: { id: "nope" } })), "not_found", 404, undefined);
  await refused(
    accept.POST.run(
      post(),
      ctxFor(
        { partner_invite_accept: refusal("P0002", "There is no invitation for you there.") },
        { params: { id: A } },
      ),
    ),
    "not_found",
    404,
  );
  // A database that never had 00225: nobody can have asked.
  const older = {
    partner_invitations_mine: refusal("PGRST202", "Could not find the function public.partner_invitations_mine"),
  };
  assert.deepEqual(await invitations.GET.run(new Request("http://localhost/api/v1/x"), ctxFor(older)), {
    invitations: [],
  });
});

/* ------------------------------------------------------------ the email */

const edgeCall = (status = 200) => {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response("{}", { status });
    },
  };
};

test("the partner is told by the edge, which is given the workspace and never an address; off production, nobody", async () => {
  const edge = edgeCall();
  assert.equal(await sendPartnerInvite(A, USER, { fetch: edge.fetch, live: true }), true);
  assert.equal(edge.calls.length, 1);
  assert.match(edge.calls[0].url, /\/api\/admin\/partner-invite$/);
  assert.deepEqual(edge.calls[0].body, { tenant_id: A });
  assert.ok(edge.calls[0].headers["x-edge-token"], "a token minted for this door");
  const preview = edgeCall();
  assert.equal(await sendPartnerInvite(A, USER, { fetch: preview.fetch, live: false }), false);
  assert.deepEqual(preview.calls, []);
  assert.equal(await sendPartnerInvite(A, USER, { fetch: edgeCall(502).fetch, live: true }), false);
  assert.equal(
    await sendPartnerInvite(A, USER, {
      fetch: async () => {
        throw new Error("socket hang up");
      },
      live: true,
    }),
    false,
    "never throws",
  );
});

/* ------------------------------------------------------------ the edge's door */

const DOOR = "/api/admin/partner-invite";
const token = (aud = DOOR, workspace = A) =>
  signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace, user: "u1" });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${DOOR}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const invitationRow = (over = {}) => ({
  tenant_id: A,
  expires_at: new Date(Date.now() + DAY).toISOString(),
  declined_at: null,
  tenants: { name: "Harbor" },
  partners: { code: "ada-co", user_id: PARTNER_USER },
  ...over,
});
/** The edge's service client: the invitation's table, and the partner's account on the Auth server. */
const edgeDb = (rows, emails = { [PARTNER_USER]: "ada@partner.example" }) =>
  Object.assign(fakeDb({ partner_invitations: rows }), {
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: emails[id] ? { id, email: emails[id] } : null }, error: null }),
      },
    },
  });
function wire() {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    mail: () => seen.filter((r) => r.url === "https://api.resend.com/emails").map((r) => r.body),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

test("the edge's door writes to the partner's own account's address, in contracts' words, with a sign-in link for it", async () => {
  setPg(edgeDb([invitationRow()]));
  const net = wire();
  try {
    const res = await knock({ tenant_id: A, email: "someone-else@example.com" });
    assert.equal(res.status, 200);
    const [mail] = net.mail();
    assert.deepEqual(mail.to, ["ada@partner.example"], "the account's address, never one the call carries");
    assert.equal(mail.subject, "Harbor asks you to be its partner on Chanlytics");
    assert.match(mail.text, /https:\/\/app\.example\.com\/login\?email=ada%40partner\.example/);
  } finally {
    net.restore();
  }
});

test("the edge's door: nobody waiting (declined, expired, none, no address) is nobody written to; another workspace's token is refused", async () => {
  const net = wire();
  try {
    for (const rows of [
      [invitationRow({ declined_at: "2026-09-28T00:00:00Z" })],
      [invitationRow({ expires_at: "2020-01-01T00:00:00Z" })],
      [],
    ]) {
      setPg(edgeDb(rows));
      assert.equal((await knock({ tenant_id: A })).status, 404, JSON.stringify(rows));
    }
    setPg(edgeDb([invitationRow()], {}));
    assert.equal((await knock({ tenant_id: A })).status, 404, "an account with no address left");
    setPg(edgeDb([invitationRow()]));
    assert.equal((await knock({ tenant_id: A }, { "x-edge-token": token("/api/admin/handover-invite") })).status, 403);
    assert.equal((await knock({ tenant_id: B })).status, 403, "a token about A never speaks for B");
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});
