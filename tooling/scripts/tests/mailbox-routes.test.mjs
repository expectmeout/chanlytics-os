/**
 * The mailbox's two routes, and an email reply through the dashboard's own
 * adapter, run: the real route modules, their `run` called with a database in
 * memory. What is proved is the policy each declares, what is refused before
 * the door is asked, how the door's refusals reach the envelope, and the
 * request an email reply's row is born with.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { isEmailRequest } from "@chanlytics/channels";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
after(() => {
  delete process.env.EMAIL_DOMAIN;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const mailboxes = await import(at("apps/dashboard/app/api/v1/mailboxes/route.ts"));
const mailbox = await import(at("apps/dashboard/app/api/v1/mailboxes/[id]/route.ts"));
const { emailSetupFor, freezeReply } = await import(at("apps/dashboard/src/server/connections/email.ts"));
const { metricsSummaryFor } = await import(at("apps/dashboard/src/server/metrics/metrics.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at: "2026-01-01T00:00:00Z",
});
const row = (tenant_id, over = {}) => ({
  id: MB,
  tenant_id,
  local_part: "bestmovers",
  reply_token: "a".repeat(24),
  reply_token_prev: null,
  from_name: "Best Movers",
  reply_mode: "draft",
  last_received_at: null,
  last_error: null,
  ...over,
});
/** The doors as 00129 answers them, over the tables in memory. */
function world(tables, doors = {}) {
  const rpcs = {
    create_mailbox: (a) => {
      if (doors.create) throw Object.assign(new Error(doors.create.message), { code: doors.create.code });
      (tables.mailboxes ??= []).push(row(a.p_tenant_id, { local_part: a.p_local_part, from_name: a.p_from_name }));
      return { id: MB, local_part: a.p_local_part, from_name: a.p_from_name };
    },
    rename_mailbox: (a) => {
      const m = tables.mailboxes.find((x) => x.id === a.p_mailbox_id);
      m.from_name = a.p_from_name;
      return { id: m.id, from_name: m.from_name };
    },
  };
  return { supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params: {} };
}
const send = (method, body, q = `?workspace=${A}`) =>
  new Request(`http://localhost/api/v1/x${q}`, { method, body: JSON.stringify(body) });
async function refused(p, code, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (words) assert.match(e.message, words);
    return true;
  });
}
const calls = (ctx) => ctx.supabase.seen.filter((s) => s.rpc).map((s) => s.rpc);

test("both routes are an owner's, in the workspace, under the settings limit", () => {
  const policy = { kind: "write", scope: "workspace", role: "owner", rate: "settings", spend: false };
  assert.deepEqual(mailboxes.POST.policy, policy);
  assert.deepEqual(mailbox.PUT.policy, policy);
});

test("an owner chooses the address: judged before the door is asked, stored in one spelling, and answered as the pages read it, with no route in it", async () => {
  const tables = { memberships: [membership(A, "owner", "harbor")], mailboxes: [] };
  const ctx = world(tables);
  const out = await mailboxes.POST.run(send("POST", { local_part: "  BestMovers ", from_name: " Best Movers " }), ctx);
  assert.deepEqual(out, {
    mailbox: {
      id: MB,
      address: "bestmovers@mail.chanlytics.com",
      from_name: "Best Movers",
      last_received_at: null,
      last_error: null,
    },
  });
  assert.deepEqual(ctx.supabase.seen.find((s) => s.rpc === "create_mailbox").args, {
    p_tenant_id: A,
    p_local_part: "bestmovers",
    p_from_name: "Best Movers",
  });

  for (const [body, words] of [
    [{ local_part: "best movers", from_name: "Best Movers" }, /letters, numbers and hyphens only/],
    [{ local_part: "support", from_name: "Best Movers" }, /kept for the mail system/],
    [{ local_part: "bestmovers", from_name: "  " }, /name customers should see/],
  ]) {
    const fresh = world({ memberships: [membership(A, "owner", "harbor")], mailboxes: [] });
    await refused(mailboxes.POST.run(send("POST", body), fresh), "validation", words);
    assert.deepEqual(calls(fresh), [], "the door is not asked about what contracts already refuses");
  }
  await refused(
    mailboxes.POST.run(
      send("POST", { local_part: "bestmovers", from_name: "Best Movers", reply_token: "x" }),
      world({ memberships: [membership(A, "owner", "harbor")] }),
    ),
    "validation",
  );
});

test("the door's refusals reach the owner as the door said them: a taken address is a conflict, and an operator is refused before anything is read", async () => {
  const owner = { memberships: [membership(A, "owner", "harbor")], mailboxes: [] };
  await refused(
    mailboxes.POST.run(
      send("POST", { local_part: "bestmovers", from_name: "Best Movers" }),
      world(owner, { create: { code: "23505", message: "That address is taken. Try another." } }),
    ),
    "conflict",
    /That address is taken/,
  );
  await refused(
    mailboxes.POST.run(
      send("POST", { local_part: "bestmovers", from_name: "Best Movers" }),
      world(owner, { create: { code: "42501", message: "Only an owner can set up email." } }),
    ),
    "forbidden",
  );
  const operator = world({ memberships: [membership(A, "operator", "harbor")], mailboxes: [] });
  await refused(
    mailboxes.POST.run(send("POST", { local_part: "bestmovers", from_name: "Best Movers" }), operator),
    "forbidden",
  );
  assert.deepEqual(calls(operator), []);
});

test("the name beside the address changes; another workspace's mailbox is not found, whatever the door would have said", async () => {
  const tables = {
    memberships: [membership(A, "owner", "harbor"), membership(B, "owner", "bayside")],
    mailboxes: [row(A)],
  };
  const ctx = { ...world(tables), params: { id: MB } };
  const out = await mailbox.PUT.run(send("PUT", { from_name: " Best Movers NYC " }), ctx);
  assert.equal(out.mailbox.from_name, "Best Movers NYC");
  assert.equal(tables.mailboxes[0].from_name, "Best Movers NYC");
  const far = { ...world(tables), params: { id: MB } };
  await refused(mailbox.PUT.run(send("PUT", { from_name: "Bayside" }, `?workspace=${B}`), far), "not_found");
  assert.deepEqual(calls(far), []);
  await refused(
    mailbox.PUT.run(send("PUT", { from_name: "" }), { ...world(tables), params: { id: MB } }),
    "validation",
    /name customers should see/,
  );
});

test("where the deployment names no mail domain, email is off: nothing can be made, and the pages are told so without a query", async () => {
  delete process.env.EMAIL_DOMAIN;
  try {
    const ctx = world({ memberships: [membership(A, "owner", "harbor")], mailboxes: [] });
    await refused(
      mailboxes.POST.run(send("POST", { local_part: "bestmovers", from_name: "Best Movers" }), ctx),
      "conflict",
      /not available here yet/,
    );
    const db = fakeDb({ mailboxes: [row(A)] });
    assert.deepEqual(await emailSetupFor(db, A), { ready: false, domain: null, mailbox: null, sending: null });
    assert.deepEqual(db.seen, []);
  } finally {
    process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
  }
  const db = fakeDb({ mailboxes: [row(A, { last_received_at: "2026-09-17T12:00:00Z" })] });
  assert.deepEqual(await emailSetupFor(db, A), {
    ready: true,
    domain: "mail.chanlytics.com",
    mailbox: {
      id: MB,
      address: "bestmovers@mail.chanlytics.com",
      from_name: "Best Movers",
      last_received_at: "2026-09-17T12:00:00Z",
      last_error: null,
    },
    // Own domains are the edge's to switch on (the cold key); with no edge here, the block is not drawn.
    sending: { ready: false, domains: [] },
  });
  assert.deepEqual(
    (await emailSetupFor(db, B)).mailbox,
    null,
    "a workspace is told about its own mailbox and nobody else's",
  );
});

test("an email reply's request is frozen from the workspace's own mailbox: it leaves as that address, threads under the parent, and is tagged with its row", async () => {
  const ctx = {
    supabase: fakeDb({
      mailboxes: [row(A), row(B, { id: "mb-b", local_part: "marisas", reply_token: "b".repeat(24) })],
    }),
  };
  const parent = {
    messageId: "m0",
    from: "Ana@Example.com",
    rfcMessageId: "<q1@customer.example>",
    references: ["<q0@customer.example>"],
    subject: "Re: RE: Quote for Saturday",
  };
  const frozen = await freezeReply(ctx, {
    tenantId: A,
    messageId: "id-1",
    to: "ana@example.com",
    parent,
    body: "We can do Saturday at 9.",
  });
  assert.equal(frozen.subject, "Re: Quote for Saturday");
  assert.ok(isEmailRequest(frozen.request), "what the send job will accept off the row");
  assert.deepEqual(
    [
      frozen.request.from,
      frozen.request.to,
      frozen.request.reply_to,
      frozen.request.idempotency_key,
      frozen.request.text,
    ],
    [
      '"Best Movers" <bestmovers@mail.chanlytics.com>',
      ["ana@example.com"],
      [`r+${"a".repeat(24)}@mail.chanlytics.com`],
      "id-1",
      "We can do Saturday at 9.",
    ],
  );
  assert.deepEqual(
    frozen.request.headers,
    { "In-Reply-To": "<q1@customer.example>", References: "<q0@customer.example> <q1@customer.example>" },
    "a person's own reply carries no Auto-Submitted mark",
  );
  assert.deepEqual(frozen.request.tags, [
    { name: "cl_message", value: "id-1" },
    { name: "cl_tenant", value: A },
  ]);
  assert.equal(
    await freezeReply(ctx, {
      tenantId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      messageId: "id-2",
      to: "ana@example.com",
      parent,
      body: "Hi",
    }),
    null,
    "no mailbox, no request",
  );
});

test("Today counts the workspace's email line beside the routing rows, and only where the channel is real", async () => {
  const summary = {
    workspace: { name: "Best Movers", timezone: "America/New_York", status: "active" },
    channels: [{ kind: "voice", status: "active", number: "+13055550123" }],
  };
  const rpcs = { metrics_summary: () => summary };
  const withBox = fakeDb({ memberships: [membership(A, "owner", "a")], mailboxes: [row(A)] }, {}, rpcs);
  const m = await metricsSummaryFor(withBox, A, 1);
  assert.deepEqual(
    m.channels,
    [
      { kind: "voice", status: "active", number: "+13055550123" },
      { kind: "email", status: "active", number: null, address: "bestmovers@mail.chanlytics.com" },
    ],
    "REGRESSION: Today said '1 of 1 line connected' on a workspace with two",
  );
  assert.equal(m.linesRead, undefined, "every line was read");

  // A workspace that has not made its mailbox has no email line...
  const noBox = fakeDb({ memberships: [membership(A, "owner", "a")], mailboxes: [] }, {}, rpcs);
  assert.deepEqual((await metricsSummaryFor(noBox, A, 1)).channels, summary.channels);

  // ...and neither has one on a deployment without the channel at all.
  delete process.env.EMAIL_DOMAIN;
  try {
    assert.deepEqual((await metricsSummaryFor(withBox, A, 1)).channels, summary.channels);
  } finally {
    process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
  }

  // A mailbox that cannot be read is a line that cannot be counted: Today still draws, and says the count is short.
  const broken = fakeDb(
    { memberships: [membership(A, "owner", "a")], mailboxes: [row(A)] },
    { "mailboxes.select": { message: "permission denied" } },
    rpcs,
  );
  const short = await metricsSummaryFor(broken, A, 1);
  assert.deepEqual(short.channels, summary.channels, "what WAS read still stands");
  assert.equal(short.linesRead, false, "never a blank Today, never '1 of 1' on a workspace with two");
});
