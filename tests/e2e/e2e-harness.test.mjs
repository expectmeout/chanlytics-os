/**
 * The local harness (tooling/scripts/e2e-harness), without a browser.
 *
 * The harness draws two pages, the kit's gallery and Ask's states, which the kit's specs and the style-equality
 * recorder run in a browser, and answers the `/api/v1` reads a spec makes from a record, which the node suite also
 * draws the app's pages over (e2e-harness-campaigns.test.mjs). The records' other pages were the standalone mockup's,
 * which went with demo mode (15 Nov 2026). What has to hold for a run of it to mean anything, each a test here:
 *
 *   - its `nightly` record is the SEEDED workspace's, derived from tooling/scripts/ops/e2e-workspace.mjs rather than
 *     copied. A copy is right on the day it is written and silently wrong the day the seed changes -- and a harness
 *     that shows a record the nightly does not hold is a harness that passes specs the nightly then fails;
 *   - each page links the app's stylesheets in the app's order and the app's own rules after them, and the harness
 *     serves each stylesheet as the file the app has, at its one path, and nothing else;
 *   - the server answers what a spec actually asks for -- the two Supabase calls `signIn()` makes, and the reads --
 *     and refuses everything else, so nothing on it can look like a write that landed.
 *
 * No browser and no socket: the server's answers come from the functions that compose them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  campaignMessagesOf,
  channelsReady,
  pipelineOf,
  starterByName,
  toPersonRowVM,
  toPersonVM,
  MAX_CLOSURES,
  PROFILE_LIMITS,
} from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";
import { NAME, TIMEZONE, workspaceChannel, workspaceConfig } from "../../tooling/scripts/ops/e2e-workspace.mjs";
import { appStylesheets } from "../../tooling/scripts/e2e-harness/app-styles.mjs";
import { askStatesDocument, behavesDocument, galleryDocument } from "../../tooling/scripts/e2e-harness/kit-gallery.mjs";
import { scenario, SCENARIOS, WORKSPACE } from "../../tooling/scripts/e2e-harness/scenarios.mjs";
import { answer, appRules, pageOf, send, serveSheet } from "../../tooling/scripts/e2e-harness/server.mjs";

const NOW = Date.parse("2026-09-22T09:00:00Z");

test("the nightly record is the seeded workspace's own, derived and not copied", () => {
  const seeded = workspaceConfig();
  const nightly = scenario("nightly", NOW);

  // The WHOLE config the seed writes, notifications and all: what the read hands over is what the row holds.
  assert.deepEqual(nightly.config, seeded, "the harness shows a config the seed does not write");
  assert.equal(nightly.zone, TIMEZONE);
  assert.deepEqual(nightly.known.workspace, { name: NAME, timezone: TIMEZONE });
  // The line the seed provisions, as resolveFacts reads a tenant_channels row.
  const line = workspaceChannel();
  assert.deepEqual(nightly.known.channels, [{ kind: line.kind, number_e164: line.number_e164, status: line.status }]);
  assert.equal(nightly.config.calendar, undefined, "the seeded workspace has no calendar for the hourly sweep");
  // What makes this the record the committed spec must pass on: no profile at all, so every list is empty.
  assert.equal(nightly.config.brain.profile, undefined);
});

test("the salon record reaches the branches the nightly's data cannot: a list at its cap, and one short of it", () => {
  const p = scenario("salon", NOW).config.brain.profile;
  assert.equal(p.closures.length, MAX_CLOSURES, "the closures fold must open with no Add to press");
  assert.equal(p.languages.length, PROFILE_LIMITS.languages - 1, "one Add must fill the languages list");
  assert.equal(new Set(p.languages).size, p.languages.length, "each language once, whatever the cap is");
  assert.ok(p.services.length > 1 && Object.keys(p.hours).length === 7);
  assert.deepEqual(SCENARIOS, ["nightly", "salon", "pipeline", "email-only", "kit", "ask"]);
});

test("the kit record's page is the kit's gallery, Ask's its states, and every other record draws none", () => {
  for (const name of SCENARIOS) {
    const record = scenario(name, NOW);
    const page = pageOf(record);
    const gallery = name === "kit";
    const states = name === "ask";
    assert.equal(record.gallery === true, gallery, `${name}: only the kit record draws the gallery`);
    assert.equal(record.askStates === true, states, `${name}: only the ask record draws Ask's states`);
    if (!gallery && !states) {
      assert.equal(page, null, `${name}: no page, since the standalone mockup went`);
      continue;
    }
    assert.equal(page.includes('class="gx-entry"'), gallery, `${name}: the gallery's entries`);
    assert.equal(page.includes("/_hx/ask-states.js"), states, `${name}: Ask's states, a bundle of their own`);
    assert.ok(page.includes("/_hx/app.css"), `${name}: the app's own rules`);
  }
  // No workspace of its own: the nightly's record, so every read the harness answers is the nightly's.
  const { name: kit, gallery, ...asKit } = scenario("kit", NOW);
  const { name: nightly, ...asNightly } = scenario("nightly", NOW);
  assert.deepEqual([kit, nightly, gallery], ["kit", "nightly", true]);
  assert.deepEqual(asKit, asNightly);
});

test("the email-only record is the nightly's with no WhatsApp number, a mailbox and messages that need no WhatsApp row, derived and not copied", () => {
  const nightly = scenario("nightly", NOW);
  const record = scenario("email-only", NOW);

  // The seeded workspace's own config, clock and name: what the nightly is derived from, not restated. The one thing added
  // is the business's postal address, which every offer's foot names and without which its news cannot go by email.
  const { profile, ...brain } = record.config.brain;
  assert.deepEqual({ ...record.config, brain }, workspaceConfig());
  assert.deepEqual(Object.keys(profile), ["address"]);
  assert.match(profile.address, /Example/, "an address from the block kept for fiction");
  assert.equal(record.zone, TIMEZONE);
  assert.deepEqual(record.known.workspace, { name: NAME, timezone: TIMEZONE });
  // No WhatsApp line: the one channel the seed provisions is the one thing taken away.
  assert.deepEqual(
    nightly.known.channels.map((c) => c.kind),
    ["whatsapp"],
  );
  assert.deepEqual(record.known.channels, []);
  assert.deepEqual(
    record.ready,
    channelsReady({
      whatsapp: null,
      textLine: null,
      email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
    }),
    "a mailbox the campaigns send from, in contracts' own words for the rest",
  );
  assert.equal(record.ready.whatsapp.ready, false);
  assert.equal(record.ready.email.ready, true);
  assert.equal(record.ready.email.offers.ok, true, "and its news by email can go: the address is on file");

  // Two messages, none with a WhatsApp version: the registry's starter as an email and a text, in its category and values,
  // and an offer as an email alone (a text never carries one, and a message written here is always an offer).
  const messages = campaignMessagesOf(record.templates);
  const starter = starterByName("after_visit_check");
  assert.deepEqual(
    messages.map((m) => [m.name, m.versions.whatsapp, m.versions.email !== null, m.versions.sms !== null, m.category]),
    [
      [starter.name, null, true, true, starter.category],
      ["spring_offer", null, true, false, "marketing"],
    ],
  );
  assert.equal(starter.category, "utility", "the starter is the utility one a text may carry");
  assert.ok(
    messages.every((m) => m.offered),
    "each is offered by the channels it holds",
  );
  assert.ok(
    record.templates.every(
      (t) => t.channel !== "whatsapp" && t.meta_status === "approved" && t.source === "chanlytics",
    ),
    "an own version is approved the moment it is written, and ours",
  );
  assert.equal(
    new Set(record.templates.map((t) => t.id)).size,
    record.templates.length,
    "every row has an id of its own",
  );

  // Three people who wrote by email, each with an address and no phone, in people_list's row shape and on one saved list.
  assert.equal(record.people.length, 3);
  const shape = Object.keys(scenario("pipeline", NOW).people[0]).join();
  assert.ok(
    record.people.every((r) => Object.keys(r).join() === shape),
    "the real shape, as the pipeline's rows are",
  );
  assert.ok(
    record.people.every((r) => /^[a-z]+@example[.]com$/.test(r.email) && r.phone_e164 === null),
    "an address from the block kept for fiction, and no phone",
  );
  assert.ok(record.people.every((r) => r.came_from === "email" && r.message_channels.join() === "email"));
  assert.ok(
    record.people.every((r) => r.latest_wa_inbound_at === null),
    "nobody has a WhatsApp window open",
  );
  assert.ok(record.people.every((r) => toPersonRowVM(r, TIMEZONE, new Date(NOW)).calendar === "none"));
  assert.deepEqual(
    record.lists.map((l) => [l.name, l.ids, l.rule, l.archived_at]),
    [["Spring regulars", record.people.map((p) => p.id), null, null]],
  );
});

test("each page carries the app's own rules after the app's stylesheets, the touch floor among them", () => {
  // The app imports bridge/frame.css, which is the stylesheets in their order and then the app's own rules: the 44px
  // floor under a coarse pointer among them. A page here without those rules once measured a Save 26px tall on a touch
  // phone that the app draws at 44.
  const last = appStylesheets().at(-1);
  for (const [name, html] of [
    ["the gallery", galleryDocument()],
    ["the running kit", behavesDocument()],
    ["Ask's states", askStatesDocument()],
  ]) {
    const at = (needle) => html.indexOf(needle);
    assert.ok(at("/_hx/app.css") > 0, `${name}: the app's rules are in the page`);
    assert.ok(
      at("/_hx/app.css") > at(`href="${last}"`),
      `${name}: after the last of the app's stylesheets, as in the app`,
    );
    assert.ok(at("/_hx/app.css") < at("</head>"), name);
  }
  const rules = appRules();
  assert.equal(/@import/.test(rules), false, "and not the stylesheets again: the page already has them");
  assert.ok(rules.trim().length > 0);
});

/** What the harness answers for one path a page names (server.mjs serveSheet), as a status and a body. */
const served = (rel) =>
  new Promise((resolve) => {
    const res = {
      writeHead: (status) => {
        res.status = status;
        return res;
      },
      end: (body) => resolve({ status: res.status, body: String(body) }),
    };
    serveSheet(res, rel);
  });

test("the harness serves each stylesheet the app imports at its one path, as the file the app has there, and nothing else", async () => {
  const sheets = appStylesheets();
  assert.deepEqual(sheets.slice(0, 2), ["styles/tokens.css", "surfaces/kit/kit.css"], "the tokens, then the kit");
  for (const sheet of sheets) {
    const { status, body } = await served(`/${sheet}`);
    assert.equal(status, 200, `${sheet} is served`);
    assert.equal(
      body,
      fs.readFileSync(path.join(ROOT, "apps/dashboard/src", sheet), "utf8"),
      `${sheet}, as the app has it`,
    );
  }
  assert.equal((await served("/surfaces/kit/index.ts")).status, 404, "the kit's stylesheet is served, not its folder");
  assert.equal(
    (await served("/bridge/frame.css")).status,
    404,
    "the app's rules are /_hx/app.css, never the entry itself",
  );
  // A path reaches the harness decoded, so an encoded slash or backslash would climb out of src/: none names a stylesheet
  // of the list, so none reaches a file, on any system.
  for (const climb of [
    "/..%2fsrc%2fbridge%2fframe.css",
    "/..%5csrc%5cbridge%5cframe.css",
    "/..%2f..%2f..%2f..%2fpackage.json",
  ])
    assert.equal((await served(decodeURIComponent(climb))).status, 404, climb);
  // And nothing it answers is kept by a browser: no file it serves carries a version.
  let headers;
  send({ writeHead: (_status, h) => void (headers = h), end: () => {} }, 200, "text/html", "");
  assert.equal(headers["cache-control"], "no-store, must-revalidate");
});

/* ------------------------------- what the server answers ------------------------------- */

test("the server answers the two auth calls signIn() makes, and the settings read from the record", () => {
  const record = scenario("nightly", NOW);
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });

  const link = answer("POST", "/auth/v1/admin/generate_link", new URLSearchParams(), record);
  assert.equal(link.status, 200);
  assert.ok(link.body.hashed_token, "generate_link answers with the token e2e/session.ts exchanges");

  const verified = answer("POST", "/auth/v1/verify", new URLSearchParams(), record);
  assert.equal(verified.status, 200);
  assert.ok(verified.body.access_token && verified.body.refresh_token);
  assert.equal(verified.body.user.email, "e2e-owner@example.com");
  assert.ok(verified.body.expires_at > Math.floor(Date.now() / 1000), "a cookie the browser would keep");

  const settings = answer("GET", "/api/v1/settings", scoped, record);
  assert.equal(settings.status, 200);
  assert.equal(settings.body.ok, true, "the app's own envelope");
  assert.deepEqual(settings.body.data.config, record.config);
  assert.deepEqual([settings.body.data.version, settings.body.data.role], [record.version, "owner"]);

  // A read that does not name its workspace is refused here as getMemberContext refuses it in production.
  assert.equal(answer("GET", "/api/v1/settings", new URLSearchParams(), record).status, 400);
  assert.equal(answer("GET", "/api/v1/nothing-here", scoped, record).status, 404);
  // Anything that is not a JSON route is a page's or a stylesheet's to serve.
  assert.equal(answer("GET", "/", new URLSearchParams(), record), null);
});

test("the server answers the templates read as the route does, from the record's own rows, and the channels it knows", () => {
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });
  const asked = (name, query = {}) =>
    answer("GET", "/api/v1/templates", new URLSearchParams({ workspace: WORKSPACE.id, ...query }), scenario(name, NOW));

  // The composers' read: the rows, the messages made of EVERY row (contracts campaignMessagesOf), and what the list left out.
  const record = scenario("email-only", NOW);
  const read = asked("email-only");
  assert.equal(read.status, 200);
  assert.equal(read.body.ok, true, "the app's own envelope");
  assert.deepEqual(Object.keys(read.body.data), ["templates", "held", "messages", "booking"]);
  assert.deepEqual(
    read.body.data.templates.map((t) => t.id),
    record.templates.map((t) => t.id),
  );
  assert.ok(
    read.body.data.templates.every((t) => t.blocked === null && !("components" in t)),
    "an email's and a text's is judged by no one, and Meta's array stays behind",
  );
  assert.deepEqual(read.body.data.messages, campaignMessagesOf(read.body.data.templates));
  assert.deepEqual(
    read.body.data.messages.map((m) => m.name),
    ["after_visit_check", "spring_offer"],
  );
  assert.deepEqual(read.body.data.held, { pending: 0, rejected: 0, paused: 0, disabled: 0, hidden: 0 });

  // Settings' read, `all`: the same, and what sends each message and how many went out, none on a harness that sends nothing.
  const all = asked("email-only", { all: "1" }).body.data;
  assert.deepEqual(Object.keys(all), ["templates", "held", "messages", "booking", "used_by", "sends"]);
  assert.deepEqual([all.used_by, all.sends], [{}, {}]);
  assert.deepEqual(all.messages, read.body.data.messages);

  // A record with no row answers none, and the salon's booking message is the one WhatsApp row it holds, marked as the Inbox books by it.
  assert.deepEqual(asked("nightly").body.data.messages, []);
  assert.equal(asked("salon", { all: "1" }).body.data.used_by.booking_link.booking, true);

  // The channels: the rows the record knows, and none for a workspace with no line.
  const channels = (name) => answer("GET", "/api/v1/channels", scoped, scenario(name, NOW)).body.data.channels;
  assert.deepEqual(channels("email-only"), []);
  assert.deepEqual(
    channels("nightly").map((c) => [c.kind, c.status]),
    [["whatsapp", "active"]],
  );
  // And a read of either names its workspace, as every read does, and is a read alone.
  for (const path of ["/api/v1/templates", "/api/v1/channels"]) {
    assert.equal(answer("GET", path, new URLSearchParams(), record).status, 400, path);
    assert.equal(answer("POST", path, scoped, record).status, 405, path);
  }
});

test("the harness never writes: every method but a read is refused, whatever it asks for", () => {
  const record = scenario("nightly", NOW);
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/api/v1/settings", "/api/v1/workspaces", "/"]) {
      const refusal = answer(method, route, scoped, record);
      assert.equal(refusal.status, 405, `${method} ${route} was not refused`);
      assert.equal(refusal.body.ok, false);
      assert.match(refusal.body.error.message, /never writes/);
      assert.equal(refusal.body.data, undefined, "nothing that could read as a write that landed");
    }
  }
  // The two auth calls are POSTs, and are not reads.
  assert.equal(answer("GET", "/auth/v1/verify", new URLSearchParams(), record).status, 405);
  assert.equal(answer("HEAD", "/api/v1/settings", scoped, record).status, 200);
});

test("the pipeline record is People as the app is handed them: every group of the Pipeline, and a read of each person", () => {
  const record = scenario("pipeline", NOW);
  assert.deepEqual(
    [record.word, record.hasDeals],
    ["meeting", true],
    "a studio that sends proposals: it calls a booking a meeting, and has deals on file",
  );
  // People's rows through the People surface's own mapping, then the Pipeline's: every group has someone in it.
  const rows = record.people.map((r) => toPersonRowVM(r, TIMEZONE, new Date(NOW)));
  assert.deepEqual(
    pipelineOf(rows, NOW, TIMEZONE, null).groups.map((g) => [g.key, g.count]),
    [
      ["consultations", 2],
      ["proposals", 3],
      ["clients", 2],
      ["closed", 1],
    ],
  );
  // The real shape, not a subset of it: every column on every row, a deal's null where there is none; and under a
  // calendar that reads, everyone's visits -- none is still an answer, never a workspace with no calendar.
  const columns = Object.keys(record.people[0]).join();
  assert.ok(
    record.people.every((r) => Object.keys(r).join() === columns),
    "one shape for every row",
  );
  assert.ok(["message_channels", "came_from", "deal_lost_reason"].every((k) => k in record.people[0]));
  assert.ok(record.people.every((r) => r.visits?.state === "ok"));
  assert.ok(
    rows.every((r) => r.calendar !== "none"),
    "nobody reads as a workspace with no calendar",
  );
  // Ids are the app's own shape: a person's route is a UUID (surface-registry.ts personRouteId); and every number is
  // from the block kept for fiction, 555-0100 to 0199.
  assert.ok(record.people.every((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(r.id)));
  assert.ok(record.people.every((r) => /^\+1\d{3}55501\d{2}$/.test(r.phone_e164)));
  // Each person's page agrees with their row, read through the profile's own mapping: the row's last message is their
  // thread's newest, the page offers the link the list does, and a proposal out says it went out.
  for (const r of record.people) {
    const d = record.details[r.id];
    const newest = d.conversations[0].messages.at(-1);
    assert.deepEqual([r.last_message_at, r.last_message_direction], [newest.created_at, newest.direction]);
    const person = toPersonVM(d, TIMEZONE, new Date(NOW));
    assert.equal(person.bookingLink, record.config.brain.booking_link, r.display_name);
    if (r.deal_stage === "proposed") assert.ok(person.proposal?.sent, `${r.display_name}: the page says it went`);
  }
});

test("the server answers People's reads where the record has people, by the workspace's id or slug, and nowhere else", () => {
  const record = scenario("pipeline", NOW);
  const byId = new URLSearchParams({ workspace: WORKSPACE.id });
  const bySlug = new URLSearchParams({ workspace: WORKSPACE.slug });
  const list = answer("GET", "/api/v1/contacts", byId, record);
  assert.equal(list.status, 200);
  const { people, page, ...rest } = list.body.data;
  assert.equal(people.length, record.people.length);
  assert.equal(page.has_more, false);
  // The route's own envelope (app/api/v1/contacts/route.ts): consult_first a flag, the names left on the server.
  assert.deepEqual(rest, {
    calendar: { state: "ok", source: "your calendar", timezone: TIMEZONE },
    booking_link: record.config.brain.booking_link,
    consult_first: true,
    has_deals: true,
    appointment_word: "meeting",
  });
  // A page's own read names the workspace by the slug in its address, as the app's does.
  assert.equal(answer("GET", "/api/v1/contacts", bySlug, record).status, 200);
  // The next page is empty: the surface reads pages until has_more is false.
  const next = new URLSearchParams({ workspace: WORKSPACE.id, offset: "1000" });
  assert.deepEqual(answer("GET", "/api/v1/contacts", next, record).body.data.people, []);
  assert.deepEqual(answer("GET", "/api/v1/segments", byId, record).body.data, { lists: [] });
  assert.deepEqual(answer("GET", "/api/v1/views", byId, record).body.data, { views: {} });
  // The workspace list says its word, as the app's does; the records that picked none say nothing.
  assert.equal(answer("GET", "/api/v1/workspaces", byId, record).body.data.workspaces[0].appointment_word, "meeting");
  assert.equal(
    "appointment_word" in answer("GET", "/api/v1/workspaces", byId, scenario("salon", NOW)).body.data.workspaces[0],
    false,
  );
  const id = record.people[0].id;
  const person = answer("GET", `/api/v1/contacts/${id}`, byId, record).body.data.person;
  assert.deepEqual([person.row.id, person.appointment_word], [id, "meeting"]);
  assert.equal(answer("GET", "/api/v1/contacts/00000000-0000-4000-8000-000000000000", byId, record).status, 404);
  // A record with no people answers none of them.
  for (const name of ["nightly", "salon"]) {
    assert.equal(answer("GET", "/api/v1/contacts", byId, scenario(name, NOW)).status, 404, name);
  }
  // And no read of them writes.
  assert.equal(answer("PUT", "/api/v1/views/pipeline", byId, record).status, 405);
});

// The People pages read nothing off the window (surfaces/people is TSX that imports its verbs), so there is no list of the
// globals they read for the record to publish or excuse. The fixture that published the rest of the shell's globals for
// the standalone mockup went with it (15 Nov 2026), and so did the tests that ran it over a stub window.
