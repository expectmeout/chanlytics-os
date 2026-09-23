/**
 * A deal is a record (docs/decisions/0004-deals-record.md), proved where the
 * rule lives: on the database.
 *
 * deal_record is the one door (00156). A member who may act -- an owner or an
 * operator -- starts a proposal and moves it; a viewer and a member of another
 * workspace are told the person does not exist; every move is an event that
 * carries no words; one engagement is open per person per service; a stale
 * version answers moved; an ended engagement is re-signed as a new row; the
 * people read carries the newest open or current deal; and an erased person's
 * deals keep no words.
 *
 * And a proposal is part of the deal (0008, 00160): the door takes its link,
 * its value and the day it stands, keeps what a move is not told and empties
 * what it is told to, refuses a bad link, reason or field in its own codes,
 * and sets a reason only on a pass; the people read carries the three; an
 * erasure takes the link; and how customers buy is the owner's column alone.
 *
 * Runs the way consent-paths.db.test.mjs does: its own workspaces, users and
 * rows, made with the service key and removed after, against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real: users sign in with a password through the anon key, so auth.uid() and
 * is_acting_member judge them as the dashboard's client would. A failed
 * sign-in fails the test.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, people and deals"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

/** The world: one workspace with an owner, an operator and a viewer in it; another workspace with an owner; one person. */
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `deals-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `deals-${Date.now()}`, name: "Deals" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `deals-other-${Date.now()}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  w.owner = await member("owner", w.tenant);
  w.operator = await member("operator", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
  w.contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, phone_e164: "+15125550171", display_name: "Fixture Deal Person" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip || !w.admin) return;
  if (w.tenant) {
    await w.admin.from("deals").delete().eq("tenant_id", w.tenant);
    await w.admin.from("events").delete().eq("tenant_id", w.tenant);
    await w.admin.from("contacts").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
  }
  if (w.other) await w.admin.from("tenants").delete().eq("id", w.other);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

/** One press on the door: what it answered, or the words of what it raised. */
const record = (client, args) =>
  client.rpc("deal_record", args).then((r) => (r.error ? { error: r.error.message } : r.data));

// One person serves all three tests. Each proposes its own services, so the
// one-open-per-service rule never crosses a test; the erasure is the last
// thing done to them, and node:test runs a file's tests in order.

test(
  "the door: a proposal starts a deal; a viewer and a stranger are refused; the kinds are written",
  { skip },
  async () => {
    const v = await record(w.viewer, { p_contact_id: w.contact, p_stage: "proposed" });
    assert.equal(v.error, "not_found", "a viewer reads only");
    const s = await record(w.stranger, { p_contact_id: w.contact, p_stage: "proposed" });
    assert.equal(s.error, "not_found", "another workspace's member sees no person");
    const r = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Ad management" });
    assert.ok(r.deal, JSON.stringify(r));
    assert.equal(r.deal.stage, "proposed");
    assert.equal(r.deal.version, 1);
    assert.equal(r.from, null);
    const ev = ok(
      await w.admin.from("events").select("kind, data").eq("subject_id", r.deal.id).eq("kind", "deal.proposed"),
    );
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data.stage, "proposed");
    assert.equal(ev[0].data.note, undefined, "an event carries no words");
  },
);

test(
  "one open engagement per person per service; a stale version answers moved; an ended one is not reopened",
  { skip },
  async () => {
    const a = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.ok(a.deal, JSON.stringify(a));
    const dup = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.equal(dup.error, "already_open");
    const other = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Ads" });
    assert.ok(other.deal, "a different service is its own engagement");
    const stale = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 99,
    });
    assert.equal(stale.error, "moved");
    assert.equal(stale.version, 1);
    const won = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 1,
      p_amount_cents: 250000,
      p_per: "month",
      p_note: "Signed at the desk",
    });
    assert.ok(won.deal, JSON.stringify(won));
    assert.equal(won.deal.stage, "won");
    assert.equal(won.deal.version, 2);
    assert.equal(won.from, "proposed");
    assert.ok(won.deal.decided_at);
    const same = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 2,
      p_note: "Renewed",
    });
    assert.ok(same.deal, JSON.stringify(same));
    assert.equal(same.deal.version, 3, "refreshing details bumps the version");
    const wonEvents = ok(await w.admin.from("events").select("id").eq("subject_id", a.deal.id).eq("kind", "deal.won"));
    assert.equal(wonEvents.length, 1, "a same-stage update is not a move");
    const ended = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "ended",
      p_deal_id: a.deal.id,
      p_version: 3,
    });
    assert.ok(ended.deal, JSON.stringify(ended));
    assert.equal(ended.deal.stage, "ended");
    const reopen = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: a.deal.id,
      p_version: 4,
    });
    assert.equal(reopen.error, "ended");
    const fresh = await record(w.owner, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.ok(fresh.deal, "an ended engagement is re-signed as a new row");
    assert.notEqual(fresh.deal.id, a.deal.id);
  },
);

test(
  "a proposal carries its link, its value and the day it stands; a move keeps what it is not told and empties what it is told to; a reason is a pass's alone",
  { skip },
  async () => {
    const url = "https://docs.example.com/p/fixture";
    const made = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_service: "Linked",
      p_amount_cents: 120000,
      p_per: "once",
      p_proposal_url: `  ${url} `,
      p_valid_until: "2026-10-31",
    });
    assert.ok(made.deal, JSON.stringify(made));
    assert.deepEqual(
      [made.deal.proposal_url, made.deal.valid_until, made.deal.amount_cents, made.deal.per, made.deal.lost_reason],
      [url, "2026-10-31", 120000, "once", null],
      "stored trimmed, with its value and its day",
    );
    const id = made.deal.id;
    // Told only the day: the link and the value stay. A same-stage edit is not a move, so no event.
    const edit = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 1,
      p_valid_until: "2026-11-15",
    });
    assert.deepEqual(
      [edit.deal.proposal_url, edit.deal.valid_until, edit.deal.amount_cents, edit.deal.version],
      [url, "2026-11-15", 120000, 2],
    );
    // Told to empty the link and the amount: both go, the per with its amount, and the day stays. Emptying wins over
    // a value named beside it.
    const cleared = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 2,
      p_proposal_url: "https://docs.example.com/p/other",
      p_clear: ["proposal_url", "amount"],
    });
    assert.deepEqual(
      [cleared.deal.proposal_url, cleared.deal.amount_cents, cleared.deal.per, cleared.deal.valid_until],
      [null, null, null, "2026-11-15"],
    );
    const note = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 3,
      p_note: "Sent by email",
    });
    const noNote = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 4,
      p_clear: ["valid_until", "note"],
    });
    assert.deepEqual([note.deal.note, noNote.deal.note, noNote.deal.valid_until], ["Sent by email", null, null]);
    // Passing sets the reason; a pass told nothing keeps it; any other stage clears it.
    const passed = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "lost",
      p_deal_id: id,
      p_version: 5,
      p_lost_reason: "price",
    });
    assert.equal(passed.deal.lost_reason, "price", JSON.stringify(passed));
    const passedAgain = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "lost",
      p_deal_id: id,
      p_version: 6,
      p_note: "They called to say so",
    });
    assert.equal(passedAgain.deal.lost_reason, "price", "a pass told nothing keeps its reason");
    const again = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 7,
    });
    assert.equal(again.deal.lost_reason, null, "proposing again clears it");
    const told = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: id,
      p_version: 8,
      p_lost_reason: "timing",
    });
    assert.equal(told.deal.lost_reason, null, "a reason is a pass's alone, whatever a call names");
    // Events carry exactly what they did: a stage, never a link, an amount, a note or a reason.
    const events = ok(await w.admin.from("events").select("kind, data").eq("subject_id", id).order("created_at"));
    assert.deepEqual(
      events.map((e) => e.kind),
      ["deal.proposed", "deal.lost", "deal.proposed"],
    );
    for (const e of events) {
      assert.deepEqual(Object.keys(e.data).sort(), ["by", "contact_id", "deal_id", "from", "service", "stage"]);
    }
  },
);

test(
  "the door refuses a link, a reason or a field to empty that is not one, in its own codes, and writes nothing",
  { skip },
  async () => {
    for (const [args, code] of [
      [{ p_proposal_url: "docs.example.com/p/x" }, "bad_link"],
      [{ p_proposal_url: "https://docs.example.com/p/a b" }, "bad_link"],
      [{ p_proposal_url: `https://docs.example.com/${"x".repeat(500)}` }, "bad_link"],
      [{ p_lost_reason: "banana" }, "bad_reason"],
      [{ p_clear: ["service"] }, "bad_clear"],
      [{ p_clear: [null] }, "bad_clear"],
    ]) {
      const r = await record(w.operator, {
        p_contact_id: w.contact,
        p_stage: "proposed",
        p_service: "Refused",
        ...args,
      });
      assert.equal(r.error, code, JSON.stringify(args));
    }
    const none = ok(await w.admin.from("deals").select("id").eq("contact_id", w.contact).eq("service", "Refused"));
    assert.equal(none.length, 0);
  },
);

test(
  "a passed proposal sent again stands until the day it is given, or none: the old day was the proposal they passed on",
  { skip },
  async () => {
    const made = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_service: "Again",
      p_valid_until: "2026-10-31",
    });
    assert.ok(made.deal, JSON.stringify(made));
    const id = made.deal.id;
    const move = (version, stage, extra = {}) =>
      record(w.operator, { p_contact_id: w.contact, p_stage: stage, p_deal_id: id, p_version: version, ...extra });
    const passed = await move(1, "lost");
    assert.equal(passed.deal.valid_until, "2026-10-31", "a pass keeps the day the proposal had");
    const again = await move(2, "proposed");
    assert.equal(again.deal.valid_until, null, "sent again with no day: none, not the passed proposal's");
    await move(3, "lost");
    const dated = await move(4, "proposed", { p_valid_until: "2026-12-15" });
    assert.equal(dated.deal.valid_until, "2026-12-15", "sent again with a day: that day");
    const kept = await move(5, "proposed", { p_note: "Called to check" });
    assert.equal(kept.deal.valid_until, "2026-12-15", "an edit of a proposal out keeps its day, as before");
  },
);

test(
  "how customers buy is the owner's column: an owner writes it, an operator's write lands on no row, and nothing but the two answers is kept",
  { skip },
  async () => {
    const set = (client, value) =>
      client.from("tenants").update({ sells_by: value }).eq("id", w.tenant).select("id, sells_by");
    const owner = await set(w.owner, "proposal");
    assert.equal(owner.error, null, owner.error?.message);
    assert.deepEqual(owner.data, [{ id: w.tenant, sells_by: "proposal" }]);
    const operator = await set(w.operator, "booking");
    assert.deepEqual(operator.data ?? [], [], "RLS: an operator's update matches no row, and raises nothing");
    const bad = await set(w.owner, "banana");
    assert.match(bad.error?.message ?? "", /tenants_sells_by_check/);
    const name = await w.owner.from("tenants").update({ name: "Renamed" }).eq("id", w.tenant).select("id");
    assert.match(name.error?.message ?? "", /permission denied/, "the grant is the column, never the row");
    const row = ok(await w.admin.from("tenants").select("sells_by, name").eq("id", w.tenant).single());
    assert.deepEqual(row, { sells_by: "proposal", name: "Deals" });
  },
);

test("the people read carries the newest open or current deal; an erasure blanks the words", { skip }, async () => {
  const lost = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Old" });
  assert.ok(lost.deal, JSON.stringify(lost));
  const passed = await record(w.operator, {
    p_contact_id: w.contact,
    p_stage: "lost",
    p_deal_id: lost.deal.id,
    p_version: 1,
  });
  assert.equal(passed.deal?.stage, "lost", JSON.stringify(passed));
  const open = await record(w.operator, {
    p_contact_id: w.contact,
    p_stage: "proposed",
    p_service: "New",
    p_note: "Sent by email",
    p_evidence: { form: "paper" },
    p_proposal_url: "https://docs.example.com/p/new",
    p_valid_until: "2026-12-01",
  });
  assert.ok(open.deal, JSON.stringify(open));
  const rows = ok(await w.operator.rpc("people_list", { p_tenant_id: w.tenant, p_contact_id: w.contact }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deal_id, open.deal.id, "the open one, not the newest lost one");
  assert.equal(rows[0].deal_stage, "proposed");
  assert.equal(rows[0].deal_service, "New");
  // Its link and its day ride with it (0008), and a passed deal says why.
  assert.deepEqual(
    [rows[0].deal_proposal_url, rows[0].deal_valid_until, rows[0].deal_lost_reason],
    ["https://docs.example.com/p/new", "2026-12-01", null],
  );
  const passer = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, phone_e164: "+15125550172", display_name: "Fixture Deal Passer" })
      .select("id")
      .single(),
  ).id;
  const theirs = await record(w.operator, { p_contact_id: passer, p_stage: "proposed" });
  await record(w.operator, {
    p_contact_id: passer,
    p_stage: "lost",
    p_deal_id: theirs.deal.id,
    p_version: 1,
    p_lost_reason: "elsewhere",
  });
  const passerRow = ok(await w.operator.rpc("people_list", { p_tenant_id: w.tenant, p_contact_id: passer }));
  assert.deepEqual([passerRow[0].deal_stage, passerRow[0].deal_lost_reason], ["lost", "elsewhere"]);
  // The erasure as the right-to-be-forgotten path completes it: erased_at is
  // written, and 00156's trigger on that column takes the words with it.
  ok(await w.admin.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", w.contact));
  const after_ = ok(
    await w.admin
      .from("deals")
      .select("note, evidence, stage, version, proposal_url, valid_until")
      .eq("id", open.deal.id)
      .single(),
  );
  assert.equal(after_.note, null);
  assert.equal(after_.evidence, null);
  assert.equal(after_.proposal_url, null, "an address can name a person: it goes with the words (0008)");
  assert.equal(after_.stage, "proposed", "the stage stays");
  assert.equal(after_.valid_until, "2026-12-01", "and the day, the business's own fact");
  assert.equal(after_.version, 2);
});
