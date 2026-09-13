/**
 * The voice webhook, run: a delivery signed the way Retell signs it, over a
 * database in memory, with the recording CDN, the mail transport and the
 * provider's live-call API answered by a captured fetch. Until 13 Sep 2026
 * this handler's text was pinned by thirteen assertions in twelve files and
 * nothing had ever called its POST.
 *
 * The door: a signature over the raw body opens it, one over the re-serialised
 * body opens it and is recorded as such, the ?key= opens it only while
 * RETELL_FN_SECRET is set, and a refusal is a 401 that leaves ONE evidence row
 * a minute. Past the door: a call nobody's agent owns is dead-lettered under
 * the platform; a routed call is ingested, an inbound test call marks the
 * forwarded line verified, and every delivery leaves its row. The transcript
 * rides wherever the provider put it. The note waits for the summary, the
 * recording is copied on a budget, a stale replay writes nothing, a spoken
 * price is corrected once, and the analysis tells the owner once -- by bell,
 * and by mail only to a mailbox that is theirs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { frameGuardrail } from "@chanlytics/contracts";
import { at, openDoor, wire, withEnv, sign, kind, ingests, DUPLICATE, PLATFORM, LINE, CALLER, NOW, iso } from "./_retell-webhook-world.mjs";

// The store reads its flags at import and the door reads its keys at the
// knock; each test file is its own process, so this is the whole environment.
// openDoor() imports the handler AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.BLOB_SHADOW = "off";
// A token, so the store WOULD be Blob were it not retired: the proof that no
// Blob note is attempted is that nothing reaches Blob even so.
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_only";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
// No workspace is the environment's own, and the only database is the one handed in.
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg, store, knock, deliver, world } = await openDoor();
const { WEBHOOK_COPY_TIMEOUT_MS, SWEEP_COPY_TIMEOUT_MS } = await import(at("apps/edge/lib/call-recording.ts"));
after(() => setPg(null));

/* ------------------------------------------------------------ the door */

test("the door: a refusal is a 401 with one evidence row a minute; the raw body, the re-serialised body and the ?key= each open it, and the row says which", async () => {
  const w = world();
  const db = w.open();
  const rows = () => kind(w.tables, "webhook.auth");
  const raw = JSON.stringify({ event: "ping" });

  // THE FIRST REFUSAL THIS PROCESS SEES. A refused delivery's evidence row is
  // throttled to one a minute per instance (module state), so this knock is
  // the one that leaves it, and every refusal below -- inside the same minute
  // -- must leave none. Reorder these and the assertions flip.
  const wrongKey = await knock(raw, { signature: sign(raw, { key: "not-the-badged-key" }) });
  assert.equal(wrongKey.status, 401);
  assert.deepEqual(await wrongKey.json(), { ok: false, error: "unauthorized" });
  assert.equal(rows().length, 1, "the refusal is evidence /api/diag can read back");
  assert.equal(rows()[0].tenant_id, PLATFORM, "platform-scoped: no workspace was found for it");
  assert.equal(rows()[0].category, "ingest");
  assert.deepEqual(rows()[0].data, { provider: "retell", sig: false, key: false, sig_raw: false, sig_restringified: false });
  assert.equal(ingests(db).length, 0, "nothing past the door");

  // A second and a third refusal inside the minute: the same 401 and NO new
  // row. A public door awaiting an insert on its way to a 401 must not be a
  // write amplifier.
  const stale = await knock(raw, { signature: sign(raw, { ms: Date.now() - 6 * 60_000 }) });
  assert.equal(stale.status, 401, "six minutes old: outside the replay window, with the right key");
  assert.equal((await knock(raw)).status, 401, "no credential at all");
  assert.equal(rows().length, 1, "three refusals, one row");

  // The ?key= NEVER opens the door while RETELL_FN_SECRET is empty or unset --
  // the shape a rotation leaves behind for a moment. "" compared with "" once
  // admitted anyone.
  for (const secret of ["", undefined]) {
    await withEnv({ RETELL_FN_SECRET: secret }, async () => {
      assert.equal((await knock(raw, { key: "" })).status, 401, `secret ${JSON.stringify(secret)}, key ""`);
      assert.equal((await knock(raw, { key: "anything" })).status, 401, `secret ${JSON.stringify(secret)}, key "anything"`);
    });
  }
  assert.equal(rows().length, 1, "still inside the minute: still one row");

  // The signature over the raw bytes opens it, and the row says the signature did.
  const rawOk = await knock(raw, { signature: sign(raw) });
  assert.deepEqual([rawOk.status, await rawOk.json()], [200, { ok: true }]);
  assert.equal(rows().length, 2, "an ACCEPTED delivery is recorded every time; only refusals are throttled");
  assert.deepEqual(rows()[1].data, { provider: "retell", sig: true, key: false, sig_raw: true, sig_restringified: true },
    "the re-serialised form is reported with the raw verdict when the raw one passed: nothing had to be re-tried");

  // Retell's own example verifies JSON.stringify(req.body), and an encoder that
  // escapes the em dash makes that a different string from the bytes on the
  // wire. A signature over the re-serialised form opens the door with the same
  // key, and the row says which form verified.
  const escaped = '{"event":"ping","note":"Harbor \\u2014 front desk"}';
  const reserialised = JSON.stringify(JSON.parse(escaped));
  assert.notEqual(reserialised, escaped, "the two forms differ, which is the whole point");
  assert.equal((await knock(escaped, { signature: sign(reserialised) })).status, 200);
  assert.deepEqual(rows()[2].data, { provider: "retell", sig: true, key: false, sig_raw: false, sig_restringified: true });

  // The ?key= opens it while the secret is set; the row says the signature did not.
  assert.equal((await knock(raw, { key: process.env.RETELL_FN_SECRET })).status, 200);
  assert.deepEqual(rows()[3].data, { provider: "retell", sig: false, key: true, sig_raw: false, sig_restringified: false });
  assert.equal((await knock(raw, { key: "wrong-secret" })).status, 401);

  // With RETELL_WEBHOOK_KEY empty the API key is tried underneath, as before --
  // and the badged key then verifies nothing.
  await withEnv({ RETELL_WEBHOOK_KEY: undefined }, async () => {
    assert.equal((await knock(raw, { signature: sign(raw, { key: process.env.RETELL_API_KEY }) })).status, 200);
    assert.equal((await knock(raw, { signature: sign(raw, { key: "badged-key-for-this-file" }) })).status, 401);
  });
  assert.equal(rows().length, 5, "four accepted, and the one refusal");
  assert.equal(w.tables.events.length, 5, "a body carrying no call writes nothing but its auth row");
  assert.equal(ingests(db).length, 0);
});

/* ------------------------------------------------------- past the door */

test("a call nobody's agent owns is dead-lettered under the platform and answered 200, never guessed into a workspace", async () => {
  const w = world();
  const db = w.open();
  const nobody = `${w.AGENT}_nobody`;
  const stranger = await deliver("call_started", w.call(w.callId("stranger"), { agent_id: nobody, call_status: "ongoing", start_timestamp: NOW }));
  assert.deepEqual([stranger.status, await stranger.json()], [200, { ok: true }], "answered: a delivery that can never route earns no retry");
  const dead = kind(w.tables, "ingest.unroutable");
  assert.equal(dead.length, 1);
  assert.deepEqual([dead[0].tenant_id, dead[0].category, dead[0].subject_type, dead[0].data], [PLATFORM, "ingest", null, { channel: "voice", agent_id: nobody }]);

  // A per-turn delivery that names no agent, for a call no row knows: the same.
  const orphan = await deliver("transcript_updated", { call_id: w.callId("orphan") }, { transcript_with_tool_calls: [{ role: "user", content: "hello?" }] });
  assert.equal(orphan.status, 200);
  assert.deepEqual(kind(w.tables, "ingest.unroutable").at(-1).data, { channel: "voice", agent_id: null });

  assert.equal(ingests(db).length, 0, "no row is written for a call that belongs to nobody");
  assert.equal(w.tables.calls.length, 0);
  assert.equal(kind(w.tables, "webhook.delivery").length, 0, "the dead-letter row is the record; there is no workspace to record a delivery under");
});

test("call_started on a known agent: the normalised call reaches ingest_call, the owner's test call marks the forwarded line verified, and the delivery leaves its row", async () => {
  const w = world();
  const lineId = `line_${w.T}`;
  w.tables.lines.push({
    id: lineId, tenant_id: w.T, kind: "forwarded", forwarding_state: "instructed", e164: "+16469325775",
    facts: { carrier: "verizon", mode: "unanswered", destination_e164: LINE, test_from: CALLER, test_started_at: iso(NOW - 5 * 60_000), test_until: iso(NOW + 25 * 60_000) },
  });
  const db = w.open();
  const id = w.callId("started");
  const res = await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 10_000 }));
  assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);

  assert.equal(ingests(db).length, 1);
  const a = ingests(db)[0].args;
  assert.equal(a.p_tenant_id, w.T, "the workspace the agent routes to, never a guess");
  assert.deepEqual(
    [a.p_retell_call_id, a.p_agent_id, a.p_from_e164, a.p_from_raw, a.p_to_e164, a.p_direction, a.p_status, a.p_call_type, a.p_started_at],
    [id, w.AGENT, CALLER, CALLER, LINE, "inbound", "ongoing", "phone_call", iso(NOW - 10_000)],
  );
  assert.deepEqual([a.p_recording, a.p_summary, a.p_analysis], [null, null, null], "nothing the call does not have yet");
  assert.equal(w.tables.calls.length, 1);
  const row = w.tables.calls[0];
  assert.equal(row.status, "ongoing");

  // Keep my number, proven: the line's state, the bell, the ledger.
  const line = w.tables.lines[0];
  assert.equal(line.forwarding_state, "verified");
  assert.deepEqual([line.facts.verified_call_id, line.facts.verified_from, line.facts.destination_e164], [row.id, CALLER, LINE], "the facts keep the call that proved it");
  assert.ok(line.facts.verified_at && line.state_since, "and when");
  const bells = w.tables.notifications;
  assert.equal(bells.length, 1);
  assert.deepEqual([bells[0].tenant_id, bells[0].kind, bells[0].route, bells[0].subject_type, bells[0].subject_id], [w.T, "number", "admin/setup", "line", lineId]);
  assert.equal(bells[0].title, "Forwarding works: calls to +1 (646) 932-5775 reach your receptionist");
  const verified = kind(w.tables, "line.forwarding_verified");
  assert.equal(verified.length, 1);
  assert.deepEqual([verified[0].tenant_id, verified[0].subject_type, verified[0].subject_id, verified[0].data], [w.T, "line", lineId, { from: CALLER, call_id: row.id }]);

  // The delivery row: what the provider sent and what the ingest did, as
  // counts and flags -- readable per call from /api/diag.
  const delivered = kind(w.tables, "webhook.delivery");
  assert.equal(delivered.length, 1);
  assert.deepEqual([delivered[0].tenant_id, delivered[0].category, delivered[0].subject_type, delivered[0].subject_id], [w.T, "ingest", "call", row.id]);
  assert.deepEqual(delivered[0].data, {
    provider: "retell", event: "call_started", call_status: "ongoing", status: "ongoing", agent_id_present: true,
    turns: null, tool_turns: null, transcript_chars: null, skipped: false,
    body_keys: ["event"],
    call_keys: ["call_id", "agent_id", "call_type", "direction", "from_number", "to_number", "call_status", "start_timestamp"],
  });
  assert.equal(w.tables.messages.length, 0, "no note before there is a summary");
  assert.deepEqual([w.tables.escalations.length, w.tables.conversations[0].paused_until], [0, null], "nothing for a person yet");
});

test("transcript_updated: pinned ongoing, routed through the call's own row when the agent id is missing, the turns read from the body's top level or from the words -- and the row keeps key names, never words", async () => {
  const w = world();
  const db = w.open();
  const id = w.callId("live");
  await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 30_000 }));
  const row = w.tables.calls[0];

  // Turn one: no call_status, no agent_id, and the structured turns beside
  // `call` rather than inside it -- the shape the fourth real call proved.
  const items = [
    { role: "agent", content: "Thank you for calling Harbor Moving!" },
    { role: "tool_call_invocation", tool_call_id: "t1", name: "check_availability", arguments: "{}" },
    { role: "tool_call_result", tool_call_id: "t1", content: "Tuesday 10:00 is open" },
    { role: "user", content: "Can I book Tuesday morning?" },
  ];
  const turn = await deliver("transcript_updated", { call_id: id }, { transcript_with_tool_calls: items });
  assert.equal(turn.status, 200);
  assert.equal(ingests(db).length, 2, "routed by the known call, not dropped before ingest");
  const a = ingests(db)[1].args;
  assert.equal(a.p_tenant_id, w.T);
  assert.equal(a.p_agent_id, null, "the payload carried none; the row's own agent id routed it");
  assert.equal(a.p_status, "ongoing", "a per-turn delivery without call_status is proof the call is IN PROGRESS; unpinned it would normalise to ended");
  assert.deepEqual(a.p_transcript_obj, [
    { role: "agent", content: "Thank you for calling Harbor Moving!" },
    { role: "user", content: "Can I book Tuesday morning?" },
  ], "the spoken turns, the tool items dropped");
  assert.equal(w.tables.calls.length, 1, "one row, enriched");
  assert.deepEqual([w.tables.calls[0].id, w.tables.calls[0].status], [row.id, "ongoing"]);

  const rows = kind(w.tables, "webhook.delivery");
  assert.equal(rows.length, 2);
  const d = rows[1].data;
  assert.deepEqual(
    [d.event, d.call_status, d.status, d.agent_id_present, d.turns, d.tool_turns, d.transcript_chars, d.skipped],
    ["transcript_updated", "ongoing", "ongoing", false, 2, 4, null, false],
  );
  assert.deepEqual(d.body_keys, ["event", "transcript_with_tool_calls"], "which keys rode at the top level");
  // The keys inside `call` are read after the status is pinned, so the pinned
  // status shows among them; the transcript fields copied in from the top
  // level do not.
  assert.deepEqual(d.call_keys, ["call_id", "call_status"]);
  assert.ok(!JSON.stringify(rows.map((r) => r.data)).includes("Harbor Moving"), "never the words");

  // Turn two: the words alone, as text at the top level. They still become turns.
  const text = "Agent: Tuesday at ten is open.\nUser: Book it, please.";
  const spoken = await deliver("transcript_updated", { call_id: id, agent_id: w.AGENT }, { transcript: text });
  assert.equal(spoken.status, 200);
  assert.deepEqual(ingests(db)[2].args.p_transcript_obj, [{ role: "agent", content: "Tuesday at ten is open." }, { role: "user", content: "Book it, please." }]);
  const last = kind(w.tables, "webhook.delivery")[2].data;
  assert.deepEqual([last.turns, last.tool_turns, last.transcript_chars, last.body_keys], [2, null, text.length, ["event", "transcript"]]);

  // Turn three: the structured turns under their own name at the top level,
  // and again no agent id. They ride as they are; there are no words to count.
  const structured = [{ role: "agent", content: "Booked for Tuesday at ten." }, { role: "user", content: "Thanks." }];
  const third = await deliver("transcript_updated", { call_id: id }, { transcript_object: structured });
  assert.equal(third.status, 200);
  assert.deepEqual(ingests(db)[3].args.p_transcript_obj, structured);
  const t3 = kind(w.tables, "webhook.delivery")[3].data;
  assert.deepEqual([t3.agent_id_present, t3.turns, t3.tool_turns, t3.transcript_chars, t3.body_keys], [false, 2, null, null, ["event", "transcript_object"]]);
  assert.deepEqual([w.tables.calls.length, w.tables.calls[0].status], [1, "ongoing"], "three turns, one row, still in progress");
});

test("call_ended: no note without a summary; the recording is copied on the webhook's budget into the private bucket; a stale replay is declined and writes nothing", async () => {
  const w = world();
  const db = w.open();
  const line = wire();
  try {
    const id = w.callId("ended");
    const url = `https://cdn.retell.test/recording/${id}.wav`;
    await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 130_000 }));
    const ended = await deliver("call_ended", w.call(id, {
      call_status: "ended", start_timestamp: NOW - 130_000, end_timestamp: NOW - 5_000, duration_ms: 125_000, disconnection_reason: "user_hangup",
      transcript: "Agent: Hello.\nUser: Hi.", transcript_object: [{ role: "agent", content: "Hello." }, { role: "user", content: "Hi." }], recording_url: url,
    }));
    assert.deepEqual([ended.status, await ended.json()], [200, { ok: true }]);
    assert.equal(w.tables.messages.length, 0, "a note written now would read 'No summary available.' forever: bodies are immutable");
    assert.deepEqual(ingests(db)[1].args.p_recording, { fetch_state: "pending" }, "the row learns there is a recording, never where the provider serves it from");

    // The copy: one bounded fetch of the provider's URL, the bytes into the
    // private bucket under the workspace, the row's recording settled.
    const fetched = line.to(url);
    assert.equal(fetched.length, 1);
    assert.ok(fetched[0].init?.signal instanceof AbortSignal, "bounded: the agent's delivery timeout is over this handler's head");
    assert.equal(fetched[0].budgetMs, WEBHOOK_COPY_TIMEOUT_MS, "on the webhook's budget, not the sweep's: the agent allows 20 s for the whole event and the upsert has spent some");
    assert.ok(WEBHOOK_COPY_TIMEOUT_MS < SWEEP_COPY_TIMEOUT_MS, `${WEBHOOK_COPY_TIMEOUT_MS} ms is the short one`);
    const row = w.tables.calls[0];
    const storagePath = `${w.T}/calls/${row.id}.wav`;
    assert.deepEqual(w.uploads, [{ bucket: "media", path: storagePath, bytes: 4, contentType: "audio/wav", upsert: true }]);
    assert.deepEqual(row.recording, { fetch_state: "stored", attempts: 1, storage_path: storagePath, mime: "audio/wav", bytes: 4 });
    assert.equal(row.status, "ended");
    assert.deepEqual(kind(w.tables, "webhook.delivery").at(-1).data.skipped, false);

    // A retried call_started arrives after the end: older than the row, so the
    // ingest declines it. The delivery row says so and nothing else moves.
    const events = w.tables.events.length;
    const stale = await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 130_000, recording_url: url }));
    assert.deepEqual([stale.status, await stale.json()], [200, { ok: true }]);
    const last = kind(w.tables, "webhook.delivery").at(-1).data;
    assert.deepEqual([last.event, last.status, last.skipped], ["call_started", "ongoing", true]);
    assert.equal(w.tables.calls[0].status, "ended", "the row did not go backwards");
    assert.equal(line.to(url).length, 1, "a stored copy is never fetched again");
    assert.equal(w.uploads.length, 1);
    assert.equal(w.tables.events.length, events + 2, "its auth row and its delivery row, nothing more");
    assert.equal(line.mail().length, 0, "nobody is mailed about a call that has not been analysed");
  } finally {
    line.restore();
  }
});

test("the note waits for the SUMMARY, not for the analysis: a call_ended that already carries one is noted and linked, and so is a call that reached voicemail -- and neither rings the bell", async () => {
  // The condition has three doors: call_analyzed, a summary already on the
  // call, or voicemail. The call_ended case above proves the plain one stays
  // shut; these two prove the other two open, each in its own world.
  const line = wire();
  try {
    // A provider that attaches its analysis to the end-of-call delivery, or a
    // call_ended replayed after the analysis: the summary is here, so the line
    // is written now rather than left to the reconcile sweep.
    const w = world();
    const db = w.open();
    const id = w.callId("ended-with-summary");
    const ended = await deliver("call_ended", w.call(id, {
      call_status: "ended", start_timestamp: NOW - 130_000, end_timestamp: NOW - 5_000, duration_ms: 125_000, disconnection_reason: "user_hangup",
      transcript: "Agent: Hello.\nUser: Is Saturday open?", transcript_object: [{ role: "agent", content: "Hello." }, { role: "user", content: "Is Saturday open?" }],
      call_analysis: { call_summary: "Rosa asked whether Saturday is open.", user_sentiment: "Neutral" },
    }));
    assert.deepEqual([ended.status, await ended.json()], [200, { ok: true }]);
    assert.equal(ingests(db)[0].args.p_summary, "Rosa asked whether Saturday is open.");
    const call = w.tables.calls[0];
    const notes = w.tables.messages;
    assert.equal(notes.length, 1, "the summary exists, so the note is written now, on call_ended");
    assert.deepEqual(
      [notes[0].type, notes[0].conversation_id, notes[0].contact_id, notes[0].external_id, notes[0].channel_ts, notes[0].body],
      ["call_summary", call.conversation_id, call.contact_id, `call:${id}`, iso(NOW - 130_000), "Inbound call · 2 min — Rosa asked whether Saturday is open."],
    );
    assert.equal(call.message_id, notes[0].id, "linked");
    assert.deepEqual([call.notified_at, w.tables.notifications.length, line.mail().length], [null, 0, 0], "the note is not the news: the owner is told on the analysis");

    // The analysis follows. Bodies are immutable, so the line written at the
    // end of the call stands -- the analysis's own words go to the owner, not
    // into the thread -- and the bell rings once, now. Postgres holds the
    // note's unique key; the double runs over the refusal it would give.
    w.open({ "messages.insert": DUPLICATE("messages_tenant_external") });
    const analysed = await deliver("call_analyzed", w.analysed(id, {
      call_analysis: {
        call_summary: "Rosa asked whether Saturday is open.", user_sentiment: "Neutral", call_successful: true, in_voicemail: false,
        custom_analysis_data: { caller_name: "Rosa", caller_wanted: "to know whether Saturday is open", outcome: "answered", follow_up: "" },
      },
    }));
    assert.deepEqual([analysed.status, await analysed.json()], [200, { ok: true }]);
    assert.equal(w.tables.messages.length, 1, "one line per call");
    assert.equal(w.tables.messages[0].body, "Inbound call · 2 min — Rosa asked whether Saturday is open.", "immutable: not rewritten in the analysis's words");
    assert.equal(w.tables.calls[0].message_id, notes[0].id, "the link still points at the early line");
    assert.deepEqual([w.tables.notifications.length, line.mail().length], [1, 1]);
    assert.equal(w.tables.notifications[0].title, "Rosa phoned · 2 min");

    // Voicemail, with nothing to summarise: the caller's thread still learns
    // the call happened, in the one line there is to write.
    const v = world();
    const vdb = v.open();
    const vid = v.callId("voicemail");
    const vm = await deliver("call_ended", v.call(vid, {
      call_status: "ended", start_timestamp: NOW - 50_000, end_timestamp: NOW - 8_000, duration_ms: 42_000, disconnection_reason: "voicemail_reached",
      call_analysis: { in_voicemail: true },
    }));
    assert.deepEqual([vm.status, await vm.json()], [200, { ok: true }]);
    assert.deepEqual([ingests(vdb)[0].args.p_in_voicemail, ingests(vdb)[0].args.p_summary], [true, null]);
    const vcall = v.tables.calls[0];
    const vnotes = v.tables.messages;
    assert.equal(vnotes.length, 1, "voicemail opens the note too");
    assert.deepEqual(
      [vnotes[0].type, vnotes[0].conversation_id, vnotes[0].external_id, vnotes[0].body],
      ["call_summary", vcall.conversation_id, `call:${vid}`, "Inbound call · 1 min — Reached voicemail."],
    );
    assert.equal(vcall.message_id, vnotes[0].id, "linked");
    assert.deepEqual([vcall.notified_at, v.tables.notifications.length, line.mail().length], [null, 0, 1], "no bell for a voicemail at the end of the call; the one mail is Rosa's, above");
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- the analysis */

test("call_analyzed: the note lands in the caller's thread and the call links to it, the analysis rides the normalised call, the owner is told once -- a bell row about the call, and mail to the mailbox that is theirs", async () => {
  const w = world();
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } });
  const db = w.open();
  const line = wire();
  try {
    const id = w.callId("analysed");
    const url = `https://cdn.retell.test/recording/${id}.wav`;
    const res = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);

    const a = ingests(db)[0].args;
    assert.deepEqual(a.p_analysis, { caller_name: "Rosa", caller_wanted: "a quote for a move on Tuesday", outcome: "answered", follow_up: "" }, "the analysis rides the normalised call; the door files it as columns");
    assert.deepEqual([a.p_summary, a.p_sentiment, a.p_successful, a.p_in_voicemail, a.p_duration_ms, a.p_ended_at], ["Rosa asked for a moving quote for Tuesday.", "Positive", true, false, 125_000, iso(NOW - 5_000)]);

    // The note: one call_summary message in the caller's thread, keyed on the call, and the row points at it.
    const call = w.tables.calls[0];
    const notes = w.tables.messages;
    assert.equal(notes.length, 1);
    assert.deepEqual(
      [notes[0].tenant_id, notes[0].conversation_id, notes[0].contact_id, notes[0].channel, notes[0].direction, notes[0].sender, notes[0].type, notes[0].external_id, notes[0].channel_ts, notes[0].status],
      [w.T, call.conversation_id, call.contact_id, "voice", "inbound", "system", "call_summary", `call:${id}`, iso(NOW - 130_000), "received"],
    );
    assert.equal(notes[0].body, "Inbound call · 2 min — a quote for a move on Tuesday (question answered)", "what the caller wanted, in the analysis's words, is the line the receptionist reads back");
    assert.equal(call.message_id, notes[0].id, "linked");
    assert.ok(call.notified_at, "the one-time side effects are claimed on the row");

    // The bell: the workspace's own row, about the call, in the owner's words.
    const bells = w.tables.notifications;
    assert.equal(bells.length, 1);
    assert.deepEqual([bells[0].tenant_id, bells[0].kind, bells[0].route, bells[0].subject_type, bells[0].subject_id], [w.T, "call", "conversations/phone", "call", call.id]);
    assert.equal(bells[0].title, "Rosa phoned · 2 min");
    assert.ok(bells[0].body.startsWith("They wanted: a quote for a move on Tuesday.\nOutcome: Question answered.\n"));

    // The mail: to the mailbox the tenant configured, from the platform's
    // sender, the transcript inside, on the key this deployment holds.
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.deepEqual([mail[0].to, mail[0].from, mail[0].subject], [["owner@harbor.test"], "Pager <pager@platform.test>", "Rosa phoned · 2 min"]);
    assert.ok(mail[0].text.includes(`\nFrom ${CALLER} · 125s · sentiment Positive · ended: user_hangup\n`));
    assert.ok(mail[0].text.includes("\nSummary:\nRosa asked for a moving quote for Tuesday.\n"));
    assert.ok(mail[0].text.endsWith("Transcript:\nAgent: Thank you for calling Harbor Moving!\nUser: I need a quote for a move on Tuesday."));
    assert.equal(line.to("api.resend.com")[0].init.headers.Authorization, "Bearer re_test_only");

    // The recording is copied here too: the analysis is the end of the call.
    assert.equal(line.to(url).length, 1);
    assert.equal(w.tables.calls[0].recording.fetch_state, "stored");

    // Retell retries a slow delivery inside the signature window. Postgres
    // holds the note's unique key; the double does not, so the replay runs
    // over the refusal Postgres would give -- and the claim on the row makes
    // everything after the note a no-op.
    w.open({ "messages.insert": DUPLICATE("messages_tenant_external") });
    const again = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([again.status, await again.json()], [200, { ok: true, duplicate: true }]);
    assert.equal(w.tables.messages.length, 1, "the line stands");
    assert.equal(w.tables.calls[0].message_id, notes[0].id, "and the link still points at it");
    assert.equal(w.tables.notifications.length, 1, "told once");
    assert.equal(line.mail().length, 1, "mailed once");
    assert.equal(line.to(url).length, 1, "a stored recording is not fetched again");
    assert.equal(kind(w.tables, "webhook.delivery").length, 2, "both deliveries are on record");
  } finally {
    line.restore();
  }
});

test("callback_needed: the thread is paused for the workspace's own hours, one callback escalation opens with the to-do, the bell is about the thread, the mail says so -- and a replay refreshes rather than stacks", async () => {
  const w = world();
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } });
  w.tables.policies.push({ tenant_id: w.T, class: "reply", mode: "auto", limits: { pause_hours: 6 }, subject_type: null, subject_id: null });
  w.open();
  const line = wire();
  try {
    const id = w.callId("callback");
    const analysis = (follow_up) => ({
      call_summary: "Rosa needs someone to call her back about a piano.", user_sentiment: "Neutral", call_successful: false, in_voicemail: false,
      custom_analysis_data: { caller_name: "Rosa", caller_wanted: "to move a piano on Saturday", outcome: "callback_needed", follow_up },
    });
    const before = Date.now();
    const res = await deliver("call_analyzed", w.analysed(id, { call_analysis: analysis("Call Rosa back about the piano move on Saturday.") }));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);

    const call = w.tables.calls[0];
    const thread = w.tables.conversations.find((c) => c.id === call.conversation_id);
    assert.equal(thread.state, "needs_human", "on Needs you");
    const pausedFor = Date.parse(thread.paused_until) - before;
    assert.ok(pausedFor > 6 * 3_600_000 - 5_000 && pausedFor <= 6 * 3_600_000 + 5_000, `paused for the workspace's six hours, not the default twenty-four: ${pausedFor} ms`);

    const esc = w.tables.escalations;
    assert.equal(esc.length, 1);
    assert.deepEqual([esc[0].tenant_id, esc[0].conversation_id, esc[0].reason, esc[0].details], [w.T, thread.id, "callback", "Call Rosa back about the piano move on Saturday."], "the to-do first; the request only when there is none");

    const bell = w.tables.notifications[0];
    assert.deepEqual([bell.kind, bell.subject_type, bell.subject_id], ["call", "conversation", thread.id], "about the thread, which is where the work is");
    assert.equal(bell.title, "Rosa phoned · 2 min · needs a call back");
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.equal(mail[0].subject, "Rosa phoned · 2 min · needs a call back");
    assert.ok(mail[0].text.startsWith("They wanted: to move a piano on Saturday.\nOutcome: Needs a call back.\nTo do: Call Rosa back about the piano move on Saturday.\n"));

    // Postgres keeps one OPEN escalation per thread (escalations_one_open) and
    // one note per call; the double keeps neither, so the replay runs over the
    // refusals Postgres would give, and the row the double made gets the
    // column default it would have had.
    esc[0].state = "open";
    w.open({ "escalations.insert": DUPLICATE("escalations_one_open"), "messages.insert": DUPLICATE("messages_tenant_external") });
    const again = await deliver("call_analyzed", w.analysed(id, { call_analysis: analysis("Call Rosa back today about the piano.") }));
    assert.deepEqual([again.status, await again.json()], [200, { ok: true, duplicate: true }]);
    assert.equal(w.tables.escalations.length, 1, "refreshed, not stacked");
    assert.deepEqual([w.tables.escalations[0].reason, w.tables.escalations[0].details], ["callback", "Call Rosa back today about the piano."], "what the owner reads is the latest word");
    assert.equal(w.tables.notifications.length, 1, "told once");
    assert.equal(line.mail().length, 1);
    assert.equal(w.tables.messages.length, 1);

    // The to-do's fallbacks. With no follow_up -- blank, or only whitespace --
    // the request is what the owner reads; with neither, the escalation still
    // says what to do. Two more callers, so each opens its own thread's one
    // escalation instead of refreshing Rosa's.
    w.open();
    const wanted = w.callId("callback-wanted");
    const bare = w.callId("callback-bare");
    assert.equal((await deliver("call_analyzed", w.analysed(wanted, { from_number: "+16465550124", call_analysis: analysis("   ") }))).status, 200);
    assert.equal((await deliver("call_analyzed", w.analysed(bare, {
      from_number: "+16465550125",
      call_analysis: { ...analysis(""), custom_analysis_data: { caller_name: "Rosa", outcome: "callback_needed", caller_wanted: " ", follow_up: "" } },
    }))).status, 200);

    // The to-do's bound. escalations.details is unbounded text and the Inbox
    // shows it whole, so the handler cuts the to-do at 400 characters -- the
    // only bound there is. The mail, read in a client made for long text,
    // carries every word. A fourth caller, whose analysis ran long.
    const long = "Call Rosa back about the piano move on Saturday: confirm the stairs at both ends, book the freight elevator with the building, and quote the crating for the upright. ".repeat(3).trim();
    assert.ok(long.length > 400, `${long.length} characters: past the bound`);
    const wordy = w.callId("callback-wordy");
    assert.equal((await deliver("call_analyzed", w.analysed(wordy, { from_number: "+16465550126", call_analysis: analysis(long) }))).status, 200);

    const escalationsFor = (retellCallId) => {
      const c = w.tables.calls.find((x) => x.retell_call_id === retellCallId);
      return w.tables.escalations.filter((e) => e.conversation_id === c.conversation_id).map((e) => [e.reason, e.details]);
    };
    assert.equal(w.tables.escalations.length, 4, "four callers, four threads, one escalation each");
    assert.deepEqual(escalationsFor(wanted), [["callback", "to move a piano on Saturday"]], "no to-do: the request is the to-do, trimmed");
    assert.deepEqual(escalationsFor(bare), [["callback", "The caller needs a call back."]], "neither: the owner is still told what to do");
    assert.deepEqual(escalationsFor(wordy), [["callback", long.slice(0, 400)]], "cut at 400 characters: the bound on what the Inbox shows");
    assert.equal(escalationsFor(wordy)[0][1].length, 400);
    const mails = line.mail();
    assert.equal(mails.length, 4);
    assert.ok(mails[1].text.startsWith("They wanted: to move a piano on Saturday.\nOutcome: Needs a call back.\n\nFrom +16465550124 ·"), "the request and the outcome; no To do line without a to-do");
    assert.ok(mails[2].text.startsWith("Rosa needs someone to call her back about a piano.\nOutcome: Needs a call back.\n\nFrom +16465550125 ·"), "no request either: the summary leads");
    assert.ok(mails[3].text.includes(`\nTo do: ${long}\n`), "the mail carries the whole to-do; only the escalation is cut");
  } finally {
    line.restore();
  }
});

test("callback_needed in a workspace with no reply policy of its own: the thread is paused for the default day", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    assert.equal(w.tables.policies.length, 0, "no policies row: nothing to read pause_hours from");
    const before = Date.now();
    const res = await deliver("call_analyzed", w.analysed(w.callId("callback-default"), {
      call_analysis: {
        call_summary: "Rosa needs someone to call her back about a piano.", user_sentiment: "Neutral", call_successful: false, in_voicemail: false,
        custom_analysis_data: { caller_name: "Rosa", caller_wanted: "to move a piano on Saturday", outcome: "callback_needed", follow_up: "Call Rosa back." },
      },
    }));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    const thread = w.tables.conversations.find((c) => c.id === w.tables.calls[0].conversation_id);
    assert.equal(thread.state, "needs_human");
    const pausedFor = Date.parse(thread.paused_until) - before;
    assert.ok(pausedFor > 24 * 3_600_000 - 5_000 && pausedFor <= 24 * 3_600_000 + 5_000, `a day, the default the workspace never overrode: ${pausedFor} ms`);
    assert.deepEqual(w.tables.escalations.map((e) => [e.conversation_id, e.reason, e.details]), [[thread.id, "callback", "Call Rosa back."]]);
    assert.equal(w.tables.notifications[0].title, "Rosa phoned · 2 min · needs a call back");
  } finally {
    line.restore();
  }
});

test("a workspace with no mailbox still gets its bell row; the platform is told a workspace needs settings, and the caller's words never travel to a stranger", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    const res = await deliver("call_analyzed", w.analysed(w.callId("unaddressed")));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    const bells = w.tables.notifications;
    assert.equal(bells.length, 1);
    assert.deepEqual([bells[0].tenant_id, bells[0].kind], [w.T, "call"]);
    assert.ok(bells[0].body.includes("Transcript:\nAgent: Thank you for calling Harbor Moving!"), "the workspace's own row carries the whole message: it is theirs under RLS");
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.deepEqual([mail[0].to, mail[0].subject], [["ops@platform.test"], "A workspace needs notification settings"]);
    assert.ok(mail[0].text.startsWith("A voice call was handled for a workspace (125s). The summary and transcript were withheld.\n"));
    assert.ok(mail[0].text.includes(`Workspace: ${w.T}`));
    for (const word of ["Rosa", CALLER, "Harbor Moving", "quote", "Tuesday"]) assert.ok(!mail[0].text.includes(word), `${word} stayed home`);
  } finally {
    line.restore();
  }
});

test("with the store retired, the call_summary row IS the note: nothing reaches Blob, even with a Blob token in the environment", async () => {
  // HALF A PROOF, ON PURPOSE. With the flag off the store library itself
  // answers every read "unknown" and refuses every write before any Blob call
  // is made, so "nothing reached Blob" here is the library's doing and says
  // nothing about the handler's own `storeBackend() !== "off"` guard: an
  // inverted guard passes this case. The other half runs in
  // retell-webhook-store-on.test.mjs, in a process where the store is LIVE
  // and the note must appear in the caller's thread. The pair pins the guard;
  // either alone does not.
  assert.equal(store.storeBackend(), "off", "BLOB_SHADOW=off, read at import: the flag this handler runs under");
  const w = world();
  w.open();
  const line = wire();
  try {
    const res = await deliver("call_analyzed", w.analysed(w.callId("store")));
    assert.equal(res.status, 200);
    assert.equal(w.tables.messages.filter((m) => m.type === "call_summary").length, 1);
    assert.equal(w.tables.calls[0].message_id, w.tables.messages[0].id);
    const hosts = line.calls.map((c) => new URL(c.url).host);
    assert.deepEqual([...new Set(hosts)].sort(), ["api.resend.com", "cdn.retell.test"], "only the recording copy and the mail left the handler; nothing for Blob");
  } finally {
    line.restore();
  }
});

test("a price spoken aloud: the owner is told (policy_block), and the live call is corrected once through the provider -- worked into the next answer, never read out", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    const id = w.callId("price");
    await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 20_000 }));
    const turns = [
      { role: "agent", content: "Thanks for calling Harbor Moving!" },
      { role: "user", content: "How much for a one-bedroom?" },
      { role: "agent", content: "A one-bedroom is usually $450." },
    ];
    const first = await deliver("transcript_updated", w.call(id, { call_status: "ongoing", transcript_with_tool_calls: turns }));
    assert.equal(first.status, 200);
    const esc = w.tables.escalations;
    assert.equal(esc.length, 1);
    assert.deepEqual([esc[0].tenant_id, esc[0].conversation_id, esc[0].reason], [w.T, w.tables.calls[0].conversation_id, "policy_block"]);
    assert.ok(esc[0].details.includes('It said: "A one-bedroom is usually $450."'), "the words are the owner's to read in the Inbox");
    const patched = line.to("api.retellai.com/v2/update-live-call/");
    assert.equal(patched.length, 1);
    assert.ok(patched[0].url.endsWith(`/v2/update-live-call/${id}`));
    assert.deepEqual([patched[0].init.method, patched[0].init.headers.Authorization], ["PATCH", "Bearer api-key-for-this-file"]);
    assert.deepEqual(JSON.parse(patched[0].init.body), { call_control: { additional_context: frameGuardrail("price"), trigger_response: false } });

    // The next turn still carries the breach: the receptionist is told once
    // per instance, and the owner's one open escalation is refreshed.
    esc[0].state = "open";
    w.open({ "escalations.insert": DUPLICATE("escalations_one_open") });
    const second = await deliver("transcript_updated", w.call(id, { call_status: "ongoing", transcript_with_tool_calls: [...turns, { role: "user", content: "OK." }] }));
    assert.equal(second.status, 200);
    assert.equal(line.to("update-live-call").length, 1, "corrected once, not on every remaining turn");
    assert.equal(w.tables.escalations.length, 1, "one open escalation");
    assert.equal(w.tables.notifications.length, 0, "the escalation is the owner's word; no bell rings mid-call");
  } finally {
    line.restore();
  }
});

test("an ingest the database refuses is a 500, so the provider retries: nothing downstream happens, and the retry lands", async () => {
  const w = world();
  const line = wire();
  try {
    const id = w.callId("refused");
    w.open({}, { ingest_call: () => { throw new Error("permission denied for function ingest_call"); } });
    const res = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([res.status, await res.json()], [500, { ok: false, error: "ingest_failed" }]);
    assert.deepEqual([w.tables.calls.length, w.tables.messages.length, w.tables.notifications.length, w.tables.escalations.length], [0, 0, 0, 0]);
    assert.equal(line.mail().length, 0, "no email about a call that was not written");
    assert.equal(kind(w.tables, "webhook.delivery").length, 0, "no delivery row: the ingest never answered");
    assert.equal(kind(w.tables, "webhook.auth").length, 1, "the door's own row is the one thing on record");

    // Retell's retry, with the database well: the same delivery does it all.
    w.open();
    const retry = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([retry.status, await retry.json()], [200, { ok: true }]);
    assert.deepEqual([w.tables.calls.length, w.tables.messages.length, w.tables.notifications.length], [1, 1, 1]);
    assert.equal(kind(w.tables, "webhook.delivery").length, 1);
  } finally {
    line.restore();
  }
});
