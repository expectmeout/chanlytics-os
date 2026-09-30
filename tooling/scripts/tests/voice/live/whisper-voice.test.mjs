/**
 * Whispers said aloud, and the signature tried both ways.
 *
 * The owner listens to the call; typing mid-call is the wrong tool. The
 * whisper box gains hold-to-talk: the browser's own speech recogniser
 * transcribes on the device while the button is held, and what was heard is
 * sent as an ordinary text whisper when the button is released. Nothing is
 * recorded or uploaded; browsers without a recogniser show no button.
 *
 * And the webhook signature: the provider's own example verifies
 * JSON.stringify(req.body) — the parsed body re-serialised — not the raw
 * bytes. Every delivery carries an em dash, and encoders escape it
 * differently, so a signature over one form fails over the other with the
 * RIGHT key. Both forms are tried and which one verified is recorded.
 *
 * The whisper box is drawn (apps/dashboard/src/surfaces/live, TSX since decision 0015) on the legacy stub React with a
 * recogniser this test holds; the whisper is the bridge's own verb, run for real over a fetch this test holds.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, textOf } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const call = () => ({
  id: "c-live",
  retell_call_id: "call_abc123def456",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  from_e164: "+16465550123",
  from_raw: null,
  to_e164: "+13055550100",
  started_at: iso(90_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [{ role: "agent", content: "Thank you for calling Harbor Moving!" }],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
});

const flashed = [];
const sent = [];
installLegacyReact({ __DEMO_MODE: false, CHANLY: { nav() {} }, setInterval: () => 1, clearInterval() {} });
const S = "../../../../../apps/dashboard/src";
// The role gate the buttons ask (data-bits.jsx), drawn for real; the toast is this harness's own.
await import(`${S}/legacy/components/data-bits.jsx`);
globalThis.usePPToast = () => [null, (m) => flashed.push(m)];
const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const path = new URL(url, "https://app.chanlytics.com").pathname;
  sent.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify({ ok: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

// The browser's recogniser, as far as the whisper uses it: it hears while it has been started, and it ends after it is stopped.
const made = [];
class Recogniser {
  constructor() {
    made.push(this);
    this.started = 0;
  }
  start() {
    this.started += 1;
  }
  stop() {
    if (this.onend) this.onend();
  }
}
/** What the recogniser has heard so far: settled phrases, then the one still being guessed. */
const heard = (...phrases) => ({ results: phrases.map(([isFinal, transcript]) => ({ isFinal, 0: { transcript } })) });
const hearing = (Which) => {
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  if (Which) Object.assign(globalThis, Which);
  made.length = 0;
  sent.length = 0;
  flashed.length = 0;
  setSurfaceValue("live", toLiveVM([call()], [], ZONE, new Date(NOW)));
  fresh();
};
const mount = () => again(() => LivePage({}));
const until = async (done) => {
  for (let i = 0; i < 400 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(done(), "timed out waiting for the whisper to land");
};
const talk = (tree) => byTestId(tree, "live-whisper-talk");
const box = (tree) => find(byTestId(tree, "live-whisper"), (n) => n.type === "input");
const hint = (tree) => textOf(find(tree, (n) => n.props?.className === "lm-whisper-hint"));
const held = { preventDefault() {} };

test("hold to talk: the browser's recogniser, hidden where it does not exist", () => {
  hearing(null);
  const none = mount();
  assert.equal(talk(none), null, "no button where the browser cannot listen");
  assert.ok(!hint(none).includes("Hold the button and say it, or type it."), "and no promise of one");
  assert.ok(byTestId(none, "live-whisper"), "typing a whisper is still there");
  hearing({ SpeechRecognition: Recogniser });
  const plain = mount();
  assert.ok(talk(plain), "the recogniser the browser names");
  assert.ok(hint(plain).includes("Hold the button and say it, or type it."));
  hearing({ webkitSpeechRecognition: Recogniser });
  assert.ok(talk(mount()), "and the prefixed one, where that is all there is (Safari)");
});

test("hold to talk: the words show as they come, and what was heard is sent as a whisper when the button is let go", async () => {
  hearing({ SpeechRecognition: Recogniser });
  let tree = mount();
  talk(tree).props.onPointerDown(held);
  assert.equal(made.length, 1, "a press starts the recogniser");
  const [rec] = made;
  assert.equal(rec.started, 1);
  assert.equal(rec.interimResults, true, "the owner sees the words as they come");
  assert.equal(rec.continuous, true);
  assert.equal(rec.lang, globalThis.navigator.language || "en-US");
  tree = mount();
  assert.equal(talk(tree).props["aria-pressed"], true);
  assert.match(textOf(talk(tree)), /Listening… let go to send/);
  rec.onresult(heard([false, "tell them we cl"]));
  assert.equal(box(mount()).props.value, "tell them we cl", "the phrase still being guessed shows in the box");
  rec.onresult(heard([true, "tell them we close at seven"]));
  assert.equal(box(mount()).props.value, "tell them we close at seven");
  assert.deepEqual(sent, [], "nothing is sent while the button is held");
  talk(mount()).props.onPointerUp();
  await until(() => flashed.length > 0);
  assert.deepEqual(
    sent,
    [
      {
        method: "POST",
        path: "/api/v1/calls/c-live/whisper",
        body: { text: "tell them we close at seven", trigger: false },
      },
    ],
    "what was heard is sent when the recogniser finishes, as a whisper: no nudge to speak",
  );
  assert.match(textOf(flashed[0].msg), /Whispered — the receptionist works it into its next answer/);
  tree = mount();
  assert.equal(box(tree).props.value, "", "the box is emptied once it is sent");
  assert.match(hint(tree), /Last whispered: “tell them we close at seven”/);
  assert.equal(talk(tree).props["aria-pressed"], false, "and the recogniser has let go");
});

test("hold to talk: a button let go of having heard nothing sends nothing", async () => {
  hearing({ SpeechRecognition: Recogniser });
  talk(mount()).props.onPointerDown(held);
  made[0].onresult(heard([false, "um"]));
  talk(mount()).props.onPointerUp();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(sent, [], "only what the recogniser settled on is sent, never a guess");
  assert.deepEqual(flashed, []);
});

test("hold to talk: a refused microphone is said plainly, and a silence or an abort is not an error", () => {
  hearing({ SpeechRecognition: Recogniser });
  talk(mount()).props.onPointerDown(held);
  made[0].onerror({ error: "not-allowed" });
  assert.equal(flashed.length, 1);
  assert.equal(flashed[0].tone, "warn");
  assert.match(textOf(flashed[0].msg), /needs microphone permission to whisper by voice/);
  assert.equal(talk(mount()).props["aria-pressed"], false, "the button is let go");
  flashed.length = 0;
  for (const error of ["no-speech", "aborted"]) {
    talk(mount()).props.onPointerDown(held);
    made.at(-1).onerror({ error });
  }
  assert.deepEqual(flashed, [], "nothing to say about a phrase that was never spoken");
  talk(mount()).props.onPointerDown(held);
  made.at(-1).onerror({ error: "network" });
  assert.match(textOf(flashed[0].msg), /Couldn’t hear you — try again or type it/);
});
