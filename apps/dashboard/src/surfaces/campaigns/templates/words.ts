/**
 * Campaigns > Templates, the small words a page and its rows say (moved from the head of legacy/pages/messages.jsx,
 * decision 0015): when a message last synced, a list said the way a person says it, a number as a word, the state of a
 * language in the app's one vocabulary, a body on one line with its slots named, and what the business says of itself.
 * All of it is pure but for the two reads of the settings surface (`brainOf` of what it is given, `tplOwn` of what the
 * surface holds now).
 */
import { CAMPAIGN_ROOMS, DAY_MS, HOUR_MS, MIN_MS, stateOf } from "@chanlytics/contracts";
import type { SettingsRecord, WorkspaceSettings } from "@/bridge/surfaces/settings";
import { surfaceValue } from "../../surface-values";
import { starters } from "./verbs";

export const tplAgo = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < MIN_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.round(diff / MIN_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.round(diff / HOUR_MS)}h ago`;
  return `${Math.round(diff / DAY_MS)}d ago`;
};

// "English", "English and Spanish", "English, Spanish and Portuguese" -- the
// languages a workspace answers in, said the way a person says a list. The line
// under the messages named English and Spanish in the markup, so a workspace
// that answers in neither read a sentence about two languages it does not have.
export const tplAnd = (words: string[]): string =>
  words.length < 2 ? words[0] || "" : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

// A number said as a word inside a sentence -- "the starter set is eight messages"
// -- the way a person says it; past twelve, the figure.
const TPL_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
export const tplSpell = (n: number): string => TPL_WORDS[n] || String(n);

// Words for people: a starter's title, the workspace's own, or the name with its underscores made spaces.
export const tplTitle = (t: Parameters<typeof starters.title>[0]): string => starters.title(t);

/** What the workspace says of its business in Settings (the record's `config.brain`): nothing where it has said nothing. */
export const brainOf = (settings: SettingsRecord | null | undefined): NonNullable<WorkspaceSettings["brain"]> =>
  (settings && settings.config && settings.config.brain) || {};

// What this business says about itself, for the slots that name it. A preview puts its own name and
// booking link there, and a blank for what it has not given -- never the sample filed with Meta (the
// starters' "Luna Studio"). The rule and the slots are the contracts' (templatePreview, starterPreview).
export const tplOwn = () => {
  const settings = surfaceValue("settings")?.settings;
  const brain = brainOf(settings);
  return {
    business_name: brain.business_name || null,
    booking_link: brain.booking_link || null,
    // Whether this workspace makes previews for its leads (decision 0079): {{their preview}} is offered where it does.
    previews: settings?.previews === true,
  };
};

// A message's state in ONE language, in the app's one vocabulary (tone.ts): a tone this file never picks for itself. A
// language Meta has never seen has no state -- it is an absence, and absence is drawn, not coloured.
export const tplSaid = (status: string | null | undefined) => (status ? stateOf("template", status) : null);

// "EN", "PT" -- the chip's letters, with the place only beside another code of the
// same language ("EN-US" and "EN-GB"). A label ("English (US)") is the list's.
export const tplTag = (id: string, among: readonly string[]): string => starters.langTag(id, among);
export const tplLangLabel = (id: string): string => starters.langLabel(id);

// One line, whatever the message does with newlines and tabs: a row is one line
// tall, and a template written in WhatsApp Manager can be six paragraphs.
export const tplOneLine = (s: string | null | undefined): string =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim();

// A slot by name inside a one-line quote -- "{first name}", "{business}", "{link}" --
// by what fills it where the library knows, else by the label it was given.
const TPL_SLOT_WORDS: Record<string, string> = {
  first_name: "first name",
  business_name: "business",
  booking_link: "link",
  visit_when: "time",
  visit_service: "service",
  proposal_link: "proposal link",
  freed_when: "time",
};
export const tplSlotWord = (kind: string | undefined, label: string | undefined, n: string): string =>
  (kind && TPL_SLOT_WORDS[kind]) ||
  String(label || `value ${n}`)
    .toLowerCase()
    .replace(/^(the|la|el|los|las) /, "");

/**
 * What the page says of a message's email and text versions (One message, every channel, step 1): the switch, the quiet
 * lines under a version, the editor's labels and what each act says when it is done. The channels' own names are
 * contracts' (VERSION_CHANNEL_WORDS) and a sentence that names one takes it in; a refusal is the server's, said as it
 * comes.
 */
const lower = (channel: string): string => channel.toLowerCase();
/** New, said (new-said.tsx): one line to Ask, which writes the message for every channel and files it on one press. */
export const TPL_NEW_WORDS = {
  title: "New message",
  sub: "Say what it is for. Ask writes it for WhatsApp, email and text.",
  label: "What the message is for",
  hint: "What should it say, and to whom?",
  send: "Ask",
  note: "You read it before anything is saved. WhatsApp looks at its version first, usually within minutes.",
  /**
   * What Ask is asked, the owner's words inside it: a new message for Messages with a version on every channel its kind
   * may go by (an offer never by text), the email kept even where email is not set up yet (the door keeps it).
   */
  asked: (words: string): string =>
    `New message, with a version for WhatsApp, email and text wherever its kind may go (an offer never by text): ${words}`,
} as const;

export const TPL_VERSION_WORDS = {
  /** The switch's name to a screen reader. */
  switchName: (title: string): string => `Channel for ${title}`,
  /** The message has no version on this channel in the language in view. */
  none: (channel: string, language: string): string => `No ${lower(channel)} version in ${language} yet.`,
  write: (channel: string): string => `Write the ${lower(channel)} version`,
  /** A starter not added yet: its version is shown as written, and comes with the set. */
  withStarters: "This version comes with the starter set: adding the message adds it too.",
  /** A starter not added yet that the library wrote no version of on this channel. */
  noneInSet: (channel: string): string => `The starter set has no ${lower(channel)} version of this message.`,
  edit: "Edit",
  remove: "Remove",
  moreFor: (channel: string): string => `More for the ${lower(channel)} version`,
  removeAsk: (channel: string, language: string): string => `Remove the ${lower(channel)} version in ${language}?`,
  removeDetail: "The message and its other versions stay.",
  removeYes: "Yes, remove",
  /** The editor's labels. */
  subjectLabel: "Subject",
  bodyLabel: "Message",
  addValue: "Add a value",
  addValueName: (channel: string): string => `Add a value to the ${lower(channel)}`,
  /** What a screen reader says of a value in the words: its name, and that each person has their own. */
  slotSaid: (name: string): string => `${name}, filled in for each person`,
  slotUnknownSaid: (name: string): string => `${name}, which this message does not have`,
  /** The line over the preview that sits beside the words being written. */
  previewCaption: "How one person reads it",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  /** Ask's two changes to the words in the box (the canvas's step editor): written again, every value kept, until Save. */
  ask: "Ask",
  warmer: "Warmer",
  shorter: "Shorter",
  asking: "Writing…",
  /** The words as they were before Ask wrote them again. */
  undo: "Undo",
  /** The one line to Ask under the words (Ruben, 12 Nov 2026: no preset changes, one input for any). */
  askLabel: "Ask for a change",
  askHint: "Tell Ask what to change",
  /** What a refused message's words are written again for, with WhatsApp's own reason. */
  fixAsk: (reason: string): string =>
    `WhatsApp refused these words (${reason}). Write them again so WhatsApp approves them, saying the same thing.`,
  /** Words refused before they were sent (their shape, or what a reader saw), which Ask writes again from the reason. */
  fixBefore: (reason: string): string =>
    `${reason} Write the words again so WhatsApp takes them, saying the same thing.`,
  fixing: "Ask is writing words WhatsApp can take…",
  /** WhatsApp's own words, under its editor: what sending them back does. */
  whatsappNote:
    "WhatsApp looks at new words before they go out, usually within minutes. It takes a change to an approved message once a day.",
  sendBack: "Send to WhatsApp",
  sendingBack: "Sending…",
  /**
   * A language added, for every version the message has (the message sheet's review, 12 Nov 2026): what Ask is asked of
   * each email and text, and what is said once they are saved, or part-way where one could not be.
   */
  translateAsk: (language: string): string =>
    `Write this same message in ${language}: the same meaning and the same values, in the words people there use. Add nothing.`,
  translated: (title: string, language: string, saved: readonly string[]): string =>
    `${title} in ${language}: its ${saved.join(" and ")} ${saved.length === 1 ? "version is" : "versions are"} saved`,
  translatedPart: (saved: readonly string[], reason: string): string =>
    `Its ${saved.join(" and ")} ${saved.length === 1 ? "version is" : "versions are"} saved; the rest is not: ${reason}`,
  /** A refused change's way back: the words WhatsApp had approved, put in the box to send again. */
  goBack: "Go back to the words WhatsApp approved",
  whatsappEmpty: "Write the message.",
  whatsappLong: "WhatsApp takes 1,024 characters at most.",
  sentBack: (title: string): string =>
    `${title} went back to WhatsApp — it looks at the new words, usually within minutes`,
  /** How long the subject is, against what an inbox shows. */
  subjectCount: (n: number, max: number): string => `${n} of ${max}`,
  /** What a text comes to on the wire, STOP line included. */
  counter: (chars: number, parts: number): string =>
    `${chars} ${chars === 1 ? "character" : "characters"} · ${parts} ${parts === 1 ? "part" : "parts"}`,
  /** The save did not reach the server at all; a refusal it did give is said in its own words. */
  saveFailed: "That did not save. Try again in a moment.",
  saved: (title: string, channel: string, language: string): string =>
    `${title}: the ${lower(channel)} version in ${language} is saved`,
  removed: (title: string, channel: string, language: string): string =>
    `${title}: the ${lower(channel)} version in ${language} is removed`,
  /** A message begun here: it is in Messages, with the version it began as. */
  began: (title: string, channel: string, language: string): string =>
    `${title} is in ${CAMPAIGN_ROOMS.library}: the ${lower(channel)} version in ${language} is saved`,
};

/**
 * The open message in as few words as it can be said (the message sheet's canvas, 12 Nov 2026): what it is in a word, what
 * sends it and what went, on one line under its name; where it stands in a word, and what that means on a tap; the words'
 * own pencil; and the editor's two answers once something changed. A rule that sat under every name ("An offer, for
 * people who said yes to offers") is said where it is asked for.
 */
export const TPL_SHEET_WORDS = {
  offer: "Offer",
  note: "Note",
  sent: (count: string, when: string | null): string => (when ? `${count} sent, the last ${when}` : `${count} sent`),
  noneSent: "none sent yet",
  /** The tap on where it stands: its name to a screen reader, and what it says. */
  standing: (title: string): string => `Where ${title} stands`,
  checking: "Checking",
  checkingSays:
    "WhatsApp is checking the new words, usually within minutes. If it says no, this comes back to Needs you with new words ready.",
  goingSays: (by: string): string => `Sent by ${by}.`,
  idleSays: "Nothing sends it now. It goes out once a sequence uses it.",
  awaySays: "On file, out of the list and the composers. Its name brings it back.",
  offerSays: "An offer reaches only people who said yes to offers, and never goes by text.",
  noteSays: "A note about their own booking or proposal reaches anyone a send may.",
  changeWords: "Change the words",
  addLanguage: "Add a language",
  /**
   * A delete's question and what it says goes (the message sheet's Delete, 12 Nov 2026): every version of the message in
   * the language in view, its other languages kept, said where it has any.
   */
  deleteAsk: (title: string, language: string | null): string =>
    `Delete “${title}”${language ? ` in ${language}` : ""}?`,
  /** A delete that stopped part-way: what already went, and why the rest did not. */
  deletedPart: (gone: readonly string[], reason: string): string =>
    `Its ${gone.join(" and ")} ${gone.length === 1 ? "version is" : "versions are"} deleted; the rest is not: ${reason}`,
  done: "Done",
  undo: "Undo",
  write: (channel: string): string => `Write the ${channel.toLowerCase()}`,
} as const;

/**
 * What the list says (Messages, the canvas of 10 Nov 2026, steps 1 and 2): its groups, in the order a person asks about
 * them, the line under a message's name where the list works it out, what stands at the right of a row, the head's line,
 * and the list's foot. A message is called a message, as the tab is: "template" was a third word for one thing.
 */
/**
 * Where a WhatsApp version stands, beside its message's name: what an owner can act on, never WhatsApp's own word for it
 * (Ruben, 12 Nov 2026: "English paused" read as a system error). Its language is said only where there are several.
 */
const STANDING_WORDS: Record<string, string> = {
  pending: "Being checked",
  rejected: "Needs a change",
  paused: "On hold",
  disabled: "Turned off",
};

export const TPL_LIST_WORDS = {
  /** The groups: what needs you, what goes out now, what nothing sends now, and what was put away. */
  need: "Need you",
  going: "Going out",
  idle: "Not in use",
  away: "Put away",
  /** A cold email sequence's emails, which are a step's own words and are written with their sequence. */
  emails: "Cold emails",
  /** How many a folded group holds, to a screen reader, and what its head does. */
  fold: (name: string, n: number): string => `${name}, ${n}`,
  /** Something sends the message, and no channel can carry it for this business now: why, in the channel's words. */
  nothingCarries: (reason: string): string => `Nothing can send it here yet. ${reason}`,
  standing: STANDING_WORDS,
  /** A running sequence sends a language the message has no version of that it can send. */
  sendsMissing: (language: string): string => `A sequence sends it in ${language}, which it has no version to send in.`,
  /** At a row's right: how many went out, of a message that goes out; when the last did, of one that does not now. */
  sentCount: (count: string): string => `${count} sent`,
  notSentYet: "Not sent yet",
  sentWhen: (when: string): string => `Sent ${when}`,
  /** The head's line: how many need you and how many go out. */
  needYou: (n: number): string => `${n} need${n === 1 ? "s" : ""} you`,
  goingOut: (n: number): string => (n === 0 ? "Nothing going out yet" : `${n} going out`),
  /** The list's foot: when WhatsApp was last asked about the workspace's messages, and the press that asks again. */
  checked: (ago: string): string => `Checked with WhatsApp ${ago}`,
  neverChecked: "Not checked with WhatsApp yet",
  checking: "Checking WhatsApp…",
  checkAgain: "Check WhatsApp for changes",
  /** A search with nothing in it. */
  noMatch: (q: string): string => `No message’s words have “${q}” in them.`,
  /** What a message written here is, under its name in its pane (a starter says its own line). */
  anOffer: "An offer, for people who said yes to offers",
  aNote: "About their own booking or proposal",
  /** The open message's head: where it stands, in the words of its group. */
  placeWord: { need: "Needs you", going: "Going out", idle: "Not in use", away: "Put away" },
  /** The open message's facts: what sends it, and what went out. */
  sentBy: "Sent by",
  sent: "Sent",
  open: "Open",
  sentFact: (count: string, when: string | null): string => (when ? `${count}, the last ${when}` : count),
  neverSent: "None yet",
  /** The menu on the open message's caret, and its name to a screen reader. */
  more: (title: string): string => `What to do with ${title}`,
  putAway: "Put away",
  bringBack: "Bring back",
  putAwayTip: "Keep it on file, out of the list and the composers",
  bringBackTip: "Back in the list and the composers",
  editVersion: (channel: string): string => `Edit the ${channel.toLowerCase()}`,
  /** WhatsApp's words, changed in the same editor and sent back for WhatsApp to look at. */
  changeWords: "Change the words",
  removeVersion: (channel: string): string => `Remove the ${channel.toLowerCase()} version`,
} as const;
