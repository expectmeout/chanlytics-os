/**
 * Settings and setup, run through route(): the real route modules, their
 * `run` called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The verbs that reach
 * the edge stop at its credential or the production guard on this machine.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { resolveSystemPrompt } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const settings = await import(at("apps/dashboard/app/api/v1/settings/route.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
const record = await import(at("apps/dashboard/app/api/v1/business-record/route.ts"));
const calendar = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));
const preview = await import(at("apps/dashboard/app/api/v1/calendar/preview/route.ts"));
const { feedUrlOk } = await import(at("apps/dashboard/src/server/calendar.ts"));
const setupRequest = await import(at("apps/dashboard/app/api/v1/setup/request/route.ts"));
const search = await import(at("apps/dashboard/app/api/v1/lines/search/route.ts"));
const retry = await import(at("apps/dashboard/app/api/v1/lines/retry/route.ts"));
const forwarding = await import(at("apps/dashboard/app/api/v1/lines/forwarding/route.ts"));
const forwardingTest = await import(at("apps/dashboard/app/api/v1/lines/forwarding/test/route.ts"));
const connect = await import(at("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const policy = (tenant_id, cls, mode, limits = {}) => ({
  id: `${cls}-${tenant_id.slice(0, 1)}`,
  tenant_id,
  class: cls,
  mode,
  subject_type: null,
  subject_id: null,
  limits,
  updated_at: "2026-09-01T00:00:00Z",
});

test("the fourteen declare their policy: the reads open to every member, the calendar counted with the aggregates, every change counted, the owner's where it is the business's identity or its lines", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const ws = (role, rate) => ({ kind: "write", scope: "workspace", role, rate, spend: false });
  assert.deepEqual(settings.GET.policy, open);
  assert.deepEqual(policies.GET.policy, open);
  assert.deepEqual(record.GET.policy, open);
  assert.deepEqual(calendar.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(settings.PUT.policy, ws("owner", "settings"));
  assert.deepEqual(policies.PUT.policy, ws("operator", "settings"));
  assert.deepEqual(record.PUT.policy, ws("owner", "business_record"));
  assert.deepEqual(preview.POST.policy, ws("operator", "settings"));
  assert.deepEqual(setupRequest.POST.policy, ws("operator", "setup_request"));
  assert.deepEqual(search.POST.policy, ws("owner", "lines_search"));
  assert.deepEqual(retry.POST.policy, ws("owner", "lines_retry"));
  assert.deepEqual(forwarding.POST.policy, ws("owner", "lines_forwarding"));
  assert.deepEqual(forwardingTest.POST.policy, ws("owner", "lines_forwarding"));
  assert.deepEqual(connect.POST.policy, ws("owner", "settings"));
});

test("the settings read: the workspace the tab named, with its version and the reader's role; a viewer sees the calendar feed masked and an owner whole; a config the parser refuses is its own state", async () => {
  const feed = "https://calendar.example.com/private/abcdef123456/basic.ics";
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [
      { tenant_id: A, config: { calendar: { ical_url: feed } }, version: 3, updated_at: "2026-09-01T00:00:00Z" },
      { tenant_id: B, config: { calendar: { ical_url: feed } }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_channels: [],
    google_listings: [],
  };
  const harbor = await settings.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual([harbor.version, harbor.role, harbor.configBroken], [3, "viewer", false]);
  assert.deepEqual(
    [harbor.updatedBy, harbor.updatedAt],
    [null, "2026-09-01T00:00:00Z"],
    "a row written before the author was kept says so with null",
  );
  const authored = await settings.GET.run(
    get(inB),
    ctxFor({
      ...tables,
      tenant_config: [{ tenant_id: B, config: {}, version: 1, updated_at: "2026-09-02T00:00:00Z", updated_by: "u7" }],
    }),
  );
  assert.deepEqual(
    [authored.updatedBy, authored.updatedAt],
    ["u7", "2026-09-02T00:00:00Z"],
    "who last changed it rides with the config",
  );
  assert.ok(
    harbor.config.calendar.ical_url.includes("…") && !harbor.config.calendar.ical_url.includes("abcdef123456"),
    "a viewer learns that a feed is set, not its address",
  );
  assert.ok(harbor.facts && harbor.conflicts, "the resolved facts and their disagreements ride along");
  const bayside = await settings.GET.run(get(inB), ctxFor(tables));
  assert.deepEqual([bayside.version, bayside.role, bayside.config.calendar.ical_url], [1, "owner", feed]);
  const broken = {
    ...tables,
    tenant_config: [{ tenant_id: A, config: "nonsense", version: 7, updated_at: "2026-09-01T00:00:00Z" }],
  };
  const out = await settings.GET.run(get(inA), ctxFor(broken));
  assert.deepEqual([out.config, out.version, out.configBroken], [null, 7, true]);
  assert.ok(Array.isArray(out.issues) && out.issues.length > 0);
  await refused(settings.GET.run(get(inA), ctxFor({ ...tables, tenant_config: [] })), "not_found", 404);
});

test("the settings read composes what the receptionist is told, with the inputs the browser could not see -- the autonomy rows, the platform's facts -- and the clock beside it; nothing when no receptionist is configured", async () => {
  const BRAIN = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
  };
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [{ tenant_id: A, config: { brain: BRAIN }, version: 2, updated_at: "2026-09-01T00:00:00Z" }],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_channels: [{ tenant_id: A, kind: "voice", number_e164: "+19295550100", status: "active" }],
    google_listings: [{ tenant_id: A, name: "Harbor Moving", address: "1 Pier St, Brooklyn, NY 11201" }],
    policies: [policy(A, "booking", "ask"), policy(A, "faq", "auto")],
  };
  const out = await settings.GET.run(get(inA), ctxFor(tables));
  const p = out.prompt;
  assert.ok(p, "a configured receptionist has a prompt to show");
  assert.equal(p.tz, "America/New_York");
  assert.ok(
    p.whatsapp.includes("Booking: when someone wants to book, reschedule or cancel, do not send the booking link."),
    "the autonomy row reached the composer",
  );
  assert.ok(p.voice.includes("do not offer the booking link"), "the phone's text is the phone's");
  // The facts the platform holds -- here the provisioned line, which the composer states as the number to call -- reach it.
  const known = {
    workspace: { name: "Harbor", timezone: "America/New_York" },
    channels: tables.tenant_channels.map(({ kind, number_e164, status }) => ({ kind, number_e164, status })),
    listing: { name: "Harbor Moving", address: "1 Pier St, Brooklyn, NY 11201" },
  };
  const pol = { booking: { mode: "ask" }, faq: { mode: "auto" } };
  assert.equal(
    p.whatsapp,
    resolveSystemPrompt(BRAIN, "whatsapp", "America/New_York", new Date(), pol, known),
    "the edge's call with the edge's arguments",
  );
  assert.notEqual(
    p.whatsapp,
    resolveSystemPrompt(BRAIN, "whatsapp", "America/New_York", new Date(), pol, {
      workspace: known.workspace,
      channels: [],
      listing: null,
    }),
    "the platform's own facts changed the prompt, so they reached the composer",
  );
  assert.match(p.now, /^Right now it is .* \(America\/New_York\)\./, "the clock, in the zone, beside it");
  // No receptionist, no prompt: a blank card would claim the receptionist is told nothing.
  const none = await settings.GET.run(
    get(inA),
    ctxFor({
      ...tables,
      tenant_config: [{ tenant_id: A, config: {}, version: 1, updated_at: "2026-09-01T00:00:00Z" }],
    }),
  );
  assert.equal(none.prompt, null);
});

test("F1: the settings read knows the number the business keeps -- publishing it is no conflict while it forwards to the line, and the conflict it is once the line has changed", async () => {
  const BRAIN = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    phone_display: "(718) 555-0142",
    system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const kept = (destination) => ({
    id: L1,
    tenant_id: A,
    e164: "+17185550142",
    kind: "forwarded",
    provider: "carrier",
    area_code: 718,
    voice_state: "answering",
    sms_state: "none",
    whatsapp_state: "none",
    port_state: "none",
    forwarding_state: "verified",
    state_since: "2026-09-20T00:00:00Z",
    created_at: "2026-09-20T00:00:00Z",
    facts: { carrier: "verizon", mode: "unanswered", destination_e164: destination },
  });
  const tables = (destination) => ({
    memberships: both("owner", "owner"),
    tenant_config: [{ tenant_id: A, config: { brain: BRAIN }, version: 2, updated_at: "2026-09-01T00:00:00Z" }],
    tenants: [{ id: A, name: "Harbor Moving", timezone: "America/New_York" }],
    tenant_channels: [{ tenant_id: A, kind: "voice", number_e164: "+19295550100", status: "active" }],
    google_listings: [],
    lines: [kept(destination)],
  });
  const forwarded = await settings.GET.run(get(inA), ctxFor(tables("+19295550100")));
  assert.deepEqual(forwarded.facts.kept_line, { value: "+17185550142", source: "provisioned" });
  assert.deepEqual(forwarded.facts.phone_display, { value: "(718) 555-0142", source: "typed" });
  assert.deepEqual(forwarded.conflicts, [], "customers call the number they know and reach the receptionist");
  const stale = await settings.GET.run(get(inA), ctxFor(tables("+13055550199")));
  assert.deepEqual(
    stale.conflicts.map((c) => [c.fact, c.severity]),
    [["phone_display", "serious"]],
    "forwarding saved against a line since replaced reaches nobody",
  );
});

test("F2: a transfer number that would come straight back is refused at both doors -- the settings write when it changes, and forwarding the transfer number", async () => {
  const BRAIN = (handoff) => ({
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: handoff ? { handoff_number: handoff } : {},
  });
  const tables = (handoff) => ({
    memberships: both("viewer", "owner"),
    tenant_config: [
      { tenant_id: B, config: { brain: BRAIN(handoff) }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
    ],
    tenants: [{ id: B, name: "Harbor Moving", timezone: "America/New_York" }],
    tenant_channels: [{ tenant_id: B, kind: "voice", number_e164: "+19295550100", status: "active" }],
    google_listings: [],
    lines: [
      {
        id: L1,
        tenant_id: B,
        e164: "+17185550142",
        kind: "forwarded",
        provider: "carrier",
        voice_state: "answering",
        forwarding_state: "verified",
        state_since: "2026-09-20T00:00:00Z",
        created_at: "2026-09-20T00:00:00Z",
        facts: { carrier: "verizon", mode: "unanswered", destination_e164: "+19295550100" },
      },
    ],
    events: [],
  });
  // The write: changing the transfer number to the number that forwards here is refused, and nothing is written.
  const t = tables(null);
  const ctx = ctxFor(t);
  await refused(
    settings.PUT.run(send("PUT", { config: { brain: BRAIN("+17185550142") }, version: 1 }, inB), ctx),
    "validation",
    400,
    "come straight back",
  );
  assert.equal(writes(ctx), 0, "nothing written");
  // A cell a person answers saves.
  const saved = await settings.PUT.run(
    send("PUT", { config: { brain: BRAIN("+19175550100") }, version: 1 }, inB),
    ctxFor(t),
  );
  assert.equal(saved.config.brain.profile.handoff_number, "+19175550100");
  // A save of something else keeps a stored number the rule would refuse today: only a changed number is judged.
  const legacy = tables("+19295550100");
  const kept = await settings.PUT.run(
    send(
      "PUT",
      { config: { brain: { ...BRAIN("+19295550100"), business_name: "Harbor Moving Co" } }, version: 1 },
      inB,
    ),
    ctxFor(legacy),
  );
  assert.equal(kept.config.brain.business_name, "Harbor Moving Co");

  // Forwarding: the number the receptionist puts callers through to may not forward to the receptionist.
  const doors = [];
  const rpcs = { line_forwarding_set: (a) => (doors.push(a), L1) };
  await refused(
    forwarding.POST.run(
      send("POST", { number: "+1 (917) 555-0100", carrier: "verizon", mode: "unanswered" }, inB),
      ctxFor(tables("+19175550100"), {}, rpcs),
    ),
    "conflict",
    409,
    "Change the transfer number",
  );
  assert.equal(doors.length, 0, "the forwarding never reached its door");
  assert.deepEqual(
    await forwarding.POST.run(
      send("POST", { number: "+1 (718) 555-0142", carrier: "verizon", mode: "unanswered" }, inB),
      ctxFor(tables("+19175550100"), {}, rpcs),
    ),
    { line_id: L1 },
    "any other number forwards",
  );
});

test("the settings write: the owner's, the workspace named, the body { config, version }, the write schema's refusals named by field, a stale version a conflict, the change on the ledger as fields never values", async () => {
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [{ tenant_id: B, config: {}, version: 1, updated_at: "2026-09-01T00:00:00Z" }],
    events: [],
  };
  await refused(settings.PUT.run(send("PUT", { config: {}, version: 1 }), ctxFor(tables)), "choose_workspace", 400);
  await refused(
    settings.PUT.run(send("PUT", { config: {}, version: 1 }, inA), ctxFor(tables)),
    "forbidden",
    403,
    "Only an owner",
  );
  await refused(
    settings.PUT.run(send("PUT", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Body must be { config, version }.",
  );
  await refused(
    settings.PUT.run(send("PUT", { config: [], version: 1 }, inB), ctxFor(tables)),
    "validation",
    400,
    "Config rejected",
  );
  const stale = ctxFor(tables);
  await refused(
    settings.PUT.run(send("PUT", { config: {}, version: 99 }, inB), stale),
    "conflict",
    409,
    "Someone else saved settings",
  );
  assert.equal(tables.tenant_config[0].version, 1, "a losing race changes nothing");
  const brain = {
    business_name: "Bayside Salon",
    booking_link: "https://book.example/bayside",
    system_prompt: "You are the receptionist for Bayside Salon, answering customers on WhatsApp in a warm, short way.",
    fallbacks: {
      greeting: "Hi! A person will be with you shortly.",
      error: "Sorry, something went wrong. A person will reply soon.",
      non_text: "Thanks! A person will look at that and reply.",
    },
  };
  const saved = await settings.PUT.run(send("PUT", { config: { brain }, version: 1 }, inB), ctxFor(tables));
  assert.equal(saved.version, 2);
  assert.equal(saved.config.brain.business_name, "Bayside Salon");
  assert.deepEqual(
    [tables.tenant_config[0].version, tables.tenant_config[0].updated_by],
    [2, USER],
    "the row records its author",
  );
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.subject_id, e.data.fields, e.data.by, e.data.version]),
    [["settings.changed", B, ["booking_link", "business_name", "fallbacks", "system_prompt"], USER, 2]],
    "the keys that changed, never their values",
  );
  assert.equal(tables.events[0].data.via, undefined, "a form saved: no card mark");
  assert.deepEqual(
    Object.keys(tables.events[0].data).sort(),
    ["by", "fields", "version"],
    "REGRESSION: an audit row never copies the business's own words into a second place",
  );
  // A settings card from the Ask palette: the same route, the same event, marked.
  const fromCard = await settings.PUT.run(
    send("PUT", { config: { brain: { ...brain, business_name: "Bayside Salon & Spa" } }, version: 2 }, inB),
    { ...ctxFor(tables), via: "ask" },
  );
  assert.equal(fromCard.version, 3);
  assert.deepEqual(
    [tables.events[1].kind, tables.events[1].data.fields, tables.events[1].data.via],
    ["settings.changed", ["business_name"], "ask"],
  );
  await refused(
    settings.PUT.run(send("PUT", { config: {}, version: 1 }, inB), ctxFor({ ...tables, tenant_config: [] })),
    "conflict",
    409,
    "no settings record yet",
  );
});

test("a receptionist with no booking link (one that quotes each job) is read as one, prompt and all, so the Business tab can say so; and saved as one", async () => {
  const brain = {
    business_name: "Harbor Moving",
    system_prompt: "You are the receptionist for Harbor Moving, which quotes each move before it is booked.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { address: "12 Pier Rd, Brooklyn" },
  };
  const tables = {
    memberships: both("owner", "owner"),
    tenant_config: [{ tenant_id: A, config: { brain }, version: 4, updated_at: "2026-09-01T00:00:00Z" }],
    tenants: [{ id: A, name: "Harbor Moving", timezone: "America/New_York" }],
    tenant_channels: [],
    google_listings: [],
    events: [],
  };
  const read = await settings.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(
    [read.configBroken, read.config.brain.business_name, read.config.brain.booking_link, read.facts.booking_link.value],
    [false, "Harbor Moving", undefined, null],
    "it was a config the parser refused: the tab showed a broken workspace",
  );
  assert.ok(
    read.prompt.voice.includes("Booking: there is no booking link, so never use send_booking_link."),
    "what the receptionist is told, as the tab shows it",
  );
  // Decision 2's writing half: who is asked for a link is the pages' question, by how customers buy, since the
  // config cannot say; a receptionist without one is read and answered either way (the first run's 3b).
  const saved = await settings.PUT.run(send("PUT", { config: { brain }, version: 4 }, inA), ctxFor(tables));
  assert.equal(saved.version, 5);
  assert.equal(saved.config.brain.booking_link, undefined);
});

test("the autonomy matrix: the workspace's own rows, read by every member; changed by an operator, in the words each refusal has; a delay edit keeps the mode, and limits are merged never replaced; the dial and the day's budget travel the same way", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    policies: [
      policy(A, "reply", "auto"),
      policy(A, "money", "ask"),
      { ...policy(A, "reply", "never"), id: "person", subject_type: "contact", subject_id: "k1" },
      policy(B, "reply", "auto", { max_replies_day: 50, reply_delay_ms: 15000 }),
      policy(B, "booking", "auto"),
    ],
  };
  const harbor = await policies.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(
    harbor.policies.map((p) => p.class),
    ["money", "reply"],
    "the workspace's rows, by class; a person's own row is not the matrix",
  );
  assert.equal(harbor.role, "viewer");
  await refused(policies.PUT.run(send("PUT", { class: "reply", mode: "ask" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    policies.PUT.run(send("PUT", { class: "nope", mode: "ask" }, inB), ctxFor(tables)),
    "validation",
    400,
    "Unknown policy class.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "reply", mode: "loud" }, inB), ctxFor(tables)),
    "validation",
    400,
    "Unknown mode.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", mode: "veto" }, inB), ctxFor(tables)),
    "validation",
    400,
    "Only replies can be held for review",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", mode: "never" }, inB), ctxFor(tables)),
    "validation",
    400,
    'there is no "never"',
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "reply", replyDelayMs: 5 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The reply delay must be between",
  );
  const changed = await policies.PUT.run(
    send("PUT", { class: "reply", mode: "ask", replyDelayMs: 30000 }, inB),
    ctxFor(tables),
  );
  assert.deepEqual(
    [changed.policy.class, changed.policy.mode, changed.policy.limits],
    ["reply", "ask", { max_replies_day: 50, reply_delay_ms: 30000 }],
    "the delay set, the day's cap kept",
  );
  const delayOnly = await policies.PUT.run(send("PUT", { class: "reply", replyDelayMs: 45000 }, inB), ctxFor(tables));
  assert.deepEqual(
    [delayOnly.policy.mode, delayOnly.policy.limits.reply_delay_ms],
    ["ask", 45000],
    "a delay edit carries no mode: the row keeps the one it has",
  );
  // The confidence dial and the day's budget, through the same door: each
  // alone, the mode and the other limits kept, each refusal in its words.
  const dial = await policies.PUT.run(send("PUT", { class: "reply", minConfidence: 0.75 }, inB), ctxFor(tables));
  assert.deepEqual(
    [dial.policy.mode, dial.policy.limits.min_confidence, dial.policy.limits.reply_delay_ms],
    ["ask", 0.75, 45000],
    "the dial set, the mode and the delay kept",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "reply", minConfidence: 2 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The confidence dial is a number from 0 (off) to 1.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", minConfidence: 0.5 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The confidence dial only applies to the reply policy.",
  );
  const budget = await policies.PUT.run(send("PUT", { class: "reply", maxTokensDay: 250000 }, inB), ctxFor(tables));
  assert.deepEqual(
    [budget.policy.mode, budget.policy.limits.max_llm_tokens_day, budget.policy.limits.min_confidence],
    ["ask", 250000, 0.75],
    "the budget set, the dial kept",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "reply", maxTokensDay: 10 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The token budget is a whole number from 1,000 to 5,000,000, or 0 to turn it off.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", maxTokensDay: 1000 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The token budget only applies to the reply policy.",
  );
  const off = await policies.PUT.run(send("PUT", { class: "reply", maxTokensDay: 0 }, inB), ctxFor(tables));
  assert.equal(off.policy.limits.max_llm_tokens_day, 0, "0 is off, and is written as such rather than dropped");
  // Every change is on the events ledger: the class, the mode, the limit keys
  // that moved -- never their values -- and who; a card's commit says so.
  const fromCard = await policies.PUT.run(send("PUT", { class: "reply", mode: "veto" }, inB), {
    ...ctxFor(tables),
    via: "ask",
  });
  assert.equal(fromCard.policy.mode, "veto");
  const ev = tables.events.filter((e) => e.kind === "policy.changed");
  assert.equal(ev.length, 6, "one row per change that landed; none for a refusal");
  assert.deepEqual(
    ev.at(-1).data,
    { class: "reply", mode: "veto", fields: [], by: USER, via: "ask" },
    "a card was tapped, and the row says so",
  );
  assert.deepEqual(
    [ev.at(-2).data.fields, ev.at(-2).data.mode, ev.at(-2).data.via],
    [["max_llm_tokens_day"], "ask", undefined],
    "a dial edit names the key it moved, never the value, and no card",
  );
  assert.ok(ev.every((e) => e.subject_type === "workspace" && e.subject_id === B && !("limits" in e.data)));
});

test("REGRESSION (S6): the reply cap and the pause are the owner's to set, through the same door as the other dials -- the route read neither", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    policies: [policy(B, "reply", "auto", { reply_delay_ms: 15000 }), policy(B, "booking", "auto")],
  };
  const cap = await policies.PUT.run(send("PUT", { class: "reply", maxRepliesDay: 40 }, inB), ctxFor(tables));
  assert.deepEqual(
    [cap.policy.mode, cap.policy.limits.max_replies_day, cap.policy.limits.reply_delay_ms],
    ["auto", 40, 15000],
    "REGRESSION: the cap was not set; the mode and the delay are kept",
  );
  const pause = await policies.PUT.run(send("PUT", { class: "reply", pauseHours: 4 }, inB), ctxFor(tables));
  assert.deepEqual(
    [pause.policy.limits.pause_hours, pause.policy.limits.max_replies_day],
    [4, 40],
    "the pause set, the cap kept",
  );
  for (const bad of [0, 2.5, 201, "many"]) {
    await refused(
      policies.PUT.run(send("PUT", { class: "reply", maxRepliesDay: bad }, inB), ctxFor(tables)),
      "validation",
      400,
      "The reply cap is a whole number from 1 to 200.",
    );
  }
  for (const bad of [0, 1.5, 169]) {
    await refused(
      policies.PUT.run(send("PUT", { class: "reply", pauseHours: bad }, inB), ctxFor(tables)),
      "validation",
      400,
      "The pause is a whole number of hours from 1 to 168.",
    );
  }
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", maxRepliesDay: 40 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The reply cap only applies to the reply policy.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "booking", pauseHours: 4 }, inB), ctxFor(tables)),
    "validation",
    400,
    "The pause only applies to the reply policy.",
  );
  await refused(
    policies.PUT.run(send("PUT", { class: "reply", pauseHours: 4 }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  const ev = tables.events.filter((e) => e.kind === "policy.changed");
  assert.deepEqual(
    ev.map((e) => e.data.fields),
    [["max_replies_day"], ["pause_hours"]],
    "each change names the key it moved, never the value",
  );
});

test("the business record: read by every member, nothing on file is null not a blank form; written by the owner, refused in the owner's words before anything leaves for the carriers", async () => {
  const tables = { memberships: both("operator", "owner"), business_records: [] };
  assert.deepEqual(await record.GET.run(get(inA), ctxFor(tables)), { record: null, path: null, problems: {} });
  const onFile = {
    ...tables,
    business_records: [
      { tenant_id: B, created_at: "2026-09-01T00:00:00Z", legal_name: "Bayside LLC", tax_id: "12-3456789" },
    ],
  };
  const out = await record.GET.run(get(inB), ctxFor(onFile));
  assert.equal(out.record.legal_name, "Bayside LLC");
  assert.ok(!("tenant_id" in out.record) && !("created_at" in out.record), "the row's plumbing stays behind");
  assert.ok(typeof out.path === "string" && typeof out.problems === "object");
  await refused(
    record.PUT.run(send("PUT", { record: {}, path: "standard" }, inA), ctxFor(tables)),
    "forbidden",
    403,
    "Only an owner",
  );
  await refused(
    record.PUT.run(send("PUT", { record: {}, path: "nope" }, inB), ctxFor(tables)),
    "validation",
    400,
    "That is not a registration we file.",
  );
  const missing = ctxFor(tables);
  await refused(record.PUT.run(send("PUT", { record: {}, path: "standard" }, inB), missing), "validation", 400);
  assert.equal(writes(missing), 0);
});

test("the calendar: a read of the workspace's week, counted with the aggregates; a preview is refused for a blank or a private address before anything is fetched", async () => {
  const tables = { memberships: both("viewer", "operator"), tenants: [], tenant_config: [] };
  const week = await calendar.GET.run(get(`?days=3&workspace=${A}&workspace=${A}`), ctxFor(tables));
  assert.ok(
    week.calendar && typeof week.calendar === "object",
    "the week as the receptionist reads it, even with no feed",
  );
  await refused(
    preview.POST.run(send("POST", { url: "https://calendar.example.com/x.ics" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    preview.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Paste the calendar's iCal address first.",
  );
  await refused(
    preview.POST.run(send("POST", { url: "http://127.0.0.1/cal.ics" }, inB), ctxFor(tables)),
    "validation",
    400,
    "full https:// or webcal:// address on the internet",
  );
  // The guard itself, on every shape it decides: the feed address is fetched
  // by our server, so an address inside our network is the one thing it must
  // never be handed.
  assert.equal(
    feedUrlOk("webcal://calendar.google.com/calendar/ical/x/basic.ics"),
    "https://calendar.google.com/calendar/ical/x/basic.ics",
    "webcal is https in a hat",
  );
  assert.equal(feedUrlOk("  https://cal.example.com/feed.ics  "), "https://cal.example.com/feed.ics");
  assert.equal(
    feedUrlOk("http://cal.example.com/feed.ics"),
    "http://cal.example.com/feed.ics",
    "plain http on the internet is allowed: some providers still serve it",
  );
  for (const bad of [
    "",
    "not a url",
    "ftp://cal.example.com/f.ics",
    "file:///etc/passwd",
    "https://localhost/x.ics",
    "https://127.0.0.1/x.ics",
    "https://10.0.0.5/x.ics",
    "https://192.168.1.9/x.ics",
    "https://172.16.0.1/x.ics",
    "https://172.31.255.1/x.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/x",
    "https://[::1]/x.ics",
    "https://db.internal/x.ics",
    "https://printer.local/x.ics",
  ]) {
    assert.equal(feedUrlOk(bad), null, `refused: ${JSON.stringify(bad)}`);
  }
  assert.equal(
    feedUrlOk("https://172.32.0.1/x.ics"),
    "https://172.32.0.1/x.ics",
    "172.32 is outside the private block",
  );
});

test("a setup request: an operator's, one thing it can ask for, recorded through the door, and the platform told only on this machine's terms", async () => {
  const asked = [];
  const rpcs = {
    setup_request: (a) => {
      asked.push(a);
      return { already: asked.length > 1, id: "r1" };
    },
  };
  const tables = { memberships: both("viewer", "operator") };
  await refused(setupRequest.POST.run(send("POST", { what: "line" }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(
    setupRequest.POST.run(send("POST", { what: "unicorn" }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Say what you are asking for.",
  );
  await refused(
    setupRequest.POST.run(send("POST", {}, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Say what you are asking for.",
  );
  assert.equal(asked.length, 0);
  const first = await setupRequest.POST.run(send("POST", { what: "line" }, inB), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    first,
    { request: { already: false, id: "r1" }, told: false },
    "not production: the mailbox is not reached, and the answer says so",
  );
  assert.deepEqual(asked, [{ p_tenant_id: B, p_what: "line" }]);
  const again = await setupRequest.POST.run(send("POST", { what: "line" }, inB), ctxFor(tables, {}, rpcs));
  assert.equal(again.told, false, "a repeat is never told twice");
});

test("REGRESSION (S8, S14): a port and a repair are asked for through the same door, each by name -- the door knew only a line", async () => {
  const asked = [];
  const rpcs = {
    setup_request: (a) => {
      asked.push(a);
      return { already: false, id: "r1" };
    },
  };
  const tables = { memberships: both("viewer", "operator") };
  for (const what of ["port", "repair", "forwarding"]) {
    const r = await setupRequest.POST.run(send("POST", { what }, inB), ctxFor(tables, {}, rpcs));
    assert.equal(r.told, false, "not production: the mailbox is not reached");
  }
  assert.deepEqual(
    asked,
    [
      { p_tenant_id: B, p_what: "port" },
      { p_tenant_id: B, p_what: "repair" },
      { p_tenant_id: B, p_what: "forwarding" },
    ],
    "REGRESSION: refused before the database was asked",
  );
  await refused(
    setupRequest.POST.run(send("POST", { what: "unicorn" }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Say what you are asking for.",
  );
});

test("lines: searching, retrying and forwarding are the owner's; each body is judged in its words; the forwarding doors get the normalized number", async () => {
  const doors = [];
  const rpcs = {
    line_forwarding_set: (a) => {
      doors.push(["set", a]);
      return L1;
    },
    line_forwarding_test: (a) => {
      doors.push(["test", a]);
      return { ok: true, until: "2026-09-11T10:30:00Z" };
    },
  };
  const tables = { memberships: both("operator", "owner") };
  await refused(
    search.POST.run(send("POST", { area_code: 305 }, inA), ctxFor(tables, {}, rpcs)),
    "forbidden",
    403,
    "Only an owner",
  );
  await refused(
    search.POST.run(send("POST", { area_code: "30" }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Give a three-digit area code",
  );
  await refused(
    search.POST.run(send("POST", { area_code: 305 }, inB), ctxFor(tables, {}, rpcs)),
    "internal",
    502,
    "no_edge_credential",
  );
  await refused(retry.POST.run(send("POST", { line_id: L1 }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(
    retry.POST.run(send("POST", { line_id: "x" }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Which line?",
  );
  await refused(
    forwarding.POST.run(
      send("POST", { number: "+1 305 555 0100", carrier: "verizon", mode: "always" }, inA),
      ctxFor(tables, {}, rpcs),
    ),
    "forbidden",
    403,
  );
  await refused(
    forwarding.POST.run(send("POST", {}, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Give the number you keep",
  );
  await refused(
    forwarding.POST.run(
      send("POST", { number: "+1 305 555 0100", carrier: "sprint", mode: "always" }, inB),
      ctxFor(tables, {}, rpcs),
    ),
    "validation",
    400,
    "Pick your carrier.",
  );
  await refused(
    forwarding.POST.run(
      send("POST", { number: "+1 305 555 0100", carrier: "verizon", mode: "sometimes" }, inB),
      ctxFor(tables, {}, rpcs),
    ),
    "validation",
    400,
    "Pick which calls to forward.",
  );
  assert.equal(doors.length, 0);
  assert.deepEqual(
    await forwarding.POST.run(
      send("POST", { number: "+1 (305) 555-0100", carrier: "verizon", mode: "unanswered" }, inB),
      ctxFor(tables, {}, rpcs),
    ),
    { line_id: L1 },
  );
  await refused(
    forwardingTest.POST.run(send("POST", { line_id: L1 }, inA), ctxFor(tables, {}, rpcs)),
    "forbidden",
    403,
  );
  await refused(
    forwardingTest.POST.run(send("POST", { line_id: "x" }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Which line?",
  );
  assert.deepEqual(await forwardingTest.POST.run(send("POST", { line_id: L1 }, inB), ctxFor(tables, {}, rpcs)), {
    test: { ok: true, until: "2026-09-11T10:30:00Z" },
  });
  assert.deepEqual(doors, [
    [
      "set",
      { p_tenant_id: B, p_number: "+13055550100", p_carrier: "verizon", p_mode: "unanswered", p_test_from: null },
    ],
    ["test", { p_tenant_id: B, p_line_id: L1 }],
  ]);
});

test("connecting a WhatsApp number: the owner's, the sign-up ids validated at the door, and on this machine the exchange stops at the production guard with nothing on the ledger", async () => {
  const tables = { memberships: both("operator", "owner"), decisions: [] };
  const signup = { code: "AQD-sign-up-code", phone_number_id: "123456789012", waba_id: "987654321098" };
  await refused(connect.POST.run(send("POST", signup, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(
    connect.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "The sign-up code is missing.",
  );
  await refused(
    connect.POST.run(send("POST", { ...signup, waba_id: "x" }, inB), ctxFor(tables)),
    "validation",
    400,
    "did not hand back a number and an account",
  );
  const guard = ctxFor(tables);
  await refused(
    connect.POST.run(send("POST", signup, inB), guard),
    "upstream_meta",
    502,
    "Connecting only works on the production dashboard.",
  );
  assert.equal(writes(guard), 0);
  assert.equal(tables.decisions.length, 0);
});
