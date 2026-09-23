/**
 * One receptionist, one memory.
 *
 * The WhatsApp bot and the voice agent are meant to be the same receptionist —
 * a customer who phoned yesterday and texts today should not have to start
 * again. They were not. The bot read the conversation from Postgres while the
 * voice agent read a six-turn slice out of the BLOB mirror, a store we are
 * actively retiring. Same person, two accounts of them, one of them stale.
 *
 * These pin the unification: one reader, one set of rules for what counts as a
 * turn, and one description of who the person is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "./_source.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleHistory, describeLead, readLeadContext } from "@chanlytics/db";
import { fakeDb } from "./_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

const row = (over = {}) => ({
  body: "hello",
  sender: "customer",
  direction: "inbound",
  status: "received",
  created_at: "2026-08-29T10:00:00.000Z",
  channel_ts: null,
  meta: null,
  ...over,
});

/* ------------------------ what counts as a turn --------------------------- */

test("an outbound message that never LEFT is not something we said", () => {
  // A canceled or failed send was never seen by the customer. Feeding it to the
  // model as history makes it apologise for, or build on, words nobody read.
  for (const status of ["queued", "canceled", "failed"]) {
    assert.equal(assembleHistory([row({ direction: "outbound", sender: "ai", status })], 10).length, 0, status);
  }
  assert.equal(assembleHistory([row({ direction: "outbound", sender: "ai", status: "sent" })], 10).length, 1);
});

test("a blank body carries nothing to reason over", () => {
  assert.equal(assembleHistory([row({ body: "" }), row({ body: "   " }), row({ body: null })], 10).length, 0);
});

test("calls and messages interleave by when they HAPPENED", () => {
  // A call yesterday must sit before a message this morning, whatever order the
  // rows were written in — the backfill wrote calls hours after they occurred.
  const turns = assembleHistory(
    [
      row({ body: "texted this morning", created_at: "2026-08-29T09:00:00.000Z" }),
      row({
        body: "called yesterday",
        type: "call_summary",
        sender: "system",
        created_at: "2026-08-29T14:00:00.000Z",
        channel_ts: "2026-08-28T17:00:00.000Z",
      }),
    ],
    10,
  );
  assert.deepEqual(
    turns.map((t) => t.content),
    ["called yesterday", "texted this morning"],
  );
});

test("a call the customer made is the customer's history, not ours", () => {
  // sender 'system' on a call note maps to assistant — it is the receptionist's
  // record of the call, and the model should read it as its own note.
  const t = assembleHistory([row({ body: "Inbound call · 2 min", sender: "system" })], 10);
  assert.equal(t[0].role, "assistant");
});

test("the backfilled copy of a call loses to the native row", () => {
  // Both in would show the model each call twice, in two formats, and it would
  // reasonably conclude they phoned twice as often as they did.
  const turns = assembleHistory(
    [
      row({
        body: "[voice call note 2026-08-26T20:59] Caller phoned",
        sender: "ai",
        direction: "outbound",
        status: "sent",
        meta: { backfill: true },
      }),
      row({ body: "Inbound call · 1 min", sender: "system" }),
    ],
    10,
  );
  assert.equal(turns.length, 1);
  assert.match(turns[0].content, /Inbound call/);
});

test("the limit keeps the MOST RECENT turns", () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row({ body: `m${i}`, created_at: `2026-08-29T10:${String(i).padStart(2, "0")}:00.000Z` }),
  );
  const turns = assembleHistory(rows, 5);
  assert.deepEqual(
    turns.map((t) => t.content),
    ["m15", "m16", "m17", "m18", "m19"],
  );
});

/* --------------------------- who the person is ---------------------------- */

const NOW = new Date("2026-08-29T12:00:00.000Z");

test("an unknown number is described as new, not as an anonymous blank", () => {
  // "New contact" is itself useful and honest for an agent to be told.
  assert.match(describeLead({ contactId: null, history: [] }, NOW), /New contact/);
});

test("a returning contact is named and dated", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Ana",
      returning: true,
      lastSeenAt: "2026-08-27T12:00:00.000Z",
      history: [{ role: "user", content: "hi" }],
      optedOut: false,
    },
    NOW,
  );
  assert.match(d, /Ana/);
  assert.match(d, /Returning/);
  assert.match(d, /2 days ago/);
});

test("a contact with no name is not given an invented one", () => {
  const d = describeLead(
    { contactId: "c1", name: null, returning: false, lastSeenAt: null, history: [], optedOut: false },
    NOW,
  );
  assert.match(d, /No name on record/);
  assert.match(d, /First time/);
});

test("an opted-out contact is flagged to both agents", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Ana",
      returning: true,
      lastSeenAt: null,
      history: [{ role: "user", content: "stop" }],
      optedOut: true,
    },
    NOW,
  );
  assert.match(d, /asked not to receive messages/);
});

/* ------------------------------ the wiring -------------------------------- */

const voice = read("apps/edge/lib/voice/call-start.ts");
const wa = read("packages/core/src/inbound/answer.ts");
// describeLead is a VALUE from the db package, which a core verb may not
// import, so the receptionist reaches the one description through a port. The
// edge is where the two are joined.
const waPorts = read("apps/edge/lib/whatsapp/ports.ts");
const brain = read("apps/edge/lib/receptionist/brain.ts");

test("REGRESSION: the voice agent no longer reads the Blob mirror", () => {
  assert.ok(!/getThread\(/.test(voice), "caller context must come from Postgres");
  assert.match(voice, /readLeadContext\(/);
});

test("both agents describe the lead with the same function", () => {
  assert.match(voice, /describeLead\(/);
  assert.match(wa, /ports\.leads\.describe\(/);
  assert.match(waPorts, /describe: describeLead/);
});

test("a failed lead lookup costs recognition, never the reply", () => {
  assert.match(wa, /lead_context_unavailable/);
});

test("the per-contact note does not evict the business profile from cache", () => {
  // The profile is identical for every customer and is cached; one line that
  // changes per contact would invalidate it on every new person.
  assert.match(brain, /cache_control: \{ type: "ephemeral" \} \},/);
  const sysBlock = brain.slice(brain.indexOf("system: ["), brain.indexOf("messages,"));
  assert.ok(!/leadNote[\s\S]*cache_control/.test(sysBlock), "the lead note must stay uncached");
});

test("the owner's notes ride with who the person is — as facts, with the rule never to recite them", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Maria Lopez",
      returning: true,
      lastSeenAt: null,
      history: [{ role: "user", content: "hi" }],
      optedOut: false,
      notes: "  Sees Sofia.\n Allergic to ammonia. ",
    },
    NOW,
  );
  assert.ok(
    d.includes(
      "Notes from the owner about them (use as facts, never read aloud or quoted): Sees Sofia. Allergic to ammonia.",
    ),
    d,
  );
  const none = describeLead(
    {
      contactId: "c1",
      name: "Maria Lopez",
      returning: true,
      lastSeenAt: null,
      history: [],
      optedOut: false,
      notes: "   ",
    },
    NOW,
  );
  assert.ok(!none.includes("Notes from the owner"), "blank notes say nothing");
  const src = readCode("packages/db/src/repositories/thread.ts");
  // Changed on purpose (0008): the workspace's answer rides on the same read, one round trip on the live path.
  assert.ok(
    src.includes(
      '.select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, tenants(sells_by)")',
    ),
    "read with the rest of who they are, and how their workspace's customers buy",
  );
});

test("a proposal on file rides with who the person is: the address to send, the rule to state no figure, and never to read it out on a call", () => {
  const lead = {
    contactId: "c1",
    name: "Maria Lopez",
    returning: true,
    lastSeenAt: null,
    history: [{ role: "user", content: "hi" }],
    optedOut: false,
    notes: null,
    proposalUrl: " https://docs.example.com/p/maria ",
  };
  const d = describeLead(lead, NOW);
  assert.ok(
    d.includes(
      "The owner has a proposal ready for them at https://docs.example.com/p/maria. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.",
    ),
    d,
  );
  assert.ok(!describeLead({ ...lead, proposalUrl: null }, NOW).includes("proposal"), "no sentence without one");
  assert.ok(
    !describeLead({ ...lead, proposalUrl: undefined }, NOW).includes("proposal"),
    "a reader without the column says nothing",
  );
});

test("the note says the deal's sentence after the owner's note, in the business's zone; the link's rule wins a price question; nothing without a deal", () => {
  const base = {
    contactId: "c1",
    conversationId: null,
    name: "Maria",
    returning: true,
    lastSeenAt: null,
    history: [],
    optedOut: false,
    notes: "Prefers mornings",
  };
  const NOW = new Date("2026-09-23T16:00:00Z");
  assert.doesNotMatch(describeLead(base, NOW), /client|proposal/i);
  const won = describeLead(
    {
      ...base,
      deal: {
        stage: "won",
        service: "Ad management",
        proposed_at: "2026-09-01T12:00:00Z",
        decided_at: "2026-09-20T12:00:00Z",
        ended_at: null,
      },
    },
    NOW,
    "America/New_York",
  );
  assert.match(won, /Prefers mornings.*They are a client \(Ad management\), since Sep 20\./s);
  assert.doesNotMatch(won, /2,500|\$/);
  const proposedWithLink = describeLead(
    {
      ...base,
      proposalUrl: "https://docs.example.com/p/1",
      deal: { stage: "proposed", service: null, proposed_at: "2026-09-12T12:00:00Z", decided_at: null, ended_at: null },
    },
    NOW,
    "America/New_York",
  );
  assert.match(proposedWithLink, /A proposal went out to them on Sep 12/);
  assert.match(proposedWithLink, /send them the proposal link/);
  assert.doesNotMatch(proposedWithLink, /will follow up/);
  assert.ok(
    proposedWithLink.indexOf("A proposal went out") < proposedWithLink.indexOf("The owner has a proposal ready"),
    "the deal's sentence comes before the link's, which answers the price question last",
  );
});

test("readLeadContext carries the CURRENT deal, which may be the oldest row, and never an amount", async () => {
  // A running engagement outlives any number of newer proposals for other services (already_open is per service):
  // a cap on the read would hide it behind them. The rows are read whole and the door's rule picks the current one.
  const T = "aaaaaaaa-0000-4000-8000-000000000001";
  const PHONE = "+13055550123";
  // The workspace says some customers get a proposal first (0008): the deal is said. The embed rides on the contact read.
  const c = {
    id: "contact-1",
    tenant_id: T,
    phone_e164: PHONE,
    display_name: "Maria",
    wa_profile_name: null,
    tenants: { sells_by: "proposal" },
  };
  const dealRow = (over) => ({
    tenant_id: T,
    contact_id: c.id,
    service: null,
    stage: "proposed",
    proposed_at: "2026-09-01T12:00:00Z",
    decided_at: null,
    ended_at: null,
    amount_cents: 250000,
    per: "month",
    ...over,
  });
  const wonRow = dealRow({
    id: "deal-won",
    stage: "won",
    service: "Ad management",
    decided_at: "2026-09-05T12:00:00Z",
    created_at: "2026-09-01T12:00:00Z",
  });
  const newerLostRow = dealRow({
    id: "deal-lost",
    stage: "lost",
    service: "Web design",
    proposed_at: "2026-09-10T12:00:00Z",
    decided_at: "2026-09-15T12:00:00Z",
    created_at: "2026-09-10T12:00:00Z",
  });
  const db = fakeDb({ contacts: [c], conversations: [], messages: [], deals: [wonRow, newerLostRow] });
  const ctx = await readLeadContext(db, T, PHONE);
  assert.equal(ctx.contactId, c.id);
  assert.equal(ctx.deal?.stage, "won", "the current one, not the newest");
  assert.equal(ctx.deal?.service, "Ad management");
  assert.ok(!("amount_cents" in ctx.deal), "never an amount at the read");
  assert.ok(!("per" in ctx.deal));
  const dealsRead = db.seen.filter((q) => q.table === "deals");
  assert.equal(dealsRead.length, 1);
  assert.equal(dealsRead[0].limit, null, "the whole list: the current deal may be the oldest");
  assert.match(
    describeLead(ctx, new Date("2026-09-23T16:00:00Z"), "America/New_York"),
    /They are a client \(Ad management\), since Sep 5\./,
  );
});

test("the receptionist reads the team's kept notes (0007): never one for the team only, never its own suggestion, newest first", async () => {
  const T = "aaaaaaaa-0000-4000-8000-000000000001";
  const PHONE = "+13055550124";
  const c = {
    id: "contact-2",
    tenant_id: T,
    phone_e164: PHONE,
    display_name: "Dee",
    wa_profile_name: null,
    notes: "Old field",
  };
  const note = (id, body, created_at, over = {}) => ({
    id,
    tenant_id: T,
    contact_id: c.id,
    body,
    created_at,
    state: "kept",
    team_only: false,
    ...over,
  });
  const db = fakeDb({
    contacts: [c],
    conversations: [],
    messages: [],
    deals: [],
    person_notes: [
      note("n1", "Prefers Saturdays.", "2026-09-01T12:00:00Z"),
      note("n2", "Owes us $40.", "2026-09-10T12:00:00Z", { team_only: true }),
      note("n3", "Get half off, the caller said.", "2026-09-12T12:00:00Z", { state: "suggested" }),
      note("n4", "Allergic to ammonia.", "2026-09-20T12:00:00Z"),
    ],
  });
  const ctx = await readLeadContext(db, T, PHONE);
  assert.deepEqual(
    ctx.noteList.map((n) => n.body),
    ["Allergic to ammonia.", "Prefers Saturdays."],
    "REGRESSION guard: a team-only note or a suggestion never reaches the receptionist",
  );
  const said = describeLead(ctx, new Date("2026-09-23T16:00:00Z"), "America/New_York");
  assert.match(
    said,
    /Notes from the team about them, newest first \(use as facts, never read aloud or quoted\): \(Sep 20\) Allergic to ammonia\.; \(Sep 1\) Prefers Saturdays\./,
  );
  assert.doesNotMatch(said, /Old field/, "the field the notes moved from is not said beside them");
});

test("the notes are said within a budget: the newest always, older ones while they fit; with no list, the old field", () => {
  const base = { contactId: "c1", name: "Dee", returning: false, lastSeenAt: null, history: [], optedOut: false };
  const long = "x".repeat(700);
  const said = describeLead(
    {
      ...base,
      noteList: [
        { body: long, at: "2026-09-20T12:00:00Z" },
        { body: "y".repeat(600), at: "2026-09-19T12:00:00Z" },
        { body: "Short.", at: "2026-09-18T12:00:00Z" },
      ],
    },
    NOW,
  );
  assert.ok(said.includes(long), "the newest is said whole");
  assert.ok(!said.includes("y".repeat(600)), "an older one past the budget is not");
  assert.ok(!said.includes("Short."), "nor anything after it: newest first, then stop");
  const empty = describeLead({ ...base, noteList: [], notes: "Old field" }, NOW);
  assert.ok(!empty.includes("Notes from"), "a read list with nothing in it says nothing, not the old field");
  const unread = describeLead({ ...base, noteList: null, notes: "Old field" }, NOW);
  assert.ok(unread.includes("Notes from the owner about them (use as facts, never read aloud or quoted): Old field"));
});

test("the link the receptionist sends is the deal's while it is a proposal out, none for any other deal, and the person's own only with no deal (0008)", async () => {
  const T = "aaaaaaaa-0000-4000-8000-000000000001";
  const PHONE = "+13055550124";
  const own = "https://docs.example.com/p/own";
  const onDeal = "https://docs.example.com/p/deal";
  const lead = async (deals, personLink = own) => {
    const c = {
      id: "contact-2",
      tenant_id: T,
      phone_e164: PHONE,
      display_name: "Ana",
      proposal_url: personLink,
      tenants: { sells_by: "proposal" },
    };
    const rows = deals.map((d, i) => ({
      id: `deal-${i}`,
      tenant_id: T,
      contact_id: c.id,
      service: null,
      proposed_at: "2026-09-10T12:00:00Z",
      decided_at: d.stage === "proposed" ? null : "2026-09-12T12:00:00Z",
      ended_at: null,
      created_at: `2026-09-1${i}T12:00:00Z`,
      proposal_url: null,
      ...d,
    }));
    const db = fakeDb({ contacts: [c], conversations: [], messages: [], deals: rows });
    return readLeadContext(db, T, PHONE);
  };
  assert.equal(
    (await lead([{ stage: "proposed", proposal_url: onDeal }])).proposalUrl,
    onDeal,
    "the deal's, over the person's",
  );
  assert.equal((await lead([{ stage: "proposed" }])).proposalUrl, null, "a proposal recorded without a link has none");
  assert.equal(
    (await lead([{ stage: "won", proposal_url: onDeal }])).proposalUrl,
    null,
    "a client is sent no proposal",
  );
  // Changed on purpose in review: a pass or an end is a deal, and the person's link no longer stands in for it.
  assert.equal((await lead([{ stage: "lost", proposal_url: onDeal }])).proposalUrl, null, "they passed: none");
  assert.equal((await lead([{ stage: "ended" }])).proposalUrl, null, "it ended: none");
  assert.equal((await lead([])).proposalUrl, own, "no deal at all: the person's own, read until it retires");
  assert.equal((await lead([], null)).proposalUrl, null);
  // And the sentences follow the link that counts: a client hears no proposal link.
  const client = await lead([{ stage: "won", service: "Ad management", proposal_url: onDeal }]);
  assert.doesNotMatch(describeLead(client, new Date("2026-09-23T16:00:00Z")), /docs\.example\.com/);
  const waiting = await lead([{ stage: "proposed", proposal_url: onDeal }]);
  assert.match(describeLead(waiting, new Date("2026-09-23T16:00:00Z")), /send them the proposal link/);
  assert.match(
    describeLead(waiting, new Date("2026-09-23T16:00:00Z")),
    /proposal ready for them at https:\/\/docs\.example\.com\/p\/deal\./,
  );
});

test("where deals are off the receptionist hears no deal and no proposal link, and the deals are not read (0008)", async () => {
  const T = "aaaaaaaa-0000-4000-8000-000000000001";
  const PHONE = "+13055550125";
  const link = "https://docs.example.com/p/own";
  const deal = {
    id: "deal-9",
    tenant_id: T,
    contact_id: "contact-3",
    service: "Ad management",
    stage: "proposed",
    proposed_at: "2026-09-10T12:00:00Z",
    decided_at: null,
    ended_at: null,
    created_at: "2026-09-10T12:00:00Z",
    proposal_url: link,
  };
  const read = async (tenants) => {
    const c = { id: "contact-3", tenant_id: T, phone_e164: PHONE, display_name: "Ana", proposal_url: link, tenants };
    const db = fakeDb({ contacts: [c], conversations: [], messages: [], deals: [deal] });
    return { ctx: await readLeadContext(db, T, PHONE), db };
  };
  for (const tenants of [{ sells_by: "booking" }, { sells_by: null }, undefined]) {
    const { ctx, db } = await read(tenants);
    assert.equal(ctx.contactId, "contact-3", "who they are is read as ever");
    assert.equal(ctx.name, "Ana");
    assert.equal(ctx.deal, null, `${JSON.stringify(tenants)}: no deal`);
    assert.equal(ctx.proposalUrl, null, `${JSON.stringify(tenants)}: no link`);
    assert.equal(db.seen.filter((q) => q.table === "deals").length, 0, "the deals are not read at all");
    assert.equal(db.seen.filter((q) => q.table === "contacts").length, 1, "one read of who they are");
    assert.doesNotMatch(describeLead(ctx, new Date("2026-09-23T16:00:00Z")), /proposal/i);
  }
  const on = await read({ sells_by: "proposal" });
  assert.equal(on.ctx.deal?.stage, "proposed");
  assert.equal(on.ctx.proposalUrl, link);
});

test("a database 00160 has not reached: who they are is read again without the workspace's answer, and deals are off", async () => {
  const T = "aaaaaaaa-0000-4000-8000-000000000001";
  const PHONE = "+13055550126";
  const c = { id: "contact-4", tenant_id: T, phone_e164: PHONE, display_name: "Lu", proposal_url: null };
  const db = fakeDb({ contacts: [c], conversations: [], messages: [], deals: [] });
  const from = db.from;
  // PostgREST's answer for an embedded column the database does not have.
  db.from = (table) => {
    const q = from(table);
    if (table !== "contacts") return q;
    return new Proxy(q, {
      get(target, key) {
        if (key !== "select") return target[key];
        return (cols, o) =>
          /\bsells_by\b/.test(String(cols))
            ? {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: { message: "column tenants_1.sells_by does not exist", code: "42703" },
                    }),
                  }),
                }),
              }
            : target.select(cols, o);
      },
    });
  };
  const ctx = await readLeadContext(db, T, PHONE);
  assert.equal(ctx.contactId, "contact-4", "REGRESSION guard: the reply never loses who they are to the new column");
  assert.equal(ctx.name, "Lu");
  assert.equal(ctx.deal, null);
  assert.equal(ctx.proposalUrl, null);
});
