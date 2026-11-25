/**
 * Today in Glass (canvas E3).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { byTestId, textOf, press } from "../../_stub-react.mjs";
import {
  FoundOnToday,
  W,
  block,
  broadcasts,
  busy,
  calendar,
  clear,
  draw,
  failed,
  headListen,
  headSaid,
  headSentence,
  headline,
  holdAsk,
  people,
  set,
  settled,
  speechStub,
} from "./_page.mjs";

/* ------------------------------------ Glass (canvas E3) ------------------------------------ */

// Glass is the one look since Classic retired (the plan's step 5.7, 2 October 2026): what the review of Today against E3
// (1 October 2026) gave it is what the page draws, with no stamp on the document to ask for: the queue's foot whatever
// was cut and one verb a row, the bell's rows without a dismiss, Listen where the device can speak (in the head's sentence
// since the redesign of 1 Nov 2026), and the bento, with the day beside the work since then.
test("the head: Listen is absent where the device cannot play audio, and the sentence stands alone", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const said = headSaid(true);
  assert.equal(said.beside, undefined, "no voice on this device: nothing beside the greeting");
  assert.ok(byTestId(said.sentence, "today-head-lead"), "the sentence stands alone");
});

test("the head's Listen reads the brief's words in AI's voice, says it is getting the voice until the clip plays, Stop while it does, and a second press stops it", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    const listen = headListen(true);
    assert.ok(listen, "a voice: Listen, beside the greeting");
    assert.match(textOf(listen), /Listen\d+:\d\d/, "with how long it takes to hear");
    press(listen);
    assert.equal(s.spoken.length, 1, "one clip asked for");
    // The brief's words: who needs you first, and what the page says under the head of its own, which a voice read
    // aloud would leave out: a reply that failed to deliver (contracts todayBriefWords).
    assert.match(s.spoken[0].text, /^Ana Reyes needs you/);
    assert.match(s.spoken[0].text, /didn't reach them/);
    assert.equal(s.spoken[0].purpose, "brief");
    const loading = headListen();
    assert.match(loading.props["aria-label"], /Getting AI's voice/, "getting the voice until the clip plays");
    assert.equal(loading.props["aria-busy"], true);
    assert.equal(textOf(loading), textOf(listen), "its words as they were, so nothing beside it moves");
    s.land();
    await settled();
    assert.equal(headListen(), null, "it plays: the header's capsule has it, whose press is the Stop (BriefPlaying)");
    s.stub.stopSpeaking();
    assert.ok(headListen(), "stopped, Listen is back");
    assert.equal(s.spoken.length, 1, "and asked for nothing more");
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a mouse gone down on it asks for the brief's clips before the click lands; a finger going down, which may be a scroll beginning, asks nothing, nor does a press on Stop, nor a bridge that does not warm", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  const warmed = [];
  s.stub.warmSpeech = (text, purpose) => warmed.push({ text, purpose });
  holdAsk(s.stub);
  try {
    const listen = headListen(true);
    listen.props.onPointerDown({ pointerType: "touch", button: 0 });
    listen.props.onPointerDown({ pointerType: "mouse", button: 2 });
    assert.deepEqual(warmed, [], "a touch, or the mouse's other button, asks nothing");
    listen.props.onPointerDown({ pointerType: "mouse", button: 0 });
    assert.equal(warmed.length, 1);
    assert.equal(warmed[0].purpose, "brief");
    assert.match(warmed[0].text, /^Ana Reyes needs you/, "the words the click will read");
    assert.equal(s.spoken.length, 0, "nothing read: that is the click's");
    // While it fetches, a press going down on it asks for nothing more.
    press(listen);
    headListen().props.onPointerDown({ pointerType: "mouse", button: 0 });
    assert.equal(warmed.length, 1);
    // A bridge from before the warm: the press still reads, and the pointer going down breaks nothing.
    delete s.stub.warmSpeech;
    s.stub.stopSpeaking();
    const older = headListen();
    assert.doesNotThrow(() => older.props.onPointerDown({ pointerType: "mouse", button: 0 }));
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a clip that could not be made says why beside it, in the server's words, and nothing else speaks; the next press tries again", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    s.fail("Voice is off while this workspace is paused or its plan has ended.");
    await settled();
    const sentence = headSentence();
    const listen = headListen();
    assert.equal(listen.props["data-state"], "idle", "back to Listen");
    assert.match(textOf(listen), /^Listen/, "and it says Listen, not Stop");
    const why = byTestId(sentence, "today-listen-why");
    assert.ok(why, "why, beside the button");
    assert.match(textOf(why), /paused or its plan has ended/, "in the server's words");
    assert.equal(s.stops.length, 0, "nothing to stop");
    assert.equal("speechSynthesis" in W && W.speechSynthesis, false, "the browser's own voice is not asked");
    press(listen);
    assert.equal(s.spoken.length, 2, "the next press tries again");
    assert.equal(byTestId(headSentence(), "today-listen-why"), null, "and the old reason is gone");
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a head said again while the clip plays (Today redrew itself) says Stop and stops nothing; the clip ending on its own lets go", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    s.land();
    await settled();
    // Today redraws from nothing (its data moved): a fresh head finds the clip playing and says Stop.
    const redrawn = headListen(true);
    assert.equal(redrawn, null, "a head said again finds the clip playing: the capsule has it");
    assert.equal(s.stops.length, 0, "and stops nothing");
    s.ends();
    assert.ok(headListen(), "the clip ending brings Listen back");
  } finally {
    holdAsk(undefined);
  }
});

test("Listen reads the brief: who needs you with the oldest wait, the calendar's day, what came in, the run waiting", () => {
  clear();
  set({
    today: busy(),
    headline: headline(),
    __BROADCASTS: broadcasts(),
    calendar: calendar([block("b17", 17, "Color", { id: "p1", name: "Dulce Amaro" })]),
  });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    const said = s.spoken[0].text;
    // Who needs you first: Ana's handoff is the queue's one person waiting (busy()), and the headline's detail about her
    // wait folds into the same sentence rather than naming her twice.
    assert.match(said, /^Ana Reyes needs you, waiting since \d/, said);
    assert.ok(!said.includes("Ana Reyes has been waiting"), `said once: ${said}`);
    // The call worth a listen, then the day: one appointment to come, with whom, and when.
    assert.match(said, /One call is worth a listen\. 1 appointment today: next is Dulce Amaro at /, said);
    // Then what came in (the recap's line), then the run waiting for a word.
    assert.ok(said.includes(busy().recap.line), said);
    assert.match(said, /Win-back is waiting for your approval: .*Waits for you to approve until the end/, said);
  } finally {
    holdAsk(undefined);
  }
});

// LAST in the file: a surface's failure cannot be taken back (surface-status.ts has no reset), so every test above saw the headline unfailed.
test("a headline whose read failed says so in what AI found, which stands on it; one that landed clears it; People's too", async () => {
  const { setStatus } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");
  clear();
  set({ today: busy(), headline: undefined, __PEOPLE: people() });
  setStatus("reports_headline", "seeded");
  const broke = draw(FoundOnToday);
  assert.match(textOf(byTestId(broke, "today-found-failed")), /Couldn't read Reports/);
  // The shell's door maps its argument through the routes' surfaces and knows no `reports_headline`: it says nothing of this one.
  assert.equal(failed.has("reports_headline"), false, "the page does not ask the stand-in");
  set({ headline: headline() });
  setStatus("reports_headline", "live");
  assert.equal(byTestId(draw(FoundOnToday), "today-found-failed"), null, "a headline that landed is not failed");
  // People that could not be read: AI found's rules stand on it, so it says so in its place rather than ranking nothing
  // as if nothing were worth a look; nothing else on the page says it. Read through the seam's status, never the shell's
  // route door, which knows People as `clients`.
  set({ __PEOPLE: undefined });
  setStatus("people", "seeded");
  assert.match(textOf(byTestId(draw(FoundOnToday), "today-found-failed")), /Couldn't read People/);
  assert.equal(failed.has("people"), false, "the page does not ask the stand-in");
  set({ __PEOPLE: people() });
  setStatus("people", "live");
  assert.equal(byTestId(draw(FoundOnToday), "today-found-failed"), null, "People read: nothing to say");
});
