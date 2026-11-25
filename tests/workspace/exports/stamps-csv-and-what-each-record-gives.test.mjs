/**
 * The owner's copy: the business's clock on every stamp, a thread's wires, a CSV that defuses what a spreadsheet would
 * run, a private download with a safe name, the pages' links, and how every kind of record reaches the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPORT_OF,
  EXPORT_SECTIONS,
  RECORD_KINDS,
  ROLE_PERMS,
  exportLeftOut,
  exportLeftOutWords,
  exportedSections,
  frameWhisper,
  roleGate,
  toCallVM,
} from "@chanlytics/contracts";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importSrc } from "../../_source.mjs";
import { B, OPTS, PAGED, TZ, X, contact, exportLink, msg, pagedSections } from "./_exports.mjs";

test("stamp writes the business's clock, tolerates a bad zone, and says nothing for no time", () => {
  assert.equal(X.exportStamp("2026-09-05T15:04:00Z", TZ), "2026-09-05 11:04");
  assert.equal(X.exportStamp("2026-09-05T03:30:00Z", TZ), "2026-09-04 23:30", "midnight-side, in the zone, h23");
  assert.equal(
    X.exportStamp("2026-09-05T15:04:00Z", "Not/AZone"),
    "2026-09-05 15:04",
    "unknown zone falls back to UTC instead of a 500",
  );
  assert.equal(X.exportStamp(null, TZ), "");
  assert.equal(X.exportStamp("garbage", TZ), "");
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
  assert.equal(lines[4], "[2026-09-01 10:00] AI: Hi Dani!");
  assert.equal(lines[5], "    We open at 10.", "a second line stays inside its entry");
  assert.equal(lines[6], "[2026-09-01 10:05] Staff: I'll take it from here");
  assert.equal(lines[7], "[2026-09-01 10:06] AI: [withdrawn] never sent");
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
  assert.equal(lines[9], "[0:00] AI: Thanks for calling!");
  assert.equal(lines[10], "[0:04] Daniela Ruiz: Do you do balayage?");
  assert.equal(
    lines[11],
    "[--:--] You whispered: mention the Saturday opening",
    "the frame is stripped, the owner's words stay",
  );
  assert.equal(
    lines[12],
    "[1:02] AI: We do. Saturday has an opening.",
    "the raw provider shape still gives a clock, rounded to the second as the page's is (61.5 s is 1:02 on Live too)",
  );
  const anon = X.callText(
    { ...call, contact: null, summary: null, transcript_object: null, call_successful: null, sentiment: null },
    OPTS,
  );
  assert.ok(anon.startsWith("Phone call with +19175550100\n"), "no name: the number, once");
  assert.ok(anon.includes("(no transcript)"));
  assert.ok(!anon.includes("Summary\n"));
});

test("a thread says the wires it travelled, and each line its own where there are two (R14 X4): it said WhatsApp for every channel", () => {
  const text = X.transcriptText(
    { contact },
    [
      msg({ id: "1", body: "hola", channel: "whatsapp", created_at: "2026-09-01T14:00:00Z" }),
      msg({ id: "2", body: "texting now", channel: "sms", created_at: "2026-09-01T14:01:00Z" }),
      msg({
        id: "3",
        type: "call_summary",
        sender: "system",
        body: "Inbound call · 1 min",
        created_at: "2026-09-01T14:02:00Z",
      }),
    ],
    OPTS,
  );
  const lines = text.split("\n");
  assert.equal(
    lines[1],
    "Marisa's Beauty Salon · WhatsApp, Text · 3 messages · exported 2026-09-05 11:04 · times in America/New_York",
  );
  assert.equal(lines[3], "[2026-09-01 10:00] WhatsApp · Dani 💅: hola");
  assert.equal(lines[4], "[2026-09-01 10:01] Text · Dani 💅: texting now");
  assert.equal(lines[5], "[2026-09-01 10:02] Dani 💅: [call] Inbound call · 1 min", "a call's note travelled no wire");
  const email = X.transcriptText({ contact }, [msg({ id: "1", body: "Hello", channel: "email" })], OPTS).split("\n");
  assert.equal(
    email[1],
    "Marisa's Beauty Salon · Email · 1 message · exported 2026-09-05 11:04 · times in America/New_York",
  );
  assert.equal(email[3], "[2026-09-01 10:00] Dani 💅: Hello", "one wire, said once in the head");
});

test("a call's file leads with what the call card does: what they wanted, how it ended, what it left to do (R14 X4)", () => {
  const call = {
    id: "k3",
    direction: "inbound",
    status: "ended",
    from_e164: "+19175550100",
    started_at: "2026-09-05T03:00:00Z",
    duration_ms: 60_000,
    disconnection_reason: null,
    in_voicemail: false,
    call_successful: null,
    sentiment: null,
    summary: null,
    transcript_object: [],
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550100" },
    wanted: "A balayage on Saturday",
    outcome: "callback_needed",
    follow_up: "Call back to confirm Saturday",
    caller_name: "Dani",
  };
  assert.ok(
    X.callText(call, OPTS).includes(
      "Wanted: A balayage on Saturday\nHow it ended: Needs a call back\nTo do: Call back to confirm Saturday\nGave their name as Dani\n",
    ),
  );
  // Voicemail is said once, among the facts.
  const voicemail = X.callText(
    { ...call, outcome: "voicemail", in_voicemail: true, wanted: null, follow_up: null },
    OPTS,
  );
  assert.equal(voicemail.split("Reached voicemail").length, 2, "once");
  assert.equal(voicemail.includes("How it ended"), false);
});

test("REGRESSION: a call's length in the export is the call card's (contracts callLength), rounded to the second and none for a call with no length -- it floored, 2:04 where the card says 2:05, and printed 0:00 for a length below zero", () => {
  const call = {
    id: "k2",
    retell_call_id: "r2",
    direction: "inbound",
    call_type: null,
    status: "ended",
    from_e164: "+19175550100",
    from_raw: null,
    to_e164: null,
    started_at: "2026-09-05T03:00:00Z",
    ended_at: "2026-09-05T03:02:05Z",
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: false,
    summary: null,
    transcript_object: null,
    recording: null,
    conversation_id: null,
    contact_id: "p1",
    message_id: null,
    created_at: "",
    updated_at: "",
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550100" },
  };
  const header = (ms) => X.callText({ ...call, duration_ms: ms }, OPTS).split("\n")[1];
  const saying = (length) =>
    `Marisa's Beauty Salon · Inbound call · 2026-09-04 23:00${length ? ` · ${length}` : ""} · exported 2026-09-05 11:04 · times in America/New_York`;
  const card = (ms) => toCallVM({ ...call, duration_ms: ms }, TZ, OPTS.exportedAt).duration;
  for (const [ms, length] of [
    [124_600, "2:05"],
    [124_500, "2:05"],
    [124_400, "2:04"],
    [3_599_999, "60:00"],
    [999, "0:01"],
    [499, "0:00"],
    [-1, undefined],
    [-1_500, undefined],
    [0, undefined],
    [null, undefined],
    [NaN, undefined],
    [Infinity, undefined],
    [-Infinity, undefined],
  ]) {
    assert.equal(header(ms), saying(length), `${ms} ms`);
    assert.equal(card(ms), length, `${ms} ms: the call card says the same`);
  }
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
    "name,whatsapp_name,phone,email,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist,email_offers,email_offers_source,email_offers_updated,email_unreachable_since,consent_covers,offers_covers",
  );
  assert.equal(
    row,
    `"Dani, Jr.",'=cmd,'+19175550100,dani@example.com,opted_in,keyword,2026-08-01 08:00,unknown,,,no,whatsapp voice,2,1,0,2026-07-01 08:00,2026-09-01 08:00,,,auto,unknown,,,,whatsapp,`,
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

test("a customer who unsubscribed from your emails says so in the file, with how and when, and what each yes covers (R14 X3)", () => {
  // Pressing Unsubscribe in a campaign email left the row as anyone's: do_not_contact no, offers unknown, the address
  // filled in. Taken to another mailing tool, the file mailed them.
  const rows = [
    {
      id: "p1",
      display_name: "Ana",
      phone_e164: "+19175550100",
      email: "ana@example.com",
      consent: "opted_in",
      consent_channels: ["whatsapp", "sms"],
      marketing_consent: "opted_in",
      marketing_channels: null,
      email_marketing: "opted_out",
      email_marketing_source: "unsubscribe_link",
      email_marketing_updated_at: "2026-09-02T12:00:00Z",
      email_suppressed_at: "2026-09-03T12:00:00Z",
      dnc: false,
    },
  ];
  const [head, row] = X.peopleCsv(rows, TZ).slice(1).split("\r\n");
  const cell = (name) => row.split(",")[head.split(",").indexOf(name)];
  assert.equal(cell("email_offers"), "opted_out");
  assert.equal(cell("email_offers_source"), "unsubscribe_link");
  assert.equal(cell("email_offers_updated"), "2026-09-02 08:00");
  assert.equal(cell("email_unreachable_since"), "2026-09-03 08:00", "and when the address stopped being sent to");
  assert.equal(cell("consent_covers"), "whatsapp sms", "the channels the yes covers");
  assert.equal(cell("offers_covers"), "whatsapp", "a yes kept before the channels were covers WhatsApp alone");
  // Appended: a sheet that reads the columns before them by place reads them as it did.
  const names = X.PEOPLE_COLUMNS.map(([n]) => n);
  assert.equal(names.indexOf("email_offers"), names.indexOf("receptionist") + 1);
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

test("the wrapper passes a file through under the no-store rule, and keeps a private rule a route set itself", async () => {
  // Through the real route wrapper, signed in by a bearer token a stand-in verifies (auth/bearer.test.mjs's way in).
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { setBearerVerifier } = await import(at("apps/dashboard/src/server/shared/auth/bearer.ts"));
  const { withRoute } = await import(at("apps/dashboard/src/server/shared/with-route.ts"));
  const part = (v) => Buffer.from(v).toString("base64url");
  const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");
  const prev = setBearerVerifier(async () => ({ supabase: {}, claims: { sub: "u-1" }, error: null }));
  const file = (cache) =>
    withRoute(async () => new Response("a,b\r\n", { headers: { "content-type": "text/csv", "cache-control": cache } }));
  const call = (route) =>
    route(new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${JWT}` } }), {
      params: Promise.resolve({}),
    });
  try {
    const leaked = await call(file("public, max-age=600"));
    assert.equal(
      leaked.headers.get("cache-control"),
      "private, no-store",
      "a file is never stored where others read it",
    );
    assert.equal(await leaked.text(), "a,b\r\n", "and it is the file, not an envelope");
    const own = await call(file("private, max-age=0"));
    assert.equal(own.headers.get("cache-control"), "private, max-age=0", "a route's own private rule stands");
  } finally {
    setBearerVerifier(prev);
  }
});

test("the three routes keep their doors: rate bucket, a named workspace, owner only for everyone", async () => {
  // Declared on each export (route()) and held by route-policy.json: the export bucket, the workspace the tab named, and
  // everyone's CSV the owner's alone. Each is run in exports/the-routes-and-the-people-csv.test.mjs: everyone as a CSV,
  // owners only; a thread's file of every message past 10,000, and of messages tied on one instant across every
  // page's edge, under a total order (created_at, then id) and offset paging (the old cursor stepped over a tie); and a
  // thread of another workspace, not found. Every read of a workspace refuses an account in two that named neither
  // (plan 3.4, run in route-definition.test.mjs).
  assert.deepEqual(
    [ROLE_PERMS.owner.export, ROLE_PERMS.operator.export, ROLE_PERMS.viewer.export],
    [true, false, false],
  );
  const { RATE } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  assert.deepEqual(RATE.export, { limit: 10, windowMs: 60_000, noun: "exports" }, "ten files a minute");
});

test("the pages link to the routes, and only where the bridge can name the workspace", async () => {
  // A conversation's file is in its thread's menu (one-thread.test.mjs), a call's under its transcript
  // (calls-in-the-thread.test.mjs): both run there, off a demo and only with the bridge.
  // Everyone, or the list that is open (decision 0009), by its token: the link the page builds, run, in a tab of the
  // workspace it is drawn in (the route needs the workspace named, like every other request).
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { location: { pathname: "/w/studio" } };
  try {
    const link = (list) => new URL(exportLink(list), "https://app.chanlytics.com");
    const everyone = link(undefined);
    assert.equal(everyone.pathname, "/api/v1/contacts/export");
    assert.deepEqual([...everyone.searchParams], [["workspace", "studio"]], "everyone: nothing but the workspace");
    const one = link("list:s1");
    assert.equal(one.pathname, "/api/v1/contacts/export");
    assert.deepEqual(
      [...one.searchParams],
      [
        ["list", "list:s1"],
        ["workspace", "studio"],
      ],
      "or the list that is open",
    );
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
  // The desk's file is a quiet Export button after Columns (page/file-acts.tsx), drawn and pressed in
  // people/people-page/people-on-a-phone.test.mjs: the link is opened in place, and a role that may not take it sees
  // the button gated with the role's reason, and pressing it opens nothing.
  assert.equal(
    roleGate("operator", "export").reason,
    "Only an owner can export the customer list.",
    "the Export a non-owner sees says why, in contracts' words",
  );
  // A thread's and a call's file are links the bridge builds, the workspace named: provided by the bridge
  // (installInboxVerbs), off a demo none.
  globalThis.window = { location: { pathname: "/w/studio" } };
  try {
    const { hrefOf, hasHref } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");
    const { installInboxVerbs } = await importSrc("apps/dashboard/src/bridge/inbox-verbs.ts");
    installInboxVerbs();
    assert.equal(hasHref(), true, "the bridge provides the link maker");
    const thread = new URL(hrefOf("GET conversations/[id]/export", { id: "c-1" }), "https://app.chanlytics.com");
    assert.deepEqual(
      [thread.pathname, [...thread.searchParams]],
      ["/api/v1/conversations/c-1/export", [["workspace", "studio"]]],
    );
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
  // The list route and the export share one reading of who exists, with their appointments, a page at a time: run in
  // ask/readers/, where GET contacts' rows are everyone()'s with the same reply modes.
});

test("the bundle is one JSON document: every section in contracts' order, every page, never held whole, with what it counted and what it leaves out", async () => {
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
  // Each message as the route reads it: its conversation, and the path of a file the store holds, neither of them written.
  const inThread = (conversation_id, over, stored_path = null) => ({ ...msg(over), conversation_id, stored_path });
  const photo = { mime_type: "image/jpeg", fetch_state: "stored", filename: "IMG_0001.jpg", caption: null };
  const msgs = [
    inThread("c1", { id: "m1" }),
    inThread("c1", { id: "m2", type: "image", media: photo }, "t1/c1/m2.jpg"),
    inThread("c1", { id: "m3" }),
    inThread("c3", { id: "m4" }),
  ];
  // Three of them, in two pages: people used to be read as ONE call, whose
  // answer people_list caps at 1000 rows in the database -- so a workspace
  // above that downloaded a bundle short by everyone after the first page, with
  // no error, no flag, and no way to tell it from the whole thing. Their pages
  // come as their reader reads them (listEveryoneOnce), not by offset: their order
  // moves as they write.
  const people = [
    { id: "p1", display_name: "Dani", phone_e164: "+19175550100", consent: "opted_in", dnc: false },
    { id: "p2", display_name: "Sam", phone_e164: "+19175550101", consent: "opted_in", dnc: false },
    { id: "p3", display_name: "Ola", phone_e164: "+19175550102", consent: "unknown", dnc: false },
  ];
  const readers = {
    people: async function* () {
      asked.push(["people"]);
      yield people.slice(0, 2);
      yield [];
      yield people.slice(2);
    },
    conversations: async (o, l) => {
      asked.push(["conversations", o, l]);
      return convs.slice(o, o + l);
    },
    messages: async (ids, o, l) => {
      asked.push(["messages", [...ids], o, l]);
      return msgs.filter((m) => ids.includes(m.conversation_id)).slice(o, o + l);
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
    signFiles: async (paths) => {
      asked.push(["sign", [...paths]]);
      return paths.map((p) => `https://files.example.com/${p}?token=t`);
    },
    team: async () => [
      { email: "ada@example.com", name: "Ada", role: "owner", state: "member", since: "2026-01-01T00:00:00Z" },
    ],
    sections: pagedSections(asked, {
      deals: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
      business: [{ config: { brain: { facts: [] } }, updated_at: "2026-08-01T00:00:00Z", updated_by: null }],
    }),
  };
  const chunks = [];
  for await (const c of B.workspaceBundle(readers, {
    workspaceId: "t1",
    business: "Marisa's Beauty Salon",
    tz: TZ,
    exportedAt: new Date("2026-09-12T03:00:00Z"),
    page: 2,
    batch: 2,
  }))
    chunks.push(c);
  assert.ok(chunks.length > 8, "written a piece at a time, not as one string");
  const text = chunks.join("");
  const doc = JSON.parse(text);
  assert.equal(doc.format, B.BUNDLE_FORMAT);
  assert.equal(doc.version, 2);
  assert.deepEqual(doc.workspace, {
    id: "t1",
    name: "Marisa's Beauty Salon",
    timezone: TZ,
    exported_at: "2026-09-12T03:00:00.000Z",
  });
  // The file's keys are the header, contracts' sections in their order, and the two that end it: a new section is written
  // where contracts names it, or this fails (R14 X2).
  assert.deepEqual(Object.keys(doc), [
    "format",
    "version",
    "workspace",
    ...EXPORT_SECTIONS,
    "manifest",
    "not_included",
  ]);
  assert.deepEqual(
    doc.people.map((p) => p.id),
    ["p1", "p2", "p3"],
    "every person, across page boundaries, an empty page among them",
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "people"),
    [["people"]],
    "asked once, and its pages taken as they come",
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
  // The messages of a batch of conversations in one read, paged to its end (R14 X7): a read a conversation was ten
  // thousand reads for a large workspace.
  assert.deepEqual(
    asked.filter((a) => a[0] === "messages"),
    [
      ["messages", ["c1", "c2"], 0, 2],
      ["messages", ["c1", "c2"], 2, 2],
      ["messages", ["c3"], 0, 2],
    ],
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "conversations"),
    [
      ["conversations", 0, 2],
      ["conversations", 2, 2],
    ],
  );
  // A file a customer sent: listed with a link that opens it for a day (R14 X6); where it is stored is never written.
  assert.deepEqual(doc.files, [
    {
      conversation_id: "c1",
      message_id: "m2",
      type: "image/jpeg",
      filename: "IMG_0001.jpg",
      sent_at: "2026-09-01T14:00:00Z",
      url: "https://files.example.com/t1/c1/m2.jpg?token=t",
      url_expires_at: "2026-09-13T03:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    asked.filter((a) => a[0] === "sign"),
    [["sign", ["t1/c1/m2.jpg"]]],
    "signed together",
  );
  assert.equal(/"(stored_path|path|conversation_id)":/.test(JSON.stringify(doc.conversations)), false);
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
  assert.deepEqual(doc.team, [
    { email: "ada@example.com", name: "Ada", role: "owner", state: "member", since: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(
    doc.deals.map((d) => d.id),
    ["d1", "d2", "d3"],
    "a paged section, across its pages",
  );
  assert.deepEqual(
    asked.filter((a) => a[0] === "deals"),
    [
      ["deals", 0, 2],
      ["deals", 2, 2],
    ],
  );
  assert.equal(doc.business.length, 1, "the business's own details");
  for (const section of PAGED.filter((x) => x !== "deals" && x !== "business"))
    assert.deepEqual(doc[section], [], `${section}: a section with nothing in it is still a section`);
  // What each section counted, and the messages beside them.
  assert.deepEqual(doc.manifest, {
    ...Object.fromEntries(EXPORT_SECTIONS.map((x) => [x, 0])),
    people: 3,
    conversations: 3,
    files: 1,
    calls: 1,
    consent_history: 1,
    deals: 3,
    business: 1,
    team: 1,
    messages: 4,
  });
  assert.deepEqual(doc.not_included, exportLeftOut(), "what it leaves out, each with why");
  assert.ok(text.endsWith("}\n"), "ends like a file");
  // Nothing at all is still a document.
  const empty = {
    people: async function* () {},
    conversations: async () => [],
    messages: async () => [],
    calls: async () => [],
    consentHistory: async () => [],
    signFiles: async () => [],
    team: async () => [],
    sections: pagedSections([]),
  };
  let none = "";
  for await (const c of B.workspaceBundle(empty, {
    workspaceId: "t1",
    business: "New",
    tz: TZ,
    exportedAt: new Date("2026-09-12T03:00:00Z"),
  }))
    none += c;
  const blank = JSON.parse(none);
  assert.deepEqual(blank.people, []);
  assert.deepEqual(blank.files, []);
  assert.deepEqual(blank.consent_history, []);
  assert.equal(blank.manifest.messages, 0);
});

test("a file the store will not sign is listed with no link, and the rest keep theirs", async () => {
  const photo = { mime_type: "image/jpeg", fetch_state: "stored", filename: null, caption: null };
  const readers = {
    people: async function* () {},
    conversations: async (o) =>
      o > 0
        ? []
        : [
            {
              id: "c1",
              contact_id: "p1",
              state: "open",
              created_at: "2026-08-01T10:00:00Z",
              last_message_at: null,
              last_inbound_at: null,
            },
          ],
    messages: async (_ids, o) =>
      o > 0
        ? []
        : ["m1", "m2"].map((id) => ({
            ...msg({ id, media: photo }),
            conversation_id: "c1",
            stored_path: `t1/c1/${id}.jpg`,
          })),
    calls: async () => [],
    consentHistory: async () => [],
    signFiles: async (paths) => paths.map((p) => (p.endsWith("m1.jpg") ? null : `https://files.example.com/${p}`)),
    team: async () => [],
    sections: pagedSections([]),
  };
  let text = "";
  for await (const c of B.workspaceBundle(readers, {
    workspaceId: "t1",
    business: "B",
    tz: TZ,
    exportedAt: new Date(),
  }))
    text += c;
  assert.deepEqual(
    JSON.parse(text).files.map((f) => [f.message_id, f.url !== null, f.url_expires_at !== null]),
    [
      ["m1", false, false],
      ["m2", true, true],
    ],
  );
});

test("every kind of record says how it reaches the owner's copy: a section of the file, the header, or left out with what and why (R14 X2)", () => {
  // The compiler holds EXPORT_OF to every kind (`satisfies Record<RecordKind, ExportOf>`); this holds what each answer says.
  assert.deepEqual(Object.keys(EXPORT_OF).sort(), Object.keys(RECORD_KINDS).sort(), "each kind, once");
  for (const [kind, how] of Object.entries(EXPORT_OF)) {
    if ("section" in how) assert.ok(EXPORT_SECTIONS.includes(how.section), `${kind}: a section the file writes`);
    else if ("not_exported" in how) {
      assert.ok(how.not_exported.what.trim() && how.not_exported.why.trim(), `${kind}: what is left out, and why`);
      assert.ok(
        exportLeftOutWords().toLowerCase().includes(how.not_exported.what.toLowerCase()),
        `${kind}: on the card`,
      );
    } else assert.ok(how.derived.trim(), `${kind}: where the file holds it`);
  }
  assert.equal(new Set(EXPORT_SECTIONS).size, EXPORT_SECTIONS.length, "each section once");
  // A section no kind is exported to is the file's own: the files customers sent (their messages are the conversation's),
  // the consent history (events, read for the one question an export is asked for), and who is on each list kept by hand.
  const OWN = ["files", "consent_history", "list_members"];
  assert.deepEqual(
    EXPORT_SECTIONS.filter((x) => !exportedSections().includes(x)),
    OWN,
    "a section with no kind behind it is named here, with why",
  );
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
