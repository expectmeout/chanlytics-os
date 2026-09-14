/**
 * Where your attention matters, redrawn: one row per person with a sentence
 * that is always true, a state line in the mockup's grammar, and one button
 * only where the state asks something of you. The strip's height never
 * depends on what a tab holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionRow, toPersonRowVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
const NOW = new Date("2026-09-06T16:00:00Z");
const nowMs = NOW.getTime();
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();

/** An ordinary active person on WhatsApp: wrote two hours ago, known for two months. */
function dto(over = {}) {
  return {
    id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani", phone_e164: "+17865550181",
    consent: "unknown", consent_source: null, consent_updated_at: null, dnc: false, channels: ["whatsapp"],
    conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: "cv1", latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
    latest_wa_inbound_at: iso(2 * H), last_message_at: iso(2 * H), last_message_direction: "inbound", last_message_sender: "customer",
    last_inbound_text: "Can I move Saturday to 11? My sister is coming too", last_inbound_at: iso(2 * H),
    last_call_at: null, last_inbound_call_at: null, last_inbound_call_summary: null, call_count: 0, call_seconds: 0,
    first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
    effective_reply_mode: "auto", visits: null, ...over,
  };
}
const rowOf = (over) => attentionRow(toPersonRowVM(dto(over), ZONE, NOW), ZONE, nowMs);

test("their words come first, in quotes, with the channel and the moment beside the name", () => {
  const a = rowOf({});
  assert.deepEqual([a.channel, a.when, a.quoted, a.sentence], ["WhatsApp", "2h ago", true, "Can I move Saturday to 11? My sister is coming too"]);
  assert.deepEqual(a.status, ["Receptionist", "answering on WhatsApp"]);
  assert.deepEqual(a.cta, { label: "Open thread", kind: "ghost", to: "inbox/th-cv1" }, "an active thread is a quiet button");
});

test("needs you: the escalation's reason and its moment, and the one primary button", () => {
  const a = rowOf({ needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(1 * H) });
  assert.equal(a.tone, "escalated");
  assert.equal(a.status[0], "Escalated");
  assert.equal(a.status[1], "asked for a person");
  assert.match(a.status[2], /^since /, "the moment travels with the state");
  assert.deepEqual(a.cta, { label: "Open in Inbox", kind: "primary", to: "inbox/th-cv1" });
});

test("waiting on you: the state's own words, and the same primary button", () => {
  const vm = toPersonRowVM(dto({ latest_assignee_user_id: "u1", latest_paused_until: new Date(nowMs + 20 * H).toISOString() }), ZONE, NOW);
  assert.equal(vm.state, "waiting_on_you");
  const a = attentionRow(vm, ZONE, nowMs);
  assert.deepEqual(a.status, ["You own the thread", "they wrote last"]);
  assert.equal(a.cta.label, "Open in Inbox");
});

test("a caller with nothing in writing: the call's summary is the sentence; the phone receptionist is the state; no button without a thread", () => {
  const caller = {
    display_name: null, wa_profile_name: null, channels: ["voice"], conversation_count: 0, latest_conversation_id: null, has_chat: false,
    latest_wa_inbound_at: null, last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null,
    last_call_at: iso(2 * D), last_inbound_call_at: iso(2 * D), call_count: 1, call_seconds: 95, first_contact_at: iso(2 * D), earliest_row_at: iso(2 * D),
  };
  const withSummary = rowOf({ ...caller, last_inbound_call_summary: "  Asked about a gel manicure for Saturday;\n the receptionist offered 10:00.  " });
  assert.deepEqual([withSummary.channel, withSummary.when, withSummary.quoted], ["Phone", "2d ago", false]);
  assert.equal(withSummary.sentence, "Asked about a gel manicure for Saturday; the receptionist offered 10:00.", "one line, whitespace collapsed");
  assert.deepEqual(withSummary.status, ["Receptionist", "takes their calls"], "never 'answering on WhatsApp' for someone who has only phoned");
  assert.equal(withSummary.cta, null, "the row is the profile; there is no thread to open");
  const bare = rowOf(caller);
  assert.equal(bare.sentence, "Phoned once; nothing in writing yet");
  assert.equal(rowOf({ ...caller, call_count: 3 }).sentence, "Phoned 3 times; nothing in writing yet");
  assert.equal(rowOf({ ...caller, last_call_at: null, last_inbound_call_at: null, call_count: 0 }).sentence, "Nothing written yet");
  const long = rowOf({ ...caller, last_inbound_call_summary: "x".repeat(200) });
  assert.equal(long.sentence.length, 160);
  assert.ok(long.sentence.endsWith("…"));
});

test("the calendar speaks when nothing else does: the next visit, else the last", () => {
  const caller = { last_inbound_text: null, last_inbound_at: null, has_chat: false, latest_conversation_id: null, conversation_count: 0, last_message_at: null, last_message_direction: null, last_message_sender: null, latest_wa_inbound_at: null, last_call_at: iso(3 * D), last_inbound_call_at: iso(3 * D), call_count: 1 };
  const visits = { timezone: "America/New_York", source: "Google Calendar", state: "ok", next: { start: new Date(nowMs + 2 * D).toISOString(), end: new Date(nowMs + 2 * D + H).toISOString(), title: "Balayage" }, last: null };
  const next = rowOf({ ...caller, visits });
  assert.match(next.sentence, /^Booked · .*Balayage$/);
  const last = rowOf({ ...caller, visits: { ...visits, next: null, last: { start: iso(10 * D), end: iso(10 * D - H), title: "Gloss" } } });
  assert.match(last.sentence, /^Last visit · .*Gloss$/);
  const summarised = rowOf({ ...caller, visits, last_inbound_call_summary: "Wants to move Saturday." });
  assert.equal(summarised.sentence, "Wants to move Saturday.", "the call's words beat the calendar");
});

test("the wiring: the door carries the summary, the surface carries the rows, the page draws the mockup, the height is fixed", () => {
  const mig = readRaw("supabase/migrations/00060_people_list_call_summary.sql");
  assert.ok(mig.includes("  last_inbound_call_summary text,") && mig.includes("    lks.summary,") && mig.includes("and k.direction = 'inbound'") && mig.includes("and k.summary is not null"));
  assert.ok(mig.includes("grant execute on function public.people_list(uuid, uuid) to authenticated, service_role;"), "the grants are re-stated after the drop");
  assert.ok(readCode("packages/contracts/src/people.ts").includes("callSummary: r.last_inbound_call_summary?.trim() || null,"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("attention: Object.fromEntries(rows.map((r) => [r.id, attentionRow(r, tz, now.getTime())])),"), "computed once with the surface, like the recency cells");
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(page.includes('<PeopleTriage rows={rows} recency={people.recency} attention={people.attention}'), "the real page hands the rows to the strip");
  assert.ok(!page.includes("remembered.showTriage") && !page.includes("Updated {fetched}"), "no header, no toggle, no clock on the real page: the strip is the hero, as drawn");
  for (const s of ['data-testid="attention-strip"', 'className="cl-attn-list" key={active}', 'className="cl-attn-foot"', "plTabTone(t)", "<window.AttnRow", "Nobody here right now."]) assert.ok(page.includes(s), s);
  assert.ok(!page.includes("nothing written to quote"), "the confession is gone");
  const css = readRaw("apps/dashboard/src/legacy/styles/clients.css");
  assert.ok(css.includes(".cl-attn-list { min-height: calc(3 * var(--attn-row));") && css.includes(".cl-attn-empty { min-height: calc(3 * var(--attn-row));"), "three rows or nothing take the same room");
  assert.ok(css.includes("height: var(--attn-row);") && css.includes("box-sizing: border-box;"), "a row's border lives inside its height");
  assert.ok(css.includes(".cl-attn-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 34px;"), "the footer is always there, at one height");
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce) { .cl-attn-list { animation: none; } }"));
  assert.ok(css.includes(".cl-attn-cta.primary { background: var(--accent); color: var(--accent-fg); }"), "the one primary button is the mockup's coral");
  assert.ok(css.includes(".cl-attn { --attn-row: 68px; margin: 16px 28px 4px; }"), "inset like the search row and the table, never touching the rail");
});
