/**
 * A website sign-up's confirmation page (apps/dashboard app/c/[token]/route.ts over src/server/public/confirm.ts), run:
 * the real route module, over a database in memory. What is proved: a GET asks and changes nothing (link scanners open
 * every URL in an email), only the page's own button is a press, the press goes through the one yes door with the email
 * the link names and the door's answer is what the page says, a link this secret did not make reads nothing, and nothing
 * ever redirects or is kept by a cache.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { signConfirmToken, signUnsubscribeToken } from "@chanlytics/channels";

const SECRET = "the-confirm-secret-for-this-file";
process.env.UNSUBSCRIBE_SECRET = SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
after(() => {
  delete process.env.UNSUBSCRIBE_SECRET;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/c/[token]/route.ts"));
const { setLinkPageClient } = await import(at("apps/dashboard/src/server/public/link-page.ts"));
after(() => setLinkPageClient(null));

const A = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const M = "11111111-1111-4111-8111-111111111111";
const TOKEN = signConfirmToken(SECRET, { tenantId: A, contactId: P, messageId: M });

const LOGO = `${A}/44444444-4444-4444-8444-444444444444.png`;

/** The confirmation email the link names, the workspace's look, and the yes door answering as `answer` says. */
function world({ answer = { changed: true, found: true }, fails = false, email = true, look = true } = {}) {
  const pressed = [];
  const db = fakeDb(
    {
      tenants: [
        look
          ? { id: A, slug: "harbor", name: "Harbor <Studio>", logo_path: LOGO, accent: "#2a6f97" }
          : { id: A, slug: "harbor", name: "Harbor <Studio>", logo_path: null, accent: null },
      ],
      messages: email
        ? [
            {
              id: M,
              tenant_id: A,
              contact_id: P,
              channel: "email",
              direction: "outbound",
              meta: {
                source: "signup_confirm",
                email: {
                  request: { from: '"Harbor <Studio>" <harbor@mail.example.com>', to: ["ana.ruiz@example.com"] },
                },
              },
            },
          ]
        : [],
    },
    {},
    {
      set_email_offers_yes: (args) => {
        if (fails) throw new Error("the database is not answering");
        pressed.push(args);
        return answer;
      },
    },
  );
  setLinkPageClient(db);
  return { db, pressed };
}

const url = (token = TOKEN) => `https://app.example.com/c/${token}`;
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
const get = (token = TOKEN) => route.GET(new Request(url(token)), ctx(token));
const post = (body = "confirm=yes", token = TOKEN) =>
  route.POST(
    new Request(url(token), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    ctx(token),
  );
const noStore = (res) => {
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.equal(res.headers.get("location"), null, "never a redirect");
};

test("a GET asks who is asking and about which address, with one button, and records nothing", async () => {
  const w = world();
  const res = await get();
  noStore(res);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-confirm-page"), "ask");
  const html = await res.text();
  assert.match(
    html,
    /Get offers and news from Harbor &lt;Studio&gt; by email at a•••@example\.com\?/,
    "read and escaped",
  );
  assert.ok(!html.includes("ana.ruiz@"), "the whole address is never on the page");
  assert.equal((html.match(/<form method="post">/g) ?? []).length, 1);
  assert.match(
    html,
    /<input type="hidden" name="confirm" value="yes"><button type="submit">Yes, send me offers<\/button>/,
  );
  assert.equal(w.pressed.length, 0);
  assert.ok(!w.db.seen.some((q) => q.rpc), "nothing is written by a fetch");
});

test("the page wears the business's look (decision 0075): its logo from our storage and its colour; neither, its name and the product's colour", async () => {
  world();
  const html = await (await get()).text();
  assert.match(
    html,
    new RegExp(
      `<img class="mark" src="http://127\\.0\\.0\\.1:1/[^"]*workspace-logos/${LOGO}" alt="Harbor &lt;Studio&gt;"`,
    ),
  );
  assert.match(html, /--accent:#2a6f97;--on-accent:#fff/);
  assert.ok(!html.includes('<p class="who">'), "the logo stands for the name");
  world({ look: false });
  const plain = await (await get()).text();
  assert.ok(!plain.includes("<img"), "no logo, no picture");
  assert.match(plain, /<p class="who">Harbor &lt;Studio&gt;<\/p>/, "the name stands in");
  assert.ok(!plain.includes("--accent:#"), "the product's own colour");
});

test("the button is the yes: through the one door, with the email the link names, and the page says it is done", async () => {
  const w = world();
  const res = await post();
  noStore(res);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-confirm-page"), "done");
  assert.match(await res.text(), /Harbor &lt;Studio&gt; will send offers and news to a•••@example\.com\./);
  assert.deepEqual(w.pressed, [
    { p_tenant_id: A, p_contact_id: P, p_source: "confirmed_signup", p_message_id: M, p_evidence: { via: "link" } },
  ]);
  // Pressed twice, the door changes nothing the second time, and the page says the same.
  w.pressed.length = 0;
  world({ answer: { changed: false, found: true } });
  assert.equal((await post()).headers.get("x-confirm-page"), "done");
});

test("the door's refusal is the page's answer, and a press it could not record says so", async () => {
  for (const [refused, view, words] of [
    ["expired", "expired", /Sign up again on Harbor &lt;Studio&gt;&#39;s website for a new one\./],
    ["address_changed", "address_changed", /an address Harbor &lt;Studio&gt; no longer has for you/],
    ["stopped", "stopped", /because you asked them to stop/],
    ["not_a_confirmation", "gone", /This link doesn&#39;t open anything\./],
    ["not_sent", "gone", /This link doesn&#39;t open anything\./],
  ]) {
    world({ answer: { changed: false, found: true, refused } });
    const res = await post();
    assert.equal(res.headers.get("x-confirm-page"), view, refused);
    assert.match(await res.text(), words, refused);
  }
  world({ fails: true });
  const res = await post();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("x-confirm-page"), "unavailable");
});

test("only the button presses: an empty body, another field, or a one click is not a yes", async () => {
  const w = world();
  for (const body of ["", "confirm=no", "List-Unsubscribe=One-Click", "unsubscribe=yes"]) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(w.pressed.length, 0);
});

test("a link this secret did not make, or an unsubscribe link, reads nothing and presses nothing", async () => {
  const w = world();
  const bent = `${TOKEN.slice(0, 10)}${TOKEN[10] === "A" ? "B" : "A"}${TOKEN.slice(11)}`;
  const stop = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: M });
  for (const t of [bent, "short", stop]) {
    const g = await get(t);
    noStore(g);
    assert.equal(g.status, 404);
    assert.equal(g.headers.get("x-confirm-page"), "gone");
    assert.equal((await post("confirm=yes", t)).status, 404);
  }
  assert.equal(w.db.seen.length, 0, "the database is never asked");
});

test("an email the workspace does not hold is no question; a page without its secret says it cannot answer", async () => {
  world({ email: false });
  const res = await get();
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("x-confirm-page"), "gone");
  delete process.env.UNSUBSCRIBE_SECRET;
  try {
    const off = await get();
    assert.equal(off.status, 503);
    assert.equal(off.headers.get("x-confirm-page"), "unavailable");
  } finally {
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  }
});
