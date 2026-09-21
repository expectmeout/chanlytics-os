/**
 * Settings › Business, the page, EXECUTED on the stub React: the head, the standing line, and *Who you are*, each row
 * edited where it is stated. No source-text assertions: every claim here is something the page drew, or something a
 * press on it sent.
 *
 * The page draws from what the settings read hands over (`__SETTINGS`, with the preview the server resolved, and
 * `__FACTS`), and every sentence with a judgement in it is contracts', through the bridge the app installs
 * (legacy-bridge/business-tab.ts), installed here from the real module. A save goes through a stand-in for the bridge's
 * versioned PUT that records what it was sent and says the server accepted it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stateOf, standingLine, roleGate, formatPhoneDisplay, whyNotAPhone, whyNotAHandoff, samePhone, handoffE164,
  resolveFacts, factConflicts, newReceptionistDefaults, PROFILE_CROSSING_WORDS, hasProfile,
} from "@chanlytics/contracts";
import { installLegacyReact, again, unmount, remount, settle, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";

// The app's chrome bridge publishes contracts' stateOf as __chrome.state (legacy-bridge/shell.ts). Without it every
// StatePill is plain, and no tone could be read here.
installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
const L = "../../../apps/dashboard/src/legacy";
const went = [];
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  canDo: () => true,
  gate: () => ({}),
  usePPToast: () => [null, () => {}],
  // As the bridge publishes them (seed-globals.ts, inbox-verbs.ts): a number's written form, the phone checks, the
  // role gate's words, and who last changed the settings.
  __phoneDisplay: formatPhoneDisplay,
  __whyNotAPhone: whyNotAPhone,
  __whyNotAHandoff: whyNotAHandoff,
  __samePhone: samePhone,
  __handoffE164: handoffE164,
  __roleGate: roleGate,
  __lastChanged: () => "",
  // What a new receptionist starts with, which a rename writes again under the new name (inbox-verbs.ts).
  __receptionistDefaults: newReceptionistDefaults,
});
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/components/record-row.jsx`);
await import(`${L}/components/record-field.jsx`);
await import(`${L}/components/record-fold.jsx`);
await import(`${L}/components/record-sheet.jsx`);
// What the tab's saves write and the one saver they go through, before the page, as both load lists have them.
await import(`${L}/pages/business-tab-save.jsx`);
await import(`${L}/pages/business-tab-folds.jsx`);
await import(`${L}/pages/business-tab.jsx`);
const W = globalThis.window;
// The tab's helpers, from the module the app installs: the standing line, and what each row will tell the receptionist.
const { installBusinessTab } = await import("../../../apps/dashboard/src/legacy-bridge/business-tab.ts");
installBusinessTab();
// The settings read's own preview, built as the server builds it: a row's draft is resolved with its inputs (Task 3.1).
const { composePromptPreview } = await import("../../../apps/dashboard/src/server/prompt-preview.ts");

/* ------------------------------------ the record ------------------------------------ */

/** Melany's Beauty Salon, the live tenant, as the surface hands it over. */
const melany = {
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  website: "https://melanysbeautysalon.com",
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  hours: { mon: { open: "09:30", close: "18:00" }, tue: { open: "09:30", close: "18:00" }, wed: { open: "09:30", close: "18:00" }, thu: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" }, sat: { open: "09:30", close: "19:00" }, sun: {} },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }, { name: "Highlights", duration_min: 45, price_note: "quoted at consult" }],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; appointments are recommended for long services." }],
  escalate_when: ["They ask for a person, for Melany or for the owner", "They are upset, or have a complaint"],
  booking_rules: { lead_hours: 2, slot_min: 30, max_days_ahead: 14, party_max: 4, consult_first: ["Color correction", "Extensions"] },
  guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  handoff_number: "+16469325775",
};

/** The brain as stored. It parses, as every saved one does, or consequenceOf resolves nothing from it. */
const brainOf = (profile, over = {}) => ({
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  system_prompt: "You are the WhatsApp assistant for Melany's Beauty Salon. Answer warmly and briefly.",
  fallbacks: { greeting: "Hi! Someone will be with you shortly.", error: "Sorry, something went wrong on our side.", non_text: "Thanks, a person will look at this." },
  profile,
  ...over,
});

/** What the platform knows: the voice line it provisioned, and the workspace. */
const KNOWN = { workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York" }, channels: [{ kind: "voice", number_e164: "+13083368109", status: "active" }], listing: null };

const settings = (profile = melany, over = {}, brain = {}) => ({
  version: 7,
  config: { brain: brainOf(profile, brain), calendar: { ical_url: "https://app.chanlytics.com/api/v1/calendar/filler.ics" }, ...over },
  // Beside the config, the settings read hands over its preview, with the inputs it was resolved with.
  prompt: composePromptPreview(brainOf(profile, brain), { tz: "America/New_York", policy: {}, known: KNOWN, openings: null }),
});

const facts = (over = {}) => ({
  facts: {
    business_name: { value: "Melany's Beauty Salon", source: "verified" },
    phone_display: { value: "+1 (308) 336-8109", source: "provisioned" },
    booking_link: { value: "https://booksy.com/en-us/1817434", source: "typed" },
    address: { value: "2581 Pitkin Ave, Brooklyn, NY 11208", source: "verified" },
    website: { value: "https://melanysbeautysalon.com", source: "typed" },
    handoff_number: { value: "+16469325775", source: "typed" },
    voice_line: { value: "+13083368109", source: "provisioned" },
    whatsapp_line: { value: "+13083368109", source: "provisioned" },
    ...(over.facts ?? {}),
  },
  conflicts: over.conflicts ?? [],
});

/**
 * Draw the tab over a given record, as React replaces a tree: the last one unmounted (its cleanups run, a row's hold
 * on the fold registry among them), and the registry told that nothing is open, since a row left open by the last
 * test is not this page's. The tab's one saver is reset too: it outlives every page drawn in the tab, and a save the
 * last test left out, or its answer, is not this record's. `brain` changes the stored brain beside its profile; `facts`
 * replaces resolved facts, and `resolved` resolves them all from the brain the way the settings read does (contracts
 * resolveFacts).
 */
const drawTab = ({ profile = melany, conflicts = [], flash = () => {}, brain = {}, facts: known = {}, resolved = null } = {}) => {
  W.__SETTINGS = settings(profile, {}, brain);
  if (resolved) {
    const f = resolveFacts(W.__SETTINGS.config.brain, resolved);
    W.__FACTS = { facts: f, conflicts: factConflicts(f) };
  } else {
    W.__FACTS = facts({ conflicts, facts: known });
  }
  W.__WORKSPACES = [{ id: "t-melany", name: "Melany's Beauty Salon", timezone: "America/New_York" }];
  W.__ACTIVE_WORKSPACE = "t-melany";
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  return W.React.createElement(W.BusinessTab, { flash });
};
/** The same page again, over the same hook cells, as React draws it after a state change. */
const redrawTab = (flash = () => {}) => again(() => W.React.createElement(W.BusinessTab, { flash }));
/** Press a row's act, which is what opens it. */
const openFold = (tree, row) => press(byTestId(tree, `rec-row-act-${row}`));

/** A row's inline editor, drawn whether it is open or not; closed, it is hidden, as a closed fold is. */
const inline = (tree, row) => byTestId(tree, `rec-inline-${row}`);
const openRows = (tree) => all(tree, (n) => /^rec-inline-[a-z_]+$/.test(n.props?.["data-testid"] || "") && !n.props.hidden).map((n) => n.props["data-testid"].slice("rec-inline-".length));
/** Type into a row's box, the way a person does. */
const boxOf = (tree, row) => find(inline(tree, row), (n) => classes(n).includes("rec-input"));
const typeInto = (tree, row, text) => boxOf(tree, row).props.onChange({ target: { value: text } });
const saveRow = (tree, row) => press(byTestId(tree, `rec-inline-save-${row}`));
const cancelRow = (tree, row) => press(byTestId(tree, `rec-inline-cancel-${row}`));
/** The words a node holds itself, not its children's. */
const ownWords = (n) => [].concat(n?.props?.children ?? []).filter((c) => typeof c === "string").join("");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Stand in for the bridge's versioned PUT and the server behind it: record what is sent, refuse a version that is not
 * the server's as the route does, and on acceptance hand onAccepted the saved config and its new version before the
 * re-read, as the bridge does (the re-read never lands here). The server stands where the page's latest read says it
 * does, and moves on with each save it accepts after it.
 */
const saving = () => {
  const sent = [];
  let read = null;
  let version = null;
  W.__saveSettings = (config, v, accepted) => {
    if (W.__SETTINGS !== read) { read = W.__SETTINGS; version = read.version; }
    sent.push({ config: structuredClone(config), version: v });
    if (v !== version) return Promise.resolve({ ok: false, code: "conflict", message: "Someone else saved settings after you loaded them — reload and reapply." });
    version += 1;
    accepted({ config: structuredClone(config), version });
    return new Promise(() => {});
  };
  return sent;
};
const without = (o, key) => { const c = { ...o }; delete c[key]; return c; };

/**
 * The composer's own lines for one block of a brain, from the bridge the app installs: what "It will say" quotes. A
 * test finds the line it means by what the line holds (the new website, the new name), never by its wording, so a
 * change to contracts' words changes none of these tests.
 */
const composed = (block, brain, channel = "whatsapp") => {
  const b = W.__businessTab.consequenceOf(block, brain, channel);
  return b ? b.text.split("\n").filter((l) => l.trim() !== "") : [];
};
/** What an editor says saving writes, part by part: each part's eyebrow, and the lines under it. */
const partsOf = (says) => all(says, (n) => n.props?.["data-part"]).map((p) => [
  textOf(find(p, (n) => classes(n).includes("rec-says-eyebrow"))),
  textOf(find(p, (n) => n.type === "pre")),
]);

/* ------------------------------------ the plan's seven ------------------------------------ */

test("the standing line says what contracts said, and never writes its own", () => {
  const tree = drawTab({ profile: melany });
  const band = byTestId(tree, "rec-standing");
  const vm = standingLine(W.__SETTINGS.config.brain);
  assert.match(textOf(band), new RegExp(escape(vm.can)));
  assert.match(textOf(band), new RegExp(escape(vm.wont)));
  assert.equal(vm.missing, null, "Melany's record is missing nothing");
});

test("a missing voice is named in the band, and the link opens its row", () => {
  const tree = drawTab({ profile: { ...melany, tone: undefined } });
  const band = byTestId(tree, "rec-standing");
  assert.match(textOf(band), /no voice of its own/i);
  assert.ok(find(band, (n) => typeof n.props?.onClick === "function"), "the gap carries its own door");
});

test("Who you are draws seven rows, in the spec's order", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-who");
  const keys = all(card, (n) => classes(n).includes("rec-row-key")).map(textOf);
  assert.deepEqual(keys, [
    "Name", "Address", "Website", "Booking link", "Answers on", "Tells customers to call", "Transfers a caller to",
  ]);
});

test("the Workspace row is gone, whatever the workspace is called", () => {
  const same = drawTab({ profile: melany });
  assert.equal(byTestId(same, "rec-row-workspace"), null);
  W.__WORKSPACES = [{ id: "t-melany", name: "Billing probe", timezone: "America/New_York" }];
  const different = redrawTab();
  assert.equal(byTestId(different, "rec-row-workspace"), null, "a second name for the business is not a row");
});

test("the line it answers is shown, never offered as a box", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-row-voice_line");
  assert.equal(byTestId(row, "rec-row-act-voice_line"), null, "nothing here is typed");
  const door = find(row, (n) => typeof n.props?.onClick === "function");
  assert.ok(door, "one link to Connections");
  // Beyond the plan: the number as Setup writes it, where it came from, where the door goes, and what a screen reader
  // hears it called: where it goes and why, beginning with the word on it, since that word and the row's label
  // together ("Connections Answers on") say nothing.
  assert.match(textOf(row), /\+1 \(308\) 336-8109/);
  assert.match(textOf(row), /your line/);
  assert.equal(door.props["data-testid"], "rec-row-door-voice_line");
  assert.equal(door.props["aria-label"], "Connections, where the line it answers on is set up");
  assert.ok(door.props["aria-label"].startsWith(textOf(find(door, (n) => classes(n).includes("rec-row-act-words"))).trim()), "a person who says the word on it reaches it");
  went.length = 0;
  press(door);
  assert.deepEqual(went, ["admin/integrations"]);
});

test("the carrier record is named once, at the foot", () => {
  // Changed from the plan's, which counted every node whose children were a string mentioning "Connections". The stub
  // hands every node an array of children, so that count was always 0; and the Answers-on row's own door says
  // Connections too, as the old FactRow's did. What it pins is that the carrier record -- the legal name and the
  // registered address -- is asked for on Connections and said once here, at the foot.
  const card = byTestId(drawTab({ profile: melany }), "rec-card-who");
  const mentions = all(card, (n) => /legal name|registered address/i.test(ownWords(n)));
  assert.equal(mentions.length, 1, "asked once, said once");
  const foot = byTestId(card, "rec-who-foot");
  assert.match(textOf(foot), /legal name/i);
  const link = find(foot, (n) => typeof n.props?.onClick === "function");
  assert.equal(textOf(link), "Connections", "the foot's one link names where they are asked");
  went.length = 0;
  press(link);
  assert.deepEqual(went, ["admin/integrations"]);
});

test("a conflict sits on the row it is about, and there is no banner", () => {
  const conflict = {
    fact: "phone_display",
    severity: "serious",
    used: "+1 (646) 932-5775",
    known: "+1 (308) 336-8109",
    knownSource: "provisioned",
    sentence: "Your receptionist tells customers to call +1 (646) 932-5775, but it answers on +1 (308) 336-8109.",
    to: "admin/workspace",
  };
  const tree = drawTab({ profile: melany, conflicts: [conflict] });
  assert.equal(byTestId(tree, "set-conflict-banner"), null, "the banner above the card is gone");
  const row = byTestId(tree, "rec-row-phone_display");
  assert.match(textOf(row), new RegExp(escape(conflict.sentence.slice(0, 40))));
  assert.ok(find(row, (n) => classes(n).includes("pill-warn")), "and it wears warn, because a person settles it");
});

/* ------------------------------------ the head, and the facts at rest ------------------------------------ */

test("the head says what the page is, and who last changed it when that is known", () => {
  const was = W.__lastChanged;
  try {
    W.__lastChanged = () => "Last changed by Ruben, just now";
    const tree = drawTab();
    assert.equal(textOf(find(tree, (n) => n.type === "h1")), "Business");
    assert.equal(textOf(find(tree, (n) => classes(n).includes("bt-sub"))), "What both receptionists answer from. Last changed by Ruben, just now.");
    W.__lastChanged = () => "";
    assert.equal(textOf(find(redrawTab(), (n) => classes(n).includes("bt-sub"))), "What both receptionists answer from.", "no stamp, nothing said");
  } finally {
    W.__lastChanged = was;
  }
  // The prompt's own sheet arrives with Phase 5, and its button with it.
  assert.equal(find(drawTab(), (n) => /Read what it/.test(ownWords(n))), null);
});

test("every fact says where it came from, in contracts' words", () => {
  // Resolved as the settings read resolves them (contracts resolveFacts), since the chip is the source it reports: a
  // typed value that agrees with Google's is reported as typed, so a name Google agrees with reads "you set this".
  let tree = drawTab({ resolved: { ...KNOWN, listing: { name: "Melany's Beauty Salon", address: "2581 Pitkin Ave, Brooklyn, NY 11208, USA" } } });
  const chipOf = (row) => textOf(find(byTestId(tree, row), (n) => classes(n).includes("rec-src")));
  assert.equal(chipOf("rec-row-name"), stateOf("fact", "typed").label, "typed, and agreeing with Google, is typed");
  assert.equal(chipOf("rec-row-website"), stateOf("fact", "typed").label);
  assert.equal(chipOf("rec-row-voice_line"), stateOf("fact", "provisioned").label, "the line the platform provisioned");
  assert.equal(chipOf("rec-row-phone_display"), stateOf("fact", "provisioned").label, "no number typed: it gives out the line");
  assert.equal(chipOf("rec-row-handoff_number"), stateOf("fact", "typed").label);
  assert.match(textOf(byTestId(tree, "rec-row-handoff_number")), /\+1 \(646\) 932-5775/, "written as people write it, never as it is stored");
  assert.match(textOf(byTestId(tree, "rec-row-booking_link")), /Sent instead of confirming an appointment itself\./, "the old form's note, under the link");
  // What only Google says is Google's: no address typed, and the one it lists.
  tree = drawTab({ profile: without(melany, "address"), resolved: { ...KNOWN, listing: { name: null, address: "2581 Pitkin Ave, Brooklyn, NY 11208, USA" } } });
  assert.equal(chipOf("rec-row-address"), stateOf("fact", "verified").label, "from Google");
  assert.match(textOf(byTestId(tree, "rec-row-address")), /2581 Pitkin Ave, Brooklyn, NY 11208, USA/);
});

test("an empty website says what empty means, and claims no page it cannot back", () => {
  const tree = drawTab({ profile: without(melany, "website"), facts: { website: { value: null, source: "absent" } } });
  const row = byTestId(tree, "rec-row-website");
  assert.equal(row.props["data-empty"], "true");
  // Exactly what the composer does with an empty box: it writes no website line. Not that the receptionist has none to
  // give -- the owner's own words may name one -- and not the page we publish, which no receptionist is told and the
  // carriers are filed only from the business record's own website.
  assert.match(textOf(row), /Optional\. Left empty, the receptionist is given no website\./);
  assert.doesNotMatch(textOf(row), /\/b\/|no website to give/);
  assert.equal(textOf(byTestId(tree, "rec-row-act-website")), "Add one");
});

test("each act is named for what it acts on: its words and its row's label, or what the row holds where the label is a phrase", () => {
  const heard = (tree, row) => {
    const act = byTestId(tree, `rec-row-act-${row}`);
    return act.props["aria-label"] || act.props["aria-labelledby"].split(" ").map((id) => textOf(find(tree, (n) => n.props?.id === id))).join(" ");
  };
  let tree = drawTab();
  assert.deepEqual(["name", "address", "booking_link", "phone_display", "handoff_number"].map((row) => heard(tree, row)), [
    "Change Name", "Change Address", "Change Booking link",
    // Not "Change Tells customers to call" and "Change Transfers a caller to", which say nothing.
    "Change the number customers are told to call", "Change the transfer number",
  ]);
  // Empty, the act's own words are "Add one", and the name keeps them.
  tree = drawTab({ profile: without(without(melany, "website"), "handoff_number"), facts: { website: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } } });
  assert.deepEqual([heard(tree, "website"), heard(tree, "handoff_number")], ["Add one Website", "Add one transfer number"]);
});

test("a workspace with no receptionist is PaneWorkspace's to draw: the page draws nothing, and nothing throws", () => {
  for (const s of [null, { version: 1, config: {} }, { version: 1, config: { brain: null } }]) {
    unmount();
    W.__SETTINGS = s;
    assert.equal(W.React.createElement(W.BusinessTab, { flash: () => {} }).rendered, null);
  }
});

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

test("an inline save sends the stored config with its one key changed, and everything else as it was", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["address"], "the row became its field");
  assert.equal(byTestId(tree, "rec-row-address"), null, "in the row's place");
  assert.equal(boxOf(tree, "address").props.value, melany.address, "starting from what is stored");
  typeInto(tree, "address", "  10 Pier St, Brooklyn, NY 11201  ");
  tree = redrawTab(flash);
  saveRow(tree, "address");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 7, "the version it read, for the compare-and-swap");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, profile: { ...stored.brain.profile, address: "10 Pier St, Brooklyn, NY 11201" } } });
  assert.equal(textOf(flashes.at(-1).msg), "Saved — the receptionist picks it up within a minute");
  assert.deepEqual(openRows(redrawTab(flash)), [], "accepted, the editor closes");

  // A key of the brain itself, beside the profile.
  tree = drawTab({ flash });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "https://book.example/melany");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  assert.deepEqual(sent[1].config, { ...stored, brain: { ...stored.brain, booking_link: "https://book.example/melany" } });
});

test("an emptied field deletes its key rather than storing an empty string", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "   ");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  assert.equal("website" in sent[0].config.brain.profile, false, "no website key at all, not an empty one");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, profile: without(stored.brain.profile, "website") } });

  // The transfer number: empty is a choice, a message instead of a transfer, and it is stored as nothing.
  tree = drawTab({ flash });
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  typeInto(tree, "handoff_number", "");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.deepEqual(sent[1].config, { ...stored, brain: { ...stored.brain, profile: without(stored.brain.profile, "handoff_number") } });
  assert.equal(textOf(flashes.at(-1).msg), "The receptionist takes a message instead of transferring.");
});

test("what stops a save is said under the box, before any round trip, and nothing is sent", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "melanysbeautysalon");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  tree = redrawTab(flash);
  const box = boxOf(tree, "website");
  assert.equal(box.props["aria-invalid"], true);
  const said = find(inline(tree, "website"), (n) => n.props?.id === box.props["aria-describedby"].split(" ")[0]);
  assert.equal(textOf(said), "The website needs to be a full web address, starting with https://", "the old form's sentence, named by the box");
  assert.deepEqual([sent.length, flashes.length], [0, 0], "nothing sent, and nothing said in a toast");
  assert.deepEqual(openRows(tree), ["website"], "the editor stays open");
  assert.equal(box.props.value, "melanysbeautysalon", "with what was typed");
  typeInto(tree, "website", "https://melanysbeautysalon.com/home");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "website").props["aria-invalid"], undefined, "typing again takes the sentence away");

  // The name is required, and says so under its own box.
  tree = drawTab({ flash });
  openFold(tree, "name");
  tree = redrawTab(flash);
  typeInto(tree, "name", "  ");
  tree = redrawTab(flash);
  saveRow(tree, "name");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "name")), /The receptionist needs a business name before it can answer anyone\./);
  // And so is the booking link, a full web address.
  tree = drawTab({ flash });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "booksy");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "booking_link")), /That booking link needs to be a full web address, starting with https:\/\//);
  assert.equal(sent.length, 0);
});

test("Use Google's and Publish the line instead each send exactly their patch", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // Facts resolved as the settings read resolves them: Google lists the salon at an address written another way.
  const google = "2581 Pitkin Ave, Brooklyn, NY 11208, USA";
  let tree = drawTab({ flash, profile: { ...melany, address: "2581 Pitkin Avenue" }, resolved: { ...KNOWN, listing: { name: "Melany's Beauty Salon", address: google } } });
  let stored = structuredClone(W.__SETTINGS.config);
  const address = byTestId(tree, "rec-row-address");
  const minor = W.__FACTS.conflicts.find((k) => k.fact === "address");
  assert.match(textOf(address), new RegExp(escape(minor.sentence)), "the resolver's own sentence, on the row");
  assert.equal(address.props["data-state"], undefined, "a minor disagreement leaves the row as it is");
  // The row's hidden editor keeps the disagreement to read, and not under the id the row's press is described by.
  assert.equal(all(tree, (n) => n.props?.id === "rec-row-address-other").length, 1, "one id, once on the page");
  assert.equal(find(address, (n) => n.type === "button" && /Keep/.test(textOf(n))), null, "nothing stores a choice to keep it, so nothing offers one");
  press(find(address, (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, profile: { ...stored.brain.profile, address: google } } });

  // The published number is the transfer number: the serious one, as the live salon had it.
  tree = drawTab({ flash, brain: { phone_display: "(646) 932-5775" }, resolved: KNOWN });
  stored = structuredClone(W.__SETTINGS.config);
  const row = byTestId(tree, "rec-row-phone_display");
  assert.equal(row.props["data-state"], "warn", "the serious one washes its row");
  assert.match(textOf(row), /which is the number it transfers to/);
  assert.equal(find(row, (n) => n.type === "button" && /keep/i.test(textOf(n))), null);
  press(find(row, (n) => n.type === "button" && textOf(n) === "Publish the line instead"));
  assert.deepEqual(sent[1].config, { ...stored, brain: without(stored.brain, "phone_display") }, "the line it answers is what absent means");
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call your line.");
});

test("It will say: the lines of the prompt the draft changes, resolved as the edge resolves them, and what goes beside what comes", () => {
  let tree = drawTab();
  const stored = W.__SETTINGS.config.brain;
  openFold(tree, "website");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-website"), null, "nothing changed, nothing said");
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  const says = byTestId(tree, "rec-inline-says-website");
  // The one line it changes, from the bridge's own block for the draft, and none of the block around it; and beside
  // it the line as it stands, which goes. A line rewritten is one of each.
  const comes = composed("website", { ...stored, profile: { ...melany, website: "https://melanys.example" } }).filter((l) => l.includes("https://melanys.example"));
  const goes = composed("website", stored).filter((l) => l.includes("https://melanysbeautysalon.com"));
  assert.deepEqual([comes.length, goes.length], [1, 1]);
  assert.deepEqual(partsOf(says), [["It will say", comes[0]], ["It will no longer say", goes[0]]]);
  assert.ok(boxOf(tree, "website").props["aria-describedby"].split(" ").includes(says.props.id), "and the box is described by it");

  typeInto(tree, "website", "melanys");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-website"), null, "a draft the save refuses is never told to the receptionist");

  typeInto(tree, "website", "");
  tree = redrawTab();
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-website")), [["It will no longer say", goes[0]]], "emptied, it says only what goes");

  // The name rewrites the line the prompt opens with.
  tree = drawTab();
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", "Melany's Salon & Spa");
  tree = redrawTab();
  const opens = (name) => composed("business_name", { ...stored, business_name: name }).filter((l) => l.includes(name));
  assert.equal(opens("Melany's Salon & Spa").length, 1);
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-name")), [["It will say", opens("Melany's Salon & Spa")[0]], ["It will no longer say", opens("Melany's Beauty Salon")[0]]]);

  // The transfer number's words are a call's, read on the phone: what a call is told once it is emptied, and what a
  // call is told today, which goes.
  tree = drawTab();
  openFold(tree, "handoff_number");
  tree = redrawTab();
  typeInto(tree, "handoff_number", "");
  tree = redrawTab();
  const call = composed("handoff_number", stored, "voice");
  const emptied = composed("handoff_number", { ...stored, profile: without(melany, "handoff_number") }, "voice");
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-handoff_number")), [
    ["It will say", emptied.filter((l) => !call.includes(l)).join("\n")],
    ["It will no longer say", call.filter((l) => !emptied.includes(l)).join("\n")],
  ]);
  assert.deepEqual([emptied.filter((l) => !call.includes(l)).length, call.filter((l) => !emptied.includes(l)).length], [1, 1], "one sentence for another: taking a message, for the transfer");
  // And only where there is a line to call: a workspace that answers on WhatsApp alone is told no phone-call sentence.
  tree = drawTab({ facts: { voice_line: { value: null, source: "absent" } } });
  openFold(tree, "handoff_number");
  tree = redrawTab();
  typeInto(tree, "handoff_number", "");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-handoff_number"), null, "no line to call, nothing a call would be told");
});

test("It will say nothing for a draft the page refuses, even where the save's own schema would take it", () => {
  // "12345" is no number anyone can be reached on, and the row says so under its box. The save's schema holds a
  // published number to three characters or more, so the bridge alone would resolve a prompt that gives it out: what
  // keeps it from being shown as what the receptionist will say is the page's own check.
  let tree = drawTab();
  openFold(tree, "phone_display");
  tree = redrawTab();
  press(all(byTestId(tree, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio")[1]);
  tree = redrawTab();
  typeInto(tree, "phone_display", "12345");
  tree = redrawTab();
  const stored = W.__SETTINGS.config.brain;
  assert.ok(composed("phone_display", { ...stored, phone_display: "12345" }).some((l) => l.includes("12345")), "the bridge would tell it");
  assert.equal(byTestId(tree, "rec-inline-says-phone_display"), null, "the page does not");
  // A number the check takes is shown the moment it is typed.
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab();
  const gives = composed("phone_display", { ...stored, phone_display: "+1 (646) 555-0100" }).filter((l) => l.includes("+1 (646) 555-0100"));
  assert.equal(gives.length, 1);
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-phone_display"))[0], ["It will say", gives[0]]);
});

test("a rename writes the product's opening lines again under the new name, and leaves an owner's own words alone", () => {
  const sent = saving();
  const was = "Melany's Beauty Salon";
  const now = "Melany's Salon & Spa";
  const baselineOf = (name) => newReceptionistDefaults(name).system_prompt;
  // The lines of a brain that name the business: the one the prompt opens with, and with `carried` the product's own
  // lines carried after it, each found by the name it holds.
  const naming = (brain, name, carried = false) => [
    ...composed("business_name", brain).filter((l) => l.includes(name)),
    ...(carried ? composed("system_prompt", brain).filter((l) => l.includes(name)) : []),
  ].join("\n");
  const renamedIn = (tree) => partsOf(byTestId(tree, "rec-inline-says-name"));
  // What the product stores for every workspace it sets up, carried in the owner's place while their box is empty.
  let tree = drawTab({ brain: { system_prompt: baselineOf(was) } });
  let stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", now);
  tree = redrawTab();
  const next = { ...stored.brain, business_name: now, system_prompt: baselineOf(now) };
  assert.equal(naming(next, now, true).split("\n").length, 2);
  assert.deepEqual(renamedIn(tree), [["It will say", naming(next, now, true)], ["It will no longer say", naming(stored.brain, was, true)]],
    "both lines that change, the one the prompt opens with and the product's own lines carried after it, and the two they replace");
  saveRow(tree, "name");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, business_name: now, system_prompt: baselineOf(now) } }, "one patch: the name, and the lines that name it");
  // What the receptionist is then told, resolved as the settings read resolves it, on either channel.
  const told = composePromptPreview(sent[0].config.brain, { tz: "America/New_York", policy: {}, known: KNOWN, openings: null });
  for (const channel of ["whatsapp", "voice"]) {
    assert.ok(told[channel].includes(now), channel);
    assert.ok(!told[channel].includes(was), `${channel}: the old name is nowhere in what it is told`);
  }

  // Google's name, taken in one press, is a rename like any other.
  tree = drawTab({ brain: { system_prompt: baselineOf(was) }, resolved: { ...KNOWN, listing: { name: now, address: null } } });
  stored = structuredClone(W.__SETTINGS.config);
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.deepEqual(sent[1].config, { ...stored, brain: { ...stored.brain, business_name: now, system_prompt: baselineOf(now) } });

  // A prompt the owner's workspace had before its fields is their own words: a rename leaves it as they wrote it.
  tree = drawTab();
  stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", now);
  tree = redrawTab();
  assert.deepEqual(renamedIn(tree), [["It will say", naming({ ...stored.brain, business_name: now }, now)], ["It will no longer say", naming(stored.brain, was)]]);
  saveRow(tree, "name");
  assert.deepEqual(sent[2].config, { ...stored, brain: { ...stored.brain, business_name: now } }, "the name alone");

  // Only the product's lines word for word, under the name stored beside them, are the product's to write again. The
  // owner's own sentences between its opening and its closing, or its lines under a name that is not the stored one,
  // are left as they are: a rename would have overwritten them.
  for (const prompt of [baselineOf(`${was}, a family salon since 1998. We never book walk-ins after 5pm`), baselineOf("Bella Nails & Spa")]) {
    tree = drawTab({ brain: { system_prompt: prompt } });
    stored = structuredClone(W.__SETTINGS.config);
    openFold(tree, "name");
    tree = redrawTab();
    typeInto(tree, "name", now);
    tree = redrawTab();
    assert.deepEqual(renamedIn(tree), [["It will say", naming({ ...stored.brain, business_name: now }, now)], ["It will no longer say", naming(stored.brain, was)]], prompt);
    saveRow(tree, "name");
    assert.deepEqual(sent.at(-1).config, { ...stored, brain: { ...stored.brain, business_name: now } }, prompt);
  }
});

test("a save that crosses the resolver's line says so beside the lines it changes, and still goes", () => {
  const sent = saving();
  // A sparse record, as the reviewer's probe had it: the address is the one field the resolver composes from.
  const bare = { handoff_number: "+16465550100", booking_rules: { lead_hours: 2 }, guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true } };
  const sparse = { ...bare, address: "12 Main St, Brooklyn, NY" };

  // Emptying it hands the receptionist its stored prompt: no identity block is left to show a line of, only the words.
  let tree = drawTab({ profile: sparse, resolved: KNOWN });
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.stops);
  saveRow(tree, "address");
  assert.equal(sent.length, 1, "not a refusal: the save still goes");
  assert.equal("address" in sent[0].config.brain.profile, false);

  // Typing the first starts composing, and the identity lines it starts with are shown beside the words.
  tree = drawTab({ profile: bare, resolved: KNOWN });
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "12 Main St, Brooklyn, NY");
  tree = redrawTab();
  const says = byTestId(tree, "rec-inline-says-address");
  assert.equal(textOf(byTestId(says, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.starts);
  const next = { ...W.__SETTINGS.config.brain, profile: sparse };
  const identity = W.__businessTab.consequenceOf("address", next, "whatsapp").text.split("\n").filter((l) => l.trim());
  assert.equal(textOf(find(says, (n) => n.type === "pre")), identity.join("\n"), "every line of the block it starts with");

  // A save that stays on its side of the line says nothing of it.
  tree = drawTab();
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "10 Pier St, Brooklyn, NY 11201");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-address-note"), null);
});

test("only one editor is open at a time: a clean one gives way, one holding changes asks first", () => {
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"]);
  openFold(tree, "address");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "the clean one gave way");
  assert.ok(byTestId(tree, "rec-row-website"), "and is its row again");

  typeInto(tree, "address", "10 Pier St");
  // Pressed at once, before the page has drawn again: the keystroke is already what the registry reads.
  openFold(tree, "name");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "one holding changes stays open until it is answered");
  assert.match(textOf(byTestId(tree, "rec-inline-address-ask-confirm")), /Discard your changes\?/, "and asks, beside its changes");
  press(byTestId(tree, "rec-inline-address-ask-no"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"]);
  assert.equal(boxOf(tree, "address").props.value, "10 Pier St", "keep editing keeps what was typed");

  openFold(tree, "name");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-address-ask-yes"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["name"], "discarded, the row asked for opens");
  openFold(tree, "address");
  tree = redrawTab();
  assert.equal(boxOf(tree, "address").props.value, melany.address, "and what was thrown away is gone: it opens on what is stored");
});

test("Cancel with changes asks first; with none it closes at once; Escape is Cancel, and Ctrl or Cmd with Enter saves", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "nothing changed, nothing asked");

  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "the Settings rail and the browser ask before this is thrown away");
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"], "not thrown away yet");
  assert.match(textOf(byTestId(tree, "rec-inline-website-cancel-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-inline-website-cancel-no"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-website-cancel-confirm"), null);
  assert.equal(boxOf(tree, "website").props.value, "https://melanys.example");

  const key = (k, over = {}) => ({ key: k, defaultPrevented: false, metaKey: false, ctrlKey: false, currentTarget: { contains: () => true }, target: {}, preventDefault() { this.defaultPrevented = true; }, ...over });
  inline(tree, "website").props.onKeyDown(key("Escape"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"), "Escape asks, as Cancel does");
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), []);
  assert.equal(W.__settingsUnsaved(), false);
  assert.equal(sent.length, 0);

  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  inline(tree, "website").props.onKeyDown(key("Enter"));
  assert.equal(sent.length, 0, "Enter alone does not save");
  inline(tree, "website").props.onKeyDown(key("Enter", { ctrlKey: true }));
  assert.equal(sent.length, 1, "Ctrl or Cmd with Enter does");
});

test("answered with Keep editing, an ask gives focus back to the box, whichever ask it was", () => {
  // The stub attaches no ref, so the test stands in for the element React would have put there: the box, the one
  // thing in it Tab stops at.
  const focused = [];
  const box = { tabIndex: 0, disabled: false, value: "", getClientRects: () => [{}], classList: { contains: () => false }, closest: () => null, focus: () => focused.push("box"), setSelectionRange() {} };
  const body = { querySelectorAll: () => [box] };
  const element = { querySelector: (sel) => (sel === ".rec-inline-body" ? body : null), contains: () => true };
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  inline(tree, "website").props.ref.current = element;
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();

  // Cancel's own ask: "Yes, discard" had focus, and "Keep editing" takes the ask away.
  cancelRow(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-cancel-no"));
  tree = redrawTab();
  assert.deepEqual(focused, ["box"], "back in the box, not at the top of the document");

  // The registry's ask, from another row's act: the same.
  openFold(tree, "name");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-ask-no"));
  tree = redrawTab();
  assert.deepEqual(focused, ["box", "box"]);
  assert.deepEqual(openRows(tree), ["website"]);

  // Typing takes Cancel's ask away too, with focus in the box being typed in: it is left there, its caret with it. The
  // refocus once fired whenever an ask went, so the caret jumped to the end after one keystroke.
  const doc = globalThis.document;
  const was = doc.activeElement;
  try {
    cancelRow(tree, "website");
    tree = redrawTab();
    assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"));
    doc.activeElement = box;
    typeInto(tree, "website", "https://melanys.example/h");
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-inline-website-cancel-confirm"), null, "a keystroke is an answer: keep editing");
    assert.deepEqual(focused, ["box", "box"], "and focus that was never lost is not moved");
  } finally {
    doc.activeElement = was;
  }
});

test("Save stays a button focus can rest on while it saves, and a press meanwhile sends nothing more", () => {
  const sent = [];
  let accept = null;
  W.__saveSettings = (config, version, accepted) => { sent.push(config); accept = accepted; return new Promise(() => {}); };
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  const busy = byTestId(tree, "rec-inline-save-website");
  // Not `disabled`: a disabled button lets go of focus, to the page (record-fold.jsx).
  assert.deepEqual([busy.props.disabled, busy.props["aria-disabled"], busy.props["aria-busy"], textOf(busy)], [undefined, true, true, "Saving…"]);
  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  accept();
  assert.deepEqual(openRows(redrawTab()), [], "the moment the server accepts, the editor closes");
});

test("a save in progress is not an open, unsaved editor: its box takes no typing, and what is asked of it waits for the save's answer", async () => {
  // Task 3.2's review. The box stayed editable under "Saving…", and what was typed then was dropped without a word
  // when the save landed; another row's act still asked "Discard your changes?", and a yes stopped nothing.
  const sent = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__saveSettings = (config, version, accepted) => new Promise((answer) => { sent.push({ config: structuredClone(config), accept: () => accepted({ config: structuredClone(config), version: version + 1 }), answer }); });
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "website").props.readOnly, undefined, "the person's, until it is sent");
  saveRow(tree, "website");
  tree = redrawTab(flash);
  assert.equal(inline(tree, "website").props["aria-busy"], true, "the editor says it is busy");
  assert.equal(boxOf(tree, "website").props.readOnly, true, "and its box is read-only: never disabled, which lets go of focus");
  assert.equal(boxOf(tree, "website").props.disabled, undefined);
  typeInto(tree, "website", "https://typed-while-saving.example");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "website").props.value, "https://melanys.example", "what is on its way is what the box holds");

  // Another row's act, and the standing line's door, which both ask the registry: no question is drawn over a change
  // that is on its way, the editor stays, and the rail is told a save is out, to ask in its own words.
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["website"], "it does not give way while its save is out");
  assert.equal(byTestId(tree, "rec-inline-website-ask-confirm"), null, "and nothing asks whether to discard what is being saved");
  assert.deepEqual([W.__settingsUnsaved(), W.__settingsSaving()], [true, true]);
  const unload = { type: "beforeunload", prevented: false, preventDefault() { this.prevented = true; } };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab goes with the request");

  // Taken: the editor closes, and the row that was asked for opens.
  sent[0].accept();
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["address"], "the save's answer was the answer");
  assert.equal(sent[0].config.brain.profile.website, "https://melanys.example", "and what was sent is what was typed before Save");
  assert.deepEqual([W.__settingsUnsaved(), W.__settingsSaving()], [false, false]);

  // Refused: the question is drawn then, and is true again; the box is the person's, with what was typed.
  tree = drawTab({ flash });
  sent.length = 0;
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  tree = redrawTab(flash);
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-inline-website-ask-confirm"), null);
  sent[0].answer({ ok: false, code: "conflict", message: "Someone else saved settings after you loaded them — reload and reapply." });
  await settle();
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["website"]);
  assert.match(textOf(byTestId(tree, "rec-inline-website-ask-confirm")), /Discard your changes\?/, "nothing was saved, so the ask is drawn, and says so truly");
  assert.deepEqual([boxOf(tree, "website").props.readOnly, boxOf(tree, "website").props.value], [undefined, "https://melanys.example"]);
  assert.equal(W.__settingsSaving(), false);

  // The choice of number is held the same way while its row saves.
  tree = drawTab({ flash, brain: { phone_display: "(646) 555-0100" }, resolved: KNOWN });
  sent.length = 0;
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  const choice = () => byTestId(tree, "rec-inline-phone_display-choice");
  press(find(choice(), (n) => n.props?.role === "radio" && textOf(n) === "Your line"));
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  const other = find(choice(), (n) => n.props?.role === "radio" && textOf(n) === "A different number");
  assert.equal(other.props["aria-disabled"], true);
  press(other);
  tree = redrawTab(flash);
  assert.equal(find(choice(), (n) => n.props?.role === "radio" && n.props["aria-checked"]).props.children.join(""), "Your line", "a press while it saves chooses nothing");
});

/* ------------------------------------ the tab's one saver ------------------------------------ */

const google = "2581 Pitkin Ave, Brooklyn, NY 11208, USA";
/** A record Google lists at another address and under another name: two presses, one on each row. */
const disputed = () => ({ profile: { ...melany, address: "2581 Pitkin Avenue" }, resolved: { ...KNOWN, listing: { name: "Melany's Salon & Spa", address: google } } });
const useOn = (tree, row) => press(find(byTestId(tree, `rec-row-${row}`), (n) => n.type === "button" && textOf(n) === "Use Google's"));

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
  assert.deepEqual(sent.map((s) => s.version), [7, 8], "in order, each on the version before it");
  assert.equal(sent[1].config.brain.profile.address, google, "the second carries the first's change");
  assert.equal(sent[1].config.brain.business_name, "Melany's Salon & Spa");
  assert.deepEqual(flashes.map((f) => f.tone || "ok"), ["ok", "ok"], "neither is refused");

  // Pressed again before the settings read brings the change back, the address press would write what is there now.
  tree = redrawTab(flash);
  useOn(tree, "address");
  assert.equal(sent.length, 2, "a patch that would change nothing is not sent");
});

test("a save made while another is out waits its turn, and its row says it is saving meanwhile", () => {
  const sent = [];
  const held = [];
  W.__saveSettings = (config, v, accepted) => {
    sent.push({ config: structuredClone(config), version: v });
    return new Promise(() => { held.push(() => accepted({ config: structuredClone(config), version: v + 1 })); });
  };
  let tree = drawTab(disputed());
  useOn(tree, "address");
  tree = redrawTab();
  useOn(tree, "name");
  tree = redrawTab();
  assert.equal(sent.length, 1, "the second waits while the first is out");
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-save-website").props["aria-busy"], true, "a row whose save waits its turn says it is saving");
  held[0]();
  assert.deepEqual(sent.map((s) => s.version), [7, 8], "the first taken, the next goes on its answer");
  held[1]();
  assert.deepEqual(sent.map((s) => s.version), [7, 8, 9]);
  assert.equal(sent[2].config.brain.profile.website, "https://melanys.example");
  assert.equal(sent[2].config.brain.business_name, "Melany's Salon & Spa", "every change before it, carried");
  assert.equal(sent[2].config.brain.profile.address, google);
});

test("a patch that edits a nested object in place is still sent, and the settings read keeps what the server holds", () => {
  // Task 3.2's review. A patch was handed shallow copies, so one that changed a nested object in place
  // (p.booking_rules.lead_hours = 5) changed the config it was compared with too: the saver found nothing to send, the
  // row closed as if saved, and the settings read showed a value no server held.
  const sent = saving();
  const flashes = [];
  drawTab();
  const stored = structuredClone(W.__SETTINGS.config);
  const inPlace = (b, p) => { p.booking_rules.lead_hours = 5; b.profile = p; return b; };
  let closed = 0;
  W.__businessTabSave.saver.save({ row: "booking_rules", change: inPlace, said: "Saved", done: () => { closed += 1; }, flash: (f) => flashes.push(f) });
  assert.equal(sent.length, 1, "sent, where it once compared equal to what it changed and nothing went");
  const rules = { ...stored.brain.profile.booking_rules, lead_hours: 5 };
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, profile: { ...stored.brain.profile, booking_rules: rules } } });
  assert.deepEqual(W.__SETTINGS.config, stored, "and the read is what the server held, not the unsaved value");
  assert.deepEqual([closed, flashes.map((f) => f.tone || "ok")], [1, ["ok"]]);

  // What a row will say is worked out on the same copy (patched), so its preview leaves the read alone too.
  const next = W.__businessTabSave.patched(W.__SETTINGS.config, { change: inPlace });
  assert.equal(next.brain.profile.booking_rules.lead_hours, 5);
  assert.deepEqual(W.__SETTINGS.config, stored, "the config a patch is applied to is never the one it changes");
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
  assert.deepEqual(sent.map((s) => s.version), [7]);
  // Another Settings tab, and back: the page goes, and a new one is drawn over the same settings read.
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash });
  useOn(tree, "name");
  assert.deepEqual(sent.map((s) => s.version), [7, 8], "on the answer the server gave the first, not the read before it");
  assert.equal(sent[1].config.brain.profile.address, google, "carrying the first's change");
  assert.deepEqual(flashes.map((f) => f.tone || "ok"), ["ok", "ok"], "neither is refused");

  // A save waiting its turn when the page goes is the new page's too: its row says so, and it goes when its turn comes.
  const held = [];
  W.__saveSettings = (config, v, accepted) => {
    sent.push({ config: structuredClone(config), version: v });
    return new Promise(() => { held.push(() => accepted({ config: structuredClone(config), version: v + 1 })); });
  };
  tree = drawTab(disputed());
  sent.length = 0;
  useOn(tree, "address");
  tree = redrawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab();
  saveRow(tree, "website");
  assert.equal(sent.length, 1, "the website waits while the address is out");
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
  assert.equal(byTestId(tree, "rec-inline-save-website").props["aria-busy"], true, "the new page's row says it is saving");
  held[0]();
  assert.deepEqual(sent.map((s) => s.version), [7, 8], "and it goes on the first's answer when the first is taken");
  assert.equal(sent[1].config.brain.profile.website, "https://melanys.example");
});

/** Stand in for the bridge's PUT, holding each save until the test takes it (`accept`) or answers it (`answer`). */
const holding = () => {
  const sent = [];
  W.__saveSettings = (config, version, accepted) => new Promise((answer) => {
    sent.push({ config: structuredClone(config), version, accept: () => accepted({ config: structuredClone(config), version: version + 1 }), answer });
  });
  return sent;
};

test("the saver's base is the config the next save goes on: the read, with each save out or waiting applied as if taken", async () => {
  const S = W.__businessTabSave;
  const sent = holding();
  drawTab();
  const read = W.__SETTINGS.config;
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
  sent[0].answer({ ok: false, code: "conflict", message: "Someone else saved settings after you loaded them — reload and reapply." });
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
  const bare = { handoff_number: "+16465550100", booking_rules: { lead_hours: 2 }, guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true } };
  const sparse = { ...bare, website: "https://bella.example", address: "12 Main St, Brooklyn, NY" };
  assert.deepEqual([hasProfile(sparse), hasProfile({ ...bare, address: sparse.address }), hasProfile(bare)], [true, true, false], "only the website and the address compose");

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
  const out = (row, value) => S.saver.save({ row, change: S.PATCH_OF[row](value), said: "Saved", done: () => {}, flash: () => {} });
  let sent = holding();
  let tree = drawTab({ profile: sparse, resolved: KNOWN });
  tree = empty(tree, "website");
  assert.equal(byTestId(tree, "rec-inline-says-website-note"), null, "the address still composes: emptying the website crosses nothing");
  cancelRow(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  out("website", "");
  assert.equal(sent.length, 1);
  tree = redrawTab();
  tree = empty(tree, "address");
  assert.equal(textOf(byTestId(tree, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.stops, "said before the address's save goes");
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
  assert.deepEqual(sent.map((s) => s.version), [7, 8]);
  assert.equal(hasProfile(sent[1].config.brain.profile), false);

  // And the other way: with the first field's save out, the second is not said to start what the first already has.
  sent = holding();
  tree = drawTab({ profile: bare, resolved: KNOWN });
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://bella.example");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-inline-says-website-note")), PROFILE_CROSSING_WORDS.starts);
  cancelRow(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  out("website", "https://bella.example");
  tree = redrawTab();
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "12 Main St, Brooklyn, NY");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-inline-says-address"), "it says the address line it adds");
  assert.equal(byTestId(tree, "rec-inline-says-address-note"), null, "and nothing of a line the website's save already crossed");
  await settle();
});

test("a rename made on top of another is told against the name that one saves, and waits for it", () => {
  // The Name row's blocks, and the product's own lines it writes again, are read on the saver's base too: with Google's
  // name taken and not read back yet, a second rename replaces that name, not the one the page was drawn with. And
  // while Google's name is still out, the row's own save is: its editor opens, takes no typing, and its Save waits.
  const was = "Melany's Beauty Salon";
  const google = "Melany's Salon & Spa";
  const now = "Melany's Studio";
  const baselineOf = (name) => newReceptionistDefaults(name).system_prompt;
  const naming = (brain, name) => [
    ...composed("business_name", brain).filter((l) => l.includes(name)),
    ...composed("system_prompt", brain).filter((l) => l.includes(name)),
  ].join("\n");
  const sent = holding();
  let tree = drawTab({ brain: { system_prompt: baselineOf(was) }, resolved: { ...KNOWN, listing: { name: google, address: null } } });
  const stored = W.__SETTINGS.config.brain;
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.equal(sent.length, 1, "Google's name is out");
  tree = redrawTab();
  openFold(tree, "name");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-save-name").props["aria-busy"], true, "the row's own name is out, so its Save waits");
  assert.equal(boxOf(tree, "name").props.readOnly, true, "and its box takes no typing meanwhile");
  typeInto(tree, "name", now);
  tree = redrawTab();
  assert.equal(boxOf(tree, "name").props.value, was, "nothing typed under a save that is out is held, to be dropped when it lands");
  sent[0].accept();
  tree = redrawTab();
  assert.equal(boxOf(tree, "name").props.readOnly, undefined, "taken, the box is the person's again");
  typeInto(tree, "name", now);
  tree = redrawTab();
  const saving = { ...stored, business_name: google, system_prompt: baselineOf(google) };
  const after = { ...stored, business_name: now, system_prompt: baselineOf(now) };
  assert.equal(naming(after, now).split("\n").length, 2, "the line it opens with, and the product's lines");
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-name")), [["It will say", naming(after, now)], ["It will no longer say", naming(saving, google)]]);
  assert.equal(naming(stored, was).split("\n").length, 2);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-inline-says-name")), new RegExp(escape(was)), "the name the page was drawn with is already going");
  saveRow(tree, "name");
  assert.deepEqual(sent[1].config.brain, after, "and the save writes what it said");
});

test("a save the server refuses is said in its words, and the editor stays open with what was typed", async () => {
  const sent = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const refusal = "Someone else saved settings after you loaded them — reload and reapply.";
  W.__saveSettings = (config, version) => {
    sent.push({ config, version });
    return Promise.resolve({ ok: false, code: "conflict", message: refusal });
  };
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  assert.equal(sent.length, 1, "sent once");
  assert.deepEqual(openRows(tree), ["website"], "the editor is still open");
  assert.equal(boxOf(tree, "website").props.value, "https://melanys.example", "with its draft");
  assert.equal(byTestId(tree, "rec-inline-save-website").props["aria-busy"], undefined, "and Save is not busy");
  assert.deepEqual([flashes.length, flashes[0].tone, textOf(flashes[0].msg)], [1, "danger", refusal], "the toast carries the server's words, and nothing said it was saved");
});

test("a save whose promise fails before the server takes it says so, and leaves the row ready to try again", async () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__saveSettings = () => Promise.reject(new Error("The network went away."));
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://melanys.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  const save = byTestId(tree, "rec-inline-save-website");
  assert.equal(save.props["aria-busy"], undefined, "not saving for good");
  assert.deepEqual(openRows(tree), ["website"], "still open");
  assert.equal(boxOf(tree, "website").props.value, "https://melanys.example", "with what was typed");
  assert.deepEqual([flashes.at(-1).tone, textOf(flashes.at(-1).msg)], ["danger", "The network went away."]);
  cancelRow(tree, "website");
  tree = redrawTab(flash);
  assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"), "and Cancel still asks, where it did nothing before");
});

test("the old card's one-key save lets go the same way when its save fails before the server takes it", async () => {
  // useFieldSave, which the old card's two number rows (settings.jsx) take from window until Task 3.7 retires them.
  unmount();
  W.__SETTINGS = settings();
  const flashes = [];
  let field;
  const Row = () => { field = W.useFieldSave((f) => flashes.push(f)); return null; };
  const redrawRow = () => again(() => W.React.createElement(Row));
  W.React.createElement(Row);
  const publish = (b) => { b.phone_display = "+16465550100"; return b; };
  for (const [fails, words] of [
    [() => Promise.reject(new Error("The network went away.")), "The network went away."],
    [() => { throw new Error("The save could not be sent."); }, "The save could not be sent."],
  ]) {
    W.__saveSettings = fails;
    field[1](publish, "Saved.", () => assert.fail("nothing was saved"));
    redrawRow();
    assert.equal(field[0], true, "busy while the save is out");
    await settle();
    redrawRow();
    assert.equal(field[0], false, words);
    assert.deepEqual([flashes.at(-1).tone, textOf(flashes.at(-1).msg)], ["danger", words]);
  }
  unmount();
});

test("the number it gives out: your line stores nothing, and a different number is checked, then stored as typed", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  assert.match(textOf(byTestId(tree, "rec-row-phone_display")), /\+1 \(308\) 336-8109/);
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  const radios = (t) => all(byTestId(t, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio");
  assert.deepEqual(radios(tree).map((r) => [textOf(r), r.props["aria-checked"]]), [["Your line", true], ["A different number", false]]);
  assert.match(textOf(byTestId(tree, "rec-inline-phone_display-note")), /\+1 \(308\) 336-8109 — the line your receptionist answers/);
  press(radios(tree)[1]);
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "phone_display").props.value, "+1 (308) 336-8109", "a different number starts from the line, as people write it");
  assert.match(textOf(byTestId(tree, "rec-inline-phone_display-note")), /That is your line/);
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
  assert.match(textOf(inline(tree, "phone_display")), /There is no line yet, so the receptionist needs a number to give out\./);
  typeInto(tree, "phone_display", "(646) 555-0100");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.equal(sent.at(-1).config.brain.phone_display, "(646) 555-0100");

  // A number typed before, put back to the line: the key goes, and the line is what it gives out from then on.
  tree = drawTab({ flash, brain: { phone_display: "(646) 555-0100" } });
  const typed = structuredClone(W.__SETTINGS.config);
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
  typeInto(tree, "website", "https://melanys.example");
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
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "handoff_number").props.value, "+1 (646) 932-5775", "a change starts from the number as it is shown");
  typeInto(tree, "handoff_number", "646 555 0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /needs the country code/);
  typeInto(tree, "handoff_number", "+1 (308) 336-8109");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /the receptionist's own line/, "never the line it answers on");
  assert.equal(sent.length, 0);
  typeInto(tree, "handoff_number", "+1 (646) 555-0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, profile: { ...stored.brain.profile, handoff_number: "+16465550199" } } });
  assert.equal(textOf(flashes.at(-1).msg), "Callers who insist on a person reach +1 (646) 555-0199.");
});

/* ------------------------------------ who may change it ------------------------------------ */

test("a viewer reads everything, is offered no act, and is told why once", () => {
  // data-bits' real gate, over contracts' role table (roleGate): the role is the store's.
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  try {
    const sent = saving();
    const google = "2581 Pitkin Ave, Brooklyn, NY 11208, USA";
    const tree = drawTab({ profile: { ...melany, tone: undefined, address: "2581 Pitkin Avenue" }, resolved: { ...KNOWN, listing: { name: "Melany's Beauty Salon", address: google } } });
    assert.deepEqual(all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")), [], "no row offers a change");
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(all(tree, (n) => ownWords(n).includes(why)).length, 1, "the reason is said once");
    assert.match(textOf(byTestId(tree, "bt-viewer")), /You can read everything\./);
    assert.match(textOf(byTestId(tree, "rec-row-name")), /Melany's Beauty Salon/, "and everything is there to read");

    const band = byTestId(tree, "rec-standing");
    assert.match(textOf(band), /no voice of its own/i, "the gap is still named");
    assert.equal(find(band, (n) => typeof n.props?.onClick === "function"), null, "with no door to a row that would not open");

    // A disagreement is still there to read, and, like each row's act, its press is absent rather than refused: the
    // States board's "Each row's act is simply absent".
    const address = byTestId(tree, "rec-row-address");
    const minor = W.__FACTS.conflicts.find((k) => k.fact === "address");
    assert.match(textOf(address), new RegExp(escape(minor.sentence)), "the resolver's own sentence, on the row");
    assert.ok(find(address, (n) => classes(n).includes("pill-warn")));
    assert.equal(find(address, (n) => n.type === "button" && classes(n).includes("btn")), null, "and no press, not even a refused one");
    // The serious one too: its row still washes warn, and still offers nothing.
    const serious = drawTab({ brain: { phone_display: "(646) 932-5775" }, resolved: KNOWN });
    const published = byTestId(serious, "rec-row-phone_display");
    assert.equal(published.props["data-state"], "warn");
    assert.match(textOf(published), /which is the number it transfers to/);
    assert.equal(find(published, (n) => n.type === "button"), null);
    assert.equal(sent.length, 0);
    // And nothing opens an editor for it.
    W.__recordFolds.request("website");
    assert.deepEqual(openRows(redrawTab()), []);
  } finally {
    delete W.ST_STORE;
  }
});

test("a name the workspace goes by is shown against the business's, and never offered in its place", () => {
  // Resolved as the settings read resolves it: no Google listing, and a workspace named in a Stripe test.
  const tree = drawTab({ resolved: { ...KNOWN, workspace: { name: "Billing probe", timezone: "America/New_York" } } });
  const row = byTestId(tree, "rec-row-name");
  const conflict = W.__FACTS.conflicts.find((k) => k.fact === "business_name");
  assert.equal(conflict.knownSource, "workspace", "the fixture is the workspace's own name");
  assert.match(textOf(row), /this workspace is named Billing probe/, "the disagreement is on the row, in the resolver's words");
  assert.equal(find(row, (n) => n.type === "button" && classes(n).includes("btn")), null, "with no press that would rename the business to it");
  assert.equal(textOf(byTestId(tree, "rec-row-act-name")), "Change", "the name is still changed the one way, by typing it");

  // Google's answer is a fill: one press takes it.
  const listed = drawTab({ resolved: { ...KNOWN, listing: { name: "Melany's Salon & Spa", address: null } } });
  assert.ok(find(byTestId(listed, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
});

/* ------------------------------------ the standing line's door ------------------------------------ */

test("the standing line's door opens the row it names, and that row asks before its changes go like any other", () => {
  let tree = drawTab({ profile: without(melany, "address"), facts: { address: { value: null, source: "absent" } } });
  const gap = standingLine(W.__SETTINGS.config.brain).missing;
  assert.equal(gap.row, "address");
  const door = byTestId(byTestId(tree, "rec-standing"), "rec-standing-door");
  assert.equal(textOf(door), gap.sentence, "the gap's own words are its door");
  // And a screen reader hears where it goes, not only a statement: the sentence, then the act of the row it opens.
  const heard = (b) => b.props["aria-labelledby"].split(" ").map((id) => find(tree, (n) => n.props?.id === id)).filter(Boolean).map(textOf).join(" ");
  assert.equal(heard(door), `${gap.sentence} Add one Address`);
  press(door);
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"]);
  typeInto(tree, "address", "2581 Pitkin Ave, Brooklyn, NY 11208");
  tree = redrawTab();
  // The door knows only the row's id. What it opened is guarded as the row's own act would have guarded it, by the
  // row's own dirty test: the Settings rail asks, the browser asks, and another row's act waits on an answer.
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  const unload = { type: "beforeunload", returnValue: undefined, prevented: false, preventDefault() { this.prevented = true; } };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab closes");
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "another row's act does not throw the changes away");
  assert.ok(byTestId(tree, "rec-inline-address-ask-confirm"), "it asks first, beside them");
  assert.equal(boxOf(tree, "address").props.value, "2581 Pitkin Ave, Brooklyn, NY 11208");

  // A row this page does not draw yet is asked for by its id, for the fold that draws it to open, and its door is named
  // by its sentence alone.
  tree = drawTab({ profile: { ...melany, tone: undefined } });
  const toTone = byTestId(byTestId(tree, "rec-standing"), "rec-standing-door");
  assert.equal(heard(toTone), standingLine(W.__SETTINGS.config.brain).missing.sentence);
  press(toTone);
  assert.equal(W.__recordFolds.open(), "tone");
});
