/**
 * The activity log: both ledgers in an owner's words, filtered by person,
 * kind and day. The words are executed per kind; the route is run over a
 * database in memory -- owners only, the noise families hidden unless named,
 * a person's rows including their threads' and calls', a day by the
 * workspace's clock, the page cut after the merge, the actors named.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  activityWords,
  activityTone,
  isActivityNoise,
  ACTIVITY_KINDS,
  DECISION_VERBS,
  DECISION_SUBJECTS,
  EVENT_KINDS,
  TONES,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/activity/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

test("the words: a sentence per kind, the one or two fields a reader wants, nothing else of the payload", () => {
  assert.equal(
    activityWords("consent_change", { consent: "opted_in", source: "in_person", note: "SECRET", previous: "unknown" }),
    "Recorded a consent answer · yes to messages about their visit · in person",
  );
  assert.equal(
    activityWords("contact.consent_changed", {
      purpose: "marketing",
      consent: "opted_out",
      source: "customer_message",
      words: "STOP",
    }),
    "A consent answer changed · no to offers · customer message",
  );
  // An unsubscribe (00174) is no to marketing email, never to messages about their visit.
  assert.equal(
    activityWords("contact.consent_changed", {
      purpose: "email_marketing",
      consent: "opted_out",
      source: "unsubscribe",
      via: "one_click",
      message_id: "11111111-1111-4111-8111-111111111111",
    }),
    "A consent answer changed · no to marketing email · unsubscribe",
  );
  // A sending domain (00175): the host, and why when it was held, in the words Connections says.
  assert.equal(
    activityWords("sending_domain.held", { host: "getharbor.com", why: "dmarc" }),
    "A domain to send from was held · getharbor.com · its DMARC record is missing",
  );
  assert.equal(
    activityWords("sending_domain.added", { host: "getharbor.com", provider_domain_id: "pd-1" }),
    "A domain to send from was added · getharbor.com",
    "the host, never the provider's id",
  );
  assert.equal(activityWords("export", { what: "workspace" }), "Exported data · everything");
  assert.equal(activityWords("export", { what: "people", rows: 312 }), "Exported data · everyone as a CSV · 312 rows");
  assert.equal(activityWords("export", { what: "conversation", messages: 40 }), "Exported data · a conversation");
  assert.equal(
    activityWords("pause_agent", { receptionist_mode: "never", batch: 12 }),
    "Paused the receptionist · never · one of 12",
  );
  assert.equal(activityWords("end_call", {}), "Ended a call");
  assert.equal(
    activityWords("take_over", { how: "transfer", line: "+13055550199" }),
    "Took over a call · passed to the business's line",
    "the Inbox's verb on a call, and never the number",
  );
  assert.equal(activityWords("take_over", { paused_until: "2026-09-14T15:00:00Z" }), "Took over a thread");
  assert.equal(
    activityWords("resume_agent", { receptionist_mode: "inherit" }),
    "Resumed the receptionist · follows the workspace",
  );
  assert.equal(
    activityWords("send_broadcast", { name: "Spring offer", recipients: 40, approved: true }),
    "Sent a broadcast · Spring offer · 40 people · approved by hand",
  );
  assert.equal(activityWords("broadcast.sent", { sent: 38, held: 2 }), "A broadcast finished · 38 got it · 2 held");
  assert.equal(
    activityWords("settings.changed", { fields: ["hours", "closures", "calendar", "notifications", "extra"] }),
    "Settings changed · hours, closures, calendar, notifications",
  );
  assert.equal(
    activityWords("line.texting_rejected", {
      error: "provided Opt-in information (30896 · MESSAGE_FLOW)",
      e164: "+19296566623",
    }),
    "The carriers sent the registration back · provided Opt-in information (30896 · MESSAGE_FLOW)",
  );
  assert.equal(
    activityWords("lead.round", { search_id: "s1", seq: 1, state: "queued", purpose: "probe", target: 12, by: "u1" }),
    "A search for businesses · started",
  );
  assert.equal(
    activityWords("lead.round", { state: "waiting_on_owner" }),
    "A search for businesses · waiting on your answer",
  );
  assert.equal(activityWords("lead.round", { state: "checking" }), "A search for businesses · checking");
  assert.equal(
    activityWords("lead.round", { state: "ended", ending: "target_reached", counted: 12, cost_usd: 0.42 }),
    "A search for businesses · finished · Found what you asked for · 12 found",
    "the ending says itself in the words the rest of the product uses, and what it cost stays out of the log",
  );
  assert.equal(
    activityWords("lead.round", { state: "ended", ending: "not_an_ending" }),
    "A search for businesses · finished",
    "and an ending nothing names says nothing",
  );
  assert.equal(
    activityWords("lead.no_card", { card: "trade_shows", asked: "trade shows in Texas", by: "u1" }),
    "An ask no source covers yet · trade shows · trade shows in Texas",
    "the demand is the words, never a place",
  );
  assert.equal(
    activityWords("channel.message_template_status_update", { waba_id: "1" }),
    "Channel · message template status update",
    "a computed kind reads as words, not as a key",
  );
  assert.equal(activityWords("something.new", null), "Something · new");
  assert.equal(activityWords("message.received", "not an object"), "A customer wrote");
  for (const k of [...DECISION_VERBS, ...EVENT_KINDS])
    assert.ok(!/[_.]/.test(activityWords(k, {}).split(" · ")[0]), `${k}: the sentence is words, not the key`);
  assert.equal(isActivityNoise("usage.ask_tokens"), true);
  assert.equal(isActivityNoise("webhook.auth"), true);
  assert.equal(isActivityNoise("message.received"), false);
  assert.equal(activityWords("escalation.changed", { from: "rate_cap", to: "budget" }), "A handover's reason changed");
  assert.equal(
    isActivityNoise("escalation.changed"),
    true,
    "a record Reports reads, not something that happened to the owner: hidden unless asked for by name",
  );
  assert.equal(
    isActivityNoise("escalation.reopened"),
    false,
    "the kind is hidden, not its family: a later owner-facing escalation kind is shown",
  );
  assert.equal(isActivityNoise("escalation.changed_by_hand"), false, "nor a kind that merely begins with its words");
  assert.equal(
    activityWords("lead.set_aside", { stage: "archived", reason: "stale", from: "ready" }),
    "A lead was set aside",
  );
  assert.equal(isActivityNoise("lead.set_aside"), true, "a record Reports reads: hidden unless asked for by name");
  assert.equal(isActivityNoise("lead.stage"), false, "a member's own move still shows");
  assert.equal(isActivityNoise("lead.converted"), false);
  assert.equal(activityWords("call.transferred", { answered: true }), "A call was passed to a person");
  assert.equal(isActivityNoise("call.transferred"), true);
  assert.equal(activityWords("booking_link.sent", { channel: "whatsapp", sender: "ai" }), "The booking link was sent");
  assert.equal(isActivityNoise("booking_link.sent"), true);
  assert.equal(
    activityWords("channel.quality_rating", { from: "GREEN", to: "YELLOW" }),
    "A WhatsApp number's quality rating changed",
  );
  assert.equal(
    isActivityNoise("channel.quality_rating"),
    true,
    "a record Reports reads: hidden unless asked for by name",
  );
  assert.equal(isActivityNoise("channel.connected"), false, "Meta's own account news and a connection still show");
  assert.equal(
    isActivityNoise("channel.phone_number_quality_update"),
    false,
    "the kind is hidden, not the family: Meta's own news of a flagged number still shows",
  );
  assert.equal(isActivityNoise("message.sent"), false, "the message's own line still shows");
  assert.equal(
    isActivityNoise("call.recorded"),
    false,
    "the kind is hidden, not the family: a call's record still shows",
  );
  assert.deepEqual(ACTIVITY_KINDS.slice(0, 3), ["approve", "edit", "decline"]);
  assert.ok(
    DECISION_VERBS.includes("export") && DECISION_SUBJECTS.includes("workspace"),
    "the ledger names an export of the workspace",
  );
});

// 49: the two kinds of a gate pausing and the back office resuming a workspace's offers by email (00299) are toned.
// 50: a run that stopped (broadcast.stopped) is danger, as a line that failed is.
const TONED_KINDS = 50;
test("the tone: said only where the product knows one, and never for a kind that does not exist", () => {
  // A log where every line is the same grey is read rather than scanned, and
  // the line an owner opens it to find is the one that went wrong.
  assert.equal(activityTone("line.failed"), "danger");
  assert.equal(activityTone("message.send_failed"), "danger");
  assert.equal(activityTone("line.texting_rejected"), "danger");
  assert.equal(activityTone("line.texting_approved"), "ok");
  assert.equal(activityTone("approve"), "ok");
  assert.equal(activityTone("pause_agent"), "warn");
  assert.equal(activityTone("message.received"), "info");
  assert.equal(
    activityTone("settings.changed"),
    "plain",
    "a kind whose reading is not in doubt either way stays quiet",
  );
  assert.equal(activityTone("something.new"), "plain", "and a kind nothing names is never coloured by guesswork");

  // Names, not spellings: a rule that read words out of kinds would find a
  // failure in "message.send_raced_cancel" and none in "line.texting_on".
  assert.equal(activityTone("message.send_raced_cancel"), "warn");
  assert.equal(activityTone("line.texting_on"), "info");
  // A gate paused the workspace's offers by email, and the back office turned them back on (00299): said in the owner's words.
  assert.equal(activityTone("mailbox.offers_paused"), "warn");
  assert.equal(activityTone("mailbox.offers_resumed"), "ok");
  assert.equal(
    activityWords("mailbox.offers_paused", { reason: "complaints" }),
    "Offers by email were paused · too many offers were marked as spam",
  );
  assert.equal(
    activityWords("mailbox.offers_paused", { reason: "bounces" }),
    "Offers by email were paused · too many offers bounced",
  );
  assert.equal(activityWords("mailbox.offers_resumed", { reason: "bounces" }), "Offers by email were turned back on");

  // A key in the map that is not a kind either ledger holds tones nothing, and
  // the only symptom is a row that stays grey for ever. The count is the guard:
  // it moves only when the map is deliberately changed.
  const toned = [...DECISION_VERBS, ...EVENT_KINDS].filter((k) => activityTone(k) !== "plain");
  assert.equal(toned.length, TONED_KINDS, "every key in the tone map is a kind a ledger can hold");
  for (const k of ACTIVITY_KINDS) assert.ok(TONES.includes(activityTone(k)), `${k}: one of the product's six tones`);
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const K1 = "33333333-3333-4333-8333-333333333333";
const USER = "u1";
const membership = (tenant_id, role, slug) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at: "2026-01-01T00:00:00Z",
});
const get = (q = "") => new Request(`http://localhost/api/v1/x?workspace=${A}${q}`);
const ctxFor = (tables, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const tables = (role = "owner") => ({
  memberships: [membership(A, role, "harbor")],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  conversations: [{ id: C1, tenant_id: A, contact_id: P1 }],
  calls: [{ id: K1, tenant_id: A, contact_id: P1 }],
  decisions: [
    {
      id: "d1",
      tenant_id: A,
      verb: "consent_change",
      subject_type: "contact",
      subject_id: P1,
      actor_type: "user",
      actor_user_id: "u-ada",
      payload: { consent: "opted_in", source: "form" },
      created_at: "2026-09-11T14:00:00Z",
    },
    {
      id: "d2",
      tenant_id: A,
      verb: "take_over",
      subject_type: "conversation",
      subject_id: C1,
      actor_type: "user",
      actor_user_id: "u-bo",
      payload: {},
      created_at: "2026-09-11T15:00:00Z",
    },
    {
      id: "d3",
      tenant_id: A,
      verb: "export",
      subject_type: "workspace",
      subject_id: A,
      actor_type: "user",
      actor_user_id: "u-ada",
      payload: { what: "people", rows: 5 },
      created_at: "2026-09-12T02:30:00Z",
    }, // 22:30 on the 11th, New York
    {
      id: "d4",
      tenant_id: B,
      verb: "export",
      subject_type: "workspace",
      subject_id: B,
      actor_type: "user",
      actor_user_id: "u-x",
      payload: {},
      created_at: "2026-09-11T16:00:00Z",
    },
  ],
  events: [
    {
      id: "e1",
      tenant_id: A,
      kind: "message.received",
      subject_type: "message",
      subject_id: "m1",
      data: {},
      created_at: "2026-09-11T14:30:00Z",
    },
    {
      id: "e2",
      tenant_id: A,
      kind: "usage.ask_tokens",
      subject_type: "user",
      subject_id: USER,
      data: { tokens: 400 },
      created_at: "2026-09-11T14:45:00Z",
    },
    {
      id: "e3",
      tenant_id: A,
      kind: "webhook.delivery",
      subject_type: null,
      subject_id: null,
      data: {},
      created_at: "2026-09-11T14:50:00Z",
    },
    {
      id: "e4",
      tenant_id: A,
      kind: "call.recorded",
      subject_type: "call",
      subject_id: K1,
      data: {},
      created_at: "2026-09-10T10:00:00Z",
    },
    {
      id: "e5",
      tenant_id: A,
      kind: "broadcast.sent",
      subject_type: "broadcast",
      subject_id: "b1",
      data: { sent: 3, held: 1 },
      created_at: "2026-09-12T13:00:00Z",
    }, // 09:00 on the 12th
  ],
});
const rpcs = {
  team_roster: () => [
    { membership_id: "m1", member_user_id: "u-ada", email: "ada@example.com", display_name: "Ada", role: "owner" },
    { membership_id: "m2", member_user_id: "u-bo", email: "bo@example.com", display_name: "", role: "operator" },
  ],
};
const ids = (r) => r.rows.map((x) => x.id);

test("owners read both ledgers newest first, the noise left out, the actors named; a member who is not an owner is refused", async () => {
  assert.deepEqual(route.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: "owner",
    rate: "aggregate",
    spend: false,
  });
  const r = await route.GET.run(get(), ctxFor(tables(), rpcs));
  assert.deepEqual(
    ids(r),
    ["e-e5", "d-d3", "d-d2", "e-e1", "d-d1", "e-e4"],
    "merged across the two ledgers, newest first; usage and webhook rows absent",
  );
  assert.deepEqual(r.actors, { "u-ada": "Ada", "u-bo": "bo@example.com" }, "a name, else the address");
  assert.equal(r.rows[1].text, "Exported data · everyone as a CSV · 5 rows");
  assert.equal(r.rows[3].text, "A customer wrote");
  assert.deepEqual(
    r.page,
    { limit: 100, has_more: false, next_cursor: "2026-09-10T10:00:00Z|e-e4" },
    "a page hands back where it ended, not how far down it started",
  );
  assert.ok(r.kinds.includes("export") && r.kinds.includes("broadcast.sent"));
  await assert.rejects(route.GET.run(get(), ctxFor(tables("operator"), rpcs)), (e) => e.status === 403);
});

test("filters: a kind by name (noise included when asked), a person with their threads and calls, a day by the workspace's clock; a bad filter is refused", async () => {
  const kind = await route.GET.run(get("&kind=usage.ask_tokens"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(kind), ["e-e2"], "named, the evidence shows");
  const verb = await route.GET.run(get("&kind=export"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(verb), ["d-d3"], "this workspace's only");
  const person = await route.GET.run(get(`&person=${P1}`), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(person), ["d-d2", "d-d1", "e-e4"], "their own row, their thread's decision, their call's event");
  const day = await route.GET.run(get("&day=2026-09-11"), ctxFor(tables(), rpcs));
  assert.deepEqual(
    ids(day),
    ["d-d3", "d-d2", "e-e1", "d-d1"],
    "the 11th in New York runs to 04:00Z on the 12th: the late export is in, the morning broadcast is not",
  );
  const next = await route.GET.run(get("&day=2026-09-12"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(next), ["e-e5"]);
  await assert.rejects(route.GET.run(get("&day=yesterday"), ctxFor(tables(), rpcs)), (e) => e.code === "validation");
  await assert.rejects(
    route.GET.run(get("&kind=DROP%20TABLE"), ctxFor(tables(), rpcs)),
    (e) => e.code === "validation",
  );
  await assert.rejects(
    route.GET.run(get("&person=not-a-uuid"), ctxFor(tables(), rpcs)),
    (e) => e.code === "validation",
  );
});

test("a record kind is hidden by its own name, not its family: escalation.changed stays out unless asked for, and another escalation kind shows", async () => {
  const t = tables();
  t.events = [
    ...t.events,
    {
      id: "e6",
      tenant_id: A,
      kind: "escalation.changed",
      subject_type: "escalation",
      subject_id: "s1",
      data: { from: "rate_cap", to: "budget" },
      created_at: "2026-09-11T14:55:00Z",
    },
    {
      id: "e7",
      tenant_id: A,
      kind: "escalation.reopened",
      subject_type: "escalation",
      subject_id: "s1",
      data: {},
      created_at: "2026-09-11T14:58:00Z",
    },
  ];
  const all = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.ok(!ids(all).includes("e-e6"), "a reason that changed is a record Reports reads, not activity");
  assert.ok(ids(all).includes("e-e7"), "a later owner-facing escalation kind is not hidden with it");
  const named = await route.GET.run(get("&kind=escalation.changed"), ctxFor(t, rpcs));
  assert.deepEqual(ids(named), ["e-e6"], "named, it shows");
});

test("the records of K5 to K7 are hidden by their own names, not their families: lead.set_aside, call.transferred and booking_link.sent stay out unless asked for, while lead.stage, deal.won and call.recorded show", async () => {
  const t = tables();
  const row = (id, kind, subject_type, data, created_at) => ({
    id,
    tenant_id: A,
    kind,
    subject_type,
    subject_id: `${id}-subject`,
    data,
    created_at,
  });
  t.events = [
    ...t.events,
    row("n1", "lead.set_aside", "lead", { stage: "archived", reason: "stale", from: "ready" }, "2026-09-11T16:01:00Z"),
    row("n2", "call.transferred", "call", { answered: true }, "2026-09-11T16:02:00Z"),
    row("n3", "booking_link.sent", "message", { channel: "whatsapp", sender: "ai" }, "2026-09-11T16:03:00Z"),
    row("n4", "lead.stage", "lead", { stage: "ready", from: "new" }, "2026-09-11T16:04:00Z"),
    row("n5", "deal.won", "deal", { amount_cents: 12000 }, "2026-09-11T16:05:00Z"),
    row("n6", "call.recorded", "call", {}, "2026-09-11T16:06:00Z"),
  ];
  const all = ids(await route.GET.run(get(), ctxFor(t, rpcs)));
  for (const [id, kind] of [
    ["e-n1", "lead.set_aside"],
    ["e-n2", "call.transferred"],
    ["e-n3", "booking_link.sent"],
  ]) {
    assert.ok(!all.includes(id), `${kind} is a record Reports reads, not activity`);
    assert.deepEqual(ids(await route.GET.run(get(`&kind=${kind}`), ctxFor(t, rpcs))), [id], `${kind}, named, shows`);
  }
  for (const [id, kind] of [
    ["e-n4", "lead.stage"],
    ["e-n5", "deal.won"],
    ["e-n6", "call.recorded"],
  ])
    assert.ok(all.includes(id), `${kind} is not hidden with them: a member's own move and a call's record still show`);
});

test("a number's quality rating (K9) is hidden by its own name, not its family: channel.quality_rating stays out unless asked for, while a connection and Meta's own news of a number show", async () => {
  const t = tables();
  const row = (id, kind, data, created_at) => ({
    id,
    tenant_id: A,
    kind,
    subject_type: "channel",
    subject_id: `${id}-subject`,
    data,
    created_at,
  });
  t.events = [
    ...t.events,
    row("q1", "channel.quality_rating", { from: "GREEN", to: "YELLOW" }, "2026-09-11T17:01:00Z"),
    row("q2", "channel.connected", { phone_number_id: "1555010001" }, "2026-09-11T17:02:00Z"),
    row("q3", "channel.phone_number_quality_update", { event: "FLAGGED" }, "2026-09-11T17:03:00Z"),
  ];
  const all = ids(await route.GET.run(get(), ctxFor(t, rpcs)));
  assert.ok(!all.includes("e-q1"), "channel.quality_rating is a record Reports reads, not activity");
  assert.deepEqual(
    ids(await route.GET.run(get("&kind=channel.quality_rating"), ctxFor(t, rpcs))),
    ["e-q1"],
    "named, it shows",
  );
  for (const [id, kind] of [
    ["e-q2", "channel.connected"],
    ["e-q3", "channel.phone_number_quality_update"],
  ])
    assert.ok(all.includes(id), `${kind} is not hidden with it: the connection and Meta's own news still show`);
});

test("a page is cut after the merge, and the next one starts from the cursor rather than counting back to the top", async () => {
  const t = tables();
  t.events = Array.from({ length: 130 }, (_, i) => ({
    id: `x${i}`,
    tenant_id: A,
    kind: "message.received",
    subject_type: "message",
    subject_id: `m${i}`,
    data: {},
    created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
  }));
  t.decisions = [];
  const first = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.equal(first.rows.length, 100);
  assert.equal(first.page.has_more, true);
  assert.equal(first.rows[0].id, "e-x129");
  assert.equal(first.page.next_cursor, `${first.rows[99].at}|e-x30`, "where this page ended");

  const second = await route.GET.run(get(`&cursor=${encodeURIComponent(first.page.next_cursor)}`), ctxFor(t, rpcs));
  assert.deepEqual(
    second.rows.map((r) => r.id).slice(0, 2),
    ["e-x29", "e-x28"],
    "straight on from it, with no row repeated",
  );
  assert.equal(second.rows.length, 30);
  assert.equal(second.page.has_more, false);
});

test("rows written in the same instant survive the page edge: the cursor carries the row, not only the clock", async () => {
  // Every row at one timestamp, so created_at alone cannot say where the page
  // ended. A cursor of the instant alone would drop the 100 rows behind it.
  const t = tables();
  const same = "2026-09-01T00:00:00Z";
  t.events = Array.from({ length: 130 }, (_, i) => ({
    id: `x${String(i).padStart(3, "0")}`,
    tenant_id: A,
    kind: "message.received",
    subject_type: "message",
    subject_id: `m${i}`,
    data: {},
    created_at: same,
  }));
  t.decisions = [];
  const first = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.equal(first.rows.length, 100);
  assert.equal(first.page.has_more, true);
  const second = await route.GET.run(get(`&cursor=${encodeURIComponent(first.page.next_cursor)}`), ctxFor(t, rpcs));
  const seen = new Set([...first.rows, ...second.rows].map((r) => r.id));
  assert.equal(second.rows.length, 30, "the thirty behind the edge, none of them lost");
  assert.equal(seen.size, 130, "and none of them read twice");
});

test("the roster goes out with the ledgers, and a roster that refuses still refuses the read", async () => {
  // It used to be read AFTER the merge, which put a whole round trip end to end
  // on the page somebody is waiting in front of. Moving it earlier must not turn
  // a refusal into a page of rows that quietly say "A member".
  const angry = {
    team_roster: () => {
      throw new Error("roster is down");
    },
  };
  await assert.rejects(
    route.GET.run(get(), ctxFor(tables(), angry)),
    /roster is down/,
    "a row with a member on it still needs the roster",
  );

  // And where no row names a member, the roster is never awaited at all -- so
  // its refusal is nobody's business and the log reads.
  const t = tables();
  t.decisions = [];
  const r = await route.GET.run(get(), ctxFor(t, angry));
  assert.ok(r.rows.length > 0, "the events still read");
  assert.deepEqual(r.actors, {});
});
test("a cursor that is not one is refused, like every other filter -- but every spelling PostgREST uses for an instant is one", async () => {
  await assert.rejects(route.GET.run(get("&cursor=100"), ctxFor(tables(), rpcs)), (e) => e.code === "validation");
  await assert.rejects(
    route.GET.run(get("&cursor=2026-09-01T00:00:00Z"), ctxFor(tables(), rpcs)),
    (e) => e.code === "validation",
    "an instant with no row is half a cursor",
  );
  await assert.rejects(
    route.GET.run(get("&cursor=2026-09-01T00:00:00Z|x-nope"), ctxFor(tables(), rpcs)),
    (e) => e.code === "validation",
    "and a row from neither ledger is not one either",
  );
  // The zone suffix is PostgREST’s to spell, and a cursor the page was just
  // handed must never come back refused.
  for (const at of [
    "2026-09-11T14:00:00Z",
    "2026-09-11T14:00:00+00:00",
    "2026-09-11T14:00:00.123456+00:00",
    "2026-09-11T14:00:00",
  ]) {
    const r = await route.GET.run(get(`&cursor=${encodeURIComponent(`${at}|d-d1`)}`), ctxFor(tables(), rpcs));
    assert.ok(Array.isArray(r.rows), `${at} is a cursor`);
  }
});

test("a deal's verb and kinds have the owner's words", () => {
  assert.equal(activityWords("record_deal", {}), "Recorded a deal");
  assert.equal(activityWords("deal.proposed", {}), "A proposal went out");
  assert.equal(activityWords("deal.won", {}), "A person became a client");
  assert.equal(activityWords("deal.lost", {}), "A person passed on a proposal");
  assert.equal(activityWords("deal.ended", {}), "An engagement ended");
  assert.equal(activityTone("deal.won"), "ok");
});

test("an import says what its part of the list did, in counts", () => {
  assert.equal(
    activityWords("import", { rows: 50, added: 41, existed: 7, skipped: 2 }),
    "Imported 50 rows from a spreadsheet: 41 new, 7 already here, 2 skipped",
  );
  assert.equal(
    activityWords("import", {}),
    "Imported 0 rows from a spreadsheet: 0 new, 0 already here, 0 skipped",
    "a count the payload does not carry is none",
  );
  assert.equal(
    activityWords("import", { rows: 50, added: 10, existed: 0, skipped: 0, failed: 1 }),
    "Imported 50 rows from a spreadsheet: 10 new, 0 already here, 0 skipped, then stopped at a fault",
    "a part that stopped at a fault does not read as a clean import",
  );
});

/**
 * `humanize`, the fallback for a kind with no words of its own: "lead.stage" reads "Lead · stage". It is the right answer
 * for a kind nobody has met yet and the wrong one for a kind the product writes, which an owner then reads raw.
 */
const rawLabel = (kind) => {
  const [family, rest] = kind.split(".", 2);
  const tail = (rest ?? "").replace(/_/g, " ");
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${tail ? ` · ${tail}` : ""}`;
};

test("B13: every kind either ledger writes has words of its own, so no owner reads 'Lead · stage' or 'Partner · earned'", () => {
  const raw = [...DECISION_VERBS, ...EVENT_KINDS].filter((k) => activityWords(k, {}) === rawLabel(k));
  assert.deepEqual(raw, [], "these still fall to the raw label; give each its words");
});

test("a lead's life says what happened, from the fields its writers file, in the words the Leads page uses", () => {
  // lead_set_stage (00220): the stage it went to, and why when it was closed; the reply's undo and the bulk door write it too.
  assert.equal(activityWords("lead.stage", { stage: "nurture", reason: null, by: "u1" }), "A lead moved · Contacted");
  assert.equal(
    activityWords("lead.stage", { stage: "archived", reason: "said_no", by: "u1" }),
    "A lead moved · Closed · Said no",
  );
  assert.equal(
    activityWords("lead.stage", { stage: "archived", reason: "stale", count: 12, bulk: true, by: "u1" }),
    "12 leads moved · Closed · Went quiet",
    "the bulk door writes one row for the act, with its count",
  );
  assert.equal(activityWords("lead.stage", { stage: "ready", count: 1, bulk: true }), "1 lead moved · Ready");
  assert.equal(
    activityWords("lead.stage", { stage: "toString", reason: "constructor" }),
    "A lead moved",
    "a stage or a reason the sets do not hold says nothing, and a key of Object's own is not one",
  );
  // lead.call carries the owner's note, which is theirs and never on this screen.
  assert.equal(
    activityWords("lead.call", { outcome: "voicemail", note: "SECRET", by: "u1" }),
    "A call to a lead was logged · Left a voicemail",
  );
  assert.equal(activityWords("lead.call", { outcome: "mystery" }), "A call to a lead was logged");
  // lead.emailed has two writers: the owner's word that they sent it, and a reach-out's own email.
  assert.equal(activityWords("lead.emailed", { by: "u1" }), "A lead was marked as emailed");
  assert.equal(
    activityWords("lead.emailed", { by: "reach_out", send_id: "s1" }),
    "A reach-out email went to a lead",
    "what is recorded of the owner's is their word; a reach-out's email is the product's own act",
  );
  assert.equal(
    activityWords("lead.not_a_fit", { why: "chain", by: "u1" }),
    "A lead was marked not a fit · A chain or franchise",
  );
  assert.equal(activityWords("lead.not_a_fit", { why: null, by: "u1" }), "A lead was marked not a fit");
  assert.equal(activityWords("lead.not_a_fit", { why: null, count: 3, bulk: true }), "3 leads were marked not a fit");
  assert.equal(activityWords("lead.not_a_fit", { why: null, count: 1, bulk: true }), "1 lead was marked not a fit");
  // lead.converted's how: the converter's four doors, and the person door's link (00345) for a person who got in touch
  // or was added with the lead's number or address.
  assert.equal(activityWords("lead.converted", { how: "call", by: "u1" }), "A lead is Talking · after a call");
  assert.equal(
    activityWords("lead.converted", { how: "arrived", contact_id: "c1", source: "inbound" }),
    "A lead is Talking · they got in touch",
  );
  assert.equal(
    activityWords("lead.converted", { how: "added", contact_id: "c1", source: "import" }),
    "A lead is Talking · they were added to People",
  );
  assert.equal(activityWords("lead.converted", { how: "mystery" }), "A lead is Talking");
});

test("a WhatsApp connection, a milestone and a held review reply say what they are, naming the few fields their writers file", () => {
  assert.equal(
    activityWords("channel.connected", {
      kind: "whatsapp",
      phone_number_id: "1",
      waba_id: "2",
      number_e164: "+15550100",
      verified_name: "Harbor Moving",
      by: "u1",
    }),
    "A WhatsApp number was connected · Harbor Moving",
    "the business's verified name, and never the number or Meta's ids",
  );
  assert.equal(activityWords("channel.connected", { verified_name: null }), "A WhatsApp number was connected");
  // What Meta holds about the number changed (00338): the word of can_send, from and to; the first read has no from.
  assert.equal(
    activityWords("channel.standing", { from: "AVAILABLE", to: "BLOCKED" }),
    "A WhatsApp number's standing with Meta changed · from can send to blocked",
  );
  assert.equal(
    activityWords("channel.standing", { to: "LIMITED" }),
    "A WhatsApp number's standing with Meta changed · limited",
    "the first read: no from",
  );
  assert.equal(
    activityWords("channel.standing", { from: "BLOCKED", to: "RESTRICTED_FOR_NOW" }),
    "A WhatsApp number's standing with Meta changed · from blocked to restricted for now",
    "a word of Meta's that is not one of three is said as Meta said it, plain",
  );
  assert.equal(activityWords("channel.standing", {}), "A WhatsApp number's standing with Meta changed");
  assert.equal(isActivityNoise("channel.standing"), false, "an owner reads that Meta changed what a number may do");
  // Meta's decision on a display name (phone_number_name_update) is one of the computed channel.<field> family: words, not a key.
  assert.equal(
    activityWords("channel.phone_number_name_update", { waba_id: "1", decision: "APPROVED" }),
    "Channel · phone number name update",
  );
  assert.equal(isActivityNoise("channel.phone_number_name_update"), false, "an owner reads a decision on a name");
  assert.equal(
    activityWords("workspace.activated", { milestone: "line_live", via: "provision" }),
    "The workspace passed a milestone · its first line is answering",
  );
  assert.equal(
    activityWords("workspace.activated", { milestone: "first_reply", via: "x" }),
    "The workspace passed a milestone · its first reply went to a customer",
  );
  assert.equal(
    activityWords("workspace.activated", { milestone: "first_lead_search" }),
    "The workspace passed a milestone · its first lead search was made",
  );
  assert.equal(activityWords("workspace.activated", { milestone: "new_one" }), "The workspace passed a milestone");
  assert.equal(
    activityWords("google.reply_held", { review_id: "r1", why: "price" }),
    "A review reply was written and not posted · it named a price",
  );
  assert.equal(
    activityWords("google.reply_held", { review_id: "r1", why: "money" }),
    "A review reply was written and not posted · it named money",
  );
});

test("the partner programme reads in the owner's words, with what each writer files and never an amount, an invoice or an id", () => {
  const w = (kind, data) => activityWords(kind, { partner_id: "p1", invoice: "in_1", amount_cents: 4900, ...data });
  assert.equal(
    w("partner.attributed", { code: "ada-co", by: "u1" }),
    "The workspace was made through a partner's link",
  );
  assert.equal(
    w("partner.code_ignored", { why: "unknown" }),
    "A partner's code was not used · no partner has that code",
  );
  assert.equal(
    w("partner.code_ignored", { why: "paused" }),
    "A partner's code was not used · that partner's account is paused",
  );
  assert.equal(w("partner.code_ignored", { why: "self" }), "A partner's code was not used · it was their own code");
  assert.equal(
    w("partner.earned", { earned_cents: 1225, currency: "usd" }),
    "A partner earned a share of a payment",
    "the share is between the partner and Chanlytics: no figure here",
  );
  assert.equal(
    w("partner.reversed", { kind: "refund", earned_cents: -1225 }),
    "A partner's share changed · a payment was refunded",
  );
  assert.equal(w("partner.reversed", { kind: "dispute" }), "A partner's share changed · a payment was disputed");
  assert.equal(w("partner.reversed", { kind: "dispute_won" }), "A partner's share changed · a dispute was won");
  // A partner's standing is between the platform and the partner: the owner reads that it was judged, not the verdict.
  for (const p of [
    { standing: "review", by: "sweep" },
    { standing: "disqualified", from: "review", by: "person" },
    { standing: "disqualified", by: "joining" },
    { standing: "qualified" },
  ])
    assert.equal(w("partner.standing_set", p), "A partner's share was judged", JSON.stringify(p));
  assert.equal(w("partner.paid", { payout_id: "o1", earned_cents: 4900 }), "A partner was paid their share");
  assert.equal(w("partner.handover_sent", {}), "A partner sent the workspace to its owner");
  assert.equal(w("partner.handover_sent", { again: true }), "A partner sent the workspace to its owner · sent again");
  assert.equal(w("partner.handover_accepted", {}), "The owner accepted the workspace from its partner");
  assert.equal(w("partner.handover_declined", {}), "The owner declined the workspace from its partner");
  assert.equal(w("partner.invited", {}), "The workspace asked a partner to join");
  assert.equal(w("partner.invite_withdrawn", {}), "The invitation to a partner was taken back");
  assert.equal(w("partner.invite_accepted", { earns: true }), "A partner joined the workspace");
  assert.equal(
    w("partner.invite_accepted", { earns: false }),
    "A partner joined the workspace · it was already paying, so it earns no share",
  );
  assert.equal(w("partner.invite_declined", {}), "A partner declined to join the workspace");
  for (const k of EVENT_KINDS.filter((x) => x.startsWith("partner."))) {
    assert.doesNotMatch(
      w(k, { standing: "review", kind: "refund", why: "unknown" }),
      /4900|1225|in_1|p1/,
      `${k}: no figure or id`,
    );
  }
});

test("a message held at the wire, or that failed, says why where its event carries a reason", () => {
  // message.send_blocked (core deliver.ts): the refusal's code, which a run's held people are given words for.
  assert.equal(
    activityWords("message.send_blocked", {
      reason: "email_suppressed",
      purpose: "reply",
      consent: "opted_in",
      dnc: false,
    }),
    "A message was held at the wire · their email address stopped accepting mail",
  );
  assert.equal(
    activityWords("message.send_blocked", { reason: "superseded_by_human", after: "m1" }),
    "A message was held at the wire · a person answered first",
  );
  assert.equal(
    activityWords("message.send_blocked", { reason: "a_code_nobody_named" }),
    "A message was held at the wire",
  );
  assert.equal(activityWords("message.send_blocked", { reason: null }), "A message was held at the wire");
  // message.send_failed: { http_status?, body, reason, outcome? }. The provider's own words are on the message, not here.
  assert.equal(
    activityWords("message.send_failed", { http_status: 400, body: '{"error":{"code":131047}}', reason: "provider" }),
    "A message could not be sent · the provider refused it",
  );
  assert.equal(
    activityWords("message.send_failed", { http_status: 0, body: "timeout", reason: "provider" }),
    "A message could not be sent · the provider gave no answer",
  );
  assert.equal(
    activityWords("message.send_failed", { http_status: 0, body: "timeout", reason: "provider", outcome: "unknown" }),
    "A message could not be sent · the provider didn't answer in time, so it may have gone",
  );
  assert.equal(
    activityWords("message.send_failed", {
      reason: "receipt",
      outcome: "refused",
      body: '{"errors":[{"code":131047}]}',
    }),
    "A message could not be sent · the provider reported it as not delivered, after taking it",
    "a failure the provider reported after taking the message (#1415)",
  );
  assert.equal(
    activityWords("message.send_failed", { http_status: 503, body: "no_credentials", reason: "no_credentials" }),
    "A message could not be sent · the channel has no credentials to send with",
  );
  assert.equal(activityWords("message.send_failed", { reason: "something_new" }), "A message could not be sent");
});
