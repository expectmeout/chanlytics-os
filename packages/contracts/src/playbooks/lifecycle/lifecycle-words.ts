/**
 * The words Campaigns' home says once, and what a playbook says of itself as a state (lifecycle.ts reads them to make the
 * rail and the strips, lifecycle-tiles.ts to make the tiles). A sentence of the page is here or made from here, never in the
 * page.
 */
import type { ConsentChannel } from "../../consent/consent-channels";
import { clockHour } from "../../shared/clock";
import { CAMPAIGN_ROOMS, runStoppedWords } from "../../shell/campaign-rooms";
import { joinWords, plural } from "../../shared/words";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { WORKSPACE_PAUSED_FACT } from "../../workspace/billing";
import { SENDING_HOURS_WORDS } from "../playbook-triggers";
import type { LifecyclePlaybook, LifecycleSentence, LifecycleTone } from "./lifecycle-types";

/** The channels a campaign goes by, as a list in a sentence: "WhatsApp and Email", "WhatsApp, Text and Email". */
export const channelsGoesByWords = (channels: readonly ConsentChannel[]): string =>
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
    report: { what: "this period's numbers", body: "The runs below stand.", surface: "campaign_results" },
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
    /** The phone's line in the Moments head: who of everyone in People a message can reach now. */
    phoneHear: (canHear: number, people: number): string => `${canHear} of ${people} can hear you`,
    /** The phone's door to how the yes to offers is got: the words that door carries on a run's sheet and in Setup. */
    phoneYes: "Get their yes",
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
    /**
     * A run waiting on the person, approved or skipped on its own line: the two acts, and what Skip asks. What the line
     * says of the run is Today's own sentence for it (today-runs.ts todayRunWords: "7 people. Nothing sends until you
     * say so."), which promises nobody the month's allowance holds back.
     */
    approval: {
      approve: "Approve",
      approving: "Approving…",
      skip: "Skip",
      /** The two acts named whole for a screen reader: where two runs wait, "Approve" twice says nothing of which. */
      approveOf: (name: string): string => `Approve this run of ${name}`,
      skipOf: (name: string): string => `Skip this run of ${name}`,
      question: (name: string): string => `Skip this run of ${name}?`,
      detail: "Nothing sends, and the run closes.",
      yes: "Yes, skip it",
    },
    // A running moment's row while the WORKSPACE is paused (billing): no time is promised, since the send door refuses every
    // message of a run until billing resumes. It says so where "Tomorrow 10:00" stood.
    paused: {
      when: { day: "Paused", at: "for billing" },
      // The fact in its one spelling (workspace/billing.ts), which a waiting run on the line below says too, with its door.
      why: WORKSPACE_PAUSED_FACT,
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
   * A waiting run approved: the server's own count, and when it really goes in the page's clock words ("sending now",
   * "scheduled for tomorrow 9:00 AM"), since the server may move a late approval to the next sending hour.
   */
  approved: (name: string, people: number, when: string): LifecycleSentence => [
    { b: name },
    ` approved — ${plural(people, "person", "people")}, ${when}`,
  ],
  /**
   * A run stopped from its line or its card: what the server stopped, by what the run was when it did (campaign-rooms.ts
   * runStoppedWords, Sent's own receipt). A run that waited closes unsent; one a teammate approved a moment before, and
   * that is already going, stops after the batch in hand, and the page does not say "nothing will send" of it.
   */
  skipped: (name: string, was: string | null | undefined): LifecycleSentence => [
    { b: name },
    ` ${runStoppedWords(was)}`,
  ],
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

/** A playbook's clock in the fewest words: "daily 10:00 AM", "every 30 days". The hour is the product's clock's (clockHour). */
function lifecycleClock(p: Pick<LifecyclePlaybook, "trigger" | "run_hour" | "cadence_days">): string {
  return p.trigger === "everyone_monthly" ? `every ${p.cadence_days} days` : `daily ${clockHour(p.run_hour)}`;
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
