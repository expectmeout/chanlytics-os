/**
 * The Line's voice module, run (apps/dashboard/src/legacy-bridge/ask/voice.ts) over a stand-in for the vendor's
 * client, a recorder for the three voice routes and a timer the test moves by hand. The hold is the one mic (the
 * spec's §3.5 as amended 4 Oct 2026, evening): a press asks for the session (the token freshened, the row minted, the
 * vendor connected with the sealed session, its microphone muted once up), the lift sends the words heard as the
 * person's turn and that turn's own listener hears its answer, a lift before the session is up waits the lift's patience
 * and then goes the typed way, the agent's voice is held down while the person holds, an idle minute ends the session
 * as `idle`, and every end reaches whoever watches the session as "gone" and the row with the browser's word for why (00300, 00302) and
 * what it measured from the press (to the connection, to the first audio). An end that comes while a start is still
 * connecting closes what the start opens, and a callback from a conversation that is over changes nothing of the one
 * running.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_VOICE_IDLE_MS, ASK_VOICE_UP_WAIT_MS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { installVoice } = await import(at("apps/dashboard/src/legacy-bridge/ask/voice.ts"));

const WIN = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia: () => {} } } };
const START = { threadId: null, scope: null, surface: "today", context: null };
/** A turn nobody listens to: the test is about the session. */
const NOBODY = () => {};

/** The vendor's client stood in for: a conversation that connects when the test says (`connect`), and remembers what was done to it. */
function vendor() {
  const convs = [];
  let release = null;
  const Conversation = {
    startSession: async (opts) => {
      const conv = {
        opts,
        ended: 0,
        sent: [],
        muted: [],
        volumes: [],
        endSession: async () => {
          conv.ended += 1;
        },
        sendUserMessage: (t) => conv.sent.push(t),
        setMicMuted: (m) => conv.muted.push(m),
        setVolume: ({ volume }) => conv.volumes.push(volume),
        getOutputVolume: () => 0.5,
      };
      convs.push(conv);
      await new Promise((r) => {
        release = r;
      });
      return conv;
    },
  };
  return { convs, connect: () => release && release(), load: async () => ({ Conversation }) };
}

/** The three voice routes, recorded: an end with its reason and the two timings. */
function api() {
  let n = 0;
  const calls = { starts: [], ends: [], pages: [] };
  return {
    calls,
    voiceStart: async (input) => {
      n += 1;
      calls.starts.push(input);
      return {
        session: `s${n}`,
        token: `t${n}`,
        conversation_id: `conv_${n}`,
        thread_id: `thread-${n}`,
        title: "Voice",
      };
    },
    voicePage: async (session, context) => {
      calls.pages.push({ session, context });
    },
    voiceEnd: async (session, reason, timing) => {
      calls.ends.push({ session, reason, timing });
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 4; i++) await tick();
};
/** A clock the test moves by hand, so the timings are exact. */
function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}
/** A timer the test fires by hand: every timer set for `ms`, or the count of them waiting. */
function timer() {
  const waiting = new Map();
  const wound = new Map();
  let n = 0;
  return {
    set: (fn, ms) => {
      waiting.set(++n, { fn, ms });
      wound.set(ms, (wound.get(ms) ?? 0) + 1);
      return n;
    },
    /** How many times a timer of `ms` was set: a clock wound again is one more. */
    wound: (ms) => wound.get(ms) ?? 0,
    clear: (id) => waiting.delete(id),
    fire: (ms) => {
      for (const [id, w] of [...waiting]) {
        if (w.ms !== ms) continue;
        waiting.delete(id);
        w.fn();
      }
    },
    count: (ms) => [...waiting.values()].filter((w) => w.ms === ms).length,
  };
}
/** A session up: the press asked, the vendor connected; `watch`, when given, follows it. */
async function up(voice, v, watch = null, input = START) {
  if (watch) voice.watchVoice(watch);
  const p = voice.ensureVoice(input);
  await settle();
  v.connect();
  return p;
}

test("the press asks for the session: the token freshened, the row minted as the member's, the vendor connected with the sealed session and no override, its microphone muted once up, nothing said; a second press while it connects waits on the first and opens nothing of its own", async () => {
  const v = vendor();
  const a = api();
  const freshened = [];
  const voice = installVoice(WIN, { api: a, load: v.load, freshen: async () => freshened.push(1) });
  const heard = [];
  voice.watchVoice((x) => heard.push(x));
  const first = voice.ensureVoice(START);
  const second = voice.ensureVoice(START);
  await settle();
  assert.deepEqual(freshened, [1], "the token freshened before the row is minted");
  assert.equal(a.calls.starts.length, 1, "one mint for two presses");
  assert.equal("language" in a.calls.starts[0], false, "no language: the agent's is the agent's own");
  assert.equal(voice.voiceUp(), false, "not up until the vendor connects");
  assert.equal(voice.voiceConnecting(), true, "and connecting meanwhile");
  v.connect();
  const got = await first;
  assert.deepEqual(got, { threadId: "thread-1" });
  assert.deepEqual(await second, got, "the second press is answered with the same session");
  assert.equal(voice.voiceUp(), true);
  assert.equal(voice.voiceConnecting(), false);
  assert.equal(voice.voiceThread(), "thread-1");
  const conv = v.convs[0];
  assert.equal(conv.opts.conversationToken, "t1");
  assert.equal(conv.opts.connectionType, "webrtc");
  assert.deepEqual(conv.opts.customLlmExtraBody, { chanlytics_session: "s1" });
  assert.equal("overrides" in conv.opts, false, "the agent is the agent's own");
  assert.deepEqual(conv.muted, [true], "the agent hears nothing of the room: the hold is the one mic");
  assert.deepEqual(conv.sent, [], "nothing said yet");
  assert.equal(voice.level(), 0.5);
  // A third press on the same thread, or with no thread yet: the session running, nothing new opened.
  assert.deepEqual(await voice.ensureVoice({ ...START, threadId: "thread-1" }), { threadId: "thread-1" });
  assert.equal(a.calls.starts.length, 1);
  await voice.stopVoice("navigated");
  assert.equal(conv.ended, 1, "the vendor's session ended");
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "navigated"]);
  assert.deepEqual(heard.at(-1), { t: "gone", reason: "navigated" }, "and whoever watches hears the end");
  assert.equal(voice.voiceUp(), false);
});

test("the lift: the words heard go to the agent as the person's turn, and the listener given with them hears that turn's answer; nothing to say with no session up, and empty words say nothing", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  const turn = (x) => heard.push(x);
  assert.equal(voice.sayVoice("how did the week go", turn), false, "no session: the words go the typed way");
  await up(voice, v);
  assert.equal(voice.sayVoice("  ", turn), false);
  assert.equal(voice.sayVoice(" how did the week go ", turn), true);
  assert.deepEqual(v.convs[0].sent, ["how did the week go"], "the words, trimmed, as the person's turn");
  assert.deepEqual(heard, [], "nothing told yet: whoever asked drew the question");
  // The agent answers as it speaks: its parts grow the Say, the whole is spoken, the end lands.
  v.convs[0].opts.onAgentChatResponsePart({ type: "start" });
  v.convs[0].opts.onAgentChatResponsePart({ type: "delta", text: "Two people need you. " });
  v.convs[0].opts.onIncomingEvent({ type: "agent_response_complete" });
  assert.deepEqual(heard, [{ t: "say", headline: "Two people need you.", detail: "" }, { t: "landed" }]);
  // The next turn's listener takes over: the first hears nothing of the second's answer.
  const next = [];
  assert.equal(
    voice.sayVoice("and the month", (x) => next.push(x)),
    true,
  );
  v.convs[0].opts.onAgentChatResponsePart({ type: "start" });
  v.convs[0].opts.onAgentChatResponsePart({ type: "delta", text: "A good month. " });
  assert.equal(heard.length, 2, "the first turn's listener hears no more");
  assert.deepEqual(next, [{ t: "say", headline: "A good month.", detail: "" }]);
  await voice.stopVoice("navigated");
});

test("a lift before the session is up waits the lift's patience, then goes the typed way (null) while the start goes on for the next hold; a lift with the session up answers at once", async () => {
  const v = vendor();
  const a = api();
  const tm = timer();
  const voice = installVoice(WIN, { api: a, load: v.load, timer: tm });
  void voice.ensureVoice(START);
  const soon = voice.soonVoice(START);
  await settle();
  assert.equal(a.calls.starts.length, 1, "the lift waits on the press's start and opens nothing of its own");
  assert.equal(tm.count(ASK_VOICE_UP_WAIT_MS), 1, "the lift's patience, waiting");
  tm.fire(ASK_VOICE_UP_WAIT_MS);
  assert.equal(await soon, null, "not up in time: the typed way");
  assert.equal(voice.voiceConnecting(), true, "the start goes on");
  v.connect();
  await settle();
  assert.equal(voice.voiceUp(), true, "and is up for the next hold");
  const now = voice.soonVoice(START);
  await settle();
  assert.deepEqual(await now, { threadId: "thread-1" }, "up: answered at once");
  assert.equal(tm.count(ASK_VOICE_UP_WAIT_MS), 0, "the patience cleared");
});

test("the agent's voice is held down while the person holds the mic and back up on the lift; a hold before the connection lands is applied when it does", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  voice.hushVoice(true);
  await up(voice, v);
  assert.deepEqual(v.convs[0].volumes, [0], "held before the connection landed: applied as it did");
  voice.hushVoice(false);
  voice.hushVoice(true);
  voice.hushVoice(false);
  assert.deepEqual(v.convs[0].volumes, [0, 1, 0, 1]);
});

test("idle: a minute after the last question or answer the browser ends the session as idle; a question and an answer wind the clock again", async () => {
  const v = vendor();
  const a = api();
  const tm = timer();
  const voice = installVoice(WIN, { api: a, load: v.load, timer: tm });
  const heard = [];
  await up(voice, v, (x) => heard.push(x));
  assert.equal(tm.count(ASK_VOICE_IDLE_MS), 1, "the idle clock wound at the connection");
  voice.sayVoice("how did the week go", NOBODY);
  assert.equal(tm.count(ASK_VOICE_IDLE_MS), 1, "wound again by the question, not doubled");
  v.convs[0].opts.onIncomingEvent({ type: "agent_response_complete" });
  assert.equal(tm.count(ASK_VOICE_IDLE_MS), 1, "and by the answer");
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.equal(voice.voiceUp(), false);
  assert.equal(v.convs[0].ended, 1);
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "idle"]);
  assert.deepEqual(heard.at(-1), { t: "gone", reason: "idle" });
  assert.equal(tm.count(ASK_VOICE_IDLE_MS), 0, "nothing left ticking");
});

test("the timings: from the press to the connection and to the agent's first speaking, as the browser's clock read them, on the row's end", async () => {
  const v = vendor();
  const a = api();
  const c = clock();
  const voice = installVoice(WIN, { api: a, load: v.load, now: c.now });
  const started = voice.ensureVoice(START);
  await settle();
  c.advance(2_100);
  v.connect();
  await started;
  v.convs[0].opts.onConnect({ conversationId: "conv_1" });
  c.advance(900);
  v.convs[0].opts.onModeChange({ mode: "speaking" });
  c.advance(5_000);
  v.convs[0].opts.onModeChange({ mode: "speaking" }); // a later turn moves nothing
  await voice.stopVoice("typed");
  assert.deepEqual(a.calls.ends, [
    { session: "s1", reason: "typed", timing: { connectMs: 2_100, firstAudioMs: 3_000 } },
  ]);
});

test("an end while the start is still connecting: once the vendor connects, what it opened is closed again (the microphone, the row), the press answers null, and the Line heard gone once", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  voice.watchVoice((x) => heard.push(x));
  const started = voice.ensureVoice(START);
  await settle();
  assert.equal(a.calls.starts.length, 1, "the row minted");
  await voice.stopVoice("navigated");
  assert.equal(voice.voiceUp(), false);
  v.connect();
  assert.equal(await started, null, "nothing of it is left running");
  assert.equal(v.convs[0].ended, 1, "the connection the vendor made is ended");
  assert.deepEqual(
    a.calls.ends.map((e) => e.session),
    ["s1"],
    "the row is ended once (the stop found no session yet; the start ends it when it lands)",
  );
  assert.equal(a.calls.ends[0].timing.firstAudioMs, null, "no audio was heard");
  assert.equal(heard.filter((x) => x.t === "gone").length, 1, "whoever watches hears one end");
});

test("a hold on another thread replaces the session (superseded); the first's late callbacks change nothing of the second; the far side going ends the row as the vendor's", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  await up(voice, v, (x) => heard.push(x));
  const second = voice.ensureVoice({ ...START, threadId: "thread-other" });
  await settle();
  assert.equal(v.convs[0].ended, 1, "the first session ended by the second's press");
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "superseded"]);
  assert.deepEqual(a.calls.starts[1].threadId, "thread-other");
  v.connect();
  await second;
  assert.equal(voice.voiceUp(), true);
  // The first conversation's client reports its disconnect late: the second is untouched.
  assert.deepEqual(heard, [{ t: "gone", reason: "superseded" }], "the first's end, told once");
  v.convs[0].opts.onDisconnect({ reason: "user" });
  v.convs[0].opts.onMessage({ source: "ai", message: "Late words from the first." });
  assert.equal(voice.voiceUp(), true, "the second session still runs");
  assert.equal(heard.length, 1, "and nobody heard anything more of the first");
  assert.equal(a.calls.ends.length, 1, "no second end for the first's row");
  // The second's far side goes (the vendor's limit, a dropped connection): the Line hears the vendor's own word, and
  // the row is ended as the vendor's doing.
  v.convs[1].opts.onDisconnect({ reason: "agent" });
  assert.deepEqual(heard.at(-1), { t: "gone", reason: "agent" });
  assert.equal(voice.voiceUp(), false);
  await tick();
  assert.deepEqual([a.calls.ends.at(-1).session, a.calls.ends.at(-1).reason], ["s2", "vendor"]);
});

test("a start the vendor refuses: the press answers null, the row is ended as a start that failed, whoever watches hears gone", async () => {
  const a = api();
  const load = async () => ({
    Conversation: {
      startSession: async () => {
        throw new Error("Permission denied: microphone");
      },
    },
  });
  const voice = installVoice(WIN, { api: a, load });
  const heard = [];
  voice.watchVoice((x) => heard.push(x));
  assert.equal(await voice.ensureVoice(START), null);
  await tick();
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "start"]);
  assert.deepEqual(heard, [{ t: "gone", reason: "start" }]);
  assert.equal(voice.voiceUp(), false);
  assert.equal(voice.voiceConnecting(), false, "nothing left connecting");
});

test("a mint the route refuses: no row to end, whoever watches hears gone as a start that failed, the press answers null", async () => {
  const v = vendor();
  const a = api();
  a.voiceStart = async () => {
    throw new Error("Voice is off while this workspace is paused or its plan has ended.");
  };
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  voice.watchVoice((x) => heard.push(x));
  assert.equal(await voice.ensureVoice(START), null);
  assert.deepEqual(a.calls.ends, [], "no row was made");
  assert.deepEqual(heard, [{ t: "gone", reason: "start" }]);
  assert.equal(voice.voiceConnecting(), false);
});

test("a watcher follows the session across its turns: it hears the agent's mode, what each turn's listener hears, and every end, a stop's or the vendor's; a watcher that lets go hears nothing more", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const turn = [];
  const watched = [];
  await up(voice, v);
  const off = voice.watchVoice((x) => watched.push(x));
  v.convs[0].opts.onModeChange({ mode: "speaking" });
  assert.deepEqual(
    watched,
    [{ t: "mode", mode: "speaking" }],
    "the mode, with no turn asked: the ring's and the three's",
  );
  voice.sayVoice("how did the week go", (x) => turn.push(x));
  v.convs[0].opts.onMessage({ source: "ai", message: "Two people need you." });
  assert.deepEqual(turn, [{ t: "spoken", text: "Two people need you." }]);
  assert.deepEqual(watched.at(-1), turn[0], "the watcher hears what the turn hears");
  await voice.stopVoice("navigated");
  assert.deepEqual(watched.at(-1), { t: "gone", reason: "navigated" }, "and the end the Line asked for");
  off();
  await up(voice, v);
  v.convs[1].opts.onDisconnect({ reason: "agent" });
  assert.equal(watched.length, 3, "a watcher that let go hears nothing of the next session");
});

test("the page moved: the row is told while a session runs, and not before or after", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const context = { surface: "inbox", rows: [] };
  voice.pageMoved(context);
  assert.deepEqual(a.calls.pages, [], "no session, nothing to tell");
  await up(voice, v);
  voice.pageMoved(context);
  await tick();
  assert.deepEqual(a.calls.pages, [{ session: "s1", context }]);
  await voice.stopVoice("navigated");
  voice.pageMoved(context);
  await tick();
  assert.equal(a.calls.pages.length, 1);
});

test("a press the route refused is not asked for again at the lift: the words go the typed way at once, and one hold is one mint", async () => {
  const v = vendor();
  const a = api();
  let mints = 0;
  a.voiceStart = async () => {
    mints += 1;
    throw new Error("You have reached this hour's voice conversations.");
  };
  const tm = timer();
  const voice = installVoice(WIN, { api: a, load: v.load, timer: tm });
  assert.equal(await voice.ensureVoice(START), null, "the press: refused");
  assert.equal(await voice.soonVoice(START), null, "the lift: nothing to wait for");
  assert.equal(mints, 1, "the lift did not ask again");
  assert.equal(tm.count(ASK_VOICE_UP_WAIT_MS), 0, "and waited for nothing");
});

test("the vendor's own silent turn (its re-engage at the turn timeout, answered with nothing) is not an answer: the idle clock is not wound again and the Line hears nothing of it", async () => {
  const v = vendor();
  const a = api();
  const tm = timer();
  const voice = installVoice(WIN, { api: a, load: v.load, timer: tm });
  const heard = [];
  await up(voice, v, (x) => heard.push(x));
  const woundAtConnect = tm.wound(ASK_VOICE_IDLE_MS);
  // Thirty seconds of silence: the vendor asks the brain with "...", the door answers the buffer words, the turn completes.
  v.convs[0].opts.onAgentChatResponsePart({ type: "start" });
  v.convs[0].opts.onAgentChatResponsePart({ type: "delta", text: "... " });
  v.convs[0].opts.onIncomingEvent({ type: "agent_response_complete" });
  assert.equal(tm.wound(ASK_VOICE_IDLE_MS), woundAtConnect, "nobody asked: the minute keeps running");
  assert.deepEqual(heard, [], "and nobody is told anything landed");
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "idle"], "so the idle minute ends it");
});

test("the idle minute never ends a session in use: not while the person holds the mic, not while an answer is on its way, not while the agent speaks; it runs again from the end of the speech", async () => {
  const v = vendor();
  const a = api();
  const tm = timer();
  const voice = installVoice(WIN, { api: a, load: v.load, timer: tm });
  await up(voice, v);
  // The person presses at the fifty-ninth second and is still talking as the minute ends.
  voice.hushVoice(true);
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.equal(voice.voiceUp(), true, "held: not ended under the person's words");
  voice.hushVoice(false);
  assert.equal(voice.sayVoice("how did the week go", NOBODY), true);
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.equal(voice.voiceUp(), true, "an answer on its way: not ended before it comes");
  // The answer is generated in seconds and spoken for longer than a minute.
  v.convs[0].opts.onModeChange({ mode: "speaking" });
  v.convs[0].opts.onIncomingEvent({ type: "agent_response_complete" });
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.equal(voice.voiceUp(), true, "speaking: not cut off mid-sentence");
  assert.equal(a.calls.ends.length, 0);
  v.convs[0].opts.onModeChange({ mode: "listening" });
  assert.equal(tm.count(ASK_VOICE_IDLE_MS), 1, "the minute runs from the end of the speech");
  tm.fire(ASK_VOICE_IDLE_MS);
  await settle();
  assert.deepEqual([a.calls.ends[0].session, a.calls.ends[0].reason], ["s1", "idle"]);
});

test("words the connection would not take go the typed way: the lift answers false, and the listener given with them hears nothing", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  await up(voice, v, (x) => heard.push(x));
  v.convs[0].sendUserMessage = () => {
    throw new Error("the data channel is closed");
  };
  const turn = [];
  assert.equal(
    voice.sayVoice("how did the week go", (x) => turn.push(x)),
    false,
  );
  v.convs[0].opts.onAgentChatResponsePart({ type: "delta", text: "Words of another turn. " });
  assert.deepEqual(turn, [], "a turn that never left hears nothing");
  assert.deepEqual(
    heard.filter((x) => x.t === "question"),
    [],
  );
});

test("busy: a session up and quiet is not in a clip's way; one with an answer on its way, or speaking, is", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  assert.equal(voice.voiceBusy(), false, "no session");
  await up(voice, v);
  assert.equal(voice.voiceBusy(), false, "up and quiet");
  voice.sayVoice("how did the week go", NOBODY);
  assert.equal(voice.voiceBusy(), true, "an answer on its way");
  v.convs[0].opts.onModeChange({ mode: "speaking" });
  v.convs[0].opts.onIncomingEvent({ type: "agent_response_complete" });
  assert.equal(voice.voiceBusy(), true, "generated, and still being spoken");
  v.convs[0].opts.onModeChange({ mode: "listening" });
  assert.equal(voice.voiceBusy(), false, "said");
});

test("the vendor's client is fetched ahead of the first press when asked (the Line opening), and a fetch that fails leaves the press to try again", async () => {
  const v = vendor();
  const a = api();
  let loads = 0;
  let fail = true;
  const load = async () => {
    loads += 1;
    if (fail) throw new Error("the chunk did not load");
    return v.load();
  };
  const voice = installVoice(WIN, { api: a, load });
  voice.warmVoice();
  await settle();
  assert.equal(loads, 1, "fetched as asked, and its failure is nobody's error");
  assert.equal(a.calls.starts.length, 0, "no session asked for: warming opens nothing");
  fail = false;
  const got = voice.ensureVoice(START);
  await settle();
  await settle();
  assert.equal(loads, 2, "the press loads it itself");
  v.connect();
  assert.deepEqual(await got, { threadId: "thread-1" });
  await voice.stopVoice("navigated");
});

test("a page that died under a session says so when it comes back: the session leaves a mark in the tab while it runs, a clean end takes it away, and a page that finds one tells the row how it came back and on what (seen 5 Oct 2026: a phone reloaded the page mid-answer, and the row could not say why it ended)", async () => {
  /** A tab's storage and what a browser says of how the page was loaded, shared by the page that died and the next. */
  const tab = new Map();
  const win = (type, userAgent) => ({
    ...WIN,
    navigator: { ...WIN.navigator, userAgent },
    sessionStorage: {
      getItem: (k) => (tab.has(k) ? tab.get(k) : null),
      setItem: (k, v) => tab.set(k, v),
      removeItem: (k) => tab.delete(k),
    },
    performance: { getEntriesByType: (kind) => (kind === "navigation" ? [{ type }] : []) },
    document: {},
  });
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const v = vendor();
  const a = api();
  const first = installVoice(win("navigate", IPHONE), { api: a, load: v.load, timer: timer() });
  assert.deepEqual(a.calls.ends, [], "a tab with no mark says nothing");
  await up(first, v);
  assert.equal(tab.size, 1, "the session's mark, while it runs");
  // The page is gone with no goodbye (the phone reloaded it). The next page in the same tab finds the mark.
  const b = api();
  installVoice(win("reload", IPHONE), { api: b, load: v.load, timer: timer() });
  assert.deepEqual(b.calls.ends, [{ session: "s1", reason: "died:reload:ios", timing: undefined }]);
  assert.equal(tab.size, 0, "said once");
  // The phone app names itself; a desk is a desk.
  tab.set("ask-voice-live", "s9");
  const c = api();
  installVoice(win("reload", `${IPHONE} ChanlyticsApp/1.4.0 (ios)`), { api: c, load: v.load, timer: timer() });
  assert.equal(c.calls.ends[0].reason, "died:reload:app-ios");
  // A session ended cleanly leaves no mark, so the next page says nothing.
  const v2 = vendor();
  const d = api();
  const clean = installVoice(win("navigate", "Mozilla/5.0 (Windows NT 10.0)"), {
    api: d,
    load: v2.load,
    timer: timer(),
  });
  await up(clean, v2);
  assert.equal(tab.size, 1);
  await clean.stopVoice("navigated");
  assert.equal(tab.size, 0, "a clean end takes the mark away");
  const e = api();
  installVoice(win("reload", "Mozilla/5.0 (Windows NT 10.0)"), { api: e, load: v2.load, timer: timer() });
  assert.deepEqual(e.calls.ends, []);
});
