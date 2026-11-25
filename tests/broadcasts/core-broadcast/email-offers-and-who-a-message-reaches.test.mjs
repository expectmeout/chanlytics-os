/**
 * Offers and news by email paused or sent with their foot, a message with no WhatsApp row, one whose only row cannot
 * be sent, a thank-you for a deal asked again at the send, and every alert opening its run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HELD_REASONS,
  OUTCOME_UNKNOWN,
  VISIT,
  VISIT_WORDS,
  alertsRaised,
  broadcast,
  call,
  cmd,
  fakes,
  forMoment,
  frozen,
  heldBy,
  news,
  offerRows,
  on,
  reachable,
  sendBroadcastBatch,
  sendsOf,
  versionsOf,
  visitFacts,
  visitRows,
  world,
} from "./_core-broadcast.mjs";

test("a pause on offers and news by email, or a campaigns domain that cannot be used, skips the email person the door asked about and the run goes on: a WhatsApp person behind them is sent, the run is not failed, and it says so when it finishes", async () => {
  for (const reason of ["email_offers_paused", "email_marketing_disabled"]) {
    const others = [];
    const { f } = world({
      message: versionsOf([], offerRows),
      batch: [on("email"), on("whatsapp", "k2"), on("email", "k3")],
      deliver: (d) =>
        d.channel === "email"
          ? heldBy(reason)(d)
          : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" },
      byOtherChannels: (_id, than) => (others.push(than), true),
      heldFor: [reason],
      remaining: 0,
      tally: { sent: 1, held: 2 },
    });
    const pages = [];
    f.ports.page = async (...args) => pages.push(args);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "skipped", reason],
        ["k2", "failed", OUTCOME_UNKNOWN],
        ["k2", "sent", null],
        ["k3", "failed", OUTCOME_UNKNOWN],
        ["k3", "skipped", reason],
      ],
      `${reason}: each email person is skipped with that reason, final, and the WhatsApp person is sent`,
    );
    assert.deepEqual(
      sendsOf(f).map((d) => [d.contactId, d.channel]),
      [
        ["k1", "email"],
        ["k2", "whatsapp"],
        ["k3", "email"],
      ],
      `${reason}: the door was asked about each, in order`,
    );
    assert.ok(!f.ops().includes("fail"), `${reason}: the run is not failed`);
    assert.deepEqual(others, ["email"], `${reason}: who else is on the run is asked once a batch, not of each person`);
    assert.deepEqual(
      f.log.filter((l) => l[0] === "alert").map((l) => l[1].kind),
      ["broadcast_sent"],
      `${reason}: the owner is told once, that it finished`,
    );
    assert.ok(f.ops().includes("finish") && !f.ops().includes("scheduleNext"), `${reason}: finished, not stopped`);
    assert.equal(pages.length, 0, `${reason}: nobody is paged for a person's refusal`);
    // The owner's news says what held them back, in words the run's own page uses.
    assert.match(call(f.log, "alert")[1].body, /1 of 3 people got it; 2 held back \(/);
    assert.ok(call(f.log, "alert")[1].body.includes(HELD_REASONS[reason]), reason);
  }
  assert.equal(HELD_REASONS.email_offers_paused, "offers and news by email are paused");
  assert.equal(HELD_REASONS.email_marketing_disabled, "no offers or news by email for now");
});

test("a pause on offers and news by email, or a campaigns domain that cannot be used, stops a run of email alone at the first person the door refuses, who is given back: nobody is skipped for good, and a playbook's run is not told to send it again", async () => {
  const stopped = async (reason, b) => {
    const { f } = world({
      broadcast: b ?? broadcast(),
      message: versionsOf([], offerRows),
      batch: [on("email"), on("email", "k2")],
      deliver: heldBy(reason),
      // Nobody on the run goes another way than email (the default answer): the hold is everyone's.
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
      `${reason}: the person the door was asked about is given back, and nobody after them is claimed`,
    );
    assert.equal(sendsOf(f).length, 1, `${reason}: the run stopped at the first refusal`);
    const alerts = f.log.filter((l) => l[0] === "alert");
    assert.equal(alerts.length, 1, `${reason}: the owner is told once`);
    assert.equal(alerts[0][1].kind, "broadcast_stopped");
    assert.match(alerts[0][1].subject, /^Campaign “.+” stopped$/, reason);
    assert.ok(
      !f.ops().includes("scheduleNext") && !f.ops().includes("finish"),
      `${reason}: stopped, not waiting or done`,
    );
    return { failure: call(f.log, "fail")[2], body: alerts[0][1].body, pages };
  };
  const paused = await stopped("email_offers_paused");
  assert.equal(paused.failure, "email_offers_paused");
  assert.equal(
    paused.body,
    "Offers by email are paused while complaints and bounces settle, so the rest was not sent. 2 people got it. Check your list for old or wrong addresses · offers by email come back on once it looks right. Send it again then.",
  );
  assert.equal(paused.pages.length, 0, "a gate's pause was paged where it tripped");
  const closed = await stopped("email_marketing_disabled");
  assert.equal(closed.failure, "campaigns_domain_unverified");
  assert.match(closed.body, /not verified with the mail provider right now.*Nothing is wrong with your mailbox/);
  assert.deepEqual(
    closed.pages.map((p) => [p[0], p[2]]),
    [
      [
        "campaigns_domain_unverified",
        "Tenant t1, broadcast b1 stopped, everyone not yet sent still queued: the door refused an offer by email (email_marketing_disabled): this runtime holds no verified campaigns domain.",
      ],
    ],
    "the platform hears of a domain",
  );
  // A playbook's run was made for today: it is not sent again by hand, and tomorrow's run reaches who this one did not.
  const playbook = await stopped("email_offers_paused", forMoment("everyone_monthly"));
  assert.match(
    playbook.body,
    /offers by email come back on once it looks right\. It does not run again today · tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice\.$/,
  );
  assert.doesNotMatch(playbook.body, /send it again/i);
  // The run's own page says the same next step.
  const { broadcastFailureFix } = await import("@chanlytics/contracts");
  assert.equal(
    broadcastFailureFix("email_offers_paused", 2, { playbook_id: "p1", trigger: "everyone_monthly" }),
    "Check your list for old or wrong addresses · offers by email come back on once it looks right. It does not run again today · tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.",
  );
  assert.match(
    broadcastFailureFix("email_offers_paused", 2, { playbook_id: null, trigger: null }),
    /^The first 2 got it, then/,
  );
});

test("a person's own refusal skips them with its reason and the run goes on to the next", async () => {
  // The person's own: skipped with the reason, and the run goes on to the next.
  for (const reason of ["opted_out", "not_opted_in", "no_marketing_consent", "email_suppressed", "recipient_changed"]) {
    const { f } = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: heldBy(reason) });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks().filter((m) => m[1] === "skipped"),
      [
        ["k1", "skipped", reason],
        ["k2", "skipped", reason],
      ],
      reason,
    );
    assert.ok(!f.ops().includes("fail"), reason);
  }
});

test("the business's own news by email carries an offer's foot and its link, as an offer does; a visit's email keeps the visit's foot", async () => {
  const { f, made } = news({ batch: [on("email", "k1", null)] });
  await sendBroadcastBatch(f.ports, cmd());
  assert.equal(made.length, 1);
  assert.deepEqual(
    Object.keys(made[0].offer ?? {}).sort(),
    ["footerHtml", "unsubscribeUrl"],
    "the offer's request: link and HTML foot",
  );
  assert.match(made[0].offer.unsubscribeUrl, /^https:\/\/app\.example\.com\/u\/k1-/);
  assert.equal(
    made[0].footer.split("\n").slice(0, 2).join("\n"),
    "You're a customer of Marisa's.\nMarisa's · 12 Main St, Springfield",
    "why they get it, and who and where",
  );
  assert.match(made[0].footer, /\nUnsubscribe: https:\/\/app\.example\.com\/u\//);
  assert.doesNotMatch(made[0].footer, /Reply STOP/);
  assert.equal(sendsOf(f)[0].about, "ours");
  assert.equal(
    sendsOf(f)[0].purpose,
    "conversational",
    "the message's own purpose is kept: the door decides what it is",
  );
  // A person who asked for offers by email says so.
  const asked = news({
    batch: [on("email", "k1", null)],
    contacts: (ids) => new Map(ids.map((id) => [id, { ...reachable[id], email_marketing: "opted_in" }])),
  });
  await sendBroadcastBatch(asked.f.ports, cmd());
  assert.match(asked.made[0].footer, /^You asked for offers from Marisa's\./);
  // A visit's email (the same words, a run made for the day before) has no link, and the visit foot's way out.
  const seen = [];
  const visit = world({ batch: [on("email")], emailRequest: (i) => (seen.push(i), frozen(i)) });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.equal(seen[0].offer, undefined, "no offer's link or HTML foot");
  assert.match(seen[0].footer, /Reply STOP/);
});

test("the business's own news by email is held when the business has no postal address or no link can be sealed, as an offer is; a visit's email is sent without either", async () => {
  const noAddress = news({ batch: [on("email", "k1", null)], facts: { ...visitFacts, address: null } });
  await sendBroadcastBatch(noAddress.f.ports, cmd());
  assert.deepEqual(noAddress.f.marks(), [["k1", "skipped", "no_business_address"]], "held before anyone is claimed");
  assert.equal(noAddress.made.length, 0);
  assert.equal(noAddress.f.of("queueEmail").length, 0);
  assert.ok("no_business_address" in HELD_REASONS);
  const noLink = news({ batch: [on("email", "k1", null)], unsubscribeUrl: null });
  await sendBroadcastBatch(noLink.f.ports, cmd());
  assert.deepEqual(noLink.f.marks(), [["k1", "skipped", "no_channel"]]);
  // The visit's run in the same workspace: no address needed, no link asked for.
  const visit = world({ batch: [on("email")], facts: { ...visitFacts, address: null }, unsubscribeUrl: null });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
});

test("the batch's head holds news by email as it holds an offer: a campaigns domain the provider does not verify skips the email people, one that could not be asked waits; a visit's run and a WhatsApp-only batch are not asked", async () => {
  const closed = news({
    batch: [on("email", "k1", null), on("whatsapp", "k2", null)],
    offersClosed: "campaigns.example.com is not verified",
    byOtherChannels: true,
  });
  closed.f.ports.page = async () => undefined;
  await sendBroadcastBatch(closed.f.ports, cmd());
  assert.ok(!closed.f.ops().includes("fail"), "the run is not failed");
  assert.deepEqual(
    closed.f.marks(),
    [
      ["k1", "skipped", "email_marketing_disabled"],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
    ],
    "the email person is held for it, never claimed; the WhatsApp person is sent",
  );
  assert.deepEqual(
    sendsOf(closed.f).map((d) => d.channel),
    ["whatsapp"],
  );
  // News by email alone stops the run with that said, as an offer's does: nobody is claimed or held.
  const alone = news({ batch: [on("email", "k1", null)], offersClosed: "campaigns.example.com is not verified" });
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "campaigns_domain_unverified"]);
  assert.deepEqual(alone.f.marks(), [], "nobody is claimed or held");
  assert.equal(sendsOf(alone.f).length, 0);
  const unread = news({
    batch: [on("email", "k1", null)],
    offersUnread: "the provider could not be asked",
    remaining: 1,
  });
  await sendBroadcastBatch(unread.f.ports, cmd());
  assert.ok(!unread.f.ops().includes("fail") && unread.f.ops().includes("scheduleNext"), "waits and asks again");
  assert.deepEqual(unread.f.marks(), []);
  // A visit's email is not an offer: the same closed domain does not hold it.
  const visit = world({ batch: [on("email")], offersClosed: "campaigns.example.com is not verified" });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  // Nobody in the batch goes by email: the campaigns domain is never asked about.
  const whatsapp = news({
    batch: [on("whatsapp", "k1", null)],
    offersClosed: new Error("never asked"),
    offersUnread: new Error("never asked"),
  });
  await sendBroadcastBatch(whatsapp.f.ports, cmd());
  assert.equal(sendsOf(whatsapp.f).length, 1);
});

/* ---------- A message needs no WhatsApp row (Lane 1): the batch reads the message once, and each person goes on their version -- */

test("a message with no WhatsApp row and a utility category goes to its email and text people on their own versions, as a message about their visit, and nobody is skipped for a WhatsApp row it has not got", async () => {
  const asked = [];
  const own = world({
    batch: [on("email"), on("sms", "k2"), on("email", "k3")],
    message: versionsOf(asked, { email: visitRows.email, sms: visitRows.sms }),
    // The adapter answers from the run's people: the email and the text people are not WhatsApp's.
    byOtherChannels: true,
  });
  await sendBroadcastBatch(own.f.ports, cmd());
  assert.deepEqual(own.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
    ["k3", "failed", OUTCOME_UNKNOWN],
    ["k3", "sent", null],
  ]);
  assert.deepEqual(
    sendsOf(own.f).map((d) => [d.contactId, d.channel, d.purpose]),
    [
      ["k1", "email", "conversational"],
      ["k2", "sms", "conversational"],
      ["k3", "email", "conversational"],
    ],
    "the own rows' category is the message's: a visit's words ask the yes to hearing from them, not the offers yes",
  );
  assert.ok(!own.f.ops().includes("fail"), "the run is not failed for a WhatsApp row it never had");
  assert.ok(own.f.ops().includes("finish"));
  assert.deepEqual(asked, [["visit_reminder", "en_US"]], "the message is read once for the batch");
});

test("a marketing message with no WhatsApp row is an offer by email as any is: held for the business's postal address without one; a utility one goes without", async () => {
  const noAddress = { ...visitFacts, address: null };
  const offer = world({
    batch: [on("email")],
    facts: noAddress,
    message: versionsOf([], { email: { ...visitRows.email, category: "marketing" } }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(offer.f.ports, cmd());
  assert.deepEqual(offer.f.marks(), [["k1", "skipped", "no_business_address"]], "held before anyone is claimed");
  assert.equal(offer.f.of("queueEmail").length, 0);
  assert.equal(sendsOf(offer.f).length, 0);
  const visit = world({
    batch: [on("email")],
    facts: noAddress,
    message: versionsOf([], { email: visitRows.email }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  assert.equal(sendsOf(visit.f)[0].purpose, "conversational");
});

test("a message whose WhatsApp row WhatsApp refused, or is whole to nobody, holds its WhatsApp people alone: the people on email go on their version and the run is not failed", async () => {
  const held = {
    // One WhatsApp is still checking waits instead (tests/campaigns/a-send-waits-for-whatsapp.test.mjs).
    rejected: { ...visitRows.whatsapp, meta_status: "rejected" },
    // Approved by Meta, but with a picture for a heading, which this product cannot put on the wire (contracts templateBlocked).
    blocked: {
      ...visitRows.whatsapp,
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: VISIT_WORDS },
      ],
    },
  };
  for (const [why, whatsapp] of Object.entries(held)) {
    const asked = [];
    const mixed = world({
      batch: [on("whatsapp"), on("email", "k3")],
      message: versionsOf(asked, { whatsapp, email: visitRows.email }),
      byOtherChannels: true,
    });
    await sendBroadcastBatch(mixed.f.ports, cmd());
    assert.deepEqual(
      mixed.f.marks(),
      [
        ["k1", "skipped", "template_not_approved"],
        ["k3", "failed", OUTCOME_UNKNOWN],
        ["k3", "sent", null],
      ],
      why,
    );
    assert.deepEqual(
      sendsOf(mixed.f).map((d) => [d.contactId, d.channel, d.purpose]),
      [["k3", "email", "conversational"]],
      why,
    );
    assert.ok(!mixed.f.ops().includes("fail"), `${why}: the run is not failed, somebody on it can be reached`);
    assert.ok(mixed.f.ops().includes("finish"), why);
    assert.deepEqual(asked, [["visit_reminder", "en_US"]], `${why}: one read`);
  }
});

test("a message whose only row is a WhatsApp one that cannot be sent, with everyone on the run going by WhatsApp, fails the run before a single send, and the owner is told why in the message's own words", async () => {
  const stopped = async (message) => {
    const alone = world({ batch: [on("whatsapp")], message, byOtherChannels: false });
    await sendBroadcastBatch(alone.f.ports, cmd());
    assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"]);
    assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "template_not_approved"]);
    const alert = call(alone.f.log, "alert")[1];
    assert.deepEqual(
      [alert.kind, alert.route, alert.about],
      ["broadcast_stopped", "campaigns/sequences/b1/runs/b1", { type: "broadcast", id: "b1" }],
    );
    assert.equal(alert.subject, "Campaign “Visit reminder · 2026-09-11” stopped");
    return alert.body;
  };
  assert.equal(
    await stopped(versionsOf([], { whatsapp: { ...visitRows.whatsapp, meta_status: "rejected" } })),
    "WhatsApp asked for a change to this message's words. AI writes new words for you to send back. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  assert.equal(
    await stopped(
      versionsOf([], {
        whatsapp: {
          ...visitRows.whatsapp,
          components: [
            { type: "HEADER", format: "IMAGE" },
            { type: "BODY", text: VISIT_WORDS },
          ],
        },
      }),
    ),
    "This message's WhatsApp version has a picture for a heading, so it cannot be sent from here. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  // The message has no row at all (the workspace removed its last version): it has no WhatsApp version to send.
  assert.equal(
    await stopped([]),
    "This message has no WhatsApp version. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
});

test("a read of the message that throws leaves the batch unsent and the error up, for the job to try again: the run is neither failed nor told WhatsApp withdrew it", async () => {
  const timeout = new Error("canceling statement due to statement timeout");
  const lost = world({ batch: [on("whatsapp"), on("email", "k3")], message: timeout, byOtherChannels: false });
  await assert.rejects(sendBroadcastBatch(lost.f.ports, cmd()), timeout);
  assert.deepEqual(lost.f.ops(), [], "nothing is written: the run is marked sending once its message is read");
  assert.deepEqual(lost.f.marks(), [], "nobody is claimed or held");
});

/* --------------------------------------------------------------------- an appointment asked again (decision 0002) */

test("a reminder asks its appointment again at the send: one cancelled, or gone from the calendar or moved after the run read it, holds its person (appointment_changed) and nobody else; one that stands, one the record has not written, a run drawn before the record, and one whose row is older than the run go; the rows are read once for the batch, and a read that fails holds nobody", async () => {
  const start = "2026-09-12T14:00:00.000Z";
  const read = "2026-09-11T13:05:00.000Z"; // the run read the calendar the day before
  const older = "2026-09-11T12:23:00.000Z"; // the hourly sync before the run
  const later = "2026-09-11T13:23:00.000Z"; // the one after it
  const drawn = (key) => ({ ...VISIT, appointment: key, visit_start: start, appointment_read_at: read });
  const batch = [
    on("sms", "k1", drawn("cancelled-one")),
    on("sms", "k2", drawn("stands")),
    on("sms", "k3", drawn("not-written")),
    on("sms", "k4", VISIT),
  ];
  const rows = new Map([
    ["cancelled-one", { status: "cancelled", starts_at: start, vanished_at: null, updated_at: older }],
    ["stands", { status: "booked", starts_at: start, vanished_at: null, updated_at: older }],
  ]);
  const asked = [];
  const { f } = world({
    batch,
    appointments: (keys) => {
      asked.push(keys);
      return rows;
    },
    contacts: (ids) =>
      new Map(
        ids.map((id) => [
          id,
          { ...reachable.k1, id, phone_e164: `+1347555010${id.slice(1)}`, display_name: `Person ${id}` },
        ]),
      ),
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(asked, [["cancelled-one", "stands", "not-written"]], "one read, the batch's keys once each");
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", "appointment_changed"],
      ["k2", "sent", null],
      ["k3", "sent", null],
      ["k4", "sent", null],
    ],
  );
  assert.equal(HELD_REASONS.appointment_changed, "their booking moved or was cancelled");

  // Gone from the calendar, or moved, at a read after the run's: held too.
  for (const row of [
    { status: "booked", starts_at: start, vanished_at: later, updated_at: later },
    { status: "booked", starts_at: "2026-09-12T15:00:00.000Z", vanished_at: null, updated_at: later },
  ]) {
    const { f: g } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: () => new Map([["x", row]]) });
    await sendBroadcastBatch(g.ports, cmd());
    assert.deepEqual(
      g.marks().filter(([, s]) => s !== "failed"),
      [["k1", "skipped", "appointment_changed"]],
    );
  }

  // The row is the older read: the owner moved the visit, or put it back, after the sync and before the run, and the
  // run's words say the time it saw. Sent, never held for the record's older word.
  for (const row of [
    { status: "booked", starts_at: "2026-09-12T13:00:00.000Z", vanished_at: null, updated_at: older },
    { status: "booked", starts_at: start, vanished_at: older, updated_at: older },
  ]) {
    const { f: g } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: () => new Map([["x", row]]) });
    await sendBroadcastBatch(g.ports, cmd());
    assert.deepEqual(
      g.marks().filter(([, s]) => s !== "failed"),
      [["k1", "sent", null]],
    );
  }

  // A read that fails holds nobody: the run read the live calendar when it drew them.
  const { f: h } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: new Error("statement timeout") });
  await sendBroadcastBatch(h.ports, cmd());
  assert.deepEqual(
    h.marks().filter(([, s]) => s !== "failed"),
    [["k1", "sent", null]],
  );
});

/* ---------------------------------------------- a deal asked again (the thank-you for a deal marked won) */

test("a thank-you for a deal marked won asks the deal again at the send: one taken back, lost, ended or gone holds its person (deal_changed) and nobody else; one still won goes; the stages are read once for the batch and only where a row names a deal; a read that fails leaves the batch queued, never sent on a guess", async () => {
  // The slots are the reminder's here (the fakes' message): what is proved is the row's own hold, whatever its words.
  const owed = (deal) => ({ ...VISIT, occasion: `won:${deal}`, deal, deal_was: "won" });
  const people = (ids) =>
    new Map(
      ids.map((id) => [
        id,
        { ...reachable.k1, id, phone_e164: `+1347555010${id.slice(1)}`, display_name: `Person ${id}` },
      ]),
    );
  const asked = [];
  const { f } = world({
    batch: [
      on("sms", "k1", owed("taken-back")),
      on("sms", "k2", owed("still-won")),
      on("sms", "k3", owed("lost")),
      on("sms", "k4", owed("ended")),
      on("sms", "k5", owed("gone")),
      on("sms", "k6", VISIT),
    ],
    dealStages: (ids) => {
      asked.push(ids);
      return new Map([
        ["taken-back", "proposed"],
        ["still-won", "won"],
        ["lost", "lost"],
        ["ended", "ended"],
      ]);
    },
    contacts: people,
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    asked,
    [["taken-back", "still-won", "lost", "ended", "gone"]],
    "one read, the batch's deals once each",
  );
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", "deal_changed"],
      ["k2", "sent", null],
      ["k3", "skipped", "deal_changed"],
      ["k4", "skipped", "deal_changed"],
      ["k5", "skipped", "deal_changed"],
      ["k6", "sent", null],
    ],
  );
  assert.equal(HELD_REASONS.deal_changed, "no longer marked as a client");

  // No row names a deal: the deals are never read, so no other campaign's send depends on them.
  const { f: none } = world({
    batch: [on("sms", "k1"), on("sms", "k2")],
    dealStages: new Error("the deals were read for a batch with no deal"),
  });
  await sendBroadcastBatch(none.ports, cmd());
  assert.deepEqual(
    none.marks().filter(([, s]) => s !== "failed"),
    [
      ["k1", "sent", null],
      ["k2", "sent", null],
    ],
  );

  // The stages could not be read: nobody is claimed, held or sent, and the batch is tried again.
  const { f: unread } = world({
    batch: [on("sms", "k1", owed("still-won")), on("sms", "k2", VISIT)],
    dealStages: new Error("statement timeout"),
    contacts: people,
  });
  await sendBroadcastBatch(unread.ports, cmd());
  assert.deepEqual(unread.marks(), [], "we could not read it is never it is still won");
  assert.deepEqual(sendsOf(unread), []);
});

/* ---------------------------------------------- the week's breath, at the wire (a send by hand) */

test("a person a send by hand left out for the week's breath is skipped at the wire with its reason and sent nothing, whatever the hold after the run did; a row with no such mark is sent as before", async () => {
  const { LEFT_OUT_FACTS, RECIPIENT_REASON_HEARD } = await import("@chanlytics/contracts");
  const f = fakes({
    batch: [
      // Marked in the run's own write (core createBroadcast); the hold after it lost the race to this batch.
      { contact_id: "k1", facts: LEFT_OUT_FACTS },
      // A row of the older shape, written before the breath: no facts at all.
      { contact_id: "k2", facts: null },
    ],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", RECIPIENT_REASON_HEARD],
      ["k2", "sent", null],
    ],
  );
  assert.deepEqual(
    f.of("deliver").map(([, d]) => d.contactId),
    ["k2"],
    "nothing went to the person left out",
  );
  assert.equal(HELD_REASONS[RECIPIENT_REASON_HEARD], "not sent: they hear from you within a week of it");
});

test("a reminder asks the owner's calendar feed as well as the record: a visit the feed no longer names holds its person (appointment_changed) though the record still says booked; one it names, a booking from the record, a visit outside the span it was read over, and a run drawn before the record go; the feed is asked once, only when a reminder needs it; no feed to ask goes on the record; one that cannot be read leaves its reminders queued, never sent on a guess (S1-05)", async () => {
  const start = "2026-09-12T14:00:00.000Z";
  const read = "2026-09-11T13:05:00.000Z";
  const older = "2026-09-11T12:23:00.000Z"; // the hourly sync before the run: the record has not heard of the calendar's change
  const drawn = (key, over = {}) => ({
    ...VISIT,
    appointment: key,
    visit_start: start,
    appointment_read_at: read,
    ...over,
  });
  const span = { from: Date.parse("2026-06-13T12:00:00Z"), to: Date.parse("2026-12-10T12:00:00Z") };
  const names = { keys: new Set(["on-the-calendar"]), ...span };
  const many = (ids) =>
    new Map(
      ids.map((id) => [
        id,
        { ...reachable.k1, id, phone_e164: `+1347555010${id.slice(1)}`, display_name: `Person ${id}` },
      ]),
    );
  const batch = [
    on("sms", "k1", drawn("cancelled-in-the-calendar")),
    on("sms", "k2", drawn("on-the-calendar")),
    on("sms", "k3", drawn("appt:0b1c2d")),
    on("sms", "k4", drawn("outside-the-span", { visit_start: "2027-03-01T10:00:00.000Z" })),
    on("sms", "k5", VISIT),
  ];
  // The record still says the cancelled visit is booked, as it does until the sweep marks it vanished.
  const record = () =>
    new Map([
      ["cancelled-in-the-calendar", { status: "booked", starts_at: start, vanished_at: null, updated_at: older }],
    ]);
  let asked = 0;
  const { f } = world({
    batch,
    appointments: record,
    feed: () => {
      asked += 1;
      return names;
    },
    contacts: many,
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.equal(asked, 1, "the feed is asked once for the batch");
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", "appointment_changed"],
      ["k2", "sent", null],
      ["k3", "sent", null],
      ["k4", "sent", null],
      ["k5", "sent", null],
    ],
    "gone from the calendar holds its person, though the record says booked; nobody else is held",
  );

  // Nothing in the batch was drawn for a calendar event: the feed is not asked.
  let idle = 0;
  const plain = world({
    batch: [on("sms", "k1", drawn("appt:0b1c2d")), on("sms", "k2")],
    feed: () => {
      idle += 1;
      return names;
    },
    contacts: many,
  });
  await sendBroadcastBatch(plain.f.ports, cmd());
  assert.equal(idle, 0, "a booking from the record and a run before the record ask the calendar nothing");

  // A workspace with no calendar feed (null), and a runtime that has none: the record alone, as before.
  for (const feed of [() => null, undefined]) {
    const { f: g } = world({
      batch: [on("sms", "k1", drawn("cancelled-in-the-calendar"))],
      appointments: record,
      ...(feed ? { feed } : {}),
      contacts: many,
    });
    await sendBroadcastBatch(g.ports, cmd());
    assert.deepEqual(
      g.marks().filter(([, state]) => state !== "failed"),
      [["k1", "sent", null]],
    );
  }

  // A feed that cannot be read: the reminder for a calendar event waits, queued, for the next batch (fail closed per
  // person), and a reminder that asks the calendar nothing goes.
  const { f: h } = world({
    batch: [on("sms", "k1", drawn("on-the-calendar")), on("sms", "k2")],
    feed: new Error("the calendar feed could not be read"),
    contacts: many,
  });
  await sendBroadcastBatch(h.ports, cmd());
  assert.deepEqual(
    h.marks().filter(([, state]) => state !== "failed"),
    [["k2", "sent", null]],
    "k1 is neither claimed nor skipped: it stays queued",
  );
  assert.equal(
    h.of("deliver").filter((d) => d[1].contactId === "k1").length,
    0,
    "and nothing was sent to a visit the calendar could not vouch for",
  );
});

test("every alert any run in this file raised opens the run it is about, and no other page (wiring task 1.7, A2b)", () => {
  // Eight senders say it: a run finished, stopped for its workspace, stalled, outside the hours, its wire down, its mail
  // limit, throttled, its message withdrawn. A notice that names its run and opens the list of runs is the gap A2b closed.
  assert.ok(alertsRaised.length >= 10, `the file's runs raised ${alertsRaised.length} alerts to check`);
  assert.deepEqual(
    alertsRaised.filter(
      (a) => a.about?.type !== "broadcast" || a.route !== `campaigns/sequences/${a.about.id}/runs/${a.about.id}`,
    ),
    [],
  );
});
