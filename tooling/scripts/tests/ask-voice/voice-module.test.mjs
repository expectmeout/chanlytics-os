/**
 * The Line's voice module, run (apps/dashboard/src/legacy-bridge/ask/voice.ts) over a stand-in for the vendor's
 * client and a recorder for the three voice routes: what a start does and in what order, that an end that comes
 * while a start is connecting closes what the start opens (the review's case: the microphone stayed hot and the row
 * open), that every end reaches the Line as "gone" with the thread still known, and that a callback from a
 * conversation that is over changes nothing of the one running.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { installVoice } = await import(at("apps/dashboard/src/legacy-bridge/ask/voice.ts"));

const WIN = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia: () => {} } } };
const START = { threadId: null, scope: null, surface: "today", context: null, language: "en" };

/** The vendor's client stood in for: a conversation that connects when the test says (`connect`), and remembers its ends. */
function vendor() {
  const convs = [];
  let release = null;
  const Conversation = {
    startSession: async (opts) => {
      const conv = {
        opts,
        ended: 0,
        sent: [],
        endSession: async () => {
          conv.ended += 1;
        },
        sendUserMessage: (t) => conv.sent.push(t),
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

/** The three voice routes, recorded. */
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
    voiceEnd: async (session, reason) => {
      calls.ends.push({ session, reason });
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("a start: the session is made fresh, the row minted, the vendor connected with the sealed session and the language, a first question sent once up", async () => {
  const v = vendor();
  const a = api();
  const freshened = [];
  const voice = installVoice(WIN, { api: a, load: v.load, freshen: async () => freshened.push(1) });
  const heard = [];
  const started = voice.startVoice({ ...START, language: "es", ask: "Resúmeme el día" }, (x) => heard.push(x));
  await tick();
  await tick();
  assert.deepEqual(freshened, [1], "the token freshened before the row is minted");
  assert.equal(a.calls.starts.length, 1);
  assert.equal(a.calls.starts[0].language, "es");
  assert.equal(voice.voiceOn(), false, "not up until the vendor connects");
  v.connect();
  const got = await started;
  assert.deepEqual(got, { threadId: "thread-1", title: "Voice" });
  assert.equal(voice.voiceOn(), true);
  const opts = v.convs[0].opts;
  assert.equal(opts.conversationToken, "t1");
  assert.equal(opts.connectionType, "webrtc");
  assert.deepEqual(opts.customLlmExtraBody, { chanlytics_session: "s1" });
  assert.deepEqual(opts.overrides, { agent: { language: "es" } });
  assert.deepEqual(v.convs[0].sent, ["Resúmeme el día"], "the first question, as typed, once connected");
  assert.equal(voice.level(), 0.5);
  await voice.stopVoice();
  assert.equal(v.convs[0].ended, 1, "the vendor's session ended");
  assert.deepEqual(a.calls.ends, [{ session: "s1", reason: "stopped" }], "the row ended, with the reason");
  assert.deepEqual(heard, [{ t: "gone", reason: "stopped" }], "and the Line hears the end it asked for");
  assert.equal(voice.voiceOn(), false);
});

test("an end while the start is still connecting: once the vendor connects, what it opened is closed again (the microphone, the row), the start answers null, and the Line heard gone once", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard = [];
  const started = voice.startVoice(START, (x) => heard.push(x));
  await tick();
  await tick();
  assert.equal(a.calls.starts.length, 1, "the row minted");
  await voice.stopVoice();
  assert.equal(voice.voiceOn(), false);
  v.connect();
  const got = await started;
  assert.equal(got, null, "nothing of it is left running");
  assert.equal(v.convs[0].ended, 1, "the connection the vendor made is ended");
  assert.deepEqual(
    a.calls.ends.map((e) => e.session),
    ["s1"],
    "the row is ended once (the stop found no session yet; the start ends it when it lands)",
  );
  assert.equal(heard.filter((x) => x.t === "gone").length, 1, "the Line hears one end");
  assert.equal(voice.voiceOn(), false);
});

test("a second start ends the first; the first's late callbacks change nothing of the second; the agent going ends the row with its reason", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const heard1 = [];
  const first = voice.startVoice(START, (x) => heard1.push(x));
  await tick();
  await tick();
  v.connect();
  await first;
  const heard2 = [];
  const second = voice.startVoice({ ...START, threadId: "thread-1" }, (x) => heard2.push(x));
  await tick();
  await tick();
  assert.equal(v.convs[0].ended, 1, "the first conversation ended by the second's start");
  assert.deepEqual(a.calls.ends, [{ session: "s1", reason: "stopped" }]);
  v.connect();
  await second;
  assert.equal(voice.voiceOn(), true);
  // The first conversation's client reports its disconnect late: the second is untouched.
  v.convs[0].opts.onDisconnect({ reason: "user" });
  v.convs[0].opts.onMessage({ source: "ai", message: "Late words from the first." });
  assert.equal(voice.voiceOn(), true, "the second conversation still runs");
  assert.deepEqual(heard2, [], "and heard nothing of the first");
  assert.equal(a.calls.ends.length, 1, "no second end for the first's row");
  // The second's agent goes: the Line hears it, and the row is ended with the vendor's reason.
  v.convs[1].opts.onDisconnect({ reason: "agent" });
  assert.deepEqual(heard2, [{ t: "gone", reason: "agent" }]);
  assert.equal(voice.voiceOn(), false);
  await tick();
  assert.deepEqual(a.calls.ends.at(-1), { session: "s2", reason: "agent" });
});

test("a start the vendor refuses: the row is ended as a start that failed, the Line hears gone, and the error is the caller's", async () => {
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
  await assert.rejects(
    voice.startVoice(START, (x) => heard.push(x)),
    /microphone/,
  );
  await tick();
  assert.deepEqual(a.calls.ends, [{ session: "s1", reason: "start" }]);
  assert.deepEqual(heard, [{ t: "gone", reason: "start" }]);
  assert.equal(voice.voiceOn(), false);
});

test("the page moved: the row is told while a conversation runs, and not before or after", async () => {
  const v = vendor();
  const a = api();
  const voice = installVoice(WIN, { api: a, load: v.load });
  const context = { surface: "inbox", rows: [] };
  voice.pageMoved(context);
  assert.deepEqual(a.calls.pages, [], "no conversation, nothing to tell");
  const started = voice.startVoice(START, () => {});
  await tick();
  await tick();
  v.connect();
  await started;
  voice.pageMoved(context);
  await tick();
  assert.deepEqual(a.calls.pages, [{ session: "s1", context }]);
  await voice.stopVoice();
  voice.pageMoved(context);
  await tick();
  assert.equal(a.calls.pages.length, 1);
});
