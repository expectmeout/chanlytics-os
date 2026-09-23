/**
 * A person may have a proposal -- on a real database.
 *
 * 00154 is a column, a CHECK, a trigger on erasure and a definer door. A
 * constraint, a trigger and a function body are what reading source cannot
 * prove, so these run against Postgres in the database workflow; skipped
 * without a local database. Since 00157 the door writes through to the deal
 * (0007), which holds the proposal now.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let tenantId;
const person = async (row) => {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, ...row })
    .select("id")
    .single();
  return { id: data?.id ?? null, error };
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `person-proposal-${Date.now()}`, name: "Person proposal" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "the column holds the stored shape only: a trimmed web address, no whitespace, at most 500 characters",
  { skip },
  async () => {
    const ok = await person({ phone_e164: "+15550100201", proposal_url: "https://docs.example.com/p/42" });
    assert.equal(ok.error, null, ok.error?.message);
    for (const bad of [
      " https://docs.example.com/p/42",
      "docs.example.com/p/42",
      "mailto:ana@example.com",
      "https://docs.example.com/p 42",
      `https://docs.example.com/${"x".repeat(500)}`,
      "https://",
    ]) {
      const r = await person({ phone_e164: "+15550100202", proposal_url: bad });
      assert.match(r.error?.message ?? "", /contacts_proposal_url_check/, `refused: ${JSON.stringify(bad)}`);
    }
  },
);

test("an erased row holds no proposal: whatever sets erased_at, the trigger clears it", { skip }, async () => {
  const { id } = await person({ phone_e164: "+15550100211", proposal_url: "https://docs.example.com/p/gone" });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { data } = await db.from("contacts").select("proposal_url, erased_at").eq("id", id).single();
  assert.equal(data.proposal_url, null);
  assert.ok(data.erased_at);
});

test(
  "set_person_proposal: an acting member where the person lives, trimmed, a non-address refused in the owner's words, an empty one clears, the event names no address",
  { skip },
  async () => {
    const email = `person-proposal-${Date.now()}@example.test`;
    const { data: made, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    assert.equal(uErr, null, uErr?.message);
    const userId = made.user.id;
    try {
      const { error: mErr } = await db
        .from("memberships")
        .insert({ tenant_id: tenantId, user_id: userId, role: "operator" });
      assert.equal(mErr, null, mErr?.message);
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(sErr, null, sErr?.message);

      const { id } = await person({ display_name: "Dee", phone_e164: "+15550100221" });

      const { data: set, error } = await as.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: "  https://docs.example.com/p/dee ",
      });
      assert.equal(error, null, error?.message);
      assert.deepEqual(set, { contact_id: id, proposal_url: "https://docs.example.com/p/dee" }, "stored trimmed");

      const { error: shapeless } = await as.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: "docs.example.com/p/dee",
      });
      assert.match(shapeless?.message ?? "", /not a web address/);

      const { data: cleared } = await as.rpc("set_person_proposal", { p_contact_id: id, p_url: "" });
      assert.deepEqual(cleared, { contact_id: id, proposal_url: null });

      const { data: events } = await db
        .from("events")
        .select("kind, data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", id)
        .eq("kind", "contact.proposal_set")
        .order("created_at");
      assert.deepEqual(
        events.map((e) => e.data.set),
        [true, false],
        "set, then cleared",
      );
      assert.ok(
        events.every((e) => !JSON.stringify(e.data).includes("example.com")),
        "an event outlives an erasure, so it names no address",
      );

      const { data: other } = await db
        .from("tenants")
        .insert({ slug: `person-proposal-far-${Date.now()}`, name: "Far" })
        .select("id")
        .single();
      try {
        const { data: far } = await db
          .from("contacts")
          .insert({ tenant_id: other.id, phone_e164: "+15550100231" })
          .select("id")
          .single();
        const { error: stranger } = await as.rpc("set_person_proposal", {
          p_contact_id: far.id,
          p_url: "https://docs.example.com/p/x",
        });
        assert.match(
          stranger?.message ?? "",
          /Person not found/,
          "a person in a workspace the caller does not act in does not exist",
        );
      } finally {
        await db.from("tenants").delete().eq("id", other.id);
      }
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  },
);

test(
  "the door writes through to the deal (0007): an open proposal takes the link and loses it when it is cleared, a person with no open deal gets a Proposal out, and a client's deal is left alone",
  { skip },
  async () => {
    const email = `person-proposal-deal-${Date.now()}@example.test`;
    const { data: made, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    assert.equal(uErr, null, uErr?.message);
    const userId = made.user.id;
    try {
      const { error: mErr } = await db
        .from("memberships")
        .insert({ tenant_id: tenantId, user_id: userId, role: "operator" });
      assert.equal(mErr, null, mErr?.message);
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(sErr, null, sErr?.message);
      // Deals are on here: the workspace says some customers get a proposal first (0007).
      const { error: onErr } = await db.from("tenants").update({ sells_by: "proposal" }).eq("id", tenantId);
      assert.equal(onErr, null, onErr?.message);

      const { id: open } = await person({ display_name: "Open", phone_e164: "+15550100241" });
      const { id: none } = await person({ display_name: "None", phone_e164: "+15550100242" });
      const { id: client } = await person({ display_name: "Client", phone_e164: "+15550100243" });
      const deal = async (contact, stage) => {
        const { data, error } = await db
          .from("deals")
          .insert({
            tenant_id: tenantId,
            contact_id: contact,
            stage,
            service: "Ads",
            decided_at: stage === "won" ? new Date().toISOString() : null,
          })
          .select("id")
          .single();
        assert.equal(error, null, error?.message);
        return data.id;
      };
      const proposal = await deal(open, "proposed");
      const engagement = await deal(client, "won");
      const dealsOf = async (contact) => {
        const { data } = await db
          .from("deals")
          .select("id, stage, service, proposal_url, version, source, created_by")
          .eq("contact_id", contact)
          .order("created_at");
        return data;
      };
      const set = (contact, url) => as.rpc("set_person_proposal", { p_contact_id: contact, p_url: url });

      // An open proposal takes the link, and its version moves so a page holding the old one reloads.
      assert.equal((await set(open, "https://docs.example.com/p/open")).error, null);
      assert.deepEqual(
        (await dealsOf(open)).map((d) => [d.id, d.proposal_url, d.version]),
        [[proposal, "https://docs.example.com/p/open", 2]],
      );
      // The same link again changes nothing on the deal.
      await set(open, "https://docs.example.com/p/open");
      assert.equal((await dealsOf(open))[0].version, 2);
      // Cleared on the person, cleared on the deal: the two never disagree.
      await set(open, "");
      assert.deepEqual(
        (await dealsOf(open)).map((d) => [d.stage, d.proposal_url, d.version]),
        [["proposed", null, 3]],
      );

      // No open deal: the link opens a Proposal out, written by the person who set it, with deal_record's event.
      await set(none, "https://docs.example.com/p/none");
      const opened = await dealsOf(none);
      assert.deepEqual(
        opened.map((d) => [d.stage, d.service, d.proposal_url, d.source, d.created_by]),
        [["proposed", null, "https://docs.example.com/p/none", "person", userId]],
      );
      const { data: events } = await db
        .from("events")
        .select("kind, data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", opened[0].id);
      assert.deepEqual(
        events.map((e) => [e.kind, e.data.stage, e.data.from, e.data.by, e.data.contact_id]),
        [["deal.proposed", "proposed", null, userId, none]],
      );
      assert.ok(!JSON.stringify(events).includes("example.com"), "the event names no address");
      // A second link finds the deal the first one opened: one Proposal out, holding the newest link.
      await set(none, "https://docs.example.com/p/none-2");
      assert.deepEqual(
        (await dealsOf(none)).map((d) => d.proposal_url),
        ["https://docs.example.com/p/none-2"],
      );

      // A client's deal is left alone, and no proposal is opened beside it.
      await set(client, "https://docs.example.com/p/client");
      assert.deepEqual(
        (await dealsOf(client)).map((d) => [d.id, d.stage, d.proposal_url, d.version]),
        [[engagement, "won", null, 1]],
      );
      const { data: onPerson } = await db.from("contacts").select("proposal_url").eq("id", client).single();
      assert.equal(onPerson.proposal_url, "https://docs.example.com/p/client", "the person's column is still written");
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  },
);

test(
  "where deals are off the door opens no deal, but an open proposal still takes the link; a person merged into another is not found (0007)",
  { skip },
  async () => {
    const email = `person-proposal-off-${Date.now()}@example.test`;
    const { data: made, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    assert.equal(uErr, null, uErr?.message);
    const userId = made.user.id;
    const { data: far } = await db
      .from("tenants")
      .insert({ slug: `person-proposal-off-${Date.now()}`, name: "Off" })
      .select("id")
      .single();
    try {
      const { error: mErr } = await db
        .from("memberships")
        .insert({ tenant_id: far.id, user_id: userId, role: "owner" });
      assert.equal(mErr, null, mErr?.message);
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(sErr, null, sErr?.message);
      const add = async (row) =>
        (
          await db
            .from("contacts")
            .insert({ tenant_id: far.id, ...row })
            .select("id")
            .single()
        ).data.id;
      const set = (contact, url) => as.rpc("set_person_proposal", { p_contact_id: contact, p_url: url });
      const dealsOf = async (contact) =>
        (await db.from("deals").select("stage, proposal_url").eq("contact_id", contact).order("created_at")).data;

      // Never asked, then booking: a link is kept on the person and opens nothing.
      const nobody = await add({ display_name: "Nobody", phone_e164: "+15550100251" });
      for (const answer of [null, "booking"]) {
        const { error: aErr } = await db.from("tenants").update({ sells_by: answer }).eq("id", far.id);
        assert.equal(aErr, null, aErr?.message);
        const { error } = await set(nobody, `https://docs.example.com/p/${answer ?? "unasked"}`);
        assert.equal(error, null, error?.message);
        assert.deepEqual(await dealsOf(nobody), [], `${answer ?? "not asked"}: no deal from the door`);
      }
      // A proposal already out takes the link whatever the answer: the two never disagree on one it holds.
      const waiting = await add({ display_name: "Waiting", phone_e164: "+15550100252" });
      const { error: dErr } = await db
        .from("deals")
        .insert({ tenant_id: far.id, contact_id: waiting, stage: "proposed", service: "Ads" });
      assert.equal(dErr, null, dErr?.message);
      await set(waiting, "https://docs.example.com/p/waiting");
      assert.deepEqual(await dealsOf(waiting), [
        { stage: "proposed", proposal_url: "https://docs.example.com/p/waiting" },
      ]);

      // A person merged into another is found by neither door.
      const merged = await add({ display_name: "Merged", phone_e164: "+15550100253", merged_into_contact_id: nobody });
      const { error: mergedErr } = await set(merged, "https://docs.example.com/p/merged");
      assert.match(mergedErr?.message ?? "", /Person not found/);
      const { data: kept } = await db.from("contacts").select("proposal_url").eq("id", merged).single();
      assert.equal(kept.proposal_url, null, "and nothing was written on them");
    } finally {
      await db.from("tenants").delete().eq("id", far.id);
      await db.auth.admin.deleteUser(userId);
    }
  },
);
