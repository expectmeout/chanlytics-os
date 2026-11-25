/**
 * The first run's Ask, a plan on the Line, the panel's review (Ruben's recording, 16 Oct 2026), and the answer's
 * words formatted as the answer canvas sets them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AskAnswerKit,
  AskHome,
  BY_EMAIL,
  CLOSED,
  HEAD,
  MADE_MESSAGE,
  OPEN,
  PC,
  PLAN_ID,
  PLAN_MSG,
  PLAN_PB,
  PV,
  Palette,
  SENT,
  SIX,
  TH,
  all,
  ask,
  askCalls,
  askText,
  asks,
  byClass,
  byTestId,
  cells,
  classOf,
  closes,
  draw,
  find,
  hookParts,
  howOf,
  isIcon,
  keyed,
  later,
  opens,
  planBridge,
  planCard,
  planProps,
  press,
  render,
  said,
  setCells,
  setSurfaceValue,
  textOf,
  typed,
  until,
  withNext,
} from "./_palette.mjs";

/* ------------------------------ the first run ------------------------------ */

test("over the first run the Line is on the start surface: it asks about setting up, what is left first, draws no key, and a question goes with the step the page is on (Ask Rewired, Phase 7)", async () => {
  const hash = globalThis.window.location.hash;
  const { pageContext } = await import("../../../apps/dashboard/src/bridge/ask/context.ts");
  const calls = ask([]);
  // The bridge's own reading of the page (ask.ts installAsk): the start provider, over this window.
  askCalls().context = (route, words, thread) => pageContext(globalThis.window, route, words, thread);
  askCalls().send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: TH(6).id, title: input.text });
    on({ t: "final", message: said("m-start", "Two of four are set up; next is your number.") });
  };
  try {
    globalThis.window.location.hash = "#/start/phone";
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.deepEqual(byClass(tree, "ask-rows-label").map(textOf), [], "no preset questions here either");
    // What is left first, then what AI can do (the operator, D8); never an offer or a playbook here. They match what is
    // typed, and are no chip at rest.
    assert.deepEqual(
      askCalls()
        .suggestions("start", null, "en")
        .filter((q) => q.kind === "ask")
        .slice(0, 3)
        .map((q) => q.label || q.q),
      ["What is left to set up?", "What are our hours this week?", "What can you do for me?"],
    );
    assert.ok(!/[↵⌘↑↓]|\bEsc\b|\bdel\b/.test(textOf(tree)), `no key is drawn (D17): ${textOf(tree)}`);
    typed(tree, "What is left to set up?");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(calls.inputs.length, 1, "one turn, the model's: no quick answer reads the steps a second time");
    const [asked] = calls.inputs;
    assert.equal(asked.text, "What is left to set up?");
    assert.equal(asked.surface, "start");
    assert.deepEqual(
      [asked.context.surface, asked.context.route, asked.context.view],
      ["start", "start/phone", "phone"],
      "the step the address names rides along: the server's start provider reads Setup's steps beside it",
    );
    assert.equal(textOf(byTestId(tree, "ask-say")), "Two of four are set up; next is your number.");
    await closes();
  } finally {
    delete askCalls().context;
    globalThis.window.location.hash = hash;
  }
});

test("a plan draws as one card where its first card stood, whatever order the model made its steps in: what it is, the message as a person reads it, one press that names the send, and how it runs folded away, what no step says among it (D2 of the answers canvas)", async () => {
  const calls = planBridge();
  const AskAnswer = AskAnswerKit.AskAnswer;
  const reply = {
    id: "p-r",
    kind: "reply",
    needs: "operator",
    title: "Reply to Nora",
    summary: "We're running late.",
    payload: { conversation_id: "c1" },
    undo: null,
  };
  const close = {
    ...reply,
    id: "p-c",
    kind: "thread_verb",
    title: "Close Sam's conversation",
    payload: { verb: "resolve" },
  };
  try {
    const [s1, s2, s3] = BY_EMAIL;
    const tree = render(AskAnswer, planProps([reply, s3, close, s1, s2]));
    assert.deepEqual(byClass(tree, "ask-card-title").map(textOf), [reply.title, HEAD.title, close.title]);
    const plan = byTestId(tree, "ask-plan");
    assert.equal(textOf(byClass(plan, "ask-card-sub")[0]), HEAD.sub);
    assert.equal(textOf(byTestId(plan, "ask-plan-says")), HEAD.says[0].words);
    const group = byTestId(tree, "ask-plan-approve");
    assert.equal(textOf(group), "Start the offer");
    assert.deepEqual(classOf(group), ["btn", "btn-sm", "btn-primary", "ask-press"], "the kit's button");
    assert.equal(group.props["aria-disabled"], undefined);
    assert.deepEqual(howOf(tree), [
      "Tells AI.",
      "Pauses your month's offer.",
      "Goes on Nov 1 at 10:00 AM.",
      ...HEAD.also,
    ]);
    assert.deepEqual([calls.commit, calls.plan], [[], []], "nothing is pressed by drawing");
  } finally {
    calls.restore();
  }
});

test("the plan's own words are the Line's, in the Line's language (surfaces/ask/words.ts): its press names what it does, and a plan whose words WhatsApp checks first starts in the same press, with no note of its own and no press to send them for review", () => {
  const calls = planBridge();
  const AskAnswer = AskAnswerKit.AskAnswer;
  const chrome = (lang, cards) => {
    const tree = render(AskAnswer, planProps(cards, { t: askText(lang) }));
    return {
      press: textOf(byTestId(tree, "ask-plan-approve")) || null,
      note: textOf(byTestId(tree, "ask-step-note")) || null,
    };
  };
  try {
    assert.deepEqual(chrome("en", BY_EMAIL), { press: "Start the offer", note: null });
    assert.deepEqual(chrome("es", BY_EMAIL), { press: "Empezar la oferta", note: null });
    // The one press files step 1's words and starts its three sends, whose WhatsApp people wait for WhatsApp's check.
    assert.deepEqual(chrome("en", SIX), { press: "Do it", note: null });
    assert.deepEqual(chrome("es", SIX), { press: "Hazlo", note: null });
  } finally {
    calls.restore();
  }
});

test("one press takes the plan's steps up to and including its send, handed the plan's cards alone; while it runs it waits; after it, one receipt, and what each step became recorded in step order as a press records it", async () => {
  let release = () => {};
  const held = new Promise((r) => (release = r));
  const calls = planBridge({
    commitPlan: async (cards) => {
      calls.plan.push(cards);
      await held;
      return SENT;
    },
  });
  const AskAnswer = AskAnswerKit.AskAnswer;
  const reply = { ...SIX[0], id: "p-r", kind: "reply", title: "Reply to Nora", plan: undefined, payload: {} };
  try {
    const props = planProps([reply, ...BY_EMAIL]);
    let tree = render(AskAnswer, props);
    press(byTestId(tree, "ask-plan-approve"));
    tree = await later(AskAnswer, props);
    assert.deepEqual(
      calls.plan.map((cards) => cards.map((p) => p.id)),
      [["p-1", "p-2", "p-3"]],
      "one press, handed this plan's cards and no other card of the turn",
    );
    const busy = byTestId(tree, "ask-plan-approve");
    assert.equal(busy.props["aria-disabled"], true, "pressed once, it waits, and keeps its focus");
    assert.equal(textOf(busy), "Working…");
    release();
    await until(() => calls.outcomes.length === 3, "every step recorded");
    tree = await later(AskAnswer, props);
    assert.equal(textOf(byTestId(tree, "ask-plan-receipt")), "Set to go to 12 people.", "what the send says");
    assert.equal(byTestId(tree, "ask-plan-approve"), null, "nothing is left to press");
    assert.deepEqual(
      calls.outcomes.map(([mid, pid, o]) => [mid, pid, o.state, o.receipt]),
      [
        [PLAN_MSG, "p-1", "done", "AI knows."],
        [PLAN_MSG, "p-2", "done", "Paused."],
        [PLAN_MSG, "p-3", "done", "Set to go to 12 people."],
      ],
    );
    assert.deepEqual(
      Object.keys(calls.outcomes[0][2]).sort(),
      ["atMs", "made", "receipt", "state", "undo"],
      "the shape a card's own press records",
    );
    assert.deepEqual(calls.commit, [], "no card was pressed on its own");
  } finally {
    calls.restore();
  }
});

test("REGRESSION (fix round 1): the plan holds its card until each step's outcome is recorded: nothing can be pressed while the outcomes are on their way, since a press then would record over one of them", async () => {
  const queued = [];
  const undone = [];
  const steps = BY_EMAIL.map((p) => ({ ...p, undo: `Take back ${p.title}` }));
  const calls = planBridge({
    undoOpen: () => true,
    commitPlan: async (cards) => {
      calls.plan.push(cards);
      return {
        ...SENT,
        results: SENT.results.map((r) => ({ ...r, result: { ...r.result, undo: { step: r.step } } })),
      };
    },
    undoPlan: async (cards) => {
      undone.push(cards.map((p) => p.id));
      return { results: [] };
    },
    // Each outcome is kept only when the test lets it land, as a slow route would answer.
    outcome: (mid, pid, o) =>
      new Promise((resolve) =>
        queued.push(() => {
          calls.outcomes.push([mid, pid, o]);
          resolve(true);
        }),
      ),
  });
  const AskAnswer = AskAnswerKit.AskAnswer;
  const presses = (tree) => ["ask-plan-approve", "ask-plan-undo"].map((id) => byTestId(tree, id)).filter(Boolean);
  try {
    const props = planProps(steps);
    let tree = render(AskAnswer, props);
    press(byTestId(tree, "ask-plan-approve"));
    tree = await later(AskAnswer, props);
    assert.equal(queued.length, 1, "the press is back, and its outcomes are recorded one at a time");
    assert.ok(
      presses(tree).every((b) => b.props["aria-disabled"] === true),
      "REGRESSION: pressable meanwhile",
    );
    // A press in that window does nothing: no send, no undo, nothing recorded beside the plan's.
    for (const b of presses(tree)) press(b);
    tree = await later(AskAnswer, props);
    assert.deepEqual([calls.plan.length, undone], [1, []]);
    while (queued.length) {
      queued.shift()();
      tree = await later(AskAnswer, props);
    }
    assert.deepEqual(
      calls.outcomes.map(([, pid]) => pid),
      ["p-1", "p-2", "p-3"],
      "every outcome recorded, the plan's alone",
    );
    const back = byTestId(tree, "ask-plan-undo");
    assert.equal(back.props["aria-disabled"], undefined, "once every outcome is kept, its Undo is the person's again");
    press(back);
    tree = await later(AskAnswer, props);
    assert.deepEqual(undone, [["p-1", "p-2", "p-3"]]);
  } finally {
    calls.restore();
  }
});

test("two plans in one turn are two cards: each one's press is handed its own cards alone", async () => {
  const other = [1, 2, 3].map((n) =>
    planCard(n, n < 3 ? "settings" : "broadcast", `Other step ${n}`, SIX[n === 3 ? 4 : 1].payload, {
      id: `p-o${n}`,
      plan: { id: "plan-other", step: n, of: 3, silent: n < 3, after: n < 3 ? [] : [1, 2] },
    }),
  );
  const calls = planBridge();
  const AskAnswer = AskAnswerKit.AskAnswer;
  try {
    const props = planProps([...BY_EMAIL, ...other]);
    let tree = render(AskAnswer, props);
    const plans = all(tree, (n) => n.props?.["data-testid"] === "ask-plan");
    assert.equal(plans.length, 2);
    press(byTestId(plans[1], "ask-plan-approve"));
    tree = await later(AskAnswer, props);
    press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "ask-plan")[0], "ask-plan-approve"));
    tree = await later(AskAnswer, props);
    assert.deepEqual(
      calls.plan.map((cards) => cards.map((p) => p.id)),
      [
        ["p-o1", "p-o2", "p-o3"],
        ["p-1", "p-2", "p-3"],
      ],
      "each press reaches its own plan's cards and none of the other's",
    );
  } finally {
    calls.restore();
  }
});

test("a stop says why and that nothing went out, in the plan's own words, never wrapped again; the same press carries on from there", async () => {
  const stopped = PC.PROPOSAL_WORDS.planStopped("Someone saved the settings first. Open Settings and try again.");
  assert.match(stopped, /^Stopped: Someone saved the settings first\. .* Nothing went out\.$/);
  const calls = planBridge({
    commitPlan: async (cards) => {
      calls.plan.push(cards);
      return {
        results: [
          { step: 1, id: null, result: { ok: true, receipt: "AI knows.", undo: null, made: null } },
          { step: 2, id: null, result: { ok: false, message: stopped, status: 409 } },
        ],
        done: [],
        undone: [],
        stoppedAt: 2,
        made: { 1: { kind: "settings", id: null } },
      };
    },
  });
  const AskAnswer = AskAnswerKit.AskAnswer;
  try {
    const props = planProps(BY_EMAIL);
    let tree = render(AskAnswer, props);
    press(byTestId(tree, "ask-plan-approve"));
    await until(() => calls.outcomes.length === 2, "both recorded");
    tree = await later(AskAnswer, props);
    assert.equal(textOf(byTestId(tree, "ask-plan-receipt")), stopped);
    assert.equal(textOf(byTestId(tree, "ask-plan-approve")), "Start the offer", "the same press, for what is left");
    assert.deepEqual(
      calls.outcomes.map(([, pid, o]) => [pid, o.state, o.receipt]),
      [
        ["p-1", "done", "AI knows."],
        ["p-2", "failed", stopped],
      ],
      "the stop recorded as a refused press records it",
    );
  } finally {
    calls.restore();
  }
});

test("REGRESSION (the live run of 14 Nov 2026): a plan of sends that need nothing of each other presses them all at once, and its press says how many", () => {
  const calls = planBridge();
  const AskAnswer = AskAnswerKit.AskAnswer;
  try {
    const journey = [1, 2, 3].map((n) =>
      planCard(
        n,
        "playbook",
        `Campaign ${n}`,
        { trigger: "quiet_30", channels: ["email"] },
        {
          id: `p-j${n}`,
          plan: { id: "plan-journey", step: n, of: 3, silent: false, after: [] },
        },
      ),
    );
    assert.deepEqual(PC.planPressOf(journey).steps, [1, 2, 3]);
    const t = askText("en");
    assert.equal(PC.askPressOf(journey[0]), "start");
    assert.equal(textOf(byTestId(render(AskAnswer, planProps(journey)), "ask-plan-approve")), t.pressAll(3));
    // All three on: the line says so, How it runs stands open with each one's own receipt, and nothing is left to press.
    const on = journey.map((c, i) => ({
      ...c,
      outcome: { state: "done", receipt: `Campaign ${i + 1} is on.`, atMs: 1 },
    }));
    const after = render(AskAnswer, planProps(on));
    assert.equal(textOf(byTestId(after, "ask-plan-receipt")), t.planAllOn(3));
    assert.match(textOf(byTestId(after, "ask-plan-how")), /Campaign 2 is on\./);
    assert.equal(byTestId(after, "ask-plan-approve"), null);
    // One left over (a press that stopped part-way) says it starts with the next press.
    const part = [on[0], ...journey.slice(1)];
    assert.equal(textOf(byTestId(render(AskAnswer, planProps(part)), "ask-plan-left")), t.planLeft(2));
  } finally {
    calls.restore();
  }
});

test("REGRESSION (ruling 3): what the plan's press made survives a reload, through the real record path: commitPlan's results recorded one by one through the outcome route onto the turn, read back by planMadeOf, and the turn drawn again says each step's receipt and lets each send go with what its steps made", async () => {
  const { fakeDb } = await import("../../_fake-db.mjs");
  const route = await import("../../../apps/dashboard/app/api/v1/ask/messages/[id]/proposals/[pid]/route.ts");
  const { createApi } = await import("../../../apps/dashboard/src/client/api.ts");
  const commit = await import("../../../apps/dashboard/src/bridge/ask/commit.ts");
  const NOW = Date.now();
  // The routes the steps reach, answered as the server answers them, through the typed client on a fake fetch.
  const ANSWERS = {
    "POST /api/v1/templates/message": {
      name: "offer",
      language: "en_US",
      versions: [
        { channel: "email", id: PV(1), state: "approved" },
        { channel: "whatsapp", id: PV(2), state: "pending" },
      ],
    },
    "PUT /api/v1/settings": { config: {}, version: 4 },
    [`PUT /api/v1/playbooks/${PLAN_PB}`]: { id: PLAN_PB, state: "paused", was: { state: "running" } },
    "POST /api/v1/broadcasts": { id: "b1", name: "Offer: November, again", state: "scheduled", recipient_count: 3 },
  };
  const sent = [];
  // The first send is refused once, so the press after the reload carries on with what the first made.
  let refusals = 1;
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      sent.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
      if (key === "POST /api/v1/broadcasts" && refusals-- > 0) {
        const error = { code: "conflict", message: "Not counted just now." };
        return new Response(JSON.stringify({ ok: false, error }), { status: 409 });
      }
      if (!ANSWERS[key]) throw new Error(`a route this test does not answer: ${key}`);
      return new Response(JSON.stringify({ ok: true, data: ANSWERS[key] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    workspace: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
  // The settings the tab read, as the settings read lands them (a window global, `__SETTINGS`, until 12 Nov 2026).
  const { setSurfaceValue: landRead, surfaceValue: heldRead } =
    await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
  landRead("settings", {
    ...(heldRead("settings") ?? {}),
    settings: { config: { brain: { business_name: "Harbor", profile: {} } }, version: 3 },
  });
  const tab = {
    location: { hash: "", pathname: "/w/harbor" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setTimeout: (fn) => (fn(), 1),
  };
  // The turn as the store keeps it, and the outcome route over it: the card's record, as the Line's goes out.
  const tables = {
    memberships: [
      {
        user_id: "u1",
        tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "owner",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    ask_messages: [
      {
        id: PLAN_MSG,
        thread_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
        tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user_id: "u1",
        role: "assistant",
        content: { text: "A plan of 3 steps and 3 sends to review.", proposals: SIX },
        created_at: "2026-10-11T10:00:00Z",
      },
    ],
  };
  const refused = [];
  let ran = null;
  const calls = planBridge({
    commitPlan: async (cards) => {
      ran = await commit.commitPlan(tab, cards, { client, nowMs: NOW });
      return ran;
    },
    commit: (p, cards) => commit.commitCard(tab, p, cards, { client, nowMs: NOW }),
    outcome: async (mid, pid, o) => {
      try {
        await route.POST.run(new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(o) }), {
          supabase: fakeDb(tables),
          userId: "u1",
          email: "ada@example.com",
          params: { id: mid, pid },
        });
        return true;
      } catch (e) {
        refused.push(e);
        return false;
      }
    },
  });
  const AskAnswer = AskAnswerKit.AskAnswer;
  try {
    let tree = render(AskAnswer, planProps(SIX));
    press(byTestId(tree, "ask-plan-approve"));
    await until(() => tables.ask_messages[0].content.proposals[3].outcome, "the first send's outcome is kept");
    tree = await later(AskAnswer, planProps(SIX));
    assert.deepEqual(refused, [], "every outcome the route took");
    const firstPress = ["POST /api/v1/templates/message", "PUT /api/v1/settings", `PUT /api/v1/playbooks/${PLAN_PB}`];
    assert.deepEqual(
      sent.map((s) => s.key),
      [...firstPress, "POST /api/v1/broadcasts"],
      "the words, then the send",
    );
    // Reloaded: the turn's cards as the store keeps them now.
    const kept = tables.ask_messages[0].content.proposals;
    assert.deepEqual(
      kept.map((p) => (p.outcome ? p.outcome.state : null)),
      ["done", "done", "done", "failed", null, null],
      "REGRESSION: every step's outcome kept on the turn, none written over by the next",
    );
    assert.deepEqual(PC.planMadeOf(PLAN_ID, kept), ran.made, "the press's made, read back from the turn");
    assert.deepEqual(ran.made[1], MADE_MESSAGE);
    const back = planProps(kept);
    tree = render(AskAnswer, back);
    assert.match(textOf(byTestId(tree, "ask-plan-receipt")), /Not counted just now/, "it says where it stands");
    assert.deepEqual(sent.length, 4, "nothing is sent by drawing it again");
    press(byTestId(tree, "ask-plan-approve"));
    // The next press starts the rest (Ruben, 14 Nov 2026): its two sends and its campaign, filing nothing twice.
    await until(() => sent.length === 7, "the sends went");
    assert.deepEqual(
      sent.slice(4).map((s) => s.key),
      ["POST /api/v1/broadcasts", "POST /api/v1/broadcasts", "POST /api/v1/playbooks"],
    );
    assert.equal(sent[4].body.template_id, PV(1), "its token filled from what step 1 made, read back after the reload");
  } finally {
    calls.restore();
  }
});

test("over Campaigns the Line's chips are the campaigns the playbooks surface read (palette.ts campaignsRead, A3): a run of one waiting asks why, by its name; a running win-back offers none; a paused one runs nothing; none read, no chip of Campaigns' own on a guess", async () => {
  const hash = globalThis.window.location.hash;
  const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
  /**
   * A campaign as the playbooks surface holds it: its name, moment, state, whether it runs on the business's day (on, before
   * its last day, its moment one that runs here: contracts campaignRunsOn), and its totals' run waiting (null where none).
   */
  const row = (over = {}) => ({
    id: "pb1",
    name: "Win-back",
    trigger: "quiet_30",
    state: "running",
    runs: true,
    totals: { waiting: null },
    ...over,
  });
  // The page's questions as the bridge offers them to what is typed, the three AI's home drew as chips until they were
  // found to come from a table (Ruben, 17 Nov 2026).
  const chips = async (rows) => {
    setSurfaceValue("playbooks", rows === undefined ? undefined : { rows });
    return askCalls()
      .suggestions("campaigns", null, "en")
      .filter((q) => q.kind !== "act" && q.q !== askText("en").needsQ)
      .slice(0, 3)
      .map((q) => q.label || q.q);
  };
  ask([]);
  try {
    globalThis.window.location.hash = "#/campaigns";
    const waiting = await chips([row({ totals: { waiting: { id: "run-1" } } })]);
    assert.deepEqual(waiting.slice(0, 2), ["Why is Win-back waiting?", "What's working?"], "totals.waiting, by name");
    assert.ok(!waiting.includes("Win back customers who went quiet"), "a running win-back: none offered");
    const paused = await chips([row({ state: "paused", runs: false })]);
    assert.ok(!paused.some((q) => q.startsWith("Why is")), "nothing waits");
    assert.ok(paused.includes("Win back customers who went quiet"), "a paused win-back runs nothing");
    // Running, but past its last day: it runs nothing either, and the win-back is offered (the wiring's second audit, S1-3).
    const ended = await chips([row({ runs: false })]);
    assert.ok(ended.includes("Win back customers who went quiet"), "an ended win-back runs nothing");
    const firstDay = await chips([]);
    assert.equal(firstDay[0], "Set up my campaigns", "the first day");
    const unread = await chips(undefined);
    for (const own of ["Set up my campaigns", "What's working?"]) assert.ok(!unread.includes(own), own);
  } finally {
    setSurfaceValue("playbooks", undefined);
    globalThis.window.location.hash = hash;
  }
});

/* ------------------------------ the panel's review (Ruben's recording, 16 Oct 2026) ------------------------------ */

test("the newest answer offers no next question the conversation already asked or an earlier answer of it offered", async () => {
  const calls = ask([]);
  const nexts = [
    ["What changed since Monday?", "Which day was busiest?"],
    ["which day was busiest", "How about last month?"],
    ["What changed since Monday?", "Any new reviews?"],
  ];
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    const n = calls.sent.length;
    on({ t: "thread", id: TH(5).id, title: input.text });
    const answer = { ...withNext(n), do: { open: null, next: nexts[n - 1] } };
    on({ t: "final", message: { ...said(`m-${n}`, `Answer ${n}.`), answer } });
  };
  const offered = (tree) =>
    all(byTestId(tree, "ask-next-row"), (n) => n.props?.["data-testid"] === "ask-next").map(textOf);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  tree = await asks(tree, OPEN, "how was the week?");
  assert.deepEqual(offered(tree), nexts[0]);
  tree = await asks(tree, OPEN, "Which day was busiest?");
  assert.deepEqual(
    offered(tree),
    ["How about last month?"],
    "the question just asked, in any case and stops, is not offered",
  );
  tree = await asks(tree, OPEN, "How about last month?");
  assert.deepEqual(offered(tree), ["Any new reviews?"], "nor one an earlier answer offered");
  await closes();
});

test("a long think says how long it has run: from its fourth second the newest read carries the seconds", () => {
  const { AskReads } = AskHome;
  const t = askText("en");
  const reads = (ago) => {
    setCells(new Map());
    return draw(AskReads, { traces: ["Reading the inbox…"], since: ago === null ? null : Date.now() - ago, t });
  };
  assert.equal(byTestId(reads(1_000), "ask-read-time"), null, "a quick read says no time");
  assert.equal(textOf(byTestId(reads(9_000), "ask-read-time")), "9s");
  assert.equal(byTestId(reads(null), "ask-read-time"), null, "nor a read with no turn behind it");
});

test("a figure's source is its value's tooltip, and Copy and Read aloud say their words beside their glyphs", () => {
  const { AskAnswer } = AskAnswerKit;
  const { AskActs } = AskHome;
  const t = askText("en");
  const answer = {
    v: 2,
    form: "structured",
    language: "en",
    say: { headline: "6 of 16 went unanswered.", detail: "" },
    show: {
      figures: [
        {
          value: "5",
          label: "needed you",
          note: "up from 1",
          source: { kind: "page", id: "reports", label: "Reports, past 7 days", to: "reports", door: true },
        },
      ],
      items: [],
      breakdown: null,
    },
    do: { open: null, next: [] },
  };
  setCells(new Map());
  const tree = draw(AskAnswer, { answer, cardOpen: {}, cards: [], messageId: "m-f", t, onNav() {}, onFollow() {} });
  assert.equal(byTestId(tree, "ask-figure").props.title, "From Reports, past 7 days");
  setCells(new Map());
  const speech = { speakingId: null, loading: null, canSpeak: true, toggle: async () => null };
  const acts = draw(AskActs, { words: "6 of 16 went unanswered.", spoken: "", speech, flash() {}, t });
  assert.deepEqual(byClass(acts, "ask-act-word").map(textOf), ["Copy", "Read aloud"]);
});

/* ------------------------------ the answer's words, formatted (the answer canvas, phase A1) ------------------------------ */

test("an answer's formatting is drawn from its blocks: a heading, steps with points nested under them, a table whose number column is set right, bold as strong; never as markup", async () => {
  ask([]);
  const { AskAnswer } = AskAnswerKit;
  const t = askText("en");
  const answer = {
    v: 2,
    form: "structured",
    language: "en",
    say: {
      headline: "WhatsApp booked the most this month.",
      detail:
        "### This week\n1. Answer **Ana** first.\n  - she waited 3 days\n2. Then Sam.\n\n| Channel | Booked |\n|---|---|\n| WhatsApp | **18** |\n| Text | 3 |\n\n<b>Tags</b> stay text.",
    },
    show: {
      figures: [],
      items: [],
      breakdown: null,
      list: { style: "bullets", entries: ["Call **Sam** back"] },
    },
    do: { open: null, next: [] },
  };
  setCells(new Map());
  const tree = draw(AskAnswer, { answer, cardOpen: {}, cards: [], messageId: "m-w", t, onNav() {}, onFollow() {} });
  const words = byTestId(tree, "ask-words");
  assert.ok(words.props.className.split(" ").includes("ask-detail"), "the detail's own class, as the paragraph had");
  assert.equal(textOf(find(words, (n) => n.type === "h4")), "This week");
  const steps = find(words, (n) => n.type === "ol");
  assert.equal(all(steps, (n) => n.type === "li").length, 3, "two steps and the point nested under the first");
  assert.equal(
    textOf(
      find(
        find(steps, (n) => n.type === "ul"),
        (n) => n.type === "li",
      ),
    ),
    "she waited 3 days",
  );
  assert.deepEqual(all(words, (n) => n.type === "strong").map(textOf), ["Ana", "18"]);
  const table = byTestId(words, "ask-words-table");
  assert.deepEqual(all(table, (n) => n.type === "th").map(textOf), ["Channel", "Booked"]);
  assert.deepEqual(
    all(table, (n) => n.type === "td").map((n) => [textOf(n), n.props.className ?? ""]),
    [
      ["WhatsApp", ""],
      ["18", "ask-words-num"],
      ["Text", ""],
      ["3", "ask-words-num"],
    ],
    "a column of numbers is set right",
  );
  assert.ok(textOf(words).includes("<b>Tags</b> stay text."), "a tag in the words is text, never an element");
  assert.equal(
    find(words, (n) => n.type === "b"),
    null,
  );
  assert.deepEqual(
    all(byTestId(tree, "ask-list"), (n) => n.type === "strong").map(textOf),
    ["Sam"],
    "a list's entry keeps its bold",
  );
});

test("a campaign's card draws its sheet (the answer canvas, C1): what holds it first, then a row a fact under its label; a card with no sheet, its summary as before", () => {
  const sheet = {
    holds: ["WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve."],
    rows: [
      { label: "Where", value: "Quiet for 30 days — they stopped writing" },
      { label: "Runs", value: "Every day at 10:00, 25 a run" },
      { label: "Reaches", value: "26 people who said yes to offers" },
    ],
  };
  const p = {
    id: "p1",
    kind: "playbook",
    needs: "operator",
    title: "Campaign: Win-back",
    summary:
      "Quiet for 30 days — they stopped writing · every day at 10:00, 25 a run · 26 people who said yes to offers",
    payload: {},
    sheet,
    undo: null,
  };
  const { AskCard } = AskAnswerKit;
  const tree = render(AskCard, { p, t: askText("en"), onNav() {} });
  const drawn = byTestId(tree, "ask-card-sheet");
  assert.ok(drawn, "the sheet, in the card's change");
  assert.deepEqual(byClass(drawn, "ask-spec-hold").map(textOf), sheet.holds, "the holds first");
  assert.deepEqual(
    byClass(drawn, "ask-spec-row").map((r) => textOf(r)),
    sheet.rows.map((r) => `${r.label}${r.value}`),
    "a row a fact: its label, then its words",
  );
  assert.equal(
    byClass(tree, "ask-card-summary").some((n) => textOf(n) === p.summary),
    false,
    "the summary is not drawn beside its sheet",
  );
  const bare = render(AskCard, { p: { ...p, sheet: undefined }, t: askText("en"), onNav() {} });
  assert.ok(!byTestId(bare, "ask-card-sheet"), "no sheet drawn");
  assert.ok(
    byClass(bare, "ask-card-summary").some((n) => textOf(n) === p.summary),
    "no sheet: the summary",
  );
});

test("a card of the one thing to fix before a campaign reaches anyone (the 30 Oct 2026 review, item 6) is drawn by its line, and its door in Approve's place, which opens where it is fixed", () => {
  const { AskCard } = AskAnswerKit;
  const p = {
    id: "p-f",
    kind: "fix",
    needs: "operator",
    title: "Fix WhatsApp first",
    summary:
      "Meta reports a problem with the payment method on your WhatsApp account. It is fixed under Settings › Connections.",
    line: "Meta reports a problem with the payment method on your WhatsApp account. Until then the “Win-back” campaign would reach no one.",
    payload: { trigger: "quiet_30", door: "Open Connections", to: "admin/integrations" },
    undo: null,
  };
  for (const lang of ["en", "es"]) {
    const went = [];
    const tree = render(AskCard, { p, t: askText(lang), onNav: (to) => went.push(to) });
    assert.equal(textOf(byClass(tree, "ask-card-summary")[0]), p.line, "its one line");
    assert.equal(byTestId(tree, "ask-card-approve"), null, "REGRESSION: Approve on a card with nothing to approve");
    const door = byTestId(tree, "ask-card-door");
    assert.equal(textOf(door), "Open Connections");
    press(door);
    assert.deepEqual(went, ["admin/integrations"], "its door opens where it is fixed");
  }
});

/* ------------------------------ what the source pins said, run ------------------------------ */

test("the Line is its own dialog: the field in it, the frame's door opens it, and nothing seeded stands in it", async () => {
  ask([]);
  render(Palette, CLOSED);
  const tree = await opens();
  assert.ok(byTestId(tree, "ask-real"), "the Line");
  assert.equal(byTestId(tree, "ask-input").type, "textarea", "its one field");
  assert.doesNotMatch(textOf(tree), /Aisha|Jordan|Lena|Drifting VIP|revenue pacing/, "nothing seeded in the real Line");
});

test("a card drawn again reads back what became of it: its receipt, and no second Approve", () => {
  const { AskCard } = AskAnswerKit;
  const p = {
    id: "p1",
    kind: "reply",
    title: "Reply to Rosa",
    summary: "On the way",
    payload: {},
    undo: "Take it back",
    outcome: { state: "done", receipt: "Sent to Rosa", atMs: Date.now(), undo: null },
  };
  const tree = render(AskCard, { p, t: askText("en"), onNav() {} });
  assert.match(byTestId(tree, "ask-card").props.className, /\bdone\b/, "the card is as it was left");
  assert.equal(byTestId(tree, "ask-card-approve"), null, "a card that went offers no second send");
  assert.match(textOf(tree), /Sent to Rosa/);
  const fresh = render(AskCard, { p: { ...p, outcome: undefined }, t: askText("en"), onNav() {} });
  assert.ok(byTestId(fresh, "ask-card-approve"), "a card with no outcome is one to approve");
});

test("a compose row lands in the input for the person to finish, never asked; a row with a question is asked", () => {
  const { arActivate } = hookParts;
  const said = [];
  const activate = arActivate({
    openThread() {},
    nav() {},
    setQuery: (q) => said.push(["field", q]),
    inputRef: { current: null },
    submit: (q) => said.push(["asked", q]),
  });
  activate({ type: "act", compose: true, q: "Hold every reply for" });
  assert.deepEqual(said, [["field", "Hold every reply for"]]);
  activate({ type: "sug", q: "Who needs me?" });
  assert.deepEqual(said.at(-1), ["asked", "Who needs me?"]);
});

test("a question asked again resumes its thread, not a twin, even before the list has landed", async () => {
  const TWIN = { ...TH(1), title: "Where did we leave it?" };
  const calls = ask([TWIN]);
  let land;
  const list = new Promise((r) => (land = r));
  askCalls().threads = () => list;
  askCalls().send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "final", message: said("m-1", "Answer.") });
  };
  render(Palette, CLOSED);
  let tree = await opens();
  typed(tree, "where did we leave it?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  await later(Palette, OPEN);
  assert.equal(calls.inputs.length, 0, "the question waits for the list, whose reading is on its way");
  land([TWIN]);
  await later(Palette, OPEN);
  await until(() => calls.inputs.length === 1, "the question goes once the list lands");
  assert.deepEqual(calls.opened, [TWIN.id], "its conversation opened");
  assert.equal(calls.inputs[0].threadId, TWIN.id, "and the question joined it");
});

test("a send's card names no kind and wears no mark: its title says what it is (D1 of the answers canvas)", () => {
  const { AskCard } = AskAnswerKit;
  for (const kind of ["broadcast", "playbook"]) {
    const p = { id: "p1", kind, title: "T", summary: "S", payload: {}, undo: null };
    const head = byClass(render(AskCard, { p, t: askText("en"), onNav() {} }), "ask-card-head")[0];
    assert.equal(textOf(head), "T", kind);
    assert.equal(byClass(head, "ask-card-kind").length, 0, kind);
    assert.equal(find(head, isIcon), null, kind);
  }
});
