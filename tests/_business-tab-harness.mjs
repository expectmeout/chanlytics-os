/**
 * Settings › Business, the page, as every test of it draws it: the stub React, the app's globals as the bridge publishes
 * them, every file both load lists carry, the bridge installed from its real module, Marisa's record as the
 * settings read hands it over, and the presses a person makes. Not named *.test.mjs, so the runner skips it: the page's
 * own tests (business-tab-page.test.mjs) and each card's (business-tab-open.test.mjs) import it and share one page.
 *
 * Every claim in those files is something the page drew, or something a press on it sent: no source-text assertions.
 * The page draws from what the settings read hands over, on the seam alone (the record, with the preview the server
 * resolved: landSettings; the facts: landFacts), and every sentence with a judgement in it is contracts', through the bridge the app installs
 * (bridge/business-tab.ts). A save goes through a stand-in for the bridge's versioned PUT (saving()) that records
 * what it was sent and says the server accepted it.
 *
 * Each test file ends with `after(() => unmount())`: the last page drawn goes as React would take it away, since the
 * calendar row keeps one timer for as long as the Calendar page keeps a read (five minutes), and left on it would hold
 * the file's process open for as long.
 */
import {
  stateOf,
  roleGate,
  zoneSearchWords,
  resolveFacts,
  factConflicts,
  timezoneWords,
  timezoneCity,
  knownTimezones,
  setupSteps,
} from "@chanlytics/contracts";
import { installStubReact, again, unmount, all, find, byTestId, textOf, classes, press } from "./_stub-react.mjs";

installStubReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
const went = [];
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  canDo: () => true,
  gate: () => ({}),
  usePPToast: () => [null, () => {}],
  // As the bridge publishes them (seed-globals.ts): the role gate's words. The tab imports the rest of its helpers
  // (contracts' phone checks, link normalizer and receptionist defaults), so a test draws it with the real ones.
  __roleGate: roleGate,
  // The zone's words (identity.ts). This device is in Chicago.
  __tz: {
    words: timezoneWords,
    city: timezoneCity,
    known: knownTimezones,
    device: () => "America/Chicago",
    also: zoneSearchWords,
  },
});
(await import("../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The tab is TSX (surfaces/settings/business, decision 0015 step 11): every part on the window by its JSX name.
await import("./receptionist/business-tab/_business-parts.mjs");
const W = globalThis.window;
const { setSurfaceValue, surfaceValue } = await import("../apps/dashboard/src/surfaces/surface-values.ts");
/**
 * The settings read as the seam holds it once it lands (bridge/surfaces/settings.ts): the workspace's facts, which the
 * tab's rows read from there alone (settings/business/shell.ts factsNow; the bridge published them on the window too, as
 * `__FACTS`, until 11 Nov 2026), WhatsApp's rows (landTemplates) and the policy rows (landPolicies), beside the record
 * (landSettings), as the read lands all of them together. What a test put on the seam itself (a team, a message) stays.
 */
const landFacts = (held) =>
  setSurfaceValue("settings", {
    ...(surfaceValue("settings") ?? {}),
    facts: held,
    policies: policiesHeld,
    templatesAll: templatesHeld,
  });
/**
 * The record the settings read holds now (the seam's `settings`: its config, its version and the preview the server
 * resolved), which every reader of the page takes; a window global, `__SETTINGS`, until 12 Nov 2026. Undefined before the read.
 */
const settingsHeld = () => surfaceValue("settings")?.settings ?? undefined;
/** The settings read landing a record, the rest of that read as it stands (undefined: the read not landed yet). */
const landSettings = (record) => setSurfaceValue("settings", { ...(surfaceValue("settings") ?? {}), settings: record });
/** WhatsApp's rows as the templates read last landed them: undefined is the read not landed yet, null one that failed. */
let templatesHeld;
/** The policy rows as the policies read last landed them: undefined is the read not landed yet, null one that failed. */
let policiesHeld;
/**
 * The policies read landing again by itself: the seam's rows alone change (the bridge published them on the window too,
 * as `__POLICIES`, until 12 Nov 2026). Answers the rows held before, to put back.
 */
const landPolicies = (rows) => {
  const was = policiesHeld;
  policiesHeld = rows;
  setSurfaceValue("settings", { ...(surfaceValue("settings") ?? {}), policies: rows });
  return was;
};
/**
 * The templates read landing again by itself, as it does when one is approved: the seam's rows alone change (the bridge
 * published them on the window too, as `__TEMPLATES_ALL`, until 11 Nov 2026). Answers the rows held before, to put back.
 */
const landTemplates = (rows) => {
  const was = templatesHeld;
  templatesHeld = rows;
  setSurfaceValue("settings", { ...(surfaceValue("settings") ?? {}), templatesAll: rows });
  return was;
};
/** The facts the page was drawn over, as the seam holds them. */
const factsHeld = () => surfaceValue("settings")?.facts;
// The tab's helpers, from the module the tab imports: the gap line, and what each row will tell the receptionist.
const { BUSINESS_TAB, loadSaveRules } = await import("../apps/dashboard/src/bridge/business-tab.ts");
// And the save's own rules, which the tab asks for as it mounts (business-tab.jsx): here before any page is drawn, as
// they are in the app by the time a fold is open.
await loadSaveRules();
// What the receptionist is told, read off the settings read as the tab reads it (inbox-verbs.ts composedPrompt, which
// the prompt sheet imports): a test that wants another answer writes the settings read's `prompt`.
const { composedPrompt } = await import("../apps/dashboard/src/bridge/inbox-verbs.ts");
// The settings read's own preview, built as the server builds it: a row's draft is resolved with its inputs (Task 3.1).
const { composePromptPreview } = await import("../apps/dashboard/src/server/receptionist/prompt-preview.ts");

/* ------------------------------------ the record ------------------------------------ */

/** Marisa's Beauty Salon: the live tenant's record, in made-up details, as the surface hands it over. */
const marisa = {
  address: "1200 Maple Ave, Brooklyn, NY 11208",
  website: "https://marisasbeautysalon.example.com",
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  hours: {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: { open: "09:30", close: "18:00" },
    thu: { open: "09:30", close: "18:00" },
    fri: { open: "09:30", close: "19:00" },
    sat: { open: "09:30", close: "19:00" },
    sun: {},
  },
  services: [
    { name: "Balayage", duration_min: 180, price_note: "quoted at consult" },
    { name: "Highlights", duration_min: 45, price_note: "quoted at consult" },
  ],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; appointments are recommended for long services." }],
  escalate_when: ["They ask for a person, for Marisa or for the owner", "They are upset, or have a complaint"],
  booking_rules: {
    lead_hours: 2,
    slot_min: 30,
    max_days_ahead: 14,
    party_max: 4,
    consult_first: ["Color correction", "Extensions"],
  },
  guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  handoff_number: "+12125550142",
};

/** The brain as stored. It parses, as every saved one does, or consequenceOf resolves nothing from it. */
const brainOf = (profile, over = {}) => ({
  business_name: "Marisa's Beauty Salon",
  booking_link: "https://book.example.com/en-us/4471902",
  system_prompt: "You are the WhatsApp assistant for Marisa's Beauty Salon. Answer warmly and briefly.",
  fallbacks: {
    greeting: "Hi! Someone will be with you shortly.",
    error: "Sorry, something went wrong on our side.",
    non_text: "Thanks, a person will look at this.",
  },
  profile,
  ...over,
});

/**
 * The workspace's connections, as /api/v1/setup hands them over and the bridge publishes them
 * (surfaces/setup/surface.ts, its surface). Both lines are present, active, have answered something and
 * were switched on by the owner, which is the three things capabilityStatus calls live. Texting is
 * on none of it: the line carries no approved registration, which is what `ready` needs.
 */
const SETUP = () => {
  const dto = {
    business: {
      name: "Marisa's Beauty Salon",
      hours: true,
      services: 2,
      bookingLink: true,
      address: true,
      handoff: "+12125550142",
      broken: false,
    },
    channels: {
      whatsapp: {
        present: true,
        active: true,
        number: "+13055550123",
        quality: "GREEN",
        lastInboundAt: "2026-09-21T15:00:00.000Z",
      },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-21T15:00:00.000Z" },
    },
    templates: { approved: 2, pending: 0, startersApproved: 2 },
    calendar: { state: "ok" },
    team: { members: 2, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 9, offers: 7, offersSaidYes: 8 },
    requests: { line: null },
    lines: {
      rows: [
        {
          id: "ln-marisa",
          e164: "+13055550123",
          kind: "local",
          provider: "twilio",
          area_code: 305,
          voice_state: "answering",
          sms_state: "none",
          whatsapp_state: "connected",
          port_state: "none",
          forwarding_state: "none",
          step: null,
          last_error: null,
          state_since: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      ready: true,
      provider: "twilio",
      costs: { local_number_month_usd: 1.15 },
    },
    activations: [
      { capability: "voice", activated_at: "2026-08-02T00:00:00.000Z", activated_by: "u-ruben", deactivated_at: null },
      {
        capability: "whatsapp",
        activated_at: "2026-08-02T00:00:00.000Z",
        activated_by: "u-ruben",
        deactivated_at: null,
      },
    ],
  };
  // Its view model as the Setup read builds it (setup/surface.ts, contracts setupSteps), never null: a read always has one.
  return { dto, role: "owner", vm: setupSteps({ ...dto, later: [] }), fetchedAt: Date.now() };
};

/**
 * The Autonomy matrix as the settings read lands it (the surface's `policies`): the modes a provisioned
 * workspace starts with (00017_provision_tenant), with nothing under the reply row's pause, which
 * is the common case -- most owners never set one, and the edge reads nothing as a day.
 */
const POLICIES = () => ({
  rows: [
    { class: "faq", mode: "auto", limits: {} },
    { class: "booking", mode: "auto", limits: {} },
    { class: "reply", mode: "auto", limits: { max_replies_day: 20 } },
    { class: "reengage", mode: "ask", limits: {} },
    { class: "campaign", mode: "ask", limits: {} },
    { class: "money", mode: "never", limits: {} },
  ],
  role: "owner",
});

/** The workspace's WhatsApp templates: the approved starter a call sends the booking link as. */
const TEMPLATES = () => [
  {
    name: "booking_link",
    language: "en_US",
    meta_status: "approved",
    channel: "whatsapp",
    variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
  },
];

/** What the platform knows: the voice line it provisioned, and the workspace. */
const KNOWN = {
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York" },
  channels: [{ kind: "voice", number_e164: "+13055550123", status: "active" }],
  listing: null,
};

const settings = (profile = marisa, over = {}, brain = {}, zone = "America/New_York") => ({
  version: 7,
  config: {
    brain: brainOf(profile, brain),
    calendar: { ical_url: "https://app.chanlytics.com/api/v1/calendar/filler.ics" },
    ...over,
  },
  // Beside the config, the settings read hands over its preview, with the inputs it was resolved with.
  prompt: composePromptPreview(brainOf(profile, brain), {
    tz: zone,
    policy: {},
    known: { ...KNOWN, workspace: { ...KNOWN.workspace, timezone: zone } },
    openings: null,
  }),
});

const facts = (over = {}) => ({
  facts: {
    business_name: { value: "Marisa's Beauty Salon", source: "verified" },
    phone_display: { value: "+1 (305) 555-0123", source: "provisioned" },
    booking_link: { value: "https://book.example.com/en-us/4471902", source: "typed" },
    address: { value: "1200 Maple Ave, Brooklyn, NY 11208", source: "verified" },
    website: { value: "https://marisasbeautysalon.example.com", source: "typed" },
    handoff_number: { value: "+12125550142", source: "typed" },
    voice_line: { value: "+13055550123", source: "provisioned" },
    whatsapp_line: { value: "+13055550123", source: "provisioned" },
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
 * workspace's, which the settings read resolved the preview in. `word` is what the workspace calls a booking (00458), as
 * the workspace list carries it: null, never picked, unless a test says otherwise.
 *
 * The record is three pages of Settings since 17 Oct 2026 (Details, Hours & booking, How it answers), with two of its
 * rows on Autonomy's Limits. What is drawn here is the record whole, as one page of the three parts in their order
 * (BusinessTab takes several), and the two limit rows after it (BusinessLimitRows), so a test finds every row where the
 * page it asks about puts it; `part` draws one page alone, as Settings does.
 */
const WHOLE_RECORD = ["workspace", "hours", "receptionist"];
const recordPage = (flash, part) =>
  part === WHOLE_RECORD
    ? W.React.createElement(
        W.React.Fragment,
        null,
        W.React.createElement(W.BusinessTab, { flash, part }),
        W.React.createElement(W.BusinessLimitRows, { flash }),
      )
    : W.React.createElement(W.BusinessTab, { flash, part });
let drawnPart = WHOLE_RECORD;
const drawTab = ({
  profile = marisa,
  conflicts = [],
  flash = () => {},
  brain = {},
  facts: known = {},
  resolved = null,
  config = {},
  zone = "America/New_York",
  word = null,
  setup = SETUP(),
  policies = POLICIES(),
  templates = TEMPLATES(),
  part = WHOLE_RECORD,
} = {}) => {
  drawnPart = part;
  landSettings(settings(profile, config, brain, zone));
  // What it can do reads three more surfaces: the connections the abilities run on, the Autonomy
  // matrix they are held by, and the templates a call sends the booking link as. Each is reset with
  // the record: what the last test left is not this one's.
  setSurfaceValue("setup", setup);
  policiesHeld = policies;
  templatesHeld = templates;
  if (resolved) {
    const f = resolveFacts(settingsHeld().config.brain, resolved);
    landFacts({ facts: f, conflicts: factConflicts(f) });
  } else {
    landFacts(facts({ conflicts, facts: known }));
  }
  W.__WORKSPACES = [{ id: "t-marisa", name: "Marisa's Beauty Salon", timezone: zone, appointment_word: word }];
  W.__ACTIVE_WORKSPACE = "t-marisa";
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  // The workspace's own doors outlive the page too, and a zone or a word the last test left out is not this record's.
  W.__businessTabSave.zone.reset();
  W.__businessTabSave.word.reset();
  return recordPage(flash, part);
};
/** The same page again, over the same hook cells, as React draws it after a state change. */
const redrawTab = (flash = () => {}) => again(() => recordPage(flash, drawnPart));
/** Press a row's act, which is what opens it. */
const openFold = (tree, row) => press(byTestId(tree, `rec-row-act-${row}`));

/** A row's inline editor, drawn whether it is open or not; closed, it is hidden, as a closed fold is. */
const inline = (tree, row) => byTestId(tree, `rec-inline-${row}`);
const openRows = (tree) =>
  all(tree, (n) => /^rec-inline-[a-z_]+$/.test(n.props?.["data-testid"] || "") && !n.props.hidden).map((n) =>
    n.props["data-testid"].slice("rec-inline-".length),
  );
/** Type into a row's box, the way a person does. */
const boxOf = (tree, row) => find(inline(tree, row), (n) => classes(n).includes("rec-input"));
const typeInto = (tree, row, text) => boxOf(tree, row).props.onChange({ target: { value: text } });
const saveRow = (tree, row) => press(byTestId(tree, `rec-inline-save-${row}`));
const cancelRow = (tree, row) => press(byTestId(tree, `rec-inline-cancel-${row}`));
/** The words a node holds itself, not its children's. */
const ownWords = (n) =>
  []
    .concat(n?.props?.children ?? [])
    .filter((c) => typeof c === "string")
    .join("");
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
    if (settingsHeld() !== read) {
      read = settingsHeld();
      version = read.version;
    }
    sent.push({ config: structuredClone(config), version: v });
    if (v !== version)
      return Promise.resolve({
        ok: false,
        code: "conflict",
        message: "Someone else saved settings after you loaded them — reload and reapply.",
      });
    version += 1;
    accepted({ config: structuredClone(config), version });
    return new Promise(() => {});
  };
  return sent;
};
const without = (o, key) => {
  const c = { ...o };
  delete c[key];
  return c;
};

/**
 * The composer's own lines for one block of a brain, from the bridge the app installs: what "It will say" quotes. A
 * test finds the line it means by what the line holds (the new website, the new name), never by its wording, so a
 * change to contracts' words changes none of these tests.
 */
const composed = (block, brain, channel = "whatsapp") => {
  const b = BUSINESS_TAB.consequenceOf(block, brain, channel);
  return b ? b.text.split("\n").filter((l) => l.trim() !== "") : [];
};
/** What an editor says saving writes, part by part: each part's eyebrow, and the lines under it. */
const partsOf = (says) => {
  // Folded in a sheet (RecordSays' `folded`), the lines it adds are named by the fold's own line, not an eyebrow.
  const line = find(says, (n) => classes(n).includes("rec-disclosure-label"));
  return all(says, (n) => n.props?.["data-part"]).map((p) => [
    textOf(find(p, (n) => classes(n).includes("rec-says-eyebrow")) || (p.props["data-part"] === "says" ? line : null)),
    textOf(find(p, (n) => n.type === "pre")),
  ]);
};

/** A fold, drawn whether it is open or not; closed, it is hidden. */
const foldOf = (tree, id) => byTestId(tree, `rec-fold-${id}`);
const openFolds = (tree) =>
  all(tree, (n) => /^rec-fold-[a-z_]+$/.test(n.props?.["data-testid"] || "") && !n.props.hidden).map((n) =>
    n.props["data-testid"].slice("rec-fold-".length),
  );
const saveFoldOf = (tree, id) => press(byTestId(tree, `rec-fold-save-${id}`));
const cancelFoldOf = (tree, id) => press(byTestId(tree, `rec-fold-cancel-${id}`));
/**
 * A box by the name a screen reader hears, and typing into it the way a person does. A time of the hours is a menu in
 * the kit's box (open-week.tsx BtoTime), named for what it does and the time it holds ("Monday opens: 9:30 AM"): found
 * by the first, and "typed into" by opening it and pressing the time.
 */
const isTimeMenu = (n) => n.type === "button" && n.props["aria-haspopup"] === "menu" && "value" in n.props;
const labelled = (tree, label) =>
  find(
    tree,
    (n) =>
      ((n.type === "input" || n.type === "textarea") && n.props["aria-label"] === label) ||
      (isTimeMenu(n) && String(n.props["aria-label"] || "").replace(/: .*$/, "") === label),
  );
const typeAt = (tree, label, text) => {
  const box = labelled(tree, label);
  if (!isTimeMenu(box)) return box.props.onChange({ target: { value: text } });
  box.props.onClick({ stopPropagation() {}, preventDefault() {}, detail: 1 });
  const time = find(redrawTab(), (n) => n.props?.role === "menuitemradio" && n.props["data-value"] === text);
  // Shut while a save is out, as the box took no typing then: nothing opens, and nothing is picked.
  if (!time && box.props["aria-disabled"]) return undefined;
  if (!time) throw new Error(`${label}: no ${JSON.stringify(text)} among its times`);
  return time.props.onClick();
};
/** What a box in a row of a list says is wrong with it: the kit's FieldError under the box (RecordBox), or null. */
const problemUnder = (tree, boxTestid) => {
  const box = byTestId(tree, boxTestid);
  return box ? find(box, (n) => n.type === W.FieldError) : null;
};
const dayOf = (tree, d) => byTestId(tree, `rec-hours-day-${d}`);
const written = (config) => structuredClone(config);

export {
  BUSINESS_TAB,
  WHOLE_RECORD,
  KNOWN,
  POLICIES,
  SETUP,
  TEMPLATES,
  W,
  boxOf,
  brainOf,
  cancelFoldOf,
  cancelRow,
  composePromptPreview,
  composed,
  composedPrompt,
  dayOf,
  drawTab,
  escape,
  facts,
  factsHeld,
  foldOf,
  inline,
  labelled,
  landFacts,
  landPolicies,
  landSettings,
  landTemplates,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  partsOf,
  problemUnder,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settings,
  settingsHeld,
  typeAt,
  typeInto,
  went,
  without,
  written,
};
