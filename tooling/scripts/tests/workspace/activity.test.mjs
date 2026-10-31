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
  activityLines,
  activityRowsForLines,
  activityFamily,
  activityKindGroups,
  activityDoor,
  activityMemberWords,
  isActivityNoise,
  ACTIVITY_KINDS,
  ACTIVITY_FOLD_KINDS,
  ACTIVITY_FAMILIES,
  ACTIVITY_PROBLEM_KINDS,
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
    "Recorded a consent answer · yes to messages · in person",
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
  // A mailbox the business connected (00423): its address, and why when it was held, in the words Connections says.
  assert.equal(
    activityWords("mailbox_connection.held", { address: "sam@getharbor.com", why: "bounces", sent: 150 }),
    "A mailbox to write from was held · sam@getharbor.com · more than 3% of its recent emails bounced or were refused",
  );
  assert.equal(
    activityWords("mailbox_connection.connected", { address: "sam@getharbor.com", provider: "google", again: false }),
    "A mailbox to write from was connected · sam@getharbor.com",
    "the address, never the provider's account",
  );
  // The file is the customer record, not everything the workspace holds (the wiring's second audit, X1).
  assert.equal(activityWords("export", { what: "workspace" }), "Exported data · the records");
  assert.equal(activityWords("export", { what: "people", rows: 312 }), "Exported data · everyone as a CSV · 312 rows");
  assert.equal(activityWords("export", { what: "conversation", messages: 40 }), "Exported data · a conversation");
  // One person's own copy, from their page (R14 X5).
  assert.equal(activityWords("export", { what: "person" }), "Exported data · a person's records");
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
    "Sent a message once · Spring offer · 40 people · approved by hand",
  );
  assert.equal(activityWords("broadcast.sent", { sent: 38, held: 2 }), "A run finished · 38 got it · 2 held");
  assert.equal(
    activityWords("settings.changed", { fields: ["hours", "closures", "calendar", "notifications", "extra"] }),
    "Settings changed · hours, closures, calendar, notifications",
  );
  // A rename keeps what it changed from and to (00439, X4-5): the one setting the log says in full.
  assert.equal(
    activityWords("settings.changed", { fields: ["name"], from: "Harbor Moving", to: "Harbor Movers" }),
    "Settings changed · renamed from “Harbor Moving” to “Harbor Movers”",
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
    "Meta reviewed a message",
    "Meta's own news of the account is said as what Meta did, never as its field",
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
// 54: a thread handed to the team is info; a member joining and answering switched on are ok; switched off is warn.
// 61: a payment that failed is danger; a member leaving, a booking cancelled and a reach-out stopped are warn; a
// booking that arrived and a payment that went through are ok; the owner answering from their own app is info.
// 62: the cold lane's four toned domain kinds went (decision 0056); a mailbox connected, resumed and writing again are
// ok, and one held or signed out is warn.
// 63: people taken out of a sequence by a member are warn (decision 0060); a step changed is plain.
// 64: people put back in a sequence, a leave undone (00450), are ok.
const TONED_KINDS = 64;
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
    // A kind that never folds (a failure is its own news), so a page is its hundred rows and no more.
    kind: "message.send_failed",
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
    // A kind that never folds (a failure is its own news), so a page is its hundred rows and no more.
    kind: "message.send_failed",
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

test("a lead's own receptionist (decision 0079): made for a lead, made theirs, and where a claimed workspace began", () => {
  // preview_claim (00497) files the claim on both workspaces: the sender's names the preview, the claimed one itself.
  assert.equal(
    activityWords("preview.made", { preview_id: "p1", by: null }),
    "A preview of its own receptionist was made for a lead",
  );
  assert.equal(activityWords("preview.claimed", { preview_id: "p1" }), "A lead made their preview theirs");
  assert.equal(activityWords("preview.claimed", { by: "u1" }), "This workspace began as a preview");
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
    "An email went to a lead",
    "what is recorded of the owner's is their word; a reach-out's email is the product's own act",
  );
  assert.equal(
    activityWords("lead.not_a_fit", { why: "chain", by: "u1" }),
    "A lead was marked not a fit · A chain or franchise",
  );
  assert.equal(activityWords("lead.not_a_fit", { why: null, by: "u1" }), "A lead was marked not a fit");
  assert.equal(activityWords("lead.not_a_fit", { why: null, count: 3, bulk: true }), "3 leads were marked not a fit");
  assert.equal(activityWords("lead.not_a_fit", { why: null, count: 1, bulk: true }), "1 lead was marked not a fit");
  // lead.converted's how: the converter's four doors, and the person door's link (00346) for a person who got in touch
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
    "Meta reviewed a WhatsApp number's name",
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
  assert.equal(
    activityWords("google.reply_held", { review_id: "r1", why: "tone" }),
    "A review reply was written and not posted",
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

/* ------------------------- folds, names, and who did it ------------------------- */

const U_ADA = "aaaaaaaa-0000-4000-8000-00000000ada0";
/** A row of the log as the fold reads it. */
const line = (id, kind, at, over = {}) => ({
  id,
  at,
  kind,
  actor_user_id: null,
  actor_type: null,
  subject_type: "call",
  subject_id: `s-${id}`,
  text: activityWords(kind, {}),
  ...over,
});
const utcDay = (iso) => iso.slice(0, 10);

test("rows of one kind by one hand on one day are one line, where the newest stood; a failure, a stop and a kind with no words never fold", () => {
  const hers = { actor_user_id: U_ADA, actor_type: "user" };
  const rows = [
    line("d-5", "open_recording", "2026-10-08T16:13:05Z", hers),
    line("e-9", "message.send_failed", "2026-10-08T16:13:04Z"),
    line("d-4", "open_recording", "2026-10-08T16:13:03Z", hers),
    line("e-8", "message.send_failed", "2026-10-08T16:13:02Z"),
    line("d-3", "open_recording", "2026-10-08T16:13:01Z", { actor_user_id: "another", actor_type: "user" }),
    line("d-2", "open_recording", "2026-10-07T10:00:00Z", hers),
    line("d-1", "export", "2026-10-07T09:00:00Z", hers),
    line("d-0", "export", "2026-10-07T08:00:00Z", hers),
  ];
  const lines = activityLines(rows, utcDay);
  assert.deepEqual(
    lines.map((l) => [l.row.id, l.count, l.title]),
    [
      ["d-5", 2, "Listened to 2 calls' recordings"],
      ["e-9", 1, null],
      ["e-8", 1, null],
      ["d-3", 1, null],
      ["d-2", 1, null],
      ["d-1", 1, null],
      ["d-0", 1, null],
    ],
    "her two of the 8th are one line where the newer stood; another member's, and hers of the day before, are their own; two failures and two exports stay two",
  );
  assert.deepEqual(
    lines[0].members.map((m) => m.id),
    ["d-5", "d-4"],
    "what it opens to, newest first",
  );
  assert.equal(lines[0].since, "2026-10-08T16:13:03Z", "and since when");
  assert.equal(activityLines(rows.slice(0, 3), utcDay)[0].key, lines[0].key, "a fold keeps its key as more is read");
  assert.equal(activityLines(rows, utcDay, false).length, rows.length, "asked for by name, nothing folds");
});

test("a fold counts what its kind counts: the calls, not the rows about one call; one thing said twice is that thing, twice", () => {
  const twice = [
    line("d-2", "open_recording", "2026-10-08T16:00:00Z", { subject_id: "k1" }),
    line("d-1", "open_recording", "2026-10-08T14:00:00Z", { subject_id: "k1" }),
  ];
  assert.equal(activityLines(twice, utcDay)[0].title, "Listened to a call's recording · 2 times");
  const three = [...twice, line("d-0", "open_recording", "2026-10-08T12:00:00Z", { subject_id: "k2" })];
  assert.equal(activityLines(three, utcDay)[0].title, "Listened to 2 calls' recordings", "three rows, two calls");
  const wrote = [1, 2, 3].map((i) =>
    line(`e-${i}`, "message.received", `2026-10-08T1${i}:00:00Z`, { subject_id: "m" }),
  );
  assert.equal(activityLines(wrote, utcDay)[0].title, "3 messages came in", "a kind whose noun is the row counts rows");
  // A campaign's runs fold in the reader's word, never "playbook" (decision 19).
  const ran = [1, 2, 3].map((i) =>
    line(`r-${i}`, "playbook.run", `2026-10-08T1${i}:00:00Z`, { subject_id: `pb-${i}` }),
  );
  assert.equal(activityLines(ran, utcDay)[0].title, "Campaigns ran 3 times");
  const emailed = [1, 2].map((i) =>
    line(`e-r${i}`, "lead.emailed", `2026-10-08T1${i}:00:00Z`, {
      text: activityWords("lead.emailed", { by: "reach_out" }),
    }),
  );
  const byHand = [3, 4].map((i) => line(`e-h${i}`, "lead.emailed", `2026-10-08T0${i}:00:00Z`));
  assert.deepEqual(
    activityLines([...emailed, ...byHand], utcDay).map((l) => l.title),
    ["2 emails went to leads", "2 leads were marked as emailed"],
    "a reach-out's emails and an owner's own marks are two lines, each in its words",
  );
});

test("every kind that folds is a kind a ledger holds, is shown without being asked for, and is neither a failure nor a stop", () => {
  for (const k of ACTIVITY_FOLD_KINDS) {
    assert.ok(ACTIVITY_KINDS.includes(k), `${k} is a kind a ledger can hold`);
    assert.equal(isActivityNoise(k), false, `${k} is not a kept record`);
    assert.ok(!["danger", "warn"].includes(activityTone(k)), `${k}: a failure or a stop is its own news`);
  }
});

test("a reader that says so many lines reads the rows that make them, and no more", () => {
  const rows = [
    ...[5, 4, 3].map((i) => line(`e-m${i}`, "message.received", `2026-10-08T1${i}:00:00Z`)),
    line("d-x", "export", "2026-10-08T09:00:00Z"),
    line("e-m0", "message.received", "2026-10-08T08:00:00Z"),
    line("d-y", "export", "2026-10-08T07:00:00Z"),
  ];
  assert.equal(activityRowsForLines(rows, utcDay, 2), 5, "two lines: the messages (the late one too) and one export");
  assert.equal(activityRowsForLines(rows, utcDay, 1), 3, "one line ends where the second would begin");
  assert.equal(activityRowsForLines(rows, utcDay, 9), rows.length);
});

test("every kind either ledger holds has a family, and the picker says each kind in its rows' words", () => {
  for (const k of ACTIVITY_KINDS) assert.ok(ACTIVITY_FAMILIES.includes(activityFamily(k)), `${k} has a family`);
  assert.equal(activityFamily("open_recording"), "calls");
  assert.equal(activityFamily("policy.veto_window_skipped"), "conversations", "named for where it is read");
  assert.equal(activityFamily("channel.phone_number_quality_update"), "connections", "Meta's own news of a number");
  assert.equal(activityFamily("something.new"), null, "a kind of a newer build belongs to none");
  const groups = activityKindGroups(ACTIVITY_KINDS);
  const calls = groups.find((g) => g.family === "calls");
  assert.ok(calls.kinds.some((k) => k.kind === "open_recording" && k.label === "Listened to a call's recording"));
  assert.equal(groups.flatMap((g) => g.kinds).length, ACTIVITY_KINDS.length, "each kind once");
  for (const g of groups)
    for (const k of g.kinds) assert.ok(!/^[a-z_]+(\.[a-z_]+)?$/.test(k.label), `${k.kind} is said in words`);
  assert.ok(ACTIVITY_PROBLEM_KINDS.includes("message.send_failed") && ACTIVITY_PROBLEM_KINDS.includes("snooze"));
  assert.ok(!ACTIVITY_PROBLEM_KINDS.includes("ingest.unroutable"), "a kept record is asked for by name");
});

test("a row opens the page of what it is about, and a fold's row says only what the fold has not", () => {
  assert.equal(activityDoor({ subject_type: "contact", subject_id: P1 }), `clients/${P1}`);
  assert.equal(activityDoor({ subject_type: "call", subject_id: K1 }), `conversations/cv-${K1}`);
  assert.equal(activityDoor({ subject_type: "lead", subject_id: "l1" }), "clients/leads:p-l1");
  assert.equal(activityDoor({ subject_type: "broadcast", subject_id: "b1" }), "campaigns/sequences/b1/runs/b1");
  assert.equal(activityDoor({ subject_type: "membership", subject_id: "m1" }), "admin/team");
  assert.equal(activityDoor({ subject_type: "workspace", subject_id: A }), null);
  const heard = { kind: "open_recording", text: "Listened to a call's recording" };
  assert.equal(activityMemberWords(heard, "Dana Ortiz"), "Dana Ortiz", "the fold said the rest");
  assert.equal(activityMemberWords(heard, null), "Listened to a call's recording");
  const logged = { kind: "lead.call", text: "A call to a lead was logged · No answer" };
  assert.equal(activityMemberWords(logged, "Harbor Movers"), "A call to a lead was logged · No answer · Harbor Movers");
});

/** `n` events of one kind, a second apart; ids `<p>0` (the oldest) to `<p>n-1`. */
const burst = (p, n, kind, startMs) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${p}${i}`,
    tenant_id: A,
    kind,
    subject_type: "message",
    subject_id: `${p}m${i}`,
    data: {},
    created_at: new Date(startMs + i * 1000).toISOString(),
  }));

test("a page whose rows fold to a handful of lines reads on, until it holds a page of lines or the log ends", async () => {
  const t = tables();
  t.decisions = [];
  // Thirty failures, older; then two hundred and fifty messages in, all on one day: one line.
  t.events = [
    ...burst("f", 30, "message.send_failed", Date.UTC(2026, 8, 1, 14, 0)),
    ...burst("m", 250, "message.received", Date.UTC(2026, 8, 1, 15, 0)),
  ];
  const r = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.equal(r.rows.length, 280, "the hundred was one line, and so was the next: it read to the lines behind them");
  assert.equal(r.page.has_more, false);
  assert.equal(r.rows[0].id, "e-m249");
  assert.equal(r.page.next_cursor, `${r.rows[279].at}|e-f0`);
  assert.equal(activityLines(r.rows, utcDay).length, 31);
});

test("a burst longer than five reads stops there, and the next page goes straight on from it", async () => {
  const t = tables();
  t.decisions = [];
  t.events = burst("m", 620, "message.received", Date.UTC(2026, 8, 1, 12, 0));
  const first = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.equal(first.rows.length, 500, "five reads of a hundred, and no more for one request");
  assert.equal(first.page.has_more, true);
  const second = await route.GET.run(get(`&cursor=${encodeURIComponent(first.page.next_cursor)}`), ctxFor(t, rpcs));
  assert.equal(second.rows.length, 120);
  assert.equal(new Set([...first.rows, ...second.rows].map((x) => x.id)).size, 620, "none lost, none twice");
  const named = await route.GET.run(get("&kind=message.received"), ctxFor(t, rpcs));
  assert.equal(named.rows.length, 100, "asked for by name its rows are what is read: a page is its hundred");
});

test("a row says who or what it is about by name, an event names the member its data does, and the members are listed for the picker", async () => {
  const U_BO = "bbbbbbbb-0000-4000-8000-0000000000b0";
  const t = tables();
  t.contacts = [
    {
      id: P1,
      tenant_id: A,
      display_name: "Dana Ortiz",
      wa_profile_name: null,
      phone_e164: "+13055550101",
      email: null,
    },
  ];
  t.segments = [{ id: "seg1", tenant_id: A, name: "Regulars" }];
  t.events = [
    ...t.events,
    {
      id: "e9",
      tenant_id: A,
      kind: "settings.changed",
      subject_type: "workspace",
      subject_id: A,
      data: { fields: ["hours"], by: U_BO },
      created_at: "2026-09-12T14:00:00Z",
    },
    {
      id: "e10",
      tenant_id: A,
      kind: "line.answering",
      subject_type: "line",
      subject_id: "ln1",
      data: { by: "owner" },
      created_at: "2026-09-12T14:01:00Z",
    },
  ];
  t.decisions = [
    ...t.decisions,
    {
      id: "d9",
      tenant_id: A,
      verb: "make_list",
      subject_type: "list",
      subject_id: "seg1",
      actor_type: "user",
      actor_user_id: "u-ada",
      payload: {},
      created_at: "2026-09-12T14:02:00Z",
    },
  ];
  const team = {
    team_roster: () => [
      ...rpcs.team_roster(),
      { membership_id: "m3", member_user_id: U_BO, email: "bo@example.com", display_name: "Bo", role: "operator" },
    ],
  };
  const r = await route.GET.run(get(), ctxFor(t, team));
  assert.deepEqual(
    r.subjects,
    {
      [`contact:${P1}`]: "Dana Ortiz",
      [`conversation:${C1}`]: "Dana Ortiz",
      [`call:${K1}`]: "Dana Ortiz",
      "list:seg1": "Regulars",
    },
    "a person by their name, their thread and their call by it too, a list by its own; a workspace, a message and a line by none",
  );
  const changed = r.rows.find((x) => x.id === "e-e9");
  assert.equal(changed.actor_user_id, U_BO, "REGRESSION: an event's own `by` was read as nobody");
  assert.equal(r.actors[U_BO], "Bo");
  assert.equal(r.rows.find((x) => x.id === "e-e10").actor_user_id, null, "a role's word in `by` is not a member");
  assert.deepEqual(
    r.members.map((m) => m.name),
    ["Ada", "bo@example.com", "Bo"],
    "the roster, each by the name the rows say",
  );
  const hers = await route.GET.run(get(`&actor=${U_BO}`), ctxFor(t, team));
  assert.deepEqual(ids(hers), ["e-e9"], "narrowed to a member: what the ledgers say they did, events included");
});

test("the log is narrowed to a family, to what went wrong, to the receptionist's own, and to a span of days", async () => {
  const t = tables();
  t.decisions = [
    ...t.decisions,
    {
      id: "d7",
      tenant_id: A,
      verb: "reply",
      subject_type: "conversation",
      subject_id: C1,
      actor_type: "ai",
      actor_user_id: null,
      payload: {},
      created_at: "2026-09-10T12:00:00Z",
    },
    {
      id: "d8",
      tenant_id: A,
      verb: "snooze",
      subject_type: "conversation",
      subject_id: C1,
      actor_type: "user",
      actor_user_id: "u-ada",
      payload: {},
      created_at: "2026-09-10T13:00:00Z",
    },
  ];
  const run = async (q) => ids(await route.GET.run(get(q), ctxFor(t, rpcs)));
  assert.deepEqual(await run("&family=conversations"), ["d-d2", "e-e1", "d-d8", "d-d7"], "its verbs and its events");
  assert.deepEqual(await run("&family=calls"), ["e-e4"]);
  assert.deepEqual(await run("&family=records"), ["e-e3", "e-e2"], "the kept records, under their own family alone");
  assert.deepEqual(await run("&family=team"), [], "a family with nothing to say reads nothing");
  assert.deepEqual(await run("&only=problems"), ["d-d8"], "a stop is one; a finished broadcast is not");
  assert.deepEqual(await run("&actor=receptionist"), ["d-d7"], "the receptionist's decisions, and no event");
  assert.deepEqual(await run("&actor=system"), []);
  assert.deepEqual(
    await run("&from=2026-09-10&to=2026-09-10"),
    ["d-d8", "d-d7", "e-e4"],
    "one day as a span, by the workspace's clock",
  );
  assert.deepEqual(await run("&from=2026-09-12"), ["e-e5"], "open at its far end");
  await assert.rejects(route.GET.run(get("&family=everything"), ctxFor(t, rpcs)), (e) => e.code === "validation");
  await assert.rejects(route.GET.run(get("&actor=nobody"), ctxFor(t, rpcs)), (e) => e.code === "validation");
});

test("what the ledgers never kept is said in an owner's words: a thread handed over, a member joining, a playbook or a message changed, answering switched on or off, and Meta's own news", () => {
  assert.equal(
    activityWords("escalation.opened", { reason: "callback" }).startsWith("A thread was handed to the team · "),
    true,
  );
  assert.equal(activityWords("escalation.opened", {}), "A thread was handed to the team");
  assert.equal(activityWords("member.joined", { by: "u1", role: "operator" }), "Joined the workspace · as operator");
  assert.equal(
    activityWords("playbook.changed", { name: "Win-back", by: "u1", fields: ["message", "channels"] }),
    "A campaign was edited · Win-back · message, channels",
  );
  assert.equal(
    activityWords("playbook.changed", { name: "Win-back", by: "u1", fields: [] }),
    "A campaign was edited · Win-back",
  );
  // A save of the business on record says what it moved, by the form's labels, never the values (the wiring's second
  // audit, X4-3); a row from before it, or the first save, says only that it was saved.
  assert.equal(
    activityWords("business.recorded", { by: "u1", changed: ["legal_name", "street"] }),
    "The business record was saved · Legal name, Street",
  );
  assert.equal(
    activityWords("business.recorded", { changed: ["contact_job_position", "country", "about", "city", "region"] }),
    "The business record was saved · Job position, Country, What the business does, City",
    "four at most, each by the words a person reads",
  );
  assert.equal(activityWords("business.recorded", { changed: [] }), "The business record was saved · nothing changed");
  assert.equal(activityWords("business.recorded", { changed: null }), "The business record was saved");
  assert.equal(activityWords("business.recorded", {}), "The business record was saved");
  // A campaign to whoever reads the log, never a playbook (decision 19): the ledger's kinds keep their names.
  assert.equal(activityWords("playbook.run", {}), "A campaign ran");
  assert.equal(activityWords("start_playbook", {}), "Started a campaign");
  assert.equal(activityWords("pause_playbook", {}), "Paused a campaign");
  assert.equal(
    activityWords("template.submitted", { name: "spring_offer", language: "en", by: "u1" }),
    "A message was sent to WhatsApp for approval · spring_offer",
  );
  assert.equal(
    activityWords("template.removed", { name: "spring_offer", language: "en", by: "u1" }),
    "A message was deleted from Messages · spring_offer",
  );
  assert.equal(
    activityWords("capability.activated", { capability: "voice", by: "u1" }),
    "Answering was switched on · calls",
  );
  assert.equal(
    activityWords("capability.deactivated", { capability: "sms", by: "u1" }),
    "Answering was switched off · texts",
  );
  assert.equal(
    activityWords("capability.activated", { capability: "fax" }),
    "Answering was switched on",
    "never a guess",
  );
  for (const [kind, family] of [
    ["escalation.opened", "conversations"],
    ["member.joined", "team"],
    ["playbook.changed", "campaigns"],
    ["template.submitted", "campaigns"],
    ["capability.deactivated", "connections"],
  ])
    assert.equal(activityFamily(kind), family, kind);
  assert.equal(activityTone("capability.deactivated"), "warn");
  assert.ok(!ACTIVITY_FOLD_KINDS.includes("escalation.opened"), "each thread handed over is its own news");
  // Meta's seven, each in words: none reads as its field.
  for (const k of ACTIVITY_KINDS.filter((x) => x.startsWith("channel.")))
    assert.ok(!activityWords(k, {}).startsWith("Channel · "), `${k} has words of its own`);
});

test("a thread handed to the team is on the ledger: the one writer of an escalation says so as it opens one", async () => {
  const { upsertEscalation } = await import(at("packages/jobs/src/escalate.ts"));
  const world = { escalations: [], events: [] };
  const db = fakeDb(world);
  assert.equal(await upsertEscalation(db, A, C1, "callback", "They asked for a call back."), "opened");
  assert.deepEqual(
    world.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]),
    [[A, "escalation.opened", "conversation", C1, { reason: "callback" }]],
    "REGRESSION: the activity log had no line for a thread the receptionist handed over",
  );
});

test("a message and an escalation are their thread's person's, and a deal its person's: named by them, and each opens the page the server looked up", async () => {
  const t = tables();
  t.contacts = [
    { id: P1, tenant_id: A, display_name: "Dana Ortiz", wa_profile_name: null, phone_e164: null, email: null },
  ];
  t.messages = [{ id: "msg1", tenant_id: A, contact_id: P1, conversation_id: C1 }];
  // An escalation on a thread no other row of the page names: its thread is read for it.
  const C2 = "22222222-2222-4222-8222-000000000002";
  t.conversations = [...t.conversations, { id: C2, tenant_id: A, contact_id: P1 }];
  t.escalations = [{ id: "esc1", tenant_id: A, conversation_id: C2 }];
  t.deals = [{ id: "deal1", tenant_id: A, contact_id: P1 }];
  const event = (id, kind, subject_type, subject_id, minute) => ({
    id,
    tenant_id: A,
    kind,
    subject_type,
    subject_id,
    data: {},
    created_at: `2026-09-13T10:0${minute}:00Z`,
  });
  t.decisions = [];
  t.events = [
    event("f1", "message.send_failed", "message", "msg1", 3),
    event("f2", "escalation.changed", "escalation", "esc1", 2),
    event("f3", "deal.won", "deal", "deal1", 1),
    event("f4", "message.send_failed", "message", "gone", 0),
  ];
  const r = await route.GET.run(get("&from=2026-09-13"), ctxFor(t, rpcs));
  assert.deepEqual(ids(r), ["e-f1", "e-f3", "e-f4"], "the reason that changed stays a kept record");
  assert.deepEqual(r.subjects, { "message:msg1": "Dana Ortiz", "deal:deal1": "Dana Ortiz" });
  assert.deepEqual(
    r.doors,
    { "message:msg1": `inbox/th-${C1}`, "deal:deal1": `clients/${P1}` },
    "REGRESSION: a message that could not be sent opened nothing; a subject nothing is read for has no door",
  );
  const named = await route.GET.run(get("&kind=escalation.changed"), ctxFor(t, rpcs));
  assert.deepEqual(
    [named.subjects["escalation:esc1"], named.doors["escalation:esc1"]],
    ["Dana Ortiz", `inbox/th-${C2}`],
    "an escalation is its thread's: named by its person, and it opens the thread",
  );
});

test("the second batch of what the ledgers never kept reads in an owner's words: a missed call is said as one, a booking by the tool that sent it, a decision by what was decided, and never a number or an amount", () => {
  // A call's first sighting says whether it ever connected (ingest_call's { direction, status }).
  assert.equal(activityWords("call.recorded", { direction: "inbound", status: "ongoing" }), "A call was recorded");
  assert.equal(activityWords("call.recorded", { direction: "inbound", status: "not_connected" }), "A call was missed");
  assert.equal(
    activityWords("call.recorded", { direction: "outbound", status: "not_connected" }),
    "A call we placed did not connect",
  );
  assert.equal(activityWords("call.recorded", {}), "A call was recorded", "a row from before the status was filed");

  assert.equal(
    activityWords("appointment.booked", { source: "booking_email", tool: "booksy" }),
    "A booking arrived by email · Booksy",
  );
  assert.equal(
    activityWords("appointment.moved", { source: "booking_email", tool: "mindbody" }),
    "A booking was changed by email · Mindbody",
  );
  assert.equal(activityWords("appointment.cancelled", {}), "A booking was cancelled by email");
  assert.equal(isActivityNoise("appointment.booked"), false, "an email is one thing that happened: shown");
  assert.equal(isActivityNoise("appointment.changed"), true, "the calendar's hourly read stays a kept record");

  assert.equal(
    activityWords("member.left", { by: "u1", how: "account_deleted" }),
    "Left the workspace · deleted their account",
  );
  assert.equal(activityWords("reach_out.lead_stopped", { by: "u1" }), "A sequence stopped writing to a lead");
  assert.equal(
    activityWords("reach_out.send_decided", { decision: "skip", by: "u1" }),
    "A held email to a lead was skipped",
  );
  assert.equal(
    activityWords("reach_out.send_decided", { decision: "include" }),
    "A held email to a lead was sent as written",
  );
  assert.equal(activityWords("reach_out.send_decided", { decision: "banana" }), "A held email to a lead was decided");
  assert.equal(activityWords("lead.kept", { by: "u1", search_id: "s1" }), "A lead was kept from Needs review");
  assert.equal(
    activityWords("lead.search_renamed", { name: "Movers in Tampa", by: "u1" }),
    "A search was renamed · Movers in Tampa",
  );
  assert.equal(
    activityWords("lead.search_removed", { name: "Movers in Tampa", kept: 3, archived: 40, by: "u1" }),
    "A search was removed · Movers in Tampa · 3 kept",
  );
  assert.equal(
    activityWords("contact.kept_apart", { by: "u1", doubt_id: "d1" }),
    "Two records were kept as two people",
  );
  assert.equal(
    activityWords("line.forwarding_set", { carrier: "verizon", mode: "unanswered", by: "u1", number: "+13055550100" }),
    "Call forwarding was set up · the calls not answered",
    "which calls, never the number",
  );
  assert.equal(
    activityWords("conversation.owner_replied", { until: "2026-10-08T20:00:00Z" }),
    "The owner replied from the WhatsApp Business app, and the receptionist stepped back",
  );
  assert.equal(
    activityWords("billing.payment_failed", { amount: 9900 }),
    "A payment did not go through",
    "never an amount",
  );
  assert.equal(activityWords("billing.paid", {}), "A payment went through");
  assert.equal(
    activityWords("billing.trial_ending", { trial_end: "2026-10-11T00:00:00Z" }),
    "The trial ends in three days",
  );

  for (const [kind, tone] of [
    ["billing.payment_failed", "danger"],
    ["member.left", "warn"],
    ["appointment.cancelled", "warn"],
    ["reach_out.lead_stopped", "warn"],
    ["appointment.booked", "ok"],
    ["billing.paid", "ok"],
    ["conversation.owner_replied", "info"],
  ])
    assert.equal(activityTone(kind), tone, kind);
  for (const [kind, family] of [
    ["appointment.booked", "calendar"],
    ["member.left", "team"],
    ["reach_out.send_decided", "leads"],
    ["lead.search_removed", "leads"],
    ["billing.payment_failed", "billing"],
    ["conversation.owner_replied", "conversations"],
    ["line.forwarding_set", "connections"],
  ])
    assert.equal(activityFamily(kind), family, kind);
  assert.equal(activityDoor({ subject_type: "appointment", subject_id: "ap1" }), "calendar/a-ap1");
  assert.equal(activityDoor({ subject_type: "lead_search", subject_id: "s1" }), "clients/leads:s-s1");
});

test("missed calls fold with missed calls and recorded with recorded; a triage session and a run of decisions are one line each", () => {
  const missed = (i) =>
    line(`e-m${i}`, "call.recorded", `2026-10-08T1${i}:00:00Z`, {
      text: activityWords("call.recorded", { direction: "inbound", status: "not_connected" }),
    });
  const heard = (i) => line(`e-h${i}`, "call.recorded", `2026-10-08T0${i}:00:00Z`);
  assert.deepEqual(
    activityLines([missed(3), missed(2), heard(9), heard(8), heard(7)], utcDay).map((l) => l.title),
    ["2 calls were missed", "3 calls were recorded"],
    "a call that never connected is not folded in with the ones that did",
  );
  const kept = [1, 2, 3].map((i) => line(`e-k${i}`, "lead.kept", `2026-10-08T1${i}:00:00Z`, { subject_type: "lead" }));
  assert.equal(activityLines(kept, utcDay)[0].title, "3 leads were kept from Needs review");
  const skipped = [1, 2].map((i) =>
    line(`e-s${i}`, "reach_out.send_decided", `2026-10-08T1${i}:00:00Z`, {
      text: activityWords("reach_out.send_decided", { decision: "skip" }),
    }),
  );
  const sent = line("e-s9", "reach_out.send_decided", "2026-10-08T09:00:00Z", {
    text: activityWords("reach_out.send_decided", { decision: "include" }),
  });
  assert.deepEqual(
    activityLines([...skipped, sent], utcDay).map((l) => l.title),
    ["A held email to a lead was skipped · 2 times", null],
    "each decision folds with its own; one alone is a row",
  );
  const booked = [1, 2].map((i) => line(`e-b${i}`, "appointment.booked", `2026-10-08T1${i}:00:00Z`));
  assert.equal(activityLines(booked, utcDay)[0].title, "2 bookings arrived by email");
  for (const k of ["billing.payment_failed", "appointment.cancelled", "member.left", "reach_out.lead_stopped"])
    assert.ok(!ACTIVITY_FOLD_KINDS.includes(k), `${k} is its own news`);
});

test("a visit and a search are named in the log: a visit by its person, else as its booking said it; a search by its name", async () => {
  const t = tables();
  t.contacts = [
    { id: P1, tenant_id: A, display_name: "Dana Ortiz", wa_profile_name: null, phone_e164: null, email: null },
  ];
  t.appointments = [
    { id: "ap1", tenant_id: A, contact_id: P1, client_name: "D. Ortiz" },
    { id: "ap2", tenant_id: A, contact_id: null, client_name: "Lee Park" },
  ];
  t.lead_searches = [{ id: "s1", tenant_id: A, name: "Movers in Tampa" }];
  const event = (id, kind, subject_type, subject_id, minute) => ({
    id,
    tenant_id: A,
    kind,
    subject_type,
    subject_id,
    data: { source: "booking_email", tool: "booksy" },
    created_at: `2026-09-14T10:0${minute}:00Z`,
  });
  t.decisions = [];
  t.events = [
    event("g1", "appointment.booked", "appointment", "ap1", 3),
    event("g2", "appointment.cancelled", "appointment", "ap2", 2),
    event("g3", "lead.search_renamed", "lead_search", "s1", 1),
  ];
  const r = await route.GET.run(get("&from=2026-09-14"), ctxFor(t, rpcs));
  assert.deepEqual(ids(r), ["e-g1", "e-g2", "e-g3"], "a booking by email is shown without being asked for");
  assert.deepEqual(r.subjects, {
    "appointment:ap1": "Dana Ortiz",
    "appointment:ap2": "Lee Park",
    "lead_search:s1": "Movers in Tampa",
  });
  assert.equal(r.rows[0].text, "A booking arrived by email · Booksy");
  const calendar = await route.GET.run(get("&family=calendar"), ctxFor(t, rpcs));
  assert.deepEqual(ids(calendar), ["e-g1", "e-g2"], "the Calendar family has something to say now");
});

test("(A1) a visit's row opens the visit on its day, by the business's clock; one the page cannot find has the door the board reads alone", async () => {
  const t = tables();
  // New York: 02:30 UTC on the 15th is the evening of the 14th.
  t.appointments = [
    { id: "ap1", tenant_id: A, contact_id: null, client_name: "Lee Park", starts_at: "2026-09-15T02:30:00Z" },
    { id: "ap2", tenant_id: A, contact_id: null, client_name: "Dana Ortiz", starts_at: "2026-09-16T15:00:00Z" },
  ];
  const event = (id, kind, subject_id, minute) => ({
    id,
    tenant_id: A,
    kind,
    subject_type: "appointment",
    subject_id,
    data: { source: "booking_email", tool: "booksy" },
    created_at: `2026-09-14T10:0${minute}:00Z`,
  });
  t.decisions = [];
  t.events = [
    event("h1", "appointment.booked", "ap1", 3),
    event("h2", "appointment.moved", "ap2", 2),
    event("h3", "appointment.cancelled", "gone", 1),
  ];
  const r = await route.GET.run(get("&from=2026-09-14"), ctxFor(t, rpcs));
  assert.deepEqual(
    r.doors,
    { "appointment:ap1": `calendar/2026-09-14:a-ap1`, "appointment:ap2": `calendar/2026-09-16:a-ap2` },
    "REGRESSION: the line opened the Calendar at today, with nothing opened; a visit last month was not on the screen at all",
  );
  assert.equal(r.doors["appointment:gone"], undefined, "a visit the page cannot read has no day to say");
  assert.equal(
    activityDoor({ subject_type: "appointment", subject_id: "gone" }),
    "calendar/a-gone",
    "and the log draws the address the board has always read, which opens the panel if the visit is among its days",
  );
});

test("(1.6) a message sent to WhatsApp opens its drawer in the Library by name while its row is there; one deleted opens nothing, and both read as they did", async () => {
  const t = tables();
  t.templates = [
    { id: "tp1", tenant_id: A, name: "spring_offer", language: "en", hidden_at: null },
    { id: "tp3", tenant_id: A, name: "sample_hello", language: "en", hidden_at: "2026-09-01T00:00:00Z" },
  ];
  const event = (id, kind, subject_id, minute) => ({
    id,
    tenant_id: A,
    kind,
    subject_type: "template",
    subject_id,
    data: { name: "spring_offer", language: "en", by: "u1" },
    created_at: `2026-09-14T10:0${minute}:00Z`,
  });
  t.decisions = [];
  t.events = [
    event("m1", "template.submitted", "tp1", 3),
    event("m2", "template.removed", "tp2", 2),
    event("m3", "template.submitted", "tp3", 1),
  ];
  const r = await route.GET.run(get("&from=2026-09-14"), ctxFor(t, rpcs));
  assert.deepEqual(
    r.doors,
    { "template:tp1": "campaigns/messages/spring_offer" },
    "only a message still in the Library",
  );
  assert.deepEqual(
    r.rows.map((x) => x.text),
    [
      "A message was sent to WhatsApp for approval · spring_offer",
      "A message was deleted from Messages · spring_offer",
      "A message was sent to WhatsApp for approval · spring_offer",
    ],
    "the words are the data's, whatever the subject is",
  );
});

test("a campaign changed in place wears the log's edit mark; its pause and its resume keep their own", async () => {
  const { activityMark } = await import(at("apps/dashboard/src/surfaces/settings/activity/marks.ts"));
  assert.deepEqual(
    ["change_playbook", "pause_playbook", "start_playbook"].map((k) => activityMark(k)),
    ["edit", "pause", "play"],
  );
});
