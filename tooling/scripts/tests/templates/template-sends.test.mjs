/**
 * What went out with a message, EXECUTED: the roll-up the Templates page's Sent
 * column reads, and the words it says it in.
 *
 * A broadcast's `recipient_count` is the audience it was scheduled for, and
 * Reports › Campaigns already counts "Messages sent" apart from "Delivered"
 * (campaign_series): a Sent column summed from the audience would contradict the
 * page beside it. So the count is what LEFT -- a person a run marked `sent`, or a
 * template the Inbox sent that WhatsApp took -- and a message nothing has ever
 * sent says so in words, not "0".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { templateSends, templateSentWords } from "@chanlytics/contracts";

const run = (id, template_name) => ({ id, template_name });
const person = (broadcast_id, state, sent_at = null) => ({ broadcast_id, state, sent_at });
const inboxSend = (template_name, created_at, external_id = `wamid.${created_at}`) => ({
  template_name,
  external_id,
  created_at,
});

test("a run counts the people it SENT to, not the audience it was scheduled for: the held, the failed and the still queued are not sends", () => {
  const sends = templateSends({
    runs: [run("b1", "winback_offer")],
    recipients: [
      person("b1", "sent", "2026-09-18T15:00:00Z"),
      person("b1", "sent", "2026-09-18T15:00:05Z"),
      // No yes to offers, asked to stop, no number: held at the wire, and in the audience.
      person("b1", "skipped"),
      person("b1", "failed"),
      person("b1", "queued"),
    ],
    inbox: [],
  });
  assert.deepEqual(sends.winback_offer, { count: 2, lastAt: "2026-09-18T15:00:05Z" });
});

test("every run of a message adds to it -- a person's broadcast and a playbook's run alike, in whichever language it went", () => {
  // Unlike "what sends it", where a playbook's run is the playbook's and is not
  // a second broadcast, here a run is messages that left: all of them count.
  const sends = templateSends({
    runs: [run("b1", "winback_offer"), run("b2", "winback_offer"), run("b3", "quick_note")],
    recipients: [
      person("b1", "sent", "2026-09-01T10:00:00Z"),
      person("b2", "sent", "2026-09-08T10:00:00Z"),
      person("b2", "sent", "2026-09-08T10:00:03Z"),
      person("b3", "sent", "2026-09-10T10:00:00Z"),
    ],
    inbox: [],
  });
  assert.deepEqual(sends.winback_offer, { count: 3, lastAt: "2026-09-08T10:00:03Z" });
  assert.deepEqual(
    sends.quick_note,
    { count: 1, lastAt: "2026-09-10T10:00:00Z" },
    "another message's sends are its own",
  );
});

test("the Inbox's own template sends count -- the ones WhatsApp took, never one it refused or one still waiting to go", () => {
  const sends = templateSends({
    runs: [],
    recipients: [],
    inbox: [
      inboxSend("booking_link", "2026-09-19T09:00:00Z"),
      inboxSend("booking_link", "2026-09-20T08:00:00Z"),
      // Queued in its veto window, canceled, or refused at the wire: no wamid, never left.
      inboxSend("booking_link", "2026-09-20T09:00:00Z", null),
    ],
  });
  assert.deepEqual(sends.booking_link, { count: 2, lastAt: "2026-09-20T08:00:00Z" });
});

test("when it last went out is the latest of either door, compared as instants rather than as text", () => {
  const sends = templateSends({
    runs: [run("b1", "welcome_new")],
    // 11:00:01 in New York is 15:00:01 UTC: the latest of the three, and the first of them as text.
    recipients: [person("b1", "sent", "2026-09-18T15:00:00Z"), person("b1", "sent", "2026-09-18T11:00:01-04:00")],
    inbox: [inboxSend("welcome_new", "2026-09-18T15:00:00.5+00:00")],
  });
  assert.deepEqual(sends.welcome_new, { count: 3, lastAt: "2026-09-18T11:00:01-04:00" });
  // Half a second after 15:00 UTC is later, though as text it sorts BEFORE "15:00:00Z".
  const two = templateSends({
    runs: [run("b1", "welcome_new")],
    recipients: [person("b1", "sent", "2026-09-18T15:00:00Z")],
    inbox: [inboxSend("welcome_new", "2026-09-18T15:00:00.5+00:00")],
  });
  assert.equal(two.welcome_new.lastAt, "2026-09-18T15:00:00.5+00:00");
});

test("a message nothing ever sent is absent, and a send whose run is not on file is nobody's", () => {
  const sends = templateSends({
    runs: [run("b1", "winback_offer")],
    recipients: [person("b9", "sent", "2026-09-18T15:00:00Z")],
    inbox: [inboxSend(null, "2026-09-18T15:00:00Z")],
  });
  assert.deepEqual(sends, {});
});

test("a send whose time was not kept still counts; the latest is read from the ones that have one", () => {
  const sends = templateSends({
    runs: [run("b1", "offer")],
    recipients: [person("b1", "sent"), person("b1", "sent", "2026-09-02T12:00:00Z")],
    inbox: [],
  });
  assert.deepEqual(sends.offer, { count: 2, lastAt: "2026-09-02T12:00:00Z" });
  assert.deepEqual(templateSends({ runs: [run("b1", "offer")], recipients: [person("b1", "sent")], inbox: [] }).offer, {
    count: 1,
    lastAt: null,
  });
});

const NOW = Date.parse("2026-09-20T18:00:00Z");
const TZ = "America/Los_Angeles";
const before = (ms) => new Date(NOW - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

test("the Sent cell says how many, with the thousands marked, and how long ago in the words every page uses", () => {
  assert.deepEqual(templateSentWords({ count: 412, lastAt: before(2 * D) }, TZ, NOW), { count: "412", when: "2d ago" });
  assert.deepEqual(templateSentWords({ count: 1204, lastAt: before(3 * H) }, TZ, NOW), {
    count: "1,204",
    when: "3h ago",
  });
  assert.deepEqual(templateSentWords({ count: 1, lastAt: before(20_000) }, TZ, NOW), { count: "1", when: "just now" });
});

test('past a week it is a date by the business\'s calendar, not a count of days -- "31d ago" is not how anyone says it', () => {
  // 02:00 UTC on Aug 1 is the evening of Jul 31 in Los Angeles.
  assert.deepEqual(templateSentWords({ count: 88, lastAt: "2026-08-01T02:00:00Z" }, TZ, NOW), {
    count: "88",
    when: "Jul 31",
  });
  assert.deepEqual(
    templateSentWords({ count: 5, lastAt: "2025-03-03T20:00:00Z" }, TZ, NOW),
    { count: "5", when: "Mar 3, 2025" },
    "and its year, once it is not this one",
  );
});

test('a message that never went out says so in words, not "0"', () => {
  assert.deepEqual(templateSentWords(undefined, TZ, NOW), { count: null, when: "Never sent" });
  assert.deepEqual(templateSentWords(null, TZ, NOW), { count: null, when: "Never sent" });
  assert.deepEqual(templateSentWords({ count: 0, lastAt: null }, TZ, NOW), { count: null, when: "Never sent" });
});

test("a count whose times were not kept is said without a when, rather than with an invented one", () => {
  assert.deepEqual(templateSentWords({ count: 3, lastAt: null }, TZ, NOW), { count: "3", when: null });
});

/* ------------------ what the page is handed (legacy-bridge) ------------------ */

// The settings surface as it runs in the browser: the workspace on the window,
// whose clock says the dates (legacy-bridge/zone.ts), and a wire that answers
// the reads the surface makes. Tokyo, so a date said by the browser's clock or
// by UTC's comes out a day early.
const WS = "t-salon";
const ZONE = "Asia/Tokyo";
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: {
    pathname: "/w/salon",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  __WORKSPACES: [{ id: WS, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: WS,
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quiet = console.error;
console.error = () => {};
const { settingsOverride } = await import("../../../../apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { clockDate } = await import("@chanlytics/contracts");
console.error = quiet;

const row = (id, name, language = "en_US") => ({
  id,
  channel: "whatsapp",
  name,
  language,
  body_preview: "Hi",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
});
/** The wire, answering the settings surface's reads; `templates` is the ?all=1 answer, or a status to fail with. */
const wire = (templates) => {
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/templates")
      return typeof templates === "number"
        ? json(templates, { ok: false, error: { code: "internal", message: "down" } })
        : json(200, { ok: true, data: templates });
    if (u.pathname === "/api/v1/settings") return json(200, { ok: true, data: { config: { brain: {} }, version: 1 } });
    if (u.pathname === "/api/v1/team") return json(200, { ok: true, data: { members: [], invites: [] } });
    if (u.pathname === "/api/v1/policies") return json(200, { ok: true, data: { policies: [] } });
    if (u.pathname === "/api/v1/channels") return json(200, { ok: true, data: { channels: [] } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};

test("the page is handed the Sent words for every message on file: how many and how long ago by the business's clock, or that it never went out", async () => {
  const now = Date.now();
  const recent = new Date(now - 2 * D).toISOString();
  // Ten days back at 20:00 UTC: already the next morning in Tokyo.
  const old = new Date(now - 10 * D);
  old.setUTCHours(20, 0, 0, 0);
  wire({
    templates: [
      row("t1", "winback_offer"),
      row("t2", "winback_offer", "es_MX"),
      row("t3", "quick_note"),
      row("t4", "autumn_promo"),
    ],
    usedBy: {},
    sends: { winback_offer: { count: 1204, lastAt: recent }, quick_note: { count: 7, lastAt: old.toISOString() } },
  });
  await settingsOverride.apply();
  const sent = globalThis.window.__TEMPLATE_SENT;
  assert.deepEqual(sent.winback_offer, { count: "1,204", when: "2d ago" }, "one entry per message, not per language");
  assert.deepEqual(
    sent.quick_note,
    { count: "7", when: clockDate(old.getTime(), ZONE, now) },
    "past a week, the date on the business's calendar",
  );
  assert.deepEqual(
    sent.autumn_promo,
    { count: null, when: "Never sent" },
    "a message on file that nothing sent says so",
  );
  assert.deepEqual(Object.keys(sent).sort(), ["autumn_promo", "quick_note", "winback_offer"]);
});

test('a template read without the roll-up, or one that failed, is a Sent column that says nothing -- never a column of "Never sent"', async () => {
  wire({ templates: [row("t1", "winback_offer")], usedBy: {} });
  await settingsOverride.apply();
  assert.equal(globalThis.window.__TEMPLATE_SENT, null, "not read is not never sent");
  wire(500);
  await settingsOverride.apply();
  assert.equal(globalThis.window.__TEMPLATE_SENT, null);
});
