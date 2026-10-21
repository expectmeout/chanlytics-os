/**
 * Report a problem's mail, run (decision 0066): POST /api/admin/support/report over a database in memory and a
 * captured wire to the mail transport. The dashboard keeps the report first; this door sends the one thing Postgres
 * cannot, a mail to the support inbox with the member's address as its Reply-To. What is proved: the knock, the inbox it
 * goes to (SUPPORT_TO, else the platform's own), that the report is read by its id and the member the token names and
 * never taken from the body, what the mail says and what it never says, and a transport that refuses.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Chanlytics <pager@platform.test>";
process.env.SUPPORT_TO = "help@platform.test";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/admin/support/report.ts"));
after(() => setPg(null));

const AUD = "/api/admin/support/report";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const R1 = "33333333-3333-4333-8333-333333333333";

const reportRow = (over = {}) => ({
  id: R1,
  number: 1042,
  tenant_id: A,
  user_id: MEMBER,
  email: "owner@example.com",
  page: "calendar",
  error_id: "e4c1",
  error_name: "TypeError",
  error_message: "Cannot read properties of undefined",
  words: "The calendar won't load since this morning.",
  created_at: "2026-10-21T10:02:00.000Z",
  mailed_at: null,
  mail_error: null,
  // The embed, as PostgREST joins it.
  tenant: { slug: "rivera-nails", name: "Rivera Nails" },
  ...over,
});

const knock = (body, o = {}) => {
  const raw = JSON.stringify(body);
  const token = signEdgeToken(process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: "user" in o ? o.user : MEMBER,
    body: raw,
  });
  return POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(o.noToken ? {} : { "x-edge-token": token }) },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];

/** Every request to the transport, captured and answered by `reply`. */
function wire(reply = () => ({ status: 200, body: { id: "email_1" } })) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    const a = reply();
    return new Response(JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
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

test("the knock: no token, or a token for another door, is refused before the database or the wire is asked", async () => {
  setPg(fakeDb({ support_reports: [reportRow()] }));
  const w = wire();
  try {
    assert.equal((await knock({ report_id: R1 }, { noToken: true })).status, 403);
    assert.equal((await knock({ report_id: R1 }, { aud: "/api/admin/setup-request" })).status, 403);
    assert.deepEqual(w.mail(), []);
  } finally {
    w.restore();
  }
});

test("the support inbox has the mail: from the platform's address, Reply-To the member, the report's number first", async () => {
  setPg(fakeDb({ support_reports: [reportRow()] }));
  const w = wire();
  try {
    assert.deepEqual(await answer(await knock({ report_id: R1 })), [200, { ok: true }]);
    const [mail] = w.mail();
    assert.equal(mail.from, "Chanlytics <pager@platform.test>");
    assert.deepEqual(mail.to, ["help@platform.test"]);
    assert.equal(mail.reply_to, "owner@example.com", "a reply from the inbox reaches the member");
    assert.match(
      mail.subject,
      /^R-1042 · Rivera Nails \(rivera-nails\) · The calendar won't load since this morning\.$/,
    );
    assert.match(mail.text, /What they wrote:\nThe calendar won't load since this morning\./);
    assert.match(mail.text, /Page: Calendar/);
    assert.match(mail.text, /Last error: e4c1 · TypeError: Cannot read properties of undefined/);
    assert.match(mail.text, /\/console\/support/);
  } finally {
    w.restore();
  }
});

test("the report is read by its id and the member the token names: a body cannot speak for it, nor another member's token", async () => {
  setPg(fakeDb({ support_reports: [reportRow()] }));
  const w = wire();
  try {
    assert.equal((await knock({ report_id: R1 }, { user: STRANGER })).status, 404, "another member's report is none");
    assert.equal((await knock({ report_id: "not-an-id" })).status, 400);
    assert.equal((await knock({ report_id: R1, words: "forged", email: "x@evil.test" })).status, 200);
    const [mail] = w.mail();
    assert.doesNotMatch(mail.text, /forged/, "what is mailed is what the row holds");
    assert.equal(mail.reply_to, "owner@example.com");
  } finally {
    w.restore();
  }
});

test("without SUPPORT_TO the platform's own mailbox has it; without a sender there is nowhere to send from", async () => {
  const before = process.env.SUPPORT_TO;
  delete process.env.SUPPORT_TO;
  setPg(fakeDb({ support_reports: [reportRow()] }));
  const w = wire();
  try {
    assert.equal((await knock({ report_id: R1 })).status, 200);
    assert.deepEqual(w.mail()[0].to, ["ops@platform.test"]);
  } finally {
    w.restore();
    process.env.SUPPORT_TO = before;
  }
  const from = process.env.LEAD_FROM;
  delete process.env.LEAD_FROM;
  try {
    setPg(fakeDb({ support_reports: [reportRow()] }));
    const [status, body] = await answer(await knock({ report_id: R1 }));
    assert.equal(status, 503);
    assert.equal(body.error, "no_platform_mailbox");
  } finally {
    process.env.LEAD_FROM = from;
  }
});

test("a transport that refuses is said as 502, and a report with no workspace or error says so plainly", async () => {
  setPg(fakeDb({ support_reports: [reportRow()] }));
  const w = wire(() => ({ status: 422, body: { message: "invalid" } }));
  try {
    assert.equal((await knock({ report_id: R1 })).status, 502);
  } finally {
    w.restore();
  }
  setPg(fakeDb({ support_reports: [reportRow({ tenant: null, error_id: null, page: null, email: null })] }));
  const plain = wire();
  let bare;
  try {
    assert.equal((await knock({ report_id: R1 })).status, 200);
    [bare] = plain.mail();
  } finally {
    plain.restore();
  }
  assert.equal(bare.reply_to, undefined, "no address, no Reply-To");
  assert.match(bare.subject, /^R-1042 · No workspace · /);
  setPg(fakeDb({ support_reports: [reportRow({ words: "It broke.\r\nBcc: someone@example.com\n\nAgain" })] }));
  const lines = wire();
  try {
    assert.equal((await knock({ report_id: R1 })).status, 200);
    const [mail] = lines.mail();
    assert.equal(mail.subject, "R-1042 · Rivera Nails (rivera-nails) · It broke. Bcc: someone@example.com Again");
    assert.match(mail.text, /What they wrote:\nIt broke\.\r\nBcc/, "the body keeps their words as written");
  } finally {
    lines.restore();
  }
  assert.match(bare.text, /from a member in No workspace/);
  assert.match(bare.text, /Last error: None caught/);
  assert.match(bare.text, /Page: No page/);
});
