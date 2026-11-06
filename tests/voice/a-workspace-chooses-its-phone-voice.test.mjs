/**
 * A workspace chooses the voice its calls are answered in (the Settings wiring review, item 11, 18 Oct 2026; contracts
 * voice/phone-voices.ts, settings/business/phone/voice.tsx). The list: the account's own MiniMax voices, the product's
 * among them, each with the provider's sample. The row on How it answers › On calls: the voice the line speaks in, the
 * list in its editor, a sample heard before it is kept, and the save as a key of the profile. What the edge sends with
 * each call is proved where the call starts (call-start.test.mjs, retell-inbound-door.test.mjs).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  PHONE_VOICES,
  PHONE_VOICE_DEFAULT,
  PHONE_VOICE_SAMPLES_ORIGIN,
  PHONE_VOICE_WORDS,
  parseTenantConfigResult,
  phoneVoiceOf,
  phoneVoiceShown,
} from "@chanlytics/contracts";
import { unmount, all, byTestId, textOf, press } from "../_legacy-react.mjs";
import { W, drawTab, marisa, openFold, redrawTab, saveRow, saving } from "../_business-tab-harness.mjs";

after(() => unmount());

test("the list: one provider, the product's voice among it, each id once, each with the provider's own sample", () => {
  const ids = PHONE_VOICES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(PHONE_VOICE_DEFAULT), "the voice every line was provisioned with");
  // MiniMax alone: the product's own voice's provider, so a choice never changes what a call minute costs.
  for (const v of PHONE_VOICES) {
    assert.match(v.id, /^minimax-[A-Z][a-z]+$/, v.id);
    assert.equal(new URL(v.sample).origin, PHONE_VOICE_SAMPLES_ORIGIN, v.id);
    assert.match(v.says, /^(Woman|Man) · /, `${v.id}: what the provider says of it, and nothing more`);
  }
  assert.ok(
    PHONE_VOICES.some((v) => /Mexican/.test(v.says)),
    "a voice for a Spanish-speaking business",
  );
  assert.equal(phoneVoiceOf("minimax-Somebody"), null);
  assert.equal(phoneVoiceShown(undefined).id, PHONE_VOICE_DEFAULT, "none chosen: the product's");
  // A stored id the list no longer holds never makes the config unreadable: the receptionist would go silent.
  const brain = (profile) => ({
    business_name: "Harbor Moving",
    system_prompt: "Answer as the front desk of Harbor Moving.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile,
  });
  assert.equal(parseTenantConfigResult({ brain: brain({}) }).ok, true, "the fixture parses");
  const retired = parseTenantConfigResult({ brain: brain({ phone_voice: "minimax-Retired" }) });
  assert.equal(retired.ok, true);
  assert.equal(
    retired.config.brain.profile.phone_voice,
    "minimax-Retired",
    "kept as stored; the edge sends none for it",
  );
});

/** The combobox the editor draws, as the kit's component: its onChange is a pick. */
const picker = (tree) => all(tree, (n) => typeof n.type === "function" && n.props?.testid === "rec-voice-pick")[0];

test("On calls says the voice the line speaks in, and a voice picked and saved is a key of the profile, said in its name", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  const row = byTestId(byTestId(tree, "rec-card-calls"), "rec-row-phone_voice");
  assert.match(textOf(row), /Tamsin · Woman · American/, "none chosen: the product's, as the provider describes it");
  openFold(tree, "phone_voice");
  tree = redrawTab(flash);
  assert.deepEqual(
    picker(tree).props.options.map((o) => o.value),
    PHONE_VOICES.map((v) => v.id),
    "the list, in its order",
  );
  picker(tree).props.onChange("minimax-Claudia");
  tree = redrawTab(flash);
  saveRow(tree, "phone_voice");
  assert.equal(sent.length, 1);
  const expected = structuredClone(stored);
  expected.brain.profile.phone_voice = "minimax-Claudia";
  assert.deepEqual(sent[0].config, expected, "the voice, and everything beside it kept");
  assert.equal(String(flashes.at(-1).msg), PHONE_VOICE_WORDS.saved("Claudia"));
});

test("the chosen voice's sample is heard before it is kept, one at a time, and stops when another is chosen", () => {
  const made = [];
  const was = globalThis.Audio;
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      this.paused = true;
      made.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  };
  try {
    let tree = drawTab({ profile: { ...marisa, phone_voice: "minimax-Nico" } });
    openFold(tree, "phone_voice");
    tree = redrawTab();
    const hear = () => byTestId(tree, "rec-voice-sample");
    assert.equal(textOf(hear()).trim(), PHONE_VOICE_WORDS.listen("Nico"));
    press(hear());
    tree = redrawTab();
    assert.deepEqual(
      made.map((a) => [a.src, a.paused]),
      [[phoneVoiceOf("minimax-Nico").sample, false]],
    );
    assert.equal(textOf(hear()).trim(), PHONE_VOICE_WORDS.stop);
    press(hear());
    tree = redrawTab();
    assert.equal(made[0].paused, true, "Stop stops it");
    assert.equal(textOf(hear()).trim(), PHONE_VOICE_WORDS.listen("Nico"));
  } finally {
    globalThis.Audio = was;
  }
});
