/**
 * Retention is stated in one place and enforced where it is stated -- on a
 * real database.
 *
 * contracts/retention.ts holds the numbers the privacy page prints;
 * purge_events (00115) drops the evidence kinds past
 * RETENTION_DAYS.events_evidence and nothing else. Seeded a day either side
 * of the boundary and run with its DEFAULT, so a default that drifts from the
 * contract fails here. Skipped without a local database.
 *
 * Call audio is removed by the calls sweep (api/cron/calls), which pg_cron
 * asks for through trigger_call_reconcile only when the calls table owes it
 * something. Until 00148 audio past its days was not on that list, so a quiet
 * line kept its recordings for ever. The clock is turned here by hand and read
 * where sweep_health() reads it, and the sweep's own handler does the purge,
 * against this database's bucket.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { EVENT_EVIDENCE_KINDS, RETENTION_DAYS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes and purges events, and removes call audio"
      : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `retention-${Date.now()}`, name: "Retention" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const RECORD = [
  "billing.updated",
  "broadcast.sent",
  "contact.consent_changed",
  "message.received",
  "usage.voice_seconds",
  "usage.wa_conversation",
];

test(
  "purge_events drops every evidence kind past the contract's days, keeps the younger ones, and never touches the record",
  { skip },
  async () => {
    const keep = RETENTION_DAYS.events_evidence;
    const rows = [];
    for (const kind of EVENT_EVIDENCE_KINDS) {
      rows.push({ tenant_id: tenantId, kind, data: { age: "old" }, created_at: daysAgo(keep + 1) });
      rows.push({ tenant_id: tenantId, kind, data: { age: "young" }, created_at: daysAgo(keep - 1) });
    }
    // The record: an old row of each family that is NOT evidence stays for ever.
    for (const kind of RECORD) rows.push({ tenant_id: tenantId, kind, data: { age: "old" }, created_at: daysAgo(400) });
    const { error } = await db.from("events").insert(rows);
    assert.equal(error, null, error?.message);

    const { data: n, error: pErr } = await db.rpc("purge_events");
    assert.equal(pErr, null, pErr?.message);
    assert.ok(n >= EVENT_EVIDENCE_KINDS.length, `purged ${n}`);

    const { data: left, error: lErr } = await db.from("events").select("kind, data").eq("tenant_id", tenantId);
    assert.equal(lErr, null, lErr?.message);
    const isEvidence = (k) => EVENT_EVIDENCE_KINDS.includes(k);
    assert.deepEqual(
      left.filter((e) => isEvidence(e.kind) && e.data.age === "old"),
      [],
      "every old evidence row went",
    );
    assert.deepEqual(
      left
        .filter((e) => isEvidence(e.kind) && e.data.age === "young")
        .map((e) => e.kind)
        .sort(),
      [...EVENT_EVIDENCE_KINDS].sort(),
      "a day inside the contract stays",
    );
    // Creating the workspace wrote workspace.created too (00109); the record is
    // everything that is not evidence, so it is on the list by the same rule.
    const record = left.filter((e) => !isEvidence(e.kind)).map((e) => e.kind);
    for (const k of RECORD) assert.ok(record.includes(k), `${k} is the record and stays`);
    assert.ok(record.includes("workspace.created"), "the workspace's own first event stays");
  },
);

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

// supabase/seed.sql takes the edge's address out of this database's Vault, so
// a turn that finds work cannot send it and says so, as request_sweep does.
const NO_EDGE = "missing cron_sweep_key or edge_base_url in Vault";

/**
 * One turn of the calls clock, as pg_cron makes it every five minutes. The
 * note is marked first, so either answer is visible -- cleared when nothing is
 * owed, NO_EDGE when something is -- and then put back as it was.
 */
async function turnTheCallsClock() {
  const was = ok(await db.from("sweep_status").select("note, request_id, requested_at").eq("sweep", "calls").single());
  const mark = `retention ${Math.random().toString(36).slice(2)}`;
  ok(await db.from("sweep_status").update({ note: mark }).eq("sweep", "calls"));
  const returned = ok(await db.rpc("trigger_call_reconcile"));
  const now = ok(await db.from("sweep_status").select("note, request_id, requested_at").eq("sweep", "calls").single());
  ok(await db.from("sweep_status").update({ note: was.note }).eq("sweep", "calls"));
  assert.equal(returned, null, "a database with no edge to ask answers null either way");
  if (now.note === NO_EDGE) return "asked";
  if (now.note === null) {
    // 00149: nothing owed records nothing but the cleared note. 'calls' has no
    // silence to keep, and a look stamped here would hold the last ask inside
    // sweep_health()'s hour for ever; once pg_net dropped that answer, after
    // six hours, the row would read "pg_net never recorded a response".
    assert.deepEqual(
      [now.request_id, now.requested_at],
      [was.request_id, was.requested_at],
      "a quiet turn stamps no look",
    );
    return "quiet";
  }
  return assert.fail(
    `the calls clock left its note as it found it (${JSON.stringify(now.note)}): nothing says whether it had work`,
  );
}

/**
 * A turn that should find nothing owed. The predicate is the whole database's,
 * and other suites run beside this one -- people-came-from seeds ended calls
 * that are still owed a line in their thread -- so a turn that asks is taken
 * again until theirs is gone. A clock that keeps asking fails, and says so.
 */
async function quietWithin(why, ms = 60_000) {
  const until = Date.now() + ms;
  while ((await turnTheCallsClock()) !== "quiet") {
    if (Date.now() > until) assert.fail(`${why}: the calls clock was still asking after ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

test(
  "the calls clock is watched: work it cannot send is noted where sweep_health() reads it, and a turn with nothing owed clears the note",
  { skip },
  async () => {
    await quietWithin("before this suite has a call");
    // A call still marked ongoing half an hour after it began: the provider is owed a question.
    const live = ok(
      await db
        .from("calls")
        .insert({
          tenant_id: tenantId,
          retell_call_id: `retention-${Date.now()}-live`,
          status: "ongoing",
          started_at: new Date(Date.now() - 31 * 60_000).toISOString(),
        })
        .select("id")
        .single(),
    );
    try {
      assert.equal(
        await turnTheCallsClock(),
        "asked",
        "work owed and no edge to send it to is on the record, not a warning in a log nobody reads",
      );
    } finally {
      ok(await db.from("calls").delete().eq("id", live.id));
    }
    // 00026: a note that outlived its fault would mail the platform four times a day, for ever, from an idle line.
    await quietWithin("once the call is gone");
  },
);

test(
  "call audio past the contract's days wakes a quiet line's clock; the sweep takes it out of the bucket and marks the call, and the line goes quiet again",
  { skip },
  async () => {
    const days = RETENTION_DAYS.call_recordings;
    const bucket = db.storage.from("media");
    const seeded = [];
    /** A finished call whose audio was copied, as copyRecording's stored settle leaves it (apps/edge/lib/voice/call-recording.ts). */
    const recorded = async (tag, ageDays) => {
      const id = crypto.randomUUID();
      const path = `${tenantId}/calls/${id}.wav`;
      ok(await bucket.upload(path, new Uint8Array([82, 73, 70, 70]), { contentType: "audio/wav", upsert: true }));
      seeded.push({ id, path });
      ok(
        await db.from("calls").insert({
          id,
          tenant_id: tenantId,
          retell_call_id: `retention-${Date.now()}-${tag}`,
          status: "ended",
          started_at: daysAgo(ageDays),
          ended_at: daysAgo(ageDays),
          recording: { fetch_state: "stored", attempts: 1, storage_path: path, mime: "audio/wav", bytes: 4 },
        }),
      );
      return { id, path };
    };
    const inBucket = async () => ok(await bucket.list(`${tenantId}/calls`)).map((o) => `${tenantId}/calls/${o.name}`);
    try {
      const young = await recorded("young", days - 1);
      await quietWithin("a recording a day inside its retention owes the sweep nothing");
      const old = await recorded("old", days + 1);
      assert.equal(
        await turnTheCallsClock(),
        "asked",
        "audio past its days is work: without it on the clock's list a quiet line never asks the sweep to remove it",
      );

      // What pg_net would carry to the edge: the sweep's own handler, with this
      // database's key. There is no provider key in this process, so it answers
      // 503 -- after the purge, which runs first for exactly that case.
      delete process.env.RETELL_API_KEY;
      const { POST } = await import(new URL("../../../../apps/edge/api/cron/calls.ts", import.meta.url).href);
      const key = ok(await db.rpc("get_cron_sweep_key"));
      const res = await POST(
        new Request("http://edge.test/api/cron/calls", { method: "POST", headers: { "x-cron-key": key } }),
      );
      assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "no_provider_credentials" }]);

      const rows = Object.fromEntries(
        ok(await db.from("calls").select("id, recording").in("id", [old.id, young.id])).map((r) => [r.id, r.recording]),
      );
      const { purged_at, ...marker } = rows[old.id];
      assert.deepEqual(
        marker,
        { fetch_state: "purged", retention_days: days, mime: "audio/wav" },
        "the path and the size go with the audio; the marker says under which rule",
      );
      assert.ok(Date.now() - Date.parse(purged_at) < 60_000, `and when: ${purged_at}`);
      assert.equal(rows[young.id].fetch_state, "stored", "a day inside the contract stays");
      assert.deepEqual(await inBucket(), [young.path], "the old audio is out of the bucket, the young is not");

      await quietWithin("a purged call owes nothing, so the edge is not woken for it every five minutes for ever");
    } finally {
      if (seeded.length) {
        await bucket.remove(seeded.map((s) => s.path));
        await db
          .from("calls")
          .delete()
          .in(
            "id",
            seeded.map((s) => s.id),
          );
      }
    }
  },
);

test(
  "purge_idempotency_keys keeps a day of the keys writes were answered under, a card's and a reply's as a request's, and drops the rest",
  { skip },
  async () => {
    // Decision 0035, 00340: run with its DEFAULT, so a default that drifts from RETENTION_DAYS.idempotency_keys fails.
    const keep = RETENTION_DAYS.idempotency_keys;
    const at = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
    const rows = [
      ["req:old", keep + 0.1],
      ["card:old", keep + 0.1],
      ["u1:old", keep + 2],
      ["req:young", keep - 0.1],
      ["card:young", 0],
    ].map(([key, age]) => ({
      tenant_id: tenantId,
      key,
      route: "POST /api/v1/x",
      request_hash: "",
      response: { ok: true },
      created_at: at(age),
    }));
    const { error } = await db.from("idempotency_keys").insert(rows);
    assert.ifError(error);
    const { data: purged, error: pErr } = await db.rpc("purge_idempotency_keys");
    assert.ifError(pErr);
    assert.ok(purged >= 3, `answers how many it removed (${purged})`);
    const { data: left } = await db.from("idempotency_keys").select("key").eq("tenant_id", tenantId);
    assert.deepEqual((left ?? []).map((r) => r.key).sort(), ["card:young", "req:young"]);
  },
);

test(
  "purge_google_reviews lets a review go that the mirror has not seen for its days, and says the connection is no longer whole",
  { skip },
  async () => {
    // Decision 0036, 00392: run with its DEFAULT, so a default that drifts from RETENTION_DAYS.google_reviews fails.
    const keep = RETENTION_DAYS.google_reviews;
    assert.ifError(
      (await db.from("google_listings").insert({ tenant_id: tenantId, place_id: `place-${Date.now()}`, name: "Kept" }))
        .error,
    );
    assert.ifError(
      (
        await db
          .from("google_connections")
          .insert({ tenant_id: tenantId, account_name: "accounts/1", reviews_complete: true })
      ).error,
    );
    const rows = [
      ["gone", keep + 1],
      ["kept", keep - 1],
    ].map(([review_id, age]) => ({
      tenant_id: tenantId,
      review_id,
      origin: "profile",
      author: "Rae",
      body: "Kind and quick.",
      last_seen_at: daysAgo(age),
    }));
    assert.ifError((await db.from("google_reviews").insert(rows)).error);
    const { data: purged, error } = await db.rpc("purge_google_reviews");
    assert.ifError(error);
    assert.ok(purged >= 1, `answers how many it removed (${purged})`);
    const { data: left } = await db.from("google_reviews").select("review_id").eq("tenant_id", tenantId);
    assert.deepEqual(
      (left ?? []).map((r) => r.review_id),
      ["kept"],
    );
    const { data: conn } = await db
      .from("google_connections")
      .select("reviews_complete")
      .eq("tenant_id", tenantId)
      .single();
    assert.equal(
      conn.reviews_complete,
      false,
      "a mirror that lost a review here no longer holds every one Google lists",
    );
  },
);

test(
  "purge_invitations lets an invitation go 30 days after it was accepted or taken back, with the address its decision kept; an open or expired one stays",
  { skip },
  async () => {
    const keep = RETENTION_DAYS.invitations_closed;
    const invite = async (email, over) => {
      const { data, error } = await db
        .from("invitations")
        .insert({ tenant_id: tenantId, email, role: "operator", ...over })
        .select("id")
        .single();
      assert.ifError(error);
      const d = await db.from("decisions").insert({
        tenant_id: tenantId,
        subject_type: "invitation",
        subject_id: data.id,
        verb: "invite",
        actor_type: "system",
        payload: { email, role: "operator" },
      });
      assert.ifError(d.error);
      return data.id;
    };
    const accepted = await invite("old-yes@example.com", {
      created_at: daysAgo(keep + 9),
      expires_at: daysAgo(keep + 2),
      accepted_at: daysAgo(keep + 1),
    });
    const revoked = await invite("old-no@example.com", {
      created_at: daysAgo(keep + 9),
      expires_at: daysAgo(keep + 2),
      revoked_at: daysAgo(keep + 1),
    });
    const recent = await invite("new-yes@example.com", {
      created_at: daysAgo(keep),
      expires_at: daysAgo(keep - 7),
      accepted_at: daysAgo(keep - 1),
    });
    const expired = await invite("never@example.com", {
      created_at: daysAgo(keep + 40),
      expires_at: daysAgo(keep + 33),
    });
    const { data: purged, error } = await db.rpc("purge_invitations");
    assert.ifError(error);
    assert.ok(purged >= 2, `answers how many it removed (${purged})`);
    const { data: left } = await db.from("invitations").select("id").eq("tenant_id", tenantId);
    assert.deepEqual((left ?? []).map((r) => r.id).sort(), [recent, expired].sort());
    const { data: said } = await db
      .from("decisions")
      .select("subject_id, payload")
      .eq("tenant_id", tenantId)
      .eq("subject_type", "invitation");
    const by = Object.fromEntries((said ?? []).map((d) => [d.subject_id, d.payload]));
    assert.deepEqual(by[accepted], { role: "operator" }, "the decision is kept, the address is not");
    assert.deepEqual(by[revoked], { role: "operator" });
    assert.equal(by[recent].email, "new-yes@example.com", "an invitation still kept keeps its decision whole");
    assert.equal(by[expired].email, "never@example.com");
  },
);

test(
  "purge_leads lets a batch's judgment go after its days, as RETENTION_DAYS.lead_judgments says",
  { skip },
  async () => {
    const keep = RETENTION_DAYS.lead_judgments;
    const search = (
      await db
        .from("lead_searches")
        .insert({ tenant_id: tenantId, via: "people", card: "local_businesses", name: "kept", asked: "kept", plan: {} })
        .select("id")
        .single()
    ).data.id;
    const round = (
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: tenantId,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: {},
          plan_version: 1,
          target: 5,
          month: "2026-09",
          day: "2026-09-19",
        })
        .select("id")
        .single()
    ).data.id;
    // Ended as soon as it exists, as the tenancy suite ends its own: a round that has not ended is the finder's work.
    assert.ifError((await db.from("lead_rounds").update({ state: "ended", ending: "stopped" }).eq("id", round)).error);
    const rows = [
      ["gone", keep + 1],
      ["kept", keep - 1],
    ].map(([op, age]) => ({
      tenant_id: tenantId,
      round_id: round,
      op_id: `${op}-${Date.now()}`,
      answer: { places: [{ reason: "A family salon on Main Street." }] },
      created_at: daysAgo(age),
    }));
    assert.ifError((await db.from("lead_judgments").insert(rows)).error);
    assert.ifError((await db.rpc("purge_leads")).error);
    const { data: left } = await db.from("lead_judgments").select("op_id").eq("round_id", round);
    assert.deepEqual(
      (left ?? []).map((r) => r.op_id.split("-")[0]),
      ["kept"],
    );
  },
);
