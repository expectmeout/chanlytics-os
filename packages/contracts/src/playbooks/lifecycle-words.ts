/**
 * The words Campaigns' home says once, and what a playbook says of itself as a state (lifecycle.ts reads them to make the
 * rail and the strips, lifecycle-tiles.ts to make the tiles). A sentence of the page is here or made from here, never in the
 * page.
 */
import type { ConsentChannel } from "../consent/consent-channels";
import { CAMPAIGN_ROOMS } from "../shell/campaign-rooms";
import { joinWords } from "../shared/words";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { SENDING_HOURS_WORDS } from "./playbook-triggers";
import type { LifecyclePlaybook, LifecycleSentence, LifecycleTone } from "./lifecycle-types";

/** The channels a campaign goes by, as a list in a sentence: "WhatsApp and Email", "WhatsApp, Text and Email". */
const channelsGoesByWords = (channels: readonly ConsentChannel[]): string =>
  joinWords(channels.map((c) => VERSION_CHANNEL_WORDS[c]));

export const LIFECYCLE_WORDS = {
  title: CAMPAIGN_ROOMS.home,
  lede: "What goes out on its own as a customer reaches a moment, and what you send yourself.",
  library: CAMPAIGN_ROOMS.library,
  newMessage: CAMPAIGN_ROOMS.newMessage,
  // Said, after the standard beat, where a tile's read is still out.
  reading: "Reading…",
  close: "Close",
  rail: "Your customer, start to finish",
  needs: {
    none: "Answers whoever writes",
    messages: "Reaches a yes to messages",
    offers: "Needs a yes to offers",
  },
  receptionist: "Answers · asks for the yes",
  // First contact where the workspace has nothing to answer on: no number and no channel that can send.
  noLine: { state: "No line to answer on yet", needs: "Connect a number or email to answer on" },
  alsoRunning: "Also running",
  callText: {
    name: "The call's text",
    words: "The booking link and your WhatsApp, sent while they're on the phone",
    on: "When a caller asks",
    none: "No message for it yet",
  },
  monthsOffer: { name: "The month's offer" },
  // What the drawer's head calls a line that is not a stage.
  kickers: { call_text: "The call's text", moment: "Also", list: "On a list", reach_out: "Reach-out" },
  gone: {
    title: "That playbook isn't here any more.",
    body: "Its runs stay in Sent, with their numbers.",
  },
  compose: {
    title: CAMPAIGN_ROOMS.newMessage,
    kind: "What kind of message",
    once: "Send once",
    every: "Every time a moment comes",
    // The send screen is made of the broadcasts read (its lists and its messages): said where it could not be, with its Retry.
    failed: {
      what: "who and what you can send to",
      body: "Nothing goes out until it reads. Everything else here is current.",
      surface: "broadcasts",
    },
  },
  phone: { moments: "Moments", also: "Also", turnOn: "Turn on" },
  // The channels a campaign goes by: the row's word in the drawer, and what a mark that waits says of itself.
  channels: {
    goesBy: "Goes by",
    /** A kept channel the workspace cannot send on yet, after its name: "Email · waits". */
    waits: "waits",
    /** The marks' line to a screen reader: "Goes by WhatsApp and Email; Text waits; could also go by Email". */
    marks: (on: readonly string[], waits: readonly string[], could: readonly string[]): string =>
      [
        on.length > 0 ? `Goes by ${joinWords(on)}` : waits.length > 0 ? "" : "Goes by nothing yet",
        waits.length > 0 ? `${joinWords(waits)} ${waits.length === 1 ? "waits" : "wait"}` : "",
        could.length > 0 ? `could also go by ${joinWords(could)}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    /** After a change of channels, where a run of the playbook already waits: it was made with the channels it had. */
    runKeeps: "the run that waits keeps the channels it was made with",
  },
  // A read that failed is its own state, never a tile that is not there or a zero that was not counted. The page draws the
  // kit's failed read where the data would be, and its Retry reads `surface` again.
  failed: {
    templates: {
      what: "your templates",
      body: "The call's text and the Library's count show once they read. Everything else here is current.",
      surface: "settings",
    },
    counts: {
      what: "who each moment reaches",
      body: "The moments show who they reach once it reads. Everything else here is current.",
      surface: "playbooks",
    },
    chains: { what: "your reach-outs", body: "The moments above are current.", surface: "reach_outs" },
    report: { what: "this period's numbers", body: "The runs below stand.", surface: "broadcasts" },
    // The broadcasts read itself, said in each tile made from it.
    reach: {
      what: "who can hear you",
      body: "The ladder shows once it reads. Everything else here is current.",
      surface: "broadcasts",
    },
    coming: {
      what: "what is coming up",
      body: "What is coming shows once it reads. Everything else here is current.",
      surface: "broadcasts",
    },
    results: {
      what: "what came back",
      body: "The numbers show once they read. Everything else here is current.",
      surface: "broadcasts",
    },
  },
  reach: {
    title: "Who can hear you",
    people: "In People",
    messages: "Can get your messages",
    offers: "Said yes to offers",
    // What a yes opens, in the moments' own names; the month's offer and a person's own notes are not stages.
    opensMessages: "Opens:",
    ownOffers: ["the month's offer", "your notes"],
    asks: "Your receptionist now asks for it. Once a person, inside a conversation they started. At the desk, the code or the phrase does the same.",
    phoneAsks: "Your receptionist asks for the yes to offers, once a person, in a conversation they started.",
    code: "Show the code",
    copy: "Copy the phrase",
    link: "People",
  },
  coming: {
    title: "Coming up",
    window: "next 7 days",
    link: "Calendar",
    rules: `Sends wait for ${SENDING_HOURS_WORDS.range} · one a week per person, across every moment`,
    empty: "Nothing is set to go out in the next 7 days.",
    nobody: "Nobody",
    waiting: "Waiting on you",
    // A running moment's row while the WORKSPACE is paused (billing): no time is promised, since the send door refuses every
    // message of a run until billing resumes. It says so where "Tomorrow 10:00" stood.
    paused: {
      when: { day: "Paused", at: "for billing" },
      why: "The workspace is paused, so nothing goes until billing resumes",
      pill: "Workspace paused",
    },
  },
  results: {
    title: "What came back",
    link: "All runs",
    quiet: "Nothing went out, and nobody said yes or asked to stop.",
    funnel: { sent: "Sent", delivered: "Delivered", read: "Read", replied: "Replied" },
    funnelLabel: "Sent, delivered, read and replied",
    funnelLabelNoRead: "Sent, delivered and replied",
    /** Under the funnel where a text or an email went too (0030): a read is WhatsApp's own receipt. */
    readOf: (whatsappSent: number): string =>
      `Read is of WhatsApp's ${whatsappSent}: a text or an email keeps no read receipt.`,
    noRead: "These went by text or email, which keep no read receipt.",
  },
} as const;

/** What the home says in a toast: a name is the page's emphasis, so a sentence with one is in parts. */
export const LIFECYCLE_TOAST = {
  resumed: (name: string): LifecycleSentence => [{ b: name }, " resumed"],
  changed: (name: string): LifecycleSentence => [{ b: name }, " changed"],
  // A new playbook's next run is under Coming up, by the business's clock; there is no card to look on any more.
  running: (name: string): LifecycleSentence => [
    { b: name },
    " is running — its next run is under Coming up, by your clock",
  ],
  /** The name of a line the page has no row for, where a toast must name it. */
  nameless: "It",
  /**
   * A playbook's channels changed, from its drawer or from Ask's card: "Visit reminder goes by WhatsApp and Email now".
   * `runWaits`: a run of it already waits for approval, and keeps the channels it was made with (core run-playbook
   * stores them as it enrols), so the sentence says the change is the next run's.
   */
  channels: (name: string, channels: readonly ConsentChannel[], runWaits: boolean): LifecycleSentence => [
    { b: name },
    ` goes by ${channelsGoesByWords(channels)} now${runWaits ? ` · ${LIFECYCLE_WORDS.channels.runKeeps}` : ""}`,
  ],
  phraseCopied: "Phrase copied",
  /** The browser would not copy it: the toast shows the phrase, to be typed or copied by hand. */
  copyFailed: (phrase: string): string => `Couldn't copy, the phrase is: ${phrase}`,
} as const;

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** A playbook's clock in the fewest words: "daily 10:00", "every 30 days". */
function lifecycleClock(p: Pick<LifecyclePlaybook, "trigger" | "run_hour" | "cadence_days">): string {
  return p.trigger === "everyone_monthly" ? `every ${p.cadence_days} days` : `daily ${twoDigits(p.run_hour)}:00`;
}

/** What a playbook says of itself as a state: on with its clock, a run waiting on the person, or paused. */
export function lifecycleStateOf(p: LifecyclePlaybook): {
  words: string;
  /** The same on a phone, where there is room for less: the clock alone while it is on. */
  short: string;
  tone: LifecycleTone;
  paused: boolean;
} {
  const stated = (words: string, tone: LifecycleTone, paused = false, short = words) => ({
    words,
    short,
    tone,
    paused,
  });
  if (p.off) return stated("Not running here", "plain");
  if (p.state !== "running") return stated("Paused", "warn", true);
  if (p.totals.waiting) return stated("Waiting on you", "warn");
  return stated(`On · ${lifecycleClock(p)}`, "ok", false, lifecycleClock(p));
}
