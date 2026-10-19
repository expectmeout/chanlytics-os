/**
 * Ask says what already holds (16 Oct 2026, after the operator stress run's "pause the Win-back" of one already paused,
 * #1634): a card never proposes a change that changes nothing, and never counts as changed what already was.
 *
 * - One subject: the receptionist for one person, the autonomy of a class, a thread taken over or archived. A request
 *   that already holds is refused in words ("say so, and change nothing"), so the turn says it (turn-end.ts turnUnmade);
 *   part of a class's change that holds is left off its card and said (ProposalOutcome.noted).
 * - Many people: on or off a list kept by hand, the receptionist for many, their answers. The card acts on the people it
 *   changes and says how many already were so; when every one was, nothing is proposed and the model says so.
 *
 * Executed: the real registry's builders over the database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const OTHER = "u2";
const TZ = "America/New_York";
const NOW = new Date("2026-10-16T14:00:00Z");
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const ROSA = "abababab-abab-4aba-8aba-abababababa1";
const QUINN = "abababab-abab-4aba-8aba-abababababa2";
const LENA = "abababab-abab-4aba-8aba-abababababa3";
const C_ROSA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C_QUINN = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const VIP = "5e5e5e5e-0000-4000-8000-000000000001";

/** A People row as people_list answers it: Rosa has said yes to messages, Quinn and Lena were never asked. */
const heldRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "unknown",
  marketing_consent: null,
  dnc: false,
  has_chat: true,
  first_seen_at: iso(NOW.getTime() - 60 * DAY),
  last_message_at: iso(NOW.getTime() - 3 * DAY),
  last_inbound_at: iso(NOW.getTime() - 3 * DAY),
  latest_conversation_id: null,
  conversation_count: 1,
  ...over,
});
const PEOPLE = [heldRow(ROSA, "Rosa", { consent: "opted_in" }), heldRow(QUINN, "Quinn"), heldRow(LENA, "Lena")];
const contactOf = (id, name) => ({
  id,
  tenant_id: A,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  erased_at: null,
});
const threadOf = (id, contactId, name, over = {}) => ({
  id,
  tenant_id: A,
  contact_id: contactId,
  state: "open",
  snooze_until: null,
  paused_until: null,
  assignee_user_id: null,
  contacts: { display_name: name, wa_profile_name: null, phone_e164: "+15555550100", email: null },
  ...over,
});

/**
 * Harbor: Rosa's own receptionist mode is never, and Rosa is on VIP (a list kept by hand); the reply class is set to ask
 * first; Rosa's thread is the member's own, Quinn's archived.
 */
function heldWorld(role = "owner") {
  return {
    memberships: [
      { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: TZ }],
    tenant_config: [],
    tenant_channels: [],
    policies: [
      { tenant_id: A, class: "reply", mode: "never", subject_type: "contact", subject_id: ROSA, limits: null },
      {
        tenant_id: A,
        class: "reply",
        mode: "ask",
        subject_type: null,
        subject_id: null,
        limits: { min_confidence: 0.8 },
      },
    ],
    conversations: [
      threadOf(C_ROSA, ROSA, "Rosa", { assignee_user_id: USER }),
      threadOf(C_QUINN, QUINN, "Quinn", { state: "archived" }),
    ],
    escalations: [],
    messages: [],
    contacts: [contactOf(ROSA, "Rosa"), contactOf(QUINN, "Quinn"), contactOf(LENA, "Lena")],
    deals: [],
    templates: [],
    segments: [{ id: VIP, tenant_id: A, name: "VIP", rule: null, archived_at: null }],
    segment_members: [{ tenant_id: A, segment_id: VIP, contact_id: ROSA }],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
    decisions: [],
  };
}
const HELD_RPCS = {
  people_list: (a) =>
    (a.p_tenant_id === A ? PEOPLE : []).slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000)),
};

/** One call the model makes, through the registry, as a member of `role`. */
async function heldCall(name, input, role = "owner") {
  const supabase = fakeDb(heldWorld(role), {}, HELD_RPCS);
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, role, TZ, NOW);
  return buildProposal(t, name, input);
}
const refusalOf = (out) => (out.isError ? JSON.parse(out.result).error : null);

test("one person's receptionist: a mode they have already is refused in words, never a card that changes nothing; another mode is the card it was", async () => {
  const same = await heldCall("propose_person", { action: "mode", contact_id: ROSA, mode: "never" });
  assert.equal(refusalOf(same), "for Rosa the receptionist already stays silent with them: say so, and change nothing");
  const following = await heldCall("propose_person", { action: "mode", contact_id: QUINN, mode: "inherit" });
  assert.equal(
    refusalOf(following),
    "for Quinn the receptionist already follows the workspace rule: say so, and change nothing",
  );
  const change = await heldCall("propose_person", { action: "mode", contact_id: QUINN, mode: "never" });
  assert.equal(change.isError, false, change.result);
  assert.deepEqual([change.proposal.payload.previous, change.proposal.payload.mode], ["inherit", "never"]);
});

test("a class's autonomy: all of it already set is refused; a part already set is left off the card and said; a change is the card it was", async () => {
  const same = await heldCall("propose_settings", { action: "autonomy", class: "reply", mode: "ask" });
  assert.match(refusalOf(same), /^“[^”]+” is already .+: say so, and change nothing$/);
  const both = await heldCall("propose_settings", {
    action: "autonomy",
    class: "reply",
    mode: "ask",
    min_confidence: 0.8,
  });
  assert.match(
    refusalOf(both),
    /is already .+ and already has its confidence dial at 80%: say so, and change nothing$/,
  );
  const part = await heldCall("propose_settings", {
    action: "autonomy",
    class: "reply",
    mode: "ask",
    min_confidence: 0.9,
  });
  assert.equal(part.isError, false, part.result);
  assert.match(part.noted, /^“[^”]+” is already .+, so the card leaves that as it is$/);
  assert.match(JSON.parse(part.result).also_say, /: say so in the answer beside the card$/);
  const change = await heldCall("propose_settings", { action: "autonomy", class: "reply", mode: "auto" });
  assert.deepEqual([change.isError, change.noted], [false, undefined]);
});

test("a thread: taking over one the member already has, or archiving one archived, is refused in words; a take-over from nobody is the card it was", async () => {
  assert.equal(
    refusalOf(await heldCall("propose_thread_verb", { conversation_id: C_ROSA, verb: "take_over" })),
    "Rosa's thread is already taken over by the person asking: say so, and change nothing",
  );
  assert.equal(
    refusalOf(await heldCall("propose_thread_verb", { conversation_id: C_QUINN, verb: "archive" })),
    "Quinn's thread is already archived: say so, and change nothing",
  );
  const take = await heldCall("propose_thread_verb", { conversation_id: C_QUINN, verb: "take_over" });
  assert.equal(take.isError, false, take.result);
  // Someone else's: taking it over is a change.
  const supabase = fakeDb(
    { ...heldWorld(), conversations: [threadOf(C_ROSA, ROSA, "Rosa", { assignee_user_id: OTHER })] },
    {},
    HELD_RPCS,
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const fromTeammate = await buildProposal(t, "propose_thread_verb", { conversation_id: C_ROSA, verb: "take_over" });
  assert.equal(fromTeammate.isError, false, fromTeammate.result);
});

test("many people on a list kept by hand: who is on it already is left and said; the card acts on the rest; all of them on it is refused", async () => {
  const some = await heldCall("propose_people", { action: "list", list_id: VIP, put: "on", ids: [ROSA, QUINN, LENA] });
  assert.equal(some.isError, false, some.result);
  assert.deepEqual(
    [some.proposal.title, some.proposal.summary, some.proposal.payload.add, some.proposal.payload.count],
    ["Put 2 people on VIP", "2 people join VIP", [QUINN, LENA], 2],
  );
  assert.equal(some.noted, "1 of the 3 is on VIP already, so the card leaves them as they are");
  assert.equal(
    refusalOf(await heldCall("propose_people", { action: "list", list_id: VIP, put: "on", ids: [ROSA] })),
    "that person is on VIP already: say so, and change nothing",
  );
  // Off: who is not on it is left the same way.
  assert.equal(
    refusalOf(await heldCall("propose_people", { action: "list", list_id: VIP, put: "off", ids: [QUINN, LENA] })),
    "all 2 are off VIP already: say so, and change nothing",
  );
  const off = await heldCall("propose_people", { action: "list", list_id: VIP, put: "off", ids: [ROSA, QUINN] });
  assert.deepEqual(
    [off.proposal.payload.remove, off.noted],
    [[ROSA], "1 of the 2 is off VIP already, so the card leaves them as they are"],
  );
});

test("the receptionist for many: who has the mode already is left and said, each by their own setting (following the workspace is inherit)", async () => {
  const never = await heldCall("propose_people", { action: "mode", ids: [ROSA, QUINN], mode: "never" });
  assert.equal(never.isError, false, never.result);
  assert.deepEqual([never.proposal.payload.ids, never.proposal.payload.count], [[QUINN], 1]);
  assert.match(never.noted, /^1 of the 2 has “[^”]+” already, so the card leaves them as they are$/);
  assert.match(
    refusalOf(await heldCall("propose_people", { action: "mode", ids: [QUINN, LENA], mode: "inherit" })),
    /^all 2 have “[^”]+” already: say so, and change nothing$/,
  );
});

test("many people's answers: who has that answer on record already is left and said; a different answer is the card it was", async () => {
  const yes = await heldCall("propose_people", {
    action: "answer",
    ids: [ROSA, QUINN],
    question: "messages",
    answer: "yes",
    how: "in_person",
  });
  assert.equal(yes.isError, false, yes.result);
  assert.deepEqual(yes.proposal.payload.ids, [QUINN]);
  assert.equal(yes.noted, "1 of the 2 has that answer on record already, so the card leaves them as they are");
  assert.equal(
    refusalOf(
      await heldCall("propose_people", {
        action: "answer",
        ids: [QUINN, LENA],
        question: "offers",
        answer: "not_asked",
      }),
    ),
    "all 2 have that answer on record already: say so, and change nothing",
  );
  const no = await heldCall("propose_people", {
    action: "answer",
    ids: [ROSA],
    question: "messages",
    answer: "no",
    how: "in_person",
  });
  assert.deepEqual([no.isError, no.noted], [false, undefined]);
});
