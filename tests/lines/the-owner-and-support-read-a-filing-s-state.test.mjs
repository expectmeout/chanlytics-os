/**
 * A filing's state, as the two people who meet it read it — run, not read.
 *
 * The owner presses Register on Setup or Connections, and the dashboard's register route asks the edge to file. Support
 * presses Refile in the back office, and the bridge hands the edge's answer to the toast. Both used to say something
 * untrue about what had happened: the owner route answered a campaign the carriers SENT BACK with "the carriers did not
 * answer", and a rehearsal the same way; Support's toast printed `record_incomplete` where the pre-flight had written two
 * sentences. Each is run here: the real route module over a database in memory and an edge that answers as the edge
 * does, and the real bridge verb over a tab's fetch that answers as the platform route does. (These were source scans in
 * a2p-refile.test.mjs until 26 Nov 2026.)
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MOCK_TEXTING_SENTENCE } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
// A deployment that may reach its providers (the dashboard's own gate: a preview answers "not here").
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

// The tab Support presses the button in: the bridge's own client, over this process's fetch.
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/console", hash: "" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.window.dispatchEvent ??= () => true;
bridgeHolds({ who: { me: { email: "support@example.com", platform_admin: true } } });

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const register = await importSrc("apps/dashboard/app/api/v1/lines/register/route.ts");
const { backOffice } = await importSrc("apps/dashboard/src/bridge/platform.ts");
beforeEach(() => setRateStore(memoryStore()));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "22222222-2222-4222-8222-222222222222";
const USER = "u1";
/** An owner of a workspace on a trial, past the second factor: one who may spend on a filing. */
const ctx = () => ({
  supabase: fakeDb({
    memberships: [
      { user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York" }],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "trialing" }],
  }),
  userId: USER,
  email: "ada@example.com",
  aal: "aal2",
  params: {},
});
const press = (extra = {}) =>
  new Request(`http://localhost/api/v1/lines/register?workspace=${T}`, {
    method: "POST",
    body: JSON.stringify({ line_id: LINE, ...extra }),
  });

/** The edge, as the route meets it: every body it was sent kept, each answered `status` and `body`. */
function edge(status, body) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ path: new URL(String(url)).pathname, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return sent;
}
const realFetch = globalThis.fetch;

/** What the route threw: its code, its status and the sentence the owner reads. */
async function refusalOf(p) {
  try {
    await p;
  } catch (e) {
    return { code: e.code, status: e.status, message: e.message };
  }
  assert.fail("the route answered where it should have refused");
}

test("the owner's route files and never refiles: a rehearsal comes back as the one sentence the pages say", async () => {
  // Making a rehearsal real charges the workspace, so it is an operator's call with the business record in front of
  // them, not a side effect of somebody pressing resubmit (a2p-refile.test.mjs runs the refile itself). Nor is the free
  // test registry reachable from here: an owner's filing is always the real one, whatever the body asks.
  try {
    const sent = edge(409, { ok: false, error: "mock_registration" });
    const r = await refusalOf(register.POST.run(press({ refile: true, mock: true, replace: true }), ctx()));
    assert.deepEqual(sent, [
      { path: "/api/admin/lines", body: { op: "register", tenant_id: T, user_id: USER, line_id: LINE } },
    ]);
    assert.ok(!("refile" in sent[0].body) && !("mock" in sent[0].body), "the owner-facing route never sends either");
    assert.deepEqual(r, { code: "conflict", status: 409, message: MOCK_TEXTING_SENTENCE }, "in the pages' words");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a campaign the carriers sent back reaches the owner as that, with their words and who sends it again", async () => {
  // THE DEAD END: a 409 is neither of the two statuses the route's catch-all lets through, so an owner was told the
  // carriers had not answered about a message the carriers had explicitly sent.
  try {
    edge(409, {
      ok: false,
      error: "campaign_rejected",
      reason: "  the opt-in does not say what a customer agrees to ",
    });
    const r = await refusalOf(register.POST.run(press(), ctx()));
    assert.equal(r.status, 409);
    assert.equal(
      r.message,
      "Texting approval was sent back. They said: the opt-in does not say what a customer agrees to Chanlytics files it again once the business on record answers what was named. Correct it here, and Chanlytics takes it from there.",
    );
    assert.doesNotMatch(r.message, /did not answer|didn't answer/, "REGRESSION: the catch-all's sentence");

    edge(409, { ok: false, error: "campaign_rejected" });
    const bare = await refusalOf(register.POST.run(press(), ctx()));
    assert.match(
      bare.message,
      /^Texting approval was sent back\. Chanlytics files it again/,
      "no reason, no 'They said'",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Support's button reads the pre-flight's sentences, never the token", async () => {
  // The ops surface would otherwise have repeated the exact defect this fixed for owners: `record_incomplete` where
  // two sentences belong.
  const problems = [
    "The workspace is named Billing probe, and the business on record is Harbor Moving LLC.",
    "Rename the workspace to the business's name, then file again.",
  ];
  const asked = [];
  const platform = (data) => {
    globalThis.fetch = async (url, init = {}) => {
      asked.push({ path: new URL(String(url), "https://app.chanlytics.com").pathname, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  };
  try {
    platform({
      ok: false,
      status: 409,
      result: { ok: false, error: "record_incomplete", problems: [...problems, " "] },
    });
    const r = await backOffice.verbs.act("refile", T, LINE, "the carriers sent it back");
    assert.deepEqual(asked, [
      {
        path: "/api/v1/platform/lines/refile",
        body: { tenant_id: T, line_id: LINE, why: "the carriers sent it back" },
      },
    ]);
    assert.deepEqual(r, { ok: false, message: problems.join(" ") }, "the sentences, the blank one dropped");

    // A refusal with no sentences says its detail before its token, and the token only when there is nothing else.
    platform({
      ok: false,
      status: 402,
      result: { error: "payment_required", detail: " Update the card in Billing. " },
    });
    assert.deepEqual(await backOffice.verbs.act("refile", T, LINE, "w"), {
      ok: false,
      message: "Update the card in Billing.",
    });
    platform({ ok: false, status: 409, result: { error: "already_registered" } });
    assert.deepEqual(await backOffice.verbs.act("refile", T, LINE, "w"), { ok: false, message: "already_registered" });
  } finally {
    globalThis.fetch = realFetch;
  }
});
