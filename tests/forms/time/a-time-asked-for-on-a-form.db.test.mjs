/**
 * A time asked for on a form on a real database (00691; the Forms plan, F3; decision 0061): form_time_request_take
 * keeps the entry as form_request_take does and, for one accepted with its person, opens the same request a chat opens
 * in the same transaction: a proposed visit, the receptionist's, held 23 hours at most and never past an hour before
 * it, in no thread and with no hand-over, the person's request before it let go (one a chat held leaves a reply owed
 * there), named from the entry by its visit link, and saying it answered the form (00704: through_type form). Of two
 * people who ask for one time the first holds it, and the second's entry is kept with its time taken (00730). The owner
 * answers it with the chat's own door (booking_request_answer);
 * past its day Booked it is refused, and the request clock never takes it up. form_booking_open counts a business's own
 * booking page opened from a form. form_requests_open and form_results say the time and the counts. A function body is
 * what reading source cannot prove, so these run against Postgres. Skipped without a local database; never production.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const RUN = Date.now();
const REFUSED = "42501";
const HOUR_MS = 3_600_000;
let db;
let tenantId;
let otherTenantId;
let formId;
let versionId;
const users = {};
const sessions = {};

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const address = (who) => `${who}-${RUN}@example.com`;
const hours = (n) => new Date(Date.now() + n * HOUR_MS).toISOString();
const DRAFT = {
  heading: "Colour consultation",
  lang: "en",
  thanks: "Thanks!",
  next: { chat: true, draft: true, follow_up: false },
  fields: [
    { id: "name", kind: "short", label: "Your name", needed: true },
    { id: "mail", kind: "email", label: "Email", needed: true },
    {
      id: "when",
      kind: "when",
      label: "When?",
      needed: false,
      choices: [
        { id: "am", label: "Mornings" },
        { id: "pm", label: "Evenings" },
      ],
    },
  ],
};

/** The door's one write with a time, as the dashboard's public page calls it (packages/db takeFormTimeRequest). */
const takeAt = async (ref, who, startsAt, over = {}) =>
  ok(
    await db.rpc("form_time_request_take", {
      p_tenant_id: tenantId,
      p_form_id: formId,
      p_version_id: versionId,
      p_ref: `${ref}-${RUN}`,
      p_answers: { name: who, mail: address(who), when: "x" },
      p_reach: { name: who, email: address(who), phone: null },
      p_words: "c".repeat(64),
      p_starts_at: startsAt,
      p_ends_at: new Date(Date.parse(startsAt) + HOUR_MS).toISOString(),
      p_service: "Balayage",
      p_timezone: "America/New_York",
      ...over,
    }),
    ref,
  );
const visitOf = async (entryId) => {
  const links = ok(
    await db.from("form_entry_links").select("appointment_id").eq("entry_id", entryId).eq("kind", "visit"),
    "visit links",
  );
  if (!links.length) return null;
  return ok(await db.from("appointments").select("*").eq("id", links[0].appointment_id).single(), "the visit");
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (slug, name) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `${slug}-${RUN}`, name })
        .select("id")
        .single(),
      slug,
    ).id;
  tenantId = await workspace("form-time", "Harbor");
  otherTenantId = await workspace("form-time-other", "Quay");
  for (const [who, role, tenant] of [
    ["owner", "owner", tenantId],
    ["viewer", "viewer", tenantId],
    ["stranger", "owner", otherTenantId],
  ]) {
    const user = ok(
      await db.auth.admin.createUser({ email: address(who), password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    users[who] = user.id;
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }), `${who}'s seat`);
    const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await as.auth.signInWithPassword({ email: address(who), password: `pw-${RUN}-Aa1!` }), who);
    sessions[who] = as;
  }
  formId = ok(
    await sessions.owner
      .from("forms")
      .insert({ tenant_id: tenantId, slug: "colour", draft: DRAFT, created_by: users.owner })
      .select("id")
      .single(),
    "the form",
  ).id;
  versionId = ok(
    await sessions.owner.rpc("form_publish", { p_tenant_id: tenantId, p_form_id: formId }),
    "publish",
  ).version_id;
});

after(async () => {
  if (skip || !tenantId) return;
  for (const id of [tenantId, otherTenantId]) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of Object.values(users)) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

test(
  "a time asked for is the chat's own request, in no thread and with no hand-over, and the same press is one",
  { skip },
  async () => {
    const at = hours(48);
    const ana = await takeAt("ana", "Ana", at);
    assert.equal(ana.outcome, "accepted");
    assert.ok(ana.time?.appointment_id, "the time is held");
    const visit = await visitOf(ana.entry_id);
    assert.equal(visit.status, "proposed");
    assert.equal(visit.source, "receptionist");
    assert.equal(visit.conversation_id, null);
    assert.equal(visit.through_type, "form", "it says it answered the form (00704)");
    assert.equal(visit.through_id, formId);
    assert.equal(visit.service, "Balayage");
    assert.ok(Math.abs(Date.parse(visit.expires_at) - (Date.now() + 23 * HOUR_MS)) < 5 * 60_000, "held 23 hours");
    const holds = ok(await db.from("escalations").select("id").eq("tenant_id", tenantId), "holds");
    assert.equal(holds.length, 0, "no thread is handed to anyone");
    const again = await takeAt("ana", "Ana", at);
    assert.equal(again.outcome, "again");
    assert.equal(again.time?.appointment_id, ana.time.appointment_id);
    // Two people, one time (00730, lane 15): the first holds it; the second's entry is kept, its time taken.
    const bea = await takeAt("bea", "Bea", at);
    assert.equal(bea.outcome, "accepted", "her request is kept");
    assert.deepEqual(bea.time, { error: "taken" });
    assert.equal(await visitOf(bea.entry_id), null, "and holds no time");
    assert.equal((await visitOf(ana.entry_id)).status, "proposed", "Ana still holds it");
  },
);

test("one open request per person; too soon, a test and a held entry hold no time", { skip }, async () => {
  const first = await takeAt("cy-1", "Cy", hours(40));
  const second = await takeAt("cy-2", "Cy", hours(60));
  assert.equal(second.contact_id, first.contact_id);
  assert.equal((await visitOf(first.entry_id)).status, "cancelled", "their time before is let go");
  assert.equal((await visitOf(second.entry_id)).status, "proposed");
  const soon = await takeAt("di", "Di", hours(0.5));
  assert.equal(soon.outcome, "accepted");
  assert.equal(soon.time?.error, "too_soon");
  assert.equal(await visitOf(soon.entry_id), null);
  const own = await takeAt("owner-test", "Owner", hours(40), { p_test: true });
  assert.equal(own.outcome, "test");
  assert.equal(await visitOf(own.entry_id), null);
  const held = await takeAt("bot", "Bot", hours(40), { p_held_why: "too_fast" });
  assert.equal(held.outcome, "held");
  assert.equal(await visitOf(held.entry_id), null);
});

test("only the service role may call the door", { skip }, async () => {
  const call = (client) =>
    client.rpc("form_time_request_take", {
      p_tenant_id: tenantId,
      p_form_id: formId,
      p_version_id: versionId,
      p_ref: `member-${RUN}`,
      p_answers: {},
      p_reach: {},
      p_words: "c".repeat(64),
      p_starts_at: hours(40),
      p_ends_at: hours(41),
      p_service: "",
      p_timezone: "UTC",
    });
  assert.equal((await call(sessions.owner)).error?.code, REFUSED);
  assert.equal(
    (await sessions.owner.rpc("form_booking_open", { p_tenant_id: tenantId, p_form_id: formId })).error?.code,
    REFUSED,
  );
});

test("the owner answers it with the chat's own door, and past its day it is never booked blind", { skip }, async () => {
  const eve = await takeAt("eve", "Eve", hours(50));
  const booked = ok(
    await sessions.owner.rpc("booking_request_answer", { p_appointment_id: eve.time.appointment_id, p_booked: true }),
    "Booked it",
  );
  assert.equal(booked.appointment?.status, "booked");
  assert.equal(booked.hold, null, "there was no hold to resolve");
  const fay = await takeAt("fay", "Fay", hours(52));
  ok(
    await db
      .from("appointments")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", fay.time.appointment_id),
    "its day passes",
  );
  const late = ok(
    await sessions.owner.rpc("booking_request_answer", { p_appointment_id: fay.time.appointment_id, p_booked: true }),
    "Booked it, late",
  );
  assert.equal(late.error, "expired");
  const due = ok(await db.rpc("booking_requests_due", { p_limit: 200 }), "the clock's list");
  assert.ok(!due.some((row) => row.appointment_id === fay.time.appointment_id), "the clock never takes it up");
  const cant = ok(
    await sessions.owner.rpc("booking_request_answer", { p_appointment_id: fay.time.appointment_id, p_booked: false }),
    "Can't",
  );
  assert.equal(cant.appointment?.status, "cancelled");
});

test(
  "the reads say the time, and a booking page opened from a form is counted, a member's to read",
  { skip },
  async () => {
    const open = ok(await sessions.owner.rpc("form_requests_open", { p_tenant_id: tenantId }), "open");
    const withTime = open.filter((line) => line.time);
    assert.ok(withTime.length > 0, "requests that asked for a time say it");
    for (const line of withTime) assert.equal(line.time.timezone, "America/New_York");
    ok(await db.rpc("form_booking_open", { p_tenant_id: tenantId, p_form_id: formId }), "an open");
    ok(await db.rpc("form_booking_open", { p_tenant_id: tenantId, p_form_id: formId }), "another");
    const results = ok(await sessions.owner.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }), "results");
    assert.equal(results.booking_opens.find((b) => b.form_id === formId)?.opens, 2);
    const place = results.places.find((p) => p.form_id === formId && p.link_id === null);
    assert.ok(place.asked > 0, "requests that asked for a time are counted");
    assert.ok(place.visits >= 1, "the time Booked it confirmed is a visit the form brought");
    const days = ok(await sessions.owner.from("form_days").select("booking_opens").eq("form_id", formId), "days");
    assert.equal(days[0]?.booking_opens, 2);
    assert.equal((await sessions.stranger.from("form_days").select("form_id").eq("form_id", formId)).data?.length, 0);
    assert.equal(
      (await sessions.owner.from("form_days").insert({ form_id: formId, tenant_id: tenantId, day: "2026-01-01" })).error
        ?.code,
      REFUSED,
    );
  },
);
