/**
 * What the edge holds about offers by email (One message, every channel, step 4; the campaigns-on-every-channel spec, 4.5 and
 * 4.6): whether the deployment's campaigns domain is verified for sending (asked of the provider, kept five minutes, and
 * never an answer when the provider could not be asked), the readiness door that tells the dashboard, the route the wire
 * gains while it is, the gates that pause a workspace's offers when a complaint or a bounce lands, and the pause's reach.
 * Executed: the real modules over a database in memory, with only the provider's HTTP stubbed. Nothing leaves this process.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  buildEmailRequest,
  campaignsIdentity,
  resendWebhookSignature,
  resetBreakers,
  signEdgeToken,
} from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SECRET = `whsec_${Buffer.from("a-webhook-signing-secret-of-32b!").toString("base64")}`;
const KEYS = [
  "EMAIL_DOMAIN",
  "EMAIL_CAMPAIGNS_DOMAIN",
  "RESEND_API_KEY",
  "UNSUBSCRIBE_SECRET",
  "UNSUBSCRIBE_ORIGIN",
  "DASHBOARD_ORIGIN",
  "VERCEL_ENV",
  "DIAG_KEY",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vars) => {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
};
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_WEBHOOK_SECRET = SECRET;
const WIRED = {
  EMAIL_DOMAIN: "mail.example.com",
  EMAIL_CAMPAIGNS_DOMAIN: "campaigns.example.com",
  RESEND_API_KEY: "re_test_only",
  UNSUBSCRIBE_SECRET: "unsub-secret",
  DASHBOARD_ORIGIN: "https://app.example.com",
};

const { campaignsDomain, campaignsDomainVerified, campaignsBinding } = await import(
  at("apps/edge/lib/email/campaigns-domain.ts")
);
/** The lane a job that sends offers is bound with, or null: what the binding says when it is open. */
const campaignsLane = async (o) => {
  const b = await campaignsBinding(o);
  return b.state === "open" ? b.lane : null;
};
const { judgeMailDomain, checkMailDomain, describeCampaignsDomainTrouble } = await import(
  at("apps/edge/lib/email/mail-domain.ts")
);
const { emailWireFor, emailIntake, emailBoundFor } = await import(at("apps/edge/lib/email/email.ts"));
const { judgeOfferGates } = await import(at("apps/edge/lib/email/offer-gates.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const readiness = await import(at("apps/edge/api/admin/email/wire.ts"));
const resendDoor = await import(at("apps/edge/api/resend-webhook.ts"));
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  delete process.env.RESEND_WEBHOOK_SECRET;
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGNS = "campaigns.example.com";
const domain = (over = {}) => ({
  name: CAMPAIGNS,
  status: "verified",
  sending: "enabled",
  receiving: "disabled",
  ...over,
});
/** The provider's answer to GET /domains for these domains, as the wire reads it. */
const listing = (...domains) =>
  new Response(
    JSON.stringify({
      object: "list",
      has_more: false,
      data: domains.map((d) => ({
        id: `id-${d.name}`,
        name: d.name,
        status: d.status,
        capabilities: { sending: d.sending, receiving: d.receiving },
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
/** Stub the provider for one case; counts what it was asked. Each starts with the breaker closed: a case of failures must not hold the next. */
function provider(answer) {
  resetBreakers();
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    return typeof answer === "function" ? answer(url, init) : answer.clone();
  };
  return asked;
}

/* ---------------------------------------------------- is the domain verified */

test("the campaigns domain is judged for SENDING only: receiving may be off; verified, partly, never, absent and sending off are each a trouble with their words", () => {
  const judge = (...d) => judgeMailDomain(d, CAMPAIGNS, { sendOnly: true });
  assert.equal(judge(domain()), null, "verified, sending on, receiving off: nothing wrong");
  // Judged as the mail domain is (both halves), the same domain is off: receiving is what the campaigns domain may lack.
  assert.deepEqual(judgeMailDomain([domain()], CAMPAIGNS), { kind: "off", sending: "enabled", receiving: "disabled" });
  assert.deepEqual(judge(domain({ sending: "disabled" })), { kind: "off", sending: "disabled", receiving: "disabled" });
  assert.deepEqual(judge(domain({ status: "pending" })), { kind: "never_verified", status: "pending" });
  assert.deepEqual(judge(domain({ status: "partially_verified" })), { kind: "half", status: "partially_verified" });
  assert.deepEqual(judge(domain({ status: "temporary_failure" })), { kind: "stopped", status: "temporary_failure" });
  assert.deepEqual(judge(), { kind: "absent" });
  assert.deepEqual(
    judge(domain({ name: "mail.example.com" })),
    { kind: "absent" },
    "the mail domain is not the campaigns domain",
  );
  const page = describeCampaignsDomainTrouble({ kind: "never_verified", status: "pending" }, CAMPAIGNS);
  assert.match(page.subject, /The campaigns domain campaigns\.example\.com is not sending: status "pending"/);
  assert.match(page.body, /every offer by email is refused/);
  assert.match(page.body, /not affected/);
});

test("the health check asks the provider about a send-only domain too, and a provider that could not be reached pages nobody", async () => {
  const sending = await checkMailDomain({
    domain: CAMPAIGNS,
    apiKey: "k",
    sendOnly: true,
    domains: async () => [domain()],
  });
  assert.deepEqual(sending, { trouble: null });
  const both = await checkMailDomain({ domain: CAMPAIGNS, apiKey: "k", domains: async () => [domain()] });
  assert.equal(both.trouble.kind, "off");
  const down = await checkMailDomain({
    domain: CAMPAIGNS,
    apiKey: "k",
    sendOnly: true,
    domains: async () => Promise.reject(new Error("timeout")),
  });
  assert.deepEqual(down, { trouble: null, error: "timeout" });
});

/* Before the test below, which also leaves the secret out: the instance says it once, and this one reads it said. */
test("a campaigns domain named with no UNSUBSCRIBE_SECRET is said once, by name, never the value: offers by email stay closed, and not in silence", async () => {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  try {
    // The secret is the one missing piece: the domain is named and the rest is here.
    setEnv({ ...WIRED, UNSUBSCRIBE_SECRET: undefined });
    for (let i = 0; i < 3; i++) {
      assert.equal(await campaignsDomainVerified({ now: 1 }), false);
      assert.equal(await campaignsLane({ now: 1 }), null);
    }
    const lines = said.filter((l) => l.event === "campaigns_secret_missing");
    assert.equal(lines.length, 1, "once for the instance, however often it is asked");
    assert.deepEqual([lines[0].level, lines[0].domain, lines[0].name], ["error", CAMPAIGNS, "UNSUBSCRIBE_SECRET"]);
    assert.ok(!JSON.stringify(lines[0]).includes("unsub-secret"), "no value to leak: there is none");
  } finally {
    console.error = error;
  }
});

test("the deployment can send offers only with every piece: the domain named (and not the mail domain), the key, the mail domain, the secret, and the provider's yes", async () => {
  // Each piece missing is "no", without the provider being asked.
  for (const missing of ["EMAIL_CAMPAIGNS_DOMAIN", "RESEND_API_KEY", "EMAIL_DOMAIN", "UNSUBSCRIBE_SECRET"]) {
    setEnv({ ...WIRED, [missing]: undefined });
    const asked = provider(listing(domain()));
    assert.equal(await campaignsDomainVerified({ now: 1 }), false, missing);
    assert.equal(await campaignsLane({ now: 1 }), null, missing);
    assert.equal(asked.length, 0, `${missing}: nothing to ask the provider about`);
  }
  // The campaigns domain must not be the mail domain: an offer would then leave from the domain replies use.
  setEnv({ ...WIRED, EMAIL_CAMPAIGNS_DOMAIN: "MAIL.example.com" });
  assert.equal(campaignsDomain(), null);
  assert.equal(await campaignsDomainVerified({ now: 1 }), false);
  setEnv({ ...WIRED, EMAIL_CAMPAIGNS_DOMAIN: "not a domain" });
  assert.equal(campaignsDomain(), null);
  // All of it, and the provider says verified: the lane the job is bound with.
  setEnv(WIRED);
  const asked = provider(listing(domain(), domain({ name: "mail.example.com", receiving: "enabled" })));
  assert.equal(await campaignsDomainVerified({ now: 1, fresh: true }), true);
  assert.deepEqual(await campaignsLane({ now: 1 }), {
    domain: CAMPAIGNS,
    unsubscribeSecret: "unsub-secret",
    unsubscribeOrigin: "https://app.example.com",
  });
  assert.equal(asked.length, 1, "kept: the lane did not ask again");
  assert.equal(asked[0], "https://api.resend.com/domains");
});

test("the answer is kept five minutes when yes and a minute when no; a failed ask is no answer, and never takes a good answer's place", async () => {
  setEnv(WIRED);
  const MIN = 60_000;
  let asked = provider(listing(domain({ status: "pending" })));
  assert.equal(await campaignsDomainVerified({ now: 0, fresh: true }), false, "not yet verified");
  assert.equal(await campaignsDomainVerified({ now: 0.9 * MIN }), false);
  assert.equal(asked.length, 1, "a no is kept briefly");
  // A record published a minute ago does not hide offers for five.
  asked = provider(listing(domain()));
  assert.equal(await campaignsDomainVerified({ now: 1.1 * MIN }), true, "asked again after the minute: now verified");
  assert.equal(await campaignsDomainVerified({ now: 5 * MIN }), true);
  assert.equal(asked.length, 1, "a yes is kept");
  assert.equal(await campaignsDomainVerified({ now: 6.2 * MIN + 0.1 * MIN }), true);
  assert.equal(asked.length, 2, "and asked again after its five minutes (kept from 6.3)");

  // The provider could not be asked. A fresh ask is the provider's word or nothing: null, and the answer it gave stands.
  asked = provider(() => Promise.reject(new Error("connect timeout")));
  assert.equal(await campaignsDomainVerified({ now: 7 * MIN, fresh: true }), null);
  let calls = asked.length;
  assert.ok(calls >= 1, "the provider was asked (and the wire's own retry may have asked twice)");
  assert.equal(
    await campaignsDomainVerified({ now: 7.1 * MIN }),
    true,
    "a failed ask did not overwrite the yes it kept",
  );
  assert.equal(asked.length, calls, "the kept yes answered, nothing was asked");
  // Past its five minutes the refresh fails, and the last yes stands in for it, for half an hour: a provider that stopped
  // answering the domains read has not unverified the domain.
  assert.equal(
    await campaignsDomainVerified({ now: 12 * MIN }),
    true,
    "6.3 + 5 minutes are up: asked, failed, the yes stands",
  );
  assert.ok(asked.length > calls, "it was asked");
  calls = asked.length;
  await campaignsDomainVerified({ now: 12.2 * MIN });
  assert.equal(
    asked.length,
    calls,
    "not asked again inside the half minute, so every job does not ask a down provider at once",
  );
  assert.equal(await campaignsDomainVerified({ now: 12.6 * MIN }), true);
  assert.ok(asked.length > calls, "asked again after it");
  assert.equal(
    (await campaignsBinding({ now: 12.7 * MIN })).state,
    "open",
    "the lane stays bound while the yes stands",
  );
  // After the half hour it no longer does: nothing is known, and a job is told so, never "no lane".
  assert.equal(
    await campaignsDomainVerified({ now: 37 * MIN }),
    null,
    "a yes stands in for half an hour, not for ever",
  );
  assert.equal((await campaignsBinding({ now: 37.1 * MIN })).state, "unread");
  assert.equal(await campaignsLane({ now: 37.2 * MIN }), null);
  // A no is never stood in for: a run waits on a guess, it does not stop on one.
  provider(listing(domain({ status: "pending" })));
  assert.equal(await campaignsDomainVerified({ now: 40 * MIN, fresh: true }), false);
  provider(() => Promise.reject(new Error("down")));
  assert.equal(await campaignsDomainVerified({ now: 45 * MIN }), null, "a refresh that failed after a no is no answer");
  // A provider that answers something that is not a list is also not an answer.
  provider(new Response("<html>oops</html>", { status: 200 }));
  assert.equal(await campaignsDomainVerified({ now: 50 * MIN, fresh: true }), null);
  // A refusal (a revoked key) is the same: never "verified".
  provider(new Response("{}", { status: 401 }));
  assert.equal(await campaignsDomainVerified({ now: 50 * MIN, fresh: true }), null);
});

test("what a broadcast's batch is told of the campaigns domain is one of four, and never 'no lane' for a domain the deployment names: none named, open, closed (named and not verified), unread (could not be asked)", async () => {
  const MIN = 60_000;
  const T0 = 100 * MIN; // after every kept answer of the cases above, which counted from nothing
  // No campaigns domain named: nothing changes for the deployment, and the provider is not asked.
  setEnv({ ...WIRED, EMAIL_CAMPAIGNS_DOMAIN: undefined });
  let asked = provider(listing(domain()));
  assert.deepEqual(await campaignsBinding({ now: T0, fresh: true }), { state: "none" });
  assert.equal(asked.length, 0);
  // Verified: the lane.
  setEnv(WIRED);
  provider(listing(domain()));
  assert.deepEqual(await campaignsBinding({ now: T0, fresh: true }), {
    state: "open",
    lane: { domain: CAMPAIGNS, unsubscribeSecret: "unsub-secret", unsubscribeOrigin: "https://app.example.com" },
  });
  // Named and the provider says it is not verified: closed, with the domain in the reason the platform reads.
  provider(listing(domain({ status: "pending" })));
  const closed = await campaignsBinding({ now: T0 + MIN, fresh: true });
  assert.equal(closed.state, "closed");
  assert.match(closed.why, /campaigns\.example\.com is not verified for sending/);
  // Named and the deployment lacks what an offer needs (the secret): closed too, without asking the provider.
  setEnv({ ...WIRED, UNSUBSCRIBE_SECRET: undefined });
  asked = provider(listing(domain()));
  assert.equal((await campaignsBinding({ now: T0 + 2 * MIN, fresh: true })).state, "closed");
  assert.equal(asked.length, 0);
  // Named and the provider could not be asked: unread, which the tick binds as the email wire not bound.
  setEnv(WIRED);
  provider(() => Promise.reject(new Error("timeout")));
  const unread = await campaignsBinding({ now: T0 + 3 * MIN, fresh: true });
  assert.equal(unread.state, "unread");
  assert.match(unread.why, /campaigns\.example\.com could not be checked with the mail provider/);
});

/* -------------------------------------------------------- the readiness door */

const AUD = "/api/admin/email/wire";
async function status() {
  const raw = JSON.stringify({ op: "status" });
  const token = signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace: null, user: null, body: raw });
  const res = await readiness.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-edge-token": token },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}

test("the readiness door says whether email can send and whether OFFERS can: false until the campaigns domain is verified, null when the provider could not be asked", async () => {
  setEnv({ EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: "re_test_only" });
  assert.deepEqual(
    await status(),
    [200, { ok: true, ready: true, offers: false }],
    "no campaigns domain named: as it was",
  );
  setEnv(WIRED);
  provider(listing(domain({ status: "pending" })));
  await campaignsDomainVerified({ fresh: true });
  assert.deepEqual(await status(), [200, { ok: true, ready: true, offers: false }], "named and not verified");
  provider(listing(domain()));
  await campaignsDomainVerified({ fresh: true });
  assert.deepEqual(await status(), [200, { ok: true, ready: true, offers: true }], "verified: offers can go");
  provider(() => Promise.reject(new Error("down")));
  await campaignsDomainVerified({ fresh: true });
  assert.deepEqual(
    await status(),
    [200, { ok: true, ready: true, offers: true }],
    "a failed ask does not take the place of the yes the provider gave a minute ago",
  );
  // A domain the provider has never answered for: no yes and no no.
  setEnv({ ...WIRED, EMAIL_CAMPAIGNS_DOMAIN: "campaigns-two.example.com" });
  await campaignsDomainVerified({ fresh: true });
  assert.deepEqual(
    await status(),
    [200, { ok: true, ready: true, offers: null }],
    "a provider that could not be asked is no yes and no no",
  );
});

test("a job is bound with email by what the campaigns domain came to: the lane when open, the reason it could not be asked when unread (a run of offers waits, a visit's email goes), the reason when closed (the run stops), and nothing of it for a job that sends no offer", async () => {
  setEnv(WIRED);
  const db = fakeDb({ mailboxes: [MAILBOX], sending_domains: [] });
  const said = [];
  const L = { error: (event, fields) => said.push([event, fields]) };
  const lane = { domain: CAMPAIGNS, unsubscribeSecret: "unsub-secret", unsubscribeOrigin: "https://app.example.com" };
  /** What the tick binds: the wire, and the intake as it is handed what the campaigns domain came to. */
  const bound = async (offers, database = db) => {
    const b = await emailBoundFor(database, T, offers, L);
    return { ...b, intake: emailIntake(database, b.campaigns, b.closed, b.unread) };
  };
  // Open: the wire gains the campaigns route, and the intake carries the lane.
  const open = await bound({ state: "open", lane });
  assert.equal(typeof open.email, "function");
  assert.deepEqual(open.intake.campaigns, lane);
  assert.equal("campaignsClosed" in open.intake, false);
  // Unread: the wire is bound as ever, so a visit's email (from the mail domain, not in question) goes; the intake says the
  // campaigns domain could not be asked about, so a run of offers waits and asks again (core offersUnread) instead of
  // holding each offer person as having no channel, for good.
  const unread = await bound({ state: "unread", why: "the campaigns domain could not be checked" });
  assert.equal(typeof unread.email, "function", "a visit's email is not held for it");
  assert.equal(unread.intake.campaignsUnread, "the campaigns domain could not be checked");
  assert.equal("campaigns" in unread.intake, false);
  assert.equal("campaignsClosed" in unread.intake, false);
  // Closed: the wire is the plain one (a visit message goes from the mail domain, which is not in question), and the intake
  // says why offers cannot leave.
  const closed = await bound({ state: "closed", why: "the campaigns domain is not verified" });
  assert.equal(typeof closed.email, "function");
  assert.equal(closed.intake.campaignsClosed, "the campaigns domain is not verified");
  assert.equal("campaigns" in closed.intake, false);
  // None named, or a job that sends no offer: as it always was, and nothing of the campaigns domain in either.
  const none = await bound({ state: "none" });
  assert.equal(typeof none.email, "function");
  assert.equal("campaigns" in none.intake || "campaignsClosed" in none.intake, false);
  // A workspace with no mailbox has no email line at all, as before.
  const noMailbox = await bound({ state: "none" }, fakeDb({ mailboxes: [], sending_domains: [] }));
  assert.equal(noMailbox.email, null);
  assert.deepEqual(said, []);
});

/* ------------------------------------------------------------- the wire's route */

const MAILBOX = {
  id: "mb1",
  tenant_id: T,
  local_part: "marisas",
  reply_token: "a".repeat(24),
  reply_token_prev: null,
  from_name: "Marisa's Salon",
};
const offerRequest = (over = {}) =>
  buildEmailRequest({
    identity: campaignsIdentity(MAILBOX, CAMPAIGNS, "mail.example.com"),
    to: "ana@example.com",
    parent: null,
    subject: "October",
    body: "Ten percent off.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.example.com/u/tok",
      footer: "foot",
      footerHtml: '<p><a href="https://app.example.com/u/tok">Unsubscribe</a></p>',
    },
    messageId: M,
    tenantId: T,
    ...over,
  });

test("a job that sends offers gets the campaigns route and the lane, and any other job gets neither: nothing else can leave from the domain", async () => {
  setEnv(WIRED);
  const db = fakeDb({ mailboxes: [MAILBOX], sending_domains: [] });
  const lane = { domain: CAMPAIGNS, unsubscribeSecret: "unsub-secret", unsubscribeOrigin: "https://app.example.com" };
  const sent = [];
  globalThis.fetch = async (url, init) => (
    sent.push(JSON.parse(init.body)),
    new Response(JSON.stringify({ id: "re_1" }), { status: 200 })
  );
  const withLane = await emailWireFor(db, T, lane);
  assert.equal(
    (await withLane("ana@example.com", { body: "x", email: offerRequest(), purpose: "marketing" })).ok,
    true,
  );
  assert.match(sent[0].from, /<marisas@campaigns\.example\.com>$/);
  assert.deepEqual(
    sent[0].reply_to,
    [`r+${"a".repeat(24)}@mail.example.com`],
    "answered on the mail domain, which receives",
  );
  // The same workspace's wire for any other job has no campaigns route: an offer has nowhere to leave from.
  const plain = await emailWireFor(db, T);
  assert.equal(
    (await plain("ana@example.com", { body: "x", email: offerRequest(), purpose: "marketing" })).errorBody,
    "request_leaves_as_another_sender",
  );
  assert.equal(sent.length, 1);
  // The intake carries the lane only when it was bound.
  assert.deepEqual(emailIntake(db, lane).campaigns, lane);
  assert.equal("campaigns" in emailIntake(db), false);
  assert.equal(emailIntake(db).domain, "mail.example.com");
});

/* ------------------------------------------------------------------ the gates */

/** A workspace's mailbox with the pause columns, and the receipts' two answers (the counts, and the pause) over a database in memory. */
function gateWorld({ counts = {}, host = CAMPAIGNS, paused = null, failCounts = false, failPause = false } = {}) {
  const tables = {
    mailboxes: [{ ...MAILBOX, offers_paused_at: paused, offers_paused_reason: paused ? "bounces" : null }],
    messages: [],
    sending_domains: [],
    notifications: [],
    events: [],
    jobs: [],
    pages: [],
  };
  const asked = [];
  const paused_calls = [];
  const rpcs = {
    email_offer_counts: (a) => {
      asked.push(a);
      if (failCounts) throw new Error("statement timeout");
      return { complaint_sample: 0, complaints: 0, bounce_sample: 0, bounces: 0, ...counts };
    },
    pause_email_offers: (a) => {
      if (failPause) throw new Error("db down");
      paused_calls.push(a);
      const m = tables.mailboxes.find((x) => x.tenant_id === a.p_tenant_id);
      if (!m || m.offers_paused_at) return false;
      m.offers_paused_at = "2026-10-03T12:00:00Z";
      m.offers_paused_reason = a.p_reason;
      return true;
    },
  };
  const db = fakeDb(tables, {}, rpcs);
  return { tables, db, asked, host, paused_calls, counts: (next) => Object.assign(counts ?? (counts = {}), next) };
}
const FROM = `"Marisa's Salon" <marisas@${CAMPAIGNS}>`;

test("a complaint or a bounce on an offer is judged against the gates: over a limit the workspace's offers are paused, once, for the reason; inside them nothing happens", async () => {
  setEnv(WIRED);
  // Complaints: 2 in the last 1,000 is above 0.1%.
  const over = gateWorld({ counts: { complaint_sample: 1000, complaints: 2, bounce_sample: 400, bounces: 1 } });
  assert.equal(await judgeOfferGates(over.db, T, FROM), "complaints");
  assert.deepEqual(
    over.paused_calls.map((c) => c.p_counts),
    [{ complaint_sample: 1000, complaints: 2, bounce_sample: 400, bounces: 1 }],
    "the pause's event carries the counts the gate judged by",
  );
  assert.deepEqual(
    [over.tables.mailboxes[0].offers_paused_reason, !!over.tables.mailboxes[0].offers_paused_at],
    ["complaints", true],
  );
  assert.deepEqual(
    over.asked,
    [{ p_tenant_id: T, p_host: CAMPAIGNS }],
    "counted from the campaigns domain's own emails",
  );
  // A second judgement finds them paused: the first moment and reason stand.
  const first = over.tables.mailboxes[0].offers_paused_at;
  await judgeOfferGates(over.db, T, FROM);
  assert.equal(over.tables.mailboxes[0].offers_paused_at, first);
  // Bounces: 11 in the last 500 is above 2%.
  const bounces = gateWorld({ counts: { complaint_sample: 1000, complaints: 1, bounce_sample: 500, bounces: 11 } });
  assert.equal(await judgeOfferGates(bounces.db, T, FROM), "bounces");
  assert.equal(bounces.tables.mailboxes[0].offers_paused_reason, "bounces");
  // Inside both: nothing is paused.
  const fine = gateWorld({ counts: { complaint_sample: 1000, complaints: 1, bounce_sample: 500, bounces: 10 } });
  assert.equal(await judgeOfferGates(fine.db, T, FROM), null);
  assert.equal(fine.tables.mailboxes[0].offers_paused_at, null);
});

test("a gate judges only over its minimum sample, and a resumed workspace is judged afresh: too few offers pause nothing, and a gate tripped again after a resume pauses again, for its own reason", async () => {
  setEnv(WIRED);
  // The first offers of a workspace: one complaint among thirty is 3%, and no gate (it paused the workspace at once).
  const few = gateWorld({ counts: { complaint_sample: 30, complaints: 1, bounce_sample: 30, bounces: 5 } });
  assert.equal(await judgeOfferGates(few.db, T, FROM), null);
  assert.deepEqual([few.paused_calls, few.tables.mailboxes[0].offers_paused_at], [[], null], "nothing written");
  // Just under and at each minimum.
  const near = gateWorld({ counts: { complaint_sample: 199, complaints: 4, bounce_sample: 99, bounces: 20 } });
  assert.equal(await judgeOfferGates(near.db, T, FROM), null, "one short of each minimum");
  near.counts({ complaint_sample: 200, complaints: 1 });
  assert.equal(await judgeOfferGates(near.db, T, FROM), "complaints", "at the minimum one complaint is above 0.1%");

  // A workspace paused for bounces, fixed its list, and resumed (the back office: resume_email_offers clears the pause and
  // stamps offers_resumed_at, so the counts the gate reads are of the offers sent since). Its count starts again.
  const w = gateWorld({ counts: { bounce_sample: 500, bounces: 30 } });
  assert.equal(await judgeOfferGates(w.db, T, FROM), "bounces");
  assert.equal(w.tables.mailboxes[0].offers_paused_reason, "bounces");
  Object.assign(w.tables.mailboxes[0], {
    offers_paused_at: null,
    offers_paused_reason: null,
    offers_resumed_at: "2026-10-04T09:00:00Z",
  });
  w.counts({ bounce_sample: 12, bounces: 1, complaint_sample: 12, complaints: 0 });
  assert.equal(
    await judgeOfferGates(w.db, T, FROM),
    null,
    "the first offers since the resume: too few to judge, and not the ones that paused it",
  );
  assert.equal(w.tables.mailboxes[0].offers_paused_at, null);
  // Enough offers later, the list is still bad: the gate trips again, pauses again (a new moment, the reason it is now).
  w.counts({ bounce_sample: 150, bounces: 6, complaint_sample: 150, complaints: 0 });
  assert.equal(await judgeOfferGates(w.db, T, FROM), "bounces");
  assert.deepEqual(
    [w.tables.mailboxes[0].offers_paused_reason, !!w.tables.mailboxes[0].offers_paused_at],
    ["bounces", true],
  );
  assert.equal(w.paused_calls.length, 2, "paused twice: once before the resume and once after it");
  assert.deepEqual(w.paused_calls[1].p_counts.bounce_sample, 150, "and the second event carries the afresh counts");
});

test("only an offer is judged: an email from the reply domain, one with no From, and a deployment with no campaigns domain touch no gate", async () => {
  setEnv(WIRED);
  for (const from of [
    '"Marisa\'s Salon" <marisas@mail.example.com>',
    null,
    "not an address",
    `"x" <marisas@other.example.com>`,
  ]) {
    const w = gateWorld({ counts: { complaint_sample: 10, complaints: 9 } });
    assert.equal(await judgeOfferGates(w.db, T, from), null, String(from));
    assert.deepEqual(w.asked, [], "not even counted");
  }
  setEnv({ ...WIRED, EMAIL_CAMPAIGNS_DOMAIN: undefined });
  const w = gateWorld({ counts: { complaint_sample: 10, complaints: 9 } });
  assert.equal(await judgeOfferGates(w.db, T, FROM), null);
  assert.equal(w.tables.mailboxes[0].offers_paused_at, null);
});

test("a gate that cannot be judged or written is logged and never refuses the receipt: the next complaint judges again", async () => {
  setEnv(WIRED);
  const noCounts = gateWorld({ failCounts: true });
  assert.equal(await judgeOfferGates(noCounts.db, T, FROM), null);
  const noPause = gateWorld({ counts: { complaint_sample: 10, complaints: 5 }, failPause: true });
  assert.equal(await judgeOfferGates(noPause.db, T, FROM), null);
  assert.equal(noPause.tables.mailboxes[0].offers_paused_at, null);
});

/* ---------------------------------------- through the webhook's door: a complaint */

let n = 0;
async function post(payload) {
  const raw = JSON.stringify(payload);
  const id = `msg_o${++n}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${await resendWebhookSignature(SECRET, id, ts, raw)}`,
  };
  const res = await resendDoor.POST(
    new Request("https://chanlytics-messaging.vercel.app/api/resend-webhook", { method: "POST", headers, body: raw }),
    { waitUntil: () => {} },
  );
  return res.status;
}
const receipt = (type, from, over = {}) => ({
  type: `email.${type}`,
  created_at: "2026-10-03T12:00:05Z",
  data: {
    email_id: "re_1",
    message_id: "<abc@x.example>",
    from,
    to: ["ana@example.com"],
    subject: "October",
    tags: { cl_message: M, cl_tenant: T },
    ...over,
  },
});
function receiptWorld(counts, { from = FROM } = {}) {
  const tables = {
    mailboxes: [{ ...MAILBOX, offers_paused_at: null, offers_paused_reason: null }],
    messages: [
      {
        id: M,
        tenant_id: T,
        conversation_id: "c1",
        contact_id: "k1",
        channel: "email",
        direction: "outbound",
        status: "delivered",
        external_id: null,
        error: null,
        meta: { source: "broadcast", email: { subject: "October", request: { from, to: ["ana@example.com"] } } },
      },
    ],
    contacts: [
      { id: "k1", tenant_id: T, email: "ana@example.com", email_suppressed_at: null, email_suppressed_reason: null },
    ],
    sending_domains: [],
    tenant_config: [{ tenant_id: T, config: { notifications: { escalation_emails: ["owner@example.com"] } } }],
    tenant_channels: [],
    notifications: [],
    escalations: [],
    events: [],
    jobs: [],
  };
  const rpcs = {
    stamp_email_sent: (a) =>
      tables.messages.some((m) => m.id === a.p_message_id)
        ? [{ status: tables.messages[0].status, conversation_id: "c1" }]
        : [],
    set_email_marketing: () => ({ changed: true, found: true }),
    stamp_email_complaint: (a) => {
      const m = tables.messages.find((x) => x.id === a.p_message_id);
      if (!m || m.meta.email.complained_at) return false;
      m.meta = { ...m.meta, email: { ...m.meta.email, complained_at: a.p_at } };
      return true;
    },
    sending_domain_counts: () => ({ sent: 0, bounced: 0, complained: 0 }),
    email_offer_counts: (a) => ({
      complaint_sample: 0,
      complaints: 0,
      bounce_sample: 0,
      bounces: 0,
      ...counts,
      host: a.p_host,
    }),
    pause_email_offers: (a) => {
      if (tables.mailboxes[0].offers_paused_at) return false;
      tables.mailboxes[0].offers_paused_at = "2026-10-03T12:00:00Z";
      tables.mailboxes[0].offers_paused_reason = a.p_reason;
      return true;
    },
  };
  setPg(fakeDb(tables, {}, rpcs));
  return tables;
}

test("a complaint on an offer lands through the webhook's door and pauses the workspace's offers when it tips a gate; the same complaint on a reply pauses nothing", async () => {
  setEnv({ ...WIRED, RESEND_API_KEY: "re_test_only" });
  process.env.EMAIL_DOMAIN = "mail.example.com";
  const over = receiptWorld({ complaint_sample: 400, complaints: 2 });
  assert.equal(await post(receipt("complained", FROM)), 200);
  assert.deepEqual(
    [over.mailboxes[0].offers_paused_reason, !!over.mailboxes[0].offers_paused_at],
    ["complaints", true],
  );
  assert.equal(over.contacts[0].email_suppressed_reason, "complaint", "the receipt did all it always did");
  // A complaint on a reply (from the mail domain) is the receipt's own business and no gate's.
  const reply = receiptWorld(
    { complaint_sample: 400, complaints: 20 },
    { from: '"Marisa" <marisas@mail.example.com>' },
  );
  assert.equal(await post(receipt("complained", '"Marisa" <marisas@mail.example.com>')), 200);
  assert.equal(reply.mailboxes[0].offers_paused_at, null);
  // A permanent bounce of an offer is judged for the bounce gate.
  const bounced = receiptWorld({ bounce_sample: 100, bounces: 10 });
  assert.equal(
    await post(receipt("bounced", FROM, { bounce: { type: "Permanent", subType: "General", message: "550" } })),
    200,
  );
  assert.equal(bounced.mailboxes[0].offers_paused_reason, "bounces");
});
