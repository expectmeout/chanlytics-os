/**
 * A member asks a website sign-up's person to confirm, from the person's page (Ask to confirm, Ask again; 00489), both
 * halves run: the edge's door (POST /api/admin/email/signup-confirm, apps/edge/lib/website/signup-confirm.ts askAgain) over a
 * database in memory -- the same ask as the website's own, under its rules and limits, for someone who signed up on the
 * website alone, at the address their page has, the form their last ask carried kept and the member beside it -- and
 * the dashboard's route (POST /api/v1/contacts/:id/signup-confirm) that asks it, with the edge answered by the test.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken, verifyEdgeToken } from "@chanlytics/channels";
import { signupAskLine } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
const ENV = {
  EDGE_CALL_SECRET: SECRET,
  EDGE_URL: "https://edge.test",
  EMAIL_DOMAIN: "mail.example.com",
  RESEND_API_KEY: "re_test_only",
  UNSUBSCRIBE_SECRET: "the-confirm-secret-for-this-file",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-only",
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const door = await importSrc("apps/edge/api/admin/email/signup-confirm.ts");
const route = await import(at("apps/dashboard/app/api/v1/contacts/[id]/signup-confirm/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
after(() => setPg(null));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const P = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AUD = "/api/admin/email/signup-confirm";
const NOW = Date.now();
const DAY = 86_400_000;

/* ------------------------------------------------------------------ the edge's door */

/** An ask already made to the person, `daysAgo` days ago, carrying the form it was asked for. */
const asked = (daysAgo, over = {}) => ({
  id: `a${String(daysAgo).padStart(7, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  tenant_id: A,
  contact_id: P,
  conversation_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  channel: "email",
  direction: "outbound",
  sender: "system",
  type: "text",
  body: "Confirm your sign-up",
  status: "sent",
  created_at: new Date(NOW - daysAgo * DAY).toISOString(),
  meta: {
    source: "signup_confirm",
    signup_confirm: {
      key: "ana@example.com",
      form: { form: "signup", page: "promo", about: null, lang: "en", at: null },
    },
  },
  ...over,
});

/** A workspace with its mailbox and the person `person` describes (the website brought them unless said). */
function world({ person = {}, messages = [] } = {}) {
  const tables = {
    contacts: [
      {
        id: P,
        tenant_id: A,
        email: "ana@example.com",
        consent: "unknown",
        dnc: false,
        email_marketing: "unknown",
        acquired_via: "website",
        ...person,
      },
    ],
    mailboxes: [
      { id: "mb-1", tenant_id: A, local_part: "harbor", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Harbor" },
    ],
    messages: [...messages],
    conversations: [],
    jobs: [],
  };
  setPg(fakeDb(tables));
  return tables;
}
const asks = (t) => t.messages.filter((m) => m.meta?.source === "signup_confirm" && m.status === "queued");

async function ask(body = {}, { workspace = A } = {}) {
  const raw = JSON.stringify({ tenant_id: A, user_id: U, contact_id: P, ...body });
  const res = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace, user: U, body: raw }),
      },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}

test("a member asks someone the website brought: one email from the mailbox, its send, and the member beside it", async () => {
  const t = world();
  assert.deepEqual(await ask(), [200, { ok: true, asked: true, why: null }]);
  const [m] = asks(t);
  assert.deepEqual(m.meta.email.request.to, ["ana@example.com"], "at the address their page has");
  assert.deepEqual(m.meta.signup_confirm, {
    key: "ana@example.com",
    form: { form: "signup", page: null, about: null, lang: null, at: null },
    by: U,
  });
  assert.equal(t.jobs.filter((j) => j.kind === "outbound_send").length, 1);
});

test("asked again once the last ask ended, keeping the form it carried; never while one is open", async () => {
  const t = world({ messages: [asked(8)] });
  assert.deepEqual(await ask(), [200, { ok: true, asked: true, why: null }]);
  assert.deepEqual(asks(t)[0].meta.signup_confirm.form, {
    form: "signup",
    page: "promo",
    about: null,
    lang: "en",
    at: null,
  });
  world({ messages: [asked(1)] });
  assert.deepEqual(await ask(), [200, { ok: true, asked: false, why: "open" }]);
});

test("the website must have brought them, or a sign-up of theirs been asked before: the email says they signed up there", async () => {
  const t = world({ person: { acquired_via: "whatsapp" } });
  assert.deepEqual(await ask(), [200, { ok: true, asked: false, why: "not_from_website" }]);
  assert.deepEqual([asks(t).length, t.jobs.length], [0, 0]);
  const before = world({ person: { acquired_via: "whatsapp" }, messages: [asked(9)] });
  assert.deepEqual(await ask(), [200, { ok: true, asked: true, why: null }], "a customer who signed up later");
  assert.equal(asks(before).length, 1);
});

test("the website's rules hold for a member too: no address, a STOP, a yes, a suppressed address", async () => {
  for (const [person, why] of [
    [{ email: null }, "no_email"],
    [{ consent: "opted_out" }, "stopped"],
    [{ email_marketing: "opted_in" }, "already"],
    [{ email_suppressed_at: new Date(NOW).toISOString(), email_suppressed_reason: "hard_bounce" }, "suppressed"],
  ]) {
    const t = world({ person });
    assert.deepEqual(await ask(), [200, { ok: true, asked: false, why }], why);
    assert.equal(asks(t).length, 0, why);
  }
});

test("the knock: another workspace's token, or no person named, is refused before anything is read", async () => {
  world();
  assert.equal((await ask({}, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))[0], 403);
  assert.equal((await ask({ contact_id: "nobody" }))[0], 400);
});

/* ------------------------------------------------------------------ the dashboard's route */

const ctx = (role = "operator") => ({
  supabase: fakeDb({
    memberships: [{ user_id: U, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
    contacts: [{ id: P, tenant_id: A, erased_at: null, marketing_consent: "unknown" }],
  }),
  userId: U,
  email: "ada@example.com",
  params: { id: P },
});
const press = () =>
  new Request(`http://localhost/api/v1/contacts/${P}/signup-confirm?workspace=${A}`, { method: "POST", body: "{}" });
function edge(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      body: init.body ? JSON.parse(init.body) : null,
      token: init.headers?.["x-edge-token"],
    });
    const [status, json] = answer();
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("the route: whoever may record an answer on a person; the edge's yes and its refusals said in the page's words", async () => {
  assert.deepEqual(route.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  let answer = [200, { ok: true, asked: true, why: null }];
  const e = edge(() => answer);
  try {
    assert.deepEqual(await route.POST.run(press(), ctx()), { asked: true, said: signupAskLine("asked") });
    assert.equal(e.calls[0].url, `https://edge.test${AUD}`);
    assert.deepEqual(e.calls[0].body, { tenant_id: A, user_id: U, contact_id: P });
    assert.ok(verifyEdgeToken(SECRET, e.calls[0].token, AUD), "a token minted for that door");
    answer = [200, { ok: true, asked: false, why: "open" }];
    assert.deepEqual(await route.POST.run(press(), ctx()), {
      asked: false,
      said: "We already emailed them to confirm.",
    });
    answer = [502, { ok: false, error: "could_not_queue" }];
    await assert.rejects(route.POST.run(press(), ctx()), (x) => x.status === 502);
    await assert.rejects(route.POST.run(press(), ctx("viewer")), (x) => x.code === "forbidden");
  } finally {
    e.restore();
  }
});
