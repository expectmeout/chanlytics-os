/**
 * People's routes: the ten declare their policy; one person in full; an erasure and the scrubs it hands on; details;
 * one list; everyone a page at a time; and a note for many.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A,
  B,
  P1,
  P2,
  P3,
  S1,
  S2,
  USER,
  at,
  both,
  contact,
  contacts,
  ctxFor,
  details,
  erasureKeys,
  get,
  inA,
  kept,
  list,
  lists,
  liveContact,
  membership,
  notesMany,
  person,
  personRow,
  pol,
  receptionist,
  receptionistMany,
  refused,
  send,
  setServiceClient,
  viewSet,
  views,
  writes,
} from "./_routes.mjs";

test("the ten declare their policy: the reads open to every member, the changes counted, the erasure and the receptionist the owner's, every single-row verb judged where its row lives", () => {
  const open = { kind: "read", role: null, rate: null, spend: false, scope: "workspace" };
  assert.deepEqual(contacts.GET.policy, open);
  assert.deepEqual(person.GET.policy, open);
  assert.deepEqual(lists.GET.policy, open);
  assert.deepEqual(contacts.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "person_create",
    spend: false,
  });
  assert.deepEqual(person.DELETE.policy, {
    kind: "write",
    fresh: true,
    scope: "row",
    role: "owner",
    rate: "erase",
    spend: false,
  });
  assert.deepEqual(details.PUT.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  assert.deepEqual(receptionist.PUT.policy, {
    kind: "write",
    scope: "row",
    role: "owner",
    rate: "person_mode",
    spend: false,
  });
  assert.deepEqual(lists.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "lists",
    spend: false,
  });
  assert.deepEqual(list.PUT.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
  assert.deepEqual(list.DELETE.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
});

test("the people list is the workspace the tab named: each person with their reply mode, and the calendar's state when none is connected", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P2, "never")],
    tenants: [],
    tenant_config: [],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1), personRow(P2)] : [personRow(P3)]) };
  const out = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    out.people.map((p) => [p.id, p.effective_reply_mode, p.visits]),
    [
      [P1, "auto", null],
      [P2, "never", null],
    ],
  );
  assert.equal(out.calendar.state, "none");
  assert.deepEqual(
    out.page,
    { q: null, offset: 0, limit: 1000, total: 0, has_more: false, next: null },
    "the page: counted where the rows are (none in this fixture's contacts table)",
  );
  const bayside = await contacts.GET.run(get(`?workspace=${B}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    bayside.people.map((p) => p.id),
    [P3],
  );
});

test("adding a person: the workspace must be named, a viewer is refused as a viewer, a number that is not one is refused in the product's words, and the door gets the normalized number", async () => {
  const made = [];
  const rpcs = {
    create_person: (a) => {
      made.push(a);
      return { contact_id: P1, existed: false };
    },
  };
  const tables = { memberships: both("viewer", "operator") };
  await refused(
    contacts.POST.run(send("POST", { phone: "+1 555 000 0001" }), ctxFor(tables, {}, rpcs)),
    "choose_workspace",
    400,
  );
  await refused(
    contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "forbidden",
    403,
    "a viewer, whatever the body says",
  );
  await refused(
    contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${B}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
  );
  assert.equal(made.length, 0, "nothing reached the door");
  const out = await contacts.POST.run(
    send("POST", { phone: "+1 (555) 000-0001", name: "  Ada  ", source: "walk_in" }, `?workspace=${B}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(out, { contact_id: P1, existed: false });
  // A door's own word goes through. Not "calendar" or "lead": people_list (00138) names those two, and they are the
  // sweep's and the converter's, written server-side. This door took any word, so a person added by hand could say "Your calendar".
  await contacts.POST.run(
    send("POST", { phone: "+1 (555) 000-0002", name: "Bea", source: "calendar" }, `?workspace=${B}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(
    made,
    [
      { p_tenant_id: B, p_phone_e164: "+15550000001", p_display_name: "Ada", p_source: "walk_in" },
      { p_tenant_id: B, p_phone_e164: "+15550000002", p_display_name: "Bea", p_source: "manual" },
    ],
    "REGRESSION: the public door claimed the calendar's source",
  );
});

test("one person in full: the row with both reply modes, the notes, where they came from, the booking link; a person not in the named workspace is a 404", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    contacts: [contact(P1, A, { notes: "Sees Sofia" })],
    contact_identities: [
      { contact_id: P1, channel: "whatsapp", external_id: "15550000001", created_at: "2026-08-01T00:00:00Z" },
    ],
    conversations: [],
    calls: [],
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P1, "ask")],
    events: [
      {
        tenant_id: A,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: P1,
        data: { source: "calendar", title: "Colour" },
        created_at: "2026-08-01T00:00:00Z",
      },
      // Every change to either answer, as the doors write it: the profile shows these as evidence.
      {
        id: "ev-1",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: {
          consent: "opted_in",
          source: "customer_message",
          channel: "sms",
          message_external_id: "SM123",
          words: "START",
        },
        created_at: "2026-08-02T00:00:00Z",
      },
      {
        id: "ev-2",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: { purpose: "marketing", consent: "opted_in", source: "form", note: "signed 2 Sep", by: "u-ada" },
        created_at: "2026-08-03T00:00:00Z",
      },
      // Somebody else's change, and another kind: neither is this person's history.
      {
        id: "ev-3",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P2,
        data: { consent: "opted_out", source: "customer_message" },
        created_at: "2026-08-04T00:00:00Z",
      },
      {
        id: "ev-4",
        tenant_id: A,
        kind: "message.sent",
        subject_type: "message",
        subject_id: "m-1",
        data: {},
        created_at: "2026-08-05T00:00:00Z",
      },
    ],
    tenant_config: [{ tenant_id: A, config: { brain: { booking_link: " https://book.example/marisa " } } }],
    tenants: [],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) };
  const { person: p } = await person.GET.run(get(inA), ctxFor(tables, { id: P1 }, rpcs));
  assert.equal(p.row.id, P1);
  assert.equal(p.row.effective_reply_mode, "ask");
  assert.equal(p.receptionist_mode, "ask");
  assert.equal(p.workspace_reply_mode, "auto");
  assert.equal(p.notes, "Sees Sofia");
  assert.equal(p.booking_link, "https://book.example/marisa");
  assert.deepEqual(p.added, { at: "2026-08-01T00:00:00Z", source: "calendar", title: "Colour" });
  assert.deepEqual(
    p.consent_history.map((c) => [
      c.id,
      c.purpose,
      c.consent,
      c.source,
      c.channel,
      c.message_external_id,
      c.words,
      c.by,
      c.note,
    ]),
    [
      ["ev-2", "marketing", "opted_in", "form", null, null, null, "u-ada", "signed 2 Sep"],
      ["ev-1", "conversational", "opted_in", "customer_message", "sms", "SM123", "START", null, null],
    ],
    "this person's consent changes, newest first, with the evidence each carries",
  );
  assert.equal(p.identities.length, 1);
  assert.deepEqual(p.conversations, []);
  assert.equal(p.visits, undefined, "no calendar connected");
  await refused(
    person.GET.run(get(`?workspace=${B}`), ctxFor(tables, { id: P1 }, rpcs)),
    "not_found",
    404,
    "the workspace named on the request is the door",
  );
  await refused(person.GET.run(get(inA), ctxFor(tables, { id: "not-a-uuid" }, rpcs)), "not_found", 404);
});

test("erasing a person is the owner's, judged where the person lives, and a refusal touches nothing", async () => {
  const tables = { memberships: both("owner", "operator"), contacts: [contact(P1, A), contact(P2, B)] };
  const operator = ctxFor(tables, { id: P2 });
  await refused(
    person.DELETE.run(send("DELETE"), operator),
    "forbidden",
    403,
    "an operator in bayside, though an owner in harbor",
  );
  assert.equal(writes(operator), 0);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: P3 })), "not_found", 404);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
});

test("a key that could not be READ stops the erasure, rather than erasing without it", async () => {
  // The keys are collected while the rows still exist, because after the
  // tombstone there is nowhere left to recompute them. The identities read used
  // to drop its error, so a failed read looked exactly like "no WhatsApp
  // identity" -- and the Blob job was queued without the wa_ids, leaving the
  // verbatim transcript in Blob for ever under a reply of `{ erased: true }`.
  const tables = { memberships: both("owner", "operator"), contacts: [contact(P1, A)] };
  for (const [table, what] of [
    ["contact_identities", /WhatsApp identities/],
    ["calls", /call recordings/],
    ["messages", /stored media/],
  ]) {
    const ctx = {
      supabase: fakeDb(tables, { [`${table}.select`]: { message: "statement timeout" } }),
      userId: USER,
      email: "ada@example.com",
      params: { id: P1 },
    };
    await assert.rejects(person.DELETE.run(send("DELETE"), ctx), (e) => {
      assert.equal(e.code, "internal", table);
      assert.match(e.message, what, table);
      assert.match(e.message, /nothing was deleted/, table);
      return true;
    });
    assert.equal(writes(ctx), 0, `${table}: refused before anything was queued or destroyed`);
    assert.equal(tables.contacts[0].erased_at, null, `${table}: the person is still there to try again`);
  }
});

test("an erasure hands the Ask scrub, the kept deliveries' scrub and the notes' scrub every spelling of the number and the address, before the rows go and after; a re-drive, the id", async () => {
  const scrubs = [];
  const kept = [];
  const noted = [];
  const turned = [];
  const rpcs = {
    model_turns_scrub: (a) => {
      turned.push(a);
      return 0;
    },
    scrub_ask_for_contact: (a) => {
      scrubs.push(a);
      return 0;
    },
    provider_events_scrub: (a) => {
      kept.push(a);
      return 0;
    },
    person_notes_scrub: (a) => {
      noted.push(a);
      return 0;
    },
    erase_contact: () => ({ counts: {}, storage_paths: [], jobs_canceled: 0 }),
  };
  /** The erasure on a database in memory, its service-client legs (the block, the finished jobs) on the same one. */
  const erase = async (tables) => {
    const ctx = ctxFor(
      { memberships: both("owner", "operator"), calls: [], messages: [], jobs: [], ...tables },
      { id: P1 },
      rpcs,
    );
    setServiceClient(ctx.supabase);
    try {
      return { out: await person.DELETE.run(send("DELETE"), ctx), seen: ctx.supabase.seen };
    } finally {
      setServiceClient(null);
    }
  };

  const { out, seen } = await erase({
    contacts: [contact(P1, A, { phone_e164: "+15550100123", email: "ada@example.com", erasing_since: null })],
    contact_identities: [
      { contact_id: P1, external_id: "15550100123" },
      { contact_id: P1, external_id: "ada.b@example.com" },
    ],
  });
  assert.equal(out.erased, true);
  const { needles } = erasureKeys({ phone_e164: "+15550100123", email: "ada@example.com" }, [
    "15550100123",
    "ada.b@example.com",
  ]);
  assert.ok(needles.includes("+1 (555) 010-0123") && needles.includes("ada.b@example.com"), "the spellings");
  assert.deepEqual(
    scrubs.map((a) => [a.p_tenant_id, a.p_contact_id, a.p_needles]),
    [
      [A, P1, needles],
      [A, P1, needles],
    ],
    "with every spelling, before erase_contact and after it",
  );
  assert.deepEqual(
    kept.map((a) => [a.p_tenant_id, a.p_needles]),
    [
      [A, needles],
      [A, needles],
    ],
    "the intake ledger's copies (00336), by the same spellings, before erase_contact and after it",
  );
  assert.deepEqual(
    noted.map((a) => [a.p_tenant_id, a.p_contact_id, a.p_needles]),
    [
      [A, P1, needles],
      [A, P1, needles],
    ],
    "other people's notes (00341), by the same spellings, the person's own left to go with them",
  );
  assert.deepEqual(
    turned.map((a) => [a.p_tenant_id, a.p_needles]),
    [
      [A, needles],
      [A, needles],
    ],
    "the receptionist's kept turns that name them (00401), by the same spellings, before erase_contact and after it",
  );
  assert.deepEqual(
    seen.filter((s) => s.rpc).map((s) => s.rpc),
    [
      "erasure_digests",
      "scrub_ask_for_contact",
      "provider_events_scrub",
      "person_notes_scrub",
      "model_turns_scrub",
      "erase_contact",
      "scrub_ask_for_contact",
      "provider_events_scrub",
      "person_notes_scrub",
      "model_turns_scrub",
    ],
    "the digests are the database's (00263), made before the block is written",
  );

  // Already erased: nothing is left to spell them by, and the re-drive scrubs by the id alone.
  scrubs.length = 0;
  const again = await erase({
    contacts: [contact(P1, A, { phone_e164: null, email: null, erased_at: "2026-09-01T00:00:00Z" })],
  });
  assert.equal(again.out.already_erased, true);
  assert.deepEqual(
    scrubs.map((a) => [a.p_contact_id, a.p_needles]),
    [[P1, []]],
  );
});

test("details: an operator where the person lives, a name or notes or both, trimmed, through the two doors, the answer saying what the name was; an erased person is a 404", async () => {
  const doors = [];
  const rpcs = {
    // The person as they stand before the name's door runs (people_list narrowed to them): what the answer says it was.
    people_list: (a) => [{ id: a.p_contact_id, display_name: "Ada L.", email: null }],
    set_person_name: (a) => {
      doors.push(["name", a]);
      return { name: a.p_name || null };
    },
    set_person_notes: (a) => {
      doors.push(["notes", a]);
      return { notes: a.p_notes || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  await refused(details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P1 }, rpcs)), "forbidden", 403);
  await assert.rejects(details.PUT.run(send("PUT", {}), ctxFor(tables, { id: P2 }, rpcs)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Send a name, notes, an email address or a proposal link\./);
    return true;
  });
  await refused(
    details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P3 }, rpcs)),
    "not_found",
    404,
    "erased",
  );
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  const out = await details.PUT.run(
    send("PUT", { name: "  Ada Lovelace  ", notes: " Sees Sofia " }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  // What the name was rides back, for an undo that puts back what was there at this write; notes carry none.
  assert.deepEqual(out, { contact_id: P2, name: "Ada Lovelace", notes: "Sees Sofia", was: { name: "Ada L." } });
  assert.deepEqual(doors, [
    ["name", { p_contact_id: P2, p_name: "Ada Lovelace" }],
    ["notes", { p_contact_id: P2, p_notes: "Sees Sofia" }],
  ]);
  const cleared = await details.PUT.run(send("PUT", { notes: "" }), ctxFor(tables, { id: P2 }, rpcs));
  assert.deepEqual(cleared, { contact_id: P2, notes: null }, "an empty string clears");
});

test("details: an email address is judged by the one normalizer before the door opens, stored in its spelling, cleared by an empty string, and the door's own refusal for a second person with it is a 409 in the owner's words", async () => {
  const doors = [];
  const taken = { code: "23505", message: "Another person here already has that address." };
  let onFile = "old@example.com";
  const rpcs = {
    // The person as they stand before the address's door runs: read after the address is judged, never before.
    people_list: (a) => {
      doors.push("read");
      return [{ id: a.p_contact_id, display_name: null, email: onFile }];
    },
    set_person_email: (a) => {
      doors.push(a);
      if (a.p_email === "taken@example.com") {
        const e = new Error(taken.message);
        e.code = taken.code;
        throw e;
      }
      return { email: a.p_email || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  const put = (body, id = P2) => details.PUT.run(send("PUT", body), ctxFor(tables, { id }, rpcs));
  await refused(put({ email: "ana@example.com" }, P1), "forbidden", 403);
  await refused(put({ email: "ana@example.com" }, P3), "not_found", 404, "erased");
  for (const [typed, words] of [
    ["ana.example.com", /missing the @/],
    ["Ana <ana@example.com>", /Only the address itself/],
    ["ana@example", /full domain/],
  ]) {
    await assert.rejects(put({ email: typed }), (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, words);
      return true;
    });
  }
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  assert.deepEqual(await put({ email: "  Ana@Example.COM " }), {
    contact_id: P2,
    email: "ana@example.com",
    was: { email: "old@example.com" },
  });
  assert.deepEqual(
    doors,
    ["read", { p_contact_id: P2, p_email: "ana@example.com" }],
    "what it was is read first, then the door is handed the stored spelling, not the typed one",
  );
  onFile = "ana@example.com";
  assert.deepEqual(
    await put({ email: "" }),
    { contact_id: P2, email: null, was: { email: "ana@example.com" } },
    "an empty string clears, and the answer says what it held",
  );
  await assert.rejects(put({ email: "taken@example.com" }), (e) => {
    assert.equal(e.code, "conflict");
    assert.equal(e.status, 409);
    assert.equal(e.message, taken.message);
    return true;
  });
});

test("details: a proposal link is judged by the one normalizer before the door opens, stored with its scheme, cleared by an empty string", async () => {
  const doors = [];
  const rpcs = {
    set_person_proposal: (a) => {
      doors.push(a);
      return { proposal_url: a.p_url || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  const put = (body, id = P2) => details.PUT.run(send("PUT", body), ctxFor(tables, { id }, rpcs));
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P1), "forbidden", 403);
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P3), "not_found", 404, "erased");
  for (const [typed, words] of [
    ["docs", /full web address/],
    ["mailto:ana@example.com", /starting with https/],
    ["https://docs.example.com/p 1", /no spaces/],
  ]) {
    await assert.rejects(put({ proposal: typed }), (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, words);
      return true;
    });
  }
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  assert.deepEqual(
    await put({ proposal: " docs.example.com/p/1 " }),
    { contact_id: P2, proposal_url: "https://docs.example.com/p/1" },
    "the scheme is supplied, the rest kept as typed",
  );
  assert.deepEqual(doors, [{ p_contact_id: P2, p_url: "https://docs.example.com/p/1" }]);
  assert.deepEqual(await put({ proposal: "" }), { contact_id: P2, proposal_url: null }, "an empty string clears");
  assert.deepEqual(doors[1], { p_contact_id: P2, p_url: "" });
});

test("the receptionist for one person: owner-only where they live, one of four modes, a policies row replaced not duplicated and removed by inherit, each change on the ledger", async () => {
  const tables = {
    memberships: both("operator", "owner"),
    contacts: [contact(P1, A), contact(P2, B)],
    policies: [],
    decisions: [],
  };
  await refused(
    receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P1 })),
    "forbidden",
    403,
    "an operator in harbor, though an owner in bayside",
  );
  await assert.rejects(receptionist.PUT.run(send("PUT", { mode: "loud" }), ctxFor(tables, { id: P2 })), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Mode must be one of: auto, ask, never, inherit\./);
    return true;
  });
  assert.equal(tables.policies.length, 0);
  const silenced = await receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual([silenced.contact_id, silenced.mode], [P2, "never"]);
  assert.ok(/^[0-9a-f-]{36}$/.test(silenced.decision_id), "the ledger row rides back, so an undo can name it");
  assert.deepEqual(
    tables.policies.map((p) => [p.tenant_id, p.class, p.subject_type, p.subject_id, p.mode]),
    [[B, "reply", "contact", P2, "never"]],
  );
  await receptionist.PUT.run(send("PUT", { mode: "ask" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual(
    tables.policies.map((p) => p.mode),
    ["ask"],
    "replaced, not duplicated",
  );
  const back = await receptionist.PUT.run(send("PUT", { mode: "inherit" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual([back.contact_id, back.mode], [P2, null]);
  assert.equal(tables.policies.length, 0, "inherit removes the person's own row");
  // An undo from a card: the same verb, its row linked to the one it reverses, marked as a card's.
  await receptionist.PUT.run(send("PUT", { mode: "never" }), {
    ...ctxFor(tables, { id: P2 }),
    via: "ask",
    undoOf: back.decision_id,
  });
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_id, d.payload.receptionist_mode]),
    [
      ["pause_agent", P2, "never"],
      ["pause_agent", P2, "ask"],
      ["resume_agent", P2, "inherit"],
      ["pause_agent", P2, "never"],
    ],
  );
  assert.deepEqual(
    tables.decisions.map((d) => d.undo_of),
    [null, null, null, back.decision_id],
    "only the undo is linked, to the row it undid",
  );
  assert.deepEqual(
    tables.decisions.map((d) => d.payload.via),
    [undefined, undefined, undefined, "ask"],
  );
});

test("lists: one workspace's with their members' ids; a viewer may not make one; the name is refused in the helper's words and kept tidy", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [
      { id: S1, tenant_id: A, name: "Regulars" },
      { id: S2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [
      { segment_id: S1, contact_id: P1, tenant_id: A },
      { segment_id: S2, contact_id: P2, tenant_id: B },
    ],
  };
  assert.deepEqual(await lists.GET.run(get(inA), ctxFor(tables)), {
    lists: [{ id: S1, name: "Regulars", ids: [P1], rule: null, archived_at: null }],
  });
  assert.deepEqual(await lists.GET.run(get(`?workspace=${B}`), ctxFor(tables)), {
    lists: [{ id: S2, name: "VIP", ids: [P2], rule: null, archived_at: null }],
  });
  await refused(
    lists.POST.run(send("POST", { name: "Colour club" }, `?workspace=${A}`), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(lists.POST.run(send("POST", { name: "   " }, `?workspace=${B}`), ctxFor(tables)), "validation", 400);
  const made = await lists.POST.run(send("POST", { name: "  Colour   club " }, `?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(made, { id: made.id, name: "Colour club", ids: [], rule: null, archived_at: null });
  assert.deepEqual(
    tables.segments.filter((s) => s.id === made.id).map((s) => [s.tenant_id, s.created_by]),
    [[B, USER]],
  );
});

test("one list: an operator where it lives; rename, add and remove in one request, adding twice is not an error; a delete removes it once", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [
      { id: S1, tenant_id: A, name: "Regulars" },
      { id: S2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
  };
  await refused(list.PUT.run(send("PUT", { name: "Best" }), ctxFor(tables, { id: S1 })), "forbidden", 403);
  await refused(list.PUT.run(send("PUT", {}), ctxFor(tables, { id: S2 })), "validation", 400, "nothing to change");
  await refused(list.PUT.run(send("PUT", { add: ["nope"] }), ctxFor(tables, { id: S2 })), "validation", 400);
  assert.deepEqual(
    await list.PUT.run(send("PUT", { name: " Best ", add: [P3, P3], remove: [P2] }), ctxFor(tables, { id: S2 })),
    { id: S2, name: "Best", ids: [P3], rule: null, archived_at: null },
  );
  assert.equal(tables.segments.find((s) => s.id === S2).name, "Best");
  assert.deepEqual(
    await list.PUT.run(send("PUT", { add: [P3] }), ctxFor(tables, { id: S2 })),
    { id: S2, name: "Best", ids: [P3], rule: null, archived_at: null },
    "adding someone twice is not an error",
  );
  assert.equal(tables.segment_members.length, 1);
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S1 })), "forbidden", 403);
  assert.deepEqual(await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), { deleted: true, id: S2 });
  assert.ok(!tables.segments.some((s) => s.id === S2));
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), "not_found", 404, "gone");
});

test("the list pages under one order and counts everyone: the door is named a query, an offset or a limit only when they leave their defaults", async () => {
  const asked = [];
  const rpcs = {
    people_list: (a) => {
      asked.push(a);
      return a.p_query ? [personRow(P2, { display_name: "Bo" })] : [personRow(P1), personRow(P2)];
    },
  };
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: [
      liveContact(P1, A),
      liveContact(P2, A, { display_name: "Bo", phone_e164: "+15550000002" }),
      liveContact(P3, A, { erased_at: "2026-08-01T00:00:00Z" }), // erased: not counted
      liveContact("44444444-4444-4444-8444-444444444444", A, { merged_into_contact_id: P1 }), // merged: not counted
      liveContact("55555555-5555-4555-8555-555555555555", B), // another workspace
    ],
  };
  const first = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(first.page, { q: null, offset: 0, limit: 1000, total: 2, has_more: false, next: null });
  assert.deepEqual(
    asked.at(-1),
    { p_tenant_id: A },
    "the first page names only the tenant: a database without 00112 answers as before",
  );
  const next = await contacts.GET.run(get(`${inA}&offset=1000`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(asked.at(-1), { p_tenant_id: A, p_offset: 1000 });
  assert.equal(next.page.offset, 1000);
  assert.equal(next.page.has_more, false);
  const found = await contacts.GET.run(get(`${inA}&q=%20bo%20`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(asked.at(-1), { p_tenant_id: A, p_query: "bo" }, "trimmed, and the door does the matching");
  assert.deepEqual(
    found.people.map((p) => p.id),
    [P2],
  );
  assert.deepEqual(
    found.page,
    { q: "bo", offset: 0, limit: 1000, total: 1, has_more: false, next: null },
    "counted with the same three matches",
  );
  const digits = await contacts.GET.run(get(`${inA}&q=0002`), ctxFor(tables, {}, rpcs));
  assert.equal(digits.page.total, 1, "three digits of a number count");
  const punct = await contacts.GET.run(get(`${inA}&q=a,b(c)`), ctxFor(tables, {}, rpcs));
  assert.equal(punct.page.total, 0, "the filter grammar's own characters never reach it");
  await refused(contacts.GET.run(get(`${inA}&offset=-1`), ctxFor(tables, {}, rpcs)), "validation", 400);
});

test("a page says where the next begins once its rows carry their place, and the next is read just past the last row; a cursor the route did not give is refused", async () => {
  const world = kept(1500);
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: world.contacts,
  };
  const rpcs = { people_list: world.people_list };
  const first = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(first.people.length, 1000);
  assert.equal(
    first.people[999].in_touch_at,
    world.people_list({ p_tenant_id: A })[999].in_touch_at,
    "each row its place",
  );
  assert.equal(first.page.has_more, true);
  assert.equal(typeof first.page.next, "string", "where the next page begins, opaque to the page");
  // Someone the pages have not reached writes: they move above the cursor, and nobody is read twice.
  world.move(world.idOf(1200));
  const last = first.people[999];
  const second = await contacts.GET.run(
    get(`${inA}&offset=1000&after=${encodeURIComponent(first.page.next)}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(
    world.asked.at(-1),
    { p_tenant_id: A, p_after_at: last.in_touch_at, p_after_added: last.added_at, p_after_id: last.id },
    "just past the last row, and the offset only counts what the page holds",
  );
  assert.equal(second.people.length, 499, "everyone past it but the one who wrote");
  assert.ok(!second.people.some((p) => first.people.some((q) => q.id === p.id)), "nobody twice");
  assert.deepEqual(second.page, { q: null, offset: 1000, limit: 1000, total: 1500, has_more: false, next: null });

  // A database before 00276: no place on the rows, so no cursor, and the next page is asked by offset as before.
  const before = kept(1500, { places: false });
  const old = await contacts.GET.run(
    get(inA),
    ctxFor({ ...tables, contacts: before.contacts }, {}, { people_list: before.people_list }),
  );
  assert.deepEqual([old.page.has_more, old.page.next], [true, null]);

  for (const bad of [
    "not-a-cursor",
    Buffer.from(JSON.stringify(["2026-09-01T00:00:00Z", "yesterday", P1])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-01T00:00:00Z", "2026-01-01T00:00:00Z", "not-a-uuid"])).toString("base64url"),
  ]) {
    await refused(contacts.GET.run(get(`${inA}&after=${bad}`), ctxFor(tables, {}, rpcs)), "validation", 400, bad);
  }
});

test("everyone is read a page at a time, each just past the last row's place, and nobody twice when someone writes between pages; by offset from a database before 00276", async () => {
  const { listEveryone } = await import(at("apps/dashboard/src/server/people/people.ts"));
  const world = kept(2500);
  const tables = { memberships: both("owner", "owner"), policies: [], contacts: world.contacts };
  let calls = 0;
  const people_list = (a) => {
    // Between the first page and the second, someone the pass has not reached writes.
    if (++calls === 2) world.move(world.idOf(2200));
    return world.people_list(a);
  };
  const all = await listEveryone(ctxFor(tables, {}, { people_list }), A);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length, "nobody twice");
  assert.equal(all.length, 2499, "everyone but the one who moved above the cursor, whom the next pass reads first");
  assert.deepEqual(
    world.asked.map((a) => Object.keys(a).sort()),
    [
      ["p_tenant_id"],
      ["p_after_added", "p_after_at", "p_after_id", "p_tenant_id"],
      ["p_after_added", "p_after_at", "p_after_id", "p_tenant_id"],
    ],
  );

  const before = kept(2500, { places: false });
  const old = await listEveryone(
    ctxFor({ ...tables, contacts: before.contacts }, {}, { people_list: before.people_list }),
    A,
  );
  assert.equal(old.length, 2500);
  assert.deepEqual(before.asked, [
    { p_tenant_id: A },
    { p_tenant_id: A, p_offset: 1000 },
    { p_tenant_id: A, p_offset: 2000 },
  ]);
});

test("each person's receptionist mode past a thousand people with one of their own, and the workspace's wherever its row was written: the policies are read a page at a time", async () => {
  const { listEveryone } = await import(at("apps/dashboard/src/server/people/people.ts"));
  const world = kept(1500);
  const polId = (i) => `99999999-0000-4000-8000-${String(i).padStart(12, "0")}`;
  // 1,100 people with a mode of their own, written before the workspace's own row: one select answers a thousand rows
  // (PostgREST's max_rows), which held neither the workspace's row nor the last hundred people's.
  const policies = [
    ...Array.from({ length: 1100 }, (_, i) => ({ id: polId(i + 1), ...pol(A, "contact", world.idOf(i + 1), "never") })),
    { id: polId(5000), ...pol(A, null, null, "veto") },
  ];
  const tables = {
    memberships: both("owner", "owner"),
    policies,
    tenants: [],
    tenant_config: [],
    contacts: world.contacts,
  };
  const modes = new Map(
    (await listEveryone(ctxFor(tables, {}, { people_list: world.people_list }), A)).map((p) => [
      p.id,
      p.effective_reply_mode,
    ]),
  );
  assert.equal(modes.get(world.idOf(1)), "never", "their own");
  assert.equal(modes.get(world.idOf(1050)), "never", "their own, past the thousandth row");
  assert.equal(modes.get(world.idOf(1200)), "veto", "the workspace's, for someone with none of their own");
  // People's own page reads them the same way.
  const second = await contacts.GET.run(
    get(`${inA}&offset=1000`),
    ctxFor(tables, {}, { people_list: kept(1500, { places: false }).people_list }),
  );
  const onPage = new Map(second.people.map((p) => [p.id, p.effective_reply_mode]));
  assert.deepEqual(
    [onPage.get(world.idOf(1050)), onPage.get(world.idOf(1200))],
    ["never", "veto"],
    "on the page past the first",
  );
});

test("the receptionist's mode for many: owners, ours and not erased, the same policy row and ledger verb per person", async () => {
  assert.deepEqual(receptionistMany.PUT.policy, {
    kind: "write",
    scope: "workspace",
    role: "owner",
    rate: "person_mode",
    spend: false,
  });
  const tables = {
    memberships: both("owner", "viewer"),
    contacts: [liveContact(P1, A), liveContact(P2, A, { erased_at: "2026-08-01T00:00:00Z" }), liveContact(P3, B)],
    policies: [pol(A, "contact", P1, "auto")],
    decisions: [],
  };
  const out = await receptionistMany.PUT.run(
    send("PUT", { ids: [P1, P2, P3, P1], mode: "never" }, inA),
    ctxFor(tables),
  );
  assert.deepEqual(out, { done: 1, failed: [], skipped: [P2, P3] });
  assert.deepEqual(
    tables.policies.map((p) => [p.subject_id, p.mode]),
    [[P1, "never"]],
    "the one row per person, replaced in place",
  );
  assert.deepEqual(
    tables.decisions.map((d) => [d.subject_id, d.verb, d.payload.receptionist_mode, d.payload.batch]),
    [[P1, "pause_agent", "never", 3]],
  );
  const back = await receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "inherit" }, inA), ctxFor(tables));
  assert.deepEqual(back, { done: 1, failed: [], skipped: [] });
  assert.deepEqual(tables.policies, [], "inherit removes the row: they follow the workspace again");
  assert.equal(tables.decisions.at(-1).verb, "resume_agent");
  await refused(
    receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "never" }, `?workspace=${B}`), ctxFor(tables)),
    "forbidden",
    403,
    "a viewer there",
  );
  await refused(
    receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "loud" }, inA), ctxFor(tables)),
    "validation",
    400,
  );
});

test("a note for many: each person gets it as a note of their own, through the one note door -- a person whose notes were full was refused", async () => {
  assert.deepEqual(notesMany.PUT.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  const written = [];
  const rpcs = {
    person_note_add: (a) => {
      written.push(a);
      return a.p_contact_id === P3 ? { error: "not_found" } : { note: { id: `n-${a.p_contact_id}` } };
    },
  };
  const tables = {
    memberships: both("operator", "viewer"),
    contacts: [liveContact(P1, A), liveContact(P2, A), liveContact(P3, A)],
  };
  const out = await notesMany.PUT.run(
    send("PUT", { ids: [P1, P2, P3], append: "  class of 12 Sep  " }, inA),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(out, {
    done: 2,
    failed: [{ id: P3, message: "This person or this note is no longer here." }],
    skipped: [],
  });
  assert.deepEqual(
    written.map((w) => [w.p_contact_id, w.p_body, w.p_source]),
    [
      [P1, "class of 12 Sep", "bulk"],
      [P2, "class of 12 Sep", "bulk"],
      [P3, "class of 12 Sep", "bulk"],
    ],
    "trimmed, the same words for each, marked as People's bulk note",
  );
  await refused(
    notesMany.PUT.run(send("PUT", { ids: [P1], append: "   " }, inA), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
  );
});

test("a view is the workspace's: read from the member's own row, written through the door that judges the membership, a page name kept short", async () => {
  assert.deepEqual(views.GET.policy, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(
    viewSet.PUT.policy,
    { kind: "write", scope: "workspace", role: "viewer", rate: "view_set", spend: false },
    "any member: it is their own view",
  );
  const tables = {
    memberships: [
      {
        ...membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
        views: { people: { sortBy: "name", sortDir: "asc", attentionTab: "quiet" } },
      },
      membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
    ],
  };
  const mine = await views.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(mine, { views: { people: { sortBy: "name", sortDir: "asc", attentionTab: "quiet" } } });
  assert.deepEqual(
    await views.GET.run(get(`?workspace=${B}`), ctxFor(tables)),
    { views: {} },
    "per workspace: the other holds nothing yet",
  );
  const door = [];
  const rpcs = {
    member_view_set: (a) => {
      door.push(a);
      return { people: a.p_view, broadcasts: { tab: "history" } };
    },
  };
  const saved = await viewSet.PUT.run(
    send("PUT", { view: { sortBy: "last", sortDir: "desc" } }, `?workspace=${B}`),
    ctxFor(tables, { page: "people" }, rpcs),
  );
  assert.deepEqual(
    door,
    [{ p_tenant_id: B, p_page: "people", p_view: { sortBy: "last", sortDir: "desc" } }],
    "the workspace the tab named, never one from the body",
  );
  assert.deepEqual(
    saved,
    { views: { people: { sortBy: "last", sortDir: "desc" }, broadcasts: { tab: "history" } } },
    "the whole set comes back",
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: { a: 1 } }, inA), ctxFor(tables, { page: "People Page" }, rpcs)),
    "validation",
    400,
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: { big: "x".repeat(3000) } }, inA), ctxFor(tables, { page: "people" }, rpcs)),
    "validation",
    400,
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: "not an object" }, inA), ctxFor(tables, { page: "people" }, rpcs)),
    "validation",
    400,
  );
});

test("REGRESSION: a list past a thousand people is read to its last member -- its members were one select, which answers at most 1000 rows, so the rail, a profile and the composer lost everyone after the thousandth", async () => {
  const ids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }],
    segment_members: ids.map((contact_id) => ({ segment_id: S1, contact_id, tenant_id: A })),
  };
  // PostgREST's max_rows, as the server has it.
  const ctx = {
    supabase: fakeDb(tables, {}, {}, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const { lists: read } = await lists.GET.run(get(inA), ctx);
  assert.equal(read.length, 1);
  assert.equal(read[0].ids.length, 1500, "REGRESSION: 1000 of 1500");
  assert.deepEqual(new Set(read[0].ids), new Set(ids), "each of them once");
});
