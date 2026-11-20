/**
 * Today on a phone, EXECUTED on the stub React (decision 0076; Today, calm, 19 Nov 2026): who waits on the owner first,
 * the first of them the page's card and the rest lines, To do's after them, the coral the card's and passing to To do's
 * when nobody waits; a reply never written on Today (D8). After his look on a phone (29 Oct 2026): each thing said once
 * above the fold (how long someone waited beside their name, a run's wait under its title), and under the head only the
 * warnings that stop customers being answered.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { clockTime, toTodayVM, zoneDayKey } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { unmarkedTimes } from "../../shell/views/_unmarked-times.mjs";
import { NOW, ZONE, escalation, metrics, msg, peopleWithSteps, thread, waiting } from "../record/_world.mjs";

const went = [];
installStubReact({
  __surfaceState: () => "live",
  appNavigate: (to) => went.push(to),
  usePPToast: () => [null, () => {}],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const W = globalThis.window;
// The phone's width, as tokens.css --bp-phone asks it (surfaces/today/phone.ts), and the desk's where a test says so.
let phone = true;
W.matchMedia = (q) => ({
  media: q,
  get matches() {
    return q === "(max-width: 720px)" && phone;
  },
  addEventListener() {},
  removeEventListener() {},
});
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
W.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "unavailable", message: "not read here" } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { useTodayArrangement } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");
/** Who waits on you as the page draws it, with the card its arrangement names (Today, calm). */
const NeedYouOnToday = () => NeedYou({ card: useTodayArrangement().card });
const { TodayAlertBand } = await import("../../../apps/dashboard/src/surfaces/today/zones/alert.tsx");
const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { useNeedYouLine } = await import("../../../apps/dashboard/src/surfaces/today/need-you-model.ts");

/** Sofia asked for a person three hours ago, an hour before Ana: two handoffs, Sofia's the older. */
const sofia = () =>
  thread("cv-s", "Sofia Reyes", [msg("s1", "What would six of us cost for a wedding?", "2026-09-18T17:00:00Z")], {
    state: "needs_human",
  });
const sofiaHeld = () => ({ ...escalation(), id: "e-s", conversation_id: "cv-s", created_at: "2026-09-18T17:01:00Z" });
const twoWaiting = () => toTodayVM(metrics(), [sofia(), waiting()], [sofiaHeld(), escalation()], [], NOW);
/** And Marco, who wrote at two: a third person waiting. */
const marco = () => thread("cv-m", "Marco Bellini", [msg("m1", "Can we move to Thursday?", "2026-09-18T18:00:00Z")]);
const marcoHeld = () => ({ ...escalation(), id: "e-m", conversation_id: "cv-m", created_at: "2026-09-18T18:01:00Z" });
const threeWaiting = () =>
  toTodayVM(metrics(), [sofia(), waiting(), marco()], [sofiaHeld(), escalation(), marcoHeld()], [], NOW);
const nobodyWaiting = () => toTodayVM(metrics(), [], [], [], NOW);

const set = (vm) => {
  setSurfaceValue("today", vm);
  W.__PEOPLE = { rows: peopleWithSteps([["b", "Ben", -1]]), fetchedAt: NOW.getTime() };
};
after(() => {
  setSurfaceValue("today", undefined);
  delete W.__PEOPLE;
  delete W.__BROADCASTS;
  delete W.__notifs;
});
const draw = (Comp) => {
  fresh();
  return W.React.createElement(Comp, {});
};
/** The page's one card, and the lines under it a reader and a thumb reach (not the one folded under the card). */
const cardOf = (tree) => byTestId(tree, "today-card");
const linesOf = (tree) =>
  all(byTestId(tree, "today-queue"), (n) => classes(n).includes("calm-line") && !n.props["data-folded"]);
const isPrimary = (n) => classes(n).some((c) => c === "btn-primary" || c === "primary");
const pressesOf = (tree) => all(tree, (n) => n.type === "button");

test("on a phone who waited longest holds the card, the next are lines, and To do's step comes after the people, never among them", () => {
  phone = true;
  set(twoWaiting());
  const page = draw(NeedYouOnToday);
  assert.match(textOf(cardOf(page)), /Sofia Reyes/, "the longest wait holds the card");
  assert.deepEqual(
    linesOf(page).map((l) => l.props["data-testid"]),
    ["queue-handoff", "queue-step"],
    "Ana's line, then Ben's step",
  );
  assert.match(textOf(linesOf(page)[1]), /Call Ben/);
  assert.equal(byTestId(page, "today-queue-door"), null, "no head over the lines: the page's head says how many");
});

test("every time Today's blocks say, says so: a copy some minutes old draws none of them (decision 0101)", () => {
  phone = true;
  set(threeWaiting());
  const page = draw(NeedYouOnToday);
  assert.match(textOf(page), /\d+h/, "the fixture says a wait");
  assert.deepEqual(unmarkedTimes(page), []);
});

test("Need you holds each wait to the business's own target, and the card says why it was handed over in words", () => {
  phone = true;
  set(twoWaiting());
  // Said where a reader sees it: the card's, then each line's (the card's own line is folded under it).
  const waits = (tree) =>
    [cardOf(tree), ...linesOf(tree)]
      .flatMap((part) => all(part, (n) => classes(n).includes("calm-wait")))
      .map((n) => [textOf(n), !!n.props["data-long"]]);
  assert.deepEqual(waits(draw(NeedYouOnToday)), [
    ["3h", false],
    ["2h", false],
  ]);
  // The owner says an hour (Settings › Autonomy, "Answer people within"): both have waited past it.
  setSurfaceValue("settings", {
    policies: { role: "owner", rows: [{ class: "reply", limits: { answer_within_hours: 1 } }] },
  });
  try {
    assert.deepEqual(
      waits(draw(NeedYouOnToday)),
      [
        ["3h", true],
        ["2h", true],
      ],
      "REGRESSION: the amber meant past a day, whatever the business promised",
    );
  } finally {
    setSurfaceValue("settings", undefined);
  }
  const card = cardOf(draw(NeedYouOnToday));
  // Said as a sentence starts, its first letter raised by the card's style (calm.css .calm-why::first-letter).
  assert.equal(textOf(find(card, (n) => classes(n).includes("calm-why"))), "asked for a person");
  assert.equal(
    find(card, (n) => classes(n).includes("set-mark")),
    null,
    "REGRESSION: an unexplained mark beside the name",
  );
});

test("on a phone a reply is never written on Today: the card's press opens their conversation, AI's draft asked for its box, and so does the next one's line (D8)", async () => {
  phone = true;
  went.length = 0;
  const vm = twoWaiting();
  set(vm);
  const page = draw(NeedYouOnToday);
  assert.equal(byTestId(page, "queue-handoff-work"), null, "no reply worked on Today");
  const act = byTestId(cardOf(page), "today-card-act");
  assert.match(textOf(act), /Reply/, "the card's one press");
  press(act);
  const sofiaRow = vm.queue.rows.find((r) => r.who === "Sofia Reyes");
  assert.deepEqual(went, [`inbox/th-${sofiaRow.conversationId}`], "her conversation, where the draft waits in the box");
  went.length = 0;
  // Ana's line is the door to her conversation, where hers is written too (D8 of 17 Nov): the frame's own door, which
  // goes the line's way (frame-doors.ts routeDoor).
  W.routeDoor = (await import("../../../apps/dashboard/src/surfaces/frame-doors.ts")).routeDoor;
  try {
    const [ana] = linesOf(draw(NeedYouOnToday));
    const door = find(ana, (n) => typeof n.props?.href === "string");
    const anaRow = vm.queue.rows.find((r) => r.who === "Ana Reyes");
    assert.match(door.props.href, new RegExp(`inbox/th-${anaRow.conversationId}$`));
    door.props.onClick({ button: 0, preventDefault() {} });
    assert.deepEqual(went, [`inbox/th-${anaRow.conversationId}`]);
  } finally {
    delete W.routeDoor;
  }
  went.length = 0;
});

test("the coral is the card's: who waits first while anyone does, To do's first when nobody does", () => {
  phone = true;
  set(twoWaiting());
  const page = draw(NeedYouOnToday);
  const corals = pressesOf(page).filter(isPrimary);
  assert.equal(new Set(corals).size, 1, "one coral");
  assert.ok(all(cardOf(page), (n) => corals.includes(n)).length > 0, "the card's");
  set(nobodyWaiting());
  const calm = draw(NeedYouOnToday);
  assert.equal(cardOf(calm).props["data-holder"], "todo", "with nobody waiting, To do's step holds the card");
  assert.equal(new Set(pressesOf(cardOf(calm)).filter(isPrimary)).size, 1, "and its Done is the coral");
});

// A desk said it twice too: "Email, waited 5d" over "Escalated · wrote by email · since Mon 5:02 PM" (the refined canvas,
// 31 Oct 2026), so the wait is said once there as well, in the meta line beside the name.
test("how long someone waited is said once, beside their name, on a phone and on a desk", () => {
  const once = (tree) => textOf(tree).split("3h").length === 2;
  for (const width of [true, false]) {
    phone = width;
    set(twoWaiting());
    const card = cardOf(draw(NeedYouOnToday));
    assert.ok(once(card), textOf(card));
    assert.ok(!textOf(card).includes("since "), `and no since: ${textOf(card)}`);
  }
  phone = true;
});

test("how many were done today follows how many need you, where no list head says it; and the page's last line waits for nobody to", async () => {
  const { useZonesStanding } = await import("../../../apps/dashboard/src/surfaces/today/zones/head.tsx");
  const { TodayEnd } = await import("../../../apps/dashboard/src/surfaces/today/zones/foot.tsx");
  const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");
  const HeadProbe = () => {
    useZonesStanding();
    return null;
  };
  phone = true;
  set({ ...twoWaiting(), done_today: 3 });
  draw(HeadProbe);
  assert.match(textOf(standingSaid()?.sentence ?? null), /need you\. 3 done today\.$/);
  assert.equal(
    byTestId(draw(TodayEnd), "today-end"),
    null,
    "REGRESSION: it said that was everything while someone waited",
  );
  set(nobodyWaiting());
  assert.ok(byTestId(draw(TodayEnd), "today-end"), "nobody waiting: the page says it is done");
});

test("on a phone a run waiting for your OK says so once, in its title, and opens with Review", () => {
  const reach = {
    id: "b-reach",
    name: "Movers nearby",
    state: "pending_approval",
    playbook_id: null,
    audience: { kind: "reach_out", label: "Movers nearby" },
    recipient_count: 7,
    scheduled_for: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    started_at: null,
    when: "today 6:00 PM",
    counts: { sent: 0, replied: 0 },
  };
  // On the seam, which the page's card reads, and on the window, which the lines read.
  setSurfaceValue("broadcasts", { rows: [reach] });
  W.__BROADCASTS = { rows: [reach] };
  try {
    phone = true;
    set(nobodyWaiting());
    W.__PEOPLE = { rows: [], fetchedAt: NOW.getTime() };
    const card = cardOf(draw(NeedYouOnToday));
    assert.equal(card.props["data-holder"], "wait", "the run holds the card");
    const said = textOf(card);
    assert.match(said, /7 businesses wait for your approval/, "its title says it waits");
    assert.equal(said.split(/wait(s)? for (your approval|you to approve)/i).length, 4, `said once: ${said}`);
    assert.ok(
      find(card, (n) => n.type === "button" && textOf(n) === "Review"),
      "Review, what is done there",
    );
  } finally {
    setSurfaceValue("broadcasts", undefined);
    delete W.__BROADCASTS;
    phone = true;
  }
});

test("under a phone's head only what stops customers being answered: a run waiting and a job that failed stay in the bell", () => {
  const note = (id, kind, title) => ({
    id,
    key: id,
    kind,
    title,
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
    time: "1h",
    actions: [{ label: "Open", to: "inbox", primary: true }],
  });
  W.__notifs = {
    feed: () => [
      note("n1", "playbook", "Movers nearby waits for your OK"),
      note("n2", "job_failed", "A lead_collect job did not finish"),
      note("n3", "number", "Your WhatsApp number's rating dropped"),
    ],
    onChange: () => () => {},
    older: () => 0,
    read() {},
    dismiss() {},
    seenAll() {},
  };
  try {
    phone = true;
    set(twoWaiting());
    const warned = draw(TodayAlertBand);
    const rows = all(warned, (n) => n.props?.["data-testid"] === "today-warning").map(textOf);
    assert.equal(rows.length, 1, rows.join(" | "));
    assert.ok(rows[0].includes("WhatsApp number"), rows[0]);
    // Two at most, and only what is still New: one the bell was closed over has been seen (its close is the member
    // looking), and the bell keeps it.
    const feed = W.__notifs.feed();
    W.__notifs.feed = () => [
      ...feed,
      note("n4", "sweep", "Replies are not being read"),
      note("n5", "billing", "Your card was declined"),
      { ...note("n6", "number", "Your WhatsApp number is limited"), unread: false },
    ];
    const capped = all(draw(TodayAlertBand), (n) => n.props?.["data-testid"] === "today-warning").map(textOf);
    assert.equal(capped.length, 2, capped.join(" | "));
    assert.ok(!capped.some((r) => r.includes("is limited")), "a warning already seen stays in the bell");
  } finally {
    delete W.__notifs;
  }
});

test("a call back that has waited past a week says in its sheet that it may be let go; a newer one is simply owed", async () => {
  const { CallWork } = await import("../../../apps/dashboard/src/surfaces/today/need-you/call-work.tsx");
  const { NEED_YOU_WORDS, NEED_YOU_OLD_MS, DAY_MS } = await import("@chanlytics/contracts");
  const callBack = (waitedMs) => ({
    id: `q-cb-${waitedMs}`,
    kind: "callback",
    who: "Dana Park",
    phone: "+15555550134",
    conversationId: null,
    writes: null,
    waitedMs,
    cta: { label: "Call", to: "inbox" },
  });
  const work = (waitedMs) => {
    fresh();
    return again(() =>
      W.React.createElement(CallWork, {
        row: callBack(waitedMs),
        main: "primary",
        may: true,
        tz: ZONE,
        flash: () => {},
        keep: () => {},
        whole: true,
      }),
    );
  };
  assert.ok(textOf(work(NEED_YOU_OLD_MS + DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "said under what they wanted");
  assert.ok(!textOf(work(DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "a call back under a week is simply owed");
});

test("on a phone AI's reply is never shown or sent on Today: the card's press says it is ready and opens its conversation (D8)", () => {
  phone = true;
  // Sofia wrote an hour ago on WhatsApp: the window is open, so Ask's reply can be sent from the card.
  // A thread of its own: the drafts the tab holds outlive a test, and an earlier one read Sofia's and was refused.
  const open = thread(
    "cv-w",
    "Sofia Reyes",
    [msg("w1", "What would six of us cost for a wedding?", "2026-09-18T19:00:00Z")],
    { state: "needs_human", last_wa_inbound_at: "2026-09-18T19:00:00Z" },
  );
  const held = { ...sofiaHeld(), id: "e-w", conversation_id: "cv-w" };
  const vm = toTodayVM(metrics(), [open, waiting()], [held, escalation()], [], NOW);
  const first = vm.queue.rows[0];
  setSurfaceValue("reply_drafts", {
    complete: true,
    fetchedAt: NOW.getTime(),
    drafts: [
      {
        conversation_id: first.conversationId,
        kind: "reply",
        for_message_id: first.writes.for_message_id,
        words: { text: "Six of us is $540 for the wedding package.", subject: "", asks: [], brief: null },
        made_at: NOW.toISOString(),
      },
    ],
  });
  try {
    went.length = 0;
    set(vm);
    const page = draw(NeedYouOnToday);
    assert.equal(byTestId(page, "queue-handoff-work"), null, "no card of AI's words");
    assert.equal(textOf(page).includes("Six of us is $540"), false, "the words wait in the conversation's box");
    assert.equal(
      find(page, (n) => n.type === "button" && textOf(n) === "Send"),
      null,
      "nothing is sent from Today",
    );
    const reply = byTestId(cardOf(page), "today-card-act");
    assert.ok(
      find(reply, (n) => classes(n).includes("ny-ready")),
      "AI's mark says its reply is ready",
    );
    press(reply);
    assert.deepEqual(went, [`inbox/th-${first.conversationId}`], "the press opens Sofia's conversation");
    went.length = 0;
  } finally {
    setSurfaceValue("reply_drafts", undefined);
  }
});

test("the head says AI has a reply ready only where its words can go: never over a card whose one press is a template", () => {
  phone = true;
  /** One handoff on WhatsApp, its window open or shut, with Ask's reply kept for it; what the head is told of it. */
  const headOver = (lastIn) => {
    const t = thread("cv-t", "Tara Quinn", [msg("t1", "Is Saturday free?", lastIn)], {
      state: "needs_human",
      last_wa_inbound_at: lastIn,
    });
    const vm = toTodayVM(metrics(), [t], [{ ...escalation(), id: "e-t", conversation_id: "cv-t" }], [], NOW);
    const row = vm.queue.rows[0];
    setSurfaceValue("reply_drafts", {
      complete: true,
      fetchedAt: NOW.getTime(),
      drafts: [
        {
          conversation_id: row.conversationId,
          kind: "reply",
          for_message_id: row.writes.for_message_id,
          words: { text: "Saturday at ten is free.", subject: "", asks: [], brief: null },
          made_at: NOW.toISOString(),
        },
      ],
    });
    set(vm);
    draw(NeedYouOnToday);
    return again(() => useNeedYouLine(surfaceValue("today") ?? null));
  };
  try {
    assert.match(String(headOver("2026-09-18T19:00:00Z")), /AI has a reply ready/, "an open window: the words can go");
    assert.doesNotMatch(
      String(headOver("2026-09-16T19:00:00Z")),
      /AI has/,
      "REGRESSION: the head said a reply was drafted over a card whose one press was Choose a template",
    );
  } finally {
    setSurfaceValue("reply_drafts", undefined);
  }
});

test("on a phone the page is one column in the calm order: the band, what holds the card, who waits, the day and what is left, the page's end last", async () => {
  phone = true;
  const { TodayZones } = await import("../../../apps/dashboard/src/surfaces/today/zones/page.tsx");
  const order = () => {
    fresh();
    const page = again(() => TodayZones());
    const root = page.rendered ?? page;
    assert.equal(root.props["data-testid"], "today-phone");
    return [root.props.children]
      .flat(Infinity)
      .filter(Boolean)
      .flatMap((c) => (c.type === W.React.Fragment ? [c.props.children].flat(Infinity).filter(Boolean) : [c]))
      .map((c) => c.type?.name ?? c.props?.["data-testid"]);
  };
  // Who waits holds the card (Need you draws it), setting up a line under them; the day and the rest; the end.
  set(twoWaiting());
  const busy = order();
  assert.equal(busy[0], "TodayAlertBand");
  assert.equal(busy[1], "NeedYou", "who waits on you first, their card with them");
  assert.ok(
    busy.indexOf("DayZone") > busy.indexOf("NeedYou") && busy.indexOf("AskFound") > busy.indexOf("DayZone"),
    `the day, then what AI found: ${busy.join(", ")}`,
  );
  assert.equal(busy.at(-1), "TodayEnd", "the page's end last");
  // Nobody waits, but Ben's step is due: the step holds the card, drawn by Need you, in the same place.
  set(nobodyWaiting());
  const quiet = order();
  assert.equal(quiet[1], "NeedYou");
  assert.equal(quiet.at(-1), "TodayEnd");
});
