/**
 * A person carries the runs that named them and the lead they were found as; a deal's refusal in the owner's words;
 * every workspace's People carries its deals; the workspace's pace; and the merge of two records (0028).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  DEAL_REFUSALS,
  MERGE_REFUSALS,
  channelsReady,
  dealPaceOf,
  followUpStandOf,
  poolRowsOf,
} from "@chanlytics/contracts";
import { asText } from "../../_log-lines.mjs";
import {
  A,
  B,
  D1,
  M1,
  P1,
  P2,
  P3,
  S1,
  USER,
  at,
  both,
  contact,
  contacts,
  ctxFor,
  deal,
  get,
  inA,
  list,
  merge,
  noteDecide,
  noteRemove,
  noteWrite,
  person,
  personRow,
  refused,
  send,
  withDealDoor,
} from "./_routes.mjs";

test("a person carries the runs that named them, newest first, and the lead they were found as -- their page could say neither", async () => {
  const run = (id, over) => ({
    id,
    tenant_id: A,
    name: `Run ${id}`,
    playbook_id: null,
    audience: { kind: "everyone", id: null, label: "Everyone" },
    scheduled_for: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  });
  const tables = {
    memberships: both("owner", "owner"),
    contact_identities: [],
    conversations: [],
    calls: [],
    policies: [],
    events: [],
    contacts: [{ id: P1, tenant_id: A, notes: null }],
    tenant_config: [],
    tenants: [],
    broadcasts: [
      run("b-old", { created_at: "2026-08-01T00:00:00Z" }),
      run("b-pb", {
        playbook_id: "pb-1",
        audience: { kind: "playbook", id: "quiet_30", label: "Win-back" },
        created_at: "2026-09-01T00:00:00Z",
      }),
      run("b-held", { scheduled_for: "2026-08-20T00:00:00Z", created_at: "2026-08-19T00:00:00Z" }),
      run("b-theirs", { tenant_id: B }),
    ],
    broadcast_recipients: [
      {
        broadcast_id: "b-old",
        contact_id: P1,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-08-01T15:00:00Z",
        message_id: "m-old",
      },
      {
        broadcast_id: "b-pb",
        contact_id: P1,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-09-01T15:00:00Z",
        message_id: "m-pb",
      },
      {
        broadcast_id: "b-held",
        contact_id: P1,
        tenant_id: A,
        state: "skipped",
        reason: "no_marketing_consent",
        sent_at: null,
        message_id: null,
      },
      // Somebody else on a run, and this person on another workspace's: neither is theirs here.
      {
        broadcast_id: "b-old",
        contact_id: P2,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-08-01T15:00:00Z",
        message_id: "m-x",
      },
      {
        broadcast_id: "b-theirs",
        contact_id: P1,
        tenant_id: B,
        state: "sent",
        reason: null,
        sent_at: "2026-09-10T00:00:00Z",
        message_id: "m-y",
      },
    ],
    leads: [
      {
        id: "l-1",
        tenant_id: A,
        contact_id: P1,
        business_name: "Glow Studio",
        found_at: "2026-07-01T00:00:00Z",
        erased_at: null,
        blanked_at: null,
      },
      {
        id: "l-gone",
        tenant_id: A,
        contact_id: P1,
        business_name: "Erased",
        found_at: "2026-07-05T00:00:00Z",
        erased_at: "2026-07-06T00:00:00Z",
        blanked_at: null,
      },
    ],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) };
  const { person: p } = await person.GET.run(get(inA), ctxFor(tables, { id: P1 }, rpcs));
  assert.deepEqual(
    p.campaigns.map((c) => [c.broadcast_id, c.state, c.reason, c.playbook_id, c.playbook_name, c.message_id]),
    [
      ["b-pb", "sent", null, "pb-1", "Win-back", "m-pb"],
      ["b-held", "skipped", "no_marketing_consent", null, null, null],
      ["b-old", "sent", null, null, null, "m-old"],
    ],
    "newest first by when each went or was due; a playbook's run named for its playbook",
  );
  assert.deepEqual(
    p.lead,
    // The lead's reach-out story (Part 6, H11) is its own read, which this world does not answer: none, never a failure.
    { id: "l-1", business_name: "Glow Studio", found_at: "2026-07-01T00:00:00Z", reach_out: null },
    "never an erased lead",
  );
});

test("REGRESSION: a change to a list past a thousand people answers with every one of them -- the answer was one select, and an Undo tells from it who an add really added", async () => {
  const ids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const tables = {
    memberships: both("owner", "owner"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }],
    segment_members: ids.map((contact_id) => ({ segment_id: S1, contact_id, tenant_id: A })),
    contacts: [{ id: P3, tenant_id: A, erased_at: null }],
  };
  const ctx = {
    supabase: fakeDb(tables, {}, {}, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: { id: S1 },
  };
  const out = await list.PUT.run(send("PUT", { add: [P3] }), ctx);
  assert.equal(out.ids.length, 1501, "REGRESSION: 1000 of 1501");
  assert.ok(out.ids.includes(P3), "the one just added among them");
});

test("deal: a proposal is recorded through the door, its decision holds the move, and a viewer or an erased person is refused before the door opens", async () => {
  const doors = [];
  const rpcs = {
    deal_record: (a) => {
      doors.push(a);
      return {
        deal: {
          id: D1,
          contact_id: P2,
          service: a.p_service ?? null,
          stage: a.p_stage,
          proposed_at: "2026-09-23T12:00:00Z",
          decided_at: null,
          ended_at: null,
          amount_cents: null,
          per: null,
          currency: "USD",
          note: null,
          version: 1,
          created_at: "2026-09-23T12:00:00Z",
        },
        from: null,
      };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
    decisions: [],
  };
  await refused(deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P1 }, rpcs)), "forbidden", 403);
  await refused(
    deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P3 }, rpcs)),
    "not_found",
    404,
    "erased",
  );
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "banana" }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "proposed", when: "2026-09-20" }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "proposed", extra: 1 }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0, "a bare date and an unknown key are refused before the door opens");
  const out = await deal.POST.run(
    send("POST", { stage: "proposed", service: "SEO", when: "2026-09-20T15:00:00.000Z" }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.equal(out.deal.id, D1);
  assert.equal(out.from, null);
  assert.ok(out.decision_id);
  assert.deepEqual(doors, [
    { p_contact_id: P2, p_stage: "proposed", p_service: "SEO", p_when: "2026-09-20T15:00:00.000Z" },
  ]);
  const d = tables.decisions.at(-1);
  assert.equal(d.verb, "record_deal");
  assert.equal(d.subject_type, "deal");
  assert.equal(d.subject_id, D1);
  assert.deepEqual(d.payload, { contact_id: P2, stage: "proposed", from: null, service: "SEO" });
});

test("deal: the door's refusal is a sentence in the owner's words, and no decision is recorded; evidence takes the consent's shape", async () => {
  const doors = [];
  const rpcs = { deal_record: (a) => (doors.push(a), { error: "already_open" }) };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
    decisions: [],
  };
  const before = tables.decisions.length;
  await assert.rejects(deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P2 }, rpcs)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /already have a proposal out/);
    return true;
  });
  assert.equal(tables.decisions.length, before);
  const won = {
    deal_record: (a) => (
      doors.push(a),
      {
        deal: {
          id: D1,
          contact_id: P2,
          service: null,
          stage: "won",
          proposed_at: "2026-09-01T12:00:00Z",
          decided_at: "2026-09-23T12:00:00Z",
          ended_at: null,
          amount_cents: 250000,
          per: "month",
          currency: "USD",
          note: null,
          version: 2,
          created_at: "2026-09-01T12:00:00Z",
        },
        from: "proposed",
      }
    ),
  };
  await deal.POST.run(
    send("POST", { stage: "won", deal_id: D1, version: 1, amount_cents: 250000, per: "month", message_id: M1 }),
    ctxFor(tables, { id: P2 }, won),
  );
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "won",
    p_deal_id: D1,
    p_version: 1,
    p_amount_cents: 250000,
    p_per: "month",
    p_evidence: { message_id: M1 },
  });
  await deal.POST.run(
    send("POST", { stage: "won", deal_id: D1, version: 2, form_note: "DocuSign, Sep 20" }),
    ctxFor(tables, { id: P2 }, won),
  );
  assert.deepEqual(doors.at(-1).p_evidence, { form: "DocuSign, Sep 20" });
});

test("a note on a person (0007): one route writes or changes it, one takes it away, one keeps or dismisses a suggestion -- owner or operator, each on this person only", async () => {
  for (const r of [noteWrite, noteRemove, noteDecide])
    assert.deepEqual(r.POST.policy, {
      kind: "write",
      scope: "row",
      role: "operator",
      rate: "person_edit",
      spend: false,
    });
  const N1 = "abababab-1111-4111-8111-abababababab";
  const N2 = "cdcdcdcd-2222-4222-8222-cdcdcdcdcdcd";
  const at = "2026-09-20T15:00:00.000Z";
  const stored = (id, over = {}) => ({
    id,
    tenant_id: B,
    contact_id: P2,
    body: "Prefers Saturdays.",
    author_kind: "member",
    author_user_id: USER,
    for_user_id: null,
    team_only: false,
    state: "kept",
    source: "page",
    version: 1,
    created_at: at,
    updated_at: at,
    ...over,
  });
  const doors = [];
  const rpcs = {
    person_note_add: (a) => (
      doors.push(["add", a]),
      { note: stored(N1, { body: a.p_body, team_only: a.p_team_only }) }
    ),
    person_note_edit: (a) => (
      doors.push(["edit", a]),
      a.p_version === 1 ? { note: stored(N1, { body: a.p_body, version: 2 }) } : { error: "moved" }
    ),
    person_note_remove: (a) => (doors.push(["remove", a]), { removed: a.p_note_id }),
    person_note_decide: (a) => (
      doors.push(["decide", a]),
      a.p_keep ? { note: stored(N2, { state: "kept" }) } : { removed: a.p_note_id }
    ),
  };
  const tables = () => ({
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B)],
    person_notes: [
      stored(N1),
      stored(N2, { author_kind: "receptionist", author_user_id: null, state: "suggested" }),
      stored("efefefef-3333-4333-8333-efefefefefef", { contact_id: P1, tenant_id: A }),
    ],
  });

  await refused(
    noteWrite.POST.run(send("POST", { body: "Hi" }), ctxFor(tables(), { id: P1 }, rpcs)),
    "forbidden",
    403,
    "a viewer writes nothing",
  );
  await assert.rejects(
    noteWrite.POST.run(send("POST", { body: "x".repeat(601) }), ctxFor(tables(), { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0, "refused before any door opens");

  const added = await noteWrite.POST.run(
    send("POST", { body: "  Prefers Saturdays.  ", team_only: true }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.deepEqual(doors.at(-1), ["add", { p_contact_id: P2, p_body: "Prefers Saturdays.", p_team_only: true }]);
  assert.equal(added.note.mine, true, "the writer's own");
  assert.equal(added.note.team_only, true);

  await noteWrite.POST.run(
    send("POST", { body: "Changed.", note_id: N1, version: 1 }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.deepEqual(doors.at(-1), ["edit", { p_note_id: N1, p_body: "Changed.", p_team_only: false, p_version: 1 }]);
  await refused(
    noteWrite.POST.run(send("POST", { body: "Stale.", note_id: N1, version: 3 }), ctxFor(tables(), { id: P2 }, rpcs)),
    "conflict",
    409,
    "a stale version is refused in the owner's words",
  );

  const n = doors.length;
  await refused(
    noteRemove.POST.run(
      send("POST", { note_id: "efefefef-3333-4333-8333-efefefefefef" }),
      ctxFor(tables(), { id: P2 }, rpcs),
    ),
    "not_found",
    404,
    "a note on someone else is not this person's to take away",
  );
  assert.equal(doors.length, n, "and no door opened for it");
  assert.deepEqual(await noteRemove.POST.run(send("POST", { note_id: N1 }), ctxFor(tables(), { id: P2 }, rpcs)), {
    removed: N1,
  });

  const keptOut = await noteDecide.POST.run(
    send("POST", { note_id: N2, keep: true }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.equal(keptOut.note.state, "kept");
  assert.deepEqual(
    await noteDecide.POST.run(send("POST", { note_id: N2, keep: false }), ctxFor(tables(), { id: P2 }, rpcs)),
    {
      removed: N2,
    },
  );
});

test("deal: a proposal's link, its day, a reason for passing and what a person emptied each reach the door only when named, and are judged before it opens (0008)", async () => {
  const doors = [];
  const rpcs = {
    deal_record: (a) => (
      doors.push(a),
      {
        deal: {
          id: D1,
          contact_id: P2,
          service: null,
          stage: a.p_stage,
          proposed_at: "2026-09-23T12:00:00Z",
          decided_at: null,
          ended_at: null,
          amount_cents: null,
          per: null,
          currency: "USD",
          note: null,
          version: 2,
          created_at: "2026-09-23T12:00:00Z",
          proposal_url: a.p_proposal_url ?? null,
          valid_until: a.p_valid_until ?? null,
          lost_reason: a.p_lost_reason ?? null,
        },
        from: "proposed",
      }
    ),
  };
  const tables = { memberships: both("viewer", "operator"), contacts: [contact(P1, A), contact(P2, B)], decisions: [] };
  const run = (body) => deal.POST.run(send("POST", body), ctxFor(tables, { id: P2 }, rpcs));

  // The link as the one normalizer stores it, and the day it stands until.
  const out = await run({ stage: "proposed", proposal_url: " docs.example.com/p/2 ", valid_until: "2026-09-30" });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "proposed",
    p_proposal_url: "https://docs.example.com/p/2",
    p_valid_until: "2026-09-30",
  });
  assert.equal(out.deal.proposal_url, "https://docs.example.com/p/2", "the deal comes back with it");
  // A pass with its reason; a move that empties what a person cleared.
  await run({ stage: "lost", deal_id: D1, version: 1, lost_reason: "timing" });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "lost",
    p_deal_id: D1,
    p_version: 1,
    p_lost_reason: "timing",
  });
  await run({ stage: "proposed", deal_id: D1, version: 2, clear: ["proposal_url", "amount"] });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "proposed",
    p_deal_id: D1,
    p_version: 2,
    p_clear: ["proposal_url", "amount"],
  });
  // A day of null, an empty list and a blank link say nothing, so the door keeps what it has. Changed on purpose in
  // review: a blank link was refused ("A web address is needed."), but the sheet empties one with clear, and a field
  // left blank is simply not said.
  await run({ stage: "proposed", deal_id: D1, version: 3, valid_until: null, clear: [], proposal_url: "   " });
  assert.deepEqual(doors.at(-1), { p_contact_id: P2, p_stage: "proposed", p_deal_id: D1, p_version: 3 });
  await run({ stage: "proposed", proposal_url: "" });
  assert.deepEqual(doors.at(-1), { p_contact_id: P2, p_stage: "proposed" });

  // Refused before the door opens: not a link (in the words that say which kind), not a day, not a reason, not a field.
  const opened = doors.length;
  const why = async (body, words) =>
    assert.rejects(run(body), (e) => {
      assert.equal(e.code, "validation");
      if (words) assert.equal(e.message, words);
      return true;
    });
  await why(
    { stage: "proposed", proposal_url: "mailto:ana@example.com" },
    "That needs to be a web address, starting with https://.",
  );
  await why(
    { stage: "proposed", proposal_url: "docs" },
    "That needs a full web address, like docs.example.com/proposal.",
  );
  await why({ stage: "proposed", proposal_url: "x".repeat(601) });
  await why({ stage: "proposed", valid_until: "2026-02-31" });
  await why({ stage: "proposed", valid_until: "Sep 30" });
  await why({ stage: "lost", deal_id: D1, version: 3, lost_reason: "banana" });
  await why({ stage: "proposed", deal_id: D1, version: 3, clear: ["service"] });
  assert.equal(doors.length, opened, "no door was opened for any of them");

  // The door's own new refusals are sentences, and no decision is recorded for them.
  const decided = tables.decisions.length;
  for (const code of ["bad_link", "bad_reason", "bad_clear"]) {
    const refusing = { deal_record: () => ({ error: code }) };
    await assert.rejects(
      deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P2 }, refusing)),
      (e) => {
        assert.equal(e.message, DEAL_REFUSALS[code], code);
        return true;
      },
    );
  }
  assert.equal(tables.decisions.length, decided);
});

test("every workspace's People carries its deals (0008, amended 18 Oct 2026): the list says whether one is on file and the workspace's word, the person's page their deals and the word, whatever the retired answer said", async () => {
  const won = {
    id: D1,
    tenant_id: A,
    contact_id: P1,
    service: null,
    stage: "won",
    proposed_at: "2026-09-01T12:00:00Z",
    decided_at: "2026-09-05T12:00:00Z",
    ended_at: null,
    amount_cents: 250000,
    per: "month",
    currency: "USD",
    note: null,
    version: 2,
    created_at: "2026-09-01T12:00:00Z",
    proposal_url: "https://docs.example.com/p/1",
    valid_until: null,
    lost_reason: null,
  };
  const world = (word) => ({
    memberships: both("viewer", "viewer"),
    policies: [],
    tenant_config: [],
    contacts: [contact(P1, A)],
    deals: [won],
    tenants: [{ id: A, slug: "harbor", ...(word === undefined ? {} : { appointment_word: word }) }],
  });
  const rpcs = {
    people_list: (a) => (a.p_tenant_id === A && (!a.p_contact_id || a.p_contact_id === P1) ? [personRow(P1)] : []),
  };
  const list = async (w) => {
    const r = await contacts.GET.run(get(inA), ctxFor(w, {}, rpcs));
    return [r.has_deals, r.appointment_word];
  };
  const page = async (w) => (await person.GET.run(get(inA), ctxFor(w, { id: P1 }, rpcs))).person;
  // The word picked, else an appointment.
  for (const [s, word] of [
    ["session", "session"],
    [null, "appointment"],
    [undefined, "appointment"],
  ]) {
    assert.deepEqual(await list(world(s)), [true, word], `${s}: the list`);
    const p = await page(world(s));
    assert.equal(p.appointment_word, word, `${s}: the person's page says the workspace's word`);
    assert.equal(p.deals[0].proposal_url, "https://docs.example.com/p/1", `${s}: each deal with its link`);
  }
  // No deal on file: the list says so, and its deal lists wait for the first.
  assert.deepEqual(await list({ ...world("meeting"), deals: [] }), [false, "meeting"]);
});

test("deal: the door answers the deal the person's People row shows now -- an open one first, then the newest -- which is not always the one it recorded", async () => {
  const D2 = "dddddddd-2222-4222-8222-dddddddddddd";
  const deals = [
    // Their newest: a proposal out, the deal their row shows.
    {
      id: D1,
      tenant_id: B,
      contact_id: P2,
      service: "SEO",
      stage: "proposed",
      proposed_at: "2026-09-20T12:00:00Z",
      decided_at: null,
      ended_at: null,
      amount_cents: 80_000,
      per: "once",
      currency: "USD",
      note: null,
      version: 1,
      created_at: "2026-09-20T12:00:00Z",
    },
    // An older engagement, still a client.
    {
      id: D2,
      tenant_id: B,
      contact_id: P2,
      service: "Ads",
      stage: "won",
      proposed_at: "2026-07-01T12:00:00Z",
      decided_at: "2026-07-05T12:00:00Z",
      ended_at: null,
      amount_cents: 50_000,
      per: "month",
      currency: "USD",
      note: null,
      version: 1,
      created_at: "2026-07-01T12:00:00Z",
    },
  ];
  const tables = { memberships: both("viewer", "operator"), contacts: [contact(P2, B)], decisions: [], deals };
  // The door, as it writes: the row it moved, with its version on.
  const rpcs = {
    deal_record: (a) => {
      const d = tables.deals.find((x) => x.id === a.p_deal_id);
      Object.assign(d, {
        stage: a.p_stage,
        version: d.version + 1,
        ...(a.p_amount_cents !== undefined ? { amount_cents: a.p_amount_cents } : {}),
        ...(a.p_stage === "lost" ? { decided_at: "2026-09-23T12:00:00Z" } : {}),
      });
      return { deal: { ...d }, from: "won" };
    },
  };
  // The older client's amount changed: it is what the door recorded, and the proposal is still what their row shows.
  let out = await deal.POST.run(
    send("POST", { stage: "won", deal_id: D2, version: 1, amount_cents: 60_000 }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.deepEqual([out.deal.id, out.current.id], [D2, D1]);
  // The proposal passed: the client is the one open deal now, so it is their row's.
  out = await deal.POST.run(
    send("POST", { stage: "lost", deal_id: D1, version: 1, lost_reason: "price" }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.deepEqual([out.deal.id, out.deal.stage, out.current.id], [D1, "lost", D2]);
  // Their deals could not be read: the write still answers, with no row to move until People is read again.
  const faulty = {
    ...ctxFor(tables, { id: P2 }, rpcs),
    supabase: fakeDb(tables, { "deals.select": { message: "statement timeout" } }, withDealDoor(tables, rpcs)),
  };
  out = await deal.POST.run(send("POST", { stage: "won", deal_id: D2, version: 2, amount_cents: 70_000 }), faulty);
  assert.deepEqual([out.deal.id, out.current], [D2, null]);
});

test("a step (00166): the note route takes a day and a deal only when named, judging the day first; one route marks it done by anyone who acts; People's rows say who each is for, reading the team only when one is for someone", async () => {
  const noteDone = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/done/route.ts"));
  assert.deepEqual(noteDone.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  const N1 = "abababab-1111-4111-8111-abababababab";
  const N2 = "efefefef-3333-4333-8333-efefefefefef";
  const stamp = "2026-09-20T15:00:00.000Z";
  const stored = (over = {}) => ({
    id: N1,
    tenant_id: B,
    contact_id: P2,
    body: "Call about the timeline",
    author_kind: "member",
    author_user_id: USER,
    for_user_id: null,
    team_only: true,
    state: "kept",
    source: "page",
    version: 1,
    created_at: stamp,
    updated_at: stamp,
    due_on: "2026-09-30",
    done_at: null,
    done_by: null,
    deal_id: null,
    ...over,
  });
  const doors = [];
  const rpcs = {
    person_note_add: (a) => (
      doors.push(["add", a]),
      { note: stored({ due_on: a.p_due_on ?? null, deal_id: a.p_deal_id ?? null }) }
    ),
    person_note_edit: (a) => (doors.push(["edit", a]), { note: stored({ version: 2 }) }),
    person_note_done: (a) => (
      doors.push(["done", a]),
      a.p_version === 9
        ? { error: "moved", version: 1 }
        : a.p_note_id === N1
          ? { note: stored({ done_at: stamp, done_by: USER, version: 2 }) }
          : { error: "not_a_step" }
    ),
  };
  const tables = () => ({
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B)],
    person_notes: [stored(), stored({ id: N2, due_on: null, team_only: false })],
  });
  const ctx = (id = P2) => ctxFor(tables(), { id }, rpcs);

  // A day that is not one is refused before any door opens.
  await assert.rejects(
    noteWrite.POST.run(send("POST", { body: "Call", due_on: "2026-02-30" }), ctx()),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0);
  // The day and the deal reach the door only when named; a change clears a day only when told to.
  const added = await noteWrite.POST.run(
    send("POST", { body: "Call about the timeline", due_on: "2026-09-30", deal_id: D1 }),
    ctx(),
  );
  assert.deepEqual(doors.at(-1), [
    "add",
    { p_contact_id: P2, p_body: "Call about the timeline", p_team_only: false, p_due_on: "2026-09-30", p_deal_id: D1 },
  ]);
  assert.deepEqual([added.note.due_on, added.note.deal_id, added.note.done_at], ["2026-09-30", D1, null]);
  await noteWrite.POST.run(send("POST", { body: "Plain" }), ctx());
  assert.deepEqual(
    doors.at(-1),
    ["add", { p_contact_id: P2, p_body: "Plain", p_team_only: false }],
    "a note names neither",
  );
  await noteWrite.POST.run(send("POST", { body: "No day now", note_id: N1, version: 1, clear_due: true }), ctx());
  assert.deepEqual(doors.at(-1), [
    "edit",
    { p_note_id: N1, p_body: "No day now", p_team_only: false, p_version: 1, p_clear_due: true },
  ]);

  // Done: by any operator, with the version the page saw; the door's refusals in the owner's words.
  const done = await noteDone.POST.run(send("POST", { note_id: N1, version: 1 }), ctx());
  assert.deepEqual(doors.at(-1), ["done", { p_note_id: N1, p_done: true, p_version: 1 }]);
  assert.deepEqual([done.note.done_at, done.note.done_by_me], [stamp, true]);
  await noteDone.POST.run(send("POST", { note_id: N1, done: false }), ctx());
  assert.deepEqual(doors.at(-1), ["done", { p_note_id: N1, p_done: false }]);
  await refused(noteDone.POST.run(send("POST", { note_id: N1, version: 9 }), ctx()), "conflict", 409);
  await refused(noteDone.POST.run(send("POST", { note_id: N2 }), ctx()), "validation", 400, "only a step is done");
  const n = doors.length;
  await refused(noteDone.POST.run(send("POST", { note_id: N1 }), ctx(P1)), "forbidden", 403, "a viewer marks nothing");
  assert.equal(doors.length, n, "and no door opened for it");

  // People's rows: who each next step is for, from the team, and the team read only when a step is for someone.
  let roster = 0;
  const listCtx = (rows) =>
    ctxFor(
      { memberships: both("viewer", "viewer"), policies: [], tenants: [], tenant_config: [] },
      {},
      {
        people_list: () => rows,
        team_roster: () => (
          roster++,
          [
            { member_user_id: USER, display_name: "Ada", email: "ada@example.com" },
            { member_user_id: "u2", display_name: "Sam", email: "sam@example.com" },
          ]
        ),
      },
    );
  const step = (id, forWho) => ({
    step_id: id,
    step_body: "Call",
    step_due_on: "2026-09-30",
    step_for_user_id: forWho,
  });
  const plain = await contacts.GET.run(get(inA), listCtx([personRow(P1, step(N1, null))]));
  assert.equal(roster, 0, "no step for anyone: the team is not read");
  assert.equal("step_for_name" in plain.people[0], false);
  const named = await contacts.GET.run(
    get(inA),
    listCtx([personRow(P1, step(N1, "u2")), personRow(P2, step(N2, USER)), personRow(P3)]),
  );
  assert.equal(roster, 1, "read once for the whole page");
  assert.deepEqual(
    named.people.map((p) => [p.step_for_name ?? null, p.step_for_me ?? null]),
    [
      ["Sam", false],
      ["Ada", true],
      [null, null],
    ],
  );
});

test("both People reads answer the workspace's pace: its last year's yeses, their median wait and how many; the list reads it with its first page alone; in every workspace (0008, amended 18 Oct 2026)", async () => {
  const now = Date.now();
  const DAY = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const deal = (n, days, stage = "won") => ({
    id: `dddddddd-000${n}-4000-8000-dddddddddddd`,
    tenant_id: A,
    contact_id: P1,
    service: `Service ${n}`,
    stage,
    proposed_at: iso(now - (days + 3) * DAY),
    decided_at: iso(now - 3 * DAY),
    ended_at: null,
    amount_cents: null,
    per: null,
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(now - 60 * DAY),
    proposal_url: null,
    valid_until: null,
    lost_reason: null,
  });
  const world = () => ({
    memberships: both("viewer", "viewer"),
    policies: [],
    tenant_config: [],
    contacts: [contact(P1, A)],
    deals: [deal(1, 4), deal(2, 10), deal(3, 12), deal(4, 20), deal(5, 6, "ended"), deal(6, 2, "lost")],
    tenants: [{ id: A, slug: "harbor" }],
  });
  const rpcs = {
    people_list: (a) => (a.p_tenant_id === A && (!a.p_contact_id || a.p_contact_id === P1) ? [personRow(P1)] : []),
  };
  const list = async (q = "") => (await contacts.GET.run(get(inA + q), ctxFor(world(), {}, rpcs))).deal_pace;
  const page = async () => (await person.GET.run(get(inA), ctxFor(world(), { id: P1 }, rpcs))).person.deal_pace;
  // 4, 6, 10, 12 and 20 days: a pass is not a yes, an ended engagement was one.
  assert.deepEqual(await list(), { median_days: 10, yeses: 5 });
  assert.deepEqual(await page(), { median_days: 10, yeses: 5 }, "the person's page reads the same pace");
  assert.equal(await list("&q=ro"), null, "a search reads no pace: People keeps its first page's");
  // A read that fails costs the pace, never the list, and says so in the log.
  const logged = [];
  const keep = console.error;
  console.error = (...a) => logged.push(asText(a));
  try {
    const r = await contacts.GET.run(get(inA), {
      ...ctxFor(world(), {}, rpcs),
      supabase: fakeDb(world(), { "deals.select": { message: "statement timeout" } }, rpcs),
    });
    assert.equal(r.deal_pace, null);
    assert.equal(r.people.length, 1);
  } finally {
    console.error = keep;
  }
  assert.ok(
    logged.some((l) => l.startsWith("deal_pace_read_failed")),
    logged.join("\n"),
  );
});

test("the proposal follow-up's facts (0006): answered with People's first page where a deal is on file and its run would send -- its clock, whether it asks, what its template is for, and of who holds a proposal out, who had theirs, who is in a run on its way or waiting for a person, who heard this week; null otherwise", async () => {
  const now = Date.now();
  const DAY = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const P4 = "44444444-4444-4444-8444-444444444444";
  const P5 = "55555555-5555-4555-8555-555555555555";
  const P6 = "66666666-6666-4666-8666-666666666666";
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  const run = (id, over) => ({
    id,
    tenant_id: A,
    playbook_id: "pb-follow",
    state: "sent",
    scheduled_for: iso(now - 2 * DAY),
    created_at: iso(now - 2 * DAY),
    run_for: null,
    params: link,
    ...over,
  });
  const policy = (mode) => ({
    tenant_id: A,
    class: "follow_up",
    mode,
    subject_type: null,
    subject_id: null,
    limits: {},
  });
  const playbook = (over = {}) => ({
    id: "pb-follow",
    tenant_id: A,
    trigger: "proposal_waiting",
    // Its class: its sequence was made under the follow-ups' row (00462 sequence_mode_for).
    policy_class: "follow_up",
    state: "running",
    run_hour: 10,
    last_run_for: null,
    template_name: "proposal_follow_up",
    template_language: "en_US",
    // Its words seen going (00462): its batches go by its sequence's mode.
    words_ok_at: iso(now - 20 * DAY),
    ...over,
  });
  const tenant = (over = {}) => ({
    id: A,
    slug: "harbor",
    appointment_word: "meeting",
    timezone: "America/New_York",
    status: "active",
    ...over,
  });
  const template = (over = {}) => ({
    id: "tpl-follow",
    tenant_id: A,
    channel: "whatsapp",
    name: "proposal_follow_up",
    language: "en_US",
    meta_status: "approved",
    category: "utility",
    ...over,
  });
  const number = (config = { quality_rating: "GREEN" }) => ({
    tenant_id: A,
    kind: "whatsapp",
    status: "active",
    config,
  });
  const deal = (id, contact_id) => ({
    id,
    tenant_id: A,
    contact_id,
    stage: "proposed",
    proposed_at: iso(now - 20 * DAY),
  });
  const sent = (broadcast_id, contact_id, ms) => ({
    tenant_id: A,
    broadcast_id,
    contact_id,
    state: "sent",
    sent_at: iso(ms),
  });
  const queued = (broadcast_id, contact_id) => ({
    tenant_id: A,
    broadcast_id,
    contact_id,
    state: "queued",
    sent_at: null,
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  const world = (over = {}) => ({
    memberships: both("viewer", "viewer"),
    policies: [policy("ask")],
    tenant_config: [],
    contacts: [contact(P1, A)],
    tenants: [tenant()],
    tenant_channels: [number()],
    templates: [template()],
    playbooks: [playbook()],
    // Who holds a proposal out: everyone here but P3.
    deals: [deal(D1, P1), deal("d-2", P2), deal("d-4", P4), deal("d-5", P5), deal("d-6", P6)],
    broadcasts: [
      run("sent-run", {}),
      run("queued-run", { state: "scheduled", scheduled_for: iso(now + 3_600_000) }),
      run("held-run", { state: "pending_approval", scheduled_for: iso(now), created_at: iso(now), run_for: today }),
      // Twelve days ago: past the week's breath, since the proposals went.
      run("old-run", { scheduled_for: iso(now - 12 * DAY), created_at: iso(now - 12 * DAY) }),
      run("winback", { playbook_id: "pb-win", params: [{ kind: "first_name" }] }),
    ],
    broadcast_recipients: [
      sent("sent-run", P1, now - 2 * DAY),
      // Followed up on a proposal since decided: nothing of theirs is out now.
      sent("sent-run", P3, now - 2 * DAY),
      queued("queued-run", P2),
      queued("held-run", P4),
      sent("old-run", P6, now - 12 * DAY),
      sent("winback", P3, now - 2 * DAY),
      sent("winback", P5, now - 2 * DAY),
    ],
    ...over,
  });
  const rpcs = { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1)] : []) };
  const read = async (w, q = "") => (await contacts.GET.run(get(inA + q), ctxFor(w, {}, rpcs))).follow_up;
  const f = await read(world());
  assert.deepEqual([f.run_hour, f.last_run_for, f.asks, f.purpose], [10, null, true, "conversational"]);
  assert.deepEqual(
    Object.keys(f.had).sort(),
    [P1, P6].sort(),
    "the follow-ups that went, however long ago, since the proposals did; a win-back is none",
  );
  assert.deepEqual(Object.keys(f.queued), [P2], "the one in a run on its way");
  assert.deepEqual(Object.keys(f.held), [P4], "the one in a run waiting for a person");
  assert.deepEqual(
    Object.keys(f.heard).sort(),
    [P1, P2, P4, P5].sort(),
    "whom any run reached this week, of who holds a proposal out: the week's breath",
  );
  // Every message of theirs the breath's read holds, sent or due, earliest first: the stand walks the run's ticks to the
  // first none falls within a week of (contracts followUpStandOf; playbooks.test.mjs runs the walk). P5 went two days
  // ago; queued again for ten days ahead, both are carried, so the day is past the later one, not five days on.
  assert.deepEqual(f.heard[P5], [iso(now - 2 * DAY)], "one message");
  const chained = await read(
    world({
      broadcasts: [...world().broadcasts, run("later-run", { state: "scheduled", scheduled_for: iso(now + 10 * DAY) })],
      broadcast_recipients: [...world().broadcast_recipients, queued("later-run", P5)],
    }),
  );
  assert.deepEqual(chained.heard[P5], [iso(now - 2 * DAY), iso(now + 10 * DAY)], "both, the one due among them");
  // Whether it asks is its sequence's mode, made from its class's row (decision 0064), and new words ask whatever that is.
  assert.equal((await read(world({ policies: [policy("auto")] }))).asks, false, "auto: its runs go");
  assert.equal((await read(world({ policies: [] }))).asks, true, "a class with no row made a sequence that asks");
  assert.equal(
    (await read(world({ policies: [policy("auto")], playbooks: [playbook({ words_ok_at: null })] }))).asks,
    true,
    "its words new: its next batch waits for an OK",
  );
  assert.equal(
    (await read(world({ templates: [template({ category: "marketing" })] }))).purpose,
    "marketing",
    "Meta filed it as marketing: it reaches only a yes to offers too",
  );
  assert.equal(
    (await read(world({ templates: [template({ category: null })] }))).purpose,
    "marketing",
    "never synced: read as marketing, as the send reads it",
  );
  // Wherever its run would send nothing whoever it drew: no facts, and every row says what it said. A stop is the
  // rule, never a read that failed: a failure answers null too, and says so in the log.
  const stopped = [];
  const was = console.error;
  console.error = (...a) => stopped.push(a.join(" "));
  try {
    for (const [over, why] of [
      [{ playbooks: [playbook({ state: "paused" })] }, "paused"],
      [{ playbooks: [] }, "none made"],
      [{ deals: [] }, "no proposal out: nobody to say anything of"],
      [{ tenants: [tenant({ status: "paused" })] }, "the workspace paused: the sweep runs nothing"],
      [{ templates: [] }, "its template gone"],
      [{ templates: [template({ meta_status: "pending" })] }, "its template not one Meta approved"],
      [{ tenant_channels: [number({ quality_rating: "RED" })] }, "its number flagged"],
    ])
      assert.equal(await read(world(over)), null, why);
  } finally {
    console.error = was;
  }
  assert.deepEqual(stopped, [], "every stop is the rule's, none a failure");
  // No WhatsApp number is no stop: the edge's run reads a workspace with none as a number that can send (numberHealth of
  // nothing), holds WhatsApp's people and goes on for the rest. So the facts are answered, ticking WhatsApp alone or WhatsApp
  // and email, and who is promised a follow-up is decided person by person against what the workspace can send on
  // (contracts followUpStandOf), as the page does with the route's own answer.
  const holder = (id, name, over) =>
    personRow(id, {
      display_name: name,
      deal_id: `deal-${name}`,
      deal_stage: "proposed",
      deal_proposed_at: iso(now - 20 * DAY),
      deal_proposal_url: `https://docs.example.com/proposal/${name}`,
      ...over,
    });
  const onWhatsApp = holder(P1, "Ada", {});
  const byEmail = holder(P2, "Grace", { phone_e164: null, email: "grace@example.com" });
  const noNumber = (channels) => world({ tenant_channels: [], playbooks: [playbook({ channels })] });
  const answer = async (channels) =>
    contacts.GET.run(get(inA), ctxFor(noNumber(channels), {}, { people_list: () => [onWhatsApp, byEmail] }));
  const stands = (page, ready = page.channels_ready) =>
    Object.fromEntries(
      poolRowsOf(page.people, {
        tz: "America/New_York",
        now: new Date(now),
        viewer: null,
        ready,
      }).map((vm) => [
        vm.id,
        followUpStandOf(vm, page.follow_up, "America/New_York", now, dealPaceOf(page.deal_pace), ready)?.kind ?? null,
      ]),
    );
  const withEmail = await answer(["whatsapp", "email"]);
  assert.deepEqual(
    [withEmail.follow_up.run_hour, withEmail.follow_up.asks, withEmail.follow_up.purpose, withEmail.follow_up.channels],
    [10, true, "conversational", ["whatsapp", "email"]],
    "no number, WhatsApp and email: the facts are answered, as its run would go for the people it can reach",
  );
  assert.equal(
    withEmail.channels_ready.whatsapp.ready,
    false,
    "and the route says the workspace cannot send on WhatsApp",
  );
  assert.deepEqual(
    stands(withEmail),
    { [P1]: null, [P2]: null },
    "against what this workspace can send on (no number, no mailbox read here): the person on WhatsApp alone is held, not promised",
  );
  // With a mailbox set up (the route reads none in this world), the same facts promise the person with an address, by
  // email, and still hold the one reachable on WhatsApp alone.
  const mailbox = channelsReady({ whatsapp: null, textLine: null, email: { mailbox: true, domain: true } });
  assert.deepEqual(stands(withEmail, mailbox), { [P1]: null, [P2]: "will" });
  // WhatsApp alone, with no number: the facts are answered too, and nobody is promised one.
  const alone = await answer(["whatsapp"]);
  assert.deepEqual(alone.follow_up.channels, ["whatsapp"]);
  assert.deepEqual(stands(alone, mailbox), { [P1]: null, [P2]: null }, "the run draws nobody on WhatsApp with none");
  assert.equal(await read(world(), "&q=ro"), null, "a search reads none: People keeps its first page's");
  // A read that fails costs the facts, never the list, and says so in the log.
  const logged = [];
  const keep = console.error;
  console.error = (...a) => logged.push(asText(a));
  try {
    for (const fail of ["sequence_steps.select", "templates.select", "tenant_channels.select"]) {
      const r = await contacts.GET.run(get(inA), {
        ...ctxFor(world(), {}, rpcs),
        supabase: fakeDb(world(), { [fail]: { message: "statement timeout" } }, rpcs),
      });
      assert.deepEqual([r.follow_up, r.people.length], [null, 1], fail);
    }
  } finally {
    console.error = keep;
  }
  assert.equal(logged.filter((l) => l.startsWith("follow_up_facts_failed")).length, 3, logged.join("\n"));
});

test("the merge of two records (0028): the owner's, judged on the kept record, the door's answer and its refusal as said", async () => {
  assert.deepEqual(merge.POST.policy, {
    kind: "write",
    fresh: true,
    scope: "row",
    role: "owner",
    rate: "merge",
    spend: false,
  });
  const asked = [];
  const door = (a) => {
    asked.push(a);
    if (a.p_merge === P3) {
      throw Object.assign(new Error(MERGE_REFUSALS.phones), { code: "22023" });
    }
    return {
      contact_id: a.p_keep,
      merged: a.p_merge,
      tenant_id: A,
      decision_id: D1,
      consent: "opted_in",
      marketing_consent: "unknown",
      email_marketing: "unknown",
      counts: { identities: 1, messages: 2, threads: "folded" },
    };
  };
  const tables = { memberships: both("owner", "viewer"), contacts: [contact(P1, A), contact(P2, A), contact(P3, A)] };
  const out = await merge.POST.run(
    send("POST", { merge: P2 }, inA),
    ctxFor(tables, { id: P1 }, { merge_people: door }),
  );
  assert.deepEqual([out.contact_id, out.merged, out.counts.threads], [P1, P2, "folded"]);
  assert.deepEqual(
    asked,
    [{ p_keep: P1, p_merge: P2 }],
    "the kept record from the path, the other from the body, as the door takes them",
  );

  // The door's refusal comes back as it was said, as a 400.
  await assert.rejects(
    merge.POST.run(send("POST", { merge: P3 }, inA), ctxFor(tables, { id: P1 }, { merge_people: door })),
    (e) => {
      assert.equal(e.status, 400);
      assert.equal(e.message, MERGE_REFUSALS.phones);
      return true;
    },
  );
  // Not a uuid, no body: refused before the door is asked.
  await refused(
    merge.POST.run(send("POST", { merge: "nope" }, inA), ctxFor(tables, { id: P1 }, { merge_people: door })),
    "validation",
    400,
  );
  // A kept record the caller cannot see is not found; an operator is refused; neither reaches the door.
  await refused(
    merge.POST.run(
      send("POST", { merge: P2 }, inA),
      ctxFor({ ...tables, contacts: [contact(P2, A)] }, { id: P1 }, { merge_people: door }),
    ),
    "not_found",
    404,
  );
  await refused(
    merge.POST.run(
      send("POST", { merge: P2 }, inA),
      ctxFor({ ...tables, memberships: both("operator", "viewer") }, { id: P1 }, { merge_people: door }),
    ),
    "forbidden",
    403,
  );
  assert.equal(asked.length, 2, "the door was asked for the two merges and nothing else");
});
