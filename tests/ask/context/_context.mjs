/**
 * The world the tests of context/ share. Split by behaviour from ask-context.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The page context, built on the server (the Phase 2 plan, PR 2.2, Task 8): what the tab says is on screen, read
 * again through each page's own readers under the person's workspace, one `search_result` block for the page's
 * aggregate and one per row, in the page's words; a row another workspace holds is absent and nothing names it; the
 * caps (D11); the per-instance minute the warm keeps a build for (D7); and the shape of the workspace as one block
 * (D9). Executed over the database in memory: every query the build makes is in `ctx.supabase.seen`.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { buildContext, clearContextCache, shapeBlock, CONTEXT_TTL_MS } = await import(
  at("apps/dashboard/src/server/ask/context.ts")
);

export const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

export const { shape } = await import(at("apps/dashboard/src/server/readers/shape.ts"));

export const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));

beforeEach(() => {
  readerCache.clear();
  clearContextCache();
});

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

export const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

export const CB = "cccccccc-cccc-4ccc-8ccc-cccccccccccb";

export const P1 = "abababab-abab-4aba-8aba-abababababa1";

export const P2 = "abababab-abab-4aba-8aba-abababababa2";

export const PB = "abababab-abab-4aba-8aba-ababababababb";

export const K1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

export const KB = "dddddddd-dddd-4ddd-8ddd-dddddddddddb";

export const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

export const USER = "u1";

export const TZ = "America/New_York";

/** A Monday at 10:00 in New York. */
export const NOW = new Date("2026-09-14T14:00:00Z");

export const iso = (ms) => new Date(ms).toISOString();

export const HOUR = 3600_000;

export const contactOf = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
});

export const conversation = (id, tenant_id, contact_id, name, over = {}) => ({
  id,
  tenant_id,
  contact_id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: iso(NOW.getTime() - HOUR),
  last_message_at: iso(NOW.getTime() - HOUR),
  contacts: contactOf(contact_id, name),
  ...over,
});

export const message = (id, conversation_id, tenant_id, body) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "client",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "delivered",
  created_at: iso(NOW.getTime() - HOUR),
  channel_ts: iso(NOW.getTime() - HOUR),
  channel: "whatsapp",
});

export const call = (id, tenant_id, name, over = {}) => ({
  id,
  tenant_id,
  retell_call_id: `r-${id}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+15555550199",
  started_at: iso(NOW.getTime() - 2 * HOUR),
  ended_at: iso(NOW.getTime() - 2 * HOUR + 200_000),
  duration_ms: 200_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about Saturday.",
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: name,
  transcript_object: [],
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: null,
  ...over,
});

/** A People row as people_list answers it. */
export const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: iso(NOW.getTime() - 60 * 24 * HOUR),
  last_message_at: iso(NOW.getTime() - 3 * HOUR),
  last_inbound_at: iso(NOW.getTime() - 3 * HOUR),
  latest_conversation_id: null,
  conversation_count: 1,
  ...over,
});

/** metrics_summary as 00037_hygiene.sql returns it: a calm day with one message and one call. */
export const METRICS = {
  workspace: { name: "Harbor", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+15555550199" }],
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 1,
    oldest_open_escalation_at: null,
    threads_needing_human: 1,
    threads_snoozed: 0,
    threads_awaiting_reply: 1,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 3,
    messages_out_ai: 1,
    messages_out_you: 0,
    conversations_active: 2,
    answered_by_ai: 1,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 1,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 200,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

/** A receptionist's configuration the parser takes, with `over` in its brain. */
export const brain = (over = {}) => ({
  business_name: "Harbor",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  ...over,
});

export const COUNTS = { all: 3, ready: 2, nurture: 1, converted: 0, said_no: 0, not_a_fit: 0 };

/** Harbor (A) and Bayside (B): a thread, a call and a person each, and harbor's second thread handed to a person. */
export function tables(over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        user_id: USER,
        tenant_id: B,
        role: "operator",
        tenants: { slug: "bayside" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenants: [
      { id: A, name: "Harbor", timezone: TZ },
      { id: B, name: "Bayside", timezone: "Europe/Madrid" },
    ],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    conversations: [
      conversation(C1, A, P1, "Rosa"),
      conversation(C2, A, P2, "Quinn", { last_message_at: iso(NOW.getTime() - 5 * HOUR) }),
      conversation(CB, B, PB, "Bruno"),
    ],
    messages: [
      message("m1", C1, A, "Are you open Saturday?"),
      message("m2", C2, A, "Can I talk to someone?"),
      message("m3", CB, B, "Hola"),
    ],
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C2,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 2 * HOUR),
      },
    ],
    calls: [
      call(K1, A, "Rosa", {
        contact_id: P1,
        contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" },
      }),
      call(KB, B, "Bruno", { contacts: { display_name: "Bruno", wa_profile_name: null, phone_e164: "+15555550101" } }),
    ],
    contacts: [],
    templates: [],
    segments: [],
    segment_members: [],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
    ...over,
  };
}

export const RPCS = {
  metrics_summary: () => METRICS,
  people_list: (a) =>
    (a.p_tenant_id === A ? [personRow(P1, "Rosa"), personRow(P2, "Quinn")] : [personRow(PB, "Bruno")]).slice(
      a.p_offset ?? 0,
      (a.p_offset ?? 0) + (a.p_limit ?? 1000),
    ),
  lead_list_counts: () => COUNTS,
};

export const ctxFor = (t = tables(), rpcs = RPCS) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** A warm's reader context in harbor, on the fixture's clock. */
export const rcIn = (ctx, tenantId = A, opts = { keep: true }) =>
  readerContext(ctx, { tenantId, role: "operator" }, NOW, opts);

/** A page context as the tab sends it. */
export const page = (surface, rows, over = {}) => ({
  v: 1,
  surface,
  route: surface,
  view: null,
  focus: null,
  rows,
  asked_at: 1,
  ...over,
});

/** A block's text as the provider wrote it: what the model reads is that text inside a fence (contracts ai/fence.ts). */
export const textOf = (b) => {
  const sent = b.content[0].text;
  assert.ok(sent.startsWith("<record>\n") && sent.endsWith("\n</record>"), `fenced: ${sent.slice(0, 40)}`);
  return sent.slice("<record>\n".length, -"\n</record>".length);
};

/** What was logged while `fn` ran, every level. */
export async function logs(fn) {
  const lines = [];
  const was = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  console.error = console.warn = console.log = console.info = (...a) => lines.push(a.map(String).join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, was);
  }
}

/* ------------------------------------------------------------------ the shape */

export const shapeTables = (over = {}) =>
  tables({
    tenant_config: [{ tenant_id: A, config: { brain: brain() }, version: 1 }],
    tenant_channels: [
      { tenant_id: A, kind: "whatsapp", status: "active", number_e164: "+15555550199" },
      { tenant_id: A, kind: "sms", status: "pending", number_e164: "+15555550198" },
    ],
    segments: [
      { id: "s2", tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      { id: "s1", tenant_id: A, name: "Brides", rule: null, archived_at: "2026-09-01T00:00:00Z" },
    ],
    playbooks: [
      {
        id: "pb2",
        tenant_id: A,
        kind: "moment",
        name: "Win-back",
        trigger: "quiet_30",
        state: "running",
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "pb1",
        tenant_id: A,
        kind: "moment",
        name: "Reminder",
        trigger: "visit_tomorrow",
        state: "paused",
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
    ...over,
  });
