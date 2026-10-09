/**
 * Two records of one person become one -- on a real database (00326; decision 0028).
 *
 * merge_people is the one door, and what it does is exactly what reading source cannot prove: which rows move, what
 * the two threads become, what the merged person has answered, who may, and that a message still cannot change thread
 * in any other case. So these run against Postgres: the whole merge of a phone record and an email record; the
 * consent rule held equal to contracts' mergedAnswers case by case; every refusal in contracts' own sentences; the
 * guard's one exception and nothing wider. Skipped without a local database and SUPABASE_ANON_KEY (the door asks who
 * is calling); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  MERGE_CONSENT_SOURCE,
  MERGE_REFUSALS,
  mergedAnswers,
} from "../../../../../packages/contracts/src/people/person-merge.ts";
import { STOP_ENDED_OFFERS_SOURCE } from "../../../../../packages/contracts/src/people/person-consent.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the door asks who is calling, and a session needs it"
        : false;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A; // the workspace
let B; // another workspace
let owner;
let operator;
let stranger;
const users = [];
let serial = 0;
/** A made-up number (555-01xx) and a made-up address, fresh in this run. */
const phone = () => `+1512555${String(1000 + ++serial).slice(-4)}`;
const address = () => `merge-${++serial}-${RUN}@example.com`;

async function session(label, tenantId, role) {
  const email = `merge-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenantId) ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `merge-${tag}-${RUN}`, name: `Merge ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  owner = await session("owner", A, "owner");
  operator = await session("operator", A, "operator");
  stranger = await session("stranger", null, null);
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A customer's message through the inbound door (the edge's): the person, their thread and the message. */
async function inbound(over) {
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: A,
      p_channel: "whatsapp",
      p_wa_profile_name: null,
      p_message_external_id: `merge-${RUN}-${++serial}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: new Date().toISOString(),
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: false,
      ...over,
    }),
  );
}

/** A person known by their phone, with a thread and a message in it. */
async function byPhone(body = "hello by phone") {
  const p = phone();
  const r = await inbound({ p_identity_external_id: p, p_phone_e164: p, p_body: body });
  return { id: r.contact_id, conversation: r.conversation_id, message: r.message_id, phone: p };
}

/** A person known by their address alone, as an email from an unknown sender leaves them: a thread and a message. */
async function byEmail(body = "hello by email") {
  const a = address();
  const r = await inbound({ p_channel: "email", p_identity_external_id: a, p_phone_e164: null, p_body: body });
  ok(await db.from("contacts").update({ email: a }).eq("id", r.contact_id));
  return { id: r.contact_id, conversation: r.conversation_id, message: r.message_id, email: a };
}

/** A bare record, no thread: for what the door does to the answers. */
const bare = async (fields) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, ...fields })
      .select("id")
      .single(),
  ).id;

const merge = (who, keep, other) => who.client.rpc("merge_people", { p_keep: keep, p_merge: other });
const row = async (id) => ok(await db.from("contacts").select("*").eq("id", id).single());
const ledger = async (id) =>
  ok(
    await db
      .from("events")
      .select("kind, data")
      .eq("tenant_id", A)
      .eq("subject_type", "contact")
      .eq("subject_id", id)
      .order("created_at"),
  );

test(
  "a phone record and an email record become one: one person, one thread, every message, and the next email lands in it",
  { skip },
  async () => {
    const k = await byPhone();
    const m = await byEmail();
    const answered = ok(await merge(owner, k.id, m.id));
    assert.deepEqual(
      [
        answered.contact_id,
        answered.merged,
        answered.counts.threads,
        answered.counts.messages,
        answered.counts.identities,
      ],
      [k.id, m.id, "folded", 1, 1],
    );

    const kept = await row(k.id);
    const gone = await row(m.id);
    assert.deepEqual([kept.phone_e164, kept.email, kept.merged_into_contact_id], [k.phone, m.email, null]);
    assert.deepEqual(
      [gone.merged_into_contact_id, gone.phone_e164, gone.email, gone.erased_at],
      [k.id, null, null, null],
      "the merged record is marked, holds no number and no address, and is not deleted",
    );

    const identities = ok(
      await db
        .from("contact_identities")
        .select("contact_id, channel")
        .eq("tenant_id", A)
        .in("contact_id", [k.id, m.id]),
    );
    assert.deepEqual(identities.map((i) => [i.contact_id === k.id, i.channel]).sort(), [
      [true, "email"],
      [true, "whatsapp"],
    ]);

    const threads = ok(
      await db.from("conversations").select("id, contact_id").eq("tenant_id", A).in("contact_id", [k.id, m.id]),
    );
    assert.deepEqual(threads, [{ id: k.conversation, contact_id: k.id }], "one thread, the kept person's");
    assert.equal(
      ok(await db.from("conversations").select("id").eq("id", m.conversation)).length,
      0,
      "the emptied thread is gone",
    );
    const messages = ok(
      await db.from("messages").select("id, conversation_id, contact_id, body").in("id", [k.message, m.message]),
    );
    assert.deepEqual(
      messages.map((x) => [x.conversation_id, x.contact_id, x.body]).sort(),
      [
        [k.conversation, k.id, "hello by email"],
        [k.conversation, k.id, "hello by phone"],
      ],
      "both messages, in the kept thread, as the kept person's, their words untouched",
    );

    // The record says what happened, on the kept person: the event with the counts, and the owner's decision.
    const merged = (await ledger(k.id)).filter((e) => e.kind === "contact.merged");
    assert.equal(merged.length, 1);
    assert.equal(merged[0].data.merged, m.id);
    const decided = ok(
      await db
        .from("decisions")
        .select("verb, actor_type, actor_user_id, payload")
        .eq("tenant_id", A)
        .eq("subject_id", k.id)
        .eq("verb", "merge"),
    );
    assert.deepEqual(
      decided.map((d) => [d.verb, d.actor_type, d.actor_user_id, d.payload.merged]),
      [["merge", "user", owner.id, m.id]],
    );

    // Their next email is found by the identity that moved, and lands in the one thread.
    const next = await inbound({
      p_channel: "email",
      p_identity_external_id: m.email,
      p_phone_e164: null,
      p_body: "me again",
    });
    assert.deepEqual([next.contact_id, next.conversation_id], [k.id, k.conversation]);

    // Merged once: neither record can be merged again in either direction.
    for (const [a, b] of [
      [k.id, m.id],
      [m.id, k.id],
    ]) {
      const again = await merge(owner, a, b);
      assert.equal(again.error?.message, MERGE_REFUSALS.merged);
    }
  },
);

test("where only the merged record had a thread, the kept person takes it whole", { skip }, async () => {
  const k = await bare({ phone_e164: phone(), display_name: "By the desk" });
  const m = await byEmail();
  const answered = ok(await merge(owner, k, m.id));
  assert.equal(answered.counts.threads, "taken");
  const thread = ok(await db.from("conversations").select("id, contact_id").eq("id", m.conversation).single());
  assert.equal(thread.contact_id, k, "the same thread, the kept person's now");
  const msg = ok(await db.from("messages").select("conversation_id, contact_id").eq("id", m.message).single());
  assert.deepEqual([msg.conversation_id, msg.contact_id], [m.conversation, k]);
});

test(
  "the merged record's visits are the kept person's, whatever source made them, and the counts say how many (00364)",
  { skip },
  async () => {
    const k = await bare({ phone_e164: phone(), display_name: "Kept" });
    const m = await bare({ email: address(), display_name: "Merged" });
    const visit = (contact, source, day, extra = {}) => ({
      tenant_id: A,
      contact_id: contact,
      source,
      external_id: `${source}:${RUN}:${++serial}`,
      starts_at: `${day}T15:00:00.000Z`,
      ends_at: `${day}T16:00:00.000Z`,
      timezone: "America/New_York",
      status: "booked",
      ...extra,
    });
    const made = ok(
      await db
        .from("appointments")
        .insert([
          visit(m, "booking_email", "2026-10-20"),
          visit(m, "calendar_feed", "2026-09-01", { status: "kept" }),
          visit(k, "person", "2026-10-21"),
        ])
        .select("id"),
    );
    const answered = ok(await merge(owner, k, m));
    assert.equal(answered.counts.appointments, 2, "the merged record's two");
    const visits = ok(
      await db
        .from("appointments")
        .select("contact_id, status")
        .in(
          "id",
          made.map((r) => r.id),
        ),
    );
    assert.deepEqual(
      visits.map((v) => [v.contact_id, v.status]).sort(),
      [
        [k, "booked"],
        [k, "booked"],
        [k, "kept"],
      ],
      "every visit is the kept person's, and none changed but its person",
    );
  },
);

test(
  "the kept thread is as open as the more open of the two, and where both waited on a person the kept one's question stands",
  { skip },
  async () => {
    const k = await byPhone();
    const m = await byEmail();
    ok(await db.from("conversations").update({ state: "archived" }).eq("id", k.conversation));
    ok(await db.from("conversations").update({ state: "needs_human" }).eq("id", m.conversation));
    const mine = ok(
      await db
        .from("escalations")
        .insert({ tenant_id: A, conversation_id: k.conversation, reason: "policy_block" })
        .select("id")
        .single(),
    ).id;
    const theirs = ok(
      await db
        .from("escalations")
        .insert({ tenant_id: A, conversation_id: m.conversation, reason: "policy_block" })
        .select("id")
        .single(),
    ).id;
    ok(await merge(owner, k.id, m.id));
    const thread = ok(await db.from("conversations").select("state").eq("id", k.conversation).single());
    assert.equal(thread.state, "needs_human");
    const asks = ok(
      await db.from("escalations").select("id, conversation_id, state, resolved_by_user_id").in("id", [mine, theirs]),
    );
    const of = (id) => asks.find((e) => e.id === id);
    assert.deepEqual([of(mine).conversation_id, of(mine).state], [k.conversation, "open"]);
    assert.deepEqual(
      [of(theirs).conversation_id, of(theirs).state, of(theirs).resolved_by_user_id],
      [k.conversation, "resolved", owner.id],
      "one open question per thread: the merged thread's is resolved by the owner who merged them, and kept as history",
    );
  },
);

test(
  "what a person has moves with them: a deal, a note, a list, their own receptionist mode, and the ledger",
  { skip },
  async () => {
    const k = await byPhone();
    const m = await byEmail();
    const deal = ok(
      await db
        .from("deals")
        .insert({ tenant_id: A, contact_id: m.id, stage: "proposed", service: "Website" })
        .select("id")
        .single(),
    ).id;
    const note = ok(
      await db
        .from("person_notes")
        .insert({ tenant_id: A, contact_id: m.id, body: "Prefers mornings" })
        .select("id")
        .single(),
    ).id;
    const list = ok(
      await db
        .from("segments")
        .insert({ tenant_id: A, name: `Merge list ${RUN}` })
        .select("id")
        .single(),
    ).id;
    ok(await db.from("segment_members").insert({ tenant_id: A, segment_id: list, contact_id: m.id }));
    ok(
      await db
        .from("policies")
        .insert({ tenant_id: A, class: "reply", mode: "never", subject_type: "contact", subject_id: m.id }),
    );
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: A,
        p_contact_id: m.id,
        p_consent: "opted_out",
        p_source: "customer_message",
        p_evidence: { channel: "email", words: "no offers please" },
      }),
    );
    ok(await merge(owner, k.id, m.id));
    assert.equal(ok(await db.from("deals").select("contact_id").eq("id", deal).single()).contact_id, k.id);
    assert.equal(ok(await db.from("person_notes").select("contact_id").eq("id", note).single()).contact_id, k.id);
    assert.deepEqual(
      ok(await db.from("segment_members").select("contact_id").eq("segment_id", list)).map((r) => r.contact_id),
      [k.id],
    );
    assert.deepEqual(
      ok(
        await db
          .from("policies")
          .select("subject_id, mode")
          .eq("tenant_id", A)
          .eq("subject_type", "contact")
          .in("subject_id", [k.id, m.id]),
      ),
      [{ subject_id: k.id, mode: "never" }],
    );
    // The merged record's own no to offers is in the kept person's ledger, as they said it, beside the merge's entry.
    const said = (await ledger(k.id)).filter(
      (e) => e.kind === "contact.consent_changed" && e.data.purpose === "marketing",
    );
    assert.deepEqual(
      said.map((e) => [e.data.consent, e.data.source]),
      [
        ["opted_out", "customer_message"],
        ["opted_out", MERGE_CONSENT_SOURCE],
      ],
    );
    assert.equal((await ledger(m.id)).length, 0, "nothing is left filed under the merged record");
  },
);

test(
  "the merged person's answers are the more careful of the two, case by case as contracts says them (D5)",
  { skip },
  async () => {
    const ANSWERS = ["unknown", "opted_in", "opted_out"];
    // Every pair of (messages, offers) on each side, with offers by email turned through its answers alongside.
    const sides = [];
    for (const consent of ANSWERS) for (const marketing of ANSWERS) sides.push({ consent, marketing });
    let n = 0;
    for (const a of sides)
      for (const b of sides) {
        n += 1;
        const ae = ANSWERS[n % 3];
        const be = ANSWERS[(n + 1 + Math.floor(n / 3)) % 3];
        const fields = (s, emailMarketing) => ({
          consent: s.consent,
          dnc: s.consent === "opted_out",
          marketing_consent: s.marketing,
          marketing_channels: s.marketing === "opted_in" ? ["whatsapp"] : null,
          email_marketing: emailMarketing,
        });
        const k = await bare({ phone_e164: phone(), ...fields(a, ae) });
        const m = await bare({ email: address(), ...fields(b, be) });
        const answered = ok(await merge(owner, k, m));
        const want = mergedAnswers(
          { consent: a.consent, dnc: a.consent === "opted_out", marketing: a.marketing, emailMarketing: ae },
          { consent: b.consent, dnc: b.consent === "opted_out", marketing: b.marketing, emailMarketing: be },
        );
        const kept = await row(k);
        const what = `${JSON.stringify({ ...a, email: ae })} + ${JSON.stringify({ ...b, email: be })}`;
        assert.deepEqual(
          {
            consent: kept.consent,
            dnc: kept.dnc,
            marketing: kept.marketing_consent,
            emailMarketing: kept.email_marketing,
          },
          want,
          what,
        );
        assert.deepEqual(
          [answered.consent, answered.marketing_consent, answered.email_marketing],
          [want.consent, want.marketing, want.emailMarketing],
          `the door answers what it wrote: ${what}`,
        );
        // A yes covers its channels and nothing else does; a yes a stop ended says so.
        assert.deepEqual(kept.marketing_channels, want.marketing === "opted_in" ? ["whatsapp"] : [], what);
        if (want.marketing === "unknown" && (a.marketing === "opted_in" || b.marketing === "opted_in"))
          assert.equal(kept.marketing_consent_source, STOP_ENDED_OFFERS_SOURCE, what);
        // The ledger has one entry, from the merge, for each answer that changed on the kept record, and none besides.
        const changed = (await ledger(k))
          .filter((e) => e.kind === "contact.consent_changed" && e.data.source === MERGE_CONSENT_SOURCE)
          .map((e) => `${e.data.purpose ?? "conversational"}:${e.data.previous}>${e.data.consent}`)
          .sort();
        const expected = [
          want.consent !== a.consent ? `conversational:${a.consent}>${want.consent}` : null,
          want.marketing !== a.marketing ? `marketing:${a.marketing}>${want.marketing}` : null,
          want.emailMarketing !== ae ? `email_marketing:${ae}>${want.emailMarketing}` : null,
        ]
          .filter(Boolean)
          .sort();
        assert.deepEqual(changed, expected, what);
      }
    assert.equal(n, 81);
  },
);

test(
  "do-not-contact alone is a stop, a suppressed address stays suppressed, and the earliest ask is kept",
  { skip },
  async () => {
    const asked = "2026-09-01T10:00:00+00:00";
    const k = await bare({
      phone_e164: phone(),
      consent: "opted_in",
      marketing_consent: "opted_in",
      offers_asked_at: "2026-09-20T10:00:00+00:00",
    });
    const a = address();
    const m = await bare({
      email: a,
      dnc: true,
      offers_asked_at: asked,
      email_suppressed_at: "2026-09-10T10:00:00+00:00",
      email_suppressed_reason: "hard_bounce",
    });
    ok(await merge(owner, k, m));
    const kept = await row(k);
    assert.deepEqual(
      [kept.consent, kept.dnc, kept.consent_source, kept.marketing_consent, kept.marketing_consent_source],
      ["opted_out", true, MERGE_CONSENT_SOURCE, "unknown", STOP_ENDED_OFFERS_SOURCE],
      "a block on either record blocks the person, and the yes to offers ends as a stop ends one",
    );
    assert.deepEqual([kept.email, kept.email_suppressed_reason], [a, "hard_bounce"]);
    assert.ok(kept.email_suppressed_at, "the address came with its suppression");
    assert.equal(new Date(kept.offers_asked_at).toISOString(), new Date(asked).toISOString());
  },
);

test(
  "refused, in contracts' own sentences: the same record, two numbers, two addresses, a deleted or merged record, two open deals",
  { skip },
  async () => {
    const refused = async (keep, other, sentence, who = owner) => {
      const r = await merge(who, keep, other);
      assert.equal(r.error?.message, sentence);
      for (const id of [keep, other]) {
        const still = await row(id);
        assert.equal(still.merged_into_contact_id, null, "and nothing moved");
      }
    };
    const one = await bare({ phone_e164: phone() });
    await refused(one, one, MERGE_REFUSALS.same);
    await refused(one, await bare({ phone_e164: phone() }), MERGE_REFUSALS.phones);
    await refused(await bare({ email: address() }), await bare({ email: address() }), MERGE_REFUSALS.emails);
    await refused(one, await bare({ email: address(), erased_at: new Date().toISOString() }), MERGE_REFUSALS.deleted);
    await refused(
      await bare({ email: address(), erasing_since: new Date().toISOString() }),
      one,
      MERGE_REFUSALS.deleted,
    );

    const withDeal = async (fields, service) => {
      const id = await bare(fields);
      ok(await db.from("deals").insert({ tenant_id: A, contact_id: id, stage: "proposed", service }));
      return id;
    };
    await refused(
      await withDeal({ phone_e164: phone() }, "Website"),
      await withDeal({ email: address() }, "Website"),
      MERGE_REFUSALS.deals,
    );
    // Different services are two deals of one person, and merge.
    ok(
      await merge(
        owner,
        await withDeal({ phone_e164: phone() }, "Website"),
        await withDeal({ email: address() }, "Hosting"),
      ),
    );
  },
);

test("only an owner may, and a stranger or another workspace's record is told nothing", { skip }, async () => {
  const k = await bare({ phone_e164: phone() });
  const m = await bare({ email: address() });
  assert.equal((await merge(operator, k, m)).error?.message, MERGE_REFUSALS.owner);
  assert.equal((await merge(stranger, k, m)).error?.message, "Contact not found.");
  const elsewhere = ok(await db.from("contacts").insert({ tenant_id: B, email: address() }).select("id").single()).id;
  assert.equal((await merge(owner, k, elsewhere)).error?.message, "Contact not found.");
  assert.equal((await merge(owner, k, "00000000-0000-4000-8000-000000000000")).error?.message, "Contact not found.");
  // No session at all: the anonymous key reaches no door.
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok((await anon.rpc("merge_people", { p_keep: k, p_merge: m })).error, "the anonymous role is refused");
  for (const id of [k, m]) assert.equal((await row(id)).merged_into_contact_id, null);
});

test(
  "a message still never changes thread: not into another person's, not after a merge, and its words stay its own",
  { skip },
  async () => {
    const a = await byPhone();
    const b = await byPhone();
    const immutable = /messages content columns are immutable/;
    // Two people nobody merged: refused, as before this rule, even for the service role.
    let r = await db.from("messages").update({ conversation_id: b.conversation }).eq("id", a.message);
    assert.match(r.error?.message ?? "", immutable);

    // After a merge, the exception is for the two threads it folded and nothing else.
    const m = await byEmail();
    ok(await merge(owner, a.id, m.id));
    r = await db.from("messages").update({ conversation_id: b.conversation }).eq("id", m.message);
    assert.match(r.error?.message ?? "", immutable, "a moved message cannot move on to a third person's thread");
    r = await db.from("messages").update({ conversation_id: b.conversation }).eq("id", a.message);
    assert.match(r.error?.message ?? "", immutable, "nor can the kept person's own");
    r = await db.from("messages").update({ body: "something else" }).eq("id", m.message);
    assert.match(r.error?.message ?? "", immutable, "and nothing else about a message became changeable");
  },
);

test(
  "erasing the kept person erases the records merged into them: none returns as a person of its own",
  { skip },
  async () => {
    const k = await byPhone();
    const m = await byEmail();
    ok(await db.from("contacts").update({ display_name: "Maria Lopez", notes: "Prefers mornings" }).eq("id", m.id));
    ok(await merge(owner, k.id, m.id));
    ok(await owner.client.rpc("erase_contact", { p_contact_id: k.id }));
    const gone = await row(m.id);
    assert.ok(gone.erased_at, "erased with the person");
    assert.deepEqual(
      [gone.display_name, gone.notes, gone.phone_e164, gone.email, gone.consent, gone.dnc],
      [null, null, null, null, "unknown", true],
      "and left nothing of them",
    );
    const listed = ok(await db.rpc("people_list", { p_tenant_id: A, p_contact_id: m.id }));
    assert.equal(listed.length, 0, "not a person on the page");
  },
);

test("the merged record holds no answer afterwards, so one person is counted once", { skip }, async () => {
  const k = await bare({ phone_e164: phone(), consent: "opted_in" });
  const m = await bare({
    email: address(),
    consent: "opted_in",
    marketing_consent: "opted_in",
    marketing_channels: ["email"],
  });
  ok(await merge(owner, k, m));
  const gone = await row(m);
  assert.deepEqual(
    [gone.consent, gone.marketing_consent, gone.email_marketing, gone.marketing_channels, gone.consent_channels],
    ["unknown", "unknown", "unknown", [], []],
  );
  const kept = await row(k);
  assert.deepEqual(
    [kept.consent, kept.marketing_consent, kept.marketing_channels],
    ["opted_in", "opted_in", ["email"]],
  );
});

test("where both records set a receptionist mode, the stricter stands: never over auto", { skip }, async () => {
  const k = await bare({ phone_e164: phone() });
  const m = await bare({ email: address() });
  ok(
    await db
      .from("policies")
      .insert({ tenant_id: A, class: "reply", mode: "auto", subject_type: "contact", subject_id: k }),
  );
  ok(
    await db
      .from("policies")
      .insert({ tenant_id: A, class: "reply", mode: "never", subject_type: "contact", subject_id: m }),
  );
  ok(await merge(owner, k, m));
  assert.deepEqual(
    ok(
      await db
        .from("policies")
        .select("subject_id, mode")
        .eq("tenant_id", A)
        .eq("subject_type", "contact")
        .in("subject_id", [k, m]),
    ),
    [{ subject_id: k, mode: "never" }],
  );
  // And the other way round: a stricter kept mode is not loosened.
  const k2 = await bare({ phone_e164: phone() });
  const m2 = await bare({ email: address() });
  ok(
    await db
      .from("policies")
      .insert({ tenant_id: A, class: "reply", mode: "ask", subject_type: "contact", subject_id: k2 }),
  );
  ok(
    await db
      .from("policies")
      .insert({ tenant_id: A, class: "reply", mode: "veto", subject_type: "contact", subject_id: m2 }),
  );
  ok(await merge(owner, k2, m2));
  assert.equal(ok(await db.from("policies").select("mode").eq("subject_id", k2).single()).mode, "ask");
});

test(
  "the fold keeps who was answering, who it was assigned to, a hold with no end, the reply turn and a scheduled send",
  { skip },
  async () => {
    const k = await byPhone();
    const m = await byEmail();
    const later = new Date(Date.now() + 3600_000).toISOString();
    ok(await db.from("conversations").update({ state: "needs_human", paused_until: null }).eq("id", k.conversation));
    ok(
      await db
        .from("conversations")
        .update({
          paused_until: later,
          assignee_user_id: owner.id,
          control_kind: "person",
          control_by: owner.id,
          control_until: later,
        })
        .eq("id", m.conversation),
    );
    ok(await db.from("reply_turns").insert({ tenant_id: A, conversation_id: m.conversation, message_id: m.message }));
    const job = ok(
      await db
        .from("jobs")
        .insert({
          tenant_id: A,
          kind: "reply_read",
          due_at: later,
          payload: { conversation_id: m.conversation, contact_id: m.id },
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db.from("notifications").insert({
        tenant_id: A,
        kind: "handoff",
        title: "t",
        body: "b",
        route: `inbox/th-${m.conversation}`,
        subject_type: "conversation",
        subject_id: m.conversation,
      }),
    );
    ok(await merge(owner, k.id, m.id));
    const thread = ok(
      await db
        .from("conversations")
        .select("state, paused_until, assignee_user_id, control_kind, control_by, control_until")
        .eq("id", k.conversation)
        .single(),
    );
    assert.deepEqual(
      [thread.state, thread.paused_until, thread.assignee_user_id, thread.control_kind, thread.control_by],
      ["needs_human", null, owner.id, "person", owner.id],
      "a hold with no end stays one, and the person answering the merged thread answers the kept one",
    );
    assert.deepEqual(
      ok(
        await db
          .from("reply_turns")
          .select("conversation_id, message_id")
          .in("conversation_id", [k.conversation, m.conversation]),
      ),
      [{ conversation_id: k.conversation, message_id: m.message }],
    );
    const payload = ok(await db.from("jobs").select("payload").eq("id", job).single()).payload;
    assert.deepEqual([payload.conversation_id, payload.contact_id], [k.conversation, k.id]);
    const told = ok(
      await db
        .from("notifications")
        .select("route, subject_id")
        .eq("tenant_id", A)
        .eq("subject_type", "conversation")
        .in("subject_id", [k.conversation, m.conversation]),
    );
    assert.deepEqual(told, [{ route: `inbox/th-${k.conversation}`, subject_id: k.conversation }]);
  },
);

test("two records with no thread merge too, and a yes by text and a yes on WhatsApp cover both", { skip }, async () => {
  const k = await bare({ phone_e164: phone(), consent: "opted_in", consent_channels: ["sms"] });
  const m = await bare({ email: address(), consent: "opted_in", consent_channels: ["whatsapp"] });
  const answered = ok(await merge(owner, k, m));
  assert.equal("threads" in answered.counts, false, "no thread to fold or take");
  assert.deepEqual((await row(k)).consent_channels, ["whatsapp", "sms"]);
});
