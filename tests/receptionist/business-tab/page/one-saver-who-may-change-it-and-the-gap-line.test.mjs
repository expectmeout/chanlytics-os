/**
 * The Business tab's one saver, who may change it, and the gap line's door.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { businessGap, roleGate, newReceptionistDefaults, hasProfile } from "@chanlytics/contracts";
import { PROFILE_CROSSING_WORDS } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import { again, unmount, remount, settle, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import {
  boxOf,
  cancelFoldOf,
  cancelRow,
  composed,
  drawTab,
  escape,
  factsHeld,
  foldOf,
  inline,
  KNOWN,
  labelled,
  landSettings,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  partsOf,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settings,
  settingsHeld,
  typeAt,
  typeInto,
  W,
  without,
} from "../../../_business-tab-harness.mjs";
import { disputed, drawCreateCard, google, holding, useOn } from "./_page.mjs";
import { bridgeHolds, provided } from "../../../shell/_bridge-holds.mjs";

test("two saves close together go one after the other, the second on the first's answer, and neither is refused", () => {
  // The reviewer's case: each row saved on the version the page last drew, so the second press sent version 7 again
  // and the server refused it as someone else's save.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, ...disputed() });
  useOn(tree, "address");
  tree = redrawTab(flash);
  useOn(tree, "name");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "in order, each on the version before it",
  );
  assert.equal(sent[1].config.brain.profile.address, google, "the second carries the first's change");
  assert.equal(sent[1].config.brain.business_name, "Marisa's Salon & Spa");
  assert.deepEqual(
    flashes.map((f) => f.tone || "ok"),
    ["ok", "ok"],
    "neither is refused",
  );

  // Pressed again before the settings read brings the change back, the address press would write what is there now.
  tree = redrawTab(flash);
  useOn(tree, "address");
  assert.equal(sent.length, 2, "a patch that would change nothing is not sent");
});

test("a save made while another is out waits its turn, and its row says it is saving meanwhile", () => {
  const sent = [];
  const held = [];
  bridgeHolds({
    parts: {
      saveSettings: (config, v, accepted) => {
        sent.push({ config: structuredClone(config), version: v });
        return new Promise(() => {
          held.push(() => accepted({ config: structuredClone(config), version: v + 1 }));
        });
      },
    },
  });
  let tree = drawTab(disputed());
  useOn(tree, "address");
  tree = redrawTab();
  useOn(tree, "name");
  tree = redrawTab();
  assert.equal(sent.length, 1, "the second waits while the first is out");
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-inline-save-website").props["aria-busy"],
    true,
    "a row whose save waits its turn says it is saving",
  );
  held[0]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "the first taken, the next goes on its answer",
  );
  held[1]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8, 9],
  );
  assert.equal(sent[2].config.brain.profile.website, "https://marisas.example");
  assert.equal(sent[2].config.brain.business_name, "Marisa's Salon & Spa", "every change before it, carried");
  assert.equal(sent[2].config.brain.profile.address, google);
});

test("a patch that edits a nested object in place is still sent, and the settings read keeps what the server holds", () => {
  // Task 3.2's review. A patch was handed shallow copies, so one that changed a nested object in place
  // (p.booking_rules.lead_hours = 5) changed the config it was compared with too: the saver found nothing to send, the
  // row closed as if saved, and the settings read showed a value no server held.
  const sent = saving();
  const flashes = [];
  drawTab();
  const stored = structuredClone(settingsHeld().config);
  const inPlace = (b, p) => {
    p.booking_rules.lead_hours = 5;
    b.profile = p;
    return b;
  };
  let closed = 0;
  W.__businessTabSave.saver.save({
    row: "booking_rules",
    change: inPlace,
    said: "Saved",
    done: () => {
      closed += 1;
    },
    flash: (f) => flashes.push(f),
  });
  assert.equal(sent.length, 1, "sent, where it once compared equal to what it changed and nothing went");
  const rules = { ...stored.brain.profile.booking_rules, lead_hours: 5 };
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, booking_rules: rules } },
  });
  assert.deepEqual(settingsHeld().config, stored, "and the read is what the server held, not the unsaved value");
  assert.deepEqual([closed, flashes.map((f) => f.tone || "ok")], [1, ["ok"]]);

  // What a row will say is worked out on the same copy (patched), so its preview leaves the read alone too.
  const next = W.__businessTabSave.patched(settingsHeld().config, { change: inPlace });
  assert.equal(next.brain.profile.booking_rules.lead_hours, 5);
  assert.deepEqual(settingsHeld().config, stored, "the config a patch is applied to is never the one it changes");
});

test("a page drawn again finds the tab's one saver: the answer to the last save, and a save still waiting its turn", () => {
  // Task 3.2's review (its Minor 7). Each page held a saver of its own, so leaving the tab and coming back before the
  // settings read brought a save back drew a new page with a new saver on the old read: the next save went out on
  // version 7 again, and the server refused it as someone else's.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, ...disputed() });
  useOn(tree, "address");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7],
  );
  // Another Settings tab, and back: the page goes, and a new one is drawn over the same settings read.
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash });
  useOn(tree, "name");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "on the answer the server gave the first, not the read before it",
  );
  assert.equal(sent[1].config.brain.profile.address, google, "carrying the first's change");
  assert.deepEqual(
    flashes.map((f) => f.tone || "ok"),
    ["ok", "ok"],
    "neither is refused",
  );

  // A save waiting its turn when the page goes is the new page's too: its row says so, and it goes when its turn comes.
  const held = [];
  bridgeHolds({
    parts: {
      saveSettings: (config, v, accepted) => {
        sent.push({ config: structuredClone(config), version: v });
        return new Promise(() => {
          held.push(() => accepted({ config: structuredClone(config), version: v + 1 }));
        });
      },
    },
  });
  tree = drawTab(disputed());
  sent.length = 0;
  useOn(tree, "address");
  tree = redrawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  assert.equal(sent.length, 1, "the website waits while the address is out");
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
  assert.equal(
    byTestId(tree, "rec-inline-save-website").props["aria-busy"],
    true,
    "the new page's row says it is saving",
  );
  held[0]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "and it goes on the first's answer when the first is taken",
  );
  assert.equal(sent[1].config.brain.profile.website, "https://marisas.example");
});

test("the saver's base is the config the next save goes on: the read, with each save out or waiting applied as if taken", async () => {
  const S = W.__businessTabSave;
  const sent = holding();
  drawTab();
  const read = settingsHeld().config;
  const stored = structuredClone(read);
  assert.equal(S.saver.base(), read, "nothing out: what the settings read holds");
  const job = (row, change) => ({ row, change, said: "Saved", done: () => {}, flash: () => {} });
  S.saver.save(job("address", S.PATCH_OF.address("10 Pier St")));
  S.saver.save(job("website", S.PATCH_OF.website("")));
  assert.equal(sent.length, 1, "one out, one waiting");
  const both = S.saver.base();
  assert.equal(both.brain.profile.address, "10 Pier St", "the save out, as if taken");
  assert.equal("website" in both.brain.profile, false, "and the one waiting its turn after it");
  assert.equal(S.saver.base(), both, "the same config while nothing moves, so what a row will say is worked out once");
  assert.deepEqual(read, stored, "and the read is left as it was");

  // Refused, a save drops out of the base: the next goes on what the server holds.
  sent[0].answer({
    ok: false,
    code: "conflict",
    message: "Someone else saved settings after you loaded them — reload and reapply.",
  });
  await settle();
  assert.equal(sent.length, 2, "the website's turn");
  assert.equal(S.saver.base().brain.profile.address, stored.brain.profile.address, "the refused address is not in it");
  assert.equal("website" in S.saver.base().brain.profile, false);
  // Taken, the server's answer is the base, until a newer read.
  sent[1].accept();
  assert.equal(S.saver.base().brain.profile.address, stored.brain.profile.address);
  assert.equal("website" in S.saver.base().brain.profile, false, "the answer, before the re-read brings it back");
});

test("what a row will say is worked out on the brain its save goes on: a save still out, or taken and not read back", async () => {
  // Task 3.2's review, and its probe. What a row would say, and whether it crossed the resolver's line, were worked
  // out on the settings read, while the saver applies each patch to the config the saves before it leave. With the
  // website's save still out, emptying the address said nothing of the line it crossed, and its save, landing on a
  // record with no website, stopped the prompt composing.
  const bare = {
    handoff_number: "+16465550100",
    booking_rules: { lead_hours: 2 },
    guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  };
  const sparse = { ...bare, website: "https://bella.example", address: "12 Main St, Brooklyn, NY" };
  assert.deepEqual(
    [hasProfile(sparse), hasProfile({ ...bare, address: sparse.address }), hasProfile(bare)],
    [true, true, false],
    "only the website and the address compose",
  );

  const empty = (tree, row) => {
    openFold(tree, row);
    tree = redrawTab();
    typeInto(tree, row, "");
    return redrawTab();
  };
  // Still out. The website's save goes through the tab's saver as its row sends it, with no editor of its own open: a
  // row whose save is out keeps every other row shut until its answer comes (a save in progress, below), so a save
  // out under another row's open editor is one sent from a page since drawn again, or by one press on a row.
  const S = W.__businessTabSave;
  const out = (row, value) =>
    S.saver.save({ row, change: S.PATCH_OF[row](value), said: "Saved", done: () => {}, flash: () => {} });
  let sent = holding();
  let tree = drawTab({ profile: sparse, resolved: KNOWN });
  tree = empty(tree, "website");
  assert.equal(
    byTestId(tree, "rec-inline-says-website-note"),
    null,
    "the address still composes: emptying the website crosses nothing",
  );
  cancelRow(tree, "website");
  redrawTab();
  out("website", "");
  assert.equal(sent.length, 1);
  tree = redrawTab();
  tree = empty(tree, "address");
  assert.equal(
    textOf(byTestId(tree, "rec-inline-says-address-note")),
    PROFILE_CROSSING_WORDS.stops,
    "said before the address's save goes",
  );
  saveRow(tree, "address");
  sent[0].accept();
  assert.equal(sent.length, 2);
  assert.equal(hasProfile(sent[1].config.brain.profile), false, "which is what its save did");

  // Taken, and not read back yet: the saver goes on the server's answer, and so does what the next row will say.
  sent = saving();
  tree = drawTab({ profile: sparse, resolved: KNOWN });
  tree = empty(tree, "website");
  saveRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "taken: its editor closed");
  tree = empty(tree, "address");
  assert.equal(textOf(byTestId(tree, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.stops);
  saveRow(tree, "address");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
  );
  assert.equal(hasProfile(sent[1].config.brain.profile), false);

  // And the other way: with the first field's save out, the second is not said to start what the first already has.
  holding();
  tree = drawTab({ profile: bare, resolved: KNOWN });
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://bella.example");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-inline-says-website-note")), PROFILE_CROSSING_WORDS.starts);
  cancelRow(tree, "website");
  redrawTab();
  out("website", "https://bella.example");
  tree = redrawTab();
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "12 Main St, Brooklyn, NY");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-inline-says-address"), "it says the address line it adds");
  assert.equal(
    byTestId(tree, "rec-inline-says-address-note"),
    null,
    "and nothing of a line the website's save already crossed",
  );
  await settle();
});

test("a rename made on top of another is told against the name that one saves, and waits for it", () => {
  // The Name row's blocks, and the product's own lines it writes again, are read on the saver's base too: with Google's
  // name taken and not read back yet, a second rename replaces that name, not the one the page was drawn with. And
  // while Google's name is still out, the row's own save is: its editor opens, takes no typing, and its Save waits.
  const was = "Marisa's Beauty Salon";
  const google = "Marisa's Salon & Spa";
  const now = "Marisa's Studio";
  const baselineOf = (name) => newReceptionistDefaults(name).system_prompt;
  const naming = (brain, name) =>
    [
      ...composed("business_name", brain).filter((l) => l.includes(name)),
      ...composed("system_prompt", brain).filter((l) => l.includes(name)),
    ].join("\n");
  const sent = holding();
  let tree = drawTab({
    brain: { system_prompt: baselineOf(was) },
    resolved: { ...KNOWN, listing: { name: google, address: null } },
  });
  const stored = settingsHeld().config.brain;
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.equal(sent.length, 1, "Google's name is out");
  tree = redrawTab();
  openFold(tree, "name");
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-inline-save-name").props["aria-busy"],
    true,
    "the row's own name is out, so its Save waits",
  );
  assert.equal(boxOf(tree, "name").props.readOnly, true, "and its box takes no typing meanwhile");
  typeInto(tree, "name", now);
  tree = redrawTab();
  assert.equal(
    boxOf(tree, "name").props.value,
    was,
    "nothing typed under a save that is out is held, to be dropped when it lands",
  );
  sent[0].accept();
  tree = redrawTab();
  assert.equal(boxOf(tree, "name").props.readOnly, undefined, "taken, the box is the person's again");
  typeInto(tree, "name", now);
  tree = redrawTab();
  const saving = { ...stored, business_name: google, system_prompt: baselineOf(google) };
  const after = { ...stored, business_name: now, system_prompt: baselineOf(now) };
  assert.equal(naming(after, now).split("\n").length, 2, "the line it opens with, and the product's lines");
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-name")), [
    ["It will say", naming(after, now)],
    ["It will no longer say", naming(saving, google)],
  ]);
  assert.equal(naming(stored, was).split("\n").length, 2);
  assert.doesNotMatch(
    textOf(byTestId(tree, "rec-inline-says-name")),
    new RegExp(escape(was)),
    "the name the page was drawn with is already going",
  );
  saveRow(tree, "name");
  assert.deepEqual(sent[1].config.brain, after, "and the save writes what it said");
});

test("a save of the name says what the sign-up page and sign say now, and where the carriers hold the filed name, offers to ask for it to change (X4-5)", async () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // The server's answer to the save, with what the save did to the workspace's name (settings-save.ts renamedWith).
  const answering = (renamed) => {
    let version = settingsHeld().version;
    bridgeHolds({
      parts: {
        saveSettings: (config, _v, accepted) => {
          version += 1;
          accepted({ config: structuredClone(config), version, ...(renamed ? { renamed } : {}) });
          return new Promise(() => {});
        },
      },
    });
  };
  const rename = (to) => {
    let tree = drawTab({ flash });
    openFold(tree, "name");
    tree = redrawTab(flash);
    typeInto(tree, "name", to);
    saveRow(redrawTab(flash), "name");
    return flashes.at(-1);
  };

  answering({ from: "Marisa's Beauty Salon", to: "Marisa's Salon & Spa", carriers_hold: null });
  const plain = rename("Marisa's Salon & Spa");
  assert.equal(
    textOf(plain.msg),
    "Your sign-up page, its paper form and your desk sign say “Marisa's Salon & Spa” now.",
  );
  assert.equal(plain.action ?? null, null, "nothing held apart: nothing to ask for");

  answering({ from: "Marisa's Beauty Salon", to: "Marisa's Salon & Spa", carriers_hold: "Marisa's Beauty Salon" });
  const held = rename("Marisa's Salon & Spa");
  assert.match(
    textOf(held.msg),
    /say “Marisa's Salon & Spa” now\. The phone networks still hold “Marisa's Beauty Salon”/,
  );
  assert.equal(held.action.label, "Request a name change");

  // The press asks a person at Chanlytics (setup_request 'name') through Setup's verb, which the card imports
  // (surfaces/setup/surface.ts), and says what was asked.
  const asked = [];
  const { setupVerbs } = await import("../../../../apps/dashboard/src/surfaces/setup/surface.ts");
  const setupWas = setupVerbs.request;
  setupVerbs.request = async (what) => (asked.push(what), { ok: true, already: asked.length > 1, message: "" });
  try {
    await held.action.onClick();
    assert.deepEqual(asked, ["name"], "one request, for one press");
    assert.match(
      textOf(flashes.at(-1).msg),
      /^Requested: a person at Chanlytics changes the name with the phone networks/,
    );
    await held.action.onClick();
    assert.match(textOf(flashes.at(-1).msg), /^Already asked/, "a second press the same day is said as the one before");
  } finally {
    setupVerbs.request = setupWas;
  }

  // The workspace kept its name: the save is said, and so is what still says the old name.
  answering({ kept: null, refused: true });
  const kept = rename("Marisa's Salon & Spa");
  assert.equal(kept.tone, "warn");
  assert.match(textOf(kept.msg), /couldn't be renamed/);

  // A save that renamed nothing says what every row says.
  answering(null);
  assert.equal(textOf(rename("Marisa's Salon").msg), "Saved · AI picks it up within a minute");
});

test("a save the server refuses is said in its words, and the editor stays open with what was typed", async () => {
  const sent = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const refusal = "Someone else saved settings after you loaded them — reload and reapply.";
  bridgeHolds({
    parts: {
      saveSettings: (config, version) => {
        sent.push({ config, version });
        return Promise.resolve({ ok: false, code: "conflict", message: refusal });
      },
    },
  });
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  assert.equal(sent.length, 1, "sent once");
  assert.deepEqual(openRows(tree), ["website"], "the editor is still open");
  assert.equal(boxOf(tree, "website").props.value, "https://marisas.example", "with its draft");
  assert.equal(byTestId(tree, "rec-inline-save-website").props["aria-busy"], undefined, "and Save is not busy");
  assert.deepEqual(
    [flashes.length, flashes[0].tone, textOf(flashes[0].msg)],
    [1, "danger", refusal],
    "the toast carries the server's words, and nothing said it was saved",
  );
});

test("a save whose promise fails before the server takes it says so, and leaves the row ready to try again", async () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  bridgeHolds({ parts: { saveSettings: () => Promise.reject(new Error("The network went away.")) } });
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  const save = byTestId(tree, "rec-inline-save-website");
  assert.equal(save.props["aria-busy"], undefined, "not saving for good");
  assert.deepEqual(openRows(tree), ["website"], "still open");
  assert.equal(boxOf(tree, "website").props.value, "https://marisas.example", "with what was typed");
  assert.deepEqual([flashes.at(-1).tone, textOf(flashes.at(-1).msg)], ["danger", "The network went away."]);
  cancelRow(tree, "website");
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), [], "and Cancel still closes it, where it did nothing before");
});

test("the number it gives out: your line stores nothing, and a different number is checked, then stored as typed", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(settingsHeld().config);
  assert.match(textOf(byTestId(tree, "rec-row-phone_display")), /\+1 \(305\) 555-0123/);
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  const radios = (t) => all(byTestId(t, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio");
  assert.deepEqual(
    radios(tree).map((r) => [textOf(r), r.props["aria-checked"]]),
    [
      ["Your number", true],
      ["A different number", false],
    ],
  );
  assert.match(textOf(byTestId(tree, "rec-inline-phone_display-note")), /\+1 \(305\) 555-0123 · the line AI answers/);
  press(radios(tree)[1]);
  tree = redrawTab(flash);
  assert.equal(
    boxOf(tree, "phone_display").props.value,
    "+1 (305) 555-0123",
    "a different number starts from the line, as people write it",
  );
  assert.match(textOf(byTestId(tree, "rec-inline-phone_display-note")), /That is your number/);
  typeInto(tree, "phone_display", "12345");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "phone_display")), /short code/, "refused under its box");
  assert.equal(sent.length, 0);
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, phone_display: "+1 (646) 555-0100" } });
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call +1 (646) 555-0100 now.");

  // With no line of its own there is no choice, and the box is the only answer: what is typed is what it gives out.
  // The row this ports sent nothing here, because it read "your line" as chosen where there was no line to choose.
  const none = { value: null, source: "absent" };
  tree = drawTab({ flash, facts: { voice_line: none, phone_display: none } });
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-inline-phone_display-choice"), null, "no line, no choice");
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "phone_display")), /There is no line yet, so AI needs a number to give out\./);
  typeInto(tree, "phone_display", "(646) 555-0100");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.equal(sent.at(-1).config.brain.phone_display, "(646) 555-0100");

  // A number typed before, put back to the line: the key goes, and the line is what it gives out from then on.
  tree = drawTab({ flash, brain: { phone_display: "(646) 555-0100" } });
  const typed = structuredClone(settingsHeld().config);
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  assert.equal(radios(tree)[1].props["aria-checked"], true, "a typed number opens on its own choice");
  press(radios(tree)[0]);
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.deepEqual(sent.at(-1).config, { ...typed, brain: without(typed.brain, "phone_display") });
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call your line.");
});

test("an editor whose page goes away lets go of the registry, and one that comes straight back holds on", async () => {
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  redrawTab();
  // React's StrictMode check, which the app runs in development: every effect cleaned up and run again at once.
  remount(() => W.React.createElement(W.BusinessTab, { flash: () => {} }));
  await settle();
  assert.equal(W.__recordFolds.open(), "website", "a row that comes straight back is not gone");
  assert.equal(W.__settingsUnsaved(), true, "and still answers the rail for what was typed");
  // The rail's "Yes, leave" replaces the pane, and the page with it. Left open, the row's dirty test would go on
  // answering, and the rail would ask on every tab and the browser before every reload.
  unmount();
  await settle();
  assert.equal(W.__recordFolds.open(), null);
  assert.equal(W.__settingsUnsaved(), false);
});

test("the transfer number starts from the number as it is shown, is checked under its box, and is stored as E.164", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(settingsHeld().config);
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.equal(
    boxOf(tree, "handoff_number").props.value,
    "+1 (212) 555-0142",
    "a change starts from the number as it is shown",
  );
  typeInto(tree, "handoff_number", "646 555 0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /needs the country code/);
  typeInto(tree, "handoff_number", "+1 (305) 555-0123");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /AI's own line/, "never the line it answers on");
  assert.equal(sent.length, 0);
  typeInto(tree, "handoff_number", "+1 (646) 555-0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, handoff_number: "+16465550199" } },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Callers who insist on a person reach +1 (646) 555-0199.");
});

/* ------------------------------------ who may change it ------------------------------------ */

test("every act of the record is a PUT the settings door refuses, and none asks a different door", () => {
  // PUT /settings is owner-only. A card that gated on some OTHER permission would be offered to a role that cannot
  // save, and refused at the round trip -- which is what the form did before it was made owner-only, opening on the
  // autonomy gate. The viewer test below cannot see that: it refuses every permission at once, so a card asking the
  // wrong one is refused too, by luck. These two roles tell them apart.
  const was = provided("roles");
  try {
    // An operator, who may change the autonomy matrix (PUT /policies) and NOT the business.
    bridgeHolds({ parts: { roles: { can: (perm) => perm === "autonomy", myRole: () => "operator" } } });
    let tree = drawTab();
    assert.deepEqual(
      all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.equal(byTestId(tree, "rec-gap-door"), null, "and the gap line opens nothing");
    const why = roleGate("operator", "settings", "change the business").reason;
    assert.match(
      textOf(byTestId(tree, "bt-viewer")),
      new RegExp(escape(why)),
      "the page says why once, in the settings door's words",
    );
    // The card a workspace with no receptionist sees keeps its primary act, shown and refused -- so it is the one
    // place a wrong permission would show as a live button. It must be refused, and in the SAME words.
    const empty = drawCreateCard();
    const act = byTestId(empty, "rec-create-open");
    assert.equal(act.props["aria-disabled"], true, "REGRESSION: the act asked a door this role may open");
    assert.equal(act.props["aria-description"], roleGate("operator", "settings", "set up AI").reason);

    // And an operator who may change the business and nothing else is offered all of it, refused nowhere: every act
    // asks "settings", so widening that one permission widens exactly these controls.
    bridgeHolds({ parts: { roles: { can: (perm) => perm === "settings", myRole: () => "operator" } } });
    tree = drawTab();
    const acts = all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || ""));
    assert.ok(acts.length > 6, "the rows offer their changes");
    assert.deepEqual(
      acts.filter((a) => a.props["aria-disabled"]).map((a) => a.props["data-testid"]),
      [],
      "and none of them is refused",
    );
    assert.equal(byTestId(drawCreateCard(), "rec-create-open").props["aria-disabled"], undefined);
  } finally {
    if (was) bridgeHolds({ parts: { roles: was } });
    else bridgeHolds({ parts: { roles: undefined } });
  }
});

test("a viewer reads everything, is offered no act, and is told why once", () => {
  // the frame's real gate, over contracts' role table (roleGate): the role is the store's.
  bridgeHolds({ parts: { roles: { can: (perm) => perm !== "settings", myRole: () => "viewer" } } });
  try {
    const sent = saving();
    const google = "1200 Maple Ave, Brooklyn, NY 11208, USA";
    const tree = drawTab({
      profile: { ...marisa, tone: undefined, address: "1200 Maple Avenue" },
      resolved: { ...KNOWN, listing: { name: "Marisa's Beauty Salon", address: google } },
    });
    assert.deepEqual(
      all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(all(tree, (n) => ownWords(n).includes(why)).length, 1, "the reason is said once");
    assert.match(textOf(byTestId(tree, "bt-viewer")), /You can read everything\./);
    assert.match(textOf(byTestId(tree, "rec-row-name")), /Marisa's Beauty Salon/, "and everything is there to read");

    const band = byTestId(tree, "rec-gap");
    assert.match(textOf(band), /no voice of its own/i, "the gap is still named");
    assert.equal(
      find(band, (n) => typeof n.props?.onClick === "function"),
      null,
      "with no door to a row that would not open",
    );

    // A disagreement is still there to read, and, like each row's act, its press is absent rather than refused: the
    // States board's "Each row's act is simply absent".
    const address = byTestId(tree, "rec-row-address");
    const minor = factsHeld().conflicts.find((k) => k.fact === "address");
    assert.match(textOf(address), new RegExp(escape(minor.sentence)), "the resolver's own sentence, on the row");
    assert.equal(find(address, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"], "warn");
    assert.equal(
      find(address, (n) => n.type === "button" && classes(n).includes("btn")),
      null,
      "and no press, not even a refused one",
    );
    // The serious one too: its row still washes warn, and still offers nothing.
    const serious = drawTab({ brain: { phone_display: "(212) 555-0142" }, resolved: KNOWN });
    const published = byTestId(serious, "rec-row-phone_display");
    assert.equal(published.props["data-state"], "warn");
    assert.match(textOf(published), /the number it transfers to/);
    assert.equal(
      find(published, (n) => n.type === "button"),
      null,
    );
    assert.equal(sent.length, 0);
    // And nothing opens an editor for it.
    W.__recordFolds.request("website");
    assert.deepEqual(openRows(redrawTab()), []);
  } finally {
    bridgeHolds({ parts: { roles: undefined } });
  }
});

test("a name the workspace goes by is shown against the business's, and never offered in its place", () => {
  // Resolved as the settings read resolves it: no Google listing, and a workspace named in a Stripe test.
  const tree = drawTab({ resolved: { ...KNOWN, workspace: { name: "Billing probe", timezone: "America/New_York" } } });
  const row = byTestId(tree, "rec-row-name");
  const conflict = factsHeld().conflicts.find((k) => k.fact === "business_name");
  assert.equal(conflict.known_source, "workspace", "the fixture is the workspace's own name");
  assert.match(
    textOf(row),
    /this workspace is named Billing probe/,
    "the disagreement is on the row, in the resolver's words",
  );
  assert.equal(
    find(row, (n) => n.type === "button" && classes(n).includes("btn")),
    null,
    "with no press that would rename the business to it",
  );
  assert.equal(
    textOf(byTestId(tree, "rec-row-act-name")),
    "Change",
    "the name is still changed the one way, by typing it",
  );

  // Google's answer is a fill: one press takes it.
  const listed = drawTab({ resolved: { ...KNOWN, listing: { name: "Marisa's Salon & Spa", address: null } } });
  assert.ok(find(byTestId(listed, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
});

/* ------------------------------------ the gap line's door ------------------------------------ */

test("the gap line's door opens the row it names, and that row asks before its changes go like any other", () => {
  let tree = drawTab({ profile: without(marisa, "address"), facts: { address: { value: null, source: "absent" } } });
  const gap = businessGap(settingsHeld().config.brain, null);
  assert.equal(gap.row, "address");
  const door = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
  assert.equal(textOf(door), gap.sentence, "the gap's own words are its door");
  // And a screen reader hears where it goes, not only a statement: the sentence, then the act of the row it opens.
  const heard = (b) =>
    b.props["aria-labelledby"]
      .split(" ")
      .map((id) => find(tree, (n) => n.props?.id === id))
      .filter(Boolean)
      .map(textOf)
      .join(" ");
  assert.equal(heard(door), `${gap.sentence} Add one Address`);
  press(door);
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"]);
  typeInto(tree, "address", "1200 Maple Ave, Brooklyn, NY 11208");
  tree = redrawTab();
  // The door knows only the row's id. What it opened is guarded as the row's own act would have guarded it, by the
  // row's own dirty test: the Settings rail asks, the browser asks, and another row's act waits on an answer.
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  const unload = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab closes");
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "another row's act does not throw the changes away");
  assert.ok(byTestId(tree, "rec-inline-address-ask-confirm"), "it asks first, beside them");
  assert.equal(boxOf(tree, "address").props.value, "1200 Maple Ave, Brooklyn, NY 11208");

  // A fold is opened the same way: the voice's gap opens How it answers' voice fold, and its door is heard with that
  // row's act and label (receptionist/business-tab/answers/ holds the fold it opens).
  tree = drawTab({ profile: { ...marisa, tone: undefined } });
  const toTone = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
  assert.equal(heard(toTone), `${businessGap(settingsHeld().config.brain, null).sentence} Give it one Its voice`);
  press(toTone);
  assert.equal(W.__recordFolds.open(), "tone");
  assert.deepEqual(openFolds(redrawTab()), ["tone"]);
});

test("nothing a fold works out as it draws can take the page down: a draft its helpers throw on draws no block, and Save says so and sends nothing", () => {
  // The quality review's probe. BtFold works out what it will say DURING RENDER, and the folds' helpers throw on a draft
  // they were not written for (btWhole's TypeError for a switch left out, which the rules fold of Task 3.5 can meet
  // through one slip in its body). In the app a throw while drawing is the shell's error boundary's: the whole of
  // Settings is replaced. The fold loses its block; the page stays.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const logged = [];
  const was = console.error;
  console.error = (...args) => logged.push(args);
  try {
    drawTab();
    unmount();
    let handed = null;
    const draw = () =>
      W.React.createElement(W.BtFold, {
        id: "guardrails",
        label: "Rules it always keeps",
        saver: W.__businessTabSave.saver,
        canEdit: true,
        flash,
        row: { value: "Four rules" },
        body: (f) => {
          handed = f;
          return null;
        },
      });
    let tree = draw();
    press(byTestId(tree, "rec-row-act-guardrails"));
    tree = again(draw);
    assert.equal(handed.open, true);
    assert.ok(byTestId(tree, "rec-fold-says-guardrails"), "a whole draft says what it will tell AI");
    // A body's slip: it writes the one switch it changed and drops the rest.
    handed.update(() => ({ never_quote_prices: false }));
    assert.doesNotThrow(() => {
      tree = again(draw);
    }, "REGRESSION: the page's render threw btWhole's TypeError");
    assert.equal(
      byTestId(tree, "rec-fold-says-guardrails"),
      null,
      "nothing can be said of a draft the helpers cannot read",
    );
    assert.equal(
      foldOf(tree, "guardrails").props.hidden,
      undefined,
      "and the fold is still open, with what was done to it",
    );
    assert.ok(
      logged.some((args) => args.some((a) => a instanceof TypeError)),
      "the fault is reported, not swallowed",
    );
    // Save cannot check or write it either: said in the danger tone, nothing sent, the fold left open.
    assert.doesNotThrow(() => saveFoldOf(tree, "guardrails"));
    tree = again(draw);
    assert.deepEqual(
      [sent.length, flashes.at(-1).tone, foldOf(tree, "guardrails").props.hidden],
      [0, "danger", undefined],
    );
    assert.match(textOf({ props: { children: flashes.at(-1).msg } }), /^Not saved/);
  } finally {
    console.error = was;
  }
});

test("Cancel's question and another row's are one question: answered once, asked once", () => {
  // Cancel armed its own Confirm; another row's act then drew the registry's over it; "Keep editing" took the
  // registry's away and Cancel's was still armed behind it, so the owner was asked the same thing twice. Both gestures
  // held a copy of this block; it is one helper now.
  const asks = (tree, within) => all(within(tree), (n) => n.type === W.Confirm).map((n) => n.props.testid);
  let tree = drawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    ["rec-fold-hours-cancel"],
  );
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    ["rec-fold-hours-ask"],
    "one question on screen",
  );
  press(byTestId(tree, "rec-fold-hours-ask-no"));
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    [],
    "REGRESSION: Cancel's question came back behind it",
  );
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00", "keep editing keeps what was typed");

  // A row edited in its place holds one value, so its own Cancel arms no question: the one it can show is another
  // row's, asked once.
  tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  openFold(tree, "address");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => inline(t, "website")),
    ["rec-inline-website-ask"],
  );
  press(byTestId(tree, "rec-inline-website-ask-no"));
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => inline(t, "website")),
    [],
  );
});

test("an untouched fold follows what is stored: a colleague's change read back is shown, said as it stands, and the first keystroke after it is not refused", () => {
  // The quality review's probe. `opened` was taken once, as the fold opened. The hours fold left open with nothing typed
  // while a colleague's Tuesday was read back still showed 18:00, drew "It will no longer be told … Tuesday", and
  // refused the first Save after one keystroke as "changed after you opened it".
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "18:00");
  // A colleague's save, read back into this tab: Tuesday closes at 20:00, version 8.
  const theirs = settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } });
  landSettings({ ...theirs, version: 8 });
  tree = redrawTab(flash);
  assert.equal(
    labelled(tree, "Tuesday closes").props.value,
    "20:00",
    "REGRESSION: the open fold still showed the Tuesday it opened with",
  );
  assert.deepEqual(
    partsOf(byTestId(tree, "rec-fold-says-hours")).map(([eyebrow]) => eyebrow),
    ["Preview what it's told"],
    "nothing goes: the week is as stored",
  );
  assert.equal(W.__settingsUnsaved(), false, "and it holds no changes");
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  assert.equal(
    labelled(tree, "Tuesday closes").props.value,
    "20:00",
    "typed into, the draft is the week as read back, with the change",
  );
  saveFoldOf(tree, "hours");
  assert.equal(sent.length, 1, "REGRESSION: refused as changed after it opened");
  assert.equal(sent[0].version, 8);
  assert.deepEqual(sent[0].config.brain.profile.hours, {
    ...marisa.hours,
    mon: { open: "09:30", close: "17:00" },
    tue: { open: "09:30", close: "20:00" },
  });
  assert.equal(flashes.filter((f) => f.tone === "danger").length, 0);

  // A fold that HAS been typed in keeps its draft, and is refused as before: their change is not put back as it was.
  tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  redrawTab(flash);
  landSettings({
    ...settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } }),
    version: 8,
  });
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "18:00", "what was typed over stays as it was typed over");
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(sent.length, 1);
  assert.match(textOf({ props: { children: flashes.at(-1).msg } }), /changed after you opened it/);
  assert.deepEqual(openFolds(tree), ["hours"]);
});

test("a fold whose own part of the settings moved after it was typed in is refused as moved: said, nothing sent, the fold open with its draft", () => {
  // foldJob's refusal, drawn through a fold: a colleague's Tuesday is read back after Monday was typed over, and the
  // save would have put their Tuesday back as it was.
  const sent = [];
  bridgeHolds({
    parts: {
      saveSettings: (config) => {
        sent.push(config);
        return new Promise(() => {});
      },
    },
  });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  redrawTab(flash);
  landSettings({
    ...settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } }),
    version: 8,
  });
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(sent.length, 0, "nothing sent");
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["danger", "Not saved · this changed after you opened it. Close it and open it again to see what is there now."],
  );
  assert.deepEqual(
    [openFolds(tree), foldOf(tree, "hours").props["aria-busy"]],
    [["hours"], undefined],
    "open, and not busy",
  );
  assert.deepEqual(
    [labelled(tree, "Monday closes").props.value, labelled(tree, "Tuesday closes").props.value],
    ["17:00", "18:00"],
    "with the draft as typed: their Tuesday is not shown over it",
  );
  // Closed and opened again, it is the week as stored now.
  cancelFoldOf(tree, "hours");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab(flash);
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "20:00");
});

test("a fold's save the server refuses while another row's ask waits: the question is drawn then, once, and is true again", async () => {
  let refuse = null;
  bridgeHolds({
    parts: {
      saveSettings: () =>
        new Promise((resolve) => {
          refuse = () => resolve({ ok: false, code: "internal", message: "The server said no." });
        }),
    },
  });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  openFold(tree, "website");
  tree = redrawTab(flash);
  assert.deepEqual(W.__recordFolds.asking(), { holding: "hours", wants: "website" }, "the ask is recorded");
  assert.equal(
    all(foldOf(tree, "hours"), (n) => n.type === W.Confirm).length,
    0,
    "and not drawn while the save is out",
  );
  refuse();
  await settle();
  tree = redrawTab(flash);
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["danger", "The server said no."],
  );
  const asks = all(foldOf(tree, "hours"), (n) => n.type === W.Confirm);
  assert.deepEqual(
    asks.map((n) => n.props.testid),
    ["rec-fold-hours-ask"],
    "one question, drawn now that nothing is saving, and true: nothing was saved",
  );
  assert.deepEqual(
    [foldOf(tree, "hours").props["aria-busy"], W.__settingsSaving(), labelled(tree, "Monday closes").props.value],
    [undefined, false, "17:00"],
  );
  press(byTestId(tree, "rec-fold-hours-ask-yes"));
  tree = redrawTab(flash);
  assert.deepEqual([openFolds(tree), openRows(tree)], [[], ["website"]], "answered, the row asked for opens");
});

test("a row saved through its own door offers no press on a disagreement: it has no commit to save the other answer through", () => {
  // Task 3.3's re-review. A dispute's press called the row's `commit`, which a row with a `door` (the zone's) does not
  // have, and threw as it was pressed. The will-say block already asked for a commit before calling it.
  drawTab();
  unmount();
  const tree = W.React.createElement(W.BtRow, {
    id: "timezone",
    label: "Timezone",
    brain: settingsHeld().config.brain,
    value: "New York",
    initial: "America/New_York",
    storedAs: (d) => d,
    door: { save: () => {}, pending: () => false },
    disputed: { value: "Chicago", source: "workspace", use: "America/Chicago" },
    body: () => null,
  });
  const row = byTestId(tree, "rec-row-timezone");
  assert.ok(
    find(row, (n) => classes(n).includes("rec-row-dispute")),
    "the disagreement is still there to read",
  );
  assert.equal(
    find(row, (n) => n.type === "button" && classes(n).includes("btn")),
    null,
    "REGRESSION: a press that called a commit the row does not have",
  );
});
