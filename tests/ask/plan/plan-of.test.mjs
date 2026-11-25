/**
 * A plan, with no model (contracts planOf): each rule of the marketing manager's §5.4 table, executed and deep-equal on
 * the steps and the plan's words; an offer asked in Spanish; every step's input its action's input. The plans' world is
 * _plan-of.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  EN,
  ES_REMINDS,
  ES_ROWS,
  ES_WAITS_CHECK,
  OWN,
  PAUSES,
  PENDING_WA,
  REMINDS,
  ROWS,
  SCHEMAS,
  STEP_TOKEN,
  TODAY,
  US_PAUSED,
  V,
  W,
  WAITS_CHECK,
  doorTakes,
  esMonthsOffer,
  esWorld,
  filed,
  monthsOffer,
  monthsOfferMessage,
  offer,
  offersList,
  planOf,
  quickNote,
  resolveSteps,
  shape,
  stepToken,
  world,
  writtenOffer,
} from "./_plan-of.mjs";

for (const row of ES_ROWS) {
  test(`in Spanish: ${row.name}`, () => {
    const out = planOf(row.intent, row.world);
    if (row.refused) {
      assert.deepEqual(out, { refused: row.refused });
      return;
    }
    assert.ok("steps" in out, `planned, not refused: ${JSON.stringify(out)}`);
    assert.deepEqual(shape(out.steps), row.steps);
    assert.equal(out.words, row.words.join(" "));
    assert.equal(out.lead ?? null, null);
    // Spanish throughout: past the names it quotes (a message's, a list's, a campaign's), no English word is said.
    const said = out.words.replace(/«[^»]*»/g, "«»");
    assert.doesNotMatch(said, /\b(?:the|and|to|of|on|it|goes|sends?|offer|approve|until|after|calendar)\b/i, said);
  });
}

test("in Spanish too, what no card carries comes first: the answer's detail, cut at its 700 characters, keeps the reminder whole and the review after it", () => {
  const cap = C.ASK_ANSWER_CAPS.plan;
  const worlds = [
    ...ES_ROWS.filter((r) => r.pastTheCap).map((r) => [r.name, r.intent, r.world]),
    [
      "both channels open, a new message, the month's offer running and a tight later room",
      offer(),
      esWorld({ playbooks: [esMonthsOffer()], room: { open: 15, days: 14 } }),
    ],
  ];
  assert.equal(worlds.length, 3);
  for (const [name, intent, w] of worlds) {
    const out = planOf(intent, w);
    assert.ok("words" in out, `${name}: planned`);
    const detail = C.clip(out.words, cap);
    assert.ok(out.words.length > cap, `${name}: past the cap (${out.words.length}), so the cut is what is proved`);
    assert.ok(detail.includes(ES_REMINDS()), `${name}: the reminder whole in ${detail}`);
    if (out.words.includes(ES_WAITS_CHECK))
      assert.ok(out.words.indexOf(ES_WAITS_CHECK) > out.words.indexOf(ES_REMINDS()), `${name}: the review after it`);
    assert.ok(detail.includes("Pausa la oferta del mes"), `${name}: the pause to resume whole`);
  }
});

test("every reason contracts writes for an offer's channel is said in Spanish; one of Meta's own is said as it was written", () => {
  const ES = C.OFFER_PLAN_WORDS.es;
  const B = C.OFFERS_BY_EMAIL_WORDS;
  const ours = [
    C.CHANNEL_WORDS.noWhatsApp,
    C.CHANNEL_WORDS.noMailbox,
    C.CHANNEL_WORDS.noEmailDomain,
    C.CHANNEL_WORDS.unchecked,
    C.CHANNEL_WORDS.noOffersByEmailYet,
    B.noCampaignsDomain,
    B.noAddress,
    B.paused,
    US_PAUSED,
  ];
  for (const why of ours) {
    const said = ES.reason(why);
    assert.notEqual(said, why, why);
    assert.match(said, /^[A-ZÁÉÍÓÚÑ¿¡].*\.$/u, said);
  }
  assert.equal(ES.reason(null), ES.reason(C.CHANNEL_WORDS.unchecked), "no reason given is not checked");
  assert.equal(EN.reason(null), C.CHANNEL_WORDS.unchecked);
  const meta = "Meta has stopped this number from sending: the display name was rejected.";
  assert.equal(ES.reason(meta), meta);
  // The English and Spanish words say the same sentences.
  assert.deepEqual(Object.keys(ES).sort(), Object.keys(EN).sort());
});

for (const row of ROWS) {
  test(row.name, () => {
    const out = planOf(row.intent, row.world);
    if (row.refused) {
      assert.deepEqual(out, { refused: row.refused });
      return;
    }
    assert.ok("steps" in out, `planned, not refused: ${JSON.stringify(out)}`);
    assert.deepEqual(shape(out.steps), row.steps);
    assert.equal(out.words, row.words.join(" "));
    // What the answer leads with: a setup that waits on something, none for every other plan.
    assert.deepEqual(out.lead ?? null, row.lead ?? null);
    for (const s of out.steps) assert.ok(typeof s.why === "string" && s.why.length > 0, `step ${s.n} says why`);
  });
}

test("what no card carries comes first, so the answer's detail, cut at its own 700 characters, keeps the reminder whole, and the review after it: the worlds measured past the cap (batch P's reviews and the final cleanup)", () => {
  const cap = C.ASK_ANSWER_CAPS.plan;
  const both = world({ playbooks: [monthsOffer()], room: { open: 15, days: 14 } });
  const worlds = [
    ...ROWS.filter((r) => r.pastTheCap).map((r) => [r.name, r.intent, r.world]),
    ["both channels open, a new message, the month's offer running and a tight later room", offer(), both],
  ];
  assert.equal(worlds.length, 4);
  for (const [name, intent, w] of worlds) {
    const out = planOf(intent, w);
    assert.ok("words" in out, `${name}: planned`);
    const detail = C.clip(out.words, cap);
    assert.ok(out.words.length > cap, `${name}: past the cap (${out.words.length}), so the cut is what is proved`);
    assert.ok(detail.includes(REMINDS), `${name}: the reminder whole in ${detail}`);
    // WhatsApp's review of a send it holds is said on the send's card too (plan-steps.ts reviewedStep), so it comes after
    // the reminder, and a cut takes it before anything no card says.
    if (out.words.includes(WAITS_CHECK))
      assert.ok(out.words.indexOf(WAITS_CHECK) > out.words.indexOf(REMINDS), `${name}: the review after the reminder`);
    if (out.words.includes(PAUSES)) assert.ok(detail.includes(PAUSES), `${name}: the pause to resume whole`);
  }
});

test("the review refusal's advice holds whichever versions the message in review has: email named, the offer goes by email now; channels left out, a message with WhatsApp's version alone is twinned and the send waits on WhatsApp's review again (final cleanup)", () => {
  const waOnly = writtenOffer({ versions: [{ channel: "whatsapp", id: V(21), state: "pending" }] });
  for (const [what, message] of [
    ["both versions", monthsOfferMessage({ versions: PENDING_WA })],
    ["WhatsApp's alone", waOnly],
  ]) {
    const out = planOf(offer({ channels: ["email"] }), world({ messages: [message] }));
    assert.ok("steps" in out, `${what}: ${JSON.stringify(out)}`);
    const send = out.steps.at(-1);
    assert.deepEqual([send.kind, send.input.channels], ["broadcast", ["email"]], what);
    assert.ok(!out.words.includes(WAITS_CHECK) && !out.words.includes(EN.whatsappReview), `${what}: ${out.words}`);
  }
  const left = planOf(offer(), world({ messages: [waOnly] }));
  assert.ok("steps" in left && left.words.includes(WAITS_CHECK), JSON.stringify(left));
});

test("the refusals and the words the brief names are words, and the pace is the open slots a day", () => {
  for (const k of ["fromAfterUntil", "fromPast", "noChannelNamed", "noOffersList"])
    assert.equal(typeof W[k], "string", k);
  assert.equal(typeof W.noChannel([], []), "string", "noChannel says the channels it is given");
  // The pace: today's offer on a tight room goes as a campaign of the open slots a day, rounded up, at least one.
  for (const [room, audience, cap, said] of [
    [{ open: 15, days: 14 }, 40, 2, /15 open slots in the next 14 days for 40 people.*up to 2 a day/],
    [{ open: 9, days: 1 }, 40, 9, /9 open slots in the next 1 day for 40 people.*up to 9 a day/],
    [{ open: 0, days: 14 }, 3, 1, /no open slot in the next 14 days for 3 people.*up to 1 a day/],
  ]) {
    const out = planOf(offer(TODAY), world({ messages: [monthsOfferMessage()], room, lists: [offersList(audience)] }));
    assert.ok("steps" in out, JSON.stringify(out));
    assert.equal(out.steps.at(-1).input.cap_per_run, cap, JSON.stringify(room));
    assert.match(out.words, said);
  }
  // A tight room for a later offer: the send reaches the whole list on its day, so pacing it is dismissing the send.
  assert.equal(
    EN.roomTight({ open: 1, days: 14 }, 40, "Nov 1"),
    "The calendar has 1 open slot in the next 14 days for 40 people, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on Nov 1.",
  );
  // A send on a WhatsApp version being checked, a one-off or a campaign, says its WhatsApp people wait; nothing says it
  // waits for a second press.
  assert.equal("reviewFirst" in EN, false);
  assert.match(WAITS_CHECK, /waits for it/);
  // The channels' own reasons are said, never a sentence of the plan's about a missing number.
  for (const r of ROWS.filter((x) => !x.refused))
    assert.ok(!planOf(r.intent, r.world).words.includes("no WhatsApp number is connected"), r.name);
  assert.doesNotMatch(
    Object.values(W)
      .filter((w) => typeof w === "string")
      .join(" "),
    /\bMeta\b/,
  );
});

test("a step's token is @step:n, and resolveSteps fills every one from what the plan made", () => {
  assert.equal(stepToken(2), "@step:2");
  assert.ok(STEP_TOKEN.test("@step:12"));
  assert.ok(!STEP_TOKEN.test("@step:2x") && !STEP_TOKEN.test("@first_name"));
  const payload = {
    template_id: stepToken(1),
    audience_kind: "saved",
    audience_id: stepToken(2),
    params: ["@first_name", "@step:2x"],
    deep: { lists: [stepToken(2)] },
  };
  const made = { 1: { kind: "message", id: V(1) }, 2: { kind: "list", id: OWN } };
  assert.deepEqual(resolveSteps(payload, made), {
    template_id: V(1),
    audience_kind: "saved",
    audience_id: OWN,
    params: ["@first_name", "@step:2x"],
    deep: { lists: [OWN] },
  });
  assert.deepEqual(resolveSteps(payload, { 1: made[1] }), { unresolved: 2 });
  assert.equal(payload.audience_id, stepToken(2), "the payload it was given is left as it was");
});

test("every step's input is the input of the Ask action it is expanded through", () => {
  const seen = new Set();
  for (const row of ROWS.filter((r) => !r.refused)) {
    const out = planOf(row.intent, row.world);
    for (const s of out.steps) {
      seen.add(s.kind);
      // Every key its own, `until` on a new campaign among them (Task 17).
      const parsed = SCHEMAS[s.kind].strict().safeParse(s.input);
      assert.ok(parsed.success, `${row.name}, step ${s.n} (${s.kind}): ${JSON.stringify(parsed.error?.issues)}`);
      if (s.kind === "note") assert.ok(C.AskSettingsChangeSchema.safeParse(s.input.change).success, row.name);
      if (s.kind === "message") doorTakes(s, row.name);
    }
  }
  assert.deepEqual([...seen].sort(), ["broadcast", "change", "message", "note", "playbook"]);
});

test("the Spanish message is written in Spanish, the starter's Spanish values, the offer typed into its own", () => {
  const out = planOf(offer({}, "10% de descuento en todo noviembre"), world({ language: "es" }));
  const [message, , first] = out.steps;
  doorTakes(message, "the Spanish message");
  assert.equal(message.input.language, "es");
  assert.deepEqual(message.input.versions, {
    whatsapp: {
      body: "Hola {{1}}, una oferta de {{2}}: {{3}} Reserva aquí: {{4}} o responde con el día que mejor te venga.\n\nResponde STOP para darte de baja",
    },
    email: {
      subject: "Una oferta de {{2}}",
      body: "Hola {{1}}:\n\nUna oferta de {{2}}: {{3}}\n\nReserva aquí: {{4}}, o responde con el día que mejor te venga.",
    },
  });
  assert.deepEqual(
    message.input.slots.map((s) => [s.label, s.kind]),
    [
      ["Nombre", "first_name"],
      ["Nombre del negocio", "business_name"],
      ["La oferta", "text"],
      ["Enlace de reservas", "booking_link"],
    ],
  );
  assert.deepEqual(first.input.params, [
    "@first_name",
    "@business_name",
    "10% de descuento en todo noviembre.",
    "@booking_link",
  ]);
  // An English message's offer value is not the Spanish one's: an English offer message is not reused in Spanish.
  const english = planOf(offer(), world({ language: "es", messages: [writtenOffer({ language: "es" })] }));
  assert.equal(english.steps[0].kind, "message", "written in Spanish, not the English-labelled one sent");
  // Written under the next free name, and held to the door's checks as every written message is (carry-forward c).
  assert.equal(english.steps[0].input.name, "offer_2");
  doorTakes(english.steps[0], "the Spanish offer_2");
});

test("a name the Library holds is not written twice", () => {
  const out = planOf(offer(), world({ messages: [{ ...monthsOfferMessage(), name: "offer", slots: [] }] }));
  const [message] = out.steps;
  assert.equal(message.input.name, "offer_2");
  doorTakes(message, "offer_2");
});

test("the message one plan writes is the message the next plan sends, with that offer's own words, by WhatsApp and email while WhatsApp still checks its WhatsApp version, its WhatsApp people waiting for the check, never a twin (ruling 1 of the pre-review; WhatsApp kept since 16 Nov 2026)", () => {
  const first = planOf(offer(), world({ messages: [quickNote()] }));
  const [written] = first.steps;
  doorTakes(written, "the first plan's message");
  const weekend = "20% off every booking this weekend";
  const next = planOf(
    offer({ words: weekend, from: "2026-10-17", until: "2026-10-18" }),
    world({ messages: [quickNote(), filed(written)] }),
  );
  assert.deepEqual(shape(next.steps), [
    {
      n: 1,
      kind: "note",
      silent: true,
      after: [],
      input: {
        change: {
          op: "add_note",
          title: `Offer: ${weekend}`,
          text: `The offer: ${weekend}. It runs from Oct 17 to Oct 18.`,
          until: "2026-10-18",
        },
      },
    },
    {
      n: 2,
      kind: "broadcast",
      silent: false,
      after: [1],
      input: {
        // Its WhatsApp version, the message's anchor as every broadcast card names it: being checked, the send waits for it.
        template_id: V(5),
        audience_kind: "list",
        audience_id: "offers_ok",
        params: ["@first_name", "@business_name", `${weekend}.`, "@booking_link"],
        scheduled_for: "2026-10-17T14:00:00.000Z",
        name: `Offer: ${weekend}`,
        channels: ["whatsapp", "email"],
      },
    },
  ]);
  assert.equal(
    next.words,
    [
      EN.reminderAsk("Oct 18", "Can receive offers"),
      WAITS_CHECK,
      "Sends “offer”, already in your messages, with the offer in its words.",
      "Tells AI about the offer, until Oct 18.",
      "The offer goes to “Can receive offers” on Oct 17 at 10:00 AM.",
    ].join(" "),
  );
  // In Spanish too: the Spanish message a plan writes is the one the next Spanish plan sends.
  const es = planOf(offer({}, "10% de descuento"), world({ language: "es" }));
  const [esWritten] = es.steps;
  doorTakes(esWritten, "the first Spanish plan's message");
  const again = planOf(offer({ words: "Fin de semana" }), world({ language: "es", messages: [filed(esWritten)] }));
  assert.equal(again.steps.filter((s) => s.kind === "message").length, 0, "reused, not written again");
});

test("what a send types is read on its own day: the owner's phrasing where it names no day from today and is not the ask itself, else the offer's words; words that name one are refused, but for an offer of today alone (the offer-words eval, 16 Oct 2026)", () => {
  const typed = (out) => out.steps.find((s) => s.kind === "broadcast").input.params[2];
  const note = (out) => out.steps.find((s) => s.kind === "note").input.change.text;
  for (const [say, words, line] of [
    // The eval's own: "all next month" typed into a message that sends on Nov 1, where it reads as December.
    ["10% off colour all next month", "10% off colour all November", "10% off colour all November."],
    [
      "10% de descuento en todo el mes que viene",
      "10% de descuento en todo noviembre",
      "10% de descuento en todo noviembre.",
    ],
    // The ask itself, which a customer would read first.
    [
      "Quiero ofrecer un 10% de descuento en todo noviembre",
      "10% de descuento en todo noviembre",
      "10% de descuento en todo noviembre.",
    ],
    ["I want to offer 10% off all November", "10% off all November", "10% off all November."],
    ["Empieza mañana: un 10%", "10% en noviembre", "10% en noviembre."],
    // A time of day and a weekday name no day from today: the owner's phrasing is what the message says.
    ["Un 10% por la mañana, todo noviembre", "10% en noviembre", "Un 10% por la mañana, todo noviembre."],
    ["10% off every Monday in November", "10% off in November", "10% off every Monday in November."],
  ]) {
    const out = planOf(offer({ words }, say), world({ messages: [monthsOfferMessage()] }));
    assert.ok("steps" in out, JSON.stringify(out));
    assert.equal(typed(out), line, say);
    assert.ok(note(out).startsWith(`The offer: ${line} `), note(out));
  }
  // The offer's words title its note and its send, read until its last day: a day from today is refused, by name.
  for (const [words, day] of [
    ["10% off all next month", "next month"],
    ["15% en todo el próximo mes", "el próximo mes"],
    ["20% off this weekend", "this weekend"],
    ["10% de descuento la semana que viene", "la semana que viene"],
  ])
    assert.deepEqual(planOf(offer({ words }), world()), { refused: W.dayFromToday(day, "Nov 1") }, words);
  // An offer of today alone is read on the day it was said: its words stand.
  const today = planOf(
    offer({ words: "20% off today only", from: "2026-10-11", until: "2026-10-11" }),
    world({ messages: [monthsOfferMessage()] }),
  );
  assert.ok("steps" in today, JSON.stringify(today));
  assert.equal(typed(today), "20% off today only.");
  // A "this" span is read from the offer's first day: right where the offer lies within it, as a weekend's two days or
  // a month's offer within its month, whatever day it was asked.
  for (const [words, from, until] of [
    ["20% off every booking this weekend", "2026-10-17", "2026-10-18"],
    ["10% off all this month", "2026-11-01", "2026-11-30"],
    ["15% este fin de semana", "2026-10-16", "2026-10-18"],
  ]) {
    const out = planOf(offer({ words, from, until }), world({ messages: [monthsOfferMessage()] }));
    assert.ok("steps" in out, `${words}: ${JSON.stringify(out)}`);
    assert.equal(typed(out), `${words}.`);
  }
  // One that runs on past today is not: "today" read tomorrow is wrong.
  assert.deepEqual(planOf(offer({ words: "20% off from today", from: "2026-10-11", until: "2026-10-18" }), world()), {
    refused: W.dayFromToday("today", "Oct 11"),
  });
});
