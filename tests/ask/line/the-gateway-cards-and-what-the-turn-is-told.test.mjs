/**
 * Ask's gateway tee and stream parser, the entry points, cards that never act, voice and the phone's AI, answers
 * without tags, the eval's checks, the speed passes, and what the turn is told on Campaigns and Leads.
 */
import { existsSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ASK_MAX_TOKENS,
  ASK_SURFACES,
  AskProposalOutcomeSchema,
  navigateLabel,
  sameQuestion,
  cleanAnswer,
  buildAskSuggestions,
  POLICY_CLASS_WORDS,
} from "@chanlytics/contracts";
import { importSrc, readCode, readRaw } from "../../_source.mjs";
import { fromContext } from "../../../tooling/scripts/eval-ask-context.mjs";
import { ACT_TOOLS, ASK_RULES, ID, ID2, NOW, READ_TOOLS, foldHistory, here } from "./_line.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

test("the gateway's usage tee reads the counts out of a passing stream and reports once at the end", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/ai/ask-gateway.ts")).href);
  const frames = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1200,"cache_read_input_tokens":900,"cache_creation_input_tokens":0}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"answer\\":\\"hi"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":88}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];
  const enc = new TextEncoder();
  const all = frames.join("");
  const upstream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(all.slice(0, 70)));
      c.enqueue(enc.encode(all.slice(70, 200)));
      c.enqueue(enc.encode(all.slice(200)));
      c.close();
    },
  });
  let reported = null;
  const out = mod.teeUsage(upstream, (usage, stop) => {
    reported = { usage, stop };
  });
  const reader = out.getReader();
  let got = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    got += new TextDecoder().decode(value);
  }
  assert.equal(got, all, "forwarded byte for byte");
  assert.deepEqual(reported, {
    usage: { input_tokens: 1200, output_tokens: 88, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    stop: "tool_use",
  });
  // Ask may name any model that reads as one (ask-model.test.mjs); a name that reads as none is refused.
  const bad = mod.validateGatewayRequest({ model: "gpt-9", messages: [{}] });
  assert.equal(bad.ok, false);
  const ok = mod.validateGatewayRequest({ max_tokens: 99999, messages: [{ role: "user", content: "hi" }], tools: [] });
  assert.ok(
    ok.ok && ok.request.max_tokens === ASK_MAX_TOKENS && ok.request.model === mod.GATEWAY_FALLBACK_MODEL,
    "a request that names no model gets the fallback every older caller expects and AI's ceiling; AI's profile moves Ask alone",
  );
});

test("the gateway's usage tee reports a round once however its stream ends: cut by the reader or broken upstream, with what was read so far, before the cut goes on; at a clean end, once", async () => {
  // It reported only at a clean end (the transform's flush), and a cut stream never flushes: a round the dashboard
  // abandoned at its turn's budget, one the try's bound ended, one the network broke, was spent and never counted.
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/ai/ask-gateway.ts")).href);
  const enc = new TextEncoder();
  const head =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1200,"cache_read_input_tokens":900,"cache_creation_input_tokens":0}}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Two"}}\n\n';
  const tail =
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}\n\n';
  const soFar = {
    usage: { input_tokens: 1200, output_tokens: 0, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    stop: null,
  };
  /** The tee over `upstream`, and what it reported, in the order it happened beside what the reader saw. */
  const teed = (upstream) => {
    const seen = { reports: [], order: [] };
    const out = mod.teeUsage(upstream, async (usage, stop) => {
      await new Promise((r) => setTimeout(r, 5)); // the writes take a moment, as the database's do
      seen.reports.push({ usage: { ...usage }, stop });
      seen.order.push("reported");
    });
    return { out, seen };
  };
  /** Read to the end, or to the error. */
  const drain = async (r) => {
    for (;;) {
      const { done } = await r.read();
      if (done) return;
    }
  };

  // Cut by the reader: the dashboard aborts its fetch while the model is still writing.
  let letGo = null;
  const open = teed(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(head)); // and then nothing more: the model is still writing
      },
      cancel(reason) {
        letGo = reason;
      },
    }),
  );
  const reader = open.out.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), head, "forwarded as it came");
  await reader.cancel("the turn's budget");
  open.seen.order.push("cancelled");
  assert.deepEqual(open.seen.reports, [soFar], "once, with the input side message_start said");
  assert.deepEqual(open.seen.order, ["reported", "cancelled"], "reported before the cancel returned");
  assert.equal(letGo, "the turn's budget", "and the model's stream is let go");

  // Broken upstream: the try's bound ends the body, or the connection drops.
  let pulls = 0;
  const broken = teed(
    new ReadableStream({
      pull(c) {
        if (pulls++ === 0) c.enqueue(enc.encode(head));
        else c.error(new TypeError("terminated"));
      },
    }),
  );
  const r2 = broken.out.getReader();
  await assert.rejects(drain(r2), /terminated/);
  broken.seen.order.push("errored");
  assert.deepEqual(broken.seen.reports, [soFar], "once, with what was read before it broke");
  assert.deepEqual(broken.seen.order, ["reported", "errored"], "reported before the error reached the reader");

  // A clean end: once, with both sides, and a cancel after the end reports nothing more.
  const whole = teed(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(head));
        c.enqueue(enc.encode(tail));
        c.close();
      },
    }),
  );
  const r3 = whole.out.getReader();
  await drain(r3);
  await r3.cancel();
  assert.deepEqual(whole.seen.reports, [{ usage: { ...soFar.usage, output_tokens: 42 }, stop: "end_turn" }]);
});

test("the dashboard's stream parser: blocks, deltas, thinking and its signature, the stop reason, and pings ignored", async () => {
  const mod = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/model/stream.ts")).href
  );
  assert.equal(mod.parseFrame('event: ping\ndata: {"type":"ping"}'), null);
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"finish"}}',
    ),
    { type: "block_start", index: 1, block: { type: "tool_use", id: "tu_1", name: "finish" } },
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"a"}}',
    ),
    { type: "input_json", index: 1, partial: '{"a' },
  );
  assert.deepEqual(
    mod.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}'),
    { type: "stop", stopReason: "end_turn", outputTokens: 3 },
  );
  assert.deepEqual(
    mod.parseFrame('data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'),
    { type: "error", message: "Overloaded" },
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}',
    ),
    { type: "block_start", index: 0, block: { type: "thinking" } },
    "a thinking block is its own kind, never text",
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"redacted_thinking","data":"EmwKAhgB"}}',
    ),
    { type: "block_start", index: 1, block: { type: "redacted_thinking", data: "EmwKAhgB" } },
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Two reads."}}',
    ),
    { type: "thinking", index: 0, thinking: "Two reads." },
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-abc"}}',
    ),
    { type: "signature", index: 0, signature: "sig-abc" },
  );
  assert.equal(mod.featureRejected("tools.11.strict: Extra inputs are not permitted"), true);
  assert.equal(mod.featureRejected("credit balance too low"), false);
});

// The tables' own rows, column grants and ninety-day purge are proved on the database (database/tenancy.db,
// database/privileges.db, ops/sweep-registry.db), the scrub by running it (people/erasure/erasure-ask-scrub.db), and
// the erasure's calls of it by running the route (people/people-routes).
// The store never scopes by hand, RLS is the door: run through the thread routes in ask/routes/ ("the openings
// and the threads"), every read and delete asked of the database without a filter on who asks.

test("the entry points are real everywhere: the button opens AI, and the Line is the only palette", () => {
  // Run, not read (25 Nov 2026). The top bar's button is a real door, never a Soon tag, and pressed opens AI:
  // shell/surfaces/status/ draws the bar and presses it. The frame publishes the door the pages open AI
  // by (appAsk, openAsk): doors/doors.test.mjs. A card's press is marked as Ask's from its header
  // (auth/bearer.test.mjs, through withRoute) and the ledger keeps the mark (ask-commit.test.mjs, "the card's mark
  // stays"). The frame installs the bridge at its load: the nightly's e2e/ask.spec.ts opens the Line on every page.
  // The seeded palette went with the mockup's pages (17 Oct 2026): the AskBar is the Line (surfaces/ask/) everywhere, and
  // the door into Ask is the bridge's (surfaces/frame-doors.ts).
  assert.equal(existsSync("apps/dashboard/mockup/demo/pages/dashboard-a-ask.jsx"), false, "no seeded palette");
  // A real workspace's AskBar is the frame's door to the Line (ask/line.tsx, published by seed-globals.ts), with no seeded
  // file to choose it, and the Line is its own dialog with nothing seeded in it: executed in ask/palette/ ("the Line
  // is its own dialog"). A quick answer never spends a model turn: there too ("the Line at rest").
  // The Line is a chunk of its own, fetched by the frame's ask/line.tsx: the imports are walked in ask-line-chunk.test.mjs.
});

test("cards: an act tool never acts, a proposal names its door and its undo, the outcome is the one update a turn takes", () => {
  // Each kind's gate before Approve is pinned once, in ask-specs.test.mjs ("the gate each kind checks before Approve").
  const ok = AskProposalOutcomeSchema.safeParse({
    state: "done",
    receipt: "Sent to Rosa",
    atMs: 1,
    undo: { message_id: ID },
  });
  assert.ok(ok.success);
  assert.equal(AskProposalOutcomeSchema.safeParse({ state: "sent" }).success, false, "only the four states");
  // The acts as the registry offers them, one per card family, sorted by name, the acts before them their actions (D11;
  // propose_list and propose_campaign's run since PR 4.7; the operator's families and actions since 15 Oct 2026). What this block pinned as text runs in ask/turn/, "the proposal builders run against the
  // database in memory": every card's result says nothing has happened yet, a proposal never writes, the money row is
  // refused before it is a card, a person who opted out gets no reply, a reply no longer held has nothing to rewrite, a
  // whisper needs a call in progress.
  assert.deepEqual(
    ACT_TOOLS.map((t) => [t.name, t.input_schema.properties.action?.enum ?? []]),
    [
      ["press_card", ["yes", "stop"]],
      ["propose_ad", []],
      ["propose_bring_in", []],
      ["propose_call", ["whisper", "hand_over"]],
      ["propose_deal", []],
      ["propose_follow_up", ["keep", "clear"]],
      ["propose_form", []],
      ["propose_lead_search", ["find", "more"]],
      ["propose_leads", ["stage", "mark", "later", "bulk", "check", "addressee", "list", "said"]],
      ["propose_list", ["make", "change", "delete"]],
      ["propose_people", ["answer", "mode", "note", "list"]],
      ["propose_person", ["mode", "note", "step", "details", "answer", "add", "merge", "message"]],
      ["propose_piece", []],
      ["propose_plan", ["offer", "steps"]],
      ["propose_post", []],
      ["propose_publish", []],
      ["propose_reply", ["draft", "steer", "booking"]],
      ["propose_review", ["reply"]],
      [
        "propose_sequence",
        [
          "once",
          "moment",
          "make",
          "step",
          "step_remove",
          "words",
          "start",
          "run_now",
          "change",
          "channels",
          "batch",
          "leave",
          "decide",
          "sent_by_hand",
          "discard",
          "end",
          "message",
          "message_words",
          "message_rename",
          "message_away",
          "message_delete",
          "cold_email",
          "leads",
        ],
      ],
      ["propose_settings", ["change", "answers", "worth", "autonomy", "goal", "answer_style"]],
      ["propose_take_down", []],
      ["propose_thread_verb", []],
      // A week of posts, and what a post may say (00706).
      ["propose_week", ["plan", "approve", "slot", "aims", "claim", "withdraw"]],
      // A fact the person tells Ask to keep (decision 0070).
      ["remember", []],
    ],
  );
  // A viewer is never offered an act tool: ask/turn/, on the request itself. An act tool becomes a proposal, never an
  // action, and a call whose arguments did not arrive whole is told so: run there too (25 Nov 2026, pinned as the
  // loop's text before).
  const prompt = ASK_RULES.join("\n");
  assert.ok(
    prompt.includes("Every change is a card a person presses") &&
      prompt.includes("Never say it was sent, changed or done"),
  );
  // Run, not read (25 Nov 2026): a card approved once cannot be approved again, its outcome in its shape and the turn's
  // content the one thing written, through the outcome route in ask/routes/ ("a card's outcome is the person's
  // own turn"); the column grant and the policy that let a person write only that, on the database
  // (database/privileges.db, database/tenancy.db). The client sends x-via: typed-client.test.mjs.
  // The route each card commits and undoes through -- the reply, the steer, the thread verbs, a person's mode, a
  // policy, the settings (applied to the loaded config, with its version), a whisper, an invite, and a sent reply's
  // undo through the cancel window -- was pinned here as commit.ts's text. It is each kind's spec now, and it runs:
  // ask-commit.test.mjs, "every kind, committed and undone" and the case per kind, over the typed client; and
  // ask-specs.test.mjs holds every route a spec names to the app's routes and to the card's role.
  // The card checks the role gate before Approve (the route re-checks): executed in ask/palette/, "a card's
  // Approve is gated by the shell's rule".
  // What became of the card is kept on the turn (A.outcome, the outcome route): executed in ask/palette/, "a card
  // approved records what its commit made with its outcome" and, through the real route, "REGRESSION (ruling 3)".
  // A thread reads back with the card's outcome: executed in ask/palette/ ("a card drawn again reads back").
  // Edit in the composer lands the words in the composer of its own thread: conversations/inbox/inbox-place.test.mjs.
});

test("voice and the phone: hold to talk uses the browser's recogniser, the origin may ask for the microphone, the phone's ✦ opens AI above the tab bar", async () => {
  // The one recogniser is the kit's (surfaces/kit/talk), which Ask's hook delegates to. Press to start, release to
  // stop, what was heard sent on its own, and the language it listens in: executed in ask/palette/ ("on a
  // phone the mic keeps the finger", "the Line's recogniser listens in the Line's language").
  // Run, not read (25 Nov 2026). The page may ask for the microphone and for nothing else, and can never be framed, so
  // (self) is only ever this app: the headers Next serves, in auth/auth-gate.test.mjs ("the headers Next serves"). The
  // phone's ✦ opens AI, stays in the bar's row, and goes under the native app's own AI: pressed in
  // shell/surfaces/status/ ("the phone's drawer is a dialog").
  const askCss = readRaw("apps/dashboard/src/surfaces/ask/ask.css").replace(/\s+/g, " ");
  assert.ok(askCss.includes(".phone-ask { display: none; }"), "a desktop has the topbar button and ⌘K");
  // Glass is the one look: the circle's place is the rule after the base one (".phone-ask" at the end of the phone block),
  // 62px as the tab bar's capsule is tall, 14px in from the edge and at the bar's own rest over the bottom (mobile.css,
  // --bar-foot: 14px, or nearer the edge than the phone's inset where that is more).
  assert.ok(askCss.includes("position: fixed;"), "fixed to the screen");
  assert.match(
    askCss,
    /\.phone-ask \{\s*right: 14px;\s*bottom: var\(--bar-foot\);\s*width: 62px;\s*height: 62px;\s*\}/,
    "in the tab bar's own row, at the thumb and over no page: it floated 126px up, over what the page drew there",
  );
  assert.ok(
    askCss.includes("html.in-app .phone-ask { bottom: calc(10px + var(--app-inset-bottom, 0px)); }"),
    "and inside the native shell it lifts by the shell's tab bar, whose height the shell sets on <html>",
  );
  // The bar is the kit's TabBar since #1571 (kit/tab-bar/, its tabs run in shell/views/tab-bar.test.mjs): its places are
  // columns of one width, however many it holds, so the circle beside it never moves them.
  assert.match(
    readRaw("apps/dashboard/src/surfaces/kit/kit.css"),
    /\.tab-bar \{[^}]*grid-auto-flow: column;[^}]*grid-auto-columns: minmax\(0, 1fr\);/,
    "the five tabs keep their places",
  );
  assert.ok(
    !readRaw("apps/dashboard/src/styles/mobile.css").includes(".phone-ask") &&
      !readRaw("apps/dashboard/src/styles/dashboard-a-v2.css").includes(".ask-card"),
    "the palette's rules live in ask.css alone",
  );
  const sheets = createRequire(import.meta.url)("../../../apps/dashboard/src/styles/sheets.json");
  const sheetAt = (name) => sheets.sheets.indexOf(name);
  assert.ok(
    sheetAt("styles/mobile.css") >= 0 && sheetAt("surfaces/ask/ask.css") > sheetAt("styles/mobile.css"),
    "listed after mobile.css, so its phone rules win",
  );
});

test("an answer never carries tags: the leak seen on production is cut", () => {
  // Every string of the answer, and Say while it streams, goes through cleanAnswer: normalizeAnswer in
  // ask/answer/, the stream in ask/turn/.
  const leaked =
    'The 4:22 AM call ran 5:16 and AI handled it.</answer>\n<parameter name="citations">[{"kind": "call", "id": "' +
    ID +
    '", "label": "4:22 AM call"}]';
  assert.equal(cleanAnswer(leaked), "The 4:22 AM call ran 5:16 and AI handled it.");
  assert.equal(cleanAnswer("<answer>Hola.</answer>"), "Hola.");
  assert.equal(cleanAnswer("Plain, with a <b>tag</b> inside."), "Plain, with a tag inside.");
  assert.equal(
    cleanAnswer("Two open at 10 < 12 slots."),
    "Two open at 10 < 12 slots.",
    "a bare less-than is not a tag",
  );
  // inbox.list carries the last exchanges, so one read round answers most questions: ask/turn/, "the
  // fourteen reads run against the database in memory" (each row's `recent`).
});

test("the eval checks that an Open asked for is followed, and what the words decided on a card: a note's reader, which has no default, the address a details card sets (card_fields, PR 4.6), a run's verb, which has none either, and a list's rule and what it left out (card_fields and list_card, PR 4.7)", async () => {
  // Open/show/see goes there as the answer lands, and what an answer shows is the contract's: both executed in
  // ask/palette/ ("open, show or see", "a turn since the Line"); where the browser cannot listen, the field's
  // one button is Send alone, executed there too ("one button at the field's end").
  const judge = readCode("tooling/scripts/eval-ask.mjs");
  assert.ok(judge.includes("e.navigate_now"));
  assert.ok(judge.includes("Object.entries(e.card_fields ?? {})"), "every kind a case names");
  assert.ok(judge.includes("p.payload?.[k] !== v"), "each field of each card of that kind, compared");
  assert.ok(judge.includes('if (!rule.includes(`"field":"${f}"`))'), "each field a list card's rule must name");
  assert.ok(judge.includes("!!p.payload?.cannot !== e.list_card.cannot"), "and what it left out, kept or not");
  const { readFile } = await import("node:fs/promises");
  const cases = JSON.parse(await readFile(path.join(here, "../../../tooling/evals/ask-cases.json"), "utf8"));
  assert.deepEqual(
    Object.fromEntries(cases.filter((c) => c.expect?.card_fields).map((c) => [c.id, c.expect.card_fields])),
    {
      person_note_team: { note: { team_only: true } },
      person_note_receptionist: { note: { team_only: false } },
      person_details_email: { person_details: { email: "jordan.reyes@example.com" } },
      run_approve: { run: { verb: "approve" } },
      run_skip: { run: { verb: "skip" } },
      // A batch to leads is decided on Ask's run card as a customer's is (16 Oct 2026).
      run_leads_batch: { run: { verb: "approve" } },
      // A campaign changed in place (the moment spec, A8): the fields its change card carries.
      change_resume_by_name: { playbook_change: { state: "running" } },
      change_rename_and_hour: { playbook_change: { name: "Past clients", run_hour: 9 } },
      // A sequence to leads paused on Ask's change card: its state alone (16 Oct 2026).
      change_leads_pause: { playbook_change: { state: "paused" } },
      // A reminder the day before, asked where a calendar is connected (the marketing manager's §8): its moment.
      remind_day_before: { playbook: { trigger: "visit_tomorrow" } },
      // A message asked for in Spanish, its language unnamed: its customers read what the person writes in (16 Oct 2026).
      write_winback_es_unnamed: { message: { language: "es" } },
      // An offer asked for in Spanish: its message in Spanish too, and the plan's words (16 Oct 2026).
      offer_next_month_es: { message: { language: "es" } },
    },
  );
  assert.deepEqual(
    Object.fromEntries(cases.filter((c) => c.expect?.list_card).map((c) => [c.id, c.expect.list_card])),
    {
      list_lapsed: { fields: ["last_visit"] },
      setup_new_list_then_playbook: { fields: ["came_from"] },
    },
  );
});

test("context first: the page rides into every turn (ask-turn.test.mjs runs it), loaders are memoised and lighter, and the rounds run at low effort", () => {
  // Every round asks at the profile's effort, the same on every round (spec 5.11): the request itself, in ask/turn/
  // ("a read, then the answer": every round may answer at the profile's effort).
  assert.ok(
    ASK_RULES.join("\n").includes(
      "The business's hours, closures, services, notes, guardrails, booking notes and autonomy modes",
    ),
    "what the prompt already holds needs no read",
  );
  // The snapshot is gone, and the eval's excuse for it with it: a case sent with no page reads what it answers from.
  const overview = { expect: { tools_any: ["today", "inbox.list"] } };
  assert.equal(fromContext(overview, { tools: [] }, null), false, "no page and no read: judged as missing the read");
  // The day is read once through the readers: ask/turn/, a round that calls today, inbox.list and
  // calls.list together reads the conversations at most twice and the calls once. The readers, and the Inbox's paged
  // messages, in ask/readers/.
  // The gateway passes a known effort through and nothing else: executed in ask-model.test.mjs.
  const prompt = ASK_RULES.join("\n");
  assert.ok(prompt.includes("Answer from it when it is enough, in one round."));
  const ev = readCode("tooling/scripts/eval-ask.mjs");
  assert.ok(ev.includes("one-round ${oneRound}/${results.length}"), "the eval measures the one-round share");
});

test("the cards to finish: an operator is offered cards to finish, a viewer none", async () => {
  // A thread keeps its first question as its title (D9): executed through the route in ask/routes/.
  const withActs = buildAskSuggestions({
    surface: "settings",
    language: "en",
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    canAct: true,
    scope: { kind: "person", id: ID, label: "Rosa" },
  });
  const acts = withActs.filter((s) => s.kind === "act");
  assert.ok(acts.length >= 3 && acts.length <= 4, "a few cards, never a wall");
  assert.ok(
    acts.some((s) => s.label === "Tell Rosa I'm running late" && !s.compose && /15 minutes late/.test(s.q)),
    "a scoped person gets a card to send",
  );
  assert.ok(
    acts.some((s) => s.compose && s.q === "Remember that "),
    "a note is left for the person to finish",
  );
  const viewer = buildAskSuggestions({
    surface: "settings",
    language: "en",
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    canAct: false,
  });
  assert.equal(viewer.filter((s) => s.kind === "act").length, 0, "a viewer is never offered a card");
  const es = buildAskSuggestions({
    surface: "inbox",
    language: "es",
    needsYou: 1,
    heldDrafts: 1,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    canAct: true,
  });
  assert.ok(es.some((s) => s.kind === "act" && /Retén cada respuesta/.test(s.q)));
  // A compose row lands in the input for the person to finish: executed in ask/palette/ ("a compose row").
  // Whoever may approve in the workspace is offered cards, as the pages' canDo("approve"), and a viewer none: the
  // palette's own suggestions, by the role signed in (pinned as palette.ts's text until 25 Nov 2026).
  const { askPalette } = await importSrc("apps/dashboard/src/bridge/ask/palette.ts");
  const cards = (role) => {
    bridgeHolds({ who: { me: { role } } });
    return askPalette({}, null)
      .suggestions("settings", { kind: "person", id: ID, label: "Rosa" }, "en")
      .filter((x) => x.kind === "act").length;
  };
  for (const role of ["owner", "operator"]) assert.ok(cards(role) >= 3, `${role}: cards to finish`);
  assert.equal(cards("viewer"), 0, "a viewer is offered none");
});

test("the hours and the definitions come from the prompt: the eval expects no read for them", async () => {
  // An act beside the answer stands and a read beside it sets it aside: executed in ask/turn/.
  const cases = createRequire(import.meta.url)("../../../tooling/evals/ask-cases.json");
  assert.ok(!cases.find((c) => c.id === "hours").expect.tools_any, "hours come from the prompt, no read expected");
  assert.ok(
    !cases.find((c) => c.id === "definition").expect.tools_any,
    "definitions come from the prompt, no read expected",
  );
});

test("the Open button says where it goes, a repeated question is the same thread, and the bridge is four modules composed", async () => {
  // What an answer shows is decided once, a place offered once and a next question that echoes one dropped: oneDoor,
  // executed in ask/answer/.
  const nav = { to: `conversations/cv-${ID}`, label: "Call transcript" };
  assert.equal(
    navigateLabel(nav, "en"),
    "Open the call",
    "the button says where it goes, not what the model called it",
  );
  assert.equal(navigateLabel({ to: `clients/${ID2}`, label: "Caller profile" }, "es"), "Abrir el perfil");
  assert.equal(navigateLabel({ to: "reports", label: "Reports" }, "en"), "Reports", "a page keeps its own name");
  assert.equal(navigateLabel(null, "en"), null);
  assert.equal(sameQuestion("Who wrote today?", "who wrote today"), true);
  assert.equal(sameQuestion("Who wrote today?", "Who called today?"), false);
  assert.equal(sameQuestion("", ""), false);
  // A repeated question resumes its thread instead of opening a twin, even before the list has landed: executed in
  // ask/palette/ ("a question asked again").
  // Copy, read aloud and Clear are the line's, once an answer is on it: executed in ask/palette/.
  // The bridge is its parts composed into one object, the shell reaching nothing else: installAsk runs above ("the
  // palette reads the workspace"), and here the object it publishes carries every one of the palette's own (pinned as
  // ask.ts's text until 25 Nov 2026). A fetch of its own is a new offender of check:debt's fetches-outside-a-client.
  // The loop asks for each round through its ports, which ask/turn/ scripts in every test there.
  // The history a turn is asked with is memory.ts's to decide (the Phase 5 plan, PR 5.4): the words fold beside the
  // live replay, and loop.ts takes both from there.
  assert.equal(
    typeof foldHistory,
    "function",
    "the history fold is a named rule, not a loop in the middle of a function",
  );
});

test("REGRESSION: the assistant's tools fit under the edge gateway's cap — one tool too many refused every turn on production", async () => {
  const { GATEWAY_MAX_TOOLS: cap } = await importSrc("apps/edge/lib/ai/ask-gateway.ts");
  const reads = READ_TOOLS.length;
  const acts = ACT_TOOLS.length;
  const total = reads + acts;
  // Nine reads and ten acts since the consolidation (D11), eleven since propose_list (the Phase 4 plan, D1): twenty, an
  // owner's whole set.
  assert.ok(reads >= 9 && acts >= 10, `found ${reads} read and ${acts} act tools in the registry`);
  assert.ok(
    total <= cap - 4,
    `${total} tools against a cap of ${cap}: leave room, or raise GATEWAY_MAX_TOOLS on the edge first`,
  );
});

test("the speed pass: a fast model for a short answer, the autonomy modes in the prompt", async () => {
  // Run, not read (25 Nov 2026). The loop asks the deployment's profile for the model and the effort and names neither
  // itself (spec 5.11): every request ask/turn/ scripts carries ASK_MODEL and ASK_EFFORT. The saved turn names the model
  // that ran: ask/routes/ ("a question answered", the stored row's model).
  const turn = readCode("apps/dashboard/src/server/ask/turn.ts");
  assert.ok(
    // Prettier breaks a call with two function arguments over lines: the shape, whatever its whitespace.
    /load\(rc, readers\.policies, undefined\)\.then\(\s*\(r\) => r\.data,\s*\(\) => \[\],?\s*\)/.test(turn) &&
      // At the turn's clock since a note may end (workspaceFacts' `now`), with the policies after it.
      turn.includes("cfg?.config ?? null, rc.now, offered)"),
    "the policies still ride in the stable block, read through the turn's cache and tolerated when they fail",
  );
  // The modes are facts in the stable block, each class in its own word, and only those the workspace set.
  const { workspaceFacts, factsBlock } = await importSrc("apps/dashboard/src/server/ask/prompt/stable-system.ts");
  const facts = workspaceFacts("Harbor", "America/New_York", null, new Date(NOW), [
    { class: "reply", mode: "ask" },
    { class: "booking", mode: "veto" },
  ]);
  assert.deepEqual(facts.autonomy, [
    `${POLICY_CLASS_WORDS.reply.short}: ask`,
    `${POLICY_CLASS_WORDS.booking.short}: veto`,
  ]);
  const said = factsBlock(facts);
  assert.ok(said.includes("Autonomy, class by class (auto: on its own"), "said in the stable block");
  for (const line of facts.autonomy) assert.ok(said.includes(line), line);
  assert.equal(workspaceFacts("Harbor", "America/New_York", null, new Date(NOW), []).autonomy.length, 0);
  assert.ok(ASK_RULES.join("\n").includes("booking notes and autonomy modes"), "and the rules say so");
  // The budget read once a minute -- kept per workspace, believed within the
  // minute over the table -- runs in llm-door.test.mjs.
});

test("the speed pass, two: no definitions tool", () => {
  // Cards alone are the answer with no second round, and a refused one keeps the round: executed in ask/turn/.
  assert.ok(
    ![...READ_TOOLS, ...ACT_TOOLS].some((t) => t.name === "explain_metric"),
    "the definitions are in the prompt; a tool for them was a round",
  );
  assert.ok(
    ASK_RULES.join("\n").includes("the pages' words under Definitions: answer about them from there, without a read"),
  );
  // What the answer may hold is ASK_ANSWER_CAPS, said in the format's own words: ask/answer/.
});

test("the cross-page reads: what a question names plainly of another page is read beside the page's context and rides into the first round; what the page itself shows is not read again; the rest is left to the model", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/cross-page.ts")).href);
  const names = (q, surface = "people", view = null) =>
    mod.crossPagePlan(q, surface, view).map((r) => `${r.name} ${JSON.stringify(r.input)}`);
  assert.deepEqual(names("how did the last 7 days go?"), ['report {"period":"7d"}']);
  assert.deepEqual(names("¿cómo nos fue este mes?"), ['report {"period":"30d"}']);
  assert.deepEqual(names("what's on the calendar tomorrow?"), ['calendar {"action":"week","day":"tomorrow"}']);
  assert.deepEqual(names("what's open saturday afternoon?"), [
    'calendar {"action":"openings","day":"sat","service":""}',
  ]);
  assert.deepEqual(names("what playbooks are running right now?"), ['sequences {"action":"moments"}']);
  assert.deepEqual(names("how many people can I send offers to?"), ['sequences {"action":"lists"}']);
  assert.deepEqual(names("start a win-back playbook for the quiet clients"), [
    'sequences {"action":"moments"}',
    'sequences {"action":"lists"}',
  ]);
  assert.deepEqual(names("open the transcript of the most recent call"), ['calls {"action":"list","filter":"recent"}']);
  assert.deepEqual(names("any missed calls today?"), ['calls {"action":"list","filter":"missed"}']);
  // Drafts held for approval (D12): the snapshot carried them on every page; one read carries them off the Inbox.
  assert.deepEqual(names("any drafts waiting for my approval?"), ['inbox {"action":"list","filter":"held"}']);
  // On the page that shows them, the page's own rows answer: nothing is read again (D13).
  assert.deepEqual(names("any drafts held?", "inbox"), []);
  assert.deepEqual(names("what's on the calendar tomorrow?", "calendar"), []);
  assert.deepEqual(names("what playbooks are running right now?", "campaigns"), []);
  // "Set up" as a state, never a setup: a question whether something is set up, or how, reads what it always read --
  // the eval's `connections_read` its calendar, a question about campaigns their audiences alone -- and Start's own setup
  // is not a campaign's.
  assert.deepEqual(names("is our email mailbox set up, and is the calendar connected?", "today"), [
    'calendar {"action":"week","day":"today"}',
    "today {}",
  ]);
  assert.deepEqual(names("how far along is my setup?", "start"), []);
  assert.deepEqual(names("is the follow-up set up?"), []);
  assert.deepEqual(names("when did we start the follow-ups?"), []);
  assert.deepEqual(names("¿ya configuraste mis campañas?"), []);
  for (const q of [
    "are my campaigns set up?",
    "did you set up my campaigns?",
    "have I set up my campaigns yet?",
    "how do I set up my campaigns?",
    "who set up our campaigns?",
  ])
    assert.deepEqual(names(q), ['sequences {"action":"lists"}'], q);
  // A setup (the moment spec, A4), asked for: what runs, the moments offered with their starters, the lists and the
  // messages, read before round 1 on any page -- on Campaigns too, whose rows are the playbooks and hold neither the
  // moments nor a message. Asked as a request: a sentence's start, or after a please, a "can you", a "help me".
  const setupReads = ['sequences {"action":"moments"}', 'sequences {"action":"lists"}'];
  assert.deepEqual(names("Set up my campaigns", "campaigns"), setupReads);
  assert.deepEqual(names("set up my campaigns"), setupReads);
  assert.deepEqual(names("Prepara mis campañas", "campaigns"), setupReads);
  assert.deepEqual(names("set up campaigns for a consultancy that sends proposals", "today"), setupReads);
  for (const q of [
    "We're an online B2B consultancy: people book a discovery call, then most get a proposal. Set up my campaigns.",
    "Somos una consultoría B2B en línea: primero una llamada, luego casi siempre una propuesta. Prepara mis campañas.",
    "Can you set up my campaigns?",
    "please setup a few follow-ups",
    "help me set up our nudges",
    "Start my campaigns",
    "¿Puedes preparar mis campañas?",
    // One word may stand before the noun: a new one, the first, a moment's.
    "Set up a new campaign",
    "set up my first campaign",
    "Start a new campaign",
    "Set up a birthday campaign",
    // Casual openers, with no comma after them.
    "hey set up my campaigns",
    "hi set up my campaigns",
    "yes set up my campaigns",
    "I'd love to set up my campaigns",
    "I wanna set up my campaigns",
    // Spanish, its nouns typed with the tilde or without, and its other verbs.
    "Configura una campaña de cumpleaños",
    "Crea mis campañas",
    "Inicia mis campañas",
    "Lanza una campaña para los clientes inactivos",
    "Prepara mis campanas",
    // Either language's verb with the other's words.
    "set up mis campañas",
    "Configura my campaigns",
  ])
    for (const surface of ["campaigns", "people"]) assert.deepEqual(names(q, surface), setupReads, `${q} (${surface})`);
  // A setup that names an appointment's moment is a setup, never a look at the calendar.
  assert.deepEqual(names("Set up an appointment reminder", "today"), setupReads);
  // Every idea Campaigns' first day offers (contracts buildAskSuggestions, A3) is a setup, in either language: a win-back
  // asked in two words, and what should go out this month, read the moments and the lists before round 1 too.
  for (const language of ["en", "es"]) {
    const ideas = buildAskSuggestions({
      surface: "campaigns",
      language,
      needsYou: 0,
      heldDrafts: 0,
      missedToday: 0,
      liveNow: 0,
      hasCalendar: false,
      campaigns: { rows: [] },
    })
      .filter((s) => s.icon === "bolt")
      .map((s) => s.q);
    assert.equal(ideas.length, 3, language);
    for (const q of ideas) assert.deepEqual(names(q, "campaigns"), setupReads, `${q} (${language})`);
  }
  assert.deepEqual(names("win back my quiet clients", "today"), setupReads);
  // Asked whether something will start, or to start it again, is no setup: the follow-ups and reminders run already.
  for (const q of ["Will you start the follow-ups tomorrow?", "Can you start the reminders again?"])
    assert.deepEqual(names(q, "campaigns"), [], q);
  // The audiences are no page's rows: asked of offers on Campaigns, they are read.
  assert.deepEqual(names("how many people can I send offers to?", "campaigns"), ['sequences {"action":"lists"}']);
  // On Campaigns a campaign or an offer named is a row the page holds; only who a send can reach -- an audience, who said
  // yes, a send to someone, a template -- is read there. Off Campaigns every one of those words still reads the audiences.
  for (const q of ["which campaign did best?", "pause the monthly offer", "rename the follow-up campaign"]) {
    assert.deepEqual(names(q, "campaigns"), [], q);
    assert.deepEqual(names(q), ['sequences {"action":"lists"}'], `${q} (people)`);
  }
  for (const q of [
    "who said yes to offers?",
    "which templates can I use?",
    "send the October offer to the quiet list",
    "what audiences do I have?",
  ])
    assert.deepEqual(names(q, "campaigns"), ['sequences {"action":"lists"}'], q);
  for (const surface of ["conversations", "live"]) assert.deepEqual(names("any missed calls today?", surface), []);
  // Today counts the day's calls and lists none of them: a question about them reads the list there too. On Today the
  // day's own read follows what the question named, where the cap leaves room (the speed plan, A1, 15 Oct 2026: 26
  // turns there took a second round for it alone, the fortnight before).
  assert.deepEqual(names("Were there any calls today?", "today"), [
    'calls {"action":"list","filter":"recent"}',
    "today {}",
  ]);
  for (const q of ["Who needs me?", "anything I should know?", "¿Quién me necesita?"])
    assert.deepEqual(names(q, "today"), ["today {}"], q);
  assert.deepEqual(names("Who needs me?", "people"), [], "off Today, a question that names nothing reads nothing");
  // The questions that cost a second round in production (the week to 5 Oct 2026), each read ahead now. How things
  // stand, asked in the open: Today's own read and the week's report, on Today too, whose page block holds the day's
  // rows and not the read's standing, reasons and recap (the speed plan, A1, 15 Oct 2026).
  assert.deepEqual(names("Hey how's the business", "calendar"), ["today {}", 'report {"period":"7d"}']);
  assert.deepEqual(names("¿cómo va el negocio?", "inbox"), ["today {}", 'report {"period":"7d"}']);
  assert.deepEqual(names("catch me up"), ["today {}", 'report {"period":"7d"}']);
  assert.deepEqual(names("What should I do next?", "today"), ["today {}", 'report {"period":"7d"}']);
  assert.deepEqual(names("Brief me on today", "today"), ["today {}", 'report {"period":"7d"}']);
  // What is booked, however it is asked.
  assert.deepEqual(names("What do I have tomorrow?", "today"), [
    'calendar {"action":"week","day":"tomorrow"}',
    "today {}",
  ]);
  assert.deepEqual(names("Who are the upcoming bookings", "today"), [
    'calendar {"action":"week","day":"today"}',
    "today {}",
  ]);
  assert.deepEqual(names("who do I have on friday?"), ['calendar {"action":"week","day":"fri"}']);
  assert.deepEqual(names("¿qué tengo mañana?"), ['calendar {"action":"week","day":"tomorrow"}']);
  assert.deepEqual(names("what's my schedule on saturday?"), ['calendar {"action":"week","day":"sat"}']);
  assert.deepEqual(names("What do I have tomorrow?", "calendar"), []);
  // Where the deals stand, off the Pipeline.
  assert.deepEqual(names("Who has a proposal out?", "calendar"), ['people {"action":"pipeline"}']);
  assert.deepEqual(names("how is the pipeline looking?", "today"), ['people {"action":"pipeline"}', "today {}"]);
  assert.deepEqual(names("Who has a proposal out?", "pipeline"), []);
  // Who wrote, off the Inbox; a held draft asked for in the same breath is the one list read.
  assert.deepEqual(names("Who wrote today?", "today"), ['inbox {"action":"list","filter":"recent"}', "today {}"]);
  assert.deepEqual(names("any new messages?"), ['inbox {"action":"list","filter":"recent"}']);
  assert.deepEqual(names("any new messages?", "inbox"), []);
  assert.deepEqual(names("any new messages or drafts held?"), ['inbox {"action":"list","filter":"held"}']);
  // Who canceled or moved a booking: no record keeps it (decision 0002 is not built) and the calendar holds only what is
  // still booked, so what was said is searched, every form of the word at once, over the window the question names.
  // Asked by voice on 5 Oct 2026, it took two more rounds and four searches to find: 14 s to the first word.
  const [cancel] = mod.crossPagePlan("Yeah check last week and see if anybody canceled an appointment", "leads");
  const canceled = (days) => `inbox ${JSON.stringify({ action: "search", words: cancel.input.words, days })}`;
  assert.deepEqual(names("Yeah check last week and see if anybody canceled an appointment", "leads"), [
    canceled(14),
    'leads {"action":"searches"}',
  ]);
  assert.deepEqual(names("did anyone cancel today?", "today"), [canceled(1), "today {}"]);
  assert.deepEqual(names("who cancelled yesterday?"), [canceled(2)]);
  assert.deepEqual(names("any cancellations this month?", "calendar"), [canceled(30)]);
  assert.deepEqual(names("did anyone reschedule?"), [canceled(7)]);
  assert.deepEqual(names("¿alguien canceló su cita la semana pasada?", "inbox"), [canceled(14)]);
  for (const word of ["cancel", "canceled", "cancelled", "cancellation", "reschedule", "canceló", "cancelación"])
    assert.ok(cancel.input.words.split(" or ").includes(word), word);
  // The search takes 200 characters of words (readers/messages.ts): every form fits.
  assert.ok(Array.from(cancel.input.words).length <= 200);
  // On Reports a report is read only for a period other than the one on screen.
  assert.deepEqual(names("how did the last 30 days go?", "reports", "30"), []);
  assert.deepEqual(names("how did the last 7 days go?", "reports", "30"), ['report {"period":"7d"}']);
  for (const q of [
    "who needs me right now?",
    "what does 'waiting on you' mean?",
    "what are our hours this week?",
    "close the salon this coming Friday for a family matter",
    "invite maria.reception@example.com as a viewer",
    "let AI decide refunds on its own",
    "send Maria the booking link",
    "schedule the reminder for 9am",
    "what should I do about the refund she asked for?",
    "how is Maria doing?",
  ]) {
    assert.deepEqual(names(q), [], q);
  }
  assert.equal(mod.CROSS_PAGE_MAX, 2);
  const b = mod.readBlock({ name: "report", input: { period: "7d" } }, "{}");
  assert.deepEqual(
    [b.type, b.source, b.citations],
    ["search_result", "read://report", { enabled: false }],
    "a read rides as data, its source a stable reference, never cited by the API",
  );
  // A tool with actions is named by the action it read (D11), its title the call as it was made.
  const week = mod.readBlock({ name: "calendar", input: { action: "week", day: "tomorrow" } }, "{}");
  assert.deepEqual([week.source, week.title], ["read://calendar.week", 'calendar {"action":"week","day":"tomorrow"}']);
  // The model is told so in the tool's own description; the refusal itself runs in ask/turn/ ("the proposal
  // builders run against the database in memory": money stays owner-only by charter).
  assert.ok(
    ACT_TOOLS.find((t) => t.name === "propose_settings").description.includes(
      "Never for money: that class is locked by charter",
    ),
    "a money change is answered, not proposed",
  );
});

test("the speed pass, four: the page's data before the words needs no second read; no line guesses their language", async () => {
  const { turnWords } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/prompt.ts")).href
  );
  const facts = {
    role: "owner",
    personLabel: "ada@example.com (owner)",
    scope: null,
    surface: "inbox",
    language: "es",
    timezone: "America/New_York",
    closures: [],
    now: new Date(NOW),
  };
  const w = turnWords({ ...facts, context: true, crossPage: true });
  assert.ok(w.includes("The page they are on is in the search results before these words"), w);
  assert.ok(w.includes("The reads made for this question are there too (read://)"), w);
  assert.ok(
    !/They wrote in|answer in (English|Spanish)/.test(w),
    "the model follows their words, never a guess said here",
  );
  const bare = turnWords(facts);
  assert.ok(!bare.includes("search results") && !bare.includes("read://"), "nothing rode in: nothing is said of it");
  assert.ok(
    ASK_RULES.join("\n").includes(
      "To tell several people something at once, a one-off send reaches only the people whose yes covers its message",
    ),
    "a message to many is a one-off send or one message each",
  );
});

test("on Campaigns the turn's words say what a sentence there is: a campaign to propose, a change on its id, results from the rows; after an approval, read campaigns again; and the rules carry the setup rule (the moment spec, A2 and A4)", async () => {
  const { turnWords } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/prompt.ts")).href
  );
  const { ASK_RULES, ASK_DEFINITIONS } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/stable-system.ts")).href
  );
  const facts = {
    role: "owner",
    personLabel: "ada@example.com (owner)",
    scope: null,
    surface: "campaigns",
    language: "en",
    timezone: "America/New_York",
    closures: [],
    now: new Date(NOW),
  };
  const w = turnWords(facts);
  assert.ok(w.includes("They are on Campaigns,"), w);
  assert.ok(w.includes("is a change to that campaign, by the id the page's rows carry"), w);
  // The page lines name no tool (the answer canvas, A3): which tool carries a change is the tools' own words.
  for (const surface of ["campaigns", "leads"])
    assert.ok(!/\bpropose_|\bwith action\b|playbook_id/.test(turnWords({ ...facts, surface })), surface);
  // A campaign's row says its last 30 days; a one-off send's (the ledger's, and Sent's) says that send's own totals.
  assert.ok(w.includes("a campaign's numbers are its last 30 days, and a one-off send's are that send's own"), w);
  assert.ok(!w.includes("their numbers are the last 30 days"), w);
  assert.ok(!w.includes("They are on the campaigns page."), "the line, never the bare page");
  assert.ok(!turnWords({ ...facts, surface: "today" }).includes("They are on Campaigns,"));
  // A card approved since the last answer sends Ask back to the reads; one dismissed, failed or undone does not.
  const since = [{ id: "p-1", title: "Campaign: Win-back", state: "done", receipt: "running", atMs: 1 }];
  assert.ok(turnWords({ ...facts, since }).includes("read the campaigns again, never the shape"));
  for (const state of ["dismissed", "failed", "undone"])
    assert.ok(!turnWords({ ...facts, since: [{ ...since[0], state }] }).includes("never the shape"), state);
  const rule = ASK_RULES.find((r) => r.startsWith("Setting up campaigns is a few cards, never a claim."));
  assert.ok(rule, "the setup rule");
  assert.ok(rule.includes("only calls independent of each other go side by side"), rule);
  assert.ok(rule.includes("Never say that anything is set up, started or running"));
  assert.ok(
    ASK_RULES.indexOf(rule) === ASK_RULES.findIndex((r) => r.startsWith("A proposal is one card.")) + 1,
    "after the rule that a proposal is one card",
  );
  // Words a person of any trade reads: the glossary's appointment, never a salon's visit.
  assert.ok(ASK_DEFINITIONS.playbook.includes("by appointments where a calendar is connected"));
  assert.ok(!/\bvisits?\b/.test(ASK_DEFINITIONS.playbook), ASK_DEFINITIONS.playbook);
  // D19: the person reads Ask's answers, so Ask says the word the pages say, on every page (the definition is read on
  // every turn; the Campaigns line only on Campaigns).
  assert.ok(ASK_DEFINITIONS.playbook.includes("say campaign, never playbook"), ASK_DEFINITIONS.playbook);
});

test("the rules know the plan and the message (the marketing manager's §5.7): an offer, a promotion or a whole setup is one plan, whose steps AI never assembles, and a message's words are a message card's alone, every channel's version on it; the setup rule says so itself, no rule left says otherwise, the rules name no tool (the answer canvas, A2: the tools' descriptions say which), and on Campaigns the turn's words name the plan first", async () => {
  const { turnWords } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/prompt.ts")).href
  );
  const PLAN =
    "An offer, a promotion or a whole setup of the customer journey is one plan, which builds its own steps.";
  const MESSAGE = "A message's words are written as a message card, every channel's version on it";
  for (const words of [PLAN, MESSAGE])
    assert.equal(ASK_RULES.filter((r) => r.includes(words)).length, 1, `one rule says it: ${words}`);
  // The plan is the setup rule's own first instruction: the rule is reworded, never a second one beside it.
  const setup = ASK_RULES.find((r) => r.startsWith("Setting up campaigns is a few cards, never a claim."));
  assert.ok(setup.startsWith(`Setting up campaigns is a few cards, never a claim. ${PLAN}`), setup);
  assert.ok(
    !ASK_RULES.some((r) => r !== setup && /\bset(ting)? up (campaigns|sequences)\b/i.test(r)),
    "one setup rule",
  );
  // A plan is one card with one press (D2 of the answers canvas); a reminder or a check after an appointment only where a
  // calendar is connected.
  // Decision 0132: one press starts everything the plan's card names, where it took one send a press.
  assert.ok(setup.includes("A plan is one card with one press, which starts everything it names"), setup);
  assert.ok(
    setup.includes("A reminder before an appointment, or a check after one, only where a calendar is connected"),
  );
  // A plan is answered from its result (the last rule: the plan is called alone, and its answer written once it is
  // back): each rule that asks for a sentence of Ask's own after a proposal names that exception, so no two rules
  // disagree about a plan's answer.
  const act = ASK_RULES.find((r) => r.startsWith("Every change is a card a person presses"));
  assert.ok(act.includes("a plan is answered from its result"), act);
  assert.equal(ASK_RULES.filter((r) => r.includes("A plan is the exception")).length, 1, "the rule both point to");
  // The answer canvas, A2 (16 Oct 2026): how a tool is used is its description's, so no rule names one; the tools below
  // say what the rules once did (the plan, the message, never a setup assembled by hand).
  for (const r of ASK_RULES) assert.ok(!/\bpropose_[a-z_]+|\baction [a-z_]+\b/.test(r), r);
  // What the rules said before a plan and a written message, none of it left: a whole setup's cards assembled by hand,
  // a campaign on a held message or its starter and nothing else, every card its own press, Ask never writing a message.
  const rules = ASK_RULES.join("\n");
  for (const old of [
    /then propose one card per campaign in one round/,
    /\bEach card is its own press\b/,
    /never (writes?|composes?) (a |the )?(message|template)/i,
    /\bstarters? only\b|\bonly (a |its |the )?starter\b/i,
    /template_id or the moment's starter/,
  ])
    assert.ok(!old.test(rules), String(old));
  // Where a rule offers a campaign its starter, it offers the message Ask writes too.
  for (const r of ASK_RULES.filter((x) => /\bstarter\b/.test(x))) assert.ok(/\bwritten\b/.test(r), r);
  // The polish round (11 Oct 2026): a proposal is one card, and a plan's cards one proposal, so the two rules agree;
  // and a campaign's values (the month's offer's text) are its change's, never a message written anew.
  const one = ASK_RULES.find((r) => r.startsWith("A proposal is one card."));
  assert.ok(one.startsWith("A proposal is one card. A plan's cards, its steps from one call, are one proposal."), one);
  assert.ok(
    ASK_RULES.find((r) => r.includes(MESSAGE)).includes(
      "a campaign's own values (the month's offer's text) are changed on the campaign",
    ),
    "the message rule",
  );
  // Every page's turn words (the surface lines, Campaigns' among them) say none of the old words either, and restate
  // no path of the setup rule's: Campaigns' line points to the rule by its first words, so the two cannot drift.
  const facts = {
    role: "owner",
    personLabel: "ada@example.com (owner)",
    scope: null,
    language: "en",
    timezone: "America/New_York",
    closures: [],
    now: new Date(NOW),
  };
  for (const surface of ASK_SURFACES) {
    const said = turnWords({ ...facts, surface });
    for (const old of [
      /then propose one card per campaign in one round/,
      /\bEach card is its own press\b/,
      /never (writes?|composes?) (a |the )?(message|template)/i,
      /\bstarters? only\b|\bonly (a |its |the )?starter\b/i,
      /template_id or the moment's starter/,
      /propose_campaign with action (plan|playbook|message)\b/,
      /action playbooks and action audiences together/,
    ])
      assert.ok(!old.test(said), `${surface}: ${old}`);
  }
  const head = "Setting up campaigns is a few cards";
  assert.ok(setup.startsWith(head));
  assert.ok(turnWords({ ...facts, surface: "campaigns" }).includes(`as the rule "${head}" says`));
  // The two actions the rules name are propose_plan's and propose_sequence's, as the API is told them.
  const campaign = ACT_TOOLS.find((t) => t.name === "propose_sequence");
  assert.ok(ACT_TOOLS.find((t) => t.name === "propose_plan").description.includes("Action offer "), "the plan");
  assert.ok(campaign.description.includes("Action message "), "the message");
  // 11 Oct 2026 (Task 19's review): the tools' words the model reads beside the rules agree with them. propose_campaign's
  // tail sends an offer, a promotion or a whole setup to the plan before it names any action that builds one step, and
  // the journey read says what it reports and that a whole setup or an offer is the plan's, never assembled from it.
  const tail = "For an offer, a promotion or a whole setup, call propose_plan with action offer instead.";
  assert.ok(campaign.description.includes(tail), campaign.description);
  const journey = READ_TOOLS.find((t) => t.name === "sequences").description;
  assert.ok(
    journey.includes(
      "An offer or a whole setup is one call of propose_plan with action offer, which reads the journey itself and makes the steps, never a campaign proposed stage by stage from this read",
    ),
    journey,
  );
  assert.ok(!journey.includes("then propose one for an uncovered stage"), "the hand-assembled setup is gone");
  // A campaign's values are slot text, never "its words" (the polish round): the tail's change and the change action's
  // own words say values, so the message rule never steers "make the month's offer 15% off" to a new message.
  assert.ok(!campaign.description.includes("change its words"), "the tail");
  assert.ok(!campaign.description.includes("new words, the same message"), "action change");
  assert.ok(campaign.description.includes("new text in the same message, never a new message"), "action change");
});

test("on Leads the searches ride in with every question, after what it names and within the cap: the page holds only their count, a search's plan reads them first, and that read paid a round for rows the page had already loaded", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/cross-page.ts")).href);
  const names = (q, surface) => mod.crossPagePlan(q, surface).map((r) => `${r.name} ${JSON.stringify(r.input)}`);
  const searches = 'leads {"action":"searches"}';
  assert.deepEqual(names("find me 100 dentists in Austin, TX", "leads"), [searches]);
  assert.deepEqual(names("busca 50 plomeros en Miami", "leads"), [searches], "in any language: no words are read");
  assert.deepEqual(names("Who has a proposal out?", "leads"), ['people {"action":"pipeline"}', searches]);
  assert.deepEqual(
    names("how did the week go, and what's on tomorrow", "leads").length,
    mod.CROSS_PAGE_MAX,
    "what the question names keeps the cap",
  );
  assert.deepEqual(names("find me 100 dentists in Austin, TX", "people"), [], "only on the page that holds them");
});

test("an offer asked for reads its journey and its Library before round 1, as a setup reads its two (the marketing manager's §5.7): on any page, Campaigns included, in either language; offer alone stays the audiences' word and deal the pipeline's; a question about how one did is none; within the cap a setup keeps its own two, and an offer's go before any other read", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/cross-page.ts")).href);
  const names = (q, surface) => mod.crossPagePlan(q, surface).map((r) => `${r.name} ${JSON.stringify(r.input)}`);
  const planReads = ['sequences {"action":"journey"}', 'sequences {"action":"messages"}'];
  for (const q of [
    "10% off colour all November",
    // The eval's offer_november_colour, and its must-never offer_no_offers_channel.
    "I want to offer 10% off colour all next month",
    "I want to offer 15% off everything next month",
    "For November, 10% off colour",
    "half price haircuts next Tuesday",
    "$20 off any appointment booked this week",
    "Let's run a promotion for the holidays",
    "Can we do a Black Friday sale?",
    "Give everyone who said yes 15% off in December",
    "please set up a discount for new clients",
    "We're running a promo next month",
    "Quiero ofrecer un 10% de descuento en color todo noviembre",
    "Haz una promoción de 2x1 en diciembre",
    "Lanza unas rebajas de verano",
    // An amount at a sentence's start may stand after its article (the polish round, 11 Oct 2026).
    "A 10% discount for new clients in December",
    "Un 10% de descuento en noviembre",
  ])
    for (const surface of ["campaigns", "today", "people"])
      assert.deepEqual(names(q, surface), planReads, `${q} (${surface})`);
  // Do, have, run, start and make open many requests besides an offer: alone at a sentence's start they open none (an
  // opener before them does: "can we do", "let's run"), and an offer already named ("the 10% off", "our promo") is no
  // offer to make. A missed read costs nothing (the plan reads both itself); a false one pushes another to round 2.
  for (const q of [
    "Do we have any promotions running?",
    "Do I have any discounts running?",
    "Have the promotions gone out?",
    "Do you do discounts?",
    "Run the numbers on the promo",
    "Give me results of the 10% off",
    "Start the promotion",
    "Make sure nobody gets the discount twice",
  ]) {
    assert.deepEqual(names(q, "campaigns"), [], q);
    assert.ok(!names(q, "today").some((n) => /journey|messages/.test(n)), `${q} (today)`);
  }
  // An offer said of a campaign that runs (the month's offer) is a change to it, read as the campaigns are read.
  for (const q of ["Can you make the month's offer 15% off?", "Make the month's offer 15% off"]) {
    assert.deepEqual(names(q, "today"), ['sequences {"action":"moments"}', 'sequences {"action":"lists"}'], q);
    assert.deepEqual(names(q, "campaigns"), [], q);
  }
  // Where the deals stand is the pipeline's, never an offer's.
  for (const q of [
    "how many deals are open?",
    "Who has a deal waiting?",
    "move the deal with Ana to won",
    "¿cuántas propuestas tengo?",
  ])
    assert.deepEqual(names(q, "today"), ['people {"action":"pipeline"}', "today {}"], q);
  // Offer alone is who can be sent one (the audiences) or the month's offer (a campaign the page holds).
  assert.deepEqual(names("how many people can I send offers to?", "campaigns"), ['sequences {"action":"lists"}']);
  assert.deepEqual(names("send an offer to the quiet clients", "today"), ['sequences {"action":"lists"}', "today {}"]);
  assert.deepEqual(names("¿a quién puedo enviar ofertas?", "campaigns"), ['sequences {"action":"lists"}']);
  assert.deepEqual(names("pause the monthly offer", "campaigns"), []);
  // How one did, a customer's ask, Spanish's "sale" (goes out) and the business's sales are no offer to make.
  for (const q of [
    "how did the promotion do?",
    "did the 10% off bring anyone in?",
    "which discount worked best?",
    "what should I do about the discount she asked for?",
    "¿Sale el mensaje mañana?",
    "¿qué sale esta semana?",
  ])
    assert.deepEqual(names(q, "campaigns"), [], q);
  assert.deepEqual(names("how are sales this month?", "today"), ['report {"period":"30d"}', "today {}"]);
  // The cap (CROSS_PAGE_MAX, two) keeps the first: a setup's own two before an offer's, and an offer's before the
  // rest, so the week asked beside an offer is the model's own read.
  assert.equal(mod.CROSS_PAGE_MAX, 2);
  assert.deepEqual(names("Set up my campaigns and run 10% off colour in November", "campaigns"), [
    'sequences {"action":"moments"}',
    'sequences {"action":"lists"}',
  ]);
  assert.deepEqual(names("10% off colour all November. How did last month go?", "today"), planReads);
});
