/**
 * GET /export: owners only, one JSON file that parses and carries every section; Settings' one link; and the people
 * CSV holding everyone exactly once while its pages move.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXPORT_SECTIONS,
  PERSON_EXPORT_SECTIONS,
  exportLeftOut,
  personExportLeftOut,
  toPersonVM,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { PERSON_ROW, TZ, here, movesWhileRead, msg, peopleWorld, personExportLink } from "./_exports.mjs";

test("GET /export: owners only, the workspace named, one JSON file that parses and carries every section", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const route = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/export/route.ts")).href);
  assert.deepEqual(
    route.GET.policy,
    { kind: "read", fresh: true, scope: "workspace", role: "owner", rate: "export", spend: false },
    "the whole customer record: owners, in the workspace the tab named, ten a minute like the CSV, and a session the Auth server still knows",
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
    // A note kept on a person, which the copy held nothing of (R14 X1).
    person_notes: [
      {
        id: "n1",
        tenant_id: T,
        contact_id: "p1",
        body: "Prefers mornings",
        author_kind: "member",
        author_user_id: "u1",
        for_user_id: null,
        team_only: false,
        state: "kept",
        source: "page",
        due_on: null,
        done_at: null,
        done_by: null,
        deal_id: null,
        created_at: "2026-08-01T11:00:00Z",
        updated_at: "2026-08-01T11:00:00Z",
      },
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
    // The team, as the roster names it: the one read that may name a member's address.
    team_roster: () => [
      {
        membership_id: "mem1",
        member_user_id: "u1",
        email: "ada@example.com",
        display_name: "Ada",
        role: "owner",
        joined_at: "2026-01-01T00:00:00Z",
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
  // The sections after the customer record, read on the owner's own session (packages/db exportSectionPages, R14 X1).
  assert.deepEqual(
    doc.notes_and_steps.map((n) => [n.contact_id, n.body]),
    [["p1", "Prefers mornings"]],
  );
  assert.deepEqual(doc.team, [
    { email: "ada@example.com", name: "Ada", role: "owner", state: "member", since: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(doc.files, [], "no file a customer sent, so nothing to sign");
  assert.equal(doc.manifest.notes_and_steps, 1);
  assert.equal(doc.manifest.messages, 2);
  assert.deepEqual(doc.not_included, exportLeftOut());
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

/* ----------------------------------------------------------------------------
 * ONE PERSON'S OWN COPY (the wiring's second audit, R14 X5). A customer may ask
 * a business what it holds about them, the privacy page says, and the only
 * complete answer was the workspace's file: everyone's records in one. The
 * same door, `?person=<id>`, writes the same file of them alone. Run over a
 * workspace of two people with a row of each in every section: the file of
 * one holds every one of theirs and nothing of the other's.
 * ------------------------------------------------------------------------- */
test("GET /export?person: one person's own copy holds every record of theirs and none of anyone else's, says what it leaves out, and is on their ledger", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const route = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/export/route.ts")).href);
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const DANI = "11111111-1111-4111-8111-111111111111";
  const LUZ = "22222222-2222-4222-8222-222222222222";
  const at = (d) => `2026-08-0${d}T10:00:00Z`;
  // Each person's rows of a table, the second person's after Dani's.
  const both = (make) => [make(DANI, "1"), make(LUZ, "2")];
  const tables = (role) => ({
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
    // Dani works at a business (0052); a lead the finder found became Dani; another is Luz's.
    contacts: [
      { id: DANI, tenant_id: T, lead_id: "lead-works", display_name: "Dani" },
      { id: LUZ, tenant_id: T, lead_id: null, display_name: "Luz" },
    ],
    conversations: both((p, n) => ({
      id: `c${n}`,
      tenant_id: T,
      contact_id: p,
      state: "open",
      created_at: at(n),
      last_message_at: at(n),
      last_inbound_at: at(n),
    })),
    messages: both((p, n) => ({
      id: `m${n}`,
      tenant_id: T,
      conversation_id: `c${n}`,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: n === "1" ? "hola" : "hi there",
      media: null,
      meta: null,
      status: "sent",
      created_at: at(n),
      channel_ts: null,
      channel: "whatsapp",
    })),
    calls: both((p, n) => ({
      id: `k${n}`,
      tenant_id: T,
      retell_call_id: `r${n}`,
      direction: "inbound",
      call_type: "phone_call",
      status: "ended",
      from_e164: `+1917555010${n}`,
      from_raw: null,
      to_e164: "+19175550199",
      started_at: at(n),
      ended_at: at(n),
      updated_at: at(n),
      created_at: at(n),
      duration_ms: 60000,
      disconnection_reason: null,
      sentiment: null,
      call_successful: true,
      in_voicemail: false,
      summary: `Call ${n}`,
      transcript_object: [],
      recording: null,
      conversation_id: `c${n}`,
      contact_id: p,
      message_id: null,
      contacts: { display_name: n === "1" ? "Dani" : "Luz", wa_profile_name: null, phone_e164: null },
    })),
    events: both((p, n) => ({
      id: `e${n}`,
      tenant_id: T,
      kind: "contact.consent_changed",
      subject_id: p,
      created_at: at(n),
      data: { consent: "opted_in", source: "customer_message", previous: null },
    })),
    person_notes: both((p, n) => ({
      id: `n${n}`,
      tenant_id: T,
      contact_id: p,
      body: `Note ${n}`,
      state: "kept",
      created_at: at(n),
      updated_at: at(n),
    })),
    deals: both((p, n) => ({ id: `d${n}`, tenant_id: T, contact_id: p, stage: "proposed", created_at: at(n) })),
    appointments: both((p, n) => ({
      id: `a${n}`,
      tenant_id: T,
      contact_id: p,
      starts_at: at(n),
      status: "confirmed",
      created_at: at(n),
    })),
    // A list each was put on by hand, and one made by a rule, which names no one.
    segments: [
      ...both((p, n) => ({ id: `s${n}`, tenant_id: T, name: `Kept ${n}`, rule: null, created_at: at(n) })),
      { id: "s3", tenant_id: T, name: "Regulars", rule: { visits_at_least: 3 }, created_at: at(3) },
    ],
    segment_members: both((p, n) => ({ segment_id: `s${n}`, contact_id: p, tenant_id: T, added_at: at(n) })),
    broadcast_recipients: both((p, n) => ({
      broadcast_id: "b1",
      contact_id: p,
      tenant_id: T,
      state: "sent",
      sent_at: at(n),
      channel: "whatsapp",
      broadcasts: { name: "Win-back", run_for: "2026-08-01" },
    })),
    escalations: both((p, n) => ({
      id: `h${n}`,
      tenant_id: T,
      conversation_id: `c${n}`,
      reason: "asked for a person",
      state: "open",
      created_at: at(n),
    })),
    policies: [
      ...both((p, n) => ({
        id: `r${n}`,
        tenant_id: T,
        class: "reply",
        mode: "never",
        subject_type: "contact",
        subject_id: p,
        limits: {},
        updated_at: at(n),
      })),
      { id: "r0", tenant_id: T, class: "reply", mode: "auto", subject_type: null, subject_id: null, limits: {} },
    ],
    leads: [
      { id: "lead-works", tenant_id: T, business_name: "Studio Dani", contact_id: null, found_at: at(1) },
      { id: "lead-became", tenant_id: T, business_name: "Dani Nails", contact_id: DANI, found_at: at(2) },
      { id: "lead-luz", tenant_id: T, business_name: "Luz Spa", contact_id: LUZ, found_at: at(3) },
    ],
    reach_out_replies: both((p, n) => ({
      message_id: `m${n}`,
      tenant_id: T,
      conversation_id: `c${n}`,
      contact_id: p,
      intent: "interested",
      read_at: at(n),
    })),
    // The workspace's own, which a person's copy leaves out.
    tenant_config: [{ tenant_id: T, config: { brain: {} }, updated_at: at(1) }],
    templates: [{ id: "t1", tenant_id: T, name: "win_back", created_at: at(1) }],
    google_reviews: [{ id: "g1", tenant_id: T, rating: 5, first_seen_at: at(1) }],
    playbooks: [{ id: "pb1", tenant_id: T, name: "Win-back", created_at: at(1) }],
  });
  const rowFor = (id) => ({
    id,
    display_name: id === DANI ? "Dani" : "Luz",
    wa_profile_name: null,
    phone_e164: null,
    consent: "opted_in",
    dnc: false,
  });
  const rpcs = {
    // One person's row when one is named (people_list's p_contact_id); a person it does not hold names none.
    people_list: (args) => (args?.p_contact_id ? [DANI, LUZ].filter((id) => id === args.p_contact_id).map(rowFor) : []),
  };
  const run = (query, t = tables("owner")) =>
    route.GET.run(new Request(`http://localhost/api/v1/export?workspace=${T}&${query}`), {
      supabase: fakeDb(t, {}, rpcs),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    });
  const owned = tables("owner");
  const res = await run(`person=${DANI}`, owned);
  assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="person-Dani-2026\d{4}\.json"/);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const doc = JSON.parse(await res.text());
  assert.equal(doc.format, "chanlytics-person-export");
  assert.deepEqual(doc.person, { id: DANI });
  assert.equal(doc.workspace.name, "Marisa's Beauty Salon");
  assert.deepEqual(
    Object.keys(doc),
    ["format", "version", "workspace", "person", ...PERSON_EXPORT_SECTIONS, "manifest", "not_included"],
    "a person's sections in the workspace's order, and no section that is the workspace's own",
  );
  // Every one of Dani's, and nothing of Luz's.
  assert.deepEqual(
    doc.people.map((p) => [p.id, p.effective_reply_mode]),
    [[DANI, "never"]],
    "their row, with their own reply mode",
  );
  assert.deepEqual(
    doc.conversations.map((c) => [c.id, c.messages.map((m) => m.body)]),
    [["c1", ["hola"]]],
  );
  assert.deepEqual(
    doc.calls.map((c) => c.id),
    ["k1"],
  );
  assert.deepEqual(
    doc.consent_history.map((e) => e.id),
    ["e1"],
  );
  assert.deepEqual(
    doc.notes_and_steps.map((n) => n.body),
    ["Note 1"],
  );
  assert.deepEqual(
    doc.deals.map((d) => d.id),
    ["d1"],
  );
  assert.deepEqual(
    doc.bookings.map((a) => a.id),
    ["a1"],
  );
  assert.deepEqual(
    doc.lists.map((l) => l.name),
    ["Kept 1"],
    "the list they were put on by hand; a list made by a rule is said in not_included",
  );
  assert.deepEqual(
    doc.list_members.map((m) => [m.segment_id, m.contact_id]),
    [["s1", DANI]],
  );
  assert.deepEqual(
    doc.sends.map((s) => [s.broadcast_id, s.state, s.broadcasts?.name]),
    [["b1", "sent", "Win-back"]],
    "what each run sent them, with the run's name",
  );
  assert.deepEqual(
    doc.holds.map((h) => h.id),
    ["h1"],
  );
  assert.deepEqual(
    doc.rules.map((r) => [r.id, r.subject_id]),
    [["r1", DANI]],
    "their own rule, not the workspace's",
  );
  assert.deepEqual(
    doc.leads.map((l) => l.business_name),
    ["Studio Dani", "Dani Nails"],
    "the business they work at, and the lead that became them",
  );
  assert.deepEqual(
    doc.reach_out_replies.map((r) => r.message_id),
    ["m1"],
  );
  assert.equal(JSON.stringify(doc).includes(LUZ), false, "the other person's id is nowhere in the file");
  assert.equal(JSON.stringify(doc).includes("hi there"), false, "nor their words");
  assert.equal(doc.manifest.messages, 1);
  assert.equal(doc.manifest.leads, 2);
  assert.deepEqual(doc.not_included, personExportLeftOut());
  // On the ledger before the first byte, on them: their page says who took a copy of their records.
  assert.deepEqual(
    (owned.decisions ?? []).map((x) => [x.subject_type, x.subject_id, x.verb, x.payload.what, x.actor_user_id]),
    [["contact", DANI, "export", "person", "u1"]],
  );
  // Someone this workspace does not hold has no copy, and no ledger row says one was taken.
  const none = tables("owner");
  await assert.rejects(run("person=33333333-3333-4333-8333-333333333333", none), (e) => e.code === "not_found");
  assert.deepEqual(none.decisions ?? [], []);
  // An id that is no id is refused before anything is read.
  await assert.rejects(run("person=p1"), (e) => e.status === 400 && e.code === "validation");
  // The owner's, as the workspace's copy is.
  await assert.rejects(run(`person=${DANI}`, tables("operator")), (e) => e.status === 403);
});

test("a person's own copy: its sections follow the workspace's order, and each it leaves out says why (R14 X5)", () => {
  assert.deepEqual(
    EXPORT_SECTIONS.filter((s) => PERSON_EXPORT_SECTIONS.includes(s)),
    [...PERSON_EXPORT_SECTIONS],
    "in the workspace's order",
  );
  const left = personExportLeftOut();
  for (const l of left) assert.ok(l.what && l.why, `${l.what}: said with why`);
  assert.deepEqual(
    left.map((l) => l.what),
    [
      "The business's own details",
      "The team",
      "The campaigns",
      "Saved messages",
      "Google reviews",
      "Which lists made by a rule they are on",
      "Call audio",
      "The activity log",
    ],
    "each of the workspace's sections a person's copy leaves out, the lists by a rule, and what the workspace's leaves out too",
  );
  // The page's door: the owner's, with Delete and Merge, as Settings keeps the copy and the deletion together. And who took a
  // copy, on their page: a thread's own file is the thread's, and is not said there as theirs.
  const at = "2026-09-05T15:00:00Z";
  const decision = (id, subject_type, subject_id, what) => ({
    id,
    verb: "export",
    subject_type,
    subject_id,
    actor_type: "user",
    actor_user_id: "u1",
    created_at: at,
    payload: { what },
  });
  const vm = toPersonVM(
    {
      row: { ...PERSON_ROW, id: "p1" },
      identities: [],
      calls: [],
      escalations: [],
      decisions: [decision("x1", "contact", "p1", "person"), decision("x2", "conversation", "cv1", "conversation")],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      conversations: [
        { id: "cv1", state: "open", paused_until: null, last_wa_inbound_at: null, last_message_at: at, messages: [] },
      ],
    },
    TZ,
    new Date("2026-09-05T16:00:00Z"),
    "u1",
  );
  assert.deepEqual(
    vm.timeline.filter((i) => i.kind === "decision").map((i) => [i.who, i.text]),
    [["Downloaded their records", "You downloaded their records"]],
  );
  const acts = vm.acts;
  const download = acts.find((a) => a.id === "download");
  assert.deepEqual(download && [download.label, download.group, download.needs, download.off], [
    "Download their records",
    "delete",
    "owner",
    null,
  ]);
  assert.deepEqual(
    acts.filter((a) => a.group === "delete").map((a) => a.id),
    ["download", "merge", "delete"],
  );
  // The link it opens: the workspace's export, of them alone, in the workspace the tab names.
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { location: { pathname: "/w/studio" } };
  try {
    const link = new URL(personExportLink("11111111-1111-4111-8111-111111111111"), "https://app.chanlytics.com");
    assert.equal(link.pathname, "/api/v1/export");
    assert.deepEqual(
      [...link.searchParams],
      [
        ["person", "11111111-1111-4111-8111-111111111111"],
        ["workspace", "studio"],
      ],
    );
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
});

test("Settings offers the door the privacy page promises: one link, owners only, and deletion as a request", async () => {
  // The card is rendered, not read: a page's body runs only in a browser,
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
  // The card is the TSX module's (settings/frame/workspace.tsx), which imports the record kit's row.
  const { WorkspaceData: Card } = await import("../../../apps/dashboard/src/surfaces/settings/frame/workspace.tsx");
  assert.equal(typeof Card, "function", "exported, or nothing below tests anything");
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
  // What the file leaves out, from the list it is written by (contracts EXPORT_OF, R14 X1), and never "everything".
  assert.ok(
    text.includes("Not in it:") && text.includes("call audio"),
    "and the card says what the file does not carry",
  );
  assert.ok(text.includes("a link to each file a customer sent"), "and that a file a customer sent comes as a link");
  assert.equal(/everything/i.test(text), false, "REGRESSION: 'everything', above Delete this workspace");
  // Not an owner: the link stays on the card, gated -- refused where it is, saying why (the one gate).
  globalThis.window.canDo = () => false;
  const denied = render(Card({}));
  const gated = denied.find((n) => n.props?.["data-testid"] === "set-export-all");
  assert.equal(gated?.props["aria-disabled"], true, "offered, and refused where it is");
  assert.equal(gated.props["data-tip"], "Only an owner can download the workspace's data.");
});

test("everyone as a CSV: owners only, the file, and the ledger row that says who took it", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const csv = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/contacts/export/route.ts")).href
  );
  assert.deepEqual(csv.GET.policy, {
    kind: "read",
    fresh: true,
    scope: "workspace",
    role: "owner",
    rate: "export",
    spend: false,
  });
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

test("the workspace export holds everyone exactly once when someone writes or falls quiet while its pages are read, by the cursor and, before 00276, by offset", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const route = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/export/route.ts")).href);
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const places of [true, false]) {
    const world = peopleWorld(T, 2500, { places });
    world.between = movesWhileRead(world);
    const tables = {
      memberships: [
        {
          user_id: "u1",
          tenant_id: T,
          role: "owner",
          tenants: { slug: "marisas" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
      policies: [],
      contacts: world.contacts,
      conversations: [],
      messages: [],
      calls: [],
      events: [],
    };
    const ctx = {
      supabase: fakeDb(tables, {}, { people_list: world.people_list, team_roster: () => [] }),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    };
    const res = await route.GET.run(new Request(`http://localhost/api/v1/export?workspace=${T}`), ctx);
    const ids = JSON.parse(await res.text()).people.map((p) => p.id);
    const by = places ? "by the cursor" : "by offset";
    assert.equal(ids.length, 2500, `${by}: as many rows as people`);
    assert.deepEqual([...new Set(ids)].sort(), [...world.ids].sort(), `${by}: every person, each once`);
    assert.deepEqual(
      world.asked.at(-1),
      { p_tenant_id: T, p_contact_id: world.idOf(2200) },
      `${by}: the one who wrote past the place the pages had reached is read by their own row`,
    );
  }
});

test("the people CSV holds everyone exactly once when someone writes or falls quiet while its pages are read", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const csv = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/contacts/export/route.ts")).href
  );
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const world = peopleWorld(T, 2500);
  world.between = movesWhileRead(world);
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: T, role: "owner", tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
    policies: [],
    contacts: world.contacts,
    decisions: [],
  };
  const ctx = {
    supabase: fakeDb(tables, {}, { people_list: world.people_list }),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  };
  const res = await csv.GET.run(new Request(`http://localhost/api/v1/contacts/export?workspace=${T}`), ctx);
  const text = new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(3));
  const names = text
    .split("\r\n")
    .slice(1, -1)
    .map((line) => line.split(",")[0]);
  assert.equal(names.length, 2500, "a row for each person");
  assert.deepEqual(
    [...new Set(names)].sort(),
    world.ids.map((id) => `Person ${id.slice(-4)}`).sort(),
    "every person, each once: the one who wrote mid-read is in it, the one who fell quiet is not twice",
  );
  assert.deepEqual(
    tables.decisions.map((x) => x.payload),
    [{ what: "people", rows: 2500 }],
    "and the ledger counts what the file holds",
  );
});

test("a conversation's file holds every message of a thread longer than 10,000, and its ledger row counts them all", async () => {
  const { setRateStore, memoryStore } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/rate-limit.ts")).href
  );
  setRateStore(memoryStore());
  const route = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/app/api/v1/conversations/[id]/export/route.ts")).href
  );
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const C = "cccccccc-1111-4111-8111-cccccccccccc";
  const P = "dddddddd-1111-4111-8111-dddddddddddd";
  const N = 10_050;
  const start = Date.UTC(2026, 0, 1);
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: T, role: "viewer", tenants: { slug: "marisas" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: TZ }],
    contacts: [{ id: P, tenant_id: T, display_name: "Dani", wa_profile_name: null, phone_e164: null, email: null }],
    conversations: [{ id: C, tenant_id: T, contact_id: P, state: "open", created_at: "2026-01-01T00:00:00Z" }],
    messages: Array.from({ length: N }, (_, i) =>
      msg({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        conversation_id: C,
        body: `word ${i + 1}`,
        created_at: new Date(start + i * 60_000).toISOString(),
      }),
    ),
    decisions: [],
  };
  const ctx = { supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params: { id: C } };
  const res = await route.GET.run(new Request(`http://localhost/api/v1/conversations/${C}/export?workspace=${T}`), ctx);
  const text = await res.text();
  assert.ok(text.includes(`${N} messages`), "the head counts every message");
  assert.equal(text.split("\n").filter((l) => /word \d+$/.test(l)).length, N, "every one of them, a line each");
  assert.ok(text.trimEnd().endsWith(`word ${N}`), "to the last");
  assert.deepEqual(
    tables.decisions.map((x) => [x.subject_type, x.subject_id, x.verb, x.payload]),
    [["conversation", C, "export", { what: "conversation", messages: N }]],
    "the ledger row counts what the file holds",
  );
});
