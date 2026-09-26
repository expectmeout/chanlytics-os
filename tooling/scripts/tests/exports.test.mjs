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
import { ROLE_PERMS, frameWhisper, roleGate } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";
import { fakeDb } from "./_fake-db.mjs";

// Modules that build a service client on first use read these; nothing here dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const here = path.dirname(fileURLToPath(import.meta.url));
const X = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/export.ts")).href);

const TZ = "America/New_York";
const OPTS = { business: "Marisa's Beauty Salon", tz: TZ, exportedAt: new Date("2026-09-05T15:04:00Z") };
const contact = {
  id: "p1",
  display_name: null,
  wa_profile_name: "Dani 💅",
  phone_e164: "+19175550100",
  consent: null,
  dnc: false,
};
const msg = (over) => ({
  id: "m",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "hi",
  media: null,
  meta: null,
  status: "sent",
  created_at: "2026-09-01T14:00:00Z",
  channel_ts: null,
  ...over,
});

test("stamp writes the business's clock, tolerates a bad zone, and says nothing for no time", () => {
  assert.equal(X.stamp("2026-09-05T15:04:00Z", TZ), "2026-09-05 11:04");
  assert.equal(X.stamp("2026-09-05T03:30:00Z", TZ), "2026-09-04 23:30", "midnight-side, in the zone, h23");
  assert.equal(
    X.stamp("2026-09-05T15:04:00Z", "Not/AZone"),
    "2026-09-05 15:04",
    "unknown zone falls back to UTC instead of a 500",
  );
  assert.equal(X.stamp(null, TZ), "");
  assert.equal(X.stamp("garbage", TZ), "");
});

test("a thread exports oldest first in CHANNEL time, with who said it and what state it was in", () => {
  const text = X.transcriptText(
    { contact },
    [
      msg({
        id: "2",
        sender: "ai",
        direction: "outbound",
        body: "Hi Dani!\nWe open at 10.",
        created_at: "2026-09-01T14:00:30Z",
        channel_ts: "2026-09-01T14:00:31Z",
      }),
      // Written to our table last, but it HAPPENED first: channel time wins.
      msg({ id: "1", body: "hola", created_at: "2026-09-01T14:00:40Z", channel_ts: "2026-09-01T13:59:00Z" }),
      msg({
        id: "3",
        sender: "human",
        direction: "outbound",
        body: "I'll take it from here",
        created_at: "2026-09-01T14:05:00Z",
      }),
      msg({
        id: "4",
        sender: "ai",
        direction: "outbound",
        body: "never sent",
        status: "canceled",
        created_at: "2026-09-01T14:06:00Z",
      }),
      msg({
        id: "5",
        type: "media",
        body: null,
        media: { mime_type: "image/jpeg" },
        created_at: "2026-09-01T14:07:00Z",
      }),
      msg({
        id: "6",
        type: "call_summary",
        sender: "system",
        direction: "inbound",
        body: "Inbound call · 1 min",
        created_at: "2026-09-01T14:08:00Z",
      }),
    ],
    OPTS,
  );
  const lines = text.split("\n");
  assert.equal(lines[0], "Conversation with Dani 💅 (+19175550100)");
  assert.equal(
    lines[1],
    "Marisa's Beauty Salon · WhatsApp · 6 messages · exported 2026-09-05 11:04 · times in America/New_York",
  );
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
    id: "k1",
    retell_call_id: "r",
    direction: "inbound",
    call_type: null,
    status: "ended",
    from_e164: "+19175550100",
    from_raw: null,
    to_e164: null,
    started_at: "2026-09-05T03:00:00Z",
    ended_at: "2026-09-05T03:01:30Z",
    duration_ms: 90_000,
    disconnection_reason: null,
    sentiment: "Positive",
    call_successful: true,
    in_voicemail: false,
    summary: "Asked about balayage; sent the booking link.",
    transcript_object: [
      { role: "agent", content: "Thanks for calling!", start: 0.4 },
      { role: "user", content: "Do you do balayage?", start: 4.2 },
      { role: "injected", content: frameWhisper("mention the Saturday opening") },
      { role: "agent", content: "We do. Saturday has an opening.", words: [{ start: 61.5 }] },
    ],
    recording: null,
    conversation_id: null,
    contact_id: "p1",
    message_id: null,
    created_at: "",
    updated_at: "",
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550100" },
  };
  const text = X.callText(call, OPTS);
  const lines = text.split("\n");
  assert.equal(lines[0], "Phone call with Daniela Ruiz (+19175550100)");
  assert.equal(
    lines[1],
    "Marisa's Beauty Salon · Inbound call · 2026-09-04 23:00 · 1:30 · exported 2026-09-05 11:04 · times in America/New_York",
  );
  assert.equal(lines[3], "Marked successful · Caller sentiment: Positive");
  assert.equal(lines[5], "Summary");
  assert.equal(lines[6], "Asked about balayage; sent the booking link.");
  assert.equal(lines[8], "Transcript");
  assert.equal(lines[9], "[0:00] Receptionist: Thanks for calling!");
  assert.equal(lines[10], "[0:04] Daniela Ruiz: Do you do balayage?");
  assert.equal(
    lines[11],
    "[--:--] You whispered: mention the Saturday opening",
    "the frame is stripped, the owner's words stay",
  );
  assert.equal(
    lines[12],
    "[1:01] Receptionist: We do. Saturday has an opening.",
    "the raw provider shape still gives a clock",
  );
  const anon = X.callText(
    { ...call, contact: null, summary: null, transcript_object: null, call_successful: null, sentiment: null },
    OPTS,
  );
  assert.ok(anon.startsWith("Phone call with +19175550100\n"), "no name: the number, once");
  assert.ok(anon.includes("(no transcript)"));
  assert.ok(!anon.includes("Summary\n"));
});

test("the CSV quotes what must be quoted and defuses what a spreadsheet would run", () => {
  assert.equal(X.csvCell("plain"), "plain");
  assert.equal(X.csvCell('say "hi", now'), '"say ""hi"", now"');
  assert.equal(
    X.csvCell('=HYPERLINK("http://x")'),
    '"\'=HYPERLINK(""http://x"")"',
    "a formula in a WhatsApp name is text",
  );
  assert.equal(X.csvCell("+19175550100"), "'+19175550100", "a phone keeps its plus instead of being summed");
  assert.equal(X.csvCell(null), "");
  assert.equal(X.csvCell(true), "yes");
  assert.equal(X.csvCell(0), "0");
  const rows = [
    {
      id: "p1",
      display_name: "Dani, Jr.",
      wa_profile_name: "=cmd",
      phone_e164: "+19175550100",
      email: "dani@example.com",
      consent: "opted_in",
      consent_source: "keyword",
      consent_updated_at: "2026-08-01T12:00:00Z",
      // The OTHER answer. This person answers the business and has NOT asked for
      // offers, which is the ordinary case and the one an audit needs to be able to
      // tell apart -- and the columns this file carried could not.
      marketing_consent: "unknown",
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      dnc: false,
      channels: ["whatsapp", "voice"],
      conversation_count: 2,
      escalation_count: 0,
      call_count: 1,
      first_contact_at: "2026-07-01T12:00:00Z",
      last_message_at: "2026-09-01T12:00:00Z",
      last_inbound_at: null,
      last_call_at: null,
      effective_reply_mode: "auto",
    },
  ];
  const csv = X.peopleCsv(rows, TZ);
  assert.equal(csv.charCodeAt(0), 0xfeff, "a BOM so a spreadsheet reads accents");
  const [head, row, tail] = csv.slice(1).split("\r\n");
  assert.equal(
    head,
    "name,whatsapp_name,phone,email,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist",
  );
  assert.equal(
    row,
    `"Dani, Jr.",'=cmd,'+19175550100,dani@example.com,opted_in,keyword,2026-08-01 08:00,unknown,,,no,whatsapp voice,2,1,0,2026-07-01 08:00,2026-09-01 08:00,,,auto`,
  );
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
  const res = X.attachment("people-Marisa's Salón-20260905.csv", "﻿a,b\r\n", "text/csv");
  assert.ok(res instanceof Response);
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const cd = res.headers.get("content-disposition");
  assert.ok(cd.startsWith('attachment; filename="people-Marisa\'s Sal_n-20260905.csv"'), cd);
  assert.ok(cd.includes("filename*=UTF-8''people-Marisa's%20Sal%C3%B3n-20260905.csv"));
  assert.equal(X.safeName("Marisa's Beauty Salón!"), "Marisa-s-Beauty-Salon");
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
  for (const [name, src] of [
    ["conversation", conv],
    ["call", call],
    ["people", people],
  ]) {
    // Declared on the export (route()): the bucket, and the workspace the tab named.
    assert.ok(src.includes('rate: "export",'), `${name}: rate bucket`);
    assert.ok(src.includes("scope: workspace,"), `${name}: the workspace comes from the request`);
    assert.ok(
      src.includes('.eq("tenant_id", member.tenantId)') || src.includes("everyone(ctx, member.tenantId)"),
      `${name}: scoped to the named workspace`,
    );
    assert.ok(src.includes("return attachment("), `${name}: a file`);
  }
  assert.ok(people.includes('role: "owner",'), "only an owner exports everyone");
  // everyone(), not listPeople(): one people_list call is capped at 1000 rows in
  // the database, so the CSV that says it is the whole customer list has to page.
  assert.ok(people.includes("everyone(ctx, member.tenantId)"), "the CSV is everyone, not the first page of them");
  // Every read of a workspace refuses an account in two that named neither (plan 3.4, run in route-definition.test.mjs); the export was the first to insist.
  assert.ok(conv.includes("for (let page = 0; page < MAX_PAGES; page++) {"), "the whole thread, not the screen's page");
  // Offset paging under a TOTAL order, as the workspace bundle does. The old
  // `.lt(created_at, before)` cursor stepped strictly past the last row on a
  // page, so two messages written in one transaction -- identical timestamps --
  // lost every one tied with the boundary, silently, from the file whose whole
  // promise is "every message".
  assert.ok(!conv.includes('.lt("created_at"'), "no cursor that can step over a tie");
  assert.ok(
    conv.includes('.order("created_at", { ascending: true })') && conv.includes('.order("id", { ascending: true })'),
    "created_at then id: a total order",
  );
  assert.ok(conv.includes(".range(page * PAGE, page * PAGE + PAGE - 1)"), "and offset paging under it");
  assert.deepEqual(
    [ROLE_PERMS.owner.export, ROLE_PERMS.operator.export, ROLE_PERMS.viewer.export],
    [true, false, false],
  );
  const limits = readCode("apps/dashboard/src/server/rate-limit.ts");
  assert.ok(limits.includes('export: { limit: 10, windowMs: 60_000, noun: "exports" }'));
});

test("the pages link to the routes, and only where the bridge can name the workspace", () => {
  // A conversation's file is in its thread's menu (one-thread.test.mjs), a call's under its transcript
  // (calls-in-the-thread.test.mjs): both run there, off a demo and only with the bridge.
  const people = readRaw("apps/dashboard/src/legacy/pages/people.jsx");
  // Everyone, or the list that is open (decision 0009), by its token.
  assert.ok(people.includes("href={exportHref}"));
  assert.ok(people.includes('window.__href("GET contacts/export", undefined, exportName ? { list:'));
  assert.ok(
    people.includes('window.canDo && !window.canDo("export")'),
    "a non-owner sees a disabled button that says why, not a refusal",
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(bridge.includes("window.__href = href;"));
  assert.equal(
    roleGate("operator", "export").reason,
    "Only an owner can export the customer list.",
    "the Export a non-owner sees says why, in contracts' words",
  );
  // The list route and the export share one reading of who exists, with their appointments, a page at a time: run in
  // readers.test.mjs, where GET contacts' rows are everyone()'s with the same reply modes.
});

/* ----------------------------------------------------------------------------
 * THE WHOLE WORKSPACE. The privacy page has said "an owner can export a
 * workspace's data" since it was written; three partial routes were the whole
 * of it. The bundle is composed here over readers in memory, and the route is
 * run over a database in memory: what is proved is every section, every page,
 * the door (owners, the workspace named, the export bucket) and that the file
 * parses.
 * ------------------------------------------------------------------------- */
const B = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/export-bundle.ts")).href);

test("the bundle is one JSON document: every section, every page, in order, never held whole", async () => {
  const asked = [];
  const convs = [
    {
      id: "c1",
      contact_id: "p1",
      state: "open",
      created_at: "2026-08-01T10:00:00Z",
      last_message_at: "2026-08-01T10:05:00Z",
      last_inbound_at: null,
    },
    {
      id: "c2",
      contact_id: "p2",
      state: "archived",
      created_at: "2026-08-02T10:00:00Z",
      last_message_at: null,
      last_inbound_at: null,
    },
    {
      id: "c3",
      contact_id: "p3",
      state: "open",
      created_at: "2026-08-03T10:00:00Z",
      last_message_at: null,
      last_inbound_at: null,
    },
  ];
  const msgs = { c1: [msg({ id: "m1" }), msg({ id: "m2" }), msg({ id: "m3" })], c2: [], c3: [msg({ id: "m4" })] };
  // Three of them, over a page size of two: people used to be read as ONE call,
  // whose answer people_list caps at 1000 rows in the database -- so a workspace
  // above that downloaded a bundle short by everyone after the first page, with
  // no error, no flag, and no way to tell it from the whole thing.
  const people = [
    { id: "p1", display_name: "Dani", phone_e164: "+19175550100", consent: "opted_in", dnc: false },
    { id: "p2", display_name: "Sam", phone_e164: "+19175550101", consent: "opted_in", dnc: false },
    { id: "p3", display_name: "Ola", phone_e164: "+19175550102", consent: "unknown", dnc: false },
  ];
  const readers = {
    people: async (o, l) => {
      asked.push(["people", o, l]);
      return people.slice(o, o + l);
    },
    conversations: async (o, l) => {
      asked.push(["conversations", o, l]);
      return convs.slice(o, o + l);
    },
    messages: async (id, o, l) => {
      asked.push(["messages", id, o, l]);
      return (msgs[id] ?? []).slice(o, o + l);
    },
    calls: async (o, l) => {
      asked.push(["calls", o, l]);
      return [{ id: "k1", direction: "inbound", started_at: "2026-08-01T09:00:00Z" }].slice(o, o + l);
    },
    consentHistory: async (o, l) => {
      asked.push(["consent", o, l]);
      return [
        {
          id: "e1",
          contact_id: "p1",
          at: "2026-08-01T10:01:00Z",
          purpose: "conversational",
          consent: "opted_in",
          previous: "unknown",
          source: "customer_message",
          by: null,
          note: null,
        },
      ].slice(o, o + l);
    },
  };
  const chunks = [];
  for await (const c of B.workspaceBundle(readers, {
    workspaceId: "t1",
    business: "Marisa's Beauty Salon",
    tz: TZ,
    exportedAt: new Date("2026-09-12T03:00:00Z"),
    page: 2,
  }))
    chunks.push(c);
  assert.ok(chunks.length > 8, "written a piece at a time, not as one string");
  const doc = JSON.parse(chunks.join(""));
  assert.equal(doc.format, B.BUNDLE_FORMAT);
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.workspace, {
    id: "t1",
    name: "Marisa's Beauty Salon",
    timezone: TZ,
    exported_at: "2026-09-12T03:00:00.000Z",
  });
  assert.deepEqual(Object.keys(doc), [
    "format",
    "version",
    "workspace",
    "people",
    "conversations",
    "calls",
    "consent_history",
  ]);
  assert.deepEqual(
    doc.people.map((p) => p.id),
    ["p1", "p2", "p3"],
    "every person, across page boundaries",
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "people"),
    [
      ["people", 0, 2],
      ["people", 2, 2],
    ],
    "paged like every other section",
  );
  assert.deepEqual(
    doc.conversations.map((c) => [c.id, c.messages.map((m) => m.id)]),
    [
      ["c1", ["m1", "m2", "m3"]],
      ["c2", []],
      ["c3", ["m4"]],
    ],
    "every conversation with every message, across page boundaries",
  );
  assert.deepEqual(
    doc.calls.map((k) => k.id),
    ["k1"],
  );
  assert.deepEqual(doc.consent_history, [
    {
      id: "e1",
      contact_id: "p1",
      at: "2026-08-01T10:01:00Z",
      purpose: "conversational",
      consent: "opted_in",
      previous: "unknown",
      source: "customer_message",
      by: null,
      note: null,
    },
  ]);
  // Paged, and paged to the end: a full page is followed by another read, a
  // short one ends the section.
  assert.deepEqual(
    asked.filter((a) => a[0] === "conversations"),
    [
      ["conversations", 0, 2],
      ["conversations", 2, 2],
    ],
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "messages" && a[1] === "c1"),
    [
      ["messages", "c1", 0, 2],
      ["messages", "c1", 2, 2],
    ],
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "messages" && a[1] === "c2"),
    [["messages", "c2", 0, 2]],
  );
  assert.ok(chunks.join("").endsWith("}\n"), "ends like a file");
  // Nothing at all is still a document.
  const empty = {
    people: async () => [],
    conversations: async () => [],
    messages: async () => [],
    calls: async () => [],
    consentHistory: async () => [],
  };
  let text = "";
  for await (const c of B.workspaceBundle(empty, {
    workspaceId: "t1",
    business: "New",
    tz: TZ,
    exportedAt: new Date("2026-09-12T03:00:00Z"),
  }))
    text += c;
  assert.deepEqual(JSON.parse(text).people, []);
  assert.deepEqual(JSON.parse(text).consent_history, []);
});

test("a consent change is read the way the two doors write it: which question, how, by whom", () => {
  const row = {
    id: "e1",
    subject_id: "p1",
    created_at: "2026-08-01T10:01:00Z",
    data: {
      consent: "opted_in",
      source: "in_person",
      previous: "unknown",
      by: "u1",
      note: "asked at the desk",
      purpose: "marketing",
    },
  };
  assert.deepEqual(B.consentChangeOf(row), {
    id: "e1",
    contact_id: "p1",
    at: "2026-08-01T10:01:00Z",
    purpose: "marketing",
    consent: "opted_in",
    previous: "unknown",
    source: "in_person",
    by: "u1",
    note: "asked at the desk",
    channel: null,
    message_external_id: null,
    words: null,
  });
  assert.equal(
    B.consentChangeOf({ ...row, data: { consent: "opted_out", source: "customer_message" } }).purpose,
    "conversational",
    "the visit door writes no purpose (00043); the offers door writes 'marketing' (00095)",
  );
  assert.deepEqual(B.consentChangeOf({ ...row, data: null }), {
    id: "e1",
    contact_id: "p1",
    at: "2026-08-01T10:01:00Z",
    purpose: "conversational",
    consent: null,
    previous: null,
    source: null,
    by: null,
    note: null,
    channel: null,
    message_external_id: null,
    words: null,
  });
});

test("GET /export: owners only, the workspace named, one JSON file that parses and carries every section", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const route = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/export/route.ts")).href);
  assert.deepEqual(
    route.GET.policy,
    { kind: "read", scope: "workspace", role: "owner", rate: "export", spend: false },
    "the whole customer record: owners, in the workspace the tab named, ten a minute like the CSV",
  );
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tables = (role) => ({
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
    policies: [],
    conversations: [
      {
        id: "c2",
        tenant_id: T,
        contact_id: "p2",
        state: "open",
        created_at: "2026-08-02T10:00:00Z",
        last_message_at: null,
        last_inbound_at: null,
      },
      {
        id: "c1",
        tenant_id: T,
        contact_id: "p1",
        state: "open",
        created_at: "2026-08-01T10:00:00Z",
        last_message_at: "2026-08-01T10:00:00Z",
        last_inbound_at: "2026-08-01T10:00:00Z",
      },
    ],
    messages: [
      {
        id: "m2",
        conversation_id: "c1",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: "Hola Dani",
        media: null,
        meta: null,
        status: "sent",
        created_at: "2026-08-01T10:00:30Z",
        channel_ts: null,
      },
      {
        id: "m1",
        conversation_id: "c1",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "hola",
        media: null,
        meta: null,
        status: "sent",
        created_at: "2026-08-01T10:00:00Z",
        channel_ts: null,
      },
    ],
    calls: [
      {
        id: "k1",
        tenant_id: T,
        retell_call_id: "r1",
        direction: "inbound",
        call_type: "phone_call",
        status: "ended",
        from_e164: "+19175550100",
        from_raw: null,
        to_e164: "+19296566623",
        started_at: "2026-08-01T09:00:00Z",
        ended_at: "2026-08-01T09:02:00Z",
        updated_at: "2026-08-01T09:02:00Z",
        created_at: "2026-08-01T09:00:00Z",
        duration_ms: 120000,
        disconnection_reason: null,
        sentiment: null,
        call_successful: true,
        in_voicemail: false,
        summary: "Asked about balayage.",
        wanted: null,
        outcome: null,
        follow_up: null,
        caller_name: null,
        transcript_object: [{ role: "agent", content: "Hi", words: [{ start: 0 }] }],
        recording: { fetch_state: "stored", storage_path: `${T}/calls/k1.wav`, mime: "audio/wav", bytes: 10 },
        conversation_id: "c1",
        contact_id: "p1",
        message_id: null,
        contacts: { display_name: "Dani", wa_profile_name: null, phone_e164: "+19175550100" },
      },
    ],
    events: [
      {
        id: "e1",
        tenant_id: T,
        kind: "contact.consent_changed",
        subject_id: "p1",
        created_at: "2026-08-01T10:01:00Z",
        data: { consent: "opted_in", source: "customer_message", previous: null },
      },
      { id: "e2", tenant_id: T, kind: "message.sent", subject_id: "m1", created_at: "2026-08-01T10:02:00Z", data: {} },
    ],
  });
  const rpcs = {
    people_list: () => [
      {
        id: "p1",
        display_name: "Dani",
        wa_profile_name: null,
        phone_e164: "+19175550100",
        consent: "opted_in",
        consent_source: "customer_message",
        dnc: false,
      },
    ],
  };
  const req = new Request(`http://localhost/api/v1/export?workspace=${T}`);
  const ctx = (role) => ({
    supabase: fakeDb(tables(role), {}, rpcs),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const ownerTables = tables("owner");
  const ctxOwner = { supabase: fakeDb(ownerTables, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} };
  const res = await route.GET.run(req, ctxOwner);
  assert.ok(res instanceof Response, "a file, not a JSON envelope");
  assert.match(
    res.headers.get("content-disposition") ?? "",
    /^attachment; filename="workspace-Marisa-s-Beauty-Salon-2026\d{4}\.json"/,
  );
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  const doc = JSON.parse(await res.text());
  assert.equal(doc.workspace.name, "Marisa's Beauty Salon");
  // On the ledger, as erasure is: who took a copy of everything, and when.
  assert.deepEqual(
    (ownerTables.decisions ?? []).map((x) => [x.subject_type, x.subject_id, x.verb, x.payload.what, x.actor_user_id]),
    [["workspace", T, "export", "workspace", "u1"]],
    "on the ledger before the first byte",
  );
  assert.equal(doc.workspace.timezone, TZ);
  assert.deepEqual(
    doc.people.map((p) => p.id),
    ["p1"],
  );
  assert.deepEqual(
    doc.conversations.map((c) => c.id),
    ["c1", "c2"],
    "oldest first, whatever order the table holds them in",
  );
  assert.deepEqual(
    doc.conversations[0].messages.map((m) => m.body),
    ["hola", "Hola Dani"],
    "and the messages in the order they happened",
  );
  assert.equal(doc.calls[0].summary, "Asked about balayage.");
  assert.equal(doc.calls[0].recording.fetch_state, "stored");
  assert.equal("storage_path" in doc.calls[0].recording, false, "the bucket path never leaves the server");
  assert.deepEqual(
    doc.consent_history.map((e) => [e.id, e.consent, e.source]),
    [["e1", "opted_in", "customer_message"]],
    "consent changes only, not every event",
  );
  // An operator holds the same rows and is refused before one is read.
  await assert.rejects(route.GET.run(req, ctx("operator")), (e) => e.status === 403);
  // A tab that named no workspace is refused the way every read is (plan 3.4).
  const two = { ...tables("owner") };
  two.memberships = [
    ...two.memberships,
    {
      user_id: "u1",
      tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      role: "owner",
      tenants: { slug: "other" },
      created_at: "2026-02-01T00:00:00Z",
    },
  ];
  await assert.rejects(
    route.GET.run(new Request("http://localhost/api/v1/export"), {
      supabase: fakeDb(two, {}, rpcs),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    }),
    (e) => e.code === "choose_workspace",
  );
});

test("Settings offers the door the privacy page promises: one link, owners only, and deletion as a request", async () => {
  // The card is rendered, not read: a legacy page's body runs only in a browser,
  // and a component that throws at render takes the whole Settings page with it.
  const HOOKS = {
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
  };
  globalThis.React = {
    Fragment: "Fragment",
    createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
    useState: (i) => HOOKS.useState(i),
    useEffect: (f) => HOOKS.useEffect(f),
    useMemo: (f) => HOOKS.useMemo(f),
    useRef: (v) => HOOKS.useRef(v),
    useCallback: (f) => HOOKS.useCallback(f),
  };
  globalThis.window = {
    __ME: { role: "owner" },
    __href: (key) => `/api/v1/${key.split(" ")[1]}?workspace=t1`,
    canDo: (perm) => perm === "export",
    gate: (perm, doing) =>
      globalThis.window.canDo(perm)
        ? {}
        : { "aria-disabled": true, "data-tip": `Only an owner can ${doing}.`, onClick: (e) => e.preventDefault() },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.Icon = "Icon";
  await import("../../../apps/dashboard/src/legacy/components/record-row.jsx");
  await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");
  const Card = globalThis.window.WorkspaceData;
  assert.equal(typeof Card, "function", "published, or nothing below tests anything");
  const walk = (n, f) => {
    if (!n || typeof n !== "object") return;
    f(n);
    for (const k of n.props?.children ?? []) walk(k, f);
  };
  const render = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (typeof n.type === "function") {
        const inner = n.type(n.props);
        walk(inner, (m) => out.push(m));
      } else out.push(n);
    });
    return out;
  };
  const nodes = render(Card({}));
  const link = nodes.find((n) => n.props?.["data-testid"] === "set-export-all");
  assert.ok(link, "the download link");
  assert.equal(link.props.href, "/api/v1/export?workspace=t1", "the whole-workspace route, in the tab's workspace");
  assert.equal(link.props.download, true);
  const text = JSON.stringify(nodes.map((n) => n.props?.children ?? []));
  assert.ok(text.includes("hi@chanlytics.com"), "deletion is a request, answered by a person");
  assert.ok(text.includes("removed within 30 days"), "in the privacy page's own words");
  assert.ok(text.includes("Call audio is not included"), "and the file says what it does not carry");
  // Not an owner: the link stays on the card, gated -- refused where it is, saying why (the one gate).
  globalThis.window.canDo = () => false;
  const denied = render(Card({}));
  const gated = denied.find((n) => n.props?.["data-testid"] === "set-export-all");
  assert.equal(gated?.props["aria-disabled"], true, "offered, and refused where it is");
  assert.equal(gated.props["data-tip"], "Only an owner can download the workspace's data.");
});

test("everyone as a CSV: owners only, the file, and the ledger row that says who took it", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const csv = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/contacts/export/route.ts")).href
  );
  assert.deepEqual(csv.GET.policy, { kind: "read", scope: "workspace", role: "owner", rate: "export", spend: false });
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tables = (role) => ({
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
    policies: [],
    decisions: [],
  });
  const rpcs = {
    people_list: () => [
      {
        id: "p1",
        display_name: "Dani",
        wa_profile_name: null,
        phone_e164: "+19175550100",
        consent: "opted_in",
        consent_source: "customer_message",
        dnc: false,
      },
      {
        id: "p2",
        display_name: "Bo",
        wa_profile_name: null,
        phone_e164: "+19175550101",
        consent: "unknown",
        dnc: false,
      },
    ],
  };
  const t = tables("owner");
  const ctx = { supabase: fakeDb(t, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} };
  const res = await csv.GET.run(new Request(`http://localhost/api/v1/contacts/export?workspace=${T}`), ctx);
  assert.ok(res instanceof Response);
  assert.match(
    res.headers.get("content-disposition") ?? "",
    /^attachment; filename="people-Marisa-s-Beauty-Salon-2026\d{4}\.csv"/,
  );
  // The bytes, not text(): the Fetch API strips a leading BOM when it decodes,
  // and the BOM is the point (a spreadsheet opens accents right).
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a BOM first");
  const text = new TextDecoder().decode(bytes.slice(3));
  assert.ok(text.startsWith("name,whatsapp_name,phone"));
  assert.equal(text.split("\r\n").length, 4, "a header, two people, the trailing newline");
  assert.deepEqual(
    t.decisions.map((x) => [x.subject_type, x.subject_id, x.verb, x.payload]),
    [["workspace", T, "export", { what: "people", rows: 2 }]],
  );
  // The list that is open (decision 0009): its people, counted as a send counts them, named in the file and on the
  // ledger; a list that isn't here is refused in words, and nothing is taken.
  const S = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
  const listed = {
    ...tables("owner"),
    segments: [{ id: S, tenant_id: T, name: "Regulars", rule: null, archived_at: null }],
    segment_members: [{ segment_id: S, contact_id: "p2", tenant_id: T }],
  };
  const one = await csv.GET.run(new Request(`http://localhost/api/v1/contacts/export?workspace=${T}&list=list:${S}`), {
    supabase: fakeDb(listed, {}, rpcs),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  assert.match(
    one.headers.get("content-disposition") ?? "",
    /^attachment; filename="people-Marisa-s-Beauty-Salon-Regulars-2026\d{4}\.csv"/,
  );
  const oneText = new TextDecoder().decode(new Uint8Array(await one.arrayBuffer()).slice(3));
  assert.equal(oneText.split("\r\n").length, 3, "a header, the one person on it, the trailing newline");
  assert.ok(oneText.includes("Bo") && !oneText.includes("Dani"));
  assert.deepEqual(
    listed.decisions.map((x) => x.payload),
    [{ what: "people", rows: 1, list: `list:${S}`, name: "Regulars" }],
  );
  await assert.rejects(
    csv.GET.run(
      new Request(
        `http://localhost/api/v1/contacts/export?workspace=${T}&list=list:cccccccc-1111-4111-8111-cccccccccccc`,
      ),
      { supabase: fakeDb(listed, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} },
    ),
    (e) => e.status === 404 && e.message === "That list isn't here.",
  );
  assert.equal(listed.decisions.length, 1, "nothing on the ledger for a copy not taken");
  // One of People's, by its token: who said yes to messages.
  const saidYes = await csv.GET.run(
    new Request(`http://localhost/api/v1/contacts/export?workspace=${T}&list=seg:opted_in`),
    { supabase: fakeDb(listed, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} },
  );
  const saidText = new TextDecoder().decode(new Uint8Array(await saidYes.arrayBuffer()).slice(3));
  assert.ok(saidText.includes("Dani") && !saidText.includes("Bo"), saidText);
  // A list that can't be counted here (it reads visits; no calendar is read) is refused in its words, and not taken.
  const U = "dddddddd-1111-4111-8111-dddddddddddd";
  listed.segments.push({
    id: U,
    tenant_id: T,
    name: "Booked soon",
    rule: { v: 2, all: [{ field: "booked", op: "is", yes: true }] },
    archived_at: null,
  });
  await assert.rejects(
    csv.GET.run(new Request(`http://localhost/api/v1/contacts/export?workspace=${T}&list=list:${U}`), {
      supabase: fakeDb(listed, {}, rpcs),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    }),
    (e) => e.status === 409 && e.message.startsWith("Booked soon can't be counted here."),
  );
  assert.equal(listed.decisions.length, 2, "the one list taken, and nothing for the refused one");
  await assert.rejects(
    csv.GET.run(new Request(`http://localhost/api/v1/contacts/export?workspace=${T}`), {
      supabase: fakeDb(tables("operator"), {}, rpcs),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    }),
    (e) => e.status === 403,
  );
});
