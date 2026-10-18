/**
 * Ask changes every row of How it answers (the Settings wiring review, item 14, 18 Oct 2026; contracts
 * ask/ask-settings-change.ts, the `answers` action of propose_settings): its voice, the languages, what callers hear
 * first and in which voice, who they reach, words added to the owner's own, the three messages and the photo switch.
 * Until then a card could close a day, change the hours, add a note or a service, and nothing else on that page. Each
 * card writes what the row's own save writes, opens on that row, and is refused in the row's own words.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ASK_ANSWERS_ROWS,
  AskSettingsChangeSchema,
  FALLBACK_DEFAULTS,
  GREETING_TEMPLATE,
  PHONE_VOICES,
  PROPOSAL_SPECS,
  VISION_SWITCH_WORDS,
  applySettingsChange,
  describeSettingsChange,
  newReceptionistDefaults,
} from "@chanlytics/contracts";
import { unmount, all } from "../_legacy-react.mjs";
import { W, drawTab, marisa, openFold, redrawTab, saveRow, saving, typeInto } from "../_business-tab-harness.mjs";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { paneOfRow } = await import(at("apps/dashboard/src/surfaces/settings/frame/tabs.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

after(() => unmount());

const S = W.__businessTabSave;
/** The record as the tab draws it, before anything is saved. */
const stored = () => {
  drawTab();
  return structuredClone(W.__SETTINGS.config);
};

test("each card opens How it answers on the row it changes, and the rest of Settings' cards where they did", () => {
  const open = (change) => PROPOSAL_SPECS.settings.open({ payload: { change } }, null);
  for (const [op, row] of Object.entries(ASK_ANSWERS_ROWS)) {
    if (!row) continue;
    assert.equal(paneOfRow(row), "receptionist", `${op}: ${row} is a row of How it answers`);
    assert.equal(open({ op }), `admin/receptionist/${row}`, op);
  }
  // The photo switch is a line of What it can do, which is no row: the page itself.
  assert.equal(open({ op: "set_photos", on: true }), "admin/receptionist");
  assert.equal(open({ op: "add_closure", date: "2026-12-24" }), "admin/workspace");
  assert.equal(open({ op: "set_goal", goal: "x" }), "admin/workspace");
});

test("a card writes what the row's own save writes: its voice, the languages, the greeting, words added and a message", () => {
  const base = stored();
  const same = (fold, draft, change, why) =>
    assert.deepEqual(applySettingsChange(base, change), S.saveFold(fold, base, draft), why ?? change.op);
  same("tone", "Bright, and quick to the point.", { op: "set_tone", tone: "Bright, and quick to the point." });
  same("tone", "", { op: "set_tone", tone: "  " }, "emptied, it has no voice of its own");
  same("languages", ["English", "Spanish", "Portuguese"], {
    op: "set_languages",
    languages: ["English", " Spanish", "Portuguese", "English"],
  });
  same("languages", [], { op: "set_languages", languages: [] }, "none");
  same("phone_greeting", "Hi, {business}! I'm the virtual assistant.", {
    op: "set_phone_greeting",
    greeting: " Hi, {business}! I'm the virtual assistant. ",
  });
  same("phone_greeting", "", { op: "set_phone_greeting", greeting: "" }, "the standard greeting");
  // Words added: what the box opens with, then the new words, as an owner typing at its end would save them.
  const own = S.draftOf("extra_instructions", base);
  same(
    "extra_instructions",
    { ...own, text: `${own.text}\n\nParking is behind the building.` },
    { op: "add_own_words", text: "Parking is behind the building." },
  );
  const messages = S.draftOf("fallbacks", base);
  same(
    "fallbacks",
    { ...messages, error: "Sorry, a person will reply here soon." },
    { op: "set_message", which: "error", text: "Sorry, a person will reply here soon." },
  );
  same(
    "fallbacks",
    { ...messages, non_text: FALLBACK_DEFAULTS.non_text },
    { op: "set_message", which: "non_text", text: "" },
    "emptied, the product's wording",
  );
});

test("words added to a prompt written before the form keep it, as the owner's own, and the prompt is the product's lines again", () => {
  // A workspace whose receptionist runs on a prompt written by hand: the box opens with it, marked carried.
  drawTab({ profile: {}, brain: { system_prompt: "Answer as the front desk: brief and warm." } });
  const base = structuredClone(W.__SETTINGS.config);
  const next = applySettingsChange(base, { op: "add_own_words", text: "Parking is behind the building." });
  assert.equal(
    next.brain.profile.extra_instructions,
    "Answer as the front desk: brief and warm.\n\nParking is behind the building.",
    "nothing it followed is lost",
  );
  assert.equal(next.brain.system_prompt, newReceptionistDefaults(base.brain.business_name).system_prompt);
  const own = S.draftOf("extra_instructions", base);
  assert.equal(own.carried, true);
  assert.deepEqual(
    next,
    S.saveFold("extra_instructions", base, { ...own, text: next.brain.profile.extra_instructions }),
  );
});

/** The combobox the voice row's editor draws: its onChange is a pick. */
const picker = (tree) => all(tree, (n) => typeof n.type === "function" && n.props?.testid === "rec-voice-pick")[0];

test("the voice callers hear and who they reach: a card writes what the row's own save sends", () => {
  let sent = saving();
  let tree = drawTab();
  const base = structuredClone(W.__SETTINGS.config);
  openFold(tree, "phone_voice");
  tree = redrawTab();
  picker(tree).props.onChange("minimax-Claudia");
  tree = redrawTab();
  saveRow(tree, "phone_voice");
  assert.deepEqual(sent[0].config, applySettingsChange(base, { op: "set_phone_voice", voice: "minimax-Claudia" }));

  sent = saving();
  tree = drawTab();
  openFold(tree, "handoff_number");
  tree = redrawTab();
  typeInto(tree, "handoff_number", "+1 (212) 555-0143");
  tree = redrawTab();
  saveRow(tree, "handoff_number");
  assert.deepEqual(
    sent[0].config,
    applySettingsChange(base, { op: "set_transfer_number", number: "+1 (212) 555-0143" }),
    "stored as E.164",
  );
  assert.equal(sent[0].config.brain.profile.handoff_number, "+12125550143");
  // Emptied, it takes a message: the key is gone, as the row's own save leaves it.
  const none = applySettingsChange(
    { ...base, brain: { ...base.brain, profile: { ...marisa, handoff_number: "+12125550143" } } },
    { op: "set_transfer_number", number: "" },
  );
  assert.equal("handoff_number" in none.brain.profile, false);
});

test("the photo switch is the feature What it can do's switch writes, everything beside it kept", () => {
  const base = stored();
  const on = applySettingsChange(base, { op: "set_photos", on: true });
  assert.deepEqual(on, { ...base, features: { ...(base.features || {}), vision: true } });
  assert.equal(applySettingsChange(on, { op: "set_photos", on: false }).features.vision, false);
  assert.equal(describeSettingsChange({ op: "set_photos", on: true }), VISION_SWITCH_WORDS.saved(true));
});

test("each card's line says the row as it will be, in the row's words", () => {
  const said = (change) => describeSettingsChange(change);
  assert.equal(said({ op: "set_tone", tone: "Warm and unhurried." }), "Its voice: “Warm and unhurried.”");
  assert.equal(said({ op: "set_languages", languages: ["English", "Spanish"] }), "It speaks English, Spanish");
  assert.equal(said({ op: "set_phone_greeting", greeting: "" }), "Callers hear the standard greeting");
  assert.equal(
    said({ op: "set_phone_voice", voice: "minimax-Claudia" }),
    "Callers hear Claudia (Woman · Mexican) from their next call",
  );
  assert.equal(
    said({ op: "set_transfer_number", number: "+12125550143" }),
    "Callers who insist on a person reach +1 (212) 555-0143",
  );
  assert.equal(said({ op: "set_transfer_number", number: "" }), "Callers who insist on a person leave a message");
  assert.equal(
    said({ op: "set_message", which: "non_text", text: "" }),
    "When it got something it can't read: the product's wording",
  );
  assert.match(said({ op: "add_own_words", text: "Parking is behind the building." }), /^Added to your own words: “/);
});

test("what a row refuses, its card refuses, in the row's words, before anything is proposed", () => {
  const refused = (change) => {
    const r = AskSettingsChangeSchema.safeParse(change);
    assert.equal(r.success, false, JSON.stringify(change));
    return r.error.issues.map((i) => i.message).join("; ");
  };
  assert.match(
    refused({ op: "set_transfer_number", number: "212 555 0143" }),
    /needs the country code/,
    "whyNotAHandoff's sentence",
  );
  assert.match(refused({ op: "set_phone_voice", voice: "minimax-Somebody" }), /not one of the phone voices/);
  refused({ op: "set_languages", languages: Array.from({ length: 9 }, (_, i) => `Language ${i}`) });
  refused({ op: "add_own_words", text: "   " });
  refused({ op: "set_message", which: "goodbye", text: "Bye" });
  // And each of the eight passes as the tool sends it.
  for (const change of [
    { op: "set_tone", tone: "" },
    { op: "set_languages", languages: ["English"] },
    { op: "set_phone_greeting", greeting: "" },
    { op: "set_phone_voice", voice: PHONE_VOICES[0].id },
    { op: "set_transfer_number", number: "" },
    { op: "add_own_words", text: "Parking is behind the building." },
    { op: "set_message", which: "greeting", text: "" },
    { op: "set_photos", on: false },
  ])
    assert.equal(AskSettingsChangeSchema.safeParse(change).success, true, change.op);
  assert.deepEqual(Object.keys(ASK_ANSWERS_ROWS).sort(), [
    "add_own_words",
    "set_languages",
    "set_message",
    "set_phone_greeting",
    "set_phone_voice",
    "set_photos",
    "set_tone",
    "set_transfer_number",
  ]);
});

test("Ask proposes each by its action answers, a voice by the name an owner says, reading nothing, and an operator is offered none", async () => {
  const contextFor = (role) => {
    const supabase = fakeDb({}, {}, {});
    const t = newToolContext(
      { supabase, userId: "u1", email: "ada@example.com", params: {} },
      "11111111-1111-4111-8111-111111111111",
      role,
      "America/New_York",
      new Date("2026-10-18T15:00:00Z"),
    );
    return { supabase, t };
  };
  const { supabase, t } = contextFor("owner");
  const card = async (row) => {
    const out = await buildProposal(t, "propose_settings", { action: "answers", row });
    assert.equal(out.isError, false, out.result);
    return out.proposal;
  };
  const voice = await card({ op: "set_phone_voice", voice: "claudia" });
  assert.deepEqual(voice.payload.change, { op: "set_phone_voice", voice: "minimax-Claudia" });
  assert.equal(voice.title, "The voice callers hear");
  assert.equal(voice.summary, describeSettingsChange(voice.payload.change));
  // An emptied row is a change: the standard greeting, a message instead of a transfer.
  assert.deepEqual((await card({ op: "set_phone_greeting", greeting: "" })).payload.change, {
    op: "set_phone_greeting",
    greeting: "",
  });
  // The standard line typed out is the standard line, stored as none, as the row's own save stores it.
  assert.deepEqual((await card({ op: "set_phone_greeting", greeting: ` ${GREETING_TEMPLATE} ` })).payload.change, {
    op: "set_phone_greeting",
    greeting: "",
  });
  const base = stored();
  assert.deepEqual(
    applySettingsChange(base, { op: "set_phone_greeting", greeting: "" }),
    S.saveFold("phone_greeting", base, GREETING_TEMPLATE),
  );
  assert.deepEqual((await card({ op: "set_photos", on: true })).payload.change, { op: "set_photos", on: true });
  assert.deepEqual(supabase.seen, [], "a card reads nothing");
  const refused = await buildProposal(t, "propose_settings", {
    action: "answers",
    row: { op: "set_transfer_number", number: "555 0143" },
  });
  assert.equal(refused.isError, true);
  assert.match(JSON.parse(refused.result).error, /needs the country code/);
  // Below the settings card's role, the action is refused before its handler runs.
  const below = await buildProposal(contextFor("operator").t, "propose_settings", {
    action: "answers",
    row: { op: "set_photos", on: true },
  });
  assert.equal(below.isError, true);
});
