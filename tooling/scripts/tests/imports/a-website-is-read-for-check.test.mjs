/**
 * The business's website read for Check (decision 0073, R10; apps/edge/lib/imports/website-read.ts), run over a database
 * in memory with the site and the model's API answered by the test: its home page and the pages it links to for its
 * services, prices and rules, drawn out into the fixed shape and kept whole in business_reads; a read that could not be
 * made keeps why, which Check says. And the door the dashboard asks it by (POST /api/admin/imports/website-read): the
 * settings' website, else the listing's, one job while one waits, and nothing asked of an address that is not public.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { WEBSITE_UNREAD_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
const KEY = "sk-ant-made-up-for-this-file";
const was = { EDGE_CALL_SECRET: process.env.EDGE_CALL_SECRET, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
Object.assign(process.env, { EDGE_CALL_SECRET: SECRET, ANTHROPIC_API_KEY: KEY });
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const { websiteReader, scheduleWebsiteRead } = await importSrc("apps/edge/lib/imports/website-read.ts");
const door = await importSrc("apps/edge/api/admin/imports/website-read.ts");
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const SITE = "https://harbormoving.example";
const AUD = "/api/admin/imports/website-read";

/** The database the read and the door find: the settings, the listing, the reads kept, the jobs, the model's ledger. */
function world({ website = SITE, listingWebsite = null } = {}) {
  const tables = {
    tenants: [{ id: A, name: "Harbor Moving", timezone: "America/New_York", status: "active" }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving",
            system_prompt: "You answer for Harbor Moving, a moving company.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: website ? { website } : {},
          },
        },
      },
    ],
    google_listings: listingWebsite ? [{ tenant_id: A, place_id: "p1", facts: { website: listingWebsite } }] : [],
    business_reads: [],
    jobs: [],
    ai_usage: [],
  };
  const db = fakeDb(tables);
  setPg(db);
  return { db, tables };
}

/** The web as the read sees it: each page's HTML by its address, and the model's answer, each call kept. */
function web(pages, answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, body: init.body ? JSON.parse(String(init.body)) : null });
    if (u === "https://api.anthropic.com/v1/messages")
      return new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 900, output_tokens: 120 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const html = pages[u];
    return html === undefined
      ? new Response("not here", { status: 404, headers: { "content-type": "text/html" } })
      : new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

const HOME = `<html><body><h1>Harbor Moving</h1><p>Family movers in Brooklyn.</p>
  <a href="/services">Our services</a> <a href="/faq">Questions</a> <a href="https://elsewhere.example/x">Elsewhere</a></body></html>`;
const SERVICES = "<html><body><h2>Local moves</h2><p>From $300. Packing $40 an hour.</p></body></html>";
const FAQ = "<html><body><p>Do you move pianos? Yes, with two days' notice.</p></body></html>";
const READ = {
  services: [{ name: "Local moves", price_note: "From $300", duration_min: null }],
  closed: [],
  rules: ["A $50 deposit holds the day"],
  answers: [{ q: "Do you move pianos?", a: "Yes, with two days' notice." }],
  description: "Family movers in Brooklyn.",
};
const read = (w, url = SITE) =>
  websiteReader(w.db).read({ id: "job-1", tenant_id: A, kind: "website_read", payload: { url } }, Date.now() + 60_000);

test("a website read: its home page and the pages it links to for services and questions, drawn out and kept whole as the profile's read is", async () => {
  const w = world();
  const net = web({ [`${SITE}/`]: HOME, [`${SITE}/services`]: SERVICES, [`${SITE}/faq`]: FAQ }, READ);
  try {
    await read(w);
  } finally {
    net.restore();
  }
  const pages = net.calls.filter((c) => !c.url.includes("anthropic")).map((c) => c.url);
  assert.ok(
    pages.includes(`${SITE}/`) && pages.includes(`${SITE}/services`),
    `the home page and its own pages: ${pages}`,
  );
  assert.ok(!pages.some((p) => p.startsWith("https://elsewhere.example")), "never another site's page");
  const model = net.calls.find((c) => c.url.includes("anthropic"));
  assert.equal(model.body.output_config.format.type, "json_schema", "drawn out into the fixed shape");
  assert.match(model.body.messages[0].content, /^Page https:\/\/harbormoving\.example\/\n/);
  assert.match(model.body.messages[0].content, /From \$300/, "the pages' words, made plain text");
  const [kept] = w.tables.business_reads;
  assert.deepEqual([kept.tenant_id, kept.source, kept.read_from, kept.error], [A, "website", `${SITE}/`, null]);
  assert.deepEqual(kept.facts, READ);
  assert.deepEqual(
    w.tables.ai_usage.map((u) => [u.tenant_id, u.purpose]),
    [[A, "website_read"]],
    "the call written to the model's ledger, platform-spent",
  );
});

test("a read that could not be made keeps why, as Check says it: not a public address, no page, a reading that failed, or nothing found", async () => {
  const w = world();
  await read(w, "http://10.0.0.7/");
  assert.equal(w.tables.business_reads[0].error, WEBSITE_UNREAD_WORDS.address);
  const silent = world();
  const none = web({}, READ);
  try {
    await read(silent);
  } finally {
    none.restore();
  }
  assert.equal(silent.tables.business_reads[0].error, WEBSITE_UNREAD_WORDS.silent);
  assert.equal(none.calls.filter((c) => c.url.includes("anthropic")).length, 0, "nothing asked of the model");
  const empty = world();
  const blank = web(
    { [`${SITE}/`]: "<html><body><p>Coming soon.</p></body></html>" },
    { services: [], closed: [], rules: [], answers: [], description: null },
  );
  try {
    await read(empty);
  } finally {
    blank.restore();
  }
  assert.deepEqual(
    [empty.tables.business_reads[0].error, empty.tables.business_reads[0].facts.services],
    [WEBSITE_UNREAD_WORDS.nothing, []],
  );
  // No model key on this deployment: said, never a guess.
  const keyless = world();
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await read(keyless);
  } finally {
    process.env.ANTHROPIC_API_KEY = KEY;
  }
  assert.equal(keyless.tables.business_reads[0].error, WEBSITE_UNREAD_WORDS.failed);
});

test("a website read asked for is one job while one waits, and nothing is asked of an address that is not public", async () => {
  const w = world();
  await scheduleWebsiteRead(w.db, A, SITE);
  await scheduleWebsiteRead(w.db, A, SITE);
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.url]),
    [["website_read", `${SITE}/`]],
  );
  await scheduleWebsiteRead(w.db, A, "javascript:alert(1)");
  await scheduleWebsiteRead(w.db, A, null);
  assert.equal(w.tables.jobs.length, 1);
});

async function ask(body, { workspace = A } = {}) {
  const raw = JSON.stringify({ tenant_id: A, user_id: U, ...body });
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

test("the dashboard's door: the settings' website, else the listing's, asked once; a workspace with none is answered that nothing was asked; another workspace's token is refused", async () => {
  const w = world();
  assert.deepEqual(await ask({}), [200, { ok: true, asked: true }]);
  assert.deepEqual(
    w.tables.jobs.map((j) => j.payload.url),
    [`${SITE}/`],
  );
  const fromListing = world({ website: null, listingWebsite: "https://listing.example" });
  assert.deepEqual(await ask({}), [200, { ok: true, asked: true }]);
  assert.deepEqual(
    fromListing.tables.jobs.map((j) => j.payload.url),
    ["https://listing.example/"],
  );
  world({ website: null });
  assert.deepEqual(await ask({}), [200, { ok: true, asked: false }]);
  world();
  const [status] = await ask({}, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  assert.equal(status, 403);
});
