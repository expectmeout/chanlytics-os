/**
 * Exports: a thread as text, a call as text, everyone as a CSV.
 *
 * "Export transcript" was a menu item that opened an overlay stubbed outside
 * demos, and the privacy policy promised "access or deletion" with only the
 * deletion half built. The formatters are executed here; the routes are
 * checked for the door they keep (owner only for the list, a named workspace,
 * the rate bucket) and the wrapper for the one thing it had to learn: a
 * handler may hand back a file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROLE_PERMS, frameWhisper } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const X = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/export.ts")).href);

const TZ = "America/New_York";
const OPTS = { business: "Melany's Beauty Salon", tz: TZ, exportedAt: new Date("2026-09-05T15:04:00Z") };
const contact = { id: "p1", display_name: null, wa_profile_name: "Dani 💅", phone_e164: "+19175550100", consent: null, dnc: false };
const msg = (over) => ({
  id: "m", direction: "inbound", sender: "customer", type: "text", body: "hi", media: null, meta: null, status: "sent",
  created_at: "2026-09-01T14:00:00Z", channel_ts: null, ...over,
});

test("stamp writes the business's clock, tolerates a bad zone, and says nothing for no time", () => {
  assert.equal(X.stamp("2026-09-05T15:04:00Z", TZ), "2026-09-05 11:04");
  assert.equal(X.stamp("2026-09-05T03:30:00Z", TZ), "2026-09-04 23:30", "midnight-side, in the zone, h23");
  assert.equal(X.stamp("2026-09-05T15:04:00Z", "Not/AZone"), "2026-09-05 15:04", "unknown zone falls back to UTC instead of a 500");
  assert.equal(X.stamp(null, TZ), "");
  assert.equal(X.stamp("garbage", TZ), "");
});

test("a thread exports oldest first in CHANNEL time, with who said it and what state it was in", () => {
  const text = X.transcriptText({ contact }, [
    msg({ id: "2", sender: "ai", direction: "outbound", body: "Hi Dani!\nWe open at 10.", created_at: "2026-09-01T14:00:30Z", channel_ts: "2026-09-01T14:00:31Z" }),
    // Written to our table last, but it HAPPENED first: channel time wins.
    msg({ id: "1", body: "hola", created_at: "2026-09-01T14:00:40Z", channel_ts: "2026-09-01T13:59:00Z" }),
    msg({ id: "3", sender: "human", direction: "outbound", body: "I'll take it from here", created_at: "2026-09-01T14:05:00Z" }),
    msg({ id: "4", sender: "ai", direction: "outbound", body: "never sent", status: "canceled", created_at: "2026-09-01T14:06:00Z" }),
    msg({ id: "5", type: "media", body: null, media: { mime_type: "image/jpeg" }, created_at: "2026-09-01T14:07:00Z" }),
    msg({ id: "6", type: "call_summary", sender: "system", direction: "inbound", body: "Inbound call · 1 min", created_at: "2026-09-01T14:08:00Z" }),
  ], OPTS);
  const lines = text.split("\n");
  assert.equal(lines[0], "Conversation with Dani 💅 (+19175550100)");
  assert.equal(lines[1], "Melany's Beauty Salon · WhatsApp · 6 messages · exported 2026-09-05 11:04 · times in America/New_York");
  assert.equal(lines[2], "");
  assert.equal(lines[3], "[2026-09-01 09:59] Dani 💅: hola", "channel time, and the customer by their WhatsApp name");
  assert.equal(lines[4], "[2026-09-01 10:00] Receptionist: Hi Dani!");
  assert.equal(lines[5], "    We open at 10.", "a second line stays inside its entry");
  assert.equal(lines[6], "[2026-09-01 10:05] Staff: I'll take it from here");
  assert.equal(lines[7], "[2026-09-01 10:06] Receptionist: [withdrawn] never sent");
  assert.equal(lines[8], "[2026-09-01 10:07] Dani 💅: [image/jpeg]");
  assert.equal(lines[9], "[2026-09-01 10:08] Dani 💅: [call] Inbound call · 1 min");
  assert.equal(text.at(-1), "\n", "ends with a newline like a text file should");
  assert.ok(X.transcriptText({ contact }, [], OPTS).includes("(no messages)"));
});

test("a call exports its facts, its summary, and the turns with a clock; a whisper reads as the owner's words", () => {
  const call = {
    id: "k1", retell_call_id: "r", direction: "inbound", call_type: null, status: "ended", from_e164: "+19175550100", from_raw: null, to_e164: null,
    started_at: "2026-09-05T03:00:00Z", ended_at: "2026-09-05T03:01:30Z", duration_ms: 90_000, disconnection_reason: null,
    sentiment: "Positive", call_successful: true, in_voicemail: false, summary: "Asked about balayage; sent the booking link.",
    transcript_object: [
      { role: "agent", content: "Thanks for calling!", start: 0.4 },
      { role: "user", content: "Do you do balayage?", start: 4.2 },
      { role: "injected", content: frameWhisper("mention the Saturday opening") },
      { role: "agent", content: "We do. Saturday has an opening.", words: [{ start: 61.5 }] },
    ],
    recording: null, conversation_id: null, contact_id: "p1", message_id: null, created_at: "", updated_at: "",
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550100" },
  };
  const text = X.callText(call, OPTS);
  const lines = text.split("\n");
  assert.equal(lines[0], "Phone call with Daniela Ruiz (+19175550100)");
  assert.equal(lines[1], "Melany's Beauty Salon · Inbound call · 2026-09-04 23:00 · 1:30 · exported 2026-09-05 11:04 · times in America/New_York");
  assert.equal(lines[3], "Marked successful · Caller sentiment: Positive");
  assert.equal(lines[5], "Summary");
  assert.equal(lines[6], "Asked about balayage; sent the booking link.");
  assert.equal(lines[8], "Transcript");
  assert.equal(lines[9], "[0:00] Receptionist: Thanks for calling!");
  assert.equal(lines[10], "[0:04] Daniela Ruiz: Do you do balayage?");
  assert.equal(lines[11], "[--:--] You whispered: mention the Saturday opening", "the frame is stripped, the owner's words stay");
  assert.equal(lines[12], "[1:01] Receptionist: We do. Saturday has an opening.", "the raw provider shape still gives a clock");
  const anon = X.callText({ ...call, contact: null, summary: null, transcript_object: null, call_successful: null, sentiment: null }, OPTS);
  assert.ok(anon.startsWith("Phone call with +19175550100\n"), "no name: the number, once");
  assert.ok(anon.includes("(no transcript)"));
  assert.ok(!anon.includes("Summary\n"));
});

test("the CSV quotes what must be quoted and defuses what a spreadsheet would run", () => {
  assert.equal(X.csvCell("plain"), "plain");
  assert.equal(X.csvCell('say "hi", now'), '"say ""hi"", now"');
  assert.equal(X.csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"", "a formula in a WhatsApp name is text");
  assert.equal(X.csvCell("+19175550100"), "'+19175550100", "a phone keeps its plus instead of being summed");
  assert.equal(X.csvCell(null), "");
  assert.equal(X.csvCell(true), "yes");
  assert.equal(X.csvCell(0), "0");
  const rows = [{
    id: "p1", display_name: "Dani, Jr.", wa_profile_name: "=cmd", phone_e164: "+19175550100", consent: "opted_in", consent_source: "keyword",
    consent_updated_at: "2026-08-01T12:00:00Z",
    // The OTHER answer. This person answers the business and has NOT asked for
    // offers, which is the ordinary case and the one an audit needs to be able to
    // tell apart -- and the columns this file carried could not.
    marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null,
    dnc: false, channels: ["whatsapp", "voice"], conversation_count: 2, escalation_count: 0,
    call_count: 1, first_contact_at: "2026-07-01T12:00:00Z", last_message_at: "2026-09-01T12:00:00Z", last_inbound_at: null, last_call_at: null,
    effective_reply_mode: "auto",
  }];
  const csv = X.peopleCsv(rows, TZ);
  assert.equal(csv.charCodeAt(0), 0xfeff, "a BOM so a spreadsheet reads accents");
  const [head, row, tail] = csv.slice(1).split("\r\n");
  assert.equal(head, "name,whatsapp_name,phone,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist");
  assert.equal(row, `"Dani, Jr.",'=cmd,'+19175550100,opted_in,keyword,2026-08-01 08:00,unknown,,,no,whatsapp voice,2,1,0,2026-07-01 08:00,2026-09-01 08:00,,,auto`);
  assert.equal(tail, "", "CRLF rows, trailing newline");
});

test("the export carries the consent a carrier audit asks about", () => {
  // A regulator or a carrier checking a promotional send wants express consent to
  // receive MARKETING specifically (CTIA §5.1). Of the two axes this file carried
  // only the one that does not answer that question, so the export could not
  // evidence the very thing it would be requested for.
  const names = X.PEOPLE_COLUMNS.map(([n]) => n);
  for (const n of ["offers_consent", "offers_consent_source", "offers_consent_updated"]) {
    assert.ok(names.includes(n), n);
  }
  assert.ok(names.indexOf("offers_consent") === names.indexOf("consent_updated") + 1, "beside the answer it is not");
  // A row that never projected the columns reads "unknown", never blank: an empty
  // cell in a consent export reads as "we lost it" rather than "never asked".
  const bare = [{ id: "p1", display_name: "A", phone_e164: "+1", consent: "opted_in", dnc: false }];
  const cells = X.peopleCsv(bare, TZ).slice(1).split("\r\n")[1].split(",");
  assert.equal(cells[X.PEOPLE_COLUMNS.findIndex(([n]) => n === "offers_consent")], "unknown");
});

test("a download is an attachment, private, with a safe name and the real one", () => {
  const res = X.attachment("people-Melany's Salón-20260905.csv", "﻿a,b\r\n", "text/csv");
  assert.ok(res instanceof Response);
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const cd = res.headers.get("content-disposition");
  assert.ok(cd.startsWith('attachment; filename="people-Melany\'s Sal_n-20260905.csv"'), cd);
  assert.ok(cd.includes("filename*=UTF-8''people-Melany's%20Sal%C3%B3n-20260905.csv"));
  assert.equal(X.safeName("Melany's Beauty Salón!"), "Melany-s-Beauty-Salon");
  assert.equal(X.safeName("   "), "export");
  assert.equal(X.dateTag(new Date("2026-09-05T03:30:00Z"), TZ), "20260904", "the day in the business's zone");
});

test("the wrapper passes a Response through under the no-store rule", () => {
  const wr = readCode("apps/dashboard/src/server/with-route.ts");
  assert.ok(wr.includes("if (data instanceof Response) {"));
  assert.ok(wr.includes('data.headers.set("cache-control", PRIVATE["cache-control"]);'));
  assert.ok(wr.includes("): Promise<Response> => {"), "the declared return type widened with it");
});

test("the three routes keep their doors: rate bucket, a named workspace, owner only for everyone", () => {
  const conv = readCode("apps/dashboard/app/api/v1/conversations/[id]/export/route.ts");
  const call = readCode("apps/dashboard/app/api/v1/calls/[id]/export/route.ts");
  const people = readCode("apps/dashboard/app/api/v1/contacts/export/route.ts");
  for (const [name, src] of [["conversation", conv], ["call", call], ["people", people]]) {
    // Declared on the export (route()): the bucket, and the workspace the tab named.
    assert.ok(src.includes('rate: "export",'), `${name}: rate bucket`);
    assert.ok(src.includes("scope: workspace,"), `${name}: the workspace comes from the request`);
    assert.ok(src.includes(".eq(\"tenant_id\", member.tenantId)") || src.includes("listPeople(ctx, member.tenantId)"), `${name}: scoped to the named workspace`);
    assert.ok(src.includes("return attachment("), `${name}: a file`);
  }
  assert.ok(people.includes('role: "owner",'), "only an owner exports everyone");
  assert.ok(people.includes("strict: true,"), "a bulk export never lands in a workspace nobody chose");
  assert.ok(conv.includes("for (let page = 0; page < MAX_PAGES; page++) {"), "the whole thread, not the screen's page");
  assert.deepEqual([ROLE_PERMS.owner.export, ROLE_PERMS.operator.export, ROLE_PERMS.viewer.export], [true, false, false]);
  const limits = readCode("apps/dashboard/src/server/rate-limit.ts");
  assert.ok(limits.includes('export: { limit: 10, windowMs: 60_000, noun: "exports" }'));
});

test("the pages link to the routes, and only where the bridge can name the workspace", () => {
  const conv = readRaw("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(conv.includes("{!window.__DEMO_MODE && window.__scoped && ("));
  assert.ok(conv.includes("href={window.__scoped(isCall ? `/api/v1/calls/${c.callId}/export` : `/api/v1/conversations/${c.id}/export`)}"));
  const people = readRaw("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(people.includes('href={window.__scoped("/api/v1/contacts/export")}'));
  assert.ok(people.includes('window.canDo && !window.canDo("export")'), "a non-owner sees a disabled button that says why, not a refusal");
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(bridge.includes("window.__scoped = scoped;"));
  assert.ok(readCode("apps/dashboard/src/legacy/components/data-bits.jsx").includes('export: "export the customer list"'));
  // The list route and the export share one reading of who exists.
  const list = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(list.includes("return withVisits(ctx, tenantId, await listPeople(ctx, tenantId));"), "the same rows the export reads, with their appointments");
});
