/**
 * A form on the business's own website (00701; the Forms plan, F4 and 3.11; Ruben's call 15), as a visitor's browser
 * meets it, run as the app serves it over a database in memory: the hosted form in a frame, at an address of its own
 * (/f/<code>, the form's website link) that knows no session and names the sites it may be framed on.
 *
 * The plan's "done when" lines lead: a pasted form sends an entry with no key in the page; a browser refuses to show the
 * form on a site that is not on the list (its content policy names the listed sites as the frame's only ancestors); it
 * works with scripts blocked (a plain form that posts back to its frame and answers a whole page); an entry sent
 * straight to the door from elsewhere is held, not trusted and not lost. The browser's own refusal is walked beside
 * this file; here, the policy it enforces.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, emailWire, FORM, formWorld } from "../_form-requests.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setLinkPageClient } = await import(at("apps/dashboard/src/server/public/link-page.ts"));
const { drawFramedForm, takeFramedForm, fitScript } = await import(
  at("apps/dashboard/src/server/public/form-frame.ts")
);
const { takeFormPost } = await import(at("apps/dashboard/src/server/public/form-page.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { websiteLinesOf } = await import("@chanlytics/contracts");

const wire = emailWire(getEmailWire);
after(() => wire.undo());
beforeEach(async () => {
  setRateStore(memoryStore());
  await wire.says(true);
});

const WEB = "33333333-3333-4333-8333-333333333333";
const CODE = "web2st";
const APP = "https://app.chanlytics.com";
const FRAME = `${APP}/f/${CODE}`;
const BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

/** The salon's world (_form-requests.mjs) with its website: a link whose code is the frame, and the sites it may show on. */
function world(sites = ["luma-salon.com"]) {
  const made = formWorld();
  made.tables.links.push({
    id: WEB,
    tenant_id: A,
    code: CODE,
    subject_type: "form",
    subject_id: FORM,
    place: "Your website",
    printed: false,
    created_by: null,
    created_at: "2026-11-20T00:00:00Z",
    stopped_at: null,
    sites,
  });
  setLinkPageClient(made.db);
  return made;
}

/** The frame as their page's browser asks for it: from their page (its Referer, the origin alone by default), framed. */
const askFrame = (code = CODE, query = "") =>
  drawFramedForm(
    code,
    new Request(`${APP}/f/${code}${query}`, {
      headers: { referer: "https://luma-salon.com/", "user-agent": BROWSER, "sec-fetch-dest": "iframe" },
    }),
  );

/** The values a drawn page carries unseen, read back as a browser would send them. */
const carriedOf = (html) =>
  Object.fromEntries(
    [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1], m[2]]),
  );

const policyOf = (res) => res.headers.get("content-security-policy") ?? "";
const ancestorsOf = (res) => /frame-ancestors ([^;]+)/.exec(policyOf(res))?.[1].split(" ").filter(Boolean) ?? [];

const ANA = { "a.f1name": "Ana Ruiz", "a.f2mail": "ana@example.com", "a.f4want": "A warm, soft blonde." };

/** A send from the frame, as its own form makes it: from the frame's own address unless `headers` say otherwise. */
async function sendFromFrame(
  carried,
  { headers = { origin: APP, "sec-fetch-site": "same-origin" }, answers = ANA } = {},
) {
  const body = new URLSearchParams({ ...carried, t: String(Date.now() - 10_000) });
  for (const [name, value] of Object.entries(answers)) body.append(name, value);
  return takeFramedForm(
    CODE,
    new Request(FRAME, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body,
    }),
  );
}

test("a pasted form shows on the site it may show on and on no other: its policy names that site alone", async () => {
  const made = world();
  const res = await askFrame();
  assert.equal(res.status, 200);
  assert.deepEqual(ancestorsOf(res), ["https://luma-salon.com", "https://www.luma-salon.com"]);
  assert.equal(res.headers.get("x-frame-options"), null, "nothing older refuses the frame either");
  const html = await res.text();
  assert.match(html, new RegExp(`<form[^>]+action="/f/${CODE}"`), "it posts back to its own frame");
  // Its open is counted as the website link's, as /l/'s are.
  assert.equal(made.tables.link_days.find((d) => d.link_id === WEB)?.opens, 1);
});

test("the page holds no key: what it carries unseen is the entry's id, the version, the time, the link and the site", async () => {
  world();
  const html = await (await askFrame()).text();
  const carried = carriedOf(html);
  assert.deepEqual(Object.keys(carried).sort(), ["entry_id", "l", "site", "t", "version"]);
  assert.equal(carried.l, CODE, "the frame's own link, so its entries count as from the website");
  assert.equal(carried.site, "https://luma-salon.com/");
  // Nor do the lines an owner pastes: the frame, a plain link to the form, and the script that fits it.
  const lines = websiteLinesOf({ origin: APP, code: CODE, title: "Colour consultation", linkWords: "Open the form" });
  assert.deepEqual(lines.split("\n"), [
    `<iframe src="${APP}/f/${CODE}" title="Colour consultation" style="width:100%;height:760px;border:0"></iframe>`,
    `<a href="${APP}/l/${CODE}" data-chanlytics-form>Open the form</a>`,
    `<script src="${APP}/f/fit.js" async></script>`,
  ]);
});

test("with no site on its list, and for any code that is no website's, no browser shows a frame anywhere", async () => {
  world([]);
  assert.deepEqual(ancestorsOf(await askFrame()), ["'none'"], "the last site removed: shown nowhere");
  world();
  for (const code of ["k7q2md", "zzzzzz", "NOPE!!"]) {
    const res = await askFrame(code);
    assert.equal(res.status, 404, code);
    assert.deepEqual(ancestorsOf(res), ["'none'"], `${code} opens nothing, framed nowhere`);
  }
});

test("a frame knows no session: an address that asks for a test draws the real form, asking nobody who is signed in", async () => {
  world();
  const html = await (await askFrame(CODE, "?test=1")).text();
  assert.doesNotMatch(html, /A test\./);
  assert.match(html, /parent\.postMessage/, "and it tells the page around it how tall it is");
  assert.match(
    html,
    /"https:\/\/luma-salon\.com","https:\/\/www\.luma-salon\.com"/,
    "taking labels only from its sites",
  );
});

test("an entry sent from the frame is taken as the hosted form takes one: through the website's link, from its site", async () => {
  const made = world();
  const carried = carriedOf(await (await askFrame()).text());
  const res = await sendFromFrame(carried);
  assert.equal(res.status, 200);
  assert.deepEqual(
    ancestorsOf(res),
    ["https://luma-salon.com", "https://www.luma-salon.com"],
    "the thank-you shows too",
  );
  const thanks = await res.text();
  assert.match(thanks, /^<!doctype html>/, "with scripts blocked, a whole page answers inside the frame");
  assert.match(thanks, new RegExp(`href="/f/${CODE}\\?again=1&amp;l=${CODE}"|href="/f/${CODE}\\?again=1&l=${CODE}"`));
  assert.match(
    thanks,
    /class="go wa" href="https:\/\/wa\.me\/[^"]+" target="_blank" rel="noopener"/,
    "the chat opens beside it",
  );
  const [entry] = made.tables.form_entries;
  assert.equal(entry.state, "accepted");
  assert.equal(entry.link_id, WEB);
  assert.equal(entry.source.site, "luma-salon.com");
  assert.equal(entry.source.page, `/f/${CODE}`);
});

test("an entry sent straight to the door from elsewhere is held: never the bell, never counted, never lost", async () => {
  const made = world();
  const carried = carriedOf(await (await askFrame()).text());
  // A script with no browser, and another site's page: neither is the form's own page.
  for (const headers of [{}, { origin: "https://someone-elses-site.example", "sec-fetch-site": "cross-site" }]) {
    const res = await sendFromFrame({ ...carried, entry_id: crypto.randomUUID() }, { headers });
    assert.equal(res.status, 200, "the sender is told nothing of it");
  }
  // The hosted form's own address takes the same rule: one way in, for every way in.
  await takeFormPost(
    "luma-salon",
    "colour-consultation",
    new Request(`${APP}/b/luma-salon/colour-consultation`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...carried, entry_id: crypto.randomUUID(), t: String(Date.now() - 10_000), ...ANA }),
    }),
    async () => made.db,
  );
  const held = made.tables.form_entries;
  assert.equal(held.length, 3, "each is kept");
  for (const entry of held) {
    assert.equal(entry.state, "held");
    assert.equal(entry.held_why, "elsewhere");
    assert.equal(entry.contact_id, null, "and nobody is made of it");
  }
  assert.equal(made.tables.events.length, 0, "nothing rings");
  assert.equal(made.tables.forms[0].last_entry_at, null, "and nothing counts it");
});

test("fit.js is a script kept an hour, that reads only messages from its own address and sends labels only there", async () => {
  const res = fitScript();
  assert.equal(res.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
  const script = await res.text();
  assert.match(script, /e\.origin!==o/);
  assert.match(script, /postMessage\(\{chanlytics:'labels',labels:l\},o\)/);
  assert.match(script, /data-chanlytics-form/, "and the plain link steps aside once its frame says it is there");
});
