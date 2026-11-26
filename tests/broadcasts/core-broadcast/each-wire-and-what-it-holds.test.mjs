/**
 * Each wire a run goes by: a text's words and STOP line, what each message is about, a visit's message never held by
 * the month, a send not taken given back, WhatsApp's template held alone, email's domain and ids.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import {
  BROADCAST_HOLD_WAIT_MS,
  BROADCAST_STALLS_MAX,
  BROADCAST_THROTTLE_WAITS_MS,
  HELD_REASONS,
  NOW,
  OUTCOME_UNKNOWN,
  VISIT,
  VISIT_RUN_NEXT,
  broadcast,
  call,
  cmd,
  fakes,
  forMoment,
  frozen,
  heldBy,
  notTaken,
  offerRows,
  on,
  quota,
  reminder,
  sendBroadcastBatch,
  sendsOf,
  versionsOf,
  visitFacts,
  visitRows,
  world,
} from "./_core-broadcast.mjs";

test("a text goes on the text version's words, the slots filled, with the STOP line, by the person's number; the version is read once", async () => {
  const { f, asked } = world({ batch: [on("sms"), on("sms", "k2")] });
  await sendBroadcastBatch(f.ports, cmd());
  const [first, second] = sendsOf(f);
  assert.deepEqual(first, {
    tenantId: "t1",
    conversationId: "c-01",
    contactId: "k1",
    to: "+13475550101",
    channel: "sms",
    sender: "human",
    kind: "broadcast",
    purpose: "conversational",
    proactive: true,
    // The run kept their visit (facts.visit_when): the message is about something of theirs (decision D1).
    about: "theirs",
    // The moment the run was made for, which the door asks whether it passes the thread's 24-hour pause (decision D4).
    trigger: "visit_tomorrow",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out",
    holdIfNotTaken: true,
    meta: {
      source: "broadcast",
      broadcast_id: "b1",
      broadcast_name: "Visit reminder · 2026-09-11",
      playbook_id: "p1",
      playbook_name: "Visit reminder",
    },
  });
  assert.equal(second.body, "Hi Bo, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out");
  assert.deepEqual(
    asked,
    [["visit_reminder", "en_US"]],
    "the message is read once for the batch: Meta's row for the purpose, and the text's version for both",
  );
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  const es = world({ broadcast: reminder({ template_language: "es" }), batch: [on("sms")] });
  await sendBroadcastBatch(es.f.ports, cmd());
  assert.match(
    sendsOf(es.f)[0].body,
    /\nResponde STOP para darte de baja$/,
    "the STOP line is in the version's language",
  );
});

test("an email is written queued first, frozen from the version's subject and body, with a foot, and then goes through the door by the row's id", async () => {
  const { f, asked } = world({ batch: [on("email")] });
  const requests = [];
  f.ports.emailRequest = async (i) => {
    requests.push(i);
    return frozen(i);
  };
  await sendBroadcastBatch(f.ports, cmd());
  // The row is now written AFTER the claim (a claim that is lost or fails leaves no queued row behind), so the claim leads.
  assert.deepEqual(
    f.ops(),
    ["startSending", "mark", "queueEmail", "deliver", "mark", "finish", "alert"],
    "the claim, then the row: the door sends only from a row its request was frozen for; then the door, the verdict",
  );
  const [request] = requests;
  assert.match(
    request.messageId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "derived, so a resume meets its row",
  );
  assert.deepEqual(request, {
    messageId: request.messageId,
    to: "ada@example.com",
    subject: "Your visit, Ada",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    // The foot now says how to stop these emails (they carry no unsubscribe link).
    footer:
      "You're getting this because of your appointment with Marisa's.\nReply STOP to stop these emails.\nMarisa's · 12 Main St, Springfield",
  });
  const queued = f.of("queueEmail")[0][1];
  assert.deepEqual(queued, {
    id: request.messageId,
    conversationId: "cv-k1",
    contactId: "k1",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    request: frozen(request),
    meta: {
      source: "broadcast",
      broadcast_id: "b1",
      broadcast_name: "Visit reminder · 2026-09-11",
      playbook_id: "p1",
      playbook_name: "Visit reminder",
    },
  });
  const [sent] = sendsOf(f);
  assert.deepEqual(sent, {
    tenantId: "t1",
    conversationId: "cv-k1",
    contactId: "k1",
    to: "ada@example.com",
    channel: "email",
    sender: "human",
    kind: "broadcast",
    purpose: "conversational",
    proactive: true,
    about: "theirs",
    trigger: "visit_tomorrow",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    messageId: request.messageId,
    email: frozen(request),
    holdIfNotTaken: true,
    meta: queued.meta,
  });
  assert.deepEqual(asked, [["visit_reminder", "en_US"]], "the message is read once for the batch");
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  assert.equal(f.log.filter((l) => l[0] === "mark")[1][3].message_id, "m-k1");
  // The id is the run's, the person's and how long the run has waited: the same on a resume, a fresh one after a wait.
  const again = world({ batch: [on("email")] });
  const ids = [];
  again.f.ports.emailRequest = async (i) => (ids.push(i.messageId), frozen(i));
  await sendBroadcastBatch(again.f.ports, cmd());
  await sendBroadcastBatch(again.f.ports, cmd({ waits: 1 }));
  await sendBroadcastBatch(again.f.ports, cmd({ stalls: 2 }));
  assert.equal(ids[0], request.messageId, "the same run and person: the same row");
  assert.equal(new Set(ids).size, 3, "a wait or a stall in between is a fresh row");
});

test("an email's foot says why they hear from the business and from whom: the visit, the proposal, or that they have been in touch; the address only when the Business record has one", async () => {
  const footers = async (facts, over = {}) => {
    // Their own first name alone fills the slots: the foot is what is looked at.
    const { f } = world({
      batch: [on("email", "k1", facts)],
      broadcast: reminder({ params: [{ kind: "first_name" }] }),
      ...over,
    });
    const seen = [];
    f.ports.emailRequest = async (i) => (seen.push(i.footer), frozen(i));
    await sendBroadcastBatch(f.ports, cmd());
    return seen;
  };
  // Each foot now carries the line that says how to stop these emails, after the reason and before the address.
  assert.deepEqual(
    await footers({ proposal_link: "https://docs.example.com/p/1" }, { facts: { ...visitFacts, address: null } }),
    ["You're getting this about your proposal from Marisa's.\nReply STOP to stop these emails."],
  );
  assert.deepEqual(await footers(null, { facts: { ...visitFacts, address: "  " } }), [
    "You're getting this because you've been in touch with Marisa's.\nReply STOP to stop these emails.",
  ]);
  assert.deepEqual(await footers(VISIT), [
    "You're getting this because of your appointment with Marisa's.\nReply STOP to stop these emails.\nMarisa's · 12 Main St, Springfield",
  ]);
});

test("the door is told what each message is about, from the run's moment as its enrolment read it (decision D1): a visit's or a follow-up's run is theirs, a broadcast and any other moment the business's own news", async () => {
  const aboutOf = async (audience, batch) => {
    // Their first name alone fills the slots: the run's moment is what is looked at, not what the person's row kept.
    const { f } = world({ batch, broadcast: reminder({ params: [{ kind: "first_name" }], audience }) });
    await sendBroadcastBatch(f.ports, cmd());
    return sendsOf(f).map((d) => [d.contactId, d.channel, d.about]);
  };
  const run = (trigger) => ({ kind: "playbook", id: "p1", label: "A moment", trigger });
  // A visit's run: everyone on it, whatever their row kept, on every channel.
  assert.deepEqual(await aboutOf(run("visit_tomorrow"), [on("email", "k1"), on("whatsapp", "k2", null)]), [
    ["k1", "email", "theirs"],
    ["k2", "whatsapp", "theirs"],
  ]);
  assert.deepEqual(await aboutOf(run("visited"), [on("email", "k1", null)]), [["k1", "email", "theirs"]]);
  // A follow-up's run is about the proposal their deal waits on, a link kept or not (a deal is theirs either way).
  assert.deepEqual(await aboutOf(run("proposal_waiting"), [on("email", "k1", null)]), [["k1", "email", "theirs"]]);
  // Any other moment, and a broadcast (no moment at all), is the business's news, though the row kept a visit.
  assert.deepEqual(await aboutOf(run("everyone_monthly"), [on("email", "k1")]), [["k1", "email", "ours"]]);
  assert.deepEqual(await aboutOf({ kind: "everyone", id: null, label: "Everyone" }, [on("email", "k1")]), [
    ["k1", "email", "ours"],
  ]);
});

test("nowhere to send is held with its reason, on the person's own channel: a text with no number, an email with no address; none of them reach the door or the row", async () => {
  const { f } = world({
    batch: [on("sms", "k3"), on("email", "k2"), on("whatsapp", "k3"), on("email")],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks().filter((m) => m[1] === "skipped"),
    [
      ["k3", "skipped", "no_phone"],
      ["k2", "skipped", "no_address"],
      ["k3", "skipped", "no_phone"],
    ],
  );
  assert.equal(f.of("queueEmail").length, 1, "only the person with an address is written to");
  assert.deepEqual(
    sendsOf(f).map((d) => [d.contactId, d.channel]),
    [["k1", "email"]],
  );
});

test("the month's allowance is read once a batch per channel, counted as the batch sends, and a person past it is held on their channel -- never moved", async () => {
  // A broadcast, which the month counts (a visit's message that offers nothing is not held by it: heldByAllowance).
  const counted = reminder({ playbook_id: null, audience: { kind: "everyone", id: null, label: "Everyone" } });
  const text = world({ batch: [on("sms"), on("sms", "k2"), on("whatsapp")], monthSent: 499, broadcast: counted });
  const asked = [];
  const monthSent = text.f.ports.monthSent;
  text.f.ports.monthSent = async (channel) => (asked.push(channel), monthSent(channel));
  await sendBroadcastBatch(text.f.ports, cmd());
  assert.deepEqual(
    text.f.marks().filter((m) => m[1] !== "failed"),
    [
      ["k1", "sent", null],
      ["k2", "skipped", "month_allowance"],
      ["k1", "sent", null],
    ],
    "the 500th text goes, the 501st is held; WhatsApp has no allowance of Chanlytics' (Meta's tier is its limit)",
  );
  assert.deepEqual(asked, ["sms"], "read once, for the first person who needed it");
  assert.deepEqual(
    sendsOf(text.f).map((d) => d.channel),
    ["sms", "whatsapp"],
    "nobody is rerouted to WhatsApp",
  );
  const email = world({ batch: [on("email")], monthSent: 2000, broadcast: counted });
  await sendBroadcastBatch(email.f.ports, cmd());
  assert.deepEqual(email.f.marks(), [["k1", "skipped", "month_allowance"]]);
  assert.equal(email.f.of("queueEmail").length, 0, "no row is written for a send that will not go");
  const wa = world({ batch: [on("whatsapp")], monthSent: new Error("never asked of WhatsApp"), broadcast: counted });
  await sendBroadcastBatch(wa.f.ports, cmd());
  assert.deepEqual(wa.f.marks().at(-1), ["k1", "sent", null]);
});

test("a visit's message is never held by the month: the reminder and the check after a visit go with the month used up, and the month is not even asked", async () => {
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const run = reminder({ audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger } });
    const text = world({
      broadcast: run,
      batch: [on("sms"), on("sms", "k2"), on("email", "k3")],
      monthSent: new Error("a visit's message never asks the month"),
    });
    await sendBroadcastBatch(text.f.ports, cmd());
    assert.deepEqual(
      sendsOf(text.f).map((d) => [d.contactId, d.channel]),
      [
        ["k1", "sms"],
        ["k2", "sms"],
        ["k3", "email"],
      ],
      `${trigger}: all three go, whatever the month holds`,
    );
    assert.equal(
      text.f.marks().some((m) => m[2] === "month_allowance"),
      false,
      trigger,
    );
  }
  // Every other moment is held at the allowance as it always was, and so is a run that kept no moment (made before it did).
  for (const audience of [
    { kind: "playbook", id: "p1", label: "Proposal follow-up", trigger: "proposal_waiting" },
    { kind: "playbook", id: "p1", label: "Win-back", trigger: "quiet_30" },
    { label: "Visit reminder" },
  ]) {
    const w = world({ broadcast: reminder({ audience }), batch: [on("sms")], monthSent: 500 });
    await sendBroadcastBatch(w.f.ports, cmd());
    assert.deepEqual(
      w.f.marks().filter((m) => m[1] !== "failed"),
      [["k1", "skipped", "month_allowance"]],
      JSON.stringify(audience),
    );
  }
});

test("a version the message no longer has on a channel holds the person there (no channel it can go by); an unsendable email never reaches the door", async () => {
  const noEmail = world({ batch: [on("email")], message: versionsOf([], { whatsapp: visitRows.whatsapp }) });
  await sendBroadcastBatch(noEmail.f.ports, cmd());
  assert.deepEqual(noEmail.f.marks(), [["k1", "skipped", "no_channel"]]);
  // No mailbox here, or words no email may carry: the adapter freezes nothing.
  const noMailbox = world({ batch: [on("email")], emailRequest: null });
  await sendBroadcastBatch(noMailbox.f.ports, cmd());
  assert.deepEqual(noMailbox.f.marks(), [["k1", "skipped", "no_channel"]]);
  assert.equal(noMailbox.f.of("queueEmail").length, 0);
  // A row already there that is no longer queued is not sent again.
  const spent = world({ batch: [on("email")], queueEmail: { status: "canceled" } });
  await sendBroadcastBatch(spent.f.ports, cmd());
  // The row is read after the claim now, so the person is claimed and then settled to skipped.
  assert.deepEqual(spent.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "skipped", "send_failed"],
  ]);
  assert.equal(sendsOf(spent.f).length, 0);
  // A person whose thread is gone: held, by their number or by the person.
  const gone = world({ batch: [on("email"), on("sms")], targetOfContact: null, target: null });
  await sendBroadcastBatch(gone.f.ports, cmd());
  assert.deepEqual(gone.f.marks(), [
    ["k1", "skipped", "no_thread"],
    ["k1", "skipped", "no_thread"],
  ]);
});

test("the door's refusals are the person's row on any channel: a line not approved, an address that stopped, a change of address", async () => {
  for (const [channel, reason] of [
    ["sms", "sms_line_not_active"],
    ["email", "email_suppressed"],
    ["email", "recipient_changed"],
  ]) {
    const { f } = world({ batch: [on(channel)], deliver: { outcome: "refused", reason, messageId: null } });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(f.marks(), [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "skipped", reason],
    ]);
    assert.ok(reason in HELD_REASONS, `${reason} has its words on the run's page`);
  }
});

test("a send the provider did not take goes back and the run waits, in the channel's own words; an email's queued row is withdrawn so nothing is left lost", async () => {
  const notTaken = (status) => () => {
    throw Object.assign(new Error("did not take it"), { name: "NotTakenError", status });
  };
  const pages = [];
  const { f } = world({
    batch: [on("email"), on("email", "k3")],
    deliver: notTaken(0),
    remaining: 2,
    facts: visitFacts,
  });
  f.ports.page = async (key, subject) => pages.push([key, subject]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  const withdrawn = f.of("withdrawEmail")[0][1];
  assert.equal(withdrawn, f.of("queueEmail")[0][1].id, "the row it wrote is the row it withdraws");
  assert.equal(f.ops().filter((o) => o === "deliver").length, 1, "nobody after them is sent into the same outage");
  assert.deepEqual(pages, [["unreachable:email", "email: a broadcast could not reach the provider"]]);
  // Past the last wait: said as the mail provider's, not WhatsApp's.
  const spent = world({ batch: [on("email")], deliver: notTaken(0), tally: { sent: 4, held: 0 } });
  await sendBroadcastBatch(spent.f.ports, cmd({ waits: BROADCAST_THROTTLE_WAITS_MS.length }));
  assert.match(
    call(spent.f.log, "alert")[1].body,
    new RegExp(
      `^The mail provider could not be reached for about an hour, so the rest was not sent\\. 4 people got it\\. Nothing is wrong with the mailbox\\. ${VISIT_RUN_NEXT}$`,
    ),
  );
  const limited = world({ batch: [on("sms")], deliver: notTaken(429), tally: { sent: 1, held: 0 } });
  await sendBroadcastBatch(limited.f.ports, cmd({ waits: BROADCAST_THROTTLE_WAITS_MS.length }));
  assert.match(call(limited.f.log, "alert")[1].body, /^The texting provider kept limiting how fast this line may send/);
  assert.equal(limited.f.of("withdrawEmail").length, 0, "a text has no row to withdraw");
});

test("a wire that is down stops the run and says which: the mailbox, the texting line; each in its own words", async () => {
  const down = {
    outcome: "failed",
    reason: "no_credentials",
    status: 503,
    errorBody: "no_credentials",
    messageId: "m-k1",
  };
  const email = world({ batch: [on("email"), on("email", "k3")], deliver: down, remaining: 2 });
  await sendBroadcastBatch(email.f.ports, cmd());
  // The failure says which wire (an email's own code), so the run's page says "the mail provider", never "WhatsApp".
  assert.deepEqual(call(email.f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
  assert.match(
    call(email.f.log, "alert")[1].body,
    new RegExp(
      `^Email could not be sent from this workspace's mailbox \\(the mailbox is not set up\\), so the rest was not sent\\. Check the mailbox in Settings › Connections\\. ${VISIT_RUN_NEXT}$`,
    ),
  );
  assert.equal(email.f.ops().filter((o) => o === "deliver").length, 1);
  const text = world({ batch: [on("sms")], deliver: { ...down, reason: "provider", status: 401 } });
  await sendBroadcastBatch(text.f.ports, cmd());
  assert.match(
    call(text.f.log, "alert")[1].body,
    /^Texts could not be sent on this workspace's line \(the texting provider answered HTTP 401\)/,
  );
  assert.deepEqual(call(text.f.log, "fail").slice(1), ["b1", "wire_unavailable:sms"]);
  const whatsapp = world({ batch: [on("whatsapp")], deliver: { ...down, reason: "provider", status: 401 } });
  await sendBroadcastBatch(whatsapp.f.ports, cmd());
  assert.deepEqual(
    call(whatsapp.f.log, "fail").slice(1),
    ["b1", "wire_unavailable"],
    "WhatsApp's is the bare code, which is what every run before runs had a channel stored",
  );
});

test("a provider's 401 or 403 on a broadcast's email pages the platform, as a reply's does, and the owner is not told to fix a mailbox that was never at fault", async () => {
  for (const status of [401, 403]) {
    const pages = [];
    const refused = {
      outcome: "failed",
      reason: "provider",
      status,
      errorBody: '{"name":"restricted_api_key"}',
      messageId: "m-k1",
    };
    const { f } = world({ batch: [on("email"), on("email", "k3")], deliver: refused, remaining: 2 });
    f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      pages.map((p) => p.slice(0, 2)),
      [["provider_auth:email", `email rejected a send with ${status}`]],
      `${status}: the same key and subject a reply's refusal is paged under (core send.ts)`,
    );
    assert.match(
      pages[0][2],
      /^Tenant t1, broadcast b1, everyone not yet sent still queued\. Credentials, not content\.$/,
    );
    const said = call(f.log, "alert")[1].body;
    assert.equal(
      said,
      `Email could not be sent: the mail provider refused the platform's key (HTTP ${status}), so the rest was not sent. The platform has been told, and nothing in your mailbox needs changing. ${VISIT_RUN_NEXT}`,
    );
    assert.doesNotMatch(said, /Check the mailbox/);
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
    assert.equal(f.ops().filter((o) => o === "deliver").length, 1, "the run stopped at the first person");
  }
  // WhatsApp's and a text's credentials are the owner's own: they page too (a refused key is paged on any wire), and the
  // owner is told to reconnect, as before.
  const pages = [];
  const { f } = world({
    batch: [on("sms")],
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "", messageId: "m-k1" },
  });
  f.ports.page = async (key) => pages.push(key);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(pages, ["provider_auth:sms"]);
  assert.ok(
    call(f.log, "alert")[1].body.endsWith(`Check the line in Settings › Channels. ${VISIT_RUN_NEXT}`),
    call(f.log, "alert")[1].body,
  );
  // A pager that throws does not turn a run that stopped for it into one that failed to say so.
  const broken = world({
    batch: [on("email")],
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "", messageId: "m-k1" },
  });
  broken.f.ports.page = async () => {
    throw new Error("pager down");
  };
  await sendBroadcastBatch(broken.f.ports, cmd());
  assert.deepEqual(call(broken.f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
  assert.ok(broken.f.ops().includes("alert"), "the owner is still told");
});

test("each wire is asked about only when someone in the batch goes by it: a mailbox that could not be read holds the emails, and never a WhatsApp-only batch", async () => {
  const asked = [];
  const wireUnavailable = (channel) => (asked.push(channel), channel === "email" ? "mailbox unreadable" : null);
  const mixed = world({ batch: [on("whatsapp"), on("email", "k3")], wireUnavailable, remaining: 2 });
  await sendBroadcastBatch(mixed.f.ports, cmd());
  assert.deepEqual(asked, ["whatsapp", "email"], "each channel the batch goes by, once");
  assert.deepEqual(mixed.f.ops(), ["scheduleNext"], "nobody claimed, nothing failed, nobody told");
  assert.deepEqual(mixed.f.log[0].slice(0, 2), ["scheduleNext", "b1"]);
  asked.length = 0;
  const whatsApp = world({ batch: [on("whatsapp")], wireUnavailable });
  await sendBroadcastBatch(whatsApp.f.ports, cmd());
  assert.deepEqual(asked, ["whatsapp"]);
  assert.ok(whatsApp.f.ops().includes("deliver"), "the email wire is nobody's business here");
  // Past the cap the owner is told which wire: the mailbox, not WhatsApp's credentials.
  const capped = world({ batch: [on("email")], wireUnavailable, remaining: 1, tally: { sent: 5, held: 0 } });
  await sendBroadcastBatch(capped.f.ports, cmd({ stalls: BROADCAST_STALLS_MAX }));
  assert.match(
    call(capped.f.log, "alert")[1].body,
    /^This workspace's mailbox could not be read for about half an hour/,
  );
});

test("one batch, three channels: each person goes by their own, the claims and verdicts are the same, and a run with no channel on its rows is WhatsApp's", async () => {
  const { f } = world({
    batch: [on("whatsapp"), on("sms", "k2"), on("email", "k3"), { contact_id: "k2", facts: VISIT }],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    sendsOf(f).map((d) => [d.contactId, d.channel, d.to, d.template ? "template" : "words"]),
    [
      ["k1", "whatsapp", "+13475550101", "template"],
      ["k2", "sms", "+13475550102", "words"],
      ["k3", "email", "cy@example.com", "words"],
      ["k2", "whatsapp", "+13475550102", "template"],
    ],
    "a row with no channel (a run made before) is WhatsApp's",
  );
  assert.equal(f.marks().filter((m) => m[1] === "sent").length, 4);
});

test("the mail provider's day or month used up gives the claim back and stops the run, saying so: nobody after is burned as refused", async () => {
  for (const [limit, said] of [
    [
      "daily",
      new RegExp(
        `^The mail provider's limit for the day was reached, so the rest was not sent\\. 4 people got it\\. It resets on its own\\. ${VISIT_RUN_NEXT}$`,
      ),
    ],
    [
      "monthly",
      new RegExp(
        `^The mail provider's limit for the month was reached, so the rest was not sent\\. 4 people got it\\. It resets with the new month\\. ${VISIT_RUN_NEXT}$`,
      ),
    ],
  ]) {
    const pages = [];
    const { f } = world({
      batch: [on("email"), on("email", "k3"), on("email", "k2")],
      deliver: quota(limit),
      remaining: 3,
      tally: { sent: 4, held: 0 },
    });
    f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "throttled"],
      ],
      `${limit}: the claim goes back, so the person stays queued; nobody is marked send_failed`,
    );
    assert.equal(f.ops().filter((o) => o === "deliver").length, 1, `${limit}: nobody after them is tried`);
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "provider_limit"]);
    assert.match(call(f.log, "alert")[1].body, said);
    assert.ok(!f.ops().includes("scheduleNext"), `${limit}: stopped, not waiting: the limit outlasts any wait`);
    // The one page a reply's limit gives (core provider-page.ts): the same key and subject, the run named in its body.
    assert.deepEqual(pages, [
      [
        "provider_quota:email",
        `email: the ${limit} sending limit is used up`,
        "Tenant t1, broadcast b1, everyone not yet sent still queued. Every workspace's email is refused until it resets or the plan grows.",
      ],
    ]);
  }
  // A playbook's run that is not a visit's: the day's limit is over by tomorrow's run; the month's is not, and its alert
  // promised a run that would meet the same limit.
  for (const [limit, end] of [
    [
      "daily",
      "It resets on its own. It doesn't run again today · tomorrow's run reaches the people this one missed, and nobody gets it twice.",
    ],
    [
      "monthly",
      "It resets with the new month. It doesn't run again today · the next run reaches the people this one missed, and nobody gets it twice.",
    ],
  ]) {
    const { f } = world({
      broadcast: forMoment("everyone_monthly"),
      batch: [on("email"), on("email", "k3")],
      deliver: quota(limit),
      remaining: 2,
      tally: { sent: 4, held: 0 },
    });
    await sendBroadcastBatch(f.ports, cmd());
    const said = call(f.log, "alert")[1].body;
    assert.ok(said.endsWith(end), `${limit}: ${said}`);
    assert.doesNotMatch(said, /send it again/i);
  }
  const { BROADCAST_FAILURE_WORDS } = await import("@chanlytics/contracts");
  assert.ok("provider_limit" in BROADCAST_FAILURE_WORDS, "the page has words for it");
});

test("WhatsApp's template not approved holds WhatsApp's people alone: the people on email and text go on their versions, with the message's own purpose", async () => {
  const rejected = { ...visitRows, whatsapp: { ...visitRows.whatsapp, meta_status: "rejected" } };
  const mixed = world({
    batch: [on("whatsapp", "k2"), on("email"), on("sms", "k2")],
    message: versionsOf([], rejected),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(mixed.f.ports, cmd());
  assert.deepEqual(mixed.f.marks(), [
    ["k2", "skipped", "template_not_approved"],
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  assert.deepEqual(
    sendsOf(mixed.f).map((d) => [d.channel, d.purpose]),
    [
      ["email", "conversational"],
      ["sms", "conversational"],
    ],
    "the purpose stays the message's own category, Meta's row's, though that row is not approved",
  );
  assert.ok(!mixed.f.ops().includes("fail"), "the run is not failed: somebody on it can still be reached");
  assert.ok(mixed.f.ops().includes("finish"));
  assert.ok("template_not_approved" in HELD_REASONS, "and the run's page says why the WhatsApp people were held");
  // A message with no category anywhere has none to keep: marketing, as purposeOfTemplate fails closed.
  const gone = world({
    batch: [on("email")],
    message: versionsOf([], {
      email: { ...visitRows.email, category: null },
      sms: { ...visitRows.sms, category: null },
    }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(gone.f.ports, cmd());
  assert.equal(sendsOf(gone.f)[0].purpose, "marketing");
  // The question is the RUN's, not the batch's: a batch of WhatsApp people on a run that has email people is held, and the run goes on.
  const onlyWhatsApp = world({
    batch: [on("whatsapp"), on("whatsapp", "k2")],
    message: versionsOf([], rejected),
    byOtherChannels: true,
    remaining: 1,
  });
  await sendBroadcastBatch(onlyWhatsApp.f.ports, cmd());
  assert.deepEqual(onlyWhatsApp.f.marks(), [
    ["k1", "skipped", "template_not_approved"],
    ["k2", "skipped", "template_not_approved"],
  ]);
  assert.ok(onlyWhatsApp.f.ops().includes("scheduleNext"), "the run goes on to its email people");
  // A run with nobody else on it fails as it always did, before a single send.
  const alone = world({ batch: [on("whatsapp")], message: versionsOf([], rejected), byOtherChannels: false });
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"]);
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "template_not_approved"]);
  // The question is asked only when the template is not approved.
  const approvedRun = world({
    batch: [on("email")],
    byOtherChannels: new Error("never asked of an approved template"),
  });
  await sendBroadcastBatch(approvedRun.f.ports, cmd());
  assert.ok(approvedRun.f.ops().includes("finish"));
});

test("an email's queued row is written only once its person is claimed, and none is left queued on a path that does not send it", async () => {
  const claim = (patch) => patch.state === "failed" && patch.reason === OUTCOME_UNKNOWN;
  // The claim throws: nobody is claimed, so no row was written for them; the next person is reached.
  const claimThrows = world({
    batch: [on("email"), on("email", "k3")],
    mark: (_b, k, patch) => {
      if (claim(patch) && k === "k1") throw new Error("PostgREST blip");
      return true;
    },
    remaining: 1,
  });
  await sendBroadcastBatch(claimThrows.f.ports, cmd());
  assert.deepEqual(
    claimThrows.f.of("queueEmail").map((q) => q[1].contactId),
    ["k3"],
    "no row for the person whose claim failed",
  );
  // The claim is lost to another run (a compare-and-set answers false): no row, no send, no mark of theirs; the batch goes on.
  const lost = world({
    batch: [on("email"), on("email", "k3")],
    mark: (_b, k, patch) => !(claim(patch) && k === "k1"),
  });
  await sendBroadcastBatch(lost.f.ports, cmd());
  assert.deepEqual(
    lost.f.of("queueEmail").map((q) => q[1].contactId),
    ["k3"],
  );
  assert.deepEqual(
    sendsOf(lost.f).map((d) => d.contactId),
    ["k3"],
    "the person another run took is that run's to send to",
  );
  assert.deepEqual(
    lost.f.marks().filter((m) => m[0] === "k1"),
    [["k1", "failed", OUTCOME_UNKNOWN]],
    "only the attempt: nothing is settled for a person who is not ours",
  );
  // The row cannot be written: nothing was written and nothing left, so the claim goes back and they wait queued.
  const writeFails = world({ batch: [on("email")], queueEmail: new Error("insert failed"), remaining: 1 });
  await sendBroadcastBatch(writeFails.f.ports, cmd());
  assert.deepEqual(writeFails.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  assert.equal(writeFails.f.ops().filter((o) => o === "deliver").length, 0);
  // The door throws before the wire: the row it did not settle is withdrawn, the claim stands (nobody knows whether it
  // left), and the run stops there rather than claim the next person into the same failure.
  const doorThrows = world({ batch: [on("email"), on("email", "k3")], deliver: new Error("wire read failed") });
  await assert.rejects(sendBroadcastBatch(doorThrows.f.ports, cmd()), /wire read failed/);
  assert.deepEqual(
    doorThrows.f.of("withdrawEmail").map((w) => w[1]),
    [doorThrows.f.of("queueEmail")[0][1].id],
    "the row it wrote is the row it withdraws",
  );
  assert.deepEqual(doorThrows.f.marks(), [["k1", "failed", OUTCOME_UNKNOWN]]);
  assert.equal(doorThrows.f.of("queueEmail").length, 1, "nobody after them is written a row");
  // A withdrawal that fails is logged and never the run's failure: the run still waits, as for any send handed back.
  const stuck = world({
    batch: [on("email")],
    deliver: notTaken(0),
    withdrawEmail: new Error("db down"),
    remaining: 1,
  });
  await sendBroadcastBatch(stuck.f.ports, cmd());
  assert.deepEqual(stuck.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  assert.ok(stuck.f.ops().includes("scheduleNext"));
});

test("the claim is a compare-and-set: a person another run took first is not sent", async () => {
  const taken = fakes({
    mark: (_b, k, patch) => !(patch.state === "failed" && patch.reason === OUTCOME_UNKNOWN && k === "k1"),
  });
  await sendBroadcastBatch(taken.ports, cmd());
  assert.deepEqual(
    taken.log.filter((l) => l[0] === "deliver").map((l) => l[1].contactId),
    ["k2"],
    "k1 was taken by another run: only k2 is sent",
  );
  assert.deepEqual(taken.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
});

test("offers by email, where the deployment names a campaigns domain the provider does not verify, do not stop a run that also goes another way: the platform is paged once, each person going by email is skipped for it before they are claimed, and everyone else is sent", async () => {
  const pages = [];
  const asked = [];
  const others = [];
  const { f } = world({
    batch: [on("email"), on("whatsapp", "k2"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersClosed: () => (asked.push("asked"), "the campaigns domain campaigns.example.com is not verified for sending"),
    byOtherChannels: (_id, than) => (others.push(than), true),
    heldFor: ["email_marketing_disabled"],
    remaining: 0,
    tally: { sent: 1, held: 2 },
  });
  f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.ok(!f.ops().includes("fail"), "the run is not failed: the owner is not told to send it again");
  assert.equal(asked.length, 1, "asked once for the batch");
  assert.deepEqual(others, ["email"], "who else is on the run is asked once, of email");
  assert.deepEqual(
    f.marks(),
    [
      ["k1", "skipped", "email_marketing_disabled"],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
      ["k3", "skipped", "email_marketing_disabled"],
    ],
    "the email people are skipped with the door's own reason, never claimed, never held as having no channel; the WhatsApp person behind them is reached",
  );
  assert.deepEqual(
    sendsOf(f).map((d) => d.contactId),
    ["k2"],
    "nothing by email left",
  );
  assert.equal(f.of("queueEmail").length, 0, "no email row was written for a person who cannot be sent one");
  assert.ok(f.ops().includes("finish"), "the run finishes, and says what happened to the others");
  assert.equal(call(f.log, "alert")[1].kind, "broadcast_sent");
  assert.match(
    call(f.log, "alert")[1].body,
    /1 of 3 people got it; 2 held back \(.*no offers or news by email for now/,
  );
  assert.deepEqual(pages, [
    [
      "campaigns_domain_unverified",
      "email: a broadcast's offers could not leave, the campaigns domain is not verified",
      "Tenant t1, broadcast b1: its offers and news by email are skipped person by person while this lasts, and the run goes on for everyone else: the campaigns domain campaigns.example.com is not verified for sending.",
    ],
  ]);
  // The page has words for a run that an earlier build stopped with it, and they say what is wrong: not WhatsApp, not the mailbox.
  const { broadcastFailureWords, broadcastFailureFix, BROADCAST_FAILURES } = await import("@chanlytics/contracts");
  assert.match(broadcastFailureWords("campaigns_domain_unverified"), /not verified with the mail provider/);
  assert.match(broadcastFailureFix("campaigns_domain_unverified"), /Your mailbox is fine/);
  assert.ok(BROADCAST_FAILURES.includes("email_offers_paused"), "a run of email alone stops for a pause on offers too");

  // A run of email alone stops, before anyone is claimed, saying so: everyone left would be held alike, each a skip that
  // is final, and the run would end as having reached nobody.
  const alonePages = [];
  const alone = world({
    // A broadcast the owner made: it is sent again once the domain is verified (a playbook's run is told its own next step).
    broadcast: broadcast(),
    batch: [on("email"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersClosed: "the campaigns domain campaigns.example.com is not verified for sending",
    byOtherChannels: (_id, than) => than !== "email",
    remaining: 2,
    tally: { sent: 3, held: 0 },
  });
  alone.f.ports.page = async (key, subject, body) => alonePages.push([key, subject, body]);
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"], "nobody claimed, nothing held, nothing scheduled");
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "campaigns_domain_unverified"]);
  assert.equal(
    call(alone.f.log, "alert")[1].body,
    "The domain offers by email go out from is not verified with the mail provider right now, so the rest was not sent. 3 people got it. Your mailbox is fine, and Chanlytics is on it · send it again once the domain is verified.",
  );
  assert.deepEqual(alonePages, [
    [
      "campaigns_domain_unverified",
      "email: a broadcast's offers could not leave, the campaigns domain is not verified",
      "Tenant t1, broadcast b1 stopped, everyone not yet sent still queued: the campaigns domain campaigns.example.com is not verified for sending.",
    ],
  ]);

  // Asked only when it matters: an offer, and somebody in the batch going by email. A visit message leaves from the mail
  // domain, which is not in question; a WhatsApp-only batch has no email in it.
  const counted = (rows, batch) => {
    const asks = [];
    const w = world({
      batch,
      message: versionsOf([], rows),
      offersClosed: () => (asks.push(1), "closed"),
    });
    return sendBroadcastBatch(w.f.ports, cmd()).then(() => ({ asks: asks.length, ops: w.f.ops() }));
  };
  assert.equal((await counted(visitRows, [on("email")])).asks, 0, "a visit message is not an offer");
  assert.ok((await counted(visitRows, [on("email")])).ops.includes("deliver"), "and it goes");
  assert.equal((await counted(offerRows, [on("whatsapp")])).asks, 0, "an offer by WhatsApp has no email in it");
  assert.equal((await counted(offerRows, [on("email")])).asks, 1);
  // Open (null): the offers are sent as ever, from the lane the adapter holds.
  const open = world({ batch: [on("email")], message: versionsOf([], offerRows), offersClosed: null });
  await sendBroadcastBatch(open.f.ports, cmd());
  assert.ok(open.f.ops().includes("deliver"));
});

test("offers by email whose campaigns domain could not be asked about wait a minute and ask again, nobody claimed; a visit's email in the same state goes", async () => {
  const pages = [];
  const unread = "the campaigns domain campaigns.example.com could not be checked";
  const { f } = world({
    batch: [on("email"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersUnread: unread,
    offersClosed: new Error("not asked: an unread domain is no answer"),
    remaining: 2,
  });
  f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.ops(), ["startSending", "scheduleNext"], "nobody claimed, nothing held, nothing failed");
  assert.deepEqual(call(f.log, "scheduleNext").slice(-1), [{ stalls: 1 }], "a stall, carrying the count");
  assert.deepEqual(pages, [
    [
      "campaigns_domain_unread",
      "email: a broadcast's offers wait, the campaigns domain could not be checked",
      `Tenant t1, broadcast b1 waits, everyone still queued: ${unread}.`,
    ],
  ]);
  // A visit's email is not an offer, and leaves from the mail domain: it is not held for the campaigns domain.
  const visit = world({ batch: [on("email")], message: versionsOf([], visitRows), offersUnread: unread });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.ok(visit.f.ops().includes("deliver"), "and it goes");
});

test("a person released and re-batched is sent under a new email id, whatever the run's own counters say: not skipped as send_failed having never been sent; a run resumed with no release keeps its id", async () => {
  // The database's guard, as the fakes stand in for it: every release of a claim (queued again) adds one to the person's
  // attempt, which the batch reads with the queued people (00301).
  const attempts = new Map();
  const rows = new Map();
  const ids = [];
  let door = "not taken";
  const { f } = world({
    batch: () => [{ ...on("email"), attempt: attempts.get("k1") ?? 0 }],
    mark: (_id, contactId, patch) => {
      if (patch.state === "queued") attempts.set(contactId, (attempts.get(contactId) ?? 0) + 1);
      return true;
    },
    queueEmail: (row) => {
      ids.push(row.id);
      if (rows.has(row.id)) return { status: rows.get(row.id) };
      rows.set(row.id, "queued");
      return { status: "queued" };
    },
    withdrawEmail: (id) => rows.set(id, "canceled"),
    deliver: (d) => {
      if (door === "not taken") throw Object.assign(new Error("did not take it"), { name: "NotTakenError", status: 0 });
      rows.set(d.messageId, "sent");
      return { outcome: "sent", messageId: d.messageId, externalId: "re_1" };
    },
    remaining: 1,
  });
  // Batch 1, at wait 0: the provider does not take it. The email's row is withdrawn, the person released: attempt 1.
  await sendBroadcastBatch(f.ports, cmd());
  assert.equal(rows.get(ids[0]), "canceled");
  assert.equal(attempts.get("k1"), 1);
  // Batch 2: a clean batch between had the run's waits start again, so it is read at wait 0 as batch 1 was. Under the id
  // derived from the waits it was the id of the withdrawn row: found canceled, skipped as send_failed, never sent.
  door = "takes it";
  await sendBroadcastBatch(f.ports, cmd());
  assert.notEqual(ids[1], ids[0], "a new id for the new attempt");
  assert.deepEqual(
    f.marks().filter((m) => m[1] === "skipped"),
    [],
    "nobody is skipped as send_failed",
  );
  assert.equal(f.marks().at(-1)?.[1], "sent");
  assert.equal(rows.get(ids[1]), "sent");
  // A run resumed after a kill releases nobody: the same attempt, so the same id, whatever the run carried. It is how a
  // resumed batch finds the email it was sending.
  const resumed = [];
  const again = world({
    batch: [{ ...on("email"), attempt: 2 }],
    emailRequest: (i) => (resumed.push(i.messageId), frozen(i)),
  });
  await sendBroadcastBatch(again.f.ports, cmd());
  await sendBroadcastBatch(again.f.ports, cmd({ waits: 3, stalls: 1 }));
  assert.equal(new Set(resumed).size, 1, "no release, no new id");
  // And each attempt is its own: attempt 3 is not attempt 2.
  const third = world({
    batch: [{ ...on("email"), attempt: 3 }],
    emailRequest: (i) => (resumed.push(i.messageId), frozen(i)),
  });
  await sendBroadcastBatch(third.f.ports, cmd());
  assert.equal(new Set(resumed).size, 2);
  // A database that has not reached 00301 has no attempt to read: the id is named as it was, by the waits and the stalls.
  const old = [];
  const before = world({ batch: [on("email")], emailRequest: (i) => (old.push(i.messageId), frozen(i)) });
  await sendBroadcastBatch(before.f.ports, cmd());
  await sendBroadcastBatch(before.f.ports, cmd());
  await sendBroadcastBatch(before.f.ports, cmd({ waits: 1 }));
  assert.equal(old[0], old[1], "the same wait, the same row");
  assert.notEqual(old[2], old[0], "a wait is a fresh row, as before the column");
});

test("a broadcast's email id is named by the person's attempt, as reach-out's sends are; a database with no attempt to read keeps the id it always had", async () => {
  const { broadcastEmailId } = await importSrc("packages/core/src/campaigns/reach-out-ids.ts");
  const { makeUuidV5 } = await importSrc("packages/core/src/shared/uuid-v5.ts");
  const of = (over = {}) =>
    broadcastEmailId({ broadcastId: "b1", contactId: "k1", attempt: 0, waits: 0, stalls: 0, ...over });
  // The run and the person and the attempt: the same three, the same id; any one different, a different one.
  assert.equal(await of(), await of());
  assert.notEqual(await of({ attempt: 1 }), await of());
  assert.notEqual(await of({ contactId: "k2" }), await of());
  assert.notEqual(await of({ broadcastId: "b2" }), await of());
  // What the run carried is not in it: a clean batch starts its waits at nothing and a resumed run keeps its attempt.
  assert.equal(await of({ attempt: 2, waits: 3, stalls: 1 }), await of({ attempt: 2 }));
  // No attempt to read (a database before 00301): the waits and the stalls, as before the column.
  assert.equal(
    await of({ attempt: undefined, waits: 2, stalls: 1 }),
    await makeUuidV5("broadcast_email:b1:k1:2:1"),
    "the id every run before the column was written under",
  );
  assert.notEqual(await of({ attempt: undefined }), await of({ attempt: 0 }), "the two names never meet");
});

test("a day-before reminder the door held for a live hold is given back, not skipped, and the run tries them again after the hold's wait", async () => {
  const { f } = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks(),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "not_taken"],
    ],
    "claimed, then given back: nothing left, so nothing is final",
  );
  assert.ok(!f.ops().includes("fail"), "the run goes on, and is not failed");
  assert.deepEqual(
    call(f.log, "scheduleNext").slice(1),
    ["b1", new Date(NOW + BROADCAST_HOLD_WAIT_MS), {}],
    "the next batch is placed after the hold's wait, not at once and not as a stall",
  );
  // The wait is drawn a little longer at random, as every wait is.
  const drawn = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1, random: () => 1 });
  await sendBroadcastBatch(drawn.f.ports, cmd());
  assert.deepEqual(call(drawn.f.log, "scheduleNext")[2], new Date(NOW + BROADCAST_HOLD_WAIT_MS * 1.2));
  // What the run was carrying (its waits and its stalls) is kept, not reset by the hold.
  const carried = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(carried.f.ports, cmd({ waits: 2, stalls: 1 }));
  assert.deepEqual(call(carried.f.log, "scheduleNext")[3], { waits: 2, stalls: 1 });
  // The tried-again person is sent when the hold has gone: the same person, a second batch.
  let held = true;
  const again = world({
    batch: [on("whatsapp")],
    deliver: (d) =>
      held ? heldBy("human_has_it")(d) : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" },
    remaining: 1,
  });
  await sendBroadcastBatch(again.f.ports, cmd());
  held = false;
  again.f.ports.remaining = async () => 0;
  await sendBroadcastBatch(again.f.ports, cmd());
  assert.deepEqual(again.f.marks().at(-1), ["k1", "sent", null]);
  assert.ok(again.f.ops().includes("finish"), "and the run finishes");
});

test("a person whose reminder waits does not hold up the others: the rest of the batch goes on, and the next batch waits only when nobody else is left", async () => {
  // Two people in the batch: the first held, the second sent. Everyone else the run has is the held person: wait for the hold.
  const held = (d) =>
    d.contactId === "k1"
      ? heldBy("human_has_it")(d)
      : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" };
  const { f } = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: held, remaining: 1 });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  assert.deepEqual(call(f.log, "scheduleNext").slice(1, 3), ["b1", new Date(NOW + BROADCAST_HOLD_WAIT_MS)]);
  // More people are still queued beyond this batch: the next batch is not held back for one person.
  const more = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: held, remaining: 7 });
  await sendBroadcastBatch(more.f.ports, cmd());
  assert.deepEqual(call(more.f.log, "scheduleNext").slice(1), ["b1"], "at once, as any batch with people left");
});

test("a held reminder whose claim could not be given back is skipped, human_has_it, not counted as waiting: nobody is queued for the run to try again", async () => {
  // The release is the database's to refuse (no 00216/00282 yet, a guard that will not move the row): it throws, or says no.
  for (const [what, refuse] of [
    ["throws", () => Promise.reject(new Error("broadcast_recipients.state is terminal (failed -> queued refused)"))],
    ["answers no", () => false],
  ]) {
    const { f } = world({
      batch: [on("whatsapp")],
      deliver: heldBy("human_has_it"),
      remaining: 0,
      mark: (_b, _k, patch) => (patch.state === "queued" ? refuse() : true),
    });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "not_taken"],
        ["k1", "skipped", "human_has_it"],
      ],
      `a release that ${what}: the person is skipped, as for a hold that has run out of day`,
    );
    assert.ok(
      !f.ops().includes("scheduleNext"),
      `a release that ${what}: no wait is placed for a person who is not queued`,
    );
    assert.ok(f.ops().includes("finish"), `a release that ${what}: nobody is left, so the run finishes`);
  }
  // Given back, as always, when the database takes the release: the person is queued and the run waits for the hold.
  const taken = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(taken.f.ports, cmd());
  assert.deepEqual(taken.f.marks().at(-1), ["k1", "queued", "not_taken"]);
  assert.ok(taken.f.ops().includes("scheduleNext"));
});

test("a day-before reminder still held at the end of the sending day is skipped, human_has_it, as before; every other moment skips a held thread at once", async () => {
  // 8:55 PM: the next try would fall at 9:05 PM, outside the day's sending hours (the day the reminder is for is over).
  const LATE = Date.parse("2026-09-11T20:55:00Z");
  const late = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), now: () => LATE });
  await sendBroadcastBatch(late.f.ports, cmd({ deadline: LATE + 60_000 }));
  assert.deepEqual(late.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "skipped", "human_has_it"],
  ]);
  assert.ok(late.f.ops().includes("finish") && !late.f.ops().includes("scheduleNext"));
  // Any other moment, and a broadcast: no pause is passed, so a held thread is the person's own refusal, final.
  for (const [what, b] of [
    ["the after-visit message", forMoment("visited")],
    ["a win-back", forMoment("quiet_30")],
    ["the month's offer", forMoment("everyone_monthly")],
    ["a proposal's follow-up", forMoment("proposal_waiting")],
    ["a plain broadcast", broadcast()],
  ]) {
    const w = world({ broadcast: b, batch: [on("whatsapp")], deliver: heldBy("human_has_it") });
    await sendBroadcastBatch(w.f.ports, cmd());
    assert.deepEqual(
      w.f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "skipped", "human_has_it"],
      ],
      what,
    );
    assert.ok(!w.f.ops().includes("scheduleNext"), `${what}: nothing is waited for`);
  }
  // The door is told the moment, which is all it needs to pass the pause (contracts passesHandoverPause).
  const sent = world({ batch: [on("whatsapp")] });
  await sendBroadcastBatch(sent.f.ports, cmd());
  assert.equal(sendsOf(sent.f)[0].trigger, "visit_tomorrow");
});

test("a billing pause the door meets stops the run, once, and gives the person back, never skipping everyone left; a playbook's run is told its own next step, not to send it again", async () => {
  const stopped = async (b) => {
    const { f } = world({
      broadcast: b,
      batch: [on("whatsapp"), on("whatsapp", "k2")],
      deliver: heldBy("paused"),
      remaining: 2,
    });
    const pages = [];
    f.ports.page = async (...args) => pages.push(args);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "not_taken"],
      ],
      "the person the door was asked about is given back, and nobody after them is claimed",
    );
    assert.equal(sendsOf(f).length, 1, "the run stopped at the first refusal");
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "paused"]);
    const alerts = f.log.filter((l) => l[0] === "alert");
    assert.equal(alerts.length, 1, "the owner is told once");
    assert.equal(alerts[0][1].kind, "broadcast_stopped");
    assert.ok(!f.ops().includes("scheduleNext") && !f.ops().includes("finish"), "stopped, not waiting or done");
    assert.equal(pages.length, 0, "a billing pause is the owner's, not the platform's");
    return alerts[0][1].body;
  };
  assert.equal(
    await stopped(broadcast()),
    "The workspace is paused until billing resumes, so the rest was not sent. 2 people got it. Resume from Settings › Billing and send it again.",
  );
  // A playbook's run was made for today: Run now answers that it already ran, and sending its message again by hand reaches
  // the whole list. Tomorrow's run reaches who this one did not (a stopped run touched only the people it had sent to).
  assert.match(
    await stopped(forMoment("quiet_30")),
    /Resume from Settings › Billing\. It doesn't run again today · tomorrow's run reaches the people this one missed, and nobody gets it twice\.$/,
  );
  assert.doesNotMatch(await stopped(forMoment("everyone_monthly")), /send it again/i);
  // A visit's message belongs to the day of the visit: tomorrow's run is for tomorrow's visits, so these are not reached later.
  assert.match(
    await stopped(forMoment("visit_tomorrow")),
    /a reminder belongs to its day, so the people it missed aren't sent it later\.$/,
  );
  assert.doesNotMatch(await stopped(forMoment("visited")), /send it again|tomorrow's run reaches/i);
  // The same pause met at the head, before anyone is claimed: the same words, once.
  const head = fakes({ broadcast: forMoment("quiet_30"), workspacePaused: true, tally: { sent: 0, held: 0 } });
  await sendBroadcastBatch(head.ports, cmd());
  assert.deepEqual(head.ops(), ["fail", "alert"]);
  assert.match(
    call(head.log, "alert")[1].body,
    /^The workspace is paused until billing resumes, so nothing went out\. Resume from Settings › Billing\. It doesn't run again today ·/,
  );
});
