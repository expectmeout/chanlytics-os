/**
 * What a draft may not be, what only the save's schema can judge, the re-review's refinements, and what a save will
 * say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSystemPrompt,
  hasProfile,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
  BookingRulesSchema,
  GUARDRAIL_KEYS,
} from "@chanlytics/contracts";
import { bookingRuleRefusal } from "../../../../apps/dashboard/src/surfaces/settings/business/model/booking-rules-words.ts";
import { ALWAYS_ON } from "../../../../apps/dashboard/src/surfaces/settings/business/model/rule-strengths.ts";
import { profileRefusal } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import {
  BUSINESS_TAB,
  DAYS,
  FOLDS,
  S,
  STORED,
  door,
  landSettings,
  linesOf,
  previewed,
  read,
  said,
  settingsHeld,
  settle,
  stored,
  taken,
  told,
  without,
} from "./_folds.mjs";

/* ------------------------------------ what a draft may not be ------------------------------------ */

test("a rules draft, or a messages draft, with a part missing is a TypeError naming it: absent is never written as off", () => {
  const rules = S.draftOf("guardrails", stored());
  assert.throws(() => S.saveFold("guardrails", stored(), without(rules, "no_health_advice")), {
    name: "TypeError",
    message: /no_health_advice/,
  });
  const messages = S.draftOf("fallbacks", stored());
  assert.throws(() => S.saveFold("fallbacks", stored(), without(messages, "error")), {
    name: "TypeError",
    message: /error/,
  });
});

test("a booking rule typed as anything but a whole number is refused with its rule's sentence, never read as its first digits", () => {
  const draft = S.draftOf("booking_rules", stored());
  for (const typed of ["2.5", "30min", "1e2", "-1"]) {
    const found = S.problemsOf("booking_rules", { ...draft, lead_hours: typed });
    assert.equal(found.lead_hours, "Least notice is 0 to 168 hours · leave it empty to use 2 hours.", typed);
  }
  assert.deepEqual(S.problemsOf("booking_rules", { ...draft, lead_hours: " 24 " }), {});
});

test("a day stored both ways opens with every stretch it states, and a shift typed half-way is said under its day", () => {
  const both = stored();
  both.brain.profile.hours.mon = { open: "09:30", close: "13:00", intervals: [{ open: "14:00", close: "18:00" }] };
  const week = S.draftOf("hours", both);
  assert.deepEqual(
    week.mon.shifts,
    [
      { open: "09:30", close: "13:00" },
      { open: "14:00", close: "18:00" },
    ],
    "REGRESSION guard: the intervals won, and the morning went on an unchanged save",
  );
  const next = S.saveFold("hours", both, week);
  assert.deepEqual(told(next.brain), told(both.brain), "what the receptionist is told about Monday is unchanged");

  const half = S.draftOf("hours", stored());
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), {
    "hours-tue": "Tuesday needs both an opening and a closing time, or neither.",
  });
  // A shift left empty BESIDE one that is filled in is a row nobody filled in: dropped, as before.
  half.tue = {
    isOpen: true,
    shifts: [
      { open: "09:00", close: "12:00" },
      { open: "", close: "" },
    ],
  };
  assert.deepEqual(S.problemsOf("hours", half), {});
  // But a day switched on with no times at all is not an open day: the save writes it as closed, so the week "changed
  // nothing" and the fold closed without a word, the switch the owner pressed gone with it. Said under the day, in the
  // page's words (the schema has none: a day with no times is a closed day to it).
  for (const shifts of [
    [{ open: "", close: "" }],
    [],
    [
      { open: " ", close: "" },
      { open: "", close: "" },
    ],
  ]) {
    half.tue = { isOpen: true, shifts };
    assert.deepEqual(S.problemsOf("hours", half), {
      "hours-tue": "Tuesday is switched on with no times. Give it an opening and a closing time, or switch it off.",
    });
  }
  // Half a shift is the more exact sentence, and wins; a day switched off is asked nothing, whatever it keeps.
  half.tue = {
    isOpen: true,
    shifts: [
      { open: "09:00", close: "" },
      { open: "", close: "" },
    ],
  };
  assert.deepEqual(S.problemsOf("hours", half), {
    "hours-tue": "Tuesday needs both an opening and a closing time, or neither.",
  });
  half.tue = { isOpen: false, shifts: [{ open: "", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), {});
  // No week a fold opens with trips it: a stored day is open only when it states times.
  assert.deepEqual(S.problemsOf("hours", S.draftOf("hours", stored())), {});
  assert.deepEqual(S.problemsOf("hours", S.draftOf("hours", {})), {});
});

test("what the save's schema would refuse for its length or count is said first, under its field, in the page's words", () => {
  const L = S.LIMITS;
  assert.deepEqual(
    [L.notes, L.services, L.languages, L.reasons],
    [10, 60, 8, 20],
    "the counts the schema allows, published once for the folds",
  );
  const services = S.draftOf("services", stored());
  services[1] = { name: "x".repeat(81), duration_min: "2000", price_note: "y".repeat(121) };
  assert.deepEqual(Object.keys(S.problemsOf("services", services)).sort(), [
    "service-1-duration_min",
    "service-1-name",
    "service-1-price_note",
  ]);
  assert.deepEqual(Object.keys(S.problemsOf("tone", "t".repeat(201))), ["tone"]);
  assert.deepEqual(Object.keys(S.problemsOf("languages", ["English", "E"])), ["languages"]);
  assert.deepEqual(
    Object.keys(
      S.problemsOf(
        "languages",
        Array.from({ length: 9 }, (_, i) => `Language ${i}`),
      ),
    ),
    ["languages"],
  );
  assert.deepEqual(
    Object.keys(S.problemsOf("escalate_when", Array.from({ length: 21 }, (_, i) => `Reason ${i}`).join("\n"))),
    ["escalate_when"],
  );
  assert.deepEqual(Object.keys(S.problemsOf("consult_first", "c".repeat(81))), ["consult_first"]);
  assert.deepEqual(
    Object.keys(
      S.problemsOf(
        "notes",
        Array.from({ length: 11 }, (_, i) => ({ title: `Note ${i}`, text: "Words." })),
      ),
    ),
    ["notes"],
  );
  for (const fold of FOLDS)
    assert.deepEqual(S.problemsOf(fold, S.draftOf(fold, stored())), {}, `${fold}: the stored record has no problems`);
});

test("the calendar's address is written onto its section, never in place of it", () => {
  const withMore = stored();
  withMore.calendar.a_setting_added_later = "keep me";
  withMore.bookings = { a_setting_added_later: "keep me too" };
  const next = S.saveFold("calendar", withMore, { with: "booksy", ical_url: "webcal://calendar.example.com/new.ics" });
  assert.deepEqual(next.calendar, {
    ical_url: "webcal://calendar.example.com/new.ics",
    a_setting_added_later: "keep me",
  });
  assert.deepEqual(next.bookings, { a_setting_added_later: "keep me too", tool: "booksy" }, "and so is the tool");
  assert.equal(
    S.saveFold("calendar", stored(), { with: "", ical_url: "" }).calendar,
    undefined,
    "emptied, with nothing else in it, the section goes",
  );
  assert.deepEqual(S.PATHS_OF.calendar, ["calendar.ical_url", "bookings.tool", "bookings.by_hand"]);
});

test("the booking tool's fold leaves the booking requests switch as stored: it is the booking row's (18 Oct 2026)", () => {
  const withMore = stored();
  withMore.features = { vision: true, booking_requests: true };
  const next = S.saveFold("calendar", withMore, { with: "calendar", ical_url: STORED.calendar.ical_url });
  assert.deepEqual(next.features, { vision: true, booking_requests: true });
  // An open tab from before the move hands a draft with the switch in it: what it says is not this fold's to write.
  const older = S.saveFold("calendar", withMore, {
    with: "calendar",
    ical_url: STORED.calendar.ical_url,
    requests: false,
  });
  assert.deepEqual(older.features, { vision: true, booking_requests: true });
});

test("a fold saved onto a config with no brain, or no profile, writes nothing it has no value for", () => {
  assert.deepEqual(
    S.saveFold("tone", {}, ""),
    {},
    "REGRESSION guard: an emptied voice wrote { brain: {} } onto a config with no brain",
  );
  assert.deepEqual(
    S.saveFold("services", { brain: { business_name: "N" } }, []),
    { brain: { business_name: "N" } },
    "and no empty profile is left behind",
  );
  const draft = S.draftOf("services", stored());
  const next = S.saveFold("services", stored(), draft);
  draft[0].name = "changed after the save was built";
  assert.equal(
    next.brain.profile.services[0].name,
    "Balayage",
    "what was built holds nothing of the draft it was built from",
  );
});

test("what only the save's schema can judge is said under the fold's own field, in the schema's words", () => {
  // Two shifts that overlap: no one box is wrong, so the old form said nothing and the server named no field.
  const week = S.draftOf("hours", taken());
  week.mon = {
    isOpen: true,
    shifts: [
      { open: "09:00", close: "13:00" },
      { open: "12:00", close: "18:00" },
    ],
  };
  assert.deepEqual(S.problemsOf("hours", week), {}, "nothing the page's own checks can see");
  assert.deepEqual(S.schemaProblems("hours", taken(), week), { "hours-mon": "Monday: two shifts overlap." });

  // A row's place in the DRAFT, not in what is written: the empty first row is dropped before the save's schema sees it.
  const closures = [
    { date: "", note: "" },
    { date: "2099-11-31", note: "No such day" },
  ];
  assert.deepEqual(Object.keys(S.schemaProblems("closures", taken(), closures)), ["closure-1-date"]);
  const services = [{ name: "" }, { name: "Cut", duration_min: "45" }, { name: "Colour", duration_min: "0" }];
  assert.deepEqual(
    S.schemaProblems("services", taken(), services),
    {},
    "a duration of nothing is no duration, as it always was",
  );

  // The calendar's part is judged alone: the brain is not the fold's.
  assert.deepEqual(
    Object.keys(S.schemaProblems("calendar", taken(), { with: "calendar", ical_url: "https://localhost/feed.ics" })),
    ["ical_url"],
  );
  // A masked address is not the schema's to judge either: the tool beside it still saves.
  assert.deepEqual(
    S.schemaProblems("calendar", taken(), { with: "booksy", ical_url: "https://calendar.example…ic.ics" }),
    {},
  );

  for (const fold of FOLDS)
    assert.deepEqual(
      S.schemaProblems(fold, taken(), S.draftOf(fold, taken())),
      {},
      `${fold}: the stored record is one the save would take`,
    );
});

test("a refusal that is not this fold's to fix is said once, as elsewhere, naming where", () => {
  const bad = taken();
  bad.brain.profile.hours.mon = { open: "18:00", close: "09:00" };
  const found = S.schemaProblems("tone", bad, "Bright.");
  assert.deepEqual(Object.keys(found), ["elsewhere"]);
  assert.match(found.elsewhere, /Monday/);
  // (The branch for no bridge went with the move to TSX: the folds import the bridge's helpers, so there always is one.)
});

/* ------------------------------------ the re-review's refinements ------------------------------------ */

test("a draft with nothing left to write is never refused: the owner's own earlier save, or a colleague's identical one, changed it", async () => {
  // A colleague saved exactly what this draft holds. Nothing to write, so nothing to refuse: the fold closes.
  read(STORED);
  let sent = door();
  const opened = S.draftOf("tone", S.saver.base());
  const theirs = structuredClone(STORED);
  theirs.brain.profile.tone = "Bright.";
  landSettings({ config: theirs, version: 8 });
  const a = said();
  let closed = 0;
  S.saver.save(
    S.foldJob("tone", "Bright.", {
      opened,
      said: "Saved",
      done: () => {
        closed += 1;
      },
      flash: a.flash,
    }),
  );
  await settle();
  assert.deepEqual(
    [sent.length, closed, a.toasts.length],
    [0, 1, 0],
    "REGRESSION guard: refused as changed after it opened, though nothing of theirs would have been lost",
  );

  // A fold that stays open after its own save is taken, and saves the same draft again with the draft it first opened with.
  read(STORED);
  sent = door();
  const first = S.draftOf("tone", S.saver.base());
  const b = said();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: first, said: "Saved", flash: b.flash }));
  sent[0].accept();
  await settle();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: first, said: "Saved", flash: b.flash }));
  await settle();
  assert.equal(sent.length, 1, "the second has nothing to write");
  assert.deepEqual(
    b.toasts.map((t) => t.tone),
    [undefined],
    "and is not told its own save was somebody else's",
  );
});

test("a service's minutes are digits or refused, as a booking rule's are, and an empty or zero box is no duration", () => {
  const services = [
    { name: "Cut", duration_min: "1.5" },
    { name: "Colour", duration_min: "45min" },
    { name: "Blowout", duration_min: " 45 " },
    { name: "Consult", duration_min: "" },
    { name: "Walk-in", duration_min: "0" },
  ];
  assert.deepEqual(S.problemsOf("services", services), {
    "service-0-duration_min": "Minutes are a whole number, like 45.",
    "service-1-duration_min": "Minutes are a whole number, like 45.",
  });
  const written = S.saveFold("services", stored(), services.slice(2)).brain.profile.services;
  assert.deepEqual(written, [{ name: "Blowout", duration_min: 45 }, { name: "Consult" }, { name: "Walk-in" }]);
});

test("the sentence for a shift typed half-way is the save's own, held to it", () => {
  const half = S.draftOf("hours", taken());
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "" }] };
  const brain = taken().brain;
  brain.profile.hours = { ...brain.profile.hours, tue: { open: "09:00" } };
  const schemas = BUSINESS_TAB.saveIssues({ brain }).map((i) => i.message);
  assert.deepEqual(
    schemas,
    [S.problemsOf("hours", half)["hours-tue"]],
    "one sentence, in two places: this holds them together",
  );
});

test("saveProblems is the one question a fold asks before it saves: the page's own sentence wins, and the schema's raw wording never reaches the owner", () => {
  const services = S.draftOf("services", taken());
  services[0] = { ...services[0], name: "x".repeat(81) };
  const found = S.saveProblems("services", taken(), services);
  assert.deepEqual(Object.keys(found), ["service-0-name"]);
  assert.equal(
    found["service-0-name"],
    S.problemsOf("services", services)["service-0-name"],
    'REGRESSION guard: merged the other way, the owner read zod\'s "Too big: expected string..."',
  );
  // Nothing of the page's own to say, and the schema's is its own sentence: said as the schema says it.
  const week = S.draftOf("hours", taken());
  week.mon = {
    isOpen: true,
    shifts: [
      { open: "09:00", close: "13:00" },
      { open: "12:00", close: "18:00" },
    ],
  };
  assert.deepEqual(S.saveProblems("hours", taken(), week), { "hours-mon": "Monday: two shifts overlap." });
  // A refusal in the schema's default wording is said in the page's words instead.
  const feed = S.saveProblems("calendar", taken(), {
    with: "calendar",
    ical_url: `https://calendar.example.com/${"a".repeat(2100)}.ics`,
  });
  assert.deepEqual(Object.keys(feed), ["ical_url"]);
  assert.doesNotMatch(feed.ical_url, /Too big|Invalid|expected/);
  assert.deepEqual(S.saveProblems("tone", taken(), "Bright."), {});
});

test("one helper says what a row's or a fold's save will tell the receptionist: what comes, what goes, the whole block, and the crossing", () => {
  try {
    const base = previewed(taken());
    const tab = BUSINESS_TAB;
    const blockOf = (brain) => tab.consequenceOf("hours", brain, "whatsapp");

    // A fold's draft, written as its save writes it: Monday closes an hour earlier.
    const week = S.draftOf("hours", base);
    week.mon = { isOpen: true, shifts: [{ open: "09:30", close: "17:00" }] };
    const next = S.saveFold("hours", base, week).brain;
    const will = S.willSay({ was: base.brain, next, sections: "hours", channel: "whatsapp" });
    assert.equal(
      will.whole,
      blockOf(next).text,
      "the whole block as the save would leave it, in the composer's own words",
    );
    assert.match(will.whole, /17:00/);
    // And its share of the prompt, in characters, for a list too long to quote whole (the services sheet's foot).
    assert.equal(will.chars, blockOf(next).chars);
    // Over the whole prompt the draft would give it: the prompt after the save, as the block is.
    assert.equal(will.total, blockOf(next).total);
    assert.equal(
      will.total,
      resolveSystemPrompt(
        next,
        "whatsapp",
        settingsHeld().prompt.tz,
        new Date(),
        settingsHeld().prompt.inputs.policy,
        settingsHeld().prompt.inputs.known,
      ).length,
    );
    assert.deepEqual(
      [will.added, will.removed, will.note],
      [null, null, null],
      "the hours' lines are runs (the test below), so none is said to come or go while the block stays; and no line crossed",
    );
    assert.equal(will.caveat, null, "the hours' block carries no note of its own");
    // A block that does carries it with the block: the rules' says which of its lines are not the owner's.
    const rules = S.saveFold("guardrails", base, S.draftOf("guardrails", base)).brain;
    const kept = S.willSay({ was: base.brain, next: rules, sections: "guardrails", channel: "whatsapp" });
    assert.equal(kept.whole, tab.consequenceOf("guardrails", rules, "whatsapp").text);
    assert.equal(kept.caveat, tab.consequenceOf("guardrails", rules, "whatsapp").note);
    assert.match(kept.caveat, /Autonomy/);
    // A block whose lines are facts says each that comes and goes: a closed day added is one line that comes.
    const days = S.draftOf("closures", base);
    days.push({ date: "2099-07-04", note: "Independence Day" });
    const more = S.willSay({
      was: base.brain,
      next: S.saveFold("closures", base, days).brain,
      sections: "closures",
      channel: "whatsapp",
    });
    assert.deepEqual([linesOf(more.added).length, more.removed], [1, null], "one line comes, none goes");
    assert.match(more.added, /Independence Day/);

    // Unchanged, a fold still shows its block, and nothing comes or goes.
    const same = S.willSay({
      was: base.brain,
      next: S.saveFold("hours", base, S.draftOf("hours", base)).brain,
      sections: "hours",
      channel: "whatsapp",
    });
    assert.deepEqual([same.added, same.removed, same.note], [null, null, null]);
    assert.equal(same.whole, blockOf(base.brain).text);

    // A block the save takes away whole goes line by line: every day closed, on a record that still composes.
    const shut = S.draftOf("hours", base);
    DAYS.forEach((d) => {
      shut[d] = { isOpen: false, shifts: shut[d].shifts };
    });
    const closed = S.saveFold("hours", base, shut).brain;
    assert.equal("hours" in closed.profile, false);
    const gone = S.willSay({ was: base.brain, next: closed, sections: "hours", channel: "whatsapp" });
    assert.deepEqual([gone.whole, gone.added, gone.note, gone.chars, gone.total], [null, null, null, null, null]);
    assert.deepEqual(
      linesOf(gone.removed),
      linesOf(blockOf(base.brain).text),
      "showing only what a save adds hid that the week goes",
    );

    // No channel that reads the words: nothing is resolved, and nothing is claimed.
    assert.deepEqual(S.willSay({ was: base.brain, next, sections: "hours", channel: null }), {
      note: null,
      added: null,
      removed: null,
      whole: null,
      caveat: null,
      chars: null,
      total: null,
      changed: false,
    });
    // A draft the save's own schema refuses: nothing true can be said of a save that will not go, and a block that is
    // null for THAT reason must not read as one the save takes away.
    const overlap = S.draftOf("hours", base);
    overlap.mon = {
      isOpen: true,
      shifts: [
        { open: "09:00", close: "13:00" },
        { open: "12:00", close: "18:00" },
      ],
    };
    assert.equal(
      S.willSay({
        was: base.brain,
        next: S.saveFold("hours", base, overlap).brain,
        sections: "hours",
        channel: "whatsapp",
      }),
      null,
    );
    assert.equal(S.willSay({ was: null, next, sections: "hours", channel: "whatsapp" }), null);
  } finally {
    landSettings(undefined);
  }
});

test("a save that crosses the resolver's line says so, whichever gesture sends it, and lists no one block's lines for a record that stops composing", () => {
  try {
    // The week is the one thing this record composes from.
    const sparse = {
      brain: {
        ...taken().brain,
        profile: {
          hours: { mon: { open: "09:30", close: "18:00" } },
          guardrails: { never_quote_prices: true },
          handoff_number: "+12125550142",
        },
      },
    };
    assert.equal(hasProfile(sparse.brain.profile), true);
    const base = previewed(sparse);
    const shut = S.draftOf("hours", base);
    shut.mon = { isOpen: false, shifts: shut.mon.shifts };
    const stops = S.willSay({
      was: base.brain,
      next: S.saveFold("hours", base, shut).brain,
      sections: "hours",
      channel: "whatsapp",
    });
    assert.match(stops.note, /stops being given your details/);
    assert.deepEqual(
      [stops.whole, stops.added, stops.removed],
      [null, null, null],
      "everything composed goes, and the sentence says all of it",
    );

    // The other way: the first field a record composes from, with every line of the block it starts.
    const bare = previewed({ brain: { ...taken().brain, profile: { guardrails: { never_quote_prices: true } } } });
    const opened = S.draftOf("hours", bare);
    opened.mon = { isOpen: true, shifts: [{ open: "09:30", close: "18:00" }] };
    const starts = S.willSay({
      was: bare.brain,
      next: S.saveFold("hours", bare, opened).brain,
      sections: "hours",
      channel: "whatsapp",
    });
    assert.match(starts.note, /starts being given your details/);
    assert.equal(starts.added, linesOf(starts.whole).join("\n"), "every line of the block is new");
  } finally {
    landSettings(undefined);
  }
});

test("each block of the brain a save goes on is resolved once for that brain, by channel and block, and again for a new base", () => {
  const tab = BUSINESS_TAB;
  const real = tab.consequenceOf;
  const asked = [];
  try {
    const base = previewed(taken());
    tab.consequenceOf = (block, brain, channel) => {
      asked.push([block, channel, brain === base.brain ? "base" : "next"]);
      return real(block, brain, channel);
    };
    const nextOf = (close) => {
      const w = S.draftOf("hours", base);
      w.mon = { isOpen: true, shifts: [{ open: "09:30", close }] };
      return S.saveFold("hours", base, w).brain;
    };
    // Three keystrokes on one base: the base's block once, the draft's each time.
    for (const close of ["17:00", "17:30", "17:45"])
      S.willSay({ was: base.brain, next: nextOf(close), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(
      asked.filter((a) => a[2] === "base"),
      [["hours", "whatsapp", "base"]],
    );
    assert.equal(asked.filter((a) => a[2] === "next").length, 3);
    // Another channel is another block of the same brain; another row's block, another again.
    S.willSay({ was: base.brain, next: nextOf("17:00"), sections: "hours", channel: "voice" });
    S.willSay({ was: base.brain, next: nextOf("17:00"), sections: ["hours", "closures"], channel: "voice" });
    assert.deepEqual(
      asked.filter((a) => a[2] === "base").map((a) => a.slice(0, 2)),
      [
        ["hours", "whatsapp"],
        ["hours", "voice"],
        ["closures", "voice"],
      ],
    );
    // A new base (a save taken, a newer read) forgets them all: what was resolved describes a brain that is gone.
    const moved = structuredClone(base);
    asked.length = 0;
    tab.consequenceOf = (block, brain, channel) => {
      asked.push([block, channel, brain === moved.brain ? "base" : "next"]);
      return real(block, brain, channel);
    };
    S.willSay({ was: moved.brain, next: nextOf("17:00"), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(
      asked.filter((a) => a[2] === "base"),
      [["hours", "whatsapp", "base"]],
    );
    // And a new preview under the SAME brain (a zone saved, the settings read again, the config object kept) forgets
    // them too: consequenceOf resolves with the preview's inputs, so a block kept from the old preview would have read
    // the new zone's heading as a change of this save.
    asked.length = 0;
    landSettings({ ...settingsHeld(), prompt: { ...settingsHeld().prompt, tz: "America/Chicago" } });
    const zoned = S.willSay({ was: moved.brain, next: nextOf("17:00"), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(
      asked.filter((a) => a[2] === "base"),
      [["hours", "whatsapp", "base"]],
      "REGRESSION: the base's block was the old preview's",
    );
    assert.match(zoned.whole, /America\/Chicago/);
  } finally {
    tab.consequenceOf = real;
    landSettings(undefined);
  }
});

test("the two caps the write schema keeps are in LIMITS, once, and a day with more shifts than it takes is said under its day", () => {
  // The fallback literal was `|| 60` in two files, and a day's cap was the body's to remember in three places. A toast's
  // Undo skipped it: Monday came to five shifts, and Save said only "This can't be saved as it is written."
  assert.deepEqual(
    [S.LIMITS.shifts, S.LIMITS.closures],
    [MAX_INTERVALS_PER_DAY, MAX_CLOSURES],
    "contracts' caps, read when asked",
  );
  const week = S.draftOf("hours", taken());
  const stretch = (n) => ({
    open: `${String(8 + 2 * n).padStart(2, "0")}:00`,
    close: `${String(9 + 2 * n).padStart(2, "0")}:00`,
  });
  week.tue = { isOpen: true, shifts: Array.from({ length: MAX_INTERVALS_PER_DAY + 1 }, (_, n) => stretch(n)) };
  assert.deepEqual(S.problemsOf("hours", week), {
    "hours-tue": profileRefusal("shifts", MAX_INTERVALS_PER_DAY + 1, "Tuesday"),
  });
  // A row nobody filled in is not a shift: the save drops it, so it is not counted.
  week.tue = {
    isOpen: true,
    shifts: Array.from({ length: MAX_INTERVALS_PER_DAY }, (_, n) => stretch(n)).concat([{ open: "", close: "" }]),
  };
  assert.deepEqual(S.problemsOf("hours", week), {});
});

test("a block whose lines are runs says nothing goes unless the whole block goes: a changed Friday takes no Monday with it", () => {
  // The quality review's probe. The hours block's lines are run-collapsed ("Monday–Thursday: 09:30–18:00"). Changing
  // only Friday's close re-cut the runs, and "No longer told" listed "Monday–Thursday: 09:30–18:00", a line
  // about days that were unchanged. Which sections say their lines in runs is one table's (RUN_BLOCKS), never an
  // `if (fold === "hours")` in the page.
  try {
    const base = previewed(taken());
    assert.deepEqual(S.RUN_BLOCKS, ["hours"], "the hours are the one block the composer collapses into runs");
    const week = S.draftOf("hours", base);
    week.sat = {
      isOpen: true,
      shifts: [
        { open: "09:30", close: "13:00" },
        { open: "14:00", close: "18:00" },
      ],
    };
    const friday = S.willSay({
      was: base.brain,
      next: S.saveFold("hours", base, week).brain,
      sections: "hours",
      channel: "whatsapp",
    });
    assert.equal(friday.removed, null, "REGRESSION: it listed lines about days nobody changed");
    assert.match(
      friday.whole,
      /Saturday: 09:30–13:00 and 14:00–18:00/,
      "the whole new block says what Saturday becomes",
    );
    assert.equal(
      friday.added,
      null,
      "and what comes is not listed apart from it either: a run re-cut is not a new fact",
    );
    // The whole block going is still said, line by line.
    const shut = S.draftOf("hours", base);
    DAYS.forEach((d) => {
      shut[d] = { isOpen: false, shifts: shut[d].shifts };
    });
    const gone = S.willSay({
      was: base.brain,
      next: S.saveFold("hours", base, shut).brain,
      sections: "hours",
      channel: "whatsapp",
    });
    assert.deepEqual(linesOf(gone.removed), linesOf(BUSINESS_TAB.consequenceOf("hours", base.brain, "whatsapp").text));
    // A closure's line is one fact, so the closures say each line that goes, as before.
    const days = S.draftOf("closures", base);
    const fewer = S.willSay({
      was: base.brain,
      next: S.saveFold("closures", base, days.slice(1)).brain,
      sections: "closures",
      channel: "whatsapp",
    });
    assert.match(fewer.removed, /Christmas/);
  } finally {
    landSettings(undefined);
  }
});

test("a booking rule's refusal is contracts' bookingRuleRefusal, and the page's ranges are the save's own schema's", () => {
  // The spec review's probe: the refusal is drawn in the hint's place, and said "leave it empty for no rule" under a box
  // whose hint says an empty one uses two hours. The quality review: a sentence with a number in it is contracts'
  // (spec §3), and RULES is a plain table, where its sentences were getters over a bridge that loads after the page.
  const rules = S.draftOf("booking_rules", stored());
  for (const [key, lo, hi] of S.RULES) {
    assert.equal(S.problemsOf("booking_rules", { ...rules, [key]: String(hi + 1) })[key], bookingRuleRefusal(key), key);
    const bound = BookingRulesSchema.shape[key].unwrap();
    assert.deepEqual(
      [lo, hi],
      [bound.minValue, bound.maxValue],
      `${key}: the range a check refuses is the range the save keeps`,
    );
  }
  assert.ok(
    S.RULES.every((rule) => rule.length === 3 && rule.every((x) => typeof x !== "function")),
    "a plain [key, least, most]",
  );
  // (The branch for no bridge, which said only that the box is refused, went with the move to TSX: the folds import the
  // bridge's helpers, so the range is always the save's own.)
});

test("every rule of the save's own schema has its place: the fold's switch, the price row, or always on", () => {
  // The page holds its switch as a literal (BT_GUARDRAILS), so this is the pin -- every key of the schema's own list
  // (contracts GUARDRAIL_KEYS, GuardrailsSchema.keyof()) is the fold's to write, the price row's (business/choices), or
  // a rule no row turns off (contracts ALWAYS_ON), so a rule added to the schema and placed nowhere fails here rather
  // than being quietly unwritable.
  const prefix = "brain.profile.guardrails.";
  const own = S.PATHS_OF.guardrails.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
  assert.deepEqual(own, ["no_health_advice"]);
  for (const k of GUARDRAIL_KEYS)
    assert.ok(own.includes(k) || k === "never_quote_prices" || ALWAYS_ON.has(k), `${k} has a place`);
  // Nothing beside the rules: the photo switch is What it can do's since 18 Oct 2026.
  assert.deepEqual(
    S.PATHS_OF.guardrails.filter((p) => !p.startsWith(prefix)),
    [],
  );
  // And a save writes its switch, not only where the record already stored it.
  const bare = stored();
  delete bare.brain.profile.guardrails;
  const saved = S.saveFold("guardrails", bare, S.draftOf("guardrails", bare));
  assert.deepEqual(saved.brain.profile.guardrails, { no_health_advice: false });
});
