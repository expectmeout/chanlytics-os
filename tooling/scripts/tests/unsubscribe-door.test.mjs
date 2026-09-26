/**
 * The unsubscribe link's door (apps/dashboard app/u/[token]/route.ts over src/server/unsubscribe.ts), run: the
 * real route module, over a database in memory. RFC 8058's rules are what is proved: a GET changes nothing, the
 * one click and the page's button each record the stop in the same response, nothing ever redirects, and a link
 * this secret did not make is refused before anything is asked of the database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { signUnsubscribeToken } from "@chanlytics/channels";

const SECRET = "the-unsubscribe-secret-for-this-file";
process.env.UNSUBSCRIBE_SECRET = SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
after(() => {
  delete process.env.UNSUBSCRIBE_SECRET;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/u/[token]/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/unsubscribe.ts"));
after(() => setServiceClient(null));

const A = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const M = "11111111-1111-4111-8111-111111111111";
const TOKEN = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: M });

function world({ name = "Best Movers", fails = false } = {}) {
  const pressed = [];
  const db = fakeDb(
    { tenants: [{ id: A, name }] },
    {},
    {
      set_email_marketing: (args) => {
        if (fails) throw new Error("the database is not answering");
        pressed.push(args);
        return { changed: pressed.length === 1, found: true, business: name };
      },
    },
  );
  setServiceClient(db);
  return { db, pressed };
}

const url = (token = TOKEN) => `https://app.chanlytics.com/u/${token}`;
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
const get = (token = TOKEN) => route.GET(new Request(url(token)), ctx(token));
const post = (body, { token = TOKEN, type = "application/x-www-form-urlencoded" } = {}) =>
  route.POST(
    new Request(url(token), {
      method: "POST",
      headers: typeof body === "string" ? { "content-type": type } : {},
      body,
    }),
    ctx(token),
  );
const noStore = (res) => {
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.equal(res.headers.get("location"), null, "never a redirect (RFC 8058 §3.2)");
  assert.ok(res.status < 300 || res.status >= 400, `never a 3xx: ${res.status}`);
};

before(() => world());

test("a GET asks, with one button, and changes nothing: link scanners open every URL in an email", async () => {
  const w = world({ name: "Best <Movers> & Sons" });
  const res = await get();
  noStore(res);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-unsubscribe-page"), "ask", "the view it drew, which the edge's probe reads");
  const html = await res.text();
  assert.match(html, /Stop emails from Best &lt;Movers&gt; &amp; Sons\?/, "the name is read and escaped");
  assert.equal((html.match(/<form method="post">/g) ?? []).length, 1);
  assert.match(html, /<input type="hidden" name="unsubscribe" value="yes">/);
  assert.match(html, /<button type="submit">Unsubscribe<\/button>/);
  assert.equal(w.pressed.length, 0);
  assert.ok(!w.db.seen.some((q) => q.rpc), "nothing but the name is asked of the database");
});

test("a link this secret did not make is refused before the database is asked, and said once a minute with a count", async () => {
  const w = world();
  const said = [];
  const was = console.warn;
  const clock = Date.now;
  console.warn = (...a) => said.push(a.map(String).join(" "));
  // Clear of any line an earlier test said: the window is the module's, one minute per event.
  const at = clock() + 10 * 60_000;
  try {
    Date.now = () => at;
    await refusedLinks(w);
    // A minute on, one more: the line counts every refusal since the last one, and says when that was.
    Date.now = () => at + 61_000;
    assert.equal((await get("short")).status, 404);
  } finally {
    Date.now = clock;
    console.warn = was;
  }
  const lines = said.filter((l) => l.startsWith("unsubscribe_bad_link "));
  assert.equal(lines.length, 2, "a scanner's burst is one line, and a minute on another");
  const [first, next] = lines.map((l) => JSON.parse(l.slice("unsubscribe_bad_link ".length)));
  assert.ok(first.refused >= 1, "the first says at once, with whatever it had counted");
  assert.deepEqual(next, { refused: 10, since: new Date(at).toISOString() });
  assert.ok(
    lines.every((l) => !l.includes(TOKEN.slice(0, 20))),
    "never the link",
  );
  assert.equal(w.db.seen.length, 0);
});

async function refusedLinks(w) {
  const bent = `${TOKEN.slice(0, 10)}${TOKEN[10] === "A" ? "B" : "A"}${TOKEN.slice(11)}`;
  for (const t of [bent, "short", `${TOKEN}x`]) {
    const g = await get(t);
    noStore(g);
    assert.equal(g.status, 404);
    assert.equal(g.headers.get("x-unsubscribe-page"), "bad_link");
    assert.match(await g.text(), /This link doesn&#39;t work\./);
    for (const body of ["List-Unsubscribe=One-Click", "unsubscribe=yes"]) {
      const p = await post(body, { token: t });
      noStore(p);
      assert.equal(p.status, 400, body);
    }
  }
  // Nor is its body read: a forged link with a large body costs nothing but the check of its seal.
  let pulled = 0;
  const endless = new ReadableStream({
    pull(c) {
      pulled += 1;
      c.enqueue(new Uint8Array(1024));
    },
  });
  const forged = await route.POST(new Request(url(bent), { method: "POST", body: endless, duplex: "half" }), ctx(bent));
  assert.equal(forged.status, 400);
  assert.ok(pulled <= 1, `the body of a forged link is not read (${pulled} pulls)`);
  assert.equal(w.db.seen.length, 0);
}

test("the one click records the stop in the same response: 200, plain, no page, no redirect", async () => {
  const w = world();
  const res = await post("List-Unsubscribe=One-Click");
  noStore(res);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "Unsubscribed.");
  assert.deepEqual(w.pressed, [
    {
      p_tenant_id: A,
      p_contact_id: P,
      p_state: "opted_out",
      p_source: "unsubscribe",
      p_message_id: M,
      p_evidence: { channel: "email", via: "one_click" },
    },
  ]);
});

test("the one click may come as a multipart form, as RFC 8058 allows", async () => {
  const w = world();
  const form = new FormData();
  form.set("List-Unsubscribe", "One-Click");
  const res = await post(form);
  noStore(res);
  assert.equal(res.status, 200);
  assert.equal(w.pressed.length, 1);
  assert.equal(w.pressed[0].p_evidence.via, "one_click");
});

test("a stop is not lost to a strict parser: no type, plain text, or a trailing line ending each still records it", async () => {
  const w = world();
  for (const [body, type] of [
    ["List-Unsubscribe=One-Click", null],
    ["List-Unsubscribe=One-Click", "text/plain"],
    ["List-Unsubscribe=One-Click\r\n", "application/x-www-form-urlencoded"],
    ["List-Unsubscribe=One-Click&x=1", "application/x-www-form-urlencoded; charset=utf-8"],
  ]) {
    const res = await route.POST(
      new Request(url(), { method: "POST", headers: type ? { "content-type": type } : {}, body }),
      ctx(),
    );
    noStore(res);
    assert.equal(res.status, 200, `${JSON.stringify(body)} as ${type}`);
  }
  assert.equal(w.pressed.length, 4);
});

test("a body past 4 KB is refused whether or not it says how long it is", async () => {
  const w = world();
  const big = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`List-Unsubscribe=One-Click&pad=${"x".repeat(5000)}`));
      c.close();
    },
  });
  const res = await route.POST(new Request(url(), { method: "POST", body: big, duplex: "half" }), ctx());
  noStore(res);
  assert.equal(res.status, 413);
  assert.equal(w.pressed.length, 0);
});

test("the page's button records it too, and says so with the business's name", async () => {
  const w = world();
  const res = await post("unsubscribe=yes");
  noStore(res);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /You&#39;re unsubscribed\./);
  assert.match(html, /Best Movers won&#39;t send you emails like that one again\./);
  assert.doesNotMatch(html, /<form/, "nothing more to press");
  assert.equal(w.pressed[0].p_evidence.via, "page");
  // Pressed again: the door says nothing twice (00174), and the page still says it is done.
  const again = await post("unsubscribe=yes");
  assert.equal(again.status, 200);
  assert.equal(w.pressed.length, 2);
});

test("a POST that is neither the one click nor the button changes nothing", async () => {
  const w = world();
  for (const body of ["", "List-Unsubscribe=Yes", "unsubscribe=no", "something=else"]) {
    const res = await post(body);
    noStore(res);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const huge = await route.POST(
    new Request(url(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "100000" },
      body: "List-Unsubscribe=One-Click",
    }),
    ctx(),
  );
  assert.equal(huge.status, 413);
  assert.equal(w.pressed.length, 0);
});

test("a database that cannot take it is said, never taken for done", async () => {
  world({ fails: true });
  const click = await post("List-Unsubscribe=One-Click");
  noStore(click);
  assert.equal(click.status, 503);
  const press = await post("unsubscribe=yes");
  noStore(press);
  assert.equal(press.status, 503);
  assert.match(await press.text(), /That didn&#39;t go through\./);
});

test("with no secret the door cannot tell a link from a guess, says so without asking anything, and tells the platform once", async () => {
  const w = world();
  const said = [];
  const was = console.error;
  console.error = (...a) => said.push(a.map(String).join(" "));
  delete process.env.UNSUBSCRIBE_SECRET;
  try {
    const g = await get();
    noStore(g);
    assert.equal(g.status, 503);
    assert.match(await g.text(), /That didn&#39;t go through\./);
    const p = await post("List-Unsubscribe=One-Click");
    assert.equal(p.status, 503);
    assert.equal((await get()).status, 503);
    assert.equal(w.db.seen.length, 0);
  } finally {
    console.error = was;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  }
  // The first link fetched this minute says it; a mail client retrying, or a scanner, does not repeat it. The line
  // is once a minute for the whole module, so this must stay the file's first test to find the door unset.
  const lines = said.filter((l) => l.startsWith("unsubscribe_unavailable"));
  assert.equal(lines.length, 1, "one line a minute at most");
  assert.match(lines[0], /"why":"no_secret"/);
  assert.ok(!lines[0].includes(TOKEN), "never the link");
});

test("the page names the address the email came from; a press the database could not take offers Try again", async () => {
  const withSender = fakeDb(
    {
      tenants: [{ id: A, name: "Best Movers" }],
      messages: [
        {
          id: M,
          tenant_id: A,
          channel: "email",
          direction: "outbound",
          meta: { email: { request: { from: '"Sam" <sam@harbor-mail.com>' } } },
        },
      ],
    },
    {},
    {
      set_email_marketing: () => {
        throw new Error("the database is not answering");
      },
    },
  );
  setServiceClient(withSender);
  const asked = await (await get()).text();
  assert.match(asked, /emails like the one from sam@harbor-mail\.com again/);
  const press = await post("unsubscribe=yes");
  assert.equal(press.status, 503);
  const html = await press.text();
  assert.match(html, /<button type="submit">Try again<\/button>/);
  assert.match(html, /Or reply to the email and ask them to stop\./);
});

test("a link names only its own workspace's email: a message of another workspace is never read for its sender", async () => {
  const other = "44444444-4444-4444-8444-444444444444";
  setServiceClient(
    fakeDb({
      tenants: [{ id: A, name: "Best Movers" }],
      // The token names M in workspace A; the only M here belongs to another workspace.
      messages: [
        {
          id: M,
          tenant_id: other,
          channel: "email",
          direction: "outbound",
          meta: { email: { request: { from: "boss@other.example" } } },
        },
      ],
    }),
  );
  const html = await (await get()).text();
  assert.doesNotMatch(html, /other\.example/);
  assert.match(html, /emails like that one again/);
});

test("a rotation breaks no link: one sealed under UNSUBSCRIBE_SECRET_PREVIOUS still asks, and records", async () => {
  const PREVIOUS = "the-secret-before-this-file-rotated";
  const old = signUnsubscribeToken(PREVIOUS, { tenantId: A, contactId: P, messageId: M });
  const { pressed } = world();
  process.env.UNSUBSCRIBE_SECRET_PREVIOUS = PREVIOUS;
  try {
    assert.equal((await get(old)).status, 200, "the page asks");
    assert.equal((await post("List-Unsubscribe=One-Click", { token: old })).status, 200, "and the one click records");
    assert.equal(pressed.length, 1);
  } finally {
    delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
  }
  assert.equal((await get(old)).status, 404, "unset, its links are no longer ours");
  assert.equal((await get(TOKEN)).status, 200, "and the current secret's are");
});

test("a previous secret alone opens nothing: the current one is what the door needs", async () => {
  const PREVIOUS = "the-secret-before-this-file-rotated";
  const old = signUnsubscribeToken(PREVIOUS, { tenantId: A, contactId: P, messageId: M });
  world();
  delete process.env.UNSUBSCRIBE_SECRET;
  process.env.UNSUBSCRIBE_SECRET_PREVIOUS = PREVIOUS;
  const was = console.error;
  console.error = () => {};
  try {
    assert.equal((await get(old)).status, 503);
  } finally {
    console.error = was;
    delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  }
});
