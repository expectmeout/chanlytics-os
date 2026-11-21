/**
 * AI's one line and who from an ad needs you, on the Ads page once an account is connected (the Ads plan's 4.4 and 6.3;
 * decision 0050, call 12): the read that finds who an ad brought and needs you (packages/db listAdPeopleWaitingOnYou,
 * through the page's reader adsPage) over a database in memory, and the page's model (live/model.ts) on reads as the
 * server answers them.
 *
 * What must hold. Who needs you is judged by the one standing rule the Inbox and Today read (contracts standingOfThread),
 * over each person's latest conversation, as People reads a person: a conversation a member took, one AI answers again,
 * a STOP's hold, an old flagged conversation under a newer one, someone an ad did not bring, and someone being erased are
 * none of them, nor one flagged with no hold open, as Today shows none; a hold that waits stands for its conversation
 * beside a STOP's. A read of them that fails costs the page nothing. The line says how many, names those the read hands
 * it (the longest waits) with how long, and opens the longest wait's conversation. AI's line is rules and no model: on a
 * connected account it has read, with AI running, it offers to keep going an ad made in Meta that ends within three days
 * and brought ten people (in Meta, where it is changed), else, where the card is ready and no ad was made here, the first
 * ad, opening New ad. Otherwise it says nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { listAdPeopleWaitingOnYou } = await import(at("packages/db/src/repositories/people/waiting-on-you.ts"));
const { adsPage } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { liveModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { ADS_MANAGER } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/words.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = Date.parse("2026-11-20T15:00:00Z");
const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const SAID = { timezone: "America/New_York", nowMs: NOW };

/* ------------------------------------------------------------------------- the world the read runs over --- */

const person = (id, over = {}) => ({
  id,
  tenant_id: T,
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  acquired_via: "ad",
  erased_at: null,
  merged_into_contact_id: null,
  erasing_since: null,
  ...over,
});
const thread = (id, contact, over = {}) => ({
  id,
  tenant_id: T,
  contact_id: contact,
  state: "needs_human",
  paused_until: null,
  assignee_user_id: null,
  last_message_at: iso(NOW - H),
  ...over,
});
const hold = (conversation, opened, reason = "human_token") => ({
  id: `e-${conversation}-${reason}`,
  tenant_id: T,
  conversation_id: conversation,
  reason,
  state: "open",
  created_at: iso(opened),
});

/** People an ad brought, and people it did not, each in the standing their conversation puts them in. */
const WORLD = {
  contacts: [
    person("p-long", { display_name: "Jordan Price" }),
    person("p-short", { wa_profile_name: "Amy G" }),
    person("p-phone", { phone_e164: "+13055550142" }),
    person("p-unheld", { display_name: "Unheld Una" }),
    person("p-both", { display_name: "Both Bea" }),
    person("p-taken", { display_name: "Taken Tara" }),
    person("p-answered", { display_name: "Answered Ana" }),
    person("p-stop", { display_name: "Stopped Sam" }),
    person("p-moved", { display_name: "Moved Mo" }),
    person("p-walkin", { display_name: "Walk-in Wren", acquired_via: "whatsapp" }),
    person("p-merged", { display_name: "Merged Max", merged_into_contact_id: "p-long" }),
  ],
  conversations: [
    // A hold that waits on a person, the longest: six days.
    thread("c-long", "p-long", { state: "open" }),
    thread("c-short", "p-short"),
    // Someone named by their number alone.
    thread("c-phone", "p-phone", { state: "open" }),
    // Flagged by its state alone, with no hold open: Today shows no row for it, and nor does this read.
    thread("c-unheld", "p-unheld", { last_message_at: iso(NOW - 3 * H) }),
    // An old STOP's hold left open beside a newer one that waits: the one that waits stands for the conversation.
    thread("c-both", "p-both", { state: "open" }),
    // A member took it: theirs, nobody else's wait.
    thread("c-taken", "p-taken"),
    // AI answers it again.
    thread("c-answered", "p-answered", { state: "open" }),
    // A STOP's hold, left open: it waits on nobody.
    thread("c-stop", "p-stop", { state: "open" }),
    // An old flagged conversation under a newer one AI answers: the person waits on nobody.
    thread("c-moved-old", "p-moved", { last_message_at: iso(NOW - 48 * H) }),
    thread("c-moved-new", "p-moved", { state: "open", last_message_at: iso(NOW - H) }),
    // Waiting, but not from an ad; and one merged away.
    thread("c-walkin", "p-walkin"),
    thread("c-merged", "p-merged"),
  ],
  escalations: [
    hold("c-long", NOW - 6 * 24 * H),
    hold("c-short", NOW - 2 * H),
    hold("c-phone", NOW - 3 * H),
    hold("c-taken", NOW - 5 * H),
    hold("c-stop", NOW - 4 * H, "opt_out"),
    hold("c-moved-old", NOW - 47 * H),
    hold("c-walkin", NOW - 9 * H),
    hold("c-merged", NOW - 7 * H),
    hold("c-both", NOW - 30 * H, "opt_out"),
    hold("c-both", NOW - 90 * 60_000),
  ],
};
WORLD.conversations.find((c) => c.id === "c-taken").assignee_user_id = USER;

test("who an ad brought and needs you is judged by the one standing rule over each person's latest conversation, longest waiting first", async () => {
  const waiting = await listAdPeopleWaitingOnYou(fakeDb(structuredClone(WORLD)), T, NOW);
  assert.deepEqual(
    waiting.map((row) => [row.contact_id, row.conversation_id, row.since]),
    [
      ["p-long", "c-long", iso(NOW - 6 * 24 * H)],
      ["p-phone", "c-phone", iso(NOW - 3 * H)],
      ["p-short", "c-short", iso(NOW - 2 * H)],
      ["p-both", "c-both", iso(NOW - 90 * 60_000)],
    ],
    "never one a member took, one AI answers, a STOP, an old conversation under a newer one, a walk-in, one merged " +
      "away, or one flagged with no hold open",
  );
  assert.deepEqual(
    waiting.map((row) => [row.display_name, row.wa_profile_name, row.phone_e164]),
    [
      ["Jordan Price", null, null],
      [null, null, "+13055550142"],
      [null, "Amy G", null],
      ["Both Bea", null, null],
    ],
  );
  const nobody = { contacts: WORLD.contacts, conversations: [], escalations: [] };
  assert.deepEqual(await listAdPeopleWaitingOnYou(fakeDb(nobody), T, NOW), [], "nobody flagged, nobody read");
});

/* ------------------------------------------------------------------------------------ the page's read --- */

const accountRow = (over = {}) => ({
  id: ACCOUNT,
  tenant_id: T,
  platform: "meta",
  external_id: "1000000000000001",
  name: "Harbor ads",
  currency: "USD",
  timezone: "America/New_York",
  status: "connected",
  standing: { account: "active", funding: "ok" },
  config: { page_id: "100000000000001", page_name: "Harbor Studio", scopes: ["ads_read", "ads_management"] },
  connected_at: "2026-11-18T10:00:00Z",
  disconnected_at: null,
  revoked_at: null,
  read_at: "2026-11-20T14:00:00Z",
  read_error: null,
  ...over,
});
const NO_COUNTS = { from: "2026-10-22", to: "2026-11-20", ads: [], unnamed: { people: 0, booked: 0 }, spend: [] };

/**
 * The page's read as an operator reads it: who needs you is everyone's to see, and an operator's read asks the edge
 * nothing (only the owner may press, which the edge is asked about).
 */
async function pageRead(world, account = accountRow(), faults = {}) {
  readerCache.clear();
  const db = fakeDb(
    {
      ...structuredClone(world),
      memberships: [{ user_id: USER, tenant_id: T, role: "operator", created_at: "2026-01-01T00:00:00Z" }],
      tenant_config: [{ tenant_id: T, version: 1, config: {} }],
      ad_accounts: [account],
      ads: [],
    },
    faults,
    { ads_page_counts: () => NO_COUNTS },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return (await adsPage.read(readerContext(ctx, { tenantId: T, role: "operator" }, new Date(NOW)))).data;
}

test("the page's read names the two longest waits among who an ad brought and needs you, and how many in all; never someone being erased", async () => {
  const read = await pageRead(WORLD);
  assert.equal(read.needs_you.count, 4);
  assert.deepEqual(read.needs_you.people, [
    { id: "p-long", name: "Jordan Price", conversation_id: "c-long", since: iso(NOW - 6 * 24 * H) },
    { id: "p-phone", name: "+1 (305) 555-0142", conversation_id: "c-phone", since: iso(NOW - 3 * H) },
  ]);
  const erasing = structuredClone(WORLD);
  erasing.contacts.find((c) => c.id === "p-long").erasing_since = iso(NOW - H);
  const without = await pageRead(erasing);
  assert.equal(without.needs_you.count, 3, "nobody waits on someone being erased");
  assert.deepEqual(
    without.needs_you.people.map((one) => one.id),
    ["p-phone", "p-short"],
  );
});

test("a read of who needs you that fails costs the page nothing: the ads are there, and the line says nobody", async () => {
  const broken = { "escalations.select": { message: "the holds could not be read" } };
  const read = await pageRead(WORLD, accountRow(), broken);
  assert.equal(read.account.status, "connected", "the page's read stands");
  assert.deepEqual(read.needs_you, { count: 0, people: [] });
  assert.equal(liveModel(read, SAID).needsYou, null);
});

test("the page's read says the account is ready only where every check the card counts passes", async () => {
  assert.equal((await pageRead(WORLD)).account.ready, true);
  const unpaid = accountRow({ standing: { account: "active", funding: "unpaid" } });
  assert.equal((await pageRead(WORLD, unpaid)).account.ready, false, "a payment problem");
  const noPage = accountRow({ config: { page_name: null, scopes: ["ads_read"] } });
  assert.equal((await pageRead(WORLD, noPage)).account.ready, false, "no Page");
  const unknown = accountRow({ standing: {} });
  assert.equal((await pageRead(WORLD, unknown)).account.ready, false, "what Meta has not said yet is not ready");
});

/* -------------------------------------------------------------------------------------- the page's model --- */

const ad = (id, over = {}) => ({
  id,
  name: `Ad ${id}`,
  made_in_platform: true,
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: null,
  budget: null,
  pending: null,
  version: 1,
  resume: { ok: false, why: "not_paused" },
  people: 0,
  booked: 0,
  spend_minor: 0,
  settling: false,
  theirs: { impressions: 0, clicks: 0, results: null },
  ...over,
});
/** The page's read, as the server answers it; `account` names only what differs from a connected, read, ready one. */
const page = ({ account = {}, ...over } = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-20T14:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    ready: true,
    ...account,
  },
  window: { from: "2026-10-22", to: "2026-11-20" },
  today: "2026-11-20",
  ads: [],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
  ...over,
});
/** An ad that ends on a day, at its last moment in New York. */
const endsOn = (day) => `${day}T23:59:00-05:00`;

test("no ads at all, on a ready account: AI proposes the first, opening New ad, and the empty line keeps its own words", () => {
  const vm = liveModel(page(), SAID);
  assert.deepEqual(vm.ai, {
    kind: "first",
    text: "Make your first ad? AI writes it, and nothing runs until you turn it on.",
    route: "campaigns/ads:new",
  });
  assert.equal(vm.empty, "Meta shows no ads in this ad account yet.");
  assert.equal(vm.needsYou, null, "nobody needs you, so no line says so");
});

test("ads made in Meta and none made here: AI proposes the first one here", () => {
  const vm = liveModel(page({ ads: [ad("spring"), ad("old", { state: "paused" })] }), SAID);
  assert.equal(vm.ai.kind, "first");
  assert.equal(vm.ai.text, "Make your first ad here? AI writes it, and nothing runs until you turn it on.");
});

test("AI says nothing of a first ad once one was made here, where the card is not ready, or before the account is read", () => {
  assert.equal(liveModel(page({ ads: [ad("mine", { made_in_platform: false })] }), SAID).ai, null);
  assert.equal(liveModel(page({ account: { ready: false } }), SAID).ai, null, "a card with a check not met");
  assert.equal(liveModel(page({ account: { read_at: null } }), SAID).ai, null, "Meta's first read not in");
});

test("AI says nothing while it is stopped, while signed out, or after a disconnect", () => {
  const soon = ad("spring", { ends_at: endsOn("2026-11-22"), people: 14 });
  for (const over of [
    { stopped_at: "2026-11-20T14:30:00Z" },
    { account: { status: "revoked", revoked_at: "2026-11-19T10:00:00Z" } },
    { account: { status: "disconnected", disconnected_at: "2026-11-19T10:00:00Z" } },
  ]) {
    assert.equal(liveModel(page({ ...over, ads: [soon] }), SAID).ai, null, JSON.stringify(over));
    assert.equal(liveModel(page(over), SAID).ai, null, `${JSON.stringify(over)}, with no ads`);
  }
});

test("ads running: AI offers to keep going an ad made in Meta that ends within three days and brought ten people, in Meta", () => {
  const ads = [
    ad("spring", { name: "Spring offer", ends_at: endsOn("2026-11-23"), people: 12, booked: 4 }),
    ad("later", { name: "Later offer", ends_at: endsOn("2026-11-30"), people: 40 }),
  ];
  const vm = liveModel(page({ ads }), SAID);
  assert.deepEqual(vm.ai, {
    kind: "extend",
    text: "Spring offer brought 12 people and ends Mon 23 Nov. Keep it going in Meta?",
    href: ADS_MANAGER,
  });
  // One made here is kept going from its drawer, which has no press for it yet: AI offers nothing it cannot do.
  assert.equal(liveModel(page({ ads: [{ ...ads[0], made_in_platform: false }] }), SAID).ai, null);
  // Of two that qualify, the one that ends first.
  const two = [...ads, ad("today", { name: "Today offer", ends_at: endsOn("2026-11-20"), people: 10 })];
  assert.match(liveModel(page({ ads: two }), SAID).ai.text, /^Today offer brought 10 people and ends Fri 20 Nov\./);
});

test("ads running with nothing to propose: AI's line is not drawn", () => {
  // Beside an ad made here, so the first ad is not what AI proposes either.
  const mine = ad("mine", { made_in_platform: false, state: "paused" });
  for (const [why, one] of [
    ["ends in four days", ad("a", { ends_at: endsOn("2026-11-24"), people: 30 })],
    ["brought nine people", ad("b", { ends_at: endsOn("2026-11-21"), people: 9 })],
    ["paused", ad("c", { state: "paused", ends_at: endsOn("2026-11-21"), people: 30 })],
    ["a press still on its way", ad("d", { pending: "pausing", ends_at: endsOn("2026-11-21"), people: 30 })],
    ["opens a website", ad("e", { opens: "website", ends_at: endsOn("2026-11-21"), people: 30 })],
    ["no end date", ad("f", { people: 30 })],
    ["ended yesterday", ad("g", { ends_at: endsOn("2026-11-19"), people: 30 })],
  ])
    assert.equal(liveModel(page({ ads: [mine, one] }), SAID).ai, null, why);
});

const waiting = (id, name, since, conversation = `c-${id}`) => ({ id, name, conversation_id: conversation, since });

test("nobody needs you: no amber line", () => {
  assert.equal(liveModel(page({ ads: [ad("spring", { people: 3 })] }), SAID).needsYou, null);
});

test("one person from an ad needs you: the line names them with how long, and opens their conversation", () => {
  const needs_you = { count: 1, people: [waiting("p-1", "Jordan Price", iso(NOW - 6 * 24 * H), "c-77")] };
  assert.deepEqual(liveModel(page({ needs_you }), SAID).needsYou, {
    title: "1 person from your ads needs you.",
    who: "Jordan Price 6d",
    open: "inbox/th-c-77",
  });
});

test("several need you: how many, each the read names with how long, how many more, and the longest wait opens", () => {
  const needs_you = {
    count: 5,
    people: [
      waiting("p-1", "Jordan Price", iso(NOW - 6 * 24 * H), "c-41"),
      waiting("p-2", "Amy Green", iso(NOW - 2 * H)),
    ],
  };
  // The Inbox opens a conversation in its own list, Needs you, with the others beside it, whatever list it last showed.
  assert.deepEqual(liveModel(page({ needs_you }), SAID).needsYou, {
    title: "5 people from your ads need you.",
    who: "Jordan Price 6d · Amy Green 2h · 3 more",
    open: "inbox/th-c-41",
  });
  const two = { count: 2, people: needs_you.people };
  assert.equal(liveModel(page({ needs_you: two }), SAID).needsYou.who, "Jordan Price 6d · Amy Green 2h");
  // A wait with no moment kept names the person alone.
  const unknown = { count: 1, people: [waiting("p-9", "Wren Hale", null)] };
  assert.equal(liveModel(page({ needs_you: unknown }), SAID).needsYou.who, "Wren Hale");
});

test("who needs you is said whatever the account's standing: signed out and after a disconnect, they still wait", () => {
  const needs_you = { count: 1, people: [waiting("p-1", "Jordan Price", iso(NOW - H))] };
  const gone = page({ needs_you, account: { status: "disconnected", disconnected_at: "2026-11-19T10:00:00Z" } });
  assert.equal(liveModel(gone, SAID).needsYou.title, "1 person from your ads needs you.");
});
