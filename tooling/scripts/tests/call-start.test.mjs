/**
 * The voice door, executed.
 *
 * What the phone receptionist is handed at the top of a call -- whose facts,
 * whose memory, the greeting with the business's name, the line a transfer
 * dials -- was held by ten source scans across eight files, and nothing had
 * ever run it. What decides those is `planCallStart`, and it runs here for
 * real over a database in memory: the actual channel resolution, the actual
 * runtime loader with its stamp, the actual memory read with its history
 * rules. Only the calendar is handed in, because it is the one read that
 * leaves the database.
 *
 * What is asserted is what Retell and the platform would see: the four
 * variables, byte for byte where a composer is involved, and whether the
 * platform is paged -- or, for a database that merely did not answer, that it
 * is not.
 *
 * EVERY CASE USES ITS OWN AGENT AND WORKSPACE. The channel resolver caches a
 * routing answer for five minutes and the runtime loader caches a workspace
 * for ten, both in module state; two cases sharing either would have the
 * second read the first's answer instead of the database, and pass while
 * proving nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  pausedGreetingFor,
  resolveSystemPrompt,
  describeNow,
  pausedVoiceFacts,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import {
  FACTS_UNAVAILABLE,
  CALLER_UNKNOWN,
  GREETING_DEFAULT,
  greetingFor,
  desiredVoiceShell,
} from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { planCallStart } = await import(at("apps/edge/lib/voice/call-start.ts"));

const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const CALLER = "+16465550123";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const OPENINGS = "Open times (from the calendar):\n- Tue Sep 15: 9:00 AM–12:00 PM";
const VISITS = "Their appointments: Tue Sep 15, 10:00 AM — Silk press.";

const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, handoff_number: "+13055550199" },
};
/** The brain as the runtime holds it: parsed, so the composer sees the same object here and there. */
const PARSED = parseTenantConfigResult({ brain: BRAIN });
assert.ok(PARSED.ok, `the fixture must parse: ${PARSED.ok ? "" : PARSED.issues.join("; ")}`);
const brain = PARSED.config.brain;

/** An agent and a workspace nobody else in this file uses, so neither cache can answer for us. */
let seq = 0;
const fresh = () => {
  seq += 1;
  return { agent: `agent_call_${seq}`, tenant: `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}` };
};

const voiceChannel = (w, over = {}) => ({
  id: `ch-${w.agent}`,
  tenant_id: w.tenant,
  kind: "voice",
  external_id: w.agent,
  number_e164: "+13055550100",
  credentials_ref: null,
  config: {},
  status: "active",
  ...over,
});
const contact = (w) => ({
  id: P1,
  tenant_id: w.tenant,
  phone_e164: CALLER,
  display_name: "Rosa",
  wa_profile_name: null,
  last_seen_at: ago(3600_000),
  consent: "opted_in",
  dnc: false,
  notes: null,
  email: null,
  erased_at: null,
});
const conversation = (w) => ({ id: C1, tenant_id: w.tenant, contact_id: P1 });
const history = (w) => [
  {
    id: "m1",
    tenant_id: w.tenant,
    conversation_id: C1,
    body: "Are you open Saturday?",
    sender: "customer",
    direction: "inbound",
    type: "text",
    status: "received",
    created_at: ago(7200_000),
    channel_ts: ago(7200_000),
    meta: null,
  },
  {
    id: "m2",
    tenant_id: w.tenant,
    conversation_id: C1,
    body: "Yes, 9 to 5.",
    sender: "ai",
    direction: "outbound",
    type: "text",
    status: "sent",
    created_at: ago(7000_000),
    channel_ts: ago(7000_000),
    meta: null,
  },
];

/** The world as it is when everything is in order, unless a case says otherwise. */
function world(w, { config = { brain: BRAIN }, status = "active", channels = [voiceChannel(w)], faults = {} } = {}) {
  return fakeDb(
    {
      tenant_channels: channels,
      tenant_config: [{ tenant_id: w.tenant, config }],
      policies: [],
      tenants: [{ id: w.tenant, name: "Harbor", timezone: TZ, status }],
      google_listings: [],
      contacts: [contact(w)],
      conversations: [conversation(w)],
      messages: history(w),
    },
    faults,
    { runtime_stamp: () => "stamp-1" },
  );
}

/** The calendar as a port that remembers what it was asked. */
function calendar({ openings = null, visits = null } = {}) {
  const asked = { openings: [], visits: [] };
  return {
    asked,
    port: {
      openings: async (rt, now) => {
        asked.openings.push({ tenant: rt.tenantId, now });
        return openings;
      },
      visits: async (rt, who, now) => {
        asked.visits.push({ tenant: rt.tenantId, who, now });
        return visits;
      },
    },
  };
}

/** What the runtime knows for this workspace, as the loader builds it from these rows. */
const knownOf = (w, channels = [voiceChannel(w)]) => ({
  workspace: { name: "Harbor", timezone: TZ },
  channels,
  listing: null,
});
/** The facts as the text receptionist's composer writes them, on the one clock, with the openings after the day. */
const factsOf = (w, openings) =>
  `${resolveSystemPrompt(brain, "voice", TZ, NOW, {}, knownOf(w))}\n\n${describeNow(TZ, NOW, brain.profile?.closures)}${openings ? `\n\n${openings}` : ""}`;

test("a routed call: the facts are the workspace's own composition with the clock and the openings, the memory is the caller's own, the greeting names the business, and the transfer line rides along", async () => {
  const w = fresh();
  const cal = calendar({ openings: OPENINGS, visits: VISITS });
  const r = await planCallStart({ agentId: w.agent, from: "+16465550123", db: world(w), now: NOW, calendar: cal.port });
  assert.deepEqual([r.facts, r.memory, r.alert, r.error], ["composed", "known", false, null]);
  assert.equal(
    r.variables.business_facts,
    factsOf(w, OPENINGS),
    "the same composer the text receptionist uses, byte for byte, on one clock",
  );
  assert.equal(r.variables.greeting, greetingFor("Harbor Moving"));
  assert.ok(
    r.variables.greeting.includes("Harbor Moving") &&
      r.variables.greeting.includes("may be recorded") &&
      r.variables.greeting.includes("automated assistant"),
  );
  assert.equal(r.variables.handoff_number, "+13055550199");
  assert.deepEqual(
    r.variables.caller_context.split("\n"),
    [
      "Name on record: Rosa. No email address on file. Returning contact. Last in touch today.",
      VISITS,
      "Recent interactions on this number (calls and messages):",
      "Customer: Are you open Saturday?",
      "Business: Yes, 9 to 5.",
    ],
    "who they are, when they are booked, and what was said -- in the order it happened",
  );
  assert.deepEqual(
    cal.asked.visits.map((c) => c.who),
    [{ phone: CALLER, name: "Rosa" }],
    "asked about who they are, on the number they called from",
  );
  assert.deepEqual(cal.asked.openings, [{ tenant: w.tenant, now: NOW }], "the openings on the same clock as the day");
  assert.deepEqual(
    Object.keys(r.variables),
    ["caller_context", "business_facts", "handoff_number", "greeting"],
    "the four variables the shell's prompt reads, and nothing else",
  );
});

test("no caller ID: the facts are owed to every call, and the memory is nobody's", async () => {
  const w = fresh();
  const cal = calendar({ openings: OPENINGS, visits: VISITS });
  const r = await planCallStart({ agentId: w.agent, from: "", db: world(w), now: NOW, calendar: cal.port });
  assert.deepEqual([r.facts, r.memory, r.alert, r.error], ["composed", "none", false, null]);
  assert.equal(
    r.variables.business_facts,
    factsOf(w, OPENINGS),
    "REGRESSION: the whole lookup once sat inside `if (from)`",
  );
  assert.equal(r.variables.caller_context, CALLER_UNKNOWN);
  assert.equal(cal.asked.visits.length, 0, "nobody to look up");
});

test("a number nobody has on file is told as new, in the words the text receptionist uses for the same person", async () => {
  const w = fresh();
  const r = await planCallStart({
    agentId: w.agent,
    from: "+16465550999",
    db: world(w),
    now: NOW,
    calendar: calendar().port,
  });
  assert.deepEqual([r.facts, r.memory, r.error], ["composed", "new", null]);
  assert.equal(r.variables.caller_context, "New contact — no prior history on record.");
});

test("billing stopped: the take-a-message script replaces the prompt and nothing is added to it, and the calendar is not read for it", async () => {
  const w = fresh();
  const cal = calendar({ openings: OPENINGS });
  const r = await planCallStart({
    agentId: w.agent,
    from: CALLER,
    db: world(w, { status: "paused" }),
    now: NOW,
    calendar: cal.port,
  });
  assert.deepEqual([r.facts, r.memory, r.alert, r.error], ["paused", "known", false, null]);
  assert.equal(r.variables.business_facts, pausedVoiceFacts("Harbor Moving"));
  assert.equal(cal.asked.openings.length, 0, "no open times are offered by a receptionist that cannot book");
  assert.equal(
    r.variables.greeting,
    pausedGreetingFor("Harbor Moving"),
    "the business is still named at the door, and the caller hears first that it only takes a message today",
  );
  assert.equal(
    "handoff_number" in r.variables,
    false,
    "nobody is put through while paused: the transfer tool has no number to dial",
  );
});

test("an agent nobody routes: no facts, no memory, a greeting that names nobody, the platform told -- and not one row of any workspace read", async () => {
  const w = fresh();
  const cal = calendar({ openings: OPENINGS, visits: VISITS });
  const db = world(w, { channels: [voiceChannel(w, { status: "disabled" })] });
  const r = await planCallStart({ agentId: w.agent, from: CALLER, db, now: NOW, calendar: cal.port });
  assert.deepEqual([r.facts, r.memory, r.alert, r.error], ["unrouted", "none", true, null]);
  assert.deepEqual(
    r.variables,
    { caller_context: CALLER_UNKNOWN, business_facts: FACTS_UNAVAILABLE, greeting: GREETING_DEFAULT },
    "exactly what the shell would have said on its own, and no handoff key at all",
  );
  assert.deepEqual(
    db.seen.filter((s) => s.op === "select").map((s) => s.table),
    ["tenant_channels"],
    "the routing answer, and nothing about anyone's memory or facts",
  );
  assert.equal(cal.asked.openings.length + cal.asked.visits.length, 0);
});

test("a call with no agent on it is unrouted too, and the platform is told", async () => {
  const w = fresh();
  const r = await planCallStart({
    agentId: undefined,
    from: CALLER,
    db: world(w),
    now: NOW,
    calendar: calendar().port,
  });
  assert.deepEqual([r.facts, r.memory, r.alert], ["unrouted", "none", true]);
});

test("the database did not answer about the channel: unreadable, not switched off, so nobody is paged for a blip", async () => {
  const w = fresh();
  const db = world(w, { faults: { "tenant_channels.select": { message: "connection reset" } } });
  const r = await planCallStart({ agentId: w.agent, from: CALLER, db, now: NOW, calendar: calendar().port });
  assert.deepEqual([r.facts, r.memory, r.alert], ["unreadable", "none", false]);
  assert.match(r.error, /could not be looked up/);
  assert.equal(r.variables.business_facts, FACTS_UNAVAILABLE);
});

test("no database at all: unreadable, and nobody is paged for a deployment that persists nothing", async () => {
  const r = await planCallStart({
    agentId: "agent_without_a_database",
    from: CALLER,
    db: null,
    now: NOW,
    calendar: calendar().port,
  });
  assert.deepEqual([r.facts, r.memory, r.alert], ["unreadable", "none", false]);
  assert.match(r.error, /no database/);
  assert.deepEqual(r.variables, {
    caller_context: CALLER_UNKNOWN,
    business_facts: FACTS_UNAVAILABLE,
    greeting: GREETING_DEFAULT,
  });
});

test("REGRESSION: a contact table that will not answer costs the caller their recognition, not the business its hours", async () => {
  // Joined in one Promise.all, the memory's failure used to reject both reads
  // and the agent answered with no facts over a table it never needed.
  const w = fresh();
  const cal = calendar({ openings: OPENINGS });
  const db = world(w, { faults: { "contacts.select": { message: "permission denied" } } });
  const r = await planCallStart({ agentId: w.agent, from: CALLER, db, now: NOW, calendar: cal.port });
  assert.deepEqual([r.facts, r.memory, r.alert], ["composed", "unread", false]);
  assert.match(r.error, /readLeadContext\/contact: permission denied/);
  assert.equal(r.variables.business_facts, factsOf(w, OPENINGS), "the facts were read beside it and are kept");
  assert.equal(r.variables.caller_context, CALLER_UNKNOWN);
});

test("routed and read, and no persona: told there are no facts rather than told nothing; a config that does not parse says so", async () => {
  const a = fresh();
  const none = await planCallStart({
    agentId: a.agent,
    from: CALLER,
    db: world(a, { config: {} }),
    now: NOW,
    calendar: calendar().port,
  });
  assert.deepEqual([none.facts, none.memory, none.alert, none.error], ["missing", "known", false, null]);
  assert.equal(none.variables.business_facts, FACTS_UNAVAILABLE);
  assert.equal(none.variables.greeting, GREETING_DEFAULT, "no name to greet with");
  assert.ok(!("handoff_number" in none.variables), "no line to dial, and not an empty one either");
  const b = fresh();
  const broken = await planCallStart({
    agentId: b.agent,
    from: CALLER,
    db: world(b, { config: { brain: { business_name: "" } } }),
    now: NOW,
    calendar: calendar().port,
  });
  assert.deepEqual([broken.facts, broken.error], ["missing", "the workspace's config does not parse"]);
  assert.equal(broken.variables.business_facts, FACTS_UNAVAILABLE);
});

test("a throw after the facts were composed keeps them: the caller gets what was read, and the log gets the error", async () => {
  const w = fresh();
  const port = {
    openings: async () => OPENINGS,
    visits: async () => {
      throw new Error("feed exploded");
    },
  };
  const r = await planCallStart({ agentId: w.agent, from: CALLER, db: world(w), now: NOW, calendar: port });
  assert.deepEqual([r.facts, r.memory, r.error], ["composed", "none", "feed exploded"]);
  assert.equal(r.variables.business_facts, factsOf(w, OPENINGS));
  assert.equal(r.variables.caller_context, CALLER_UNKNOWN, "half a memory is told as none");
});

test("the shell's defaults are the judgement's fallbacks, one constant each: a call it cannot place is told exactly what the shell says on its own", () => {
  assert.deepEqual(desiredVoiceShell().default_dynamic_variables, {
    business_facts: FACTS_UNAVAILABLE,
    caller_context: CALLER_UNKNOWN,
    greeting: GREETING_DEFAULT,
    handoff_number: "",
  });
  assert.equal(GREETING_DEFAULT, greetingFor(null), "one sentence, one home");
  assert.ok(FACTS_UNAVAILABLE.length > 80, "a terse fallback is one the agent will talk over");
  assert.match(FACTS_UNAVAILABLE, /do not state/i, "it must forbid inventing the facts it lacks");
  for (const g of [greetingFor("Aurora Nails"), greetingFor(null)]) {
    assert.ok(
      g.includes("may be recorded") && g.includes("automated assistant"),
      "both disclosures are the product's promises, not a dashboard setting",
    );
  }
  assert.ok(greetingFor("Aurora Nails").includes("Aurora Nails"));
  assert.ok(!/\{\{|\bnull\b|undefined/.test(greetingFor(null)), "no placeholder or stray value is read aloud");
});
