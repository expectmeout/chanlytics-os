/**
 * Consent as evidence and as history.
 *
 * "When did she say yes, to what, and how do we know" was answerable only with
 * a database: the events existed, the route did not read them, and a texted
 * yes kept no message. Executed here: the ledger row read into its shape with
 * the evidence it carries (00110), the words the timeline says for each kind
 * of change, the person VM putting them on the timeline, and the batch doors
 * run over a database in memory -- held to the workspace, refusing a spoken
 * yes to offers before any row is touched, a decision per person.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { consentChangeOf, consentChangeWords, toPersonVM, CONSENT_RESET_SOURCE } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const visit = await import(at("apps/dashboard/app/api/v1/contacts/consent/route.ts"));
const offers = await import(at("apps/dashboard/app/api/v1/contacts/marketing-consent/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const change = (over = {}) => ({
  id: "ev-1", contact_id: "p1", at: "2026-09-01T14:00:00Z", purpose: "conversational", consent: "opted_in", previous: "unknown",
  source: "customer_message", by: null, note: null, channel: "sms", message_external_id: "SM1", words: "START", ...over,
});

test("a ledger row reads into its shape with the evidence a texted answer carries (00110)", () => {
  const row = { id: "ev-1", subject_id: "p1", created_at: "2026-09-01T14:00:00Z", data: { consent: "opted_out", source: "customer_message", channel: "whatsapp", message_external_id: "wamid.1", words: "STOP" } };
  assert.deepEqual(consentChangeOf(row), { id: "ev-1", contact_id: "p1", at: "2026-09-01T14:00:00Z", purpose: "conversational", consent: "opted_out", previous: null, source: "customer_message", by: null, note: null, channel: "whatsapp", message_external_id: "wamid.1", words: "STOP" });
  assert.equal(consentChangeOf({ ...row, data: { ...row.data, words: "" } }).words, null, "an empty string is nothing, not evidence");
});

test("the words say what was answered and how we know, for every kind of change", () => {
  assert.deepEqual(consentChangeWords(change()), { who: "Consent", text: "Said yes to messages about their visit", sub: "In their own words by text: “START”" });
  assert.deepEqual(consentChangeWords(change({ consent: "opted_out", channel: "whatsapp", words: "STOP" })), { who: "Consent", text: "Said stop — nothing goes out to them", sub: "In their own words on WhatsApp: “STOP”" });
  assert.equal(consentChangeWords(change({ channel: null, words: null })).sub, "In their own words in their own message", "a row from before 00110 still says how");
  assert.deepEqual(consentChangeWords(change({ purpose: "marketing", source: "form", note: "signed 2 Sep", by: "u1", channel: null, words: null })), { who: "Offers", text: "Said yes to offers and news", sub: "Sign-up form, recorded by staff · signed 2 Sep" });
  assert.deepEqual(consentChangeWords(change({ purpose: "marketing", consent: "opted_out", source: "phone", channel: null, words: null })), { who: "Offers", text: "Said no to offers", sub: "On the phone, recorded by staff" });
  assert.deepEqual(consentChangeWords(change({ consent: "unknown", source: CONSENT_RESET_SOURCE, channel: null, words: null })), { who: "Consent", text: "Back to not asked", sub: "Reset by staff" });
  assert.equal(consentChangeWords(change({ purpose: "marketing", consent: "unknown", source: CONSENT_RESET_SOURCE })).text, "Offers: back to not asked");
});

test("the person VM puts every change on the timeline, newest first, beside what was said", () => {
  const row = {
    id: "p1", display_name: "Maria Lopez", wa_profile_name: null, phone_e164: "+13055550134",
    consent: "opted_in", consent_source: "customer_message", consent_updated_at: "2026-09-01T14:00:00Z",
    marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null,
    dnc: false, channels: ["sms"], conversation_count: 0, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: null, latest_state: null, latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: null,
    last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null, last_call_at: null, last_inbound_call_at: null, call_count: 0, call_seconds: 0,
    first_contact_at: "2026-09-01T14:00:00Z", earliest_row_at: null, has_backfill: false, has_chat: false, queued_reply_at: null,
  };
  const vm = toPersonVM({
    row, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto",
    consent_history: [change({ id: "ev-2", at: "2026-09-03T10:00:00Z", purpose: "marketing", source: "form", channel: null, words: null, note: "slip 12" }), change()],
  }, new Date("2026-09-10T12:00:00Z"));
  const consent = vm.timeline.filter((i) => i.kind === "consent");
  assert.deepEqual(consent.map((i) => [i.id, i.who, i.text, i.sub]), [
    ["c-ev-2", "Offers", "Said yes to offers and news", "Sign-up form, recorded by staff · slip 12"],
    ["c-ev-1", "Consent", "Said yes to messages about their visit", "In their own words by text: “START”"],
  ]);
  assert.ok(consent.every((i) => typeof i.day === "string" && typeof i.time === "string"), "stamped like every other item");
  assert.deepEqual(toPersonVM({ row, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto" }).timeline.filter((i) => i.kind === "consent"), [], "a profile without the field draws nothing new");
});

/* ------------------------------------------------------------ the batch doors, run */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const P4 = "44444444-4444-4444-8444-444444444444";
const GONE = "55555555-5555-4555-8555-555555555555";
const USER = "u1";
const membership = (tenant_id, role, slug) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at: "2026-01-01T00:00:00Z" });
const tables = (role = "operator") => ({
  memberships: [membership(A, role, "harbor")],
  contacts: [
    { id: P1, tenant_id: A, erased_at: null, consent: "unknown", marketing_consent: "unknown" },
    { id: P2, tenant_id: A, erased_at: null, consent: "opted_out", marketing_consent: "unknown" },
    { id: P3, tenant_id: B, erased_at: null, consent: "unknown", marketing_consent: "unknown" },   // another workspace's customer
    { id: P4, tenant_id: A, erased_at: "2026-08-01T00:00:00Z", consent: "unknown", marketing_consent: "unknown" }, // erased
  ],
  decisions: [],
});
const send = (body) => new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "PUT", body: JSON.stringify(body) });
const ctxFor = (t, rpcs) => ({ supabase: fakeDb(t, {}, rpcs), userId: USER, email: "ada@example.com", params: {} });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the two batch doors declare their policy: the front desk, one take of the consent bucket, the workspace the tab named", () => {
  assert.deepEqual(visit.PUT.policy, { kind: "write", scope: "workspace", role: "operator", rate: "consent", spend: false });
  assert.deepEqual(offers.PUT.policy, { kind: "write", scope: "workspace", role: "operator", rate: "consent", spend: false });
});

test("a yes for many goes through the per-person door for each of OURS, records a decision each, and says who was skipped", async () => {
  const t = tables();
  const door = [];
  const rpcs = { set_contact_consent: (a) => { door.push(a); return { previous: "unknown", updated_at: "2026-09-12T00:00:00Z", dnc: false }; } };
  const out = await visit.PUT.run(send({ ids: [P1, P2, P3, P4, GONE, P1], consent: "opted_in", source: "in_person", note: "  class of twelve  " }), ctxFor(t, rpcs));
  assert.deepEqual(out, { done: 2, failed: [], skipped: [P3, P4, GONE] }, "ours and not erased are written; the other workspace's, the erased and the unknown are skipped, and the duplicate is one");
  assert.deepEqual(door.map((a) => [a.p_contact_id, a.p_consent, a.p_source, a.p_note]), [[P1, "opted_in", "in_person", "class of twelve"], [P2, "opted_in", "in_person", "class of twelve"]], "the existing door, per person, with the note trimmed");
  assert.deepEqual(t.decisions.map((d) => [d.subject_type, d.subject_id, d.verb, d.payload.previous, d.payload.batch]), [["contact", P1, "consent_change", "unknown", 5], ["contact", P2, "consent_change", "opted_out", 5]], "a decision per person, naming what it replaced and the batch it came in");
  assert.ok(!t.decisions.some((d) => "purpose" in d.payload), "the visit answer names no purpose, as its single door does not");
});

test("a spoken yes to OFFERS is refused before any row is touched; a no is honoured however it is said; the door's own refusal is reported per person", async () => {
  const t = tables();
  const door = [];
  const rpcs = { set_marketing_consent: (a) => { door.push(a); if (a.p_contact_id === P2) throw new Error("that person has been erased"); return { marketing_consent: a.p_consent }; } };
  await refused(offers.PUT.run(send({ ids: [P1, P2], consent: "opted_in", source: "in_person" }), ctxFor(t, rpcs)), "validation", 400, "in writing");
  assert.equal(door.length, 0, "nothing reached the door");
  const no = await offers.PUT.run(send({ ids: [P1, P2], consent: "opted_out", source: "phone" }), ctxFor(t, rpcs));
  assert.deepEqual(no, { done: 1, failed: [{ id: P2, message: "that person has been erased" }], skipped: [] });
  assert.deepEqual(door.map((a) => [a.p_tenant_id, a.p_contact_id, a.p_consent, a.p_source]), [[A, P1, "opted_out", "phone"], [A, P2, "opted_out", "phone"]], "the tenant is the workspace the tab named, never one from the body");
  assert.deepEqual(t.decisions.map((d) => [d.subject_id, d.payload.purpose, d.payload.consent]), [[P1, "marketing", "opted_out"]], "no decision for a write the door refused");
  const yes = await offers.PUT.run(send({ ids: [P1], consent: "opted_in", source: "form", note: "slips of 12 Sep" }), ctxFor(tables(), rpcs));
  assert.deepEqual(yes, { done: 1, failed: [], skipped: [] }, "a written yes goes through");
});

test("the batch is judged before it is walked: a source that is not one of the four, an empty list, more than fifty, a viewer, a tab that named no workspace", async () => {
  const rpcs = { set_contact_consent: () => { throw new Error("must not be called"); } };
  await refused(visit.PUT.run(send({ ids: [P1], consent: "opted_in", source: "email" }), ctxFor(tables(), rpcs)), "validation", 400, "Say how they told you");
  await refused(visit.PUT.run(send({ ids: [P1], consent: "opted_in" }), ctxFor(tables(), rpcs)), "validation", 400, "Say how they told you");
  await refused(visit.PUT.run(send({ ids: [], consent: "opted_in", source: "form" }), ctxFor(tables(), rpcs)), "validation", 400);
  await refused(visit.PUT.run(send({ ids: Array.from({ length: 51 }, () => P1), consent: "opted_in", source: "form" }), ctxFor(tables(), rpcs)), "validation", 400);
  await refused(visit.PUT.run(send({ ids: [P1], consent: "opted_in", source: "form" }), ctxFor(tables("viewer"), rpcs)), "forbidden", 403);
  const two = tables();
  two.memberships.push(membership(B, "operator", "bayside"));
  await refused(visit.PUT.run(new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify({ ids: [P1], consent: "opted_in", source: "form" }) }), ctxFor(two, rpcs)), "choose_workspace");
  // The reset needs no source and carries the reset's own.
  const door = [];
  const reset = await visit.PUT.run(send({ ids: [P1], consent: "unknown" }), ctxFor(tables(), { set_contact_consent: (a) => { door.push(a); return {}; } }));
  assert.deepEqual(reset, { done: 1, failed: [], skipped: [] });
  assert.equal(door[0].p_source, CONSENT_RESET_SOURCE);
});
