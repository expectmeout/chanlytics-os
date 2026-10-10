/**
 * The unsubscribe link of an OFFER to a customer (One message, every channel, step 4; the campaigns-on-every-channel spec,
 * 4.6 and decision 12), run through the real route over a database in memory. One door, two roads (the link's page, and the
 * mail client's one click), both writing through set_email_marketing; and, once offers have stopped, a second, confirmed act
 * that is a STOP for everything. The page speaks to a customer, in the spec's words, and the reach-out's cold email keeps
 * its own (reach-out/unsubscribe-door.test.mjs). An unsubscribe is not a STOP.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { signUnsubscribeToken } from "@chanlytics/channels";
import { STOP_ALL_REFUSALS } from "@chanlytics/contracts";

const SECRET = "the-unsubscribe-secret-for-this-file";
process.env.UNSUBSCRIBE_SECRET = SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
after(() => delete process.env.UNSUBSCRIBE_SECRET);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/u/[token]/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/public/unsubscribe.ts"));
after(() => setServiceClient(null));

const A = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const OFFER = "11111111-1111-4111-8111-111111111111";
const COLD = "44444444-4444-4444-8444-444444444444";
const TOKEN = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: OFFER });
const COLD_TOKEN = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: COLD });
const GONE_TOKEN = signUnsubscribeToken(SECRET, {
  tenantId: A,
  contactId: P,
  messageId: "55555555-5555-4555-8555-555555555555",
});

/** The email an offer left as (a broadcast's row), and a reach-out's: which kind of page a link opens is read from them. */
const OFFER_ES = "66666666-6666-4666-8666-666666666666";
const OFFER_UNSEEN = "77777777-7777-4777-8777-777777777777";
const BROADCAST_ES = "88888888-8888-4888-8888-888888888888";
const TOKEN_ES = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: OFFER_ES });
const TOKEN_UNSEEN = signUnsubscribeToken(SECRET, { tenantId: A, contactId: P, messageId: OFFER_UNSEEN });
const FROM = { request: { from: '"Best Movers" <bestmovers@campaigns.example.com>' } };
/** The broadcasts the offers came from: the language each message was written in is the page's. */
const broadcasts = [{ id: BROADCAST_ES, tenant_id: A, template_language: "es_MX" }];
const messages = [
  {
    id: OFFER,
    tenant_id: A,
    meta: { source: "broadcast", email: { request: { from: '"Best Movers" <bestmovers@campaigns.example.com>' } } },
  },
  // An offer in Spanish names the broadcast it came from; one that names a broadcast nobody can find has no language.
  { id: OFFER_ES, tenant_id: A, meta: { source: "broadcast", broadcast_id: BROADCAST_ES, email: FROM } },
  {
    id: OFFER_UNSEEN,
    tenant_id: A,
    meta: { source: "broadcast", broadcast_id: "99999999-9999-4999-8999-999999999999", email: FROM },
  },
  {
    id: COLD,
    tenant_id: A,
    meta: { source: "reach_out", email: { request: { from: '"Sam" <sam@getharbor.example>' } } },
  },
];

function world({ name = "Best Movers", fails = {}, readFails = false, languageFails = false } = {}) {
  const calls = [];
  const db = fakeDb(
    { tenants: [{ id: A, name }], messages, broadcasts },
    // The email a link came in cannot be read: the database answers the select with an error. So may the broadcast that says its language.
    {
      ...(readFails ? { "messages.select": { message: "the database is not answering" } } : {}),
      ...(languageFails ? { "broadcasts.select": { message: "the database is not answering" } } : {}),
    },
    {
      set_email_marketing: (args) => {
        if (fails.unsubscribe) throw new Error("the database is not answering");
        calls.push(["set_email_marketing", args]);
        return { changed: true, found: true, business: name };
      },
      stop_all_messages: (args) => {
        if (fails.stop) throw new Error("the database is not answering");
        calls.push(["stop_all_messages", args]);
        return { changed: true, found: true, business: name };
      },
    },
  );
  setServiceClient(db);
  return { db, calls };
}

const url = (token) => `https://app.chanlytics.com/u/${token}`;
const ctx = (token) => ({ params: Promise.resolve({ token }) });
const get = (token = TOKEN) => route.GET(new Request(url(token)), ctx(token));
const post = (body, token = TOKEN) =>
  route.POST(
    new Request(url(token), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }),
    ctx(token),
  );
const buttons = (html) =>
  [
    ...html.matchAll(
      /<input type="hidden" name="(\w+)" value="(\w+)"><button type="submit"( class="quiet")?>([^<]+)<\/button>/g,
    ),
  ].map((m) => ({ name: m[1], value: m[2], quiet: !!m[3], label: m[4] }));

test("an offer's link asks a customer, in their words, with one button, and changes nothing until it is pressed", async () => {
  const w = world();
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-unsubscribe-page"), "ask", "the view it drew: the edge's probe reads it");
  const html = await res.text();
  assert.match(html, /Stop offers from Best Movers\?/);
  assert.match(
    html,
    /won&#39;t send you offers by email again\. You&#39;ll still get messages about your appointments\./,
  );
  assert.deepEqual(buttons(html), [
    { name: "unsubscribe", value: "yes", quiet: false, label: "Unsubscribe from offers" },
  ]);
  assert.deepEqual(w.calls, [], "a scanner that opens every link stops nobody");
});

test("pressing it records the unsubscribe through the one door and says the spec's sentence, with a quiet second act for someone who means everything", async () => {
  const w = world({ name: "Best <Movers> & Sons" });
  const res = await post("unsubscribe=yes");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null, "never a redirect (RFC 8058 §3.2)");
  assert.equal(res.headers.get("x-unsubscribe-page"), "done");
  const html = await res.text();
  assert.match(html, /You&#39;re unsubscribed from offers from Best &lt;Movers&gt; &amp; Sons\./);
  assert.match(html, /<p>You&#39;ll still get messages about your appointments\.<\/p>/);
  assert.deepEqual(buttons(html), [{ name: "stop_all", value: "ask", quiet: true, label: "Stop all messages" }]);
  assert.deepEqual(w.calls, [
    [
      "set_email_marketing",
      {
        p_tenant_id: A,
        p_contact_id: P,
        p_state: "opted_out",
        p_source: "unsubscribe",
        p_message_id: OFFER,
        p_evidence: { channel: "email", via: "page" },
      },
    ],
  ]);
});

test("the mail client's one click is the same door, answered in one line, and a failed write is not recorded and says so", async () => {
  const w = world();
  const res = await post("List-Unsubscribe=One-Click");
  assert.deepEqual([res.status, await res.text()], [200, "Unsubscribed."]);
  assert.deepEqual(
    w.calls.map((c) => [c[0], c[1].p_evidence]),
    [["set_email_marketing", { channel: "email", via: "one_click" }]],
  );
  const down = world({ fails: { unsubscribe: true } });
  const refused = await post("List-Unsubscribe=One-Click");
  assert.deepEqual([refused.status, await refused.text()], [503, "Not recorded. Try again in a minute."]);
  const page = await post("unsubscribe=yes");
  assert.equal(page.status, 503);
  assert.equal(page.headers.get("x-unsubscribe-page"), "unavailable");
  assert.deepEqual(buttons(await page.text()), [
    { name: "unsubscribe", value: "yes", quiet: false, label: "Try again" },
  ]);
  assert.deepEqual(down.calls, []);
});

test("Stop all messages is asked first, and only the confirmed press stops everything: asking writes nothing", async () => {
  const w = world();
  const ask = await post("stop_all=ask");
  assert.equal(ask.status, 200);
  assert.equal(ask.headers.get("x-unsubscribe-page"), "stop_ask");
  const html = await ask.text();
  assert.match(html, /Stop every message from Best Movers\?/);
  assert.match(html, /reminders and confirmations about your appointments/);
  assert.deepEqual(buttons(html), [{ name: "stop_all", value: "yes", quiet: false, label: "Yes, stop all messages" }]);
  assert.deepEqual(w.calls, [], "the question changed nothing");
  const stopped = await post("stop_all=yes");
  assert.equal(stopped.status, 200);
  assert.equal(stopped.headers.get("x-unsubscribe-page"), "stopped");
  const done = await stopped.text();
  assert.match(done, /You won&#39;t get any more messages from Best Movers\./);
  assert.deepEqual(buttons(done), []);
  assert.deepEqual(w.calls, [["stop_all_messages", { p_tenant_id: A, p_contact_id: P, p_message_id: OFFER }]]);
});

test("a stop that did not go through says so and records nothing; the second act is an offer's alone, and a field no page draws is no press", async () => {
  const down = world({ fails: { stop: true } });
  const failed = await post("stop_all=yes");
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("x-unsubscribe-page"), "unavailable");
  assert.deepEqual(down.calls, []);
  // A reach-out's cold email speaks to a business, which has no visit messages to stop: the page never draws it, and the door refuses it.
  const cold = world();
  for (const field of ["stop_all=ask", "stop_all=yes"]) {
    const res = await post(field, COLD_TOKEN);
    assert.equal(res.status, 400, field);
    assert.equal(await res.text(), STOP_ALL_REFUSALS.not_an_offer, "the refusal says why, in the contracts' words");
  }
  assert.deepEqual(cold.calls, []);
  // An email that cannot be read (its row is gone, or the read failed) is not known to be either kind: refused in words that
  // say so and that it can be tried again, with nothing changed, and never answered as a reach-out's. A read that failed
  // is said in the log, by name.
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(JSON.parse(args[0]));
  try {
    const gone = world();
    const gonePress = await post("stop_all=yes", GONE_TOKEN);
    assert.equal(gonePress.status, 503);
    assert.equal(await gonePress.text(), STOP_ALL_REFUSALS.unread);
    assert.deepEqual(gone.calls, []);
    const unreadable = world({ readFails: true });
    for (const field of ["stop_all=ask", "stop_all=yes"]) {
      const res = await post(field);
      assert.equal(res.status, 503, field);
      assert.equal(await res.text(), STOP_ALL_REFUSALS.unread, field);
    }
    assert.deepEqual(unreadable.calls, [], "nothing was stopped");
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(
    said.map((l) => [l.event, l.tenant_id, l.message]),
    [
      ["unsubscribe_lane_unread", A, OFFER],
      ["unsubscribe_lane_unread", A, OFFER],
    ],
    "the two reads that failed are said, by name; a row that is simply gone is no failure",
  );
  // Anything else in the body presses nothing.
  assert.equal((await post("stop_all=now")).status, 400);
  assert.equal((await post("hello=yes")).status, 400);
});

test("a link whose email cannot be read is neither kind's page: words true of both, no second act; a reach-out's own link keeps its words", async () => {
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(JSON.parse(args[0]));
  try {
    // Its row is gone, and its read failed: the same neutral page, asked or pressed.
    for (const readFails of [false, true]) {
      const w = world({ readFails });
      const asked = await get(GONE_TOKEN);
      assert.equal(asked.status, 200);
      // To the edge it is an "ask" (its probe's link names no email and draws these words): the view, not the words.
      assert.equal(asked.headers.get("x-unsubscribe-page"), "ask");
      const html = await asked.text();
      assert.match(html, /Stop these emails\?/);
      assert.match(
        html,
        /won&#39;t send you emails like this one again\. If you write to them, they can still answer you\./,
      );
      assert.deepEqual(
        buttons(html),
        [{ name: "unsubscribe", value: "yes", quiet: false, label: "Unsubscribe" }],
        "one press, no second act it cannot vouch for",
      );
      const pressed = await post("unsubscribe=yes", GONE_TOKEN);
      assert.equal(pressed.status, 200);
      assert.equal(pressed.headers.get("x-unsubscribe-page"), "done");
      const done = await pressed.text();
      assert.match(done, /You&#39;re unsubscribed from these emails\./);
      assert.match(done, /Best Movers won&#39;t send you emails like this one again\./);
      assert.deepEqual(buttons(done), [], "and no second act");
      assert.equal(w.calls.length, 1, "the unsubscribe itself was recorded");
    }
  } finally {
    console.warn = warn;
  }
  assert.ok(
    said.some((l) => l.event === "unsubscribe_lane_unread"),
    "the failed read is said",
  );
  // A reach-out's own link, whose email reads, keeps the cold email's words and offers no second act.
  const w = world();
  const cold = await get(COLD_TOKEN);
  assert.match(await cold.text(), /Stop emails from Best Movers\?/);
  const pressed = await post("unsubscribe=yes", COLD_TOKEN);
  const coldHtml = await pressed.text();
  assert.match(
    coldHtml,
    /You&#39;re unsubscribed from emails from sam@getharbor\.example\./,
    "the cold page still names the address it came from",
  );
  assert.deepEqual(buttons(coldHtml), [], "and offers no second act");
  assert.equal(w.calls.length, 1);
});

test("an offer sent in Spanish opens a Spanish page, its press and its second act in Spanish too, with the same acts behind the words", async () => {
  const w = world();
  const asked = await get(TOKEN_ES);
  assert.equal(asked.status, 200);
  assert.equal(
    asked.headers.get("x-unsubscribe-page"),
    "ask",
    "the view the edge's probe reads does not move with the words",
  );
  const html = await asked.text();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /¿Dejar de recibir ofertas de Best Movers\?/);
  assert.match(html, /Seguirás recibiendo mensajes sobre tus citas\./);
  assert.deepEqual(buttons(html), [
    { name: "unsubscribe", value: "yes", quiet: false, label: "Darme de baja de las ofertas" },
  ]);
  assert.deepEqual(w.calls, [], "asking still changes nothing");
  const done = await post("unsubscribe=yes", TOKEN_ES);
  assert.equal(done.headers.get("x-unsubscribe-page"), "done");
  const doneHtml = await done.text();
  assert.match(doneHtml, /Te diste de baja de las ofertas de Best Movers\./);
  assert.deepEqual(buttons(doneHtml), [
    { name: "stop_all", value: "ask", quiet: true, label: "Dejar de recibir todos los mensajes" },
  ]);
  const confirm = await post("stop_all=ask", TOKEN_ES);
  assert.equal(confirm.headers.get("x-unsubscribe-page"), "stop_ask");
  assert.match(await confirm.text(), /¿Dejar de recibir todos los mensajes de Best Movers\?/);
  const stopped = await post("stop_all=yes", TOKEN_ES);
  assert.equal(stopped.headers.get("x-unsubscribe-page"), "stopped");
  const stoppedHtml = await stopped.text();
  assert.match(stoppedHtml, /<html lang="es">/);
  assert.match(stoppedHtml, /No recibirás más mensajes de Best Movers\./);
  assert.deepEqual(
    w.calls.map((c) => c[0]),
    ["set_email_marketing", "stop_all_messages"],
    "the same two writes as the English page's, and the one click is still one line",
  );
  // The mail client's one click is a plain line whatever the language.
  assert.deepEqual(
    await (async () => {
      const r = await post("List-Unsubscribe=One-Click", TOKEN_ES);
      return [r.status, await r.text()];
    })(),
    [200, "Unsubscribed."],
  );
  // An English offer is as it was, and says so in its markup.
  const english = await (await get()).text();
  assert.match(english, /<html lang="en">/);
});

test("an offer whose language cannot be found speaks English, and a read that failed is said in the log: the press still works", async () => {
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(JSON.parse(args[0]));
  try {
    // Its broadcast is not there: no language kept, so English, and nothing to say about it.
    world();
    const unseen = await (await get(TOKEN_UNSEEN)).text();
    assert.match(unseen, /<html lang="en">/);
    assert.match(unseen, /Stop offers from Best Movers\?/);
    assert.deepEqual(said, []);
    // Its broadcast cannot be read: English, the offer's page and its second act all the same, and the log says which read.
    world({ languageFails: true });
    const down = await get(TOKEN_ES);
    assert.equal(down.status, 200);
    assert.equal(down.headers.get("x-unsubscribe-page"), "ask");
    const html = await down.text();
    assert.match(html, /Stop offers from Best Movers\?/);
    assert.deepEqual(buttons(html), [
      { name: "unsubscribe", value: "yes", quiet: false, label: "Unsubscribe from offers" },
    ]);
    const pressed = await post("unsubscribe=yes", TOKEN_ES);
    assert.match(await pressed.text(), /You&#39;re unsubscribed from offers from Best Movers\./);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(
    said.map((l) => [l.event, l.tenant_id, l.message]),
    [
      ["unsubscribe_language_unread", A, OFFER_ES],
      ["unsubscribe_language_unread", A, OFFER_ES],
    ],
    "the two reads that failed are said, by name, and the page was still the offer's",
  );
});
