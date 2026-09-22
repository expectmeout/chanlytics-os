/**
 * Settings › Business, the page, as every test of it draws it: the stub React, the app's globals as the bridge publishes
 * them, every legacy file both load lists carry, the bridge installed from its real module, Melany's record as the
 * settings read hands it over, and the presses a person makes. Not named *.test.mjs, so the runner skips it: the page's
 * own tests (business-tab-page.test.mjs) and each card's (business-tab-open.test.mjs) import it and share one page.
 *
 * Every claim in those files is something the page drew, or something a press on it sent: no source-text assertions.
 * The page draws from what the settings read hands over (`__SETTINGS`, with the preview the server resolved, and
 * `__FACTS`), and every sentence with a judgement in it is contracts', through the bridge the app installs
 * (legacy-bridge/business-tab.ts). A save goes through a stand-in for the bridge's versioned PUT (saving()) that records
 * what it was sent and says the server accepted it.
 *
 * Each test file ends with `after(() => unmount())`: the last page drawn goes as React would take it away, since the
 * calendar row keeps one timer for as long as the Calendar page keeps a read (five minutes), and left on it would hold
 * the file's process open for as long.
 */
import { stateOf, roleGate, formatPhoneDisplay, whyNotAPhone, whyNotAHandoff, samePhone, handoffE164, resolveFacts, factConflicts, newReceptionistDefaults, hoursLines, timezoneWords, timezoneCity, knownTimezones, DEFAULT_TIMEZONE, MAX_INTERVALS_PER_DAY, MAX_CLOSURES, instructionsDraft, INSTRUCTIONS_MAX, fallbackMessages, FALLBACK_DEFAULTS, unknownDetails } from "@chanlytics/contracts";
import { installLegacyReact, again, unmount, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";

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
  // When you're open: the composer's own run-collapsing and the caps the write schema keeps (inbox-verbs.ts), and the
  // zone's words (identity.ts). This device is in Chicago.
  __hoursLines: hoursLines,
  __configLimits: { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES },
  __tz: { words: timezoneWords, city: timezoneCity, known: knownTimezones, device: () => "America/Chicago" },
  DEFAULT_TIMEZONE,
  // How it answers: what the instructions box opens with and how much it holds, and the three messages sent in the
  // business's name, their default wording and the details a message may name (inbox-verbs.ts).
  __instructionsDraft: instructionsDraft,
  __instructionsMax: INSTRUCTIONS_MAX,
  __fallbackMessages: fallbackMessages,
  __fallbackDefaults: FALLBACK_DEFAULTS,
  __unknownDetails: unknownDetails,
});
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/components/record-row.jsx`);
await import(`${L}/components/record-field.jsx`);
await import(`${L}/components/record-fold.jsx`);
await import(`${L}/components/record-sheet.jsx`);
// The Calendar page, which loads before the tab in both lists: it publishes how long it keeps a read and its words for
// a read that gives no reason (window.__calendarPage), which the tab's calendar row keeps too.
await import(`${L}/pages/calendar-real.jsx`);
// What the tab's saves write and the one saver they go through, before the page, as both load lists have them.
await import(`${L}/pages/business-tab-save.jsx`);
await import(`${L}/pages/business-tab-folds.jsx`);
// The page's two gestures, then each card, then the page: the order both load lists keep.
await import(`${L}/pages/business-tab-gestures.jsx`);
await import(`${L}/pages/business-tab-who.jsx`);
await import(`${L}/pages/business-tab-open.jsx`);
await import(`${L}/pages/business-tab-offer.jsx`);
await import(`${L}/pages/business-tab-answers.jsx`);
await import(`${L}/pages/business-tab-services.jsx`);
// The card a workspace with no receptionist is shown, which PaneWorkspace draws in the page's place
// (business-tab-create.test.mjs draws it); in both load lists here, after the cards and before the page.
await import(`${L}/pages/business-tab-create.jsx`);
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

const settings = (profile = melany, over = {}, brain = {}, zone = "America/New_York") => ({
  version: 7,
  config: { brain: brainOf(profile, brain), calendar: { ical_url: "https://app.chanlytics.com/api/v1/calendar/filler.ics" }, ...over },
  // Beside the config, the settings read hands over its preview, with the inputs it was resolved with.
  prompt: composePromptPreview(brainOf(profile, brain), { tz: zone, policy: {}, known: { ...KNOWN, workspace: { ...KNOWN.workspace, timezone: zone } }, openings: null }),
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
 * resolveFacts). `config` replaces parts of the config beside the brain (the calendar's address), and `zone` is the
 * workspace's, which the settings read resolved the preview in.
 */
const drawTab = ({ profile = melany, conflicts = [], flash = () => {}, brain = {}, facts: known = {}, resolved = null, config = {}, zone = "America/New_York" } = {}) => {
  W.__SETTINGS = settings(profile, config, brain, zone);
  if (resolved) {
    const f = resolveFacts(W.__SETTINGS.config.brain, resolved);
    W.__FACTS = { facts: f, conflicts: factConflicts(f) };
  } else {
    W.__FACTS = facts({ conflicts, facts: known });
  }
  W.__WORKSPACES = [{ id: "t-melany", name: "Melany's Beauty Salon", timezone: zone }];
  W.__ACTIVE_WORKSPACE = "t-melany";
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  // The zone's own door outlives the page too, and a zone the last test left out is not this record's.
  W.__businessTabSave.zone.reset();
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

/** A fold, drawn whether it is open or not; closed, it is hidden. */
const foldOf = (tree, id) => byTestId(tree, `rec-fold-${id}`);
const openFolds = (tree) => all(tree, (n) => /^rec-fold-[a-z_]+$/.test(n.props?.["data-testid"] || "") && !n.props.hidden).map((n) => n.props["data-testid"].slice("rec-fold-".length));
const saveFoldOf = (tree, id) => press(byTestId(tree, `rec-fold-save-${id}`));
const cancelFoldOf = (tree, id) => press(byTestId(tree, `rec-fold-cancel-${id}`));
/** A box by the name a screen reader hears, and typing into it the way a person does. */
const labelled = (tree, label) => find(tree, (n) => (n.type === "input" || n.type === "textarea") && n.props["aria-label"] === label);
const typeAt = (tree, label, text) => labelled(tree, label).props.onChange({ target: { value: text } });
/** What a box in a row of a list says is wrong with it: the kit's FieldError under the box (RecordBox), or null. */
const problemUnder = (tree, boxTestid) => { const box = byTestId(tree, boxTestid); return box ? find(box, (n) => n.type === W.FieldError) : null; };
const dayOf = (tree, d) => byTestId(tree, `rec-hours-day-${d}`);
const written = (config) => structuredClone(config);

export { KNOWN, W, boxOf, brainOf, cancelFoldOf, cancelRow, composePromptPreview, composed, dayOf, drawTab, escape, facts, foldOf, inline, labelled, melany, openFold, openFolds, openRows, ownWords, partsOf, problemUnder, redrawTab, saveFoldOf, saveRow, saving, settings, typeAt, typeInto, went, without, written };
