/**
 * callback_needed on call_ended, a price spoken aloud corrected once and told to the owner, and the failures that
 * send a delivery back instead of dropping it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameGuardrail, hashLegacyErasedPhone } from "@chanlytics/contracts";
import { openDoor, wire, kind, ingests, DUPLICATE, CALLER, NOW, iso } from "../_retell-webhook-world.mjs";
import { deliver, setPg, world } from "./_retell-door.mjs";

test("callback_needed on call_ended: the thread is there and the analysis says so, and still no escalation opens, nothing is paused and no bell rings -- the same delivery as call_analyzed does all three", async () => {
  // The callback branch has three clauses: the event is the analysis, the
  // caller has a thread, the outcome is callback_needed. The two cases above
  // prove it fires when all three hold. This is the first clause on its own:
  // a provider that attaches its analysis to the end-of-call delivery, or a
  // call_ended replayed after the analysis, carries the outcome AND the
  // thread -- and must not hand the caller to a person yet. The analysis is
  // the one delivery that does, so a person is told once, from there.
  const w = world();
  const db = w.open();
  const line = wire();
  try {
    const id = w.callId("callback-on-ended");
    const call_analysis = {
      call_summary: "Rosa needs someone to call her back about a piano.",
      user_sentiment: "Neutral",
      call_successful: false,
      in_voicemail: false,
      custom_analysis_data: {
        caller_name: "Rosa",
        caller_wanted: "to move a piano on Saturday",
        outcome: "callback_needed",
        follow_up: "Call Rosa back about the piano.",
      },
    };
    // The very call object the analysis will carry, under the end-of-call event.
    const ended = await deliver("call_ended", w.analysed(id, { call_analysis }));
    assert.deepEqual([ended.status, await ended.json()], [200, { ok: true }]);

    // The other two clauses hold, on the record: the caller's thread exists
    // and the outcome rode the delivery into the ingest. Only the event differs.
    const call = w.tables.calls[0];
    const thread = () => w.tables.conversations.find((c) => c.id === call.conversation_id);
    assert.ok(call.conversation_id && thread(), "a thread to land on");
    assert.equal(ingests(db)[0].args.p_analysis.outcome, "callback_needed", "the analysis rode the delivery");
    assert.equal(
      w.tables.messages.length,
      1,
      "processed, not dropped: the summary is here, so the note is written now",
    );

    // And the branch stayed shut.
    assert.deepEqual(
      [thread().state, thread().paused_until],
      ["open", null],
      "the receptionist keeps the thread; nothing on Needs you",
    );
    assert.equal(w.tables.escalations.length, 0, "no callback escalation");
    assert.equal(w.tables.notifications.length, 0, "no bell -- 'needs a call back' or any other");
    assert.equal(line.mail().length, 0);

    // The same words, as the analysis: the thread is paused and on Needs you,
    // the one escalation opens with the to-do, the bell is about the thread.
    // Postgres holds the note's unique key; the double runs over the refusal.
    w.open({ "messages.insert": DUPLICATE("messages_tenant_external_uq") });
    const before = Date.now();
    const analysed = await deliver("call_analyzed", w.analysed(id, { call_analysis }));
    assert.deepEqual([analysed.status, await analysed.json()], [200, { ok: true }]);
    assert.equal(thread().state, "needs_human");
    assert.ok(Date.parse(thread().paused_until) > before, "paused, from now");
    assert.deepEqual(
      w.tables.escalations.map((e) => [e.conversation_id, e.reason, e.details]),
      [[call.conversation_id, "callback", "Call Rosa back about the piano."]],
    );
    assert.equal(w.tables.notifications.length, 1);
    const bell = w.tables.notifications[0];
    assert.deepEqual(
      [bell.kind, bell.subject_type, bell.subject_id, bell.title],
      ["call", "conversation", call.conversation_id, "Rosa phoned · 2 min · needs a call back"],
    );
    assert.equal(line.mail().length, 1);
    assert.equal(w.tables.messages.length, 1, "one line per call, still");
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
    assert.ok(
      bells[0].body.includes("Transcript:\nAgent: Thank you for calling Harbor Moving!"),
      "the workspace's own row carries the whole message: it is theirs under RLS",
    );
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.deepEqual([mail[0].to, mail[0].subject], [["ops@platform.test"], "A workspace needs notification settings"]);
    assert.ok(
      mail[0].text.startsWith(
        "A voice call was handled for a workspace (125s). The summary and transcript were withheld.\n",
      ),
    );
    assert.ok(mail[0].text.includes(`Workspace: ${w.T}`));
    for (const word of ["Rosa", CALLER, "Harbor Moving", "quote", "Tuesday"])
      assert.ok(!mail[0].text.includes(word), `${word} stayed home`);
  } finally {
    line.restore();
  }
});

test("the call_summary row IS the note: the call lands on the thread, and nothing else leaves the handler", async () => {
  // The caller's cross-channel memory is this row and nothing else. The
  // handler used to write a second copy into a Vercel Blob thread so the
  // pre-Postgres receptionist kept its voice context; both are gone, and what
  // leaves the handler says so -- the recording copy and the summary mail,
  // and no third destination.
  const w = world();
  w.open();
  const line = wire();
  try {
    const res = await deliver("call_analyzed", w.analysed(w.callId("store")));
    assert.equal(res.status, 200);
    assert.equal(w.tables.messages.filter((m) => m.type === "call_summary").length, 1);
    assert.equal(w.tables.calls[0].message_id, w.tables.messages[0].id);
    const hosts = line.calls.map((c) => new URL(c.url).host);
    assert.deepEqual(
      [...new Set(hosts)].sort(),
      ["api.resend.com", "cdn.retell.test"],
      "only the recording copy and the mail left the handler",
    );
  } finally {
    line.restore();
  }
});

test("a price spoken aloud: the owner is told (policy_block), and the live call is corrected once through the provider -- worked into the next answer, never read out", async () => {
  const w = world();
  // A receptionist with no booking link (one that quotes each job), so the correction takes the details: the webhook
  // reads this workspace's own answer, where no config at all, or a hard-coded answer, would offer the link.
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: {
      brain: {
        business_name: "Harbor Moving",
        system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
        fallbacks: { greeting: "g", error: "e", non_text: "n" },
      },
    },
  });
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
    const first = await deliver(
      "transcript_updated",
      w.call(id, { call_status: "ongoing", transcript_with_tool_calls: turns }),
    );
    assert.equal(first.status, 200);
    const esc = w.tables.escalations;
    assert.equal(esc.length, 1);
    assert.deepEqual(
      [esc[0].tenant_id, esc[0].conversation_id, esc[0].reason],
      [w.T, w.tables.calls[0].conversation_id, "policy_block"],
    );
    assert.ok(
      esc[0].details.includes('It said: "A one-bedroom is usually $450."'),
      "the words are the owner's to read in the Inbox",
    );
    const patched = line.to("api.retellai.com/v2/update-live-call/");
    assert.equal(patched.length, 1);
    assert.ok(patched[0].url.endsWith(`/v2/update-live-call/${id}`));
    assert.deepEqual(
      [patched[0].init.method, patched[0].init.headers.Authorization],
      ["PATCH", "Bearer api-key-for-this-file"],
    );
    assert.deepEqual(JSON.parse(patched[0].init.body), {
      call_control: { additional_context: frameGuardrail("price", { hasBookingLink: false }), trigger_response: false },
    });

    // The next turn still carries the breach: the receptionist is told once
    // per instance, and the owner's one open escalation is refreshed.
    esc[0].state = "open";
    w.open({ "escalations.insert": DUPLICATE("escalations_one_open") });
    const second = await deliver(
      "transcript_updated",
      w.call(id, { call_status: "ongoing", transcript_with_tool_calls: [...turns, { role: "user", content: "OK." }] }),
    );
    assert.equal(second.status, 200);
    assert.equal(line.to("update-live-call").length, 1, "corrected once, not on every remaining turn");
    assert.equal(w.tables.escalations.length, 1, "one open escalation");
    assert.equal(w.tables.notifications.length, 0, "the escalation is the owner's word; no bell rings mid-call");
  } finally {
    line.restore();
  }
});

test("a price the owner wrote, with Never quote a price off, is no breach on a call; one they did not write still is (decision 0051)", async () => {
  const w = world();
  // The switch off, a price written in a service's box, and details that compose a prompt (the hours).
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: {
      brain: {
        business_name: "Harbor Moving",
        system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
        fallbacks: { greeting: "g", error: "e", non_text: "n" },
        profile: {
          hours: { mon: { open: "09:00", close: "17:00" } },
          services: [{ name: "One-bedroom move", price_note: "$450" }],
          guardrails: { never_quote_prices: false },
        },
      },
    },
  });
  w.open();
  const line = wire();
  try {
    const id = w.callId("listed");
    await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 20_000 }));
    const turns = [
      { role: "agent", content: "Thanks for calling Harbor Moving!" },
      { role: "user", content: "How much for a one-bedroom?" },
      { role: "agent", content: "A one-bedroom move is $450." },
    ];
    const listed = await deliver(
      "transcript_updated",
      w.call(id, { call_status: "ongoing", transcript_with_tool_calls: turns }),
    );
    assert.equal(listed.status, 200);
    assert.equal(w.tables.escalations.length, 0, "the owner's own price: nothing to tell them");
    assert.equal(line.to("update-live-call").length, 0, "and nothing to correct");
    const invented = await deliver(
      "transcript_updated",
      w.call(id, {
        call_status: "ongoing",
        transcript_with_tool_calls: [
          ...turns,
          { role: "user", content: "And a two-bedroom?" },
          { role: "agent", content: "A two-bedroom is about $700." },
        ],
      }),
    );
    assert.equal(invented.status, 200);
    assert.equal(w.tables.escalations.length, 1, "a price nobody wrote is still the owner's to hear about");
    assert.equal(w.tables.escalations[0].reason, "policy_block");
    assert.ok(w.tables.escalations[0].details.includes('It said: "A two-bedroom is about $700."'));
  } finally {
    line.restore();
  }
});

test("an ingest the database refuses is a 503, so the provider retries: nothing downstream happens, and the retry lands", async () => {
  const w = world();
  const line = wire();
  try {
    const id = w.callId("refused");
    w.open(
      {},
      {
        ingest_call: () => {
          throw new Error("permission denied for function ingest_call");
        },
      },
    );
    const res = await deliver("call_analyzed", w.analysed(id));
    // 503, as the WhatsApp and SMS doors answer a write the database refused:
    // "try again", and Retell does, up to three times.
    assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "ingest_failed" }]);
    assert.deepEqual(
      [w.tables.calls.length, w.tables.messages.length, w.tables.notifications.length, w.tables.escalations.length],
      [0, 0, 0, 0],
    );
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

test("REGRESSION: an erasure check that could not be MADE sends the delivery back, rather than reading as 'nobody asked to be forgotten'", async () => {
  // A call that began before its caller asked to be erased belongs to that
  // erasure. The check was caught to false, so a database that could not answer
  // read as "nobody" and the call's data remade the person -- a contact, a
  // thread, a summary on it and an email to the owner about them. The comment
  // above it promised a late sweep to catch that; no such sweep exists.
  //
  // 503 instead: Retell redelivers, so a blip costs a retry and not a person.
  const { deliver, world } = await openDoor();
  const w = world();
  w.open({ "contacts.select": { message: "statement timeout" } });
  const res = await deliver("call_ended", w.analysed(w.callId("erasure_unreadable")));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, error: "erasure_unreadable" });
  assert.deepEqual(
    [w.tables.calls, w.tables.contacts, w.tables.messages],
    [[], [], []],
    "nothing was written about a person we could not check",
  );
});

/* ------------------------------------------- a blip is a retry, not a loss */

test("REGRESSION: a channel row that could not be READ is a 503, not 'nobody's agent': no dead letter, nothing written, and the provider's retry lands once", async () => {
  // resolveChannel folded "the database did not answer" into "no active
  // channel", so a blip on tenant_channels dead-lettered the call under the
  // platform and answered 200 -- and Retell, told the delivery had succeeded,
  // never sent it again. The WhatsApp and SMS doors answer 503 here; this one
  // now does too, and Retell retries a non-2xx up to three times.
  const w = world();
  const line = wire();
  try {
    const id = w.callId("channel_unreadable");
    const down = w.open({ "tenant_channels.select": { message: "connection reset" } });
    const res = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "routing_unreadable" }]);
    assert.equal(ingests(down).length, 0, "nothing reached ingest_call");
    assert.deepEqual(
      [w.tables.calls, w.tables.contacts, w.tables.messages, w.tables.notifications, w.tables.escalations],
      [[], [], [], [], []],
      "nothing was written",
    );
    assert.equal(kind(w.tables, "ingest.unroutable").length, 0, "a blip is not a dead letter");
    assert.equal(kind(w.tables, "webhook.delivery").length, 0, "no delivery row: nothing was decided");
    assert.equal(line.mail().length, 0, "nobody is mailed about a call that was not placed");
    assert.deepEqual(
      w.tables.provider_events.map((r) => [r.provider, r.provider_event_id, r.door, r.tenant_id]),
      [["retell", `call_analyzed:${id}`, "/api/retell-webhook", null]],
      "the delivery is kept, under no workspace, for the replay after a fix (00336)",
    );

    // Retell's retry, with the database well: the same delivery does it all.
    const well = w.open();
    const retry = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([retry.status, await retry.json()], [200, { ok: true }]);
    assert.equal(ingests(well).length, 1);
    assert.deepEqual(
      [w.tables.calls.length, w.tables.messages.length, w.tables.notifications.length, line.mail().length],
      [1, 1, 1, 1],
    );

    // A retry of the retry (the first one was slow): the row is the gate, so
    // the third delivery of one event converges on the same row, note, bell
    // and mail. Postgres holds the note's unique key; the double does not.
    w.open({ "messages.insert": DUPLICATE("messages_tenant_external_uq") });
    const again = await deliver("call_analyzed", w.analysed(id));
    assert.deepEqual([again.status, await again.json()], [200, { ok: true, duplicate: true }]);
    assert.deepEqual(
      [w.tables.calls.length, w.tables.messages.length, w.tables.notifications.length, line.mail().length],
      [1, 1, 1, 1],
      "delivered three times: one row, one note, one bell, one mail",
    );
  } finally {
    line.restore();
  }
});

test("REGRESSION: the erasure guard fails CLOSED when its own routing read fails: the call is held, nobody is remade, and the retry gets the guard's verdict", async () => {
  // The guard's routing was caught to null, so a database that could not say
  // whose call this was never asked whether the caller had asked to be
  // forgotten: the guard was skipped, not failed, and the delivery went on to
  // the dead letter and its 200. Held instead -- the 503 keeps the delivery
  // with the provider until the guard can be evaluated.
  const w = world();
  const line = wire();
  try {
    const id = w.callId("erased_unreadable");
    // Rosa asked to be forgotten a minute ago; this call began two minutes
    // ago, so it belongs to the erasure and must not make her again.
    w.tables.contacts.push({
      id: `k-gone-${w.T}`,
      tenant_id: w.T,
      phone_e164: null,
      erased_at: null,
      erasing_since: iso(NOW - 60_000),
      erased_phone_hash: await hashLegacyErasedPhone(w.T, CALLER),
    });
    const down = w.open({ "tenant_channels.select": { message: "statement timeout" } });
    const res = await deliver("call_ended", w.analysed(id));
    assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "routing_unreadable" }]);
    assert.equal(ingests(down).length, 0, "nothing reached ingest_call");
    assert.deepEqual(
      [w.tables.calls, w.tables.messages],
      [[], []],
      "nothing was written about a person we could not place",
    );
    assert.equal(w.tables.contacts.length, 1, "the tombstone stands alone: nobody was remade");
    assert.equal(kind(w.tables, "ingest.unroutable").length, 0, "a blip is not a dead letter");

    // The retry, with the database well: the guard runs, and holds.
    const well = w.open();
    const retry = await deliver("call_ended", w.analysed(id));
    assert.deepEqual([retry.status, await retry.json()], [200, { ok: true, skipped: "erased" }]);
    assert.equal(ingests(well).length, 0, "an erased caller's call is never ingested");
    assert.deepEqual([w.tables.calls, w.tables.messages], [[], []]);
    assert.equal(w.tables.contacts.length, 1);
    assert.equal(line.mail().length, 0, "the owner is not mailed about a person who asked to be forgotten");
  } finally {
    line.restore();
  }
});

test("REGRESSION: a call row that could not be READ is a 503, not a dead letter: the agent-less turn is held, and the retry lands it on the one row", async () => {
  // A per-turn delivery names no agent and is routed through the call's own
  // row. That read ignored its error, so a blip on `calls` read as "no such
  // call": the turn was dead-lettered under the platform with a 200, never
  // sent again, and the live transcript on the dashboard froze at the turn
  // before it for good.
  const w = world();
  w.open();
  const id = w.callId("known_call_unreadable");
  await deliver("call_started", w.call(id, { call_status: "ongoing", start_timestamp: NOW - 30_000 }));
  const rows = kind(w.tables, "webhook.delivery").length;
  const turns = [
    { role: "agent", content: "Thank you for calling Harbor Moving!" },
    { role: "user", content: "Can I book Tuesday morning?" },
  ];
  const down = w.open({ "calls.select": { message: "connection reset" } });
  // The door logs through lib/shared/log.ts, one JSON object per line on console.error.
  const logged = [];
  const wasError = console.error;
  console.error = (line) => logged.push(String(line));
  let res;
  try {
    res = await deliver("transcript_updated", { call_id: id }, { transcript_with_tool_calls: turns });
  } finally {
    console.error = wasError;
  }
  assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "routing_unreadable" }]);
  assert.equal(ingests(down).length, 0, "nothing reached ingest_call");
  assert.equal(kind(w.tables, "ingest.unroutable").length, 0, "a blip is not a dead letter");
  assert.equal(kind(w.tables, "webhook.delivery").length, rows, "no delivery row: nothing was decided");
  assert.equal(w.tables.calls[0].transcript_object, null, "the row did not move");
  // The REASON rides the log: an RLS or grant regression on `calls` must read
  // differently from a network blip, and the door's refusal names the call,
  // not the cause.
  const events = logged.flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const why = events.find((e) => e.event === "retell_call_row_unreadable");
  assert.deepEqual([why?.level, why?.call_id, why?.error], ["error", id, "connection reset"], JSON.stringify(logged));

  // The retry, with the database well: routed by the row, and landed on it.
  const well = w.open();
  const retry = await deliver("transcript_updated", { call_id: id }, { transcript_with_tool_calls: turns });
  assert.deepEqual([retry.status, await retry.json()], [200, { ok: true }]);
  assert.equal(ingests(well).length, 1);
  assert.deepEqual([w.tables.calls.length, w.tables.calls[0].transcript_object], [1, turns], "one row, the turn on it");
});

test("no database at all: the delivery is not acknowledged -- the 503 a credential-less deployment answers everywhere, never a 200 that loses the call and mails the platform about a workspace's settings", async () => {
  // The SMS door answers 503 with no database (inbound-sms.ts) and WhatsApp
  // counts the message unrecorded and answers 503; this door ingested nothing,
  // mailed the platform a redacted note per analysed call, and answered 200.
  const w = world();
  const line = wire();
  try {
    setPg(null);
    const res = await deliver("call_analyzed", w.analysed(w.callId("no_database")));
    assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "no_database" }]);
    assert.equal(line.mail().length, 0, "nobody is mailed about a call nothing could record");
    assert.equal(line.calls.length, 0, "no fetch at all: not the CDN, not the provider");
  } finally {
    line.restore();
  }
});
