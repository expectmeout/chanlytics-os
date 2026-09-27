/**
 * A partner sets up a workspace and hands it to its owner (decision 0015), run: the words (the form's schema, the
 * waiting row, the invitation, the letter's two new lines); the four routes over a database in memory, each declaring
 * its policy and mapping the functions' own refusals; the boot carrying the person's open handovers and living without
 * them on an older database; the invitation's two ways (the platform's for a new address, the edge's for an account);
 * and the edge's door, which writes only to the address on record.
 *
 * Who may make, answer and send a handover is the database's decision, proved against the stack in handover.db.test.mjs.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import {
  HANDOVER_WORDS,
  HandoverCreateSchema,
  HandoverResendSchema,
  PartnerLetterNewsSchema,
  handoverInviteEmail,
  handoverRoom,
  maskedEmail,
  partnerHandoverVM,
  partnerLetter,
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
const partnerWorkspaces = await import(at("apps/dashboard/app/api/v1/partner/workspaces/route.ts"));
const resend = await import(at("apps/dashboard/app/api/v1/partner/workspaces/[id]/resend/route.ts"));
const accept = await import(at("apps/dashboard/app/api/v1/handovers/[id]/accept/route.ts"));
const decline = await import(at("apps/dashboard/app/api/v1/handovers/[id]/decline/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
const partner = await import(at("apps/dashboard/app/api/v1/partner/route.ts"));
const { sendHandoverInvite } = await import(at("apps/dashboard/src/server/workspace/handover.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/handover-invite.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setPg(null));

const USER = "99999999-9999-4999-8999-999999999999";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const tables = (extra = {}) => ({
  memberships: [{ user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" }],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  profiles: [],
  ...extra,
});
const ctxFor = (t, rpcs = {}, params = {}) => ({
  supabase: fakeDb(t, {}, { is_platform_admin: () => false, ...rpcs }),
  userId: USER,
  email: "ada@example.com",
  params,
  headers: {},
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (body) =>
  new Request("http://localhost/api/v1/x", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

test("the form: a name of 2 to 120, an address lower-cased, a zone or none, nothing else; Send again takes an address", () => {
  assert.deepEqual(
    HandoverCreateSchema.parse({ name: "  Luna Studio ", email: " Owner@Luna.Example ", timezone: "Europe/Madrid" }),
    { name: "Luna Studio", email: "owner@luna.example", timezone: "Europe/Madrid" },
  );
  assert.equal(HandoverCreateSchema.safeParse({ name: "L", email: "a@b.co" }).success, false);
  assert.equal(HandoverCreateSchema.safeParse({ name: "Luna", email: "not an address" }).success, false);
  assert.equal(HandoverCreateSchema.safeParse({ name: "Luna", email: "a@b.co", owner: true }).success, false);
  assert.equal(HandoverResendSchema.safeParse({ email: "a@b.co" }).success, true);
  assert.equal(HandoverResendSchema.safeParse({}).success, false);
});

test("the waiting row: where the handover stands, the address masked, Send again until an owner accepts it", () => {
  const h = {
    tenantId: A,
    name: "Luna Studio",
    email: "owner@luna.example",
    sentAt: "2026-09-27T12:00:00Z",
    expiresAt: "2026-10-11T12:00:00Z",
    acceptedAt: null,
    declinedAt: null,
  };
  const now = Date.parse("2026-09-28T00:00:00Z");
  assert.equal(maskedEmail("owner@luna.example"), "o…@luna.example");
  assert.deepEqual(partnerHandoverVM(h, now), {
    tenantId: A,
    name: "Luna Studio",
    email: "owner@luna.example",
    state: "waiting",
    sentence: "Waiting for its owner: sent to o…@luna.example, open until Oct 11.",
    canResend: true,
  });
  const expired = partnerHandoverVM(h, Date.parse("2026-10-12T00:00:00Z"));
  assert.equal(expired.state, "expired");
  assert.equal(expired.sentence, "The invitation to o…@luna.example expired on Oct 11. Send it again.");
  const declined = partnerHandoverVM({ ...h, declinedAt: "2026-09-29T09:00:00Z" }, now);
  assert.equal(declined.sentence, "Declined by o…@luna.example on Sep 29. Send it again, or to someone else.");
  assert.equal(declined.canResend, true);
  const accepted = partnerHandoverVM({ ...h, acceptedAt: "2026-09-30T09:00:00Z" }, now);
  assert.deepEqual([accepted.state, accepted.canResend], ["accepted", false]);
  assert.equal(partnerHandoverVM({ ...h, name: null }, now).name, HANDOVER_WORDS.unnamed, "off its team, unnamed");

  const ten = Array.from({ length: 10 }, (_, i) => ({ ...h, tenantId: String(i) }));
  assert.deepEqual(handoverRoom(ten.slice(0, 9)), { waiting: 9, full: false, words: null });
  assert.equal(handoverRoom(ten).full, true);
  assert.equal(
    handoverRoom([...ten.slice(0, 9), { ...h, acceptedAt: "x" }]).full,
    false,
    "an accepted one is not waiting",
  );
});

test("the invitation an account is sent: who set up what, what accepting means, where to sign in, and until when", () => {
  const m = handoverInviteEmail({
    partnerCode: "ada-co",
    workspace: "Luna Studio",
    expiresAt: "2026-10-11T12:00:00Z",
    signInUrl: "https://app.example.com/login?email=owner%40luna.example",
  });
  assert.equal(m.subject, "ada-co set up Luna Studio on Chanlytics for you");
  assert.match(m.body, /^ada-co set Luna Studio up for you\. Accept to become its owner/);
  assert.match(
    m.body,
    /Sign in to accept it or decline it: https:\/\/app\.example\.com\/login\?email=owner%40luna\.example/,
  );
  assert.match(m.body, /Open until Oct 11\. If you weren't expecting this, you can ignore it/);
});

test("the partner's letter: an owner who accepted, and one who declined, each said, the subject naming it", () => {
  const news = (over) => PartnerLetterNewsSchema.parse(over);
  const opts = {
    origin: "https://app.example.com",
    since: "2026-09-26T07:17:00Z",
    nowMs: Date.parse("2026-09-27T07:17:00Z"),
  };
  const took = partnerLetter(news({ accepted: ["Luna Studio"] }), opts);
  assert.equal(took.subject, "A business took over the workspace you set up");
  assert.match(
    took.body,
    /- Luna Studio has its owner now: they accepted it\. Its share runs from its first payment\./,
  );
  const no = partnerLetter(news({ declined: [null] }), opts);
  assert.equal(no.subject, "A business declined the workspace you set up");
  assert.match(
    no.body,
    /- A workspace you set up was declined by the owner you sent it to\. Send it again, or to someone else\./,
  );
  assert.deepEqual(news({}).accepted, [], "an older database's answer has neither");
});

/* ------------------------------------------------------------ the routes */

test("the four doors declare their policy: on the account, no role to name, each counted", () => {
  const w = (rate) => ({ kind: "write", scope: "account", role: null, rate, spend: false });
  assert.deepEqual(partnerWorkspaces.POST.policy, w("partner_handover"));
  assert.deepEqual(resend.POST.policy, w("partner_handover"));
  assert.deepEqual(accept.POST.policy, w("handover_answer"));
  assert.deepEqual(decline.POST.policy, w("handover_answer"));
  assert.ok(RATE.partner_handover && RATE.handover_answer, "both buckets exist");
});

test("POST partner/workspaces: the form judged first, then the function's answer; its refusals in its own words", async () => {
  const asked = [];
  const rpcs = {
    create_workspace_for_business: (a) => {
      asked.push(a);
      if (a.p_name === "Paused Co")
        return refusal("42501", "Your partner account is paused, so it cannot set up a workspace.")();
      if (a.p_name === "Eleventh") return refusal("54000", "Ten workspaces are already waiting for their owners.")();
      if (a.p_owner_email === "ada@example.com") return refusal("22023", "That is your own address.")();
      return [
        { id: B, slug: "luna-studio", name: "Luna Studio", status: "active", timezone: "Europe/Madrid", locale: "en" },
      ];
    },
  };
  await refused(partnerWorkspaces.POST.run(send({ name: "Luna" }), ctxFor(tables(), rpcs)), "validation", 400);
  assert.equal(asked.length, 0, "nothing reached the function");
  const out = await partnerWorkspaces.POST.run(
    send({ name: "Luna Studio", email: "Owner@Luna.Example", timezone: "Europe/Madrid" }),
    ctxFor(tables(), rpcs),
  );
  assert.deepEqual(asked[0], {
    p_name: "Luna Studio",
    p_timezone: "Europe/Madrid",
    p_owner_email: "owner@luna.example",
  });
  assert.deepEqual(out.workspace, { id: B, slug: "luna-studio", name: "Luna Studio" });
  assert.equal(out.sent, false, "no platform to invite through here: the workspace is made, the invitation is not");
  await refused(
    partnerWorkspaces.POST.run(send({ name: "Paused Co", email: "a@b.co" }), ctxFor(tables(), rpcs)),
    "forbidden",
    403,
    /paused/,
  );
  await refused(
    partnerWorkspaces.POST.run(send({ name: "Eleventh", email: "a@b.co" }), ctxFor(tables(), rpcs)),
    "conflict",
    409,
    /Ten workspaces/,
  );
  await refused(
    partnerWorkspaces.POST.run(send({ name: "Mine", email: "ada@example.com" }), ctxFor(tables(), rpcs)),
    "validation",
    400,
    /your own address/,
  );
});

test("Send again, Accept and Decline: a malformed id names nothing; each function's refusal mapped", async () => {
  const rpcs = {
    partner_handover_resend: (a) =>
      a.p_tenant === A
        ? { tenant_id: A, email: a.p_email, sent_at: "2026-09-27T12:00:00Z", expires_at: "2026-10-11T12:00:00Z" }
        : refusal("55000", "That workspace already has its owner.")(),
    handover_accept: (a) =>
      a.p_tenant === A
        ? [{ id: A, slug: "harbor", name: "Harbor" }]
        : refusal("P0002", "There is no workspace waiting for you there.")(),
    handover_decline: (a) =>
      a.p_tenant === A ? null : refusal("P0002", "There is no workspace waiting for you there.")(),
  };
  await refused(resend.POST.run(send({ email: "a@b.co" }), ctxFor(tables(), rpcs, { id: "nope" })), "not_found", 404);
  const again = await resend.POST.run(send({ email: "New@B.co" }), ctxFor(tables(), rpcs, { id: A }));
  assert.deepEqual(again, { email: "new@b.co", expiresAt: "2026-10-11T12:00:00Z", sent: false });
  await refused(
    resend.POST.run(send({ email: "a@b.co" }), ctxFor(tables(), rpcs, { id: B })),
    "conflict",
    409,
    /has its owner/,
  );

  assert.deepEqual(await accept.POST.run(send(), ctxFor(tables(), rpcs, { id: A })), {
    workspace: { id: A, slug: "harbor", name: "Harbor" },
  });
  await refused(accept.POST.run(send(), ctxFor(tables(), rpcs, { id: B })), "not_found", 404, /no workspace waiting/);
  assert.deepEqual(await decline.POST.run(send(), ctxFor(tables(), rpcs, { id: A })), { declined: true });
  await refused(decline.POST.run(send(), ctxFor(tables(), rpcs, { id: B })), "not_found", 404);
});

test("where you are: the handovers waiting for this person ride on the person; none on an older database or a failed read", async () => {
  const open = [{ tenant_id: B, workspace: "Luna Studio", partner_code: "ada-co", expires_at: "2026-10-11T12:00:00Z" }];
  const home = await workspaces.GET.run(get(`?workspace=${A}`), ctxFor(tables(), { handovers_mine: () => open }));
  assert.deepEqual(home.user.handovers, [
    { tenantId: B, workspace: "Luna Studio", partnerCode: "ada-co", expiresAt: "2026-10-11T12:00:00Z" },
  ]);
  const nowhere = await workspaces.GET.run(
    get(),
    ctxFor(tables({ memberships: [], tenants: [] }), { handovers_mine: () => open }),
  );
  assert.equal(
    nowhere.user.handovers.length,
    1,
    "an account in no workspace yet is asked too: it is the create screen's turn after",
  );
  const older = await workspaces.GET.run(
    get(`?workspace=${A}`),
    ctxFor(tables(), { handovers_mine: refusal("PGRST202", "Could not find the function public.handovers_mine") }),
  );
  assert.deepEqual(older.user.handovers, []);
  const failing = await workspaces.GET.run(
    get(`?workspace=${A}`),
    ctxFor(tables(), { handovers_mine: refusal("XX000", "boom") }),
  );
  assert.deepEqual(failing.user.handovers, [], "the boot stands");
});

test("the partner's lists: each handover with its workspace's name; brought counts a link's and an accepted one, never one waiting", async () => {
  const row = { id: "p1", code: "ada", status: "active", share_bp: 2500, terms_accepted_at: null, created_at: "x" };
  const pt = (tenant_id, over) => ({
    tenant_id,
    partner_id: "p1",
    origin: "link",
    handover_accepted_at: null,
    ...over,
  });
  const t = tables({
    partners: [row],
    partner_tenants: [
      pt("t1"),
      pt("t2", {
        origin: "handover",
        handover_email: "owner@luna.example",
        handover_sent_at: "2026-09-27T12:00:00Z",
        handover_expires_at: "2026-10-11T12:00:00Z",
        handover_declined_at: null,
        tenants: { name: "Luna Studio" },
      }),
      pt("t3", {
        origin: "handover",
        handover_sent_at: "2026-09-20T12:00:00Z",
        handover_accepted_at: "2026-09-28T00:00:00Z",
        tenants: { name: "Sol" },
      }),
    ],
  });
  const missing = refusal("PGRST202", "Could not find the function");
  const lists = await partnerWorkspaces.GET.run(
    get(),
    ctxFor(t, { partner_overview: missing, partner_workspace_money: missing }),
  );
  assert.deepEqual(
    lists.handovers.map((h) => [h.tenantId, h.name, h.email, h.acceptedAt]),
    [
      ["t2", "Luna Studio", "owner@luna.example", null],
      ["t3", "Sol", "", "2026-09-28T00:00:00Z"],
    ],
  );
  const mine = await partner.GET.run(get(), ctxFor(t, { partner_balance: () => [] }));
  assert.equal(mine.partner.brought, 2, "the link's and the accepted one");
});

/* ------------------------------------------------------------ the invitation */

const svcWith = ({ known = null, inviteError = null } = {}) => {
  const seen = { rpc: [], invited: [] };
  return {
    seen,
    svc: {
      rpc: async (name, args) => {
        seen.rpc.push([name, args]);
        return { data: known, error: null };
      },
      auth: {
        admin: {
          inviteUserByEmail: async (email) => {
            seen.invited.push(email);
            return { error: inviteError };
          },
        },
      },
    },
  };
};
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

test("a new address gets the platform's own invitation, as a teammate's does; the edge is not asked", async () => {
  const { svc, seen } = svcWith();
  const edge = edgeCall();
  assert.equal(await sendHandoverInvite(A, "owner@luna.example", { svc, fetch: edge.fetch, live: true }), true);
  assert.deepEqual(seen.rpc, [["lookup_user_for_invite", { p_tenant_id: A, p_email: "owner@luna.example" }]]);
  assert.deepEqual(seen.invited, ["owner@luna.example"]);
  assert.deepEqual(edge.calls, []);
});

test("an account gets the edge's letter, which carries the workspace and never the address; off production, none", async () => {
  const { svc, seen } = svcWith({ known: USER });
  const edge = edgeCall();
  assert.equal(await sendHandoverInvite(A, "owner@luna.example", { svc, fetch: edge.fetch, live: true }), true);
  assert.deepEqual(seen.invited, [], "the platform sends nothing to an account that exists");
  assert.equal(edge.calls.length, 1);
  assert.match(edge.calls[0].url, /\/api\/admin\/handover-invite$/);
  assert.deepEqual(edge.calls[0].body, { tenant_id: A });
  assert.ok(edge.calls[0].headers["x-edge-token"], "a token minted for this door");

  const preview = edgeCall();
  assert.equal(await sendHandoverInvite(A, "owner@luna.example", { svc, fetch: preview.fetch, live: false }), false);
  assert.deepEqual(preview.calls, []);

  const race = svcWith({ inviteError: { message: "A user with this email address has already been registered" } });
  const late = edgeCall();
  assert.equal(
    await sendHandoverInvite(A, "owner@luna.example", { svc: race.svc, fetch: late.fetch, live: true }),
    true,
  );
  assert.equal(late.calls.length, 1, "made between the lookup and the invitation: the edge writes instead");

  const down = edgeCall(502);
  assert.equal(await sendHandoverInvite(A, "owner@luna.example", { svc, fetch: down.fetch, live: true }), false);
});

/* ------------------------------------------------------------ the edge's door */

const DOOR = "/api/admin/handover-invite";
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
const answer = async (res) => [res.status, await res.json()];
const handoverRow = (over = {}) => ({
  tenant_id: A,
  origin: "handover",
  handover_email: "owner@luna.example",
  handover_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  handover_accepted_at: null,
  handover_declined_at: null,
  tenants: { name: "Luna Studio" },
  partners: { code: "ada-co" },
  ...over,
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

test("the edge's door writes to the address the handover holds, in contracts' words, with a sign-in link for it", async () => {
  setPg(fakeDb({ partner_tenants: [handoverRow()] }));
  const net = wire();
  try {
    const [status, said] = await answer(await knock({ tenant_id: A, email: "someone-else@example.com" }));
    assert.equal(status, 200);
    assert.equal(said.sent, true);
    const [mail] = net.mail();
    assert.deepEqual(mail.to, ["owner@luna.example"], "the address on record, never one the call carries");
    assert.equal(mail.from, "Chanlytics <hello@platform.test>");
    assert.equal(mail.subject, "ada-co set up Luna Studio on Chanlytics for you");
    assert.match(mail.text, /https:\/\/app\.example\.com\/login\?email=owner%40luna\.example/);
  } finally {
    net.restore();
  }
});

test("the edge's door: nobody waiting (accepted, declined, expired, none) is nobody written to; another door's token is refused", async () => {
  const net = wire();
  try {
    for (const over of [
      { handover_accepted_at: "2026-09-28T00:00:00Z" },
      { handover_declined_at: "2026-09-28T00:00:00Z" },
      { handover_expires_at: "2020-01-01T00:00:00Z" },
    ]) {
      setPg(fakeDb({ partner_tenants: [handoverRow(over)] }));
      const [status] = await answer(await knock({ tenant_id: A }));
      assert.equal(status, 404, JSON.stringify(over));
    }
    setPg(fakeDb({ partner_tenants: [] }));
    assert.equal((await knock({ tenant_id: A })).status, 404);
    setPg(fakeDb({ partner_tenants: [handoverRow()] }));
    assert.equal((await knock({ tenant_id: A }, { "x-edge-token": token("/api/admin/you-are-live") })).status, 403);
    const [other, said] = await answer(await knock({ tenant_id: B }));
    assert.equal(other, 403, "a token about A never speaks for B");
    assert.equal(said.error, "workspace_mismatch");
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});
