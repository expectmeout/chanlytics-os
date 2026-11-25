/**
 * Ask's routes: the fourteen declare their policy; a question asked, answered and kept, a quick answer kept, Stop
 * reaching the turn, a turn read back, the threads and the follow-ups, and the metrics behind Today. Run through the
 * routes over the database in memory, the model scripted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_MODEL } from "@chanlytics/contracts";
import {
  A,
  B,
  CONV,
  M1,
  PAST_MORNING,
  T1,
  T2,
  T3,
  USER,
  ask,
  askedBlocks,
  both,
  buildContext,
  campaigns,
  campaignsLedger,
  ctxFor,
  followUpsNow,
  followUpsRoute,
  get,
  inA,
  inB,
  keeping,
  kept,
  metrics,
  noraWaits,
  openings,
  people,
  proposals,
  quick,
  readerContext,
  receptionist,
  refused,
  reports,
  reviews,
  send,
  setAskPorts,
  thread,
  threadRow,
  threads,
  turn,
  warm,
  writes,
} from "./_routes.mjs";

test("the fourteen declare their policy: a question every member's and counted, the warm every member's and counted with the aggregates, the aggregates counted with their query declared, a person's own threads and cards on the account", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const own = { scope: "account", role: null, rate: null, spend: false };
  assert.deepEqual(ask.POST.policy, { kind: "write", scope: "workspace", role: "viewer", rate: "ask", spend: false });
  assert.deepEqual(warm.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "viewer",
    rate: "aggregate",
    spend: false,
  });
  assert.deepEqual(proposals.POST.policy, { kind: "write", ...own });
  assert.deepEqual(openings.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(threads.GET.policy, open);
  assert.deepEqual(followUpsRoute.GET.policy, open);
  assert.deepEqual(thread.GET.policy, { kind: "read", ...own });
  assert.deepEqual(thread.DELETE.policy, { kind: "write", ...own });
  assert.deepEqual(metrics.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(reports.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(campaigns.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(reviews.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(receptionist.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(people.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(campaignsLedger.GET.policy, { ...open, rate: "aggregate" });
});

test("a question: the workspace must be named, something must be asked and not too much, a thread must exist and be this workspace's — and nothing is saved for a refusal", async () => {
  const tables = { memberships: both("viewer", "operator"), ask_threads: [threadRow(T1, A)], ask_messages: [] };
  await refused(
    ask.POST.run(send("POST", { text: "Who booked this week?" }), ctxFor(tables)),
    "choose_workspace",
    400,
    "say which one",
  );
  await refused(ask.POST.run(send("POST", { text: "   " }, inB), ctxFor(tables)), "validation", 400, "Ask something.");
  await refused(
    ask.POST.run(send("POST", { text: "x".repeat(1001) }, inB), ctxFor(tables)),
    "validation",
    400,
    "Keep a question under 1000 characters.",
  );
  await refused(
    ask.POST.run(send("POST", { text: "And then?", thread_id: "nope" }, inB), ctxFor(tables)),
    "not_found",
    404,
    "That conversation does not exist.",
  );
  const elsewhere = ctxFor(tables, {});
  await refused(
    ask.POST.run(send("POST", { text: "And then?", thread_id: T1 }, inB), elsewhere),
    "not_found",
    404,
    "That conversation is not yours.",
  );
  assert.equal(writes(elsewhere), 0, "no turn is saved for a question that was refused");
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 0]);
});

test("a question answered: the thread is made before the model is asked, the person's words and the answer are its two turns, the answer is stored as the Line draws it beside the v1 fields it gives, the thread keeps its question as its title, and the stream says thread, say, then final", async () => {
  // The turn through the route, with the model scripted: one round, the answer
  // written as its format. Everything else -- the thread, the two messages,
  // the stream -- is the route's own and runs for real against the database
  // in memory.
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Nobody has booked this week yet.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: {
      open: { source: { kind: "page", id: "calendar", label: "Calendar" }, label: "", now: false },
      next: ["Who called this week?"],
    },
    language: "en",
  });
  // What the model was told each turn: the surface the palette sent must reach the prompt (the turn's words, in the
  // question's message, after the page's data).
  const systems = [];
  setAskPorts({
    round: async (call, onText) => {
      const q = askedBlocks(call.request);
      systems.push([...call.request.system.map((b) => b.text), ...q.map((c) => c.text ?? "")].join("\n"));
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  try {
    const res = await ask.POST.run(
      send("POST", { text: "Who booked this week?", surface: "today" }, inA),
      ctxFor(tables),
    );
    assert.ok(res instanceof Response, "a stream, not an envelope");
    assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      lines.map((l) => l.t),
      ["thread", "say", "final"],
    );
    assert.deepEqual([lines[1].headline, lines[1].detail], ["Nobody has booked this week yet.", ""]);
    assert.equal(tables.ask_threads.length, 1, "the thread exists before the model was asked");
    const thread = tables.ask_threads[0];
    assert.deepEqual([lines[0].id, thread.tenant_id, thread.user_id], [thread.id, A, USER]);
    assert.deepEqual(
      tables.ask_messages.map((m) => [m.thread_id, m.role, m.content.text]),
      [
        [thread.id, "user", "Who booked this week?"],
        [thread.id, "assistant", "Nobody has booked this week yet."],
      ],
      "the person's words, then the answer's words",
    );
    const stored = tables.ask_messages[1].content;
    const message = lines[2].message;
    assert.equal(stored.v, 2);
    assert.deepEqual(message.answer, stored.answer, "the final line carries the answer as stored");
    assert.deepEqual(
      [stored.answer.say.headline, stored.answer.do.open, stored.answer.do.next],
      [
        "Nobody has booked this week yet.",
        { to: "calendar", label: "Calendar", now: false },
        ["Who called this week?"],
      ],
    );
    assert.deepEqual(
      [stored.navigate, stored.followups, stored.citations],
      [{ to: "calendar", label: "Calendar", now: false }, ["Who called this week?"], []],
      "the v1 fields every older reader knows",
    );
    assert.deepEqual(
      [message.text, message.followups, message.failed, message.rounds],
      ["Nobody has booked this week yet.", ["Who called this week?"], false, 1],
    );
    assert.equal(message.id, tables.ask_messages[1].id, "the final line carries the saved turn");
    assert.equal(thread.title, "Who booked this week?", "titled by its question, never renamed (D9)");
    assert.ok(thread.last_at, "and touched");
    assert.equal(
      stored.model,
      ASK_MODEL,
      "the model the deployment runs: the default here, since the test sets no ASK_MODEL",
    );
    // A follow-up on the same thread: the history rides in, nothing is re-created.
    const again = await ask.POST.run(
      send("POST", { text: "And last week?", thread_id: thread.id }, inA),
      ctxFor(tables),
    );
    await again.text();
    assert.equal(tables.ask_threads.length, 1);
    assert.equal(tables.ask_messages.length, 4);
    // Where they are rides into the turn, as contracts list the surfaces (ASK_SURFACES), Leads among them.
    assert.ok(systems[0].includes("They are on the today page."), "the first turn's surface reached the prompt");
    assert.ok(!systems[1].includes("They are on the"), "a follow-up sent without one names no page");
    const onLeads = await ask.POST.run(
      send("POST", { text: "100 nail salons in Queens, NY", surface: "leads" }, inA),
      ctxFor(tables),
    );
    await onLeads.text();
    assert.ok(systems[2].includes("They are on the Leads page"), "Leads is a surface the route accepts");
    assert.ok(systems[2].includes("are a lead search to propose"), "and the prompt steers a search there");
    assert.equal(tables.ask_threads[1].title, "100 nail salons in Queens, NY", "titled by the owner's own words");
    const elsewhere = await ask.POST.run(send("POST", { text: "And more?", surface: "clients" }, inA), ctxFor(tables));
    await elsewhere.text();
    assert.ok(!systems[3].includes("They are on the"), "a name the palette never sends is dropped, not refused");
  } finally {
    setAskPorts(null);
  }
});

test("a quick answer kept (POST ask/quick): every member's and counted as a question; only a quick question's answer, in a shape the Line draws, in a thread of the caller's in this workspace -- and nothing is saved for a refusal", async () => {
  assert.deepEqual(quick.POST.policy, { kind: "write", scope: "workspace", role: "viewer", rate: "ask", spend: false });
  const tables = { memberships: both("viewer", "operator"), ask_threads: [threadRow(T1, A)], ask_messages: [] };
  const answer = noraWaits();
  const ctx = ctxFor(tables);
  const keep = (body, q = inB) => quick.POST.run(send("POST", body, q), ctx);
  await refused(keep({ text: "who needs me?", answer }, ""), "choose_workspace", 400);
  await refused(keep({ text: "  ", answer }), "validation", 400, "Ask something.");
  await refused(
    keep({ text: "Draft a reply to everyone waiting on me", answer }),
    "validation",
    400,
    "Only a quick question's answer is kept here.",
  );
  await refused(
    keep({ text: "who needs me?", answer: { ...answer, form: "prose" } }),
    "validation",
    400,
    "not one the Line draws",
  );
  await refused(keep({ text: "who needs me?" }), "validation", 400, "not one the Line draws");
  await refused(
    keep({ text: "who needs me?", answer, thread_id: "nope" }),
    "not_found",
    404,
    "That conversation does not exist.",
  );
  await refused(
    keep({ text: "who needs me?", answer, thread_id: T1 }),
    "not_found",
    404,
    "That conversation is not yours.",
  );
  assert.equal(writes(ctx), 0, "nothing is saved for a refusal");
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 0]);
});

test("a quick answer kept: a new thread titled by its question, the question and the answer its two turns, stored as a turn's; the thread named takes the next two; and the next question is asked with it, its rows by id", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const answer = noraWaits();
  const kept = await quick.POST.run(send("POST", { text: "Who needs me?", answer }, inA), ctxFor(tables));
  assert.equal(tables.ask_threads.length, 1);
  const thread = tables.ask_threads[0];
  assert.deepEqual(kept, { thread: { id: thread.id, title: "Who needs me?" } });
  assert.deepEqual([thread.tenant_id, thread.user_id, thread.title], [A, USER, "Who needs me?"]);
  assert.deepEqual(
    tables.ask_messages.map((m) => [m.thread_id, m.role]),
    [
      [thread.id, "user"],
      [thread.id, "assistant"],
    ],
  );
  assert.equal(tables.ask_messages[0].content.text, "Who needs me?");
  const stored = tables.ask_messages[1].content;
  assert.deepEqual([stored.v, stored.quick, stored.failed, stored.proposals], [2, "needs", false, []]);
  assert.deepEqual(stored.answer, answer, "the answer as the Line drew it");
  assert.equal(stored.text, answer.say.headline, "with the v1 fields every older reader knows");
  assert.deepEqual(
    stored.citations.map((c) => [c.kind, c.id]),
    [["thread", CONV]],
  );
  // Asked again, as a question that repeats the thread's first: the same thread takes it.
  await quick.POST.run(send("POST", { text: "who needs me?", answer, thread_id: thread.id }, inA), ctxFor(tables));
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 4]);
  // The next question, in that thread: the model reads what was shown, the rows by their ids.
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Nora asked to come at 3.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: { open: { source: none, label: "", now: false }, next: [] },
    language: "en",
  });
  const asked = [];
  setAskPorts({
    round: async (call, onText) => {
      asked.push(JSON.stringify(call.request.messages));
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  try {
    const res = await ask.POST.run(
      send("POST", { text: "What did the first one want?", thread_id: thread.id }, inA),
      ctxFor(tables),
    );
    await res.text();
  } finally {
    setAskPorts(null);
  }
  assert.equal(asked.length, 1);
  assert.ok(asked[0].includes(answer.say.headline), asked[0]);
  assert.ok(asked[0].includes(`thread ${CONV} Nora`), "the first one is Nora's thread, by its id");
  assert.equal(tables.ask_messages.length, 6, "the follow-up joined the thread");
});

test("a next question never says again what the thread asked or offered (the answer canvas, item 15): the question pressed and an earlier chip go, a new one stays, in the answer stored and the one streamed", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const none = { kind: "none", id: "", label: "" };
  const answerWith = (headline, next) =>
    JSON.stringify({
      say: { headline, detail: "" },
      show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
      do: { open: { source: none, label: "", now: false }, next },
      language: "en",
    });
  const turns = [
    answerWith("Nobody booked this week.", ["Who called this week?", "Which list is biggest?"]),
    answerWith("Two people called.", ["who called this week", "What about next week?"]),
    answerWith("Nobody on Sunday.", ["Which list is biggest?", "How many reviews this month?"]),
  ];
  let at = 0;
  setAskPorts({
    round: async (_call, onText) => {
      const written = turns[at++];
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  try {
    const first = await ask.POST.run(
      send("POST", { text: "Who booked this week?", surface: "today" }, inA),
      ctxFor(tables),
    );
    await first.text();
    const thread = tables.ask_threads[0];
    const res = await ask.POST.run(
      send("POST", { text: "Who called this week?", thread_id: thread.id }, inA),
      ctxFor(tables),
    );
    const final = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .find((l) => l.t === "final");
    assert.deepEqual(final.message.answer.do.next, ["What about next week?"], "the question pressed goes");
    assert.deepEqual(final.message.followups, ["What about next week?"]);
    assert.deepEqual(
      tables.ask_messages.at(-1).content.answer.do.next,
      ["What about next week?"],
      "and the stored answer",
    );
    const third = await ask.POST.run(send("POST", { text: "And Sunday?", thread_id: thread.id }, inA), ctxFor(tables));
    const last = (await third.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .find((l) => l.t === "final");
    assert.deepEqual(
      last.message.answer.do.next,
      ["How many reviews this month?"],
      "a chip offered two turns back goes",
    );
  } finally {
    setAskPorts(null);
  }
});

test("Stop reaches the turn: the stream let go of cuts the model, the thread keeps the turn as stopped with what its Say had written, and the next question's history says it was stopped before its answer", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Four calls this week.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: { open: { source: none, label: "", now: false }, next: [] },
    language: "en",
  });
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(call.request);
      if (requests.length > 1) {
        onText(written);
        return { blocks: [{ type: "text", id: "", name: "", text: written, json: "" }], stopReason: "end_turn" };
      }
      // The first answer is half written when the person stops it; the model's stream runs until its signal ends it.
      onText('{"say":{"headline":"Three people wrote this week.","detail":"Rosa asked about');
      await new Promise((r) => (call.signal.aborted ? r() : call.signal.addEventListener("abort", r, { once: true })));
      return { blocks: [], stopReason: null, streamError: "This operation was aborted" };
    },
    shape: async () => "",
  });
  try {
    const res = await ask.POST.run(
      send("POST", { text: "Who wrote this week?", surface: "today" }, inA),
      ctxFor(tables),
    );
    const reader = res.body.getReader();
    let got = "";
    while (!got.includes('"t":"say"')) got += new TextDecoder().decode((await reader.read()).value);
    // The Line's Stop: the request let go of, which cancels the route's stream.
    await reader.cancel();
    for (let i = 0; i < 400 && tables.ask_messages.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(requests.length, 1, "the model is asked nothing more");
    const thread = tables.ask_threads[0];
    const stored = tables.ask_messages[1].content;
    assert.deepEqual(
      [tables.ask_messages[1].role, stored.failed, stored.failure, stored.proposals, stored.raw ?? null],
      ["assistant", true, "stopped", [], null],
    );
    assert.deepEqual(stored.answer.say, {
      headline: "Stopped before the answer was finished.",
      detail: "Three people wrote this week. Rosa asked about",
    });
    assert.equal(stored.text, "Stopped before the answer was finished. Three people wrote this week. Rosa asked about");

    // The next question in the thread: its history says the turn was stopped, never the half it had written.
    await (
      await ask.POST.run(send("POST", { text: "How many calls this week?", thread_id: thread.id }, inA), ctxFor(tables))
    ).text();
    const history = JSON.stringify(requests[1].messages);
    assert.ok(history.includes("(This turn failed.) Stopped before the answer was finished."), history);
    assert.ok(!history.includes("Rosa asked about"), "the half answer is not replayed as said");
    assert.deepEqual(
      tables.ask_messages.map((m) => [m.role, m.content.failure ?? null]),
      [
        ["user", null],
        ["assistant", "stopped"],
        ["user", null],
        ["assistant", null],
      ],
      "question, stopped answer, question, answer: the thread pairs in order",
    );
  } finally {
    setAskPorts(null);
  }
});

test("REGRESSION: a question asked while the thread's last is still being answered waits for that answer, so the thread is stored in order -- a stopped turn saved after the next question paired them wrong; the question keeps its lines", async () => {
  const fresh = (row) => ({ ...row, created_at: new Date(Date.now() - 1_000).toISOString() });
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [threadRow(T1, A, { title: "Summarize every conversation this week." })],
    ask_messages: [fresh(turn(M1, T1, A, "user", { text: "Summarize every conversation this week." }))],
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Four calls this week.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: { open: { source: none, label: "", now: false }, next: [] },
    language: "en",
  });
  setAskPorts({
    round: async (_call, onText) => {
      onText(written);
      return { blocks: [{ type: "text", id: "", name: "", text: written, json: "" }], stopReason: "end_turn" };
    },
    shape: async () => "",
  });
  try {
    // The stopped turn's answer lands while the next question waits.
    const stopped = { text: "Stopped before the answer was finished.", failed: true, failure: "stopped" };
    setTimeout(() => tables.ask_messages.push(fresh(turn(T2, T1, A, "assistant", stopped))), 100);
    const asked = "Never  mind.\n\n  How many   calls this week?";
    await (await ask.POST.run(send("POST", { text: asked, thread_id: T1 }, inA), ctxFor(tables))).text();
    assert.deepEqual(
      tables.ask_messages.map((m) => [m.role, m.content.text]),
      [
        ["user", "Summarize every conversation this week."],
        ["assistant", "Stopped before the answer was finished."],
        ["user", "Never mind.\n\n How many calls this week?"],
        ["assistant", "Four calls this week."],
      ],
      "question, answer, question, answer; the question's lines kept, runs of spaces within a line made one",
    );
  } finally {
    setAskPorts(null);
  }
});

test("a question asked while the thread's last is still being answered, and no answer comes, is refused in our words and nothing is saved", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [threadRow(T1, A)],
    ask_messages: [
      { ...turn(M1, T1, A, "user", { text: "Who booked this week?" }), created_at: new Date().toISOString() },
    ],
  };
  const refusal = ask.POST.run(send("POST", { text: "And last week?", thread_id: T1 }, inA), ctxFor(tables));
  let settled = false;
  refusal.then(
    () => (settled = true),
    () => (settled = true),
  );
  // The wait runs on the turn's own clock: three seconds, looked at four times a second.
  for (let i = 0; i < 40 && !settled; i++) {
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(250);
  }
  await refused(refusal, "conflict", 409, "AI is still answering your last question here. Ask again in a moment.");
  assert.equal(tables.ask_messages.length, 1, "the question is not saved");
});

test("a turn reads back as it was stored: one made since the Line with its answer, one made before with its v1 fields alone", async () => {
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Nobody has booked this week yet.", detail: "" },
    show: { figures: [], items: [], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
  const v1 = { citations: [], followups: [], navigate: null };
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [],
    tenant_config: [],
    ask_threads: [threadRow(T1, A)],
    ask_messages: [
      turn(M1, T1, A, "assistant", { text: "Two threads wait.", ...v1 }),
      {
        ...turn(M2, T1, A, "assistant", { v: 2, answer, text: "Nobody has booked this week yet.", ...v1 }),
        created_at: "2026-09-10T00:00:02Z",
      },
    ],
  };
  const one = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.deepEqual(
    one.messages.map((m) => [m.text, m.answer ?? null]),
    [
      ["Two threads wait.", null],
      // Stored before the list part: read back as having none (contracts storedAnswer).
      [
        "Nobody has booked this week yet.",
        { ...answer, show: { ...answer.show, list: { style: "bullets", entries: [] } } },
      ],
    ],
  );
});

test("a card's outcome is the person's own turn: which card, an outcome in its shape, a turn that is theirs, and a card approved once cannot be approved again", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    ask_messages: [
      turn(M1, T1, A, "assistant", {
        text: "I can send that.",
        proposals: [{ id: "p-1", kind: "reply", outcome: null }],
      }),
    ],
  };
  await refused(
    proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: M1, pid: "x" })),
    "validation",
    400,
    "Which card?",
  );
  await refused(
    proposals.POST.run(send("POST", {}), ctxFor(tables, { id: M1, pid: "p-1" })),
    "validation",
    400,
    "An outcome is { state, receipt, atMs, undo?, made? }.",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
      ctxFor(tables, { id: T2, pid: "p-1" }),
    ),
    "not_found",
    404,
    "That turn is not yours or is already gone.",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
      ctxFor(tables, { id: M1, pid: "p-2" }),
    ),
    "not_found",
    404,
    "No such card on that turn.",
  );
  const done = await proposals.POST.run(
    send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
    ctxFor(tables, { id: M1, pid: "p-1" }),
  );
  assert.equal(done.proposal.outcome.state, "done");
  assert.ok(done.proposal.outcome.atMs > 0, "an outcome with no clock gets this one");
  assert.equal(
    tables.ask_messages[0].content.proposals[0].outcome.receipt,
    "Sent",
    "recorded on the turn that proposed it",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent again", atMs: 0 }),
      ctxFor(tables, { id: M1, pid: "p-1" }),
    ),
    "conflict",
    409,
    "That card was already approved.",
  );
  // An approved card is only undone after: a Not now or a failure from a page that drew it before (another tab, Today's
  // morning read a while ago) would hide what was sent and lose its Undo (decision 0070).
  for (const state of ["dismissed", "failed"])
    await refused(
      proposals.POST.run(send("POST", { state, receipt: "Not now", atMs: 0 }), ctxFor(tables, { id: M1, pid: "p-1" })),
      "conflict",
      409,
      "That card was already approved.",
    );
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.state, "done", "still what was done");
  const undone = await proposals.POST.run(
    send("POST", { state: "undone", receipt: "Undone", atMs: 0 }),
    ctxFor(tables, { id: M1, pid: "p-1" }),
  );
  assert.equal(undone.proposal.outcome.state, "undone", "and its Undo is kept");
});

test("a card's outcome keeps what its commit made, so a plan's made is read back after a reload; an outcome that says none, as every one before did, is kept as having made nothing", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    ask_messages: [
      turn(M1, T1, A, "assistant", {
        text: "A plan of three steps.",
        proposals: [
          { id: "p-1", kind: "message", outcome: null },
          { id: "p-2", kind: "settings", outcome: null },
        ],
      }),
    ],
  };
  const made = { kind: "message", id: "77777777-7777-4777-8777-000000000001" };
  await proposals.POST.run(
    send("POST", { state: "done", receipt: "“offer” is in the Library", atMs: 1, made }),
    ctxFor(tables, { id: M1, pid: "p-1" }),
  );
  await proposals.POST.run(
    send("POST", { state: "done", receipt: "Noted", atMs: 1 }),
    ctxFor(tables, { id: M1, pid: "p-2" }),
  );
  const [first, second] = tables.ask_messages[0].content.proposals;
  assert.deepEqual(first.outcome.made, made, "kept on the turn, not stripped");
  assert.equal(second.outcome.made, null);
  await refused(
    proposals.POST.run(
      send("POST", { state: "sent", receipt: "x", atMs: 1, made }),
      ctxFor(tables, { id: M1, pid: "p-2" }),
    ),
    "validation",
    400,
    "An outcome is { state, receipt, atMs, undo?, made? }.",
  );
});

test("the openings and the threads answer the workspace the tab named; one thread is read and deleted as the person's own, once", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [],
    tenant_config: [],
    ask_threads: [
      threadRow(T1, A, { last_at: "2026-09-09T00:00:00Z" }),
      threadRow(T2, A, { last_at: "2026-09-10T00:00:00Z", title: "Newer" }),
      threadRow(T3, B),
      // A morning past its day (decision 0070), touched last: the rail leaves it out, and today's keeps its place.
      threadRow(PAST_MORNING, A, {
        last_at: "2026-09-11T00:00:00Z",
        title: "Tuesday, September 8",
        ask_mornings: [{ made_at: "2026-09-08T12:00:00Z" }],
      }),
    ],
    ask_messages: [turn(M1, T1, A, "user", { text: "Who booked this week?" })],
  };
  // Every read and delete of a thread, kept to see what it asked the database (asked, below).
  const kept = [];
  const asked = (...args) => {
    const ctx = ctxFor(...args);
    kept.push(ctx.supabase);
    return ctx;
  };
  const open = await openings.GET.run(get(`?day=saturday&workspace=${A}&workspace=${A}`), ctxFor(tables));
  assert.ok(open.openings && typeof open.openings === "object", "answered even with no calendar connected");
  assert.deepEqual(
    (await threads.GET.run(get(inA), asked(tables))).threads.map((t) => t.id),
    [T2, T1],
    "newest first, this workspace only",
  );
  assert.deepEqual(
    (await threads.GET.run(get(inB), asked(tables))).threads.map((t) => t.id),
    [T3],
  );
  const one = await thread.GET.run(get(inA), asked(tables, { id: T1 }));
  assert.equal(one.thread.id, T1);
  assert.equal(one.messages.length, 1);
  await refused(
    thread.GET.run(get(inA), ctxFor(tables, { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9" })),
    "not_found",
    404,
    "not yours or is already gone",
  );
  assert.deepEqual(await thread.DELETE.run(send("DELETE"), asked(tables, { id: T1 })), { deleted: T1 });
  assert.ok(!tables.ask_threads.some((t) => t.id === T1));
  await refused(
    thread.DELETE.run(send("DELETE"), asked(tables, { id: T1 })),
    "not_found",
    404,
    "not yours or is already gone",
  );
  // RLS is the door: no read or delete of a thread or its turns names who asks. The store scoping by hand would hide a
  // thread RLS lets through, and keep one it does not (pinned as store.ts's text until 25 Nov 2026).
  const byHand = kept
    .flatMap((db) => db.seen)
    .filter((q) => /^ask_/.test(q.table ?? "") && (q.filters ?? []).some(([, column]) => column === "user_id"));
  assert.deepEqual(byHand, [], "the store never scopes by hand");
  assert.ok(
    kept.flatMap((db) => db.seen).some((q) => q.table === "ask_threads"),
    "and the threads were read",
  );
});

test("a question carries the column the Line draws its answer in (contracts askColumnOf): the model is told it with the question; a column out of shape, or none, tells nothing", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Nobody has booked this week yet.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: { open: null, next: [] },
    language: "en",
  });
  const asked = [];
  setAskPorts({
    round: async (call, onText) => {
      asked.push(
        askedBlocks(call.request)
          .map((c) => c.text ?? "")
          .join("\n"),
      );
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  try {
    for (const column of [{ px: 358, phone: true }, { px: 12, phone: true }, "wide", undefined]) {
      const res = await ask.POST.run(send("POST", { text: "Who booked this week?", column }, inA), ctxFor(tables));
      await res.text();
    }
    assert.match(asked[0], /a column about 358px wide on a phone, about 50 characters to a line/);
    assert.deepEqual(
      asked.slice(1).map((a) => a.includes("a column about")),
      [false, false, false],
      "a width no screen has, a word, or nothing: no column",
    );
  } finally {
    setAskPorts(null);
  }
});

test("a follow-up is due by what its pages say now, decided once for Ask's signals and its home: a search that ended or stopped to ask, replies waiting on its sequence, its day come by the business's calendar; one whose part was not read waits, never due", () => {
  // 11 PM on the 16th in New York, already the 17th in UTC: the business's day is the 16th.
  const nowMs = Date.parse("2026-10-17T03:00:00Z");
  const follow = [
    kept("ended", "search_done"),
    kept("asking", "search_done"),
    kept("running", "search_done"),
    kept("replied", "replies"),
    kept("quiet", "replies"),
    kept("tomorrow", "date"),
    kept("today", "date", { on: "2026-10-16" }),
  ];
  const parts = {
    searches: [
      { id: "subject-ended", round: { state: "ended" } },
      { id: "subject-asking", round: { state: "waiting_on_owner" } },
      { id: "subject-running", round: { state: "running" } },
    ],
    sequences: [
      { id: "subject-replied", needs: { replies: 2 } },
      { id: "subject-quiet", needs: { replies: 0 } },
    ],
    nowMs,
    zone: "America/New_York",
  };
  const { due, waiting } = followUpsNow(follow, parts);
  assert.deepEqual(
    due.map((f) => f.id),
    ["ended", "asking", "replied", "today"],
  );
  assert.deepEqual(
    waiting.map((f) => f.id),
    ["running", "quiet", "tomorrow"],
    "the 17th has not come where the business is",
  );
  const blind = followUpsNow(follow, { searches: null, sequences: null, nowMs, zone: null });
  assert.deepEqual(blind.due, [], "nothing read, nothing due: not a guess");
  assert.equal(blind.waiting.length, follow.length);
});

test("GET ask/follow-ups answers the caller's own that came due, with what Ask will ask itself, and how many still wait; a member who holds none costs their views alone, and a part that cannot be read leaves its follow-up waiting", async () => {
  const at17 = (views) => ({ memberships: keeping(views), tenants: [], tenant_config: [] });
  const ctx = ctxFor(at17({}));
  assert.deepEqual(await followUpsRoute.GET.run(get(inA), ctx), { due: [], waiting: 0 });
  assert.deepEqual(
    [...new Set(ctx.supabase.seen.map((x) => x.table ?? x.rpc))],
    ["memberships"],
    "their membership and nothing else",
  );
  // A day that came and one still ahead, and a search the database in memory cannot read: it waits.
  const held = {
    ask: {
      follow_ups: [
        kept("monday", "date", { on: "2026-01-05" }),
        kept("later", "date", { on: "2099-01-01" }),
        kept("plumbers", "search_done"),
      ],
    },
  };
  const answer = await followUpsRoute.GET.run(get(inA), ctxFor(at17(held)));
  assert.deepEqual(answer, {
    due: [
      {
        id: "monday",
        said: "When monday comes, I'll look at it",
        prompt: "monday came: look at it and propose what fits.",
      },
    ],
    waiting: 2,
  });
});

test("a question from Ask's home's row comes back to its follow-up: once the question is kept the follow-up leaves the caller's views (member_view_set, the page's view whole), before the model is asked; one they no longer hold clears nothing", async () => {
  const views = { ask: { follow_ups: [kept("plumbers", "search_done"), kept("monday", "date")] } };
  const tables = {
    memberships: keeping(views),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const order = [];
  const rpcs = {
    member_view_set: (args) => {
      order.push(`view_set ${args.p_page}`);
      tables.memberships[0].views = { ...tables.memberships[0].views, [args.p_page]: args.p_view };
      return tables.memberships[0].views;
    },
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "The plumbers search finished: here are the best five.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: { open: { source: none, label: "", now: false }, next: [] },
    language: "en",
  });
  setAskPorts({
    round: async (_call, onText) => {
      order.push("model");
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  try {
    const text = "plumbers came: look at it and propose what fits.";
    const res = await ask.POST.run(
      send("POST", { text, following: { id: "plumbers" } }, inA),
      ctxFor(tables, {}, rpcs),
    );
    await res.text();
    assert.deepEqual(order, ["view_set ask", "model"], "cleared before the model was asked");
    assert.deepEqual(
      tables.memberships[0].views.ask.follow_ups,
      [kept("monday", "date")],
      "the other follow-up kept, whole",
    );
    assert.equal(tables.ask_messages[0].content.text, text, "the thread keeps what they asked");
    // Another tab came back to it already: nothing to clear, and the question is still asked.
    order.length = 0;
    const again = await ask.POST.run(
      send("POST", { text, following: { id: "plumbers" } }, inA),
      ctxFor(tables, {}, rpcs),
    );
    await again.text();
    assert.deepEqual(order, ["model"], "no view written");
  } finally {
    setAskPorts(null);
  }
});

test("the warm (D6): a viewer may warm; it answers the build's stamp and nothing it read, and fills the minute's cache, so the question's build right after reads nothing; a context that is not one is a 400 in words, and nothing is read for it", async () => {
  const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    conversations: [
      {
        id: C1,
        tenant_id: A,
        contact_id: null,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        last_wa_inbound_at: null,
        last_message_at: "2026-09-10T00:00:00Z",
        contacts: {
          id: "k1",
          display_name: "Rosa",
          wa_profile_name: null,
          phone_e164: null,
          consent: "opted_in",
          dnc: false,
        },
      },
    ],
    messages: [],
    escalations: [],
  };
  const context = {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: "all",
    focus: null,
    rows: [{ kind: "thread", id: C1 }],
    askedAt: 1,
  };
  const before = Date.now();
  const warmed = ctxFor(tables);
  const out = await warm.POST.run(send("POST", context, inA), warmed);
  assert.deepEqual(Object.keys(out), ["stamp"], "the stamp, and nothing of what was read");
  assert.ok(out.stamp >= before && out.stamp <= Date.now());
  assert.ok(
    warmed.supabase.seen.some((q) => q.table === "conversations"),
    "the warm read the page",
  );
  // The question, a moment later, as the turn builds it: the same person, the same page, another request.
  const asked = ctxFor(tables);
  const built = await buildContext(readerContext(asked, { tenantId: A, role: "viewer" }, undefined, { keep: true }), {
    ...context,
    askedAt: 2,
    focus: { kind: "thread", id: C1, label: "Rosa" },
  });
  assert.equal(built.warm, "hit");
  assert.equal(built.stamp, out.stamp);
  assert.deepEqual(asked.supabase.seen, [], "the turn's build read nothing: the warm had");
  assert.deepEqual(
    built.blocks.map((b) => b.source),
    ["page://inbox", `thread://${C1}`],
  );

  const bad = ctxFor(tables);
  await refused(
    warm.POST.run(send("POST", { ...context, rows: [{ kind: "lead" }] }, inA), bad),
    "validation",
    400,
    "rows",
  );
  await refused(
    warm.POST.run(send("POST", { ...context, surface: "nowhere" }, inA), bad),
    "validation",
    400,
    "surface",
  );
  await refused(warm.POST.run(send("POST", { ...context, extra: 1 }, inA), bad), "validation", 400);
  await refused(warm.POST.run(send("POST", undefined, inA), bad), "validation", 400);
  assert.equal(
    bad.supabase.seen.filter((q) => q.table !== "memberships").length,
    0,
    "a refused context reads nothing of the workspace",
  );
});

test("the metrics behind Today: the workspace the tab named, the days clamped to the function's range, and a function that says no is a 404, never a silent zero", async () => {
  const asked = [];
  const rpcs = {
    metrics_summary: (a) => {
      asked.push(a);
      return a.p_tenant_id === A ? { conversations: 3 } : { error: "not a member" };
    },
  };
  const tables = { memberships: both("viewer", "viewer") };
  const out = await metrics.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(out, { metrics: { conversations: 3 }, workspace_id: A });
  await metrics.GET.run(get(`?days=400&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  await metrics.GET.run(get(`?days=0&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    asked.map((a) => a.p_days),
    [1, 90, 1],
    "one day by default, ninety at most, never less than one",
  );
  await refused(
    metrics.GET.run(get(inB), ctxFor(tables, {}, rpcs)),
    "not_found",
    404,
    "Workspace metrics unavailable.",
  );
});

test("the reports: the three presets and no other, the series from the function under the caller's RLS, the booking line never fatal; the campaigns' and the reviews' twins the same", async () => {
  const rpcs = {
    report_series: (a) => ({ days: a.p_days, tenant: a.p_tenant_id }),
    campaign_series: (a) => (a.p_tenant_id === A ? { days: a.p_days } : { error: "no" }),
    reviews_ledger: (a) => ({
      timezone: "America/New_York",
      today: "2026-10-07",
      days: a.p_days,
      on_record: { profile: 0, places: 0, complete: false },
      written: [],
      waiting_total: 0,
      waiting: [],
    }),
    people_list: () => [],
  };
  const tables = { memberships: both("viewer", "viewer"), tenants: [], tenant_config: [], policies: [] };
  await refused(
    reports.GET.run(get(`?period=14d&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    'period: Invalid option: expected one of "7d"|"30d"|"90d"|"month"',
  );
  const week = await reports.GET.run(get(`?period=7d&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(week.report, { days: 7, tenant: A });
  assert.ok("booking" in week, "the conversion line rides along, or null when the calendar cannot be read");
  const month = await reports.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(month.report.days, 30, "thirty by default");
  await refused(
    campaigns.GET.run(get(`?period=14d&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    'period: Invalid option: expected one of "7d"|"30d"|"90d"|"month"',
  );
  assert.deepEqual(
    await campaigns.GET.run(get(`?period=90d&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)),
    { report: { days: 90 } },
  );
  await refused(
    campaigns.GET.run(get(inB), ctxFor(tables, {}, rpcs)),
    "not_found",
    404,
    "No workspace found for this report.",
  );
  // The reviews' twin: the same four periods, Google's read and, where a listing is linked and a profile has synced, the
  // ledger beside it. Nothing links here, so the ledger is none and the lens has nothing to draw.
  const unlinked = { ...tables, google_listings: [], google_connections: [] };
  await refused(
    reviews.GET.run(get(`?period=14d&workspace=${A}&workspace=${A}`), ctxFor(unlinked, {}, rpcs)),
    "validation",
    400,
  );
  const none = await reviews.GET.run(get(`?period=90d&workspace=${A}&workspace=${A}`), ctxFor(unlinked, {}, rpcs));
  assert.deepEqual(Object.keys(none), ["timezone", "today", "days", "google", "readable", "ledger"]);
  assert.deepEqual([none.days, none.ledger, none.google.listing, none.readable], [90, null, null, false]);
  assert.equal((await reviews.GET.run(get(inA), ctxFor(unlinked, {}, rpcs))).days, 30, "thirty by default");
});
