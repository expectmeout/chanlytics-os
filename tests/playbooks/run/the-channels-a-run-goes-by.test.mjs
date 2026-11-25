/**
 * One message, every channel (step 3): a run goes by the channels its playbook ticks, and a message needs no WhatsApp
 * row (lane 1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import {
  BY_TEXT_AND_EMAIL,
  D,
  FOLLOW_UPS,
  LAST_VISIT,
  NEXT_VISIT,
  NOBODY_LEFT,
  NOW,
  TZ,
  UTILITY,
  cmd,
  context,
  dto,
  fakes,
  followUp,
  followUpCtx,
  iso,
  messageOf,
  playbook,
  proposals,
  ready,
  reminder,
  reminderCtx,
  runPlaybook,
  visitors,
} from "./_run.mjs";

test("a run goes by the channels its playbook ticks: each person once, on the first that reaches them, written on their row; the row, the ledger and the reach say so", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email", "sms"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder(),
      ctx: context(
        reminderCtx([
          ["a", {}], // a number and an address, never wrote: WhatsApp, the first of the three
          ["b", { last_inbound_channel: "sms" }], // wrote by text last, and said yes by text: text
          ["c", { phone_e164: null }], // an address and no number: email
          ["d", { phone_e164: null, email: null }], // nowhere to send: held, and counted
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 3);
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "whatsapp"],
      ["b", "sms"],
      ["c", "email"],
    ],
    "each on one channel: the one they last wrote on first, else WhatsApp, text, email",
  );
  assert.deepEqual(row.channels, ["whatsapp", "sms", "email"]);
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 3, noNumber: 1, by_channel: { whatsapp: 1, sms: 1, email: 1 } },
    "who it left out, and why, and who it reaches on each channel, adding up to the list",
  );
  assert.deepEqual(f.of("assemble")[0][4].payload.channels, ["whatsapp", "sms", "email"]);
});

test("the number's daily limit is Meta's: it holds WhatsApp's people alone, and an email or a text is never held for it", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx(
          [
            ["a", {}],
            ["b", {}],
            ["c", { phone_e164: null }],
            ["d", { phone_e164: null }],
          ],
          { health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } },
        ),
      ),
    }),
  );
  assert.equal(r.eligible, 3, "one of the two on WhatsApp is past the day's limit; both by email go");
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "whatsapp"],
      ["c", "email"],
      ["d", "email"],
    ],
  );
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 3, overLimit: 1, by_channel: { whatsapp: 1, sms: 0, email: 2 } },
    "named, never dropped in silence, and the split still adds up to who it reaches",
  );
});

test("an address that bounced is counted as itself, not as no address and not as no channel: the run's reach says which, so the sheet can word each", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["email"] }),
      ctx: context(
        reminderCtx([
          ["a", {}], // an address that works: email
          ["b", { email_suppressed_at: "2026-09-01T10:00:00Z" }], // on file, and mail to it has stopped
          ["c", { email: null }], // no address on file at all
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 1);
  const [, row] = f.of("assemble")[0];
  assert.deepEqual(row.audience.reach, {
    ...NOBODY_LEFT,
    pool: 3,
    will: 1,
    no_address: 1,
    address_stopped: 1,
    by_channel: { whatsapp: 0, sms: 0, email: 1 },
  });
});

test("a channel the workspace is not ready on, or the message has no version on, holds those people and never fails the playbook: nobody is rerouted", async () => {
  const people = [
    ["a", {}],
    ["b", {}],
  ];
  // Email only, no mailbox: nobody can be reached, the run says so and goes on.
  const noMailbox = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  assert.deepEqual(
    await runPlaybook(
      noMailbox.ports,
      cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx(people, { ready: ready() })) }),
    ),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
  assert.deepEqual(noMailbox.log.at(-1)[4].reach, { ...NOBODY_LEFT, pool: 2, no_channel: 2 });
  // Ready on email, but the message has no email version in this language: the same.
  const noVersion = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["sms"] }) });
  const held = await runPlaybook(
    noVersion.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx(people)) }),
  );
  assert.equal(held.outcome, "empty");
  assert.equal(noVersion.log.at(-1)[4].reach.no_channel, 2);
  // WhatsApp is ticked and not ready: the people it cannot reach go by the channel that can, never by none.
  const offWhatsApp = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    offWhatsApp.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx(people, {
          ready: channelsReady({ whatsapp: null, textLine: null, email: { mailbox: true, domain: true } }),
        }),
      ),
    }),
  );
  assert.equal(r.eligible, 2);
  assert.deepEqual(
    offWhatsApp.of("assemble")[0][2].map((x) => x.channel),
    ["email", "email"],
  );
});

test("the number's health stops a run only when it ticks WhatsApp; a playbook made before ticks it alone, and the message is read once whatever the ticks", async () => {
  const flagged = numberHealth({ quality: "RED", event: null, limit: "TIER_1K" });
  const email = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const byEmail = await runPlaybook(
    email.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["a", {}]], { health: flagged })) }),
  );
  assert.equal(byEmail.outcome, "sent", "a run that does not tick WhatsApp never asks about its number");
  const both = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const stopped = await runPlaybook(
    both.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(reminderCtx([["a", {}]], { health: flagged })),
    }),
  );
  assert.equal(stopped.skipped, "number_flagged");
  // Made before the channels (no column, or none ticked): WhatsApp alone, and the message is read once, its email and
  // text versions among its rows, whatever the ticks.
  for (const channels of [undefined, null, []]) {
    const asked = [];
    const before = fakes({
      message: (name, language) => (
        asked.push([name, language]),
        messageOf({ whatsapp: UTILITY, own: ["email"] })(name, language)
      ),
    });
    const r = await runPlaybook(before.ports, cmd({ playbook: playbook({ channels }) }));
    assert.equal(r.outcome, "sent", String(channels));
    assert.deepEqual(before.of("assemble")[0][1].channels, ["whatsapp"]);
    assert.deepEqual(asked, [["winback_offer", "en_US"]], `${String(channels)}: the message, once`);
  }
  // A version that could not be looked for is the run failing, not a message without one: nothing is recorded.
  const blip = fakes({ message: new Error("PostgREST blip") });
  assert.deepEqual(
    await runPlaybook(
      blip.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(reminderCtx([["a", {}]])) }),
    ),
    { outcome: "failed", error: "template: PostgREST blip" },
  );
  assert.deepEqual(blip.ops(), []);
});

test("WhatsApp's template not approved holds WhatsApp's people alone: a run that also ticks email or text goes on for them, and stops on it only when nobody else is drawn", async () => {
  const rejected = { meta_status: "rejected", category: "utility" };
  const both = reminder({ channels: ["whatsapp", "sms", "email"] });
  // The people on email and text go on their versions; the person who has only WhatsApp is held, not drawn.
  const f = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: both,
      ctx: context(
        reminderCtx([
          ["a", {}], // WhatsApp first, and said yes by text too: goes by text, the next channel that can carry it
          ["c", { phone_e164: null }], // an address and no number: email
          ["w", { consent_channels: ["whatsapp"], email: null }], // WhatsApp alone: nothing else reaches them
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent", "the run is not stopped by a template WhatsApp alone needs");
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [
      ["a", "sms"],
      ["c", "email"],
    ],
    "nobody is drawn on WhatsApp: its version of the message is not approved",
  );
  // A run that ticks WhatsApp and has nobody on email or text to draw stops on it, as it always did.
  const alone = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: both, ctx: context(reminderCtx([["w", { consent_channels: ["whatsapp"], email: null }]])) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
  );
  assert.deepEqual(alone.ops(), ["record"]);
  // A playbook that does not tick WhatsApp never asks about its template at all.
  const byEmail = fakes({ message: messageOf({ whatsapp: rejected, own: ["email"] }) });
  const e = await runPlaybook(
    byEmail.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["c", { phone_e164: null }]])) }),
  );
  assert.equal(e.outcome, "sent");
  // The number's health still stops a run that ticks WhatsApp, whatever else it ticks.
  const flagged = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  const health = numberHealth({ quality: "RED", event: null, limit: "TIER_1K" });
  assert.equal(
    (await runPlaybook(flagged.ports, cmd({ playbook: both, ctx: context(reminderCtx([["a", {}]], { health })) })))
      .skipped,
    "number_flagged",
  );
});

test("a message with no WhatsApp row runs on the channels it holds: ticks {email, sms} on an email and a text version filed utility draw everyone who said yes to messages, each on their channel, and nothing stops the run", async () => {
  const f = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"], ownCategory: "utility" }) });
  const r = await runPlaybook(
    f.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.equal(r.outcome, "sent", "no WhatsApp row is no stop: the playbook does not tick WhatsApp");
  assert.equal(r.eligible, 2);
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "sms"],
      ["c", "email"],
    ],
    "each on the one channel that reaches them, the message's own versions: nobody on WhatsApp, which the message has no version on",
  );
  assert.deepEqual(row.channels, ["sms", "email"]);
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 2, noNumber: 1, noYes: 1, by_channel: { whatsapp: 0, sms: 1, email: 1 } },
    "who it left out, each counted by why: no number or address to send to, and no yes on the channels it goes by",
  );
  // The message's own category is what the run enrols by: the same people on the same moment, the same rows filed as an
  // offer, and nobody who said yes only to messages is enrolled (a text carries no offers, an email's offer needs its own yes).
  const asOffer = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"], ownCategory: "marketing" }) });
  const none = await runPlaybook(
    asOffer.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.deepEqual([none.outcome, none.eligible], ["empty", 0]);
  assert.deepEqual(asOffer.ops(), ["record"], "recorded as a run that found nobody, nothing made");
  // A row of its own that names no category is an offer, as the send reads it: the same.
  const unfiled = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"] }) });
  const unread = await runPlaybook(
    unfiled.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.equal(unread.outcome, "empty");
});

test("a message with no WhatsApp row stops no run that does not tick WhatsApp, and one that does tick it holds WhatsApp's people alone: it stops on it only when WhatsApp is all the run goes by", async () => {
  const noWhatsApp = () => fakes({ message: messageOf({ whatsapp: null, own: ["email"], ownCategory: "utility" }) });
  const byEmail = noWhatsApp();
  assert.equal(
    (
      await runPlaybook(
        byEmail.ports,
        cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["c", { phone_e164: null }]])) }),
      )
    ).outcome,
    "sent",
  );
  // WhatsApp and email: the run goes on for email, and the person who has only WhatsApp is held, not drawn.
  const both = noWhatsApp();
  const r = await runPlaybook(
    both.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx([
          ["c", { phone_e164: null }],
          ["w", { consent_channels: ["whatsapp"], email: null }],
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(
    both.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["c", "email"]],
  );
  assert.equal(
    both.of("assemble")[0][1].audience.reach.no_address,
    1,
    "the person WhatsApp alone reaches is held, counted by what the other channel lacks for them: an address",
  );
  // WhatsApp alone, with no WhatsApp version to send: the run stops on it, before anyone is drawn, as it did without a row.
  const alone = noWhatsApp();
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(reminderCtx([["a", {}]])) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
  );
  assert.deepEqual(alone.ops(), ["record"]);
});

test("a message WhatsApp is still looking at: the day's run waits for its answer, recording nothing, so the next sweep asks again (Ruben, 12 Nov 2026); in the day's last hour it holds WhatsApp's people and nobody else: {whatsapp, email} goes on for email and holds the person only WhatsApp reaches; {whatsapp} alone stops on it", async () => {
  const pending = { meta_status: "pending", category: "utility" };
  const people = [
    ["a", {}], // a number and an address: WhatsApp is held, so email
    ["w", { consent_channels: ["whatsapp"], email: null }], // WhatsApp alone: held
  ];
  // During the day, whichever channels it ticks beside WhatsApp, and whoever asks: it waits, and its day stays open.
  for (const channels of [["whatsapp"], ["whatsapp", "email"]])
    for (const by of [{ kind: "system" }, { kind: "user", userId: "u1" }]) {
      const waits = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
      const run = cmd({ playbook: reminder({ channels }), ctx: context(reminderCtx(people)), by });
      assert.deepEqual(await runPlaybook(waits.ports, run), {
        outcome: "off",
        mode: "auto",
        skipped: "template_in_review",
      });
      assert.deepEqual(waits.ops(), [], "nothing is recorded of a run that waits");
    }
  // A message WhatsApp is holding for a few hours (its pause, which lifts by itself) is waited out the same way.
  const held = fakes({ message: messageOf({ whatsapp: { ...pending, meta_status: "paused" }, own: ["email"] }) });
  const onHold = cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(reminderCtx(people)) });
  assert.equal((await runPlaybook(held.ports, onHold)).skipped, "template_on_hold");
  assert.deepEqual(held.ops(), []);
  // One that does not tick WhatsApp never waits for it.
  const byEmail = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
  const emailed = cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx(people)) });
  assert.equal((await runPlaybook(byEmail.ports, emailed)).outcome, "sent");
  // The day's last hour (20:30 in New York): the answer did not come, and the run goes on as it would without.
  const lastHour = { now: new Date("2026-09-07T00:30:00Z") };
  const both = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
  const r = await runPlaybook(
    both.ports,
    cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(reminderCtx(people, lastHour)) }),
  );
  assert.equal(r.outcome, "sent", "template_not_approved is not the outcome: someone is on email");
  assert.deepEqual(
    both.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["a", "email"]],
  );
  assert.equal(
    both.of("assemble")[0][1].audience.reach.no_address,
    1,
    "the person only WhatsApp reaches is held, counted by the address they lack, never dropped in silence",
  );
  const alone = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(reminderCtx(people, lastHour)) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
    "WhatsApp is all this run goes by, and its version is not approved",
  );
  assert.deepEqual(alone.ops(), ["record"]);
});

test("a message with no row of any channel is a message that is gone: nothing is held, so a run that ticks WhatsApp stops on it, and one by email alone finds nobody", async () => {
  const gone = () => fakes({ message: messageOf({ whatsapp: null }) });
  const people = reminderCtx([["a", {}]]);
  const alone = gone();
  assert.equal(
    (await runPlaybook(alone.ports, cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(people) })))
      .skipped,
    "template_not_approved",
  );
  const both = gone();
  assert.equal(
    (
      await runPlaybook(
        both.ports,
        cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(people) }),
      )
    ).skipped,
    "template_not_approved",
    "nobody is drawn on a message that holds nothing, and WhatsApp is ticked",
  );
  const email = gone();
  assert.deepEqual(
    await runPlaybook(email.ports, cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(people) })),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
});

test("a run counts the month before it enrolls: whoever is past the room is enrolled held, and the run's page says so up front", async () => {
  const asked = [];
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: (channel) => (asked.push(channel), 1999),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 4, "everyone is enrolled, the held among them");
  assert.deepEqual(asked, ["email"], "only the channel somebody goes by is counted, once, before the run is written");
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients", "record"]);
  assert.deepEqual(
    f.of("holdRecipients")[0],
    ["holdRecipients", "b1", ["e2", "e3"], "month_allowance"],
    "one email left in the month: the first on email keeps it, the others are held, in the order drawn",
  );
  assert.equal(
    f.of("assemble")[0][1].audience.trigger,
    "proposal_waiting",
    "the run keeps its moment for the send's own check",
  );
  assert.equal(f.of("record")[0][4].held_for_allowance, 2, "and the run's record says how many");
  assert.equal("hold_unwritten" in f.of("record")[0][4], false);
});

test("a run is counted against the month it goes in: asked for at eleven on the last night of the month, it goes at nine on the first, and the new month's room is read", async () => {
  const lastNight = new Date("2026-10-01T03:00:00Z"); // 23:00 on 30 September in New York
  const nine = new Date("2026-10-01T13:00:00Z"); // 09:00 on 1 October
  const at = [];
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: (_channel, when) => (at.push(when), 0),
  });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: followUp(),
      ctx: context({ ...followUpCtx(proposals(FOLLOW_UPS)), now: lastNight }),
      by: { kind: "user", userId: "u1" },
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(f.of("assemble")[0][3], nine, "the run goes at nine on the first");
  assert.deepEqual(
    at,
    [nine],
    "and the month it is counted against is the one it goes in, never the night it was asked for",
  );
});

test("a proposal's follow-up touches its people as one had, and not those the month's allowance holds: the next run against the same read neither follows the proposal up twice nor breathes on them", async () => {
  const ctx = context(followUpCtx(proposals(FOLLOW_UPS)));
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }), monthSent: 1999 });
  assert.equal((await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx }))).outcome, "sent");
  assert.deepEqual(
    [...ctx.touches.followUps.keys()].sort(),
    ["e1", "w"],
    "e2 and e3 are held for the month: skipped, touched by nothing",
  );
  assert.deepEqual([...ctx.touches.byAny.keys()].sort(), ["e1", "w"]);
});

test("a person with two proposals out (0029): the run follows up the one waiting longest, once, its words carry that proposal's link, and its touch keeps it, so the other is owed its own", async () => {
  // A remodel's proposal out twenty days and a kitchen's out ten, as people_list reads them: the row shows the newer,
  // and open_deals holds both, the newest first.
  const open = (id, service, days, url) => ({
    id,
    stage: "proposed",
    service,
    proposed_at: iso(days * D),
    decided_at: null,
    ended_at: null,
    amount_cents: null,
    per: null,
    currency: "USD",
    proposal_url: url,
    valid_until: null,
    lost_reason: null,
  });
  const KITCHEN = "https://example.com/p/kitchen";
  const REMODEL = "https://example.com/p/remodel";
  const both = toPersonRowVM(
    dto("w", {
      deal_id: "deal-k",
      deal_stage: "proposed",
      deal_service: "Kitchen",
      deal_proposed_at: iso(10 * D),
      deal_proposal_url: KITCHEN,
      open_deals: [open("deal-k", "Kitchen", 10, KITCHEN), open("deal-r", "Remodel", 20, REMODEL)],
      last_inbound_at: iso(25 * D),
      consent_channels: ["whatsapp", "sms"],
      email: "w@example.com",
    }),
    TZ,
    NOW,
  );
  const ctx = context(followUpCtx([both]));
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }), monthSent: 0 });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx }));
  assert.deepEqual([r.outcome, r.eligible], ["sent", 1], "one person, one message, whatever they have out");
  const [, , recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.facts?.proposal_link, x.facts?.deal_id]),
    [["w", REMODEL, "deal-r"]],
    "the one waiting longest, with its own link and its deal, though their row shows the kitchen's",
  );
  assert.deepEqual(
    [...(ctx.touches.followUpKeys.get("w") ?? new Map()).keys()],
    ["deal:deal-r"],
    "the touch keeps which proposal it was about: the kitchen's is still owed its own",
  );
});

test("a hold that could not be written leaves the people queued: the run is made, and its record says so", async () => {
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: 2000,
    holdRecipients: new Error("write failed"),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "sent");
  const record = f.of("record")[0][4];
  assert.equal(record.held_for_allowance, 3);
  assert.equal(record.hold_unwritten, 3, "queued, and held at the wire all the same");
});

test("a visit reminder and the check after a visit are never held by the month: they are not even counted against it", async () => {
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const f = fakes({
      message: messageOf({ whatsapp: UTILITY, own: ["email", "sms"] }),
      monthSent: new Error("a visit's message never asks the month"),
    });
    // The reminder reads tomorrow's visit; the check after a visit reads yesterday's, when nothing is booked next.
    const when = trigger === "visit_tomorrow" ? { next: NEXT_VISIT, last: null } : { next: null, last: LAST_VISIT };
    const specs = FOLLOW_UPS.map(([id]) => [id, id === "w" ? {} : { phone_e164: null }]);
    const r = await runPlaybook(
      f.ports,
      cmd({
        playbook: reminder({ trigger, channels: ["whatsapp", "email"] }),
        ctx: context({ ...reminderCtx(specs), ...visitors(specs, when) }),
      }),
    );
    assert.equal(r.outcome, "sent", `${trigger}: ${JSON.stringify(r)}`);
    assert.equal(r.eligible, 4);
    assert.equal(f.of("holdRecipients").length, 0, `${trigger}: nobody held, with the month used up many times over`);
    assert.equal(f.of("assemble")[0][1].audience.trigger, trigger, "and the send knows it is one");
  }
});

test("a booking moment that sends an OFFER is metered like any other: the exemption is a message about a visit, never the moment's", async () => {
  // A playbook made before messages were checked against their moments: a visit moment whose message is an offer. Its run
  // enrols by the stricter purpose (an offer), so it is metered as an offer is, and the send's own check says the same.
  const OFFER = { meta_status: "approved", category: "marketing" };
  const offersOpen = channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const specs = [
    ["e1", { phone_e164: null, email_marketing: "opted_in" }],
    ["e2", { phone_e164: null, email_marketing: "opted_in" }],
  ];
  const asked = [];
  const f = fakes({
    message: messageOf({ whatsapp: OFFER, own: ["email"] }),
    monthSent: (channel) => (asked.push(channel), 2000),
  });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["email"] }),
      ctx: context({ ...reminderCtx(specs), ready: offersOpen }),
    }),
  );
  assert.equal(r.outcome, "sent", JSON.stringify(r));
  assert.equal(r.eligible, 2);
  assert.deepEqual(asked, ["email"], "the month is counted: an offer is not exempt, whatever its moment");
  assert.deepEqual(f.of("holdRecipients")[0], ["holdRecipients", "b1", ["e1", "e2"], "month_allowance"]);
  assert.equal(f.of("record")[0][4].held_for_allowance, 2);
  assert.equal(
    f.of("assemble")[0][1].audience.trigger,
    "visit_tomorrow",
    "and the send reads the same moment and message",
  );
});

test("a month that could not be counted is not room: the run fails, records nothing, and the next sweep counts again", async () => {
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: new Error("rpc: connection reset"),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "failed");
  assert.match(r.error, /^month: rpc: connection reset/);
  assert.deepEqual(f.ops(), [], "no run, no people, no job, no record: nothing says the day was spent");
  // A run by WhatsApp alone has nobody to count for: it never asks.
  const wa = fakes({ message: messageOf({ whatsapp: UTILITY }), monthSent: new Error("never asked") });
  const ok = await runPlaybook(
    wa.ports,
    cmd({ playbook: followUp({ channels: ["whatsapp"] }), ctx: context(followUpCtx(proposals([["w", {}]]))) }),
  );
  assert.equal(ok.outcome, "sent");
});
