/**
 * A form a business shares with no website, as a visitor meets it (00680; the Forms plan, F1 and 3.2), run as the app
 * serves it, over a database in memory: the form drawn at its own address, each mistake beside its field and nothing
 * kept, a likely typo offered once and never refused, then ONE write (the person through the one door, the entry and
 * its event), and the thank-you with the chat's press only after it.
 *
 * The plan's "done when" and its tests lead: the entry says which link it came through; the same press sent twice is
 * one entry; a person who asked to be forgotten leaves nothing; a doubtful entry is held, never dropped and never told
 * to the visitor; a test tells nobody; a form published while a visitor has the version before open is taken for a
 * day, and after that their answers are carried over; a database that fails the write is never a thank-you.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, consultForm, FORM, formWorld, LINK, V1 } from "./_form-requests.mjs";
import { formTestPath, requestCodeOf } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setLinkPageClient } = await import(at("apps/dashboard/src/server/public/link-page.ts"));
const { drawFormPage, takeFormPost } = await import(at("apps/dashboard/src/server/public/form-page.ts"));
const { linkGet } = await import(at("apps/dashboard/src/server/public/form-link.ts"));

beforeEach(() => setRateStore(memoryStore()));

const ADDRESS = "https://app.chanlytics.com/b/luma-salon/colour-consultation";
const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0";
const DAY_MS = 86_400_000;

/** Nobody signed in: the session's client answers no user. */
const nobody = async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } });

/** The salon's world (_form-requests.mjs), with the page reading and writing through it. */
function world(options) {
  const made = formWorld(options);
  setLinkPageClient(made.db);
  return made;
}

const get = (query = "", headers = {}) =>
  drawFormPage("luma-salon", "colour-consultation", new Request(`${ADDRESS}${query}`, { headers }), nobody);

/** The values a drawn page carries unseen, read back as a browser would send them. */
const carriedOf = (html) =>
  Object.fromEntries(
    [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1], m[2]]),
  );

/** A send as the page's own form makes it; `t` is when the page says it was drawn (ten seconds ago unless said). */
async function send(answers, { carried = {}, fragment = false, query = "", session = nobody } = {}) {
  const body = new URLSearchParams({ t: String(Date.now() - 10_000), ...carried });
  for (const [name, value] of Object.entries(answers))
    for (const one of Array.isArray(value) ? value : [value]) body.append(name, one);
  return takeFormPost(
    "luma-salon",
    "colour-consultation",
    new Request(`${ADDRESS}${query}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(fragment ? { "x-form": "1" } : {}) },
      body,
    }),
    session,
  );
}

const ANA = {
  "a.f1name": "Ana Ruiz",
  "a.f2mail": "Ana.Ruiz@Example.com",
  "a.f4want": "Dark brown now. I'd love a warm, soft blonde for spring.",
  "a.f5who0": "c1",
};

test("the form is drawn at its own address, in the business's name and the form's language, and works with no script", async () => {
  world();
  const res = await get("?l=k7q2md&utm_source=instagram");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Colour consultation · Luma Salon<\/title>/);
  assert.match(html, /property="og:title" content="Colour consultation · Luma Salon"/);
  for (const label of ["Your name", "Email", "Phone", "What would you like?", "Who would you like?", "Send request"])
    assert.ok(html.includes(label), label);
  assert.match(html, /<form method="post" action="\/b\/luma-salon\/colour-consultation" novalidate/);
  assert.match(html, /Nothing is booked until they confirm a time with you\./);
  const carried = carriedOf(html);
  assert.match(carried.entry_id, /^[0-9a-f-]{36}$/, "the page makes the entry's id as it is drawn");
  assert.equal(carried.version, V1);
  assert.equal(carried.l, "k7q2md");
  assert.equal(carried.utm_source, "instagram");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("a needed answer missing is said beside its field, what was typed is kept on the page, and nothing is written", async () => {
  const { tables, resolved } = world();
  const res = await send({ "a.f1name": "Ana Ruiz", "a.f2mail": "ana@example.com" });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /role="alert">&quot;What would you like\?&quot; needs an answer\.</);
  assert.match(html, /value="Ana Ruiz"/);
  assert.match(
    html,
    /aria-invalid="true"[^>]*data-first|data-first[^>]*aria-invalid="true"|aria-invalid="true"[\s\S]{0,200}data-first/,
  );
  assert.equal(tables.form_entries.length, 0);
  assert.equal(resolved.length, 0, "no person is asked for before the answers hold");
});

test("with neither an address nor a number nobody could answer: it is said by the email's field", async () => {
  const { tables } = world();
  const res = await send({ "a.f1name": "Ana", "a.f4want": "A soft blonde" });
  assert.equal(res.status, 422);
  assert.match(await res.text(), /An email address or a phone number is needed, so they can answer you\./);
  assert.equal(tables.form_entries.length, 0);
});

test("a likely typo in an address is offered once as a fix, and never refused", async () => {
  const { tables } = world();
  const typo = { ...ANA, "a.f2mail": "ana.ruiz@gmial.com" };
  const offered = await send(typo);
  assert.equal(offered.status, 422);
  const html = await offered.text();
  assert.match(html, /Did you mean <button type="submit" class="lnk" name="fix\.f2mail" value="ana\.ruiz@gmail\.com">/);
  assert.equal(tables.form_entries.length, 0, "nothing is kept while the fix is offered");
  const carried = carriedOf(html);
  assert.equal(carried.offered, "f2mail");

  // The same address sent again is theirs to keep: it may be right.
  const kept = await send(typo, { carried });
  assert.equal(kept.status, 200);
  assert.equal(tables.form_entries[0].reach.email, "ana.ruiz@gmial.com");

  // The fix pressed stands in for what was typed.
  const { tables: second } = world();
  const fixed = await send({ ...typo, "fix.f2mail": "ana.ruiz@gmail.com" });
  assert.equal(fixed.status, 200);
  assert.equal(second.form_entries[0].reach.email, "ana.ruiz@gmail.com");
});

test("a request is kept in one write with its person and its event, says which link it came through, and is thanked after", async () => {
  const { tables, resolved } = world();
  const res = await send(ANA, {
    carried: {
      entry_id: "e-ana-1",
      version: V1,
      l: "k7q2md",
      site: "https://l.instagram.com/?u=x",
      utm_campaign: "spring",
    },
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<h1>Thanks, Ana<\/h1>/);
  assert.match(html, /Luma Salon replies by email, to <b>ana\.ruiz@example\.com<\/b>\./);
  const [entry] = tables.form_entries;
  assert.equal(tables.form_entries.length, 1);
  assert.equal(entry.state, "accepted");
  assert.equal(entry.form_id, FORM);
  assert.equal(entry.version_id, V1);
  assert.equal(entry.link_id, LINK, "the entry says which link it came through");
  assert.deepEqual(entry.source, {
    code: "k7q2md",
    page: "/b/luma-salon/colour-consultation",
    site: "l.instagram.com",
    labels: { utm_campaign: "spring" },
  });
  assert.deepEqual(entry.reach, { name: "Ana Ruiz", email: "ana.ruiz@example.com", phone: null });
  assert.deepEqual(entry.answers, {
    f1name: "Ana Ruiz",
    f2mail: "ana.ruiz@example.com",
    f4want: ANA["a.f4want"],
    f5who0: "c1",
  });
  assert.deepEqual(entry.owed, ["note", "notice"]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].p_source, "form");
  assert.equal(entry.contact_id, tables.contacts[0].id, "no accepted entry is without its person");
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.subject_id]),
    [["form_entry.accepted", entry.id]],
  );
  assert.ok(tables.forms[0].last_entry_at, "the form says when it last took a request");

  // The chat's press carries her own words and the request's code: what is answered there is her message.
  const chat = /<a class="go wa" href="([^"]+)"/.exec(html)?.[1].replaceAll("&amp;", "&").replaceAll("&#39;", "'");
  assert.ok(chat?.startsWith("https://wa.me/13055550100?text="), chat);
  const text = decodeURIComponent(chat.split("?text=")[1]);
  assert.match(text, /^Hi Luma Salon, it's Ana Ruiz\. I sent a request: Colour consultation\. "Dark brown now\./);
  assert.equal(requestCodeOf(text), entry.code);
});

test("the same press sent twice is one entry, and is thanked again", async () => {
  const { tables } = world();
  const carried = { entry_id: "e-twice", version: V1 };
  const first = await send(ANA, { carried });
  const second = await send(ANA, { carried });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(tables.form_entries.length, 1);
  assert.equal(tables.events.length, 1, "nobody is told twice");
  assert.match(await second.text(), /Thanks, Ana</);
});

test("a person who asked to be forgotten: nothing is kept at any moment, and the visitor is thanked like anyone", async () => {
  const { tables } = world({ forgotten: "ana.ruiz@example.com" });
  const res = await send(ANA);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Thanks, Ana</);
  assert.equal(tables.form_entries.length, 0);
  assert.equal(tables.contacts.length, 0);
  assert.equal(tables.events.length, 0);
  assert.equal(html.includes("wa.me"), false, "with no entry there is no code to carry into a chat");
});

test("a doubtful entry is held for a look: never dropped, never a person, never the bell, and the visitor is told nothing of it", async () => {
  const { tables, resolved } = world();
  const hidden = await send({ ...ANA, website: "https://spam.example" }, { carried: { entry_id: "e-bot" } });
  assert.equal(hidden.status, 200);
  assert.match(await hidden.text(), /Thanks, Ana</);
  const fast = await send(ANA, { carried: { entry_id: "e-fast", t: String(Date.now()) } });
  assert.equal(fast.status, 200);
  assert.deepEqual(
    tables.form_entries.map((e) => [e.state, e.held_why, e.contact_id]),
    [
      ["held", "hidden_field", null],
      ["held", "too_fast", null],
    ],
  );
  assert.equal(resolved.length, 0);
  assert.equal(tables.events.length, 0);
});

test("the sixth from one sender in ten minutes is held, not refused", async () => {
  const { tables } = world();
  for (let i = 0; i < 6; i++) {
    const res = await send({ ...ANA, "a.f2mail": `ana${i}@example.com` }, { carried: { entry_id: `e-${i}` } });
    assert.equal(res.status, 200, `send ${i}`);
  }
  assert.deepEqual(
    tables.form_entries.map((e) => e.held_why),
    [null, null, null, null, null, "too_many"],
  );
});

/** The salon's owner, signed in: the session's client answers their one membership. */
const member = async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({
          data: [{ tenant_id: A, role: "owner", tenants: { slug: "luma-salon" } }],
          error: null,
        }),
      }),
    }),
  }),
});

test("a test is its owner's alone: it tells nobody and has no person; anyone else's is a real request", async () => {
  const { tables } = world();
  // The address the Share part's Test opens (contracts' formTestPath), on the app's own site.
  const testAddress = `https://app.chanlytics.com${formTestPath("luma-salon", "colour-consultation")}`;
  assert.equal(testAddress, `${ADDRESS}?test=1`);
  const drawn = await drawFormPage("luma-salon", "colour-consultation", new Request(testAddress), member);
  const page = await drawn.text();
  assert.match(page, /<p class="test"><b>A test\.<\/b> It tells nobody and counts nowhere\.<\/p>/);
  assert.match(page, /action="\/b\/luma-salon\/colour-consultation\?test=1"/);
  const res = await send(ANA, { carried: { entry_id: "e-test" }, query: "?test=1", session: member });
  assert.equal(res.status, 200);
  assert.deepEqual(
    tables.form_entries.map((e) => [e.test, e.state, e.contact_id, e.owed]),
    [[true, "processed", null, []]],
  );
  assert.equal(tables.events.length, 0);
  assert.equal(tables.forms[0].last_entry_at, null, "a test does not count as the form's last request");

  // The same address with nobody signed in is a visitor's own request.
  const stranger = await send(ANA, { carried: { entry_id: "e-real" }, query: "?test=1" });
  assert.equal(stranger.status, 200);
  assert.equal(tables.form_entries[1].test, false);
  assert.equal(tables.events.length, 1);
  assert.equal((await get("?test=1").then((r) => r.text())).includes('class="test"'), false);
});

test("another request goes through the same link, and an owner's second test is still a test", async () => {
  const { tables } = world();
  const another = (html) => /<a class="more" href="([^"]+)">/.exec(html)?.[1].replaceAll("&amp;", "&");
  const ago = { t: String(Date.now() - 10_000) };

  // Opened through the link: the press for another request carries its code, and the form it opens carries it on.
  const first = carriedOf(await get("?l=k7q2md").then((r) => r.text()));
  const thanked = await send(ANA, { carried: { ...first, ...ago } }).then((r) => r.text());
  assert.equal(another(thanked), "/b/luma-salon/colour-consultation?again=1&l=k7q2md");
  const second = carriedOf(await get("?again=1&l=k7q2md").then((r) => r.text()));
  assert.equal(second.l, "k7q2md");
  await send({ ...ANA, "a.f2mail": "ana.two@example.com" }, { carried: { ...second, ...ago } });
  assert.deepEqual(
    tables.form_entries.map((e) => e.link_id),
    [LINK, LINK],
    "both requests name the place they came through",
  );

  // Its owner's test: the press keeps the mark, so the next one is a test too.
  const tested = await send(ANA, { carried: { entry_id: "e-test" }, query: "?test=1", session: member });
  assert.equal(another(await tested.text()), "/b/luma-salon/colour-consultation?again=1&test=1");
  const marked = await drawFormPage(
    "luma-salon",
    "colour-consultation",
    new Request(`${ADDRESS}?again=1&test=1`),
    member,
  );
  assert.ok(
    (await marked.text()).includes('<p class="test"><b>A test.</b>'),
    "the form that press opens is still marked a test",
  );

  // Neither: the form's bare address, as before.
  const plain = await send({ ...ANA, "a.f2mail": "ana.three@example.com" }, { carried: { entry_id: "e-plain" } });
  assert.equal(another(await plain.text()), "/b/luma-salon/colour-consultation?again=1");
});

test("the business's own page is linked only where it opens: a record too thin to publish it gets no dead link", async () => {
  // The salon's record names no street and no city, so /b/luma-salon is Not found (contracts' publishesBusinessPage).
  world();
  const thin = await get().then((r) => r.text());
  assert.ok(thin.includes("<footer><span>Luma Salon</span></footer>"), "the form's foot names the business alone");
  assert.equal(thin.includes('href="/b/luma-salon"'), false);
  world({ state: "off" });
  const closedThin = await get().then((r) => r.text());
  assert.ok(
    closedThin.includes('<div class="card"><b>Luma Salon</b><br>Hair colour, cuts and treatments</div>'),
    "the closed page says who they are with no link",
  );
  assert.equal(closedThin.includes('href="/b/luma-salon"'), false);
  // With no page and nothing said of what they do, there is no card: the page has named them already.
  world({ state: "off", more: { business_records: [{ tenant_id: A, trade_name: "Luma Salon", country: "US" }] } });
  assert.equal((await get().then((r) => r.text())).includes('class="card"'), false);

  // A record that says who the business is and where: its page opens, and both link to it.
  const record = {
    tenant_id: A,
    trade_name: "Luma Salon",
    legal_name: "Luma Salon LLC",
    street: "12 Example Street",
    city: "Miami",
    country: "US",
    about: "Hair colour, cuts and treatments",
  };
  world({ more: { business_records: [record] } });
  const linked = await get().then((r) => r.text());
  assert.ok(
    linked.includes('<footer><span>Luma Salon</span><a href="/b/luma-salon">Privacy and terms</a></footer>'),
    "the form's foot links the page that opens",
  );
  world({ state: "off", more: { business_records: [record] } });
  const closedLinked = await get().then((r) => r.text());
  assert.ok(
    closedLinked.includes('<div class="card"><b><a href="/b/luma-salon">Luma Salon</a></b>'),
    "and so does the closed page",
  );
});

test("a form that is off says it is closed, with a way to message the business; a draft's address opens nothing", async () => {
  const { tables } = world({ state: "off" });
  const drawn = await get();
  assert.equal(drawn.status, 200);
  const html = await drawn.text();
  assert.match(html, /<h1>This form is closed<\/h1>/);
  assert.match(html, /Luma Salon isn(&#39;|')t taking requests here at the moment\./);
  assert.match(html, /href="https:\/\/wa\.me\/13055550100"/);
  const sent = await send(ANA);
  assert.match(await sent.text(), /This form is closed/);
  assert.equal(tables.form_entries.length, 0);

  world({ state: "draft" });
  assert.equal((await get()).status, 404);
  assert.equal((await send(ANA)).status, 404);
});

test("published while a visitor has the version before open: taken for a day, then their answers are carried over", async () => {
  const { tables, clock } = world();
  const V2 = "33333333-3333-4333-8333-333333333333";
  const next = consultForm({
    fields: [
      ...consultForm().fields,
      {
        id: "f6test",
        kind: "one",
        label: "Have you had a patch test with us?",
        needed: true,
        choices: [
          { id: "y", label: "Yes" },
          { id: "n", label: "No" },
        ],
      },
    ],
  });
  tables.form_versions[0].replaced_at = new Date(clock.now).toISOString();
  tables.form_versions.push({
    id: V2,
    tenant_id: A,
    form_id: FORM,
    n: 2,
    description: next,
    published_by: null,
    published_at: new Date(clock.now).toISOString(),
    replaced_at: null,
  });
  tables.forms[0].live_version_id = V2;
  tables.forms[0].draft = next;

  // Within the day: read against the version they saw, and kept on it.
  const within = await send(ANA, { carried: { entry_id: "e-old", version: V1 } });
  assert.equal(within.status, 200);
  assert.equal(tables.form_entries[0].version_id, V1);

  // A day on: nothing kept; the live form comes back with what they typed, and only what is new to answer.
  clock.now += DAY_MS + 60_000;
  const late = await send(ANA, { carried: { entry_id: "e-late", version: V1 }, fragment: true });
  assert.equal(late.status, 422);
  const html = await late.text();
  assert.match(html, /Luma Salon updated this form/);
  assert.match(html, /Have you had a patch test with us\?/);
  assert.match(html, /value="Ana Ruiz"/);
  assert.equal(carriedOf(html).version, V2);
  assert.equal(html.includes("<html"), false, "the page's own script is answered the main part alone");
  assert.equal(tables.form_entries.length, 1);
});

test("a database that fails the write is never a thank-you: the page keeps what was typed and says it will send again", async () => {
  const { tables } = world({ failing: true });
  const res = await send(ANA);
  assert.equal(res.status, 503);
  const html = await res.text();
  assert.match(html, /<div class="note unsent" role="alert"><b>Not sent yet: no connection<\/b>/);
  assert.match(html, /value="Ana Ruiz"/);
  assert.equal(html.includes("Thanks"), false);
  assert.equal(tables.form_entries.length, 0);
});

test("a number only: the chat is the one press where the business has it, and a call where it has none", async () => {
  world();
  const dana = { "a.f1name": "Dana", "a.f3phon": "(786) 555-0199", "a.f4want": "Balayage for my wedding in June" };
  const withChat = await (await send(dana)).text();
  assert.match(
    withChat,
    /One more step: send the message that opens in WhatsApp, and Luma Salon will answer you there\./,
  );
  assert.match(withChat, /Or wait for a call on <b>[^<]*786[^<]*<\/b>\. Luma Salon can(&#39;|')t text you first\./);
  const { tables } = world({ chat: false });
  const noChat = await (await send(dana)).text();
  assert.match(noChat, /Luma Salon will call you on <b>/);
  assert.equal(noChat.includes("wa.me"), false);
  assert.equal(tables.form_entries[0].reach.phone, "+17865550199");
});

test("a form in Spanish says everything in Spanish", async () => {
  world({ description: consultForm({ lang: "es", heading: "Consulta de color" }) });
  const drawn = await (await get()).text();
  assert.match(drawn, /<html lang="es">/);
  assert.match(drawn, />Enviar solicitud</);
  const wrong = await (await send({ "a.f1name": "Ana", "a.f2mail": "ana@example.com" })).text();
  assert.match(wrong, /necesita una respuesta\./);
});

test("a link counts its open for the day and goes on to the form with its code; a preview is not an open", async () => {
  const { tables } = world();
  const open = (agent, method = "GET") =>
    linkGet(
      "k7q2md",
      new Request("https://app.chanlytics.com/l/k7q2md?utm_campaign=spring&gclid=abc", {
        method,
        headers: { "user-agent": agent },
      }),
    );
  const landed = await open(BROWSER);
  assert.equal(landed.status, 302);
  assert.equal(landed.headers.get("location"), "/b/luma-salon/colour-consultation?l=k7q2md&utm_campaign=spring");
  assert.equal(landed.headers.get("set-cookie"), null, "an open is a count, never a visitor");
  await open(BROWSER);
  await open("WhatsApp/2.23.20.0 A");
  await open("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)");
  await open("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  await open(BROWSER, "HEAD");
  assert.deepEqual(
    tables.link_days.map((d) => [d.link_id, d.opens]),
    [[LINK, 2]],
  );

  tables.links[0].stopped_at = new Date().toISOString();
  const stopped = await open(BROWSER);
  assert.equal(stopped.headers.get("location"), "/b/luma-salon", "a stopped link lands on the business's own page");
  assert.equal(tables.link_days[0].opens, 2, "and counts nothing");
  assert.equal((await linkGet("zzzzzz", new Request("https://app.chanlytics.com/l/zzzzzz"))).status, 404);
  assert.equal((await linkGet("NOT A CODE", new Request("https://app.chanlytics.com/l/x"))).status, 404);
});
