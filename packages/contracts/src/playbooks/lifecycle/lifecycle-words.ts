/**
 * The words Campaigns' home says once, and what a playbook says of itself as a state (lifecycle.ts reads them to make the
 * rail, lifecycle-ledger.ts the ledger, lifecycle-tiles.ts the tiles). A sentence of the page is here or made from here, never in the
 * page.
 */
import { SET_UP_CAMPAIGNS } from "../../ask/ask-suggestions";
import { CHANNELS_DOOR } from "../../broadcasts/channels-standing";
import type { PolicyMode } from "../../config/workspace-config/policy-classes";
import type { ConsentChannel } from "../../consent/consent-channels";
import { appointmentWords } from "../../journey/appointment-word";
import type { AppointmentWord } from "../../journey/appointment-word";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
import { clockHour } from "../../shared/clock";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import { CAMPAIGN_ROOMS, RUN_WAITING_WORDS, heldEmailsWords, runStoppedWords } from "../../shell/campaign-rooms";
import { joinWords, plural } from "../../shared/words";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { WORKSPACE_PAUSED_FACT } from "../../workspace/billing";
import { SENDING_HOURS_WORDS, isWinBack, triggerOf } from "../playbook-triggers";
import type { LifecyclePlaybook, LifecycleRowResults, LifecycleSentence, LifecycleTone } from "./lifecycle-types";

/** The channels a campaign goes by, as a list in a sentence: "WhatsApp and Email", "WhatsApp, Text and Email". */
export const channelsGoesByWords = (channels: readonly ConsentChannel[]): string =>
  joinWords(channels.map((c) => VERSION_CHANNEL_WORDS[c]));

/** An appointment moment where no calendar feeds it (decision 44 of 9 Oct 2026): what it says instead of a figure, and its door's words. */
const NEEDS_CALENDAR = {
  none: "Needs your calendar",
  email: "Needs your calendar feed",
  door: "Connect your calendar",
} as const;

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
  // An appointment moment where no calendar feeds it (decision 44 of 9 Oct 2026): what it says instead of a figure, and its door.
  needsCalendar: NEEDS_CALENDAR,
  callText: {
    name: "The call's text",
    words: "The booking link and your WhatsApp, sent while they're on the phone",
    // Its state is a state, as every row's is (Ruben, 11 Oct 2026: "When a caller asks" stood where "Live" stands); when
    // it is sent is its line.
    on: "Live",
    when: "Sent when a caller asks for it",
    none: "No message for it yet",
  },
  /**
   * A moment with no campaign yet shows the one it offers as a row of its own, off (Ruben, 11 Oct 2026: a row to press
   * where a heading had a Turn on under it): its line says what it does, by the moment's id.
   */
  offered: {
    off: "Off",
    before: "The day before each visit",
    after: "The day after each visit",
    proposal: "When a proposal waits for an answer",
    quiet: "Brings back people who've gone quiet",
  } as Record<string, string>,
  monthsOffer: { name: "The month's offer" },
  /** A campaign past its last day (00416 `until`), its state: "Ended Oct 1", the day by the business's calendar. */
  ended: (day: string): string => `Ended ${day}`,
  /** A campaign on trial (00416 `trial_until`), its state: "On trial until Oct 9", the day its trial ends. */
  onTrial: (day: string): string => `On trial until ${day}`,
  gone: {
    title: "That campaign isn't here any more.",
    body: "Its runs stay in Sent, with their numbers.",
  },
  /** A message's own drawer over the home (`campaigns/message:<name>`) whose name leads to no message any more. */
  messageGone: {
    title: "That message isn't here any more.",
    body: "Every message you keep is in the Library.",
  },
  compose: {
    title: CAMPAIGN_ROOMS.newMessage,
    kind: "What kind of message",
    once: "Send once",
    // Beside "Send once" at the sheet's head; the moment it comes on is the To row's (Ruben, 11 Oct 2026: shorter words).
    every: "Every time",
    /** The third (00426, canvas B): a reach-out to leads, from a search, a list, or the ones the pile adds. */
    leads: "Write to leads",
    /** The sheet a moment's Turn on opens, titled for the campaign it starts (spec §4.2): "Turn on Appointment reminder". */
    turnOn: (name: string): string => `Turn on ${name}`,
    /**
     * The same sheet on the home, where the campaign's own name stands under it to rename in place (Ruben, 11 Oct 2026:
     * "Turn on Win-back" over "Win-back" said the name twice).
     */
    turnOnShort: "Turn on",
    /** The same sheet changing a campaign the drawer showed: its kicker, over the campaign's own name. */
    edit: "Edit",
    /** A campaign the moment already holds, said as the composer opens on it (decision 20): "Win-back · On". */
    holds: (name: string, paused: boolean): string => `${name} · ${paused ? "Paused" : "On"}`,
    /**
     * The composer's two sentences that name a setting, each with its door to it (spec §4.2): the calendar's is the one
     * "Needs your calendar" opens (Settings › Business, the calendar's row), with its words; the number's is Connections.
     */
    calendar: {
      words: "This moment reads your calendar: a run can send once it is connected.",
      door: { label: NEEDS_CALENDAR.door, to: CALENDAR_SETTING_ROUTE },
    },
    number: {
      words: "No WhatsApp number is connected yet: a run cannot send by WhatsApp until one is.",
      door: { label: "Open Connections", to: CHANNELS_DOOR },
    },
    /**
     * The composers and a campaign's drawer as one sentence of words to press (Ruben, 11 Oct 2026, "Option B"): the words
     * round its tokens, the one line under it saying who it reaches now, what happens next, and what an edit changes.
     */
    sentence: {
      everyDay: "Every day at",
      /** The rule its runs keep, said after its channels: the mode Autonomy holds for the moment's class. */
      rule: {
        auto: "without asking you",
        veto: "unless you stop it",
        ask: "asking you first",
        never: "while Autonomy keeps it quiet",
      } satisfies Record<PolicyMode, string>,
      /** What the rule's word opens, to a screen reader. */
      ruleLabel: "The rule its runs keep, on your Autonomy tab",
      /** The channels' word, to a screen reader: what pressing it opens. */
      channelsLabel: "The channels it goes by",
      /** Under the channels' switches: a person gets a run's message on one of them, never on each. */
      channelsNote: "Each person gets it once, on one of these.",
      /** Where it goes by no channel yet: the channels' word says so. */
      noChannel: "no channel yet",
      /**
       * Who a moment's campaign goes to, after "to" in its sentence ("a WhatsApp to everyone with an appointment
       * tomorrow"): the moment said as the people it names, in the workspace's word for an appointment.
       */
      who: (trigger: string, word: AppointmentWord): string => {
        const W = appointmentWords(word);
        if (trigger === "visit_tomorrow") return W.tomorrowWho;
        if (trigger === "visited") return W.yesterdayWho;
        if (trigger === "lapsed") return `everyone with no ${word} in 45 days`;
        if (trigger === "quiet_30") return "everyone quiet for 30 days";
        if (trigger === "everyone_monthly") return "everyone who said yes";
        if (trigger === "proposal_waiting") return "every proposal waiting";
        if (trigger === "new_week") return "everyone new this week";
        if (trigger === "phoned_only") return "everyone who only ever phoned";
        if (trigger === "saved_list") return "everyone on a list";
        return (triggerOf(trigger)?.label ?? "").toLowerCase();
      },
      /** Who it reaches now: "All 6 can hear it", "2 of 6 can hear it"; "2 can hear it" where nobody counted the pool. */
      hear: (will: number, pool: number | null): string =>
        pool === null
          ? `${will} can hear it`
          : will > 0 && will === pool
            ? `All ${will} can hear it`
            : `${will} of ${pool} can hear it`,
      /** Nobody the moment names yet: "Nobody with an appointment tomorrow right now". */
      nobody: (of: string): string => `Nobody ${of} right now`,
      /** What happens next, before it is saved ("First run today at 10:00 AM"), or for one that runs ("Next run …"). */
      firstRun: (when: string): string => `First run ${when}`,
      nextRun: (when: string): string => `Next run ${when}`,
      /** A day and an hour as a line says them, from a label's "today 10:00 AM": "today at 10:00 AM". */
      at: (label: string): string => label.replace(/^(today|tomorrow) (?=\d)/, "$1 at "),
      /** A send's one act, once a time is picked: "Schedule for tomorrow at 9:00 AM". */
      scheduleFor: (when: string): string => `Schedule for ${when}`,
      /**
       * The message, folded under its first words (Ruben, 11 Oct 2026: "make the preview something you expand to see, so
       * the drawers are more compact"): what the fold says while it is open.
       */
      previewOpen: "How it reads",
      previewLabel: "The message, as it reads",
      /** An edit's changes, counted in its foot: "2 changes · from the next run". */
      changes: (n: number): string => `${plural(n, "change", "changes")} · from the next run`,
      /** The foot of a Turn on whose moment's own message is not in the Library yet: the one press adds it, then starts. */
      addsFirst: (title: string): string => `Adds ${title} to your Library, then turns it on.`,
      /** The message under its preview: "Visit reminder · written for you", and its door. */
      writtenForYou: "written for you",
      /** Beside the moment's own message, not added yet: the word that picks one of the Library's instead. */
      another: "another message",
      change: "Change",
      open: "Open",
      /** A word of a running campaign changed in place, said with its Undo: "Visit reminder runs at 9:00 AM now". */
      saved: {
        hour: (name: string, hour: string): LifecycleSentence => [{ b: name }, ` runs at ${hour} now`],
        cap: (name: string, n: number): LifecycleSentence => [{ b: name }, ` reaches up to ${n} a run now`],
        gap: (name: string, days: number): LifecycleSentence => [
          { b: name },
          ` waits ${days} days before the same person hears it again`,
        ],
        undone: (name: string): LifecycleSentence => [{ b: name }, " is back as it was"],
      },
      /** Its runs, newest last, a bar each: what the strip says to a screen reader, and its head. */
      runs: (n: number): string => `The newest ${plural(n, "run", "runs")}`,
    },
    // The send screen is made of the broadcasts read (its lists and its messages): said where it could not be, with its Retry.
    failed: {
      what: "who and what you can send to",
      body: "Nothing goes out until it reads. Everything else here is current.",
      surface: "broadcasts",
    },
  },
  phone: { moments: "Moments" },
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
    /**
     * The Moments head's channels on a phone (Ruben, 11 Oct 2026): a chip each, a filled dot where it sends and a hollow
     * one where it is not set up, as the rows' marks draw them; a hollow chip pressed says why under the row, and one
     * door to Settings › Connections stands at its end.
     */
    head: "Your channels",
    sending: (word: string): string => `${word}, sending`,
    notSetUp: (word: string): string => `${word}, not set up: why`,
    setUp: "Set up",
    /** Nothing can send at all: one card in the head in place of the reach line, its one door to Connections. */
    none: {
      title: "Nothing can send yet",
      body: "Connect WhatsApp, a texting line or email, and your moments start here.",
      act: "Set up channels",
    },
  },
  // A read that failed is its own state, never a tile that is not there or a zero that was not counted. The page draws the
  // kit's failed read where the data would be, and its Retry reads `surface` again.
  failed: {
    // The templates are the settings read's, the one read of them (apps/dashboard offered-templates.ts): its Retry reads that.
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
  // Campaigns' ledger (spec 2026-10-09 §4.3, §4.4): every word its page says once; each row's own are the view model's.
  ledger: {
    /** The ledger's name to a screen reader. */
    label: "Your campaigns",
    /** The phone's strip of chips, to a screen reader. */
    strip: "Campaigns by moment",
    /** The phone's search circle, which opens the search. */
    find: "Search campaigns",
    heads: { campaign: "Campaign", goesBy: "Goes by", people: "People now", results: "Last 30 days", next: "Next" },
    /** `label`: the desk's status tabs, to a screen reader. */
    tabs: { label: "Campaigns by state", all: "All", needs: "Needs you", paused: "Paused" },
    /** "Needs you" names its unit, where its count is said: "2 campaigns need you". */
    needsOf: (n: number): string => `${plural(n, "campaign")} ${n === 1 ? "needs" : "need"} you`,
    search: (n: number): string => `Search ${plural(n, "campaign")}`,
    showing: (n: number, of: number): string => `Showing ${n} of ${of}`,
    showingIn: (caps: string, n: number, of: number): string => `${caps} · showing ${n} of ${of}`,
    clear: "Clear",
    sort: { label: "Sort", next: "Next", name: "Name", people: "People now", replied: "Replied" },
    group: { label: "Group", moment: "By moment", none: "No groups" },
    groups: { lists: "Lists & offers", reach_out: "Reach-outs", sent_once: "Sent once" },
    /** A group no campaign stands on yet. */
    none: "No campaign yet",
    empty: "No campaigns match",
    /** What is not counted, or not known, in a cell: never a zero nobody counted. */
    dash: "—",
    turnOn: "Turn on",
    findBusinesses: "Find businesses to write to",
    archived: "Its list is archived",
    businesses: "businesses",
    chainNeeds: "Writes to the businesses a search found",
    /** A reach-out fed by a list its owner adds to (00426), where a search's says the search's name. */
    ownList: "Its own list",
    /**
     * Who is in a reach-out now (00426), its People cell: the waiting and the writing, "17 waiting · 9 writing"; the
     * done alone where nobody else is left; "Nobody yet" before anyone is.
     */
    peopleNow: (p: { waiting: number; writing: number; done: number }): string => {
      const now = [p.waiting ? `${p.waiting} waiting` : null, p.writing ? `${p.writing} writing` : null].filter(
        (x): x is string => !!x,
      );
      return now.length ? now.join(" · ") : p.done ? `${p.done} done` : "Nobody yet";
    },
    openRun: "Open the run",
    /**
     * A row's last 30 days, as its cell says them. A reach-out's is in the businesses it wrote to, which "wrote back" is a
     * count of; its emails written only where the businesses were not counted (a database before 00404).
     */
    results: (r: LifecycleRowResults): string =>
      r === "uncounted"
        ? "—"
        : r === "none"
          ? "Nothing sent"
          : r.kind === "sent"
            ? `${r.sent} sent · ${r.replied} replied`
            : r.businesses === null
              ? `${r.written} written · ${r.wroteBack} wrote back`
              : `${plural(r.businesses, "business", "businesses")} · ${r.wroteBack} wrote back`,
    sentOnce: {
      footer: (n: number): string => `Sent once · last 30 days · ${n}`,
      open: "Sent",
      state: "Sent",
      hint: (when: string | null): string => (when ? `Sent once · ${when}` : "Sent once"),
    },
    /** One word per act (decision 19): "Approve · 7 people" and "Skip", everywhere a waiting run is decided. */
    approve: (n: number): string => `Approve · ${plural(n, "person", "people")}`,
    skip: "Skip",
    resume: {
      label: "Resume",
      question: (name: string): string => `Resume ${name}?`,
      /** When, and to about how many; when alone where the moment could not be counted (null), never "about 0". */
      detail: (when: string, n: number | null): string =>
        n === null ? `Next run ${when}` : `Next run ${when}, about ${plural(n, "person", "people")}`,
      chain: "Its next emails go out on its next run.",
      /** Said in full where the campaign's class sends without asking (`auto`, decision 7), where the page knows the mode. */
      auto: "It sends on its own: nothing will wait for your approval.",
      yes: "Yes, resume it",
    },
    /** What the drawer's head calls a campaign whose group the page does not hold. */
    kicker: "Campaign",
  },
  /** Ask's doors on the page (the moment spec, A1): the head's, the first day's sentence, and the drawer's More. */
  ask: {
    door: "Ask",
    /** The chip Ask offers on the first day says the same sentence (contracts SET_UP_CAMPAIGNS). */
    setUp: SET_UP_CAMPAIGNS.en,
    /** The first day's door to it, at the list's top: what pressing it does, said as an offer. */
    setUpDoor: "Let Ask set up your campaigns",
    about: "Ask about this campaign",
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
    /**
     * The phone's line in the Moments head: who of everyone in People a message can reach now. Everyone is said as
     * everyone ("All 29 can hear you"), not as a fraction of itself; nobody in People is no line at all (the tile).
     */
    phoneHear: (canHear: number, people: number): string =>
      canHear === people
        ? people === 1
          ? "1 can hear you"
          : `All ${people} can hear you`
        : `${canHear} of ${people} can hear you`,
    /** The phone's door to how the yes to offers is got: the words that door carries on a run's sheet and in Setup. */
    phoneYes: "Get their yes",
    code: "Show the code",
    copy: "Copy the phrase",
    link: "People",
  },
  coming: {
    title: "Coming up",
    window: "next 7 days",
    // Its door goes to Sent's week (spec 2026-10-09 §4.3), where every run is read.
    link: CAMPAIGN_ROOMS.sent,
    rules: `Sends wait for ${SENDING_HOURS_WORDS.range} · one a week per person, across every moment`,
    empty: "Nothing is set to go out in the next 7 days.",
    nobody: "Nobody",
    /** A run waiting for the owner, in the run's one phrase (broadcasts.ts BROADCAST_STATE_LABELS reads it too). */
    waiting: RUN_WAITING_WORDS,
    /** A reach-out's going run whose emails the check holds for the owner's say. */
    held: heldEmailsWords,
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
    /** The tile's second door: Reports › Campaigns over the same days. */
    fullReport: "Full report",
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
  paused: (name: string): LifecycleSentence => [{ b: name }, " paused"],
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

/**
 * What a moment already holds, said in the composer opened on it (decision 20): one line per campaign on the same moment
 * ("Appointment reminder · On", "Win-back · Paused"), the campaign being changed left out; none for a moment that holds
 * none, and none for a list (a list holds as many campaigns as it is given, and that is no news). The win-back's two
 * moments are one, as the rail groups them (isWinBack).
 */
export function momentHoldsWords(
  rows: readonly { id: string; name: string; trigger: string; state: string }[],
  trigger: string,
  editing: string | null,
): string[] {
  // "On a list" (decision 0009) is the one trigger of kind `saved`: each of its campaigns names its own list.
  if (triggerOf(trigger)?.kind === "saved") return [];
  const same = (t: string) => t === trigger || (isWinBack(t) && isWinBack(trigger));
  return rows
    .filter((p) => p.id !== editing && same(p.trigger))
    .map((p) => LIFECYCLE_WORDS.compose.holds(p.name, p.state !== "running"));
}

/** A playbook's clock in the fewest words: "daily 10:00 AM", "every 30 days". The hour is the product's clock's (clockHour). */
function lifecycleClock(p: Pick<LifecyclePlaybook, "trigger" | "run_hour" | "cadence_days">): string {
  return p.trigger === "everyone_monthly" ? `every ${p.cadence_days} days` : `daily ${clockHour(p.run_hour)}`;
}

/** A campaign's state as every page says it: its words, the same on a phone, its tone, and whether it is paused. */
export interface LifecycleState {
  words: string;
  /** The same on a phone, where there is room for less: the clock alone while it is on. */
  short: string;
  tone: LifecycleTone;
  paused: boolean;
}

const stated = (words: string, tone: LifecycleTone, paused = false, short = words): LifecycleState => ({
  words,
  short,
  tone,
  paused,
});

/**
 * What a playbook says of itself as a state: ended on its day, running nothing here, a run waiting on the person, paused,
 * on trial until its day, or on with its clock. The ONE source of a campaign's state word, tone and pause: the rail, the
 * ledger (desk and phone), the drawer, Coming up and Ask read it. A run waiting for the owner is shown whether or not the
 * campaign is paused, on every page the same way (D1-campaign-state): pausing leaves a waiting run waiting by design
 * (ask-proposals/campaigns.ts), the home tested the pause first and said "Paused" with Resume where the drawer tested the
 * run first and said "Waiting on you" with Approve, and Coming up pointed at a row that had no Approve. `paused` still says
 * whether it is, for Resume.
 */
export function lifecycleStateOf(
  p: Pick<LifecyclePlaybook, "trigger" | "run_hour" | "cadence_days" | "state" | "totals" | "ended" | "trial"> & {
    off?: string | null;
  },
): LifecycleState {
  // A campaign past its last day runs nothing more (its `off` says so too): its end is the state, whatever else it was.
  if (p.ended) return stated(LIFECYCLE_WORDS.ended(p.ended), "plain");
  if (p.off) return stated("Not running here", "plain");
  const paused = p.state !== "running";
  if (p.totals.waiting) return stated(RUN_WAITING_WORDS, "warn", paused);
  // Paused rests (decision 13 of 9 Oct 2026): amber is for a run waiting on someone, never for a rule its owner stopped.
  if (paused) return stated("Paused", "plain", true);
  // On, its runs waiting for a person until the trial ends: the news beside its clock, which its next run still says.
  if (p.trial) return stated(LIFECYCLE_WORDS.onTrial(p.trial), "ok");
  return stated(`On · ${lifecycleClock(p)}`, "ok", false, lifecycleClock(p));
}

/**
 * A reach-out's state, said as a playbook's is (lifecycleStateOf): its run waiting first, whether or not it is paused, then
 * paused, else on. The ledger's row and the reach-out's drawer read it, so the drawer wears the home's word, not "Running".
 */
export function lifecycleChainStateOf(
  c: Pick<ReachOutChainDto, "state"> & { next: Pick<ReachOutChainDto["next"], "waiting_run_id"> },
): LifecycleState {
  const paused = c.state !== "running";
  if (c.next.waiting_run_id) return stated(RUN_WAITING_WORDS, "warn", paused);
  return paused ? stated("Paused", "plain", true) : stated("On", "ok");
}

/** How a moment's or a group's campaigns stand, in a line: "3 campaigns · 2 on · 1 paused". */
export function tallyWords(n: number, t: { on: number; waiting: number; paused: number; off: number }): string {
  return [
    plural(n, "campaign"),
    t.on > 0 ? `${t.on} on` : "",
    t.waiting > 0 ? `${t.waiting} waiting` : "",
    t.paused > 0 ? `${t.paused} paused` : "",
    t.off > 0 ? `${t.off} not running here` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
