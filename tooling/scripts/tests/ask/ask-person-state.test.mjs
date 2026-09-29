/**
 * Where a person stands has one rule, the People row's (contracts personStateFor), and Ask says it: people.search and
 * people.get each answer the state the People row draws for the member asking, for a table of made-up people in each
 * of the seven states and on a thread a teammate holds. Run over the database in memory, through Ask's own tools.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PERSON_STATE_LABELS, personStateFor, toPersonRowVM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { ROW_NOW, ROW_TZ, daysAgo, personDto } from "../_person-row.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** The member asking, and a teammate. */
const ME = "u1";
const TEAMMATE = "u2";
const NOW = new Date(ROW_NOW);
const LATER = new Date(ROW_NOW + 6 * 3_600_000).toISOString();

/** A thread flagged for a person, with the receptionist paused on it. */
const flagged = (assignee) => ({
  needs_human: true,
  latest_state: "needs_human",
  latest_paused_until: LATER,
  latest_assignee_user_id: assignee,
});

/** Made-up people, one per state, and the state the People row gives each. */
const PEOPLE = [
  ["asked for a person, nobody has it", "Needs you", { ...flagged(null), open_escalation_reason: "asked_for_human" }],
  ["held by the member asking, and they wrote last", "Waiting on you", flagged(ME)],
  ["held by a teammate", "Active", flagged(TEAMMATE)],
  ["new this week", "New", { first_contact_at: daysAgo(2), earliest_row_at: daysAgo(2), last_inbound_at: daysAgo(2) }],
  ["quiet for forty days", "Quiet", { last_inbound_at: daysAgo(40), last_message_at: daysAgo(40) }],
  ["opted out", "Opted out", { consent: "opted_out" }],
  [
    "never heard from",
    "Not heard from",
    { last_inbound_at: null, last_message_direction: "outbound", last_message_sender: "human" },
  ],
  ["active", "Active", {}],
].map(([who, label, over], i) => {
  const n = String(i + 1).padStart(2, "0");
  const id = `abababab-abab-4aba-8aba-0000000000${n}`;
  const conv = `cccccccc-cccc-4ccc-8ccc-0000000000${n}`;
  const name = `Person ${n}`;
  return {
    who,
    label,
    row: personDto({
      id,
      display_name: name,
      phone_e164: `+1305555010${i}`,
      latest_conversation_id: conv,
      ...over,
    }),
  };
});

/** The workspace: its config, the people as contacts, and each person's one thread as the row says it. */
function world() {
  const tables = {
    memberships: [
      { user_id: ME, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: ROW_TZ }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving",
            system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
          },
        },
        version: 1,
      },
    ],
    contacts: PEOPLE.map(({ row }) => ({
      id: row.id,
      tenant_id: A,
      display_name: row.display_name,
      wa_profile_name: null,
      phone_e164: row.phone_e164,
      email: null,
      consent: row.consent,
      dnc: false,
      erased_at: null,
      merged_into_contact_id: null,
    })),
    conversations: PEOPLE.map(({ row }) => ({
      id: row.latest_conversation_id,
      tenant_id: A,
      contact_id: row.id,
      state: row.latest_state,
      paused_until: row.latest_paused_until,
      snooze_until: null,
      assignee_user_id: row.latest_assignee_user_id,
      last_message_at: row.last_message_at,
      contacts: { display_name: row.display_name, phone_e164: row.phone_e164 },
    })),
  };
  const rpcs = {
    people_list: (a) =>
      a.p_tenant_id !== A
        ? []
        : a.p_contact_id
          ? PEOPLE.filter(({ row }) => row.id === a.p_contact_id).map(({ row }) => row)
          : PEOPLE.map(({ row }) => row).filter((r) => !a.p_query || r.display_name.includes(a.p_query)),
  };
  const ctx = { supabase: fakeDb(tables, {}, rpcs), userId: ME, email: "ada@example.com", params: {} };
  return newToolContext(ctx, A, "operator", ROW_TZ, NOW);
}

async function asked(input) {
  const out = await runTool(world(), { name: "people", input });
  assert.equal(out.isError, false, out.result);
  return JSON.parse(out.result);
}

test("the table is the seven states, and a teammate's thread: the People row gives each person the state named", () => {
  assert.deepEqual(
    new Set(PEOPLE.map((p) => p.label)),
    new Set(Object.values(PERSON_STATE_LABELS)),
    "every one of the seven states is in the table",
  );
  for (const { who, label, row } of PEOPLE) {
    const state = personStateFor(row, ROW_NOW, ROW_TZ, ME);
    assert.equal(PERSON_STATE_LABELS[state], label, who);
    assert.equal(toPersonRowVM(row, ROW_TZ, NOW, ME).stateLabel, label, `${who}: the row draws it`);
  }
});

test("people.get says where a person stands as their People row does, for every state and a teammate's thread", async () => {
  for (const { who, label, row } of PEOPLE) {
    const said = await asked({ action: "get", contact_id: row.id });
    assert.equal(said.state, label, `${who}: Ask's profile says the People row's state`);
    assert.equal(said.state_detail, toPersonRowVM(row, ROW_TZ, NOW, ME).stateDetail || null, `${who}: and its line`);
  }
});

test("people.search says the same state as the People row, for every state and a teammate's thread", async () => {
  for (const { who, label, row } of PEOPLE) {
    const said = await asked({ action: "search", query: row.display_name });
    const line = said.people.find((p) => p.contact_id === row.id);
    assert.ok(line, `${who} is found`);
    assert.equal(line.state, label, `${who}: Ask's search says the People row's state`);
  }
});
