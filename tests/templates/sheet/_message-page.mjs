/**
 * The Messages page on the stub React, as its tests draw it: the page over what the settings surface holds, its verbs
 * stubbed on the one `templates` object it imports, the rows a fixture makes, and the readings of what it draws (the
 * pane, its tabs, its menu, its fields). Shared by message-versions-page.test.mjs and message-sheet-review.test.mjs.
 */
import * as contracts from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, press, settle } from "../../_stub-react.mjs";
import { lineBox } from "../../shared/_line.mjs";
import { toSlotParts } from "../../../apps/dashboard/src/surfaces/campaigns/templates/message-version-slots.ts";

installStubReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
export const W = globalThis;
export const toasts = [];
Object.assign(W, {
  CHANLY: { nav() {}, R: {} },
  appNavigate() {},
  // The role store's gate is the frame's own (window.gate, canDo, gateTitle), over this role and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  __surfaceState: () => "live",
  useHotkey: () => {},
});
export const SRC = "../../../apps/dashboard/src";
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
// The toast is the shell's (the frame's usePPToast): what the page flashes is recorded in its place.
W.usePPToast = () => [null, (t) => toasts.push(t)];
export const S = "../../../apps/dashboard/src/surfaces";
export const { TemplatesPage } = await import(`${S}/campaigns/templates/templates-page.tsx`);
export const { templates: verbs } = await import(`${S}/campaigns/templates/verbs.ts`);
export const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);
export const { listingOf } = await import(`${S}/campaigns/templates/group.ts`);
export const { messageFacts, firstView } = await import(`${S}/campaigns/templates/message-row-facts.ts`);
export const { TPL_VERSION_WORDS } = await import(`${S}/campaigns/templates/words.ts`);
export const { starters: library } = await import(`${S}/campaigns/templates/verbs.ts`);
export const { starterWords, TemplateComposer } = await import(`${S}/campaigns/templates/composer.tsx`);
export const { Picker } = await import(`${S}/kit/picker/picker.tsx`);
export const { standingSaid } = await import(`${S}/kit/head/standing.ts`);
export const { SubTabs } = await import(`${S}/kit/sub-tabs/sub-tabs.tsx`);
export const { Field } = await import(`${S}/kit/field/field.tsx`);
export const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
export const { Popover } = await import(`${S}/kit/popover/popover.tsx`);
export const { Confirm } = await import(`${S}/kit/confirm/confirm.tsx`);
export const { FieldError } = await import(`${S}/kit/field-error/field-error.tsx`);
export const { SlotBox } = await import(`${S}/campaigns/templates/slots/slot-box.tsx`);
export const composerActsModule = await import(`${S}/campaigns/templates/composer-acts.ts`);
export const { SlotName } = await import(`${S}/campaigns/parts/slot.tsx`);

export const BIZ = "Harbor";
export const { starterByKey, fillSlots, smsStopLine } = contracts;

/* ---------------------------------- the rows ---------------------------------- */

/** A template as GET templates hands it down: the WhatsApp row of a starter carries its own words and slots. */
export const baseRow = (over = {}) => ({
  id: "t1",
  channel: "whatsapp",
  name: "x",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  body_preview: "",
  variables: [],
  header: null,
  footer: null,
  buttons: [],
  blocked: null,
  ...over,
});
export const starterRow = (key, language = "en_US") => {
  const s = starterByKey(key);
  const t = s.texts[language];
  return baseRow({
    id: `w-${key}-${language}`,
    name: s.name,
    language,
    category: s.category,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  });
};
export const emailRow = (key, language = "en_US") => {
  const e = starterByKey(key).email[language];
  return baseRow({
    id: `e-${key}-${language}`,
    channel: "email",
    name: key,
    language,
    header: e.subject,
    body_preview: e.body,
  });
};
export const smsRow = (key, language = "en_US") =>
  baseRow({
    id: `s-${key}-${language}`,
    channel: "sms",
    name: key,
    language,
    body_preview: starterByKey(key).sms[language].body,
  });
/** What fills a starter's slots in a preview: its examples, and this business's name where the slot names it. */
export const valuesOf = (key, language = "en_US") =>
  starterByKey(key).texts[language].slots.map((x) => (x.kind === "business_name" ? BIZ : x.example));

/** A message the workspace wrote, with two values: no starter, so its email and text start from its WhatsApp words. */
export const custom = (name, over = {}) =>
  baseRow({
    id: `w-${name}`,
    name,
    body_preview: "Hi {{1}}, our hours start {{2}}.",
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Date", example: "Oct 1" },
    ],
    ...over,
  });

/* ---------------------------------- the page ---------------------------------- */

export const draw = () => W.React.createElement(TemplatesPage, {});
/**
 * Templates over what the settings surface holds: the WhatsApp rows, the email and text rows, who is acting, the
 * channels the workspace has (a WhatsApp number, unless the test says none), and whether its Google listing keeps a
 * review link (none, unless the test says one).
 */
export const page = ({
  rows = [],
  versions = [],
  role = "owner",
  channels = [{ kind: "whatsapp" }],
  reviewLink = false,
} = {}) => {
  W.ST_STORE.can = (a) => !!contracts.ROLE_PERMS[role][a];
  W.ST_STORE.myRole = () => role;
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: BIZ } }, reviewLink },
    facts: null,
    templatesAll: rows,
    templateVersions: versions,
    // The messages the surface holds, made of those rows as the bridge makes them where the read carries none.
    messages: contracts.campaignMessagesOf([...rows, ...(versions ?? [])]),
    templateUse: null,
    templateSent: null,
  });
  // The numbers are the channels read's (surfaces/channels/surface.ts), which the Library's number notice is drawn from.
  setSurfaceValue("channels", { rows: channels });
  setSurfaceValue("reach_outs", []);
  setSurfaceValue("playbooks", undefined);
  fresh();
  toasts.length = 0;
  return again(draw);
};
export const redraw = () => again(draw);
/** What the page last said to the frame's head (kit/head/standing.ts): its line and its act, which the frame draws, not the page. */
export const headSaid = () => {
  const said = standingSaid();
  return { props: { children: [said?.sentence ?? null, said?.act ?? null] } };
};
/** A part of the page, or of its head where the page says it to the frame. */
export const headed = (tree, id) => byTestId(tree, id) ?? byTestId(headSaid(), id);
export const rowOf = (tree, name) => find(tree, (n) => n.props?.["data-template"] === name);
export const paneOf = (tree) => byTestId(tree, "template-pane");
/** A message opened beside the list, as a press on its row opens it. */
export const opened = (tree, name) => {
  press(find(rowOf(tree, name), (n) => n.props?.["data-testid"] === "template-open"));
  return redraw();
};
/** The open message's channels, as the kit's sub-tabs (Messages, the canvas of 10 Nov 2026: they were a switch). */
export const tabsOf = (tree) => find(paneOf(tree), (n) => n.type === SubTabs);
/** One channel's tab of the open message. */
export const tabOf = (tree, id) => tabsOf(tree).props.tabs.find((t) => t.id === id);
/** Where the language in view stands on each channel: its tabs' words, in order (the line that said it went). */
export const standingOf = (tree) => Array.from(tabsOf(tree).props.tabs, (t) => t.hint).join(", ");
/** A channel's tab picked, as the tabs say it. */
export const switched = (tree, channel) => {
  tabsOf(tree).props.onSelect(channel);
  return redraw();
};
/** A message opened, and its channel picked. */
export const viewing = (tree, name, channel) => switched(opened(tree, name), channel);
export const bodyOf = (tree) => textOf(byTestId(tree, "template-version-body"));
/** The menu that puts a value into the words: the editor's "Add a value". */
export const menuOf = (tree) =>
  find(paneOf(tree), (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "template-version-values");
/** The pane's one menu, on its name (the message sheet's canvas, 12 Nov 2026: the caret beside the name's words). */
export const nameMenuOf = (tree) =>
  find(paneOf(tree), (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "template-menu");
/** An item of the name's menu by its first word: an email's "Remove the email version" is its Remove. */
export const itemsOf = (tree) => nameMenuOf(tree).props.groups.flatMap((g) => g.items);
/** Where the open message stands, as its head says it: the word on the pill its meaning opens from (sheet-head.tsx). */
export const standingWord = (tree) => {
  const tap = find(paneOf(tree), (n) => n.type === Popover && String(n.props.label).startsWith("Where "));
  return tap ? (find(tap.props.trigger, (n) => n.props?.testid === "template-pane-status")?.props.label ?? null) : null;
};
export const itemOf = (tree, words) => itemsOf(tree).find((i) => i.label === words || i.label.split(" ")[0] === words);
/**
 * One of the editor's fields, by its label: the kit's Field, which holds the label, the hint and the box. In a message's
 * sheet the words' box has no label drawn over it, and names itself: the field is found by its box's label.
 */
export const fieldOf = (tree, label) =>
  find(paneOf(tree), (n) => n.type === Field && (n.props.label ?? n.props.control?.props.label) === label);
/** The box of words in a field, by its label: where the words are typed, and what the editor reads them from. */
export const boxOf = (tree, label) => find(paneOf(tree), (n) => n.type === SlotBox && n.props.label === label);
/** The slots a box draws, as chips: [name, number] in order (a campaign message's slots are numbered; a chip carries its key). */
export const chipsOf = (box) =>
  (box ? [...new Set(all(box, (n) => n.type === SlotName))] : []).map((c) => [c.props.label, Number(c.props.slot)]);
export const problemOf = (tree) => find(paneOf(tree), (n) => n.type === FieldError)?.props.message ?? null;
export const saveOf = (tree) => byTestId(tree, "template-version-save");

/** The verbs, stubbed: each call recorded, each answer the test's. */
export const REAL = { ...verbs };
export const stubbed = (over = {}) => {
  const calls = [];
  Object.assign(verbs, REAL, {
    saveVersion: async (body) => (calls.push(["save", body]), { ok: true, data: { template: {}, warnings: [] } }),
    removeVersion: async (id) => (calls.push(["remove", id]), { ok: true, data: {} }),
    ...over,
  });
  return calls;
};

export const NEW_WORDS = contracts.NEW_MESSAGE_WORDS;

export const AFTER_VISIT = "after_visit_check";
export const VISIT = "visit_reminder";
export const WINBACK = "winback_reply";

/* ---------------------------------- the row ---------------------------------- */

/** A message the workspace wrote, its email being written: the editor open on the starting words. */
export const writing = (name = "fall_hours", channel = "email", over = {}) => {
  const tree = viewing(page({ rows: [custom(name, over)] }), name, channel);
  press(byTestId(paneOf(tree), "template-version-write"));
  return redraw();
};

/* ---------------------------------- the Library lists every message ---------------------------------- */

/** An email or a text of a message the workspace wrote, with no WhatsApp row of its name: approved the moment it was saved. */
export const ownRow = (channel, name, over = {}) =>
  baseRow({
    id: `${channel}-${name}-${over.language ?? "en_US"}`,
    channel,
    name,
    category: "marketing",
    header: channel === "email" ? "Our hours" : null,
    body_preview: "Hi {{1}}, our hours start {{2}}.",
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Date", example: "Oct 1" },
    ],
    ...over,
  });
export const HOURS = "fall_hours";
export const messagesOf = (rows, versions) => contracts.campaignMessagesOf([...rows, ...versions]);

/* ------------------------------ the live demo's findings, 12 Nov 2026 ------------------------------ */

/** What sends a message, as the settings read says it: a running sequence's step (the bridge's `templateUse`). */
export const usedBy = (name, over = {}) => ({
  [name]: {
    words: "Hours · step 2",
    note: null,
    unused: false,
    sequence: null,
    running: true,
    booking: false,
    ...over,
  },
});
/** The settings read again, with what sends each message: the page fixture says nothing sends anything. */
export const sendsIt = (use) => setSurfaceValue("settings", { ...surfaceValue("settings"), templateUse: use });
/** The status card's words: its bold word, then what it means. */
export const standingSays = (tree) => {
  const tap = find(paneOf(tree), (n) => n.type === Popover && String(n.props.label).startsWith("Where "));
  return textOf(find(tap, (n) => n.props?.className === "tpl-standing-says")?.props.children?.[0] ?? null);
};
/** The business's channels as the sequences' read holds them: WhatsApp with no number, no texting line, no mailbox. */
export const NOTHING_READY = contracts.channelsReady({
  whatsapp: null,
  textLine: null,
  email: { mailbox: false, domain: true },
});

export { contracts, fresh, again, all, find, byTestId, textOf, press, settle, lineBox, toSlotParts };
