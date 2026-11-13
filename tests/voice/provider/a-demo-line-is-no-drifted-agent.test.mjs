/**
 * 13 Nov 2026. The phone lines' daily drift read (apps/edge/lib/voice/watch/voice-watch.ts) asks the provider for the
 * agent of every active voice line. A demo workspace's line names an agent the provider never made
 * (`demo-voice-+12125550189`), so it was "the agent could not be read" every morning, and the platform was paged for it
 * from 4 Nov to 13 Nov, after the two real lines were converged as well. A line whose agent is not the provider's is
 * not read and not paged; a real agent that cannot be read still is, since that is a line that answers nobody.
 *
 * The real watch runs, over a database in memory; the provider and the mail are stood in for at `fetch`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.RESEND_API_KEY = "resend-key-for-this-file";
process.env.LEAD_FROM = "pager@example.test";
process.env.LEAD_TO = "ops@example.test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { watchVoice } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/voice/watch/voice-watch.ts")).href);

const REAL = "agent_0123456789abcdef0123456789";
const DEMO = "demo-voice-+12125550189";
/** The hour the agents are read for drift. */
const MORNING = new Date("2026-11-14T06:13:00Z");

const line = (tenant, agent) => ({
  tenant_id: tenant,
  kind: "voice",
  status: "active",
  external_id: agent,
  number_e164: "+12125550100",
});

/** The provider and the mail, stood in for: what was asked of each. */
async function morningWith(lines) {
  const asked = [];
  const mailed = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com")) {
      mailed.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "mail_1" }), { status: 200 });
    }
    asked.push(u);
    // The provider holds no agent of these: a real one that cannot be read is drift all the same.
    return new Response(JSON.stringify({ status: "not_found" }), { status: 404 });
  };
  try {
    const db = fakeDb({ tenant_channels: lines, operator_pages: [] });
    const out = await watchVoice(db, MORNING);
    return { out, asked, mailed };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("REGRESSION: a demo line's made-up agent is never asked of the provider and never paged -- it was paged every morning", async () => {
  const { out, asked, mailed } = await morningWith([line("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", DEMO)]);
  assert.deepEqual(
    asked.filter((u) => u.includes("demo-voice")),
    [],
    "the provider is never asked for an agent it never made",
  );
  assert.equal(out.drifted, 0, "nothing drifted");
  assert.deepEqual(mailed, [], "and nobody is paged");
});

test("a real line whose agent cannot be read is still paged, beside a demo line that is not", async () => {
  const { out, mailed } = await morningWith([
    line("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", DEMO),
    line("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", REAL),
  ]);
  assert.equal(out.drifted, 1);
  assert.equal(mailed.length, 1);
  const page = mailed[0];
  assert.match(page.subject, /1 phone line has drifted/);
  assert.ok(page.text.includes(REAL) && page.text.includes("the agent could not be read"), "the real line, and why");
  assert.ok(!page.text.includes("demo-voice"), "and no demo line");
});
