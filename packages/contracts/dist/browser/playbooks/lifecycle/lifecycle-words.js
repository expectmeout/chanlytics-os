import { SET_UP_CAMPAIGNS } from "../../ask/ask-suggestions.js";
import { appointmentWords } from "../../journey/appointment-word.js";
import { clockHour } from "../../shared/clock.js";
import {
  CAMPAIGN_ROOMS,
  RUN_OPEN_WORDS,
  RUN_WAITING_WORDS,
  heldEmailsWords,
  runApprovedTail,
  runApproveWords,
  runStoppedWords
} from "../../shell/campaign-rooms.js";
import { joinWords, plural } from "../../shared/words.js";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions.js";
import { WORKSPACE_PAUSED_FACT } from "../../workspace/billing.js";
import { SENDING_HOURS_WORDS, triggerOf } from "../playbook-triggers.js";
export const channelsGoesByWords = (channels) => joinWords(channels.map((c) => VERSION_CHANNEL_WORDS[c]));
const NEEDS_CALENDAR = {
  none: "Needs your calendar",
  email: "Needs your calendar feed",
  door: "Connect your calendar"
};
export const LIFECYCLE_WORDS = {
  title: CAMPAIGN_ROOMS.home,
  lede: "What goes out on its own as a customer reaches a moment, and what you send yourself.",
  library: CAMPAIGN_ROOMS.library,
  newMessage: CAMPAIGN_ROOMS.newMessage,
  // Said, after the standard beat, where a tile's read is still out.
  reading: "Reading\u2026",
  close: "Close",
  rail: "Your customer, start to finish",
  needs: {
    none: "Answers whoever writes",
    messages: "Reaches a yes to messages",
    offers: "Needs a yes to offers"
  },
  receptionist: "Answers \xB7 asks for the yes",
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
    none: "No message for it yet"
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
    quiet: "Brings back people who've gone quiet"
  },
  monthsOffer: { name: "The month's offer" },
  /** A campaign past its last day (00416 `until`), its state: "Ended Oct 1", the day by the business's calendar. */
  ended: (day) => `Ended ${day}`,
  gone: {
    title: "That campaign isn't here any more.",
    body: "Its runs are still counted in Reports, with their numbers."
  },
  /** A message opened by its name (over a page, or in the Library) whose name leads to no message any more. */
  messageGone: {
    title: "That message isn't here any more.",
    body: "Every message you keep is in Messages."
  },
  compose: {
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
        never: "while Autonomy keeps it quiet"
      },
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
      who: (trigger, word) => {
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
      hear: (will, pool) => pool === null ? `${will} can hear it` : will > 0 && will === pool ? `All ${will} can hear it` : `${will} of ${pool} can hear it`,
      /** Nobody the moment names yet: "Nobody with an appointment tomorrow right now". */
      nobody: (of) => `Nobody ${of} right now`,
      /** What happens next, before it is saved ("First run today at 10:00 AM"), or for one that runs ("Next run …"). */
      firstRun: (when) => `First run ${when}`,
      nextRun: (when) => `Next run ${when}`,
      /** A day and an hour as a line says them, from a label's "today 10:00 AM": "today at 10:00 AM". */
      at: (label) => label.replace(/^(today|tomorrow) (?=\d)/, "$1 at "),
      /** A send's one act, once a time is picked: "Schedule for tomorrow at 9:00 AM". */
      scheduleFor: (when) => `Schedule for ${when}`,
      /**
       * The message, folded under its first words (Ruben, 11 Oct 2026: "make the preview something you expand to see, so
       * the drawers are more compact"): what the fold says while it is open.
       */
      previewOpen: "How it reads",
      previewLabel: "The message, as it reads",
      /** An edit's changes, counted in its foot: "2 changes · from the next run". */
      changes: (n) => `${plural(n, "change", "changes")} \xB7 from the next run`,
      /** The foot of a Turn on whose moment's own message is not in the Library yet: the one press adds it, then starts. */
      addsFirst: (title) => `Adds ${title} to your messages, then turns it on.`,
      /** The message under its preview: "Visit reminder · written for you", and its door. */
      writtenForYou: "written for you",
      /** Beside the moment's own message, not added yet: the word that picks another of your messages instead. */
      another: "another message",
      change: "Change",
      open: "Open",
      /** A word of a running campaign changed in place, said with its Undo: "Visit reminder runs at 9:00 AM now". */
      saved: {
        hour: (name, hour) => [{ b: name }, ` runs at ${hour} now`],
        cap: (name, n) => [{ b: name }, ` reaches up to ${n} a run now`],
        gap: (name, days) => [
          { b: name },
          ` waits ${days} days before the same person hears it again`
        ],
        undone: (name) => [{ b: name }, " is back as it was"]
      },
      /** Its runs, newest last, a bar each: what the strip says to a screen reader, and its head. */
      runs: (n) => `The newest ${plural(n, "run", "runs")}`
    },
    // The send screen is made of the broadcasts read (its lists and its messages): said where it could not be, with its Retry.
    failed: {
      what: "who and what you can send to",
      body: "Nothing goes out until it reads. Everything else here is current.",
      surface: "broadcasts"
    }
  },
  phone: { moments: "Moments" },
  // The channels a campaign goes by: the row's word in the drawer, and what a mark that waits says of itself.
  channels: {
    goesBy: "Goes by",
    /** A kept channel the workspace cannot send on yet, after its name: "Email · waits". */
    waits: "waits",
    /** The marks' line to a screen reader: "Goes by WhatsApp and Email; Text waits; could also go by Email". */
    marks: (on, waits, could) => [
      on.length > 0 ? `Goes by ${joinWords(on)}` : waits.length > 0 ? "" : "Goes by nothing yet",
      waits.length > 0 ? `${joinWords(waits)} ${waits.length === 1 ? "waits" : "wait"}` : "",
      could.length > 0 ? `could also go by ${joinWords(could)}` : ""
    ].filter(Boolean).join("; "),
    /** After a change of channels, where a run of the playbook already waits: it was made with the channels it had. */
    runKeeps: "the run that waits keeps the channels it was made with",
    /**
     * The Moments head's channels on a phone (Ruben, 11 Oct 2026): a chip each, a filled dot where it sends and a hollow
     * one where it is not set up, as the rows' marks draw them; a hollow chip pressed says why under the row, and one
     * door to Settings › Connections stands at its end.
     */
    head: "Your channels",
    sending: (word) => `${word}, sending`,
    notSetUp: (word) => `${word}, not set up: why`,
    setUp: "Set up",
    /** Nothing can send at all: one card in the head in place of the reach line, its one door to Connections. */
    none: {
      title: "Nothing can send yet",
      body: "Connect WhatsApp, a texting line or email, and your moments start here.",
      act: "Set up channels"
    }
  },
  // A read that failed is its own state, never a tile that is not there or a zero that was not counted. The page draws the
  // kit's failed read where the data would be, and its Retry reads `surface` again.
  failed: {
    // The templates are the settings read's, the one read of them (apps/dashboard offered-templates.ts): its Retry reads that.
    templates: {
      what: "your templates",
      body: "The call's text and your messages show once they read. Everything else here is current.",
      surface: "settings"
    },
    counts: {
      what: "who each moment reaches",
      body: "The moments show who they reach once it reads. Everything else here is current.",
      surface: "playbooks"
    },
    chains: { what: "your sequences to leads", body: "The moments above are current.", surface: "reach_outs" },
    report: { what: "this period's numbers", body: "The runs below stand.", surface: "campaign_results" },
    // The broadcasts read itself, said in each tile made from it.
    reach: {
      what: "who can hear you",
      body: "The ladder shows once it reads. Everything else here is current.",
      surface: "broadcasts"
    },
    coming: {
      what: "what is coming up",
      body: "What is coming shows once it reads. Everything else here is current.",
      surface: "broadcasts"
    },
    results: {
      what: "what came back",
      body: "The numbers show once they read. Everything else here is current.",
      surface: "broadcasts"
    }
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
    needsOf: (n) => `${plural(n, "campaign")} ${n === 1 ? "needs" : "need"} you`,
    search: (n) => `Search ${plural(n, "campaign")}`,
    showing: (n, of) => `Showing ${n} of ${of}`,
    showingIn: (caps, n, of) => `${caps} \xB7 showing ${n} of ${of}`,
    clear: "Clear",
    sort: { label: "Sort", next: "Next", name: "Name", people: "People now", replied: "Replied" },
    group: { label: "Group", moment: "By moment", none: "No groups" },
    groups: { lists: "Lists & offers", reach_out: "To leads", sent_once: "Sent once" },
    /** A group no campaign stands on yet. */
    none: "No campaign yet",
    empty: "No campaigns match",
    /** What is not counted, or not known, in a cell: never a zero nobody counted. */
    dash: "\u2014",
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
    peopleNow: (p) => {
      const now = [p.waiting ? `${p.waiting} waiting` : null, p.writing ? `${p.writing} writing` : null].filter(
        (x) => !!x
      );
      return now.length ? now.join(" \xB7 ") : p.done ? `${p.done} done` : "Nobody yet";
    },
    openRun: RUN_OPEN_WORDS,
    /**
     * A row's last 30 days, as its cell says them. A reach-out's is in the businesses it wrote to, which "wrote back" is a
     * count of; its emails written only where the businesses were not counted (a database before 00404).
     */
    results: (r) => r === "uncounted" ? "\u2014" : r === "none" ? "Nothing sent" : r.kind === "sent" ? `${r.sent} sent \xB7 ${r.replied} replied` : r.businesses === null ? `${r.written} written \xB7 ${r.wroteBack} wrote back` : `${plural(r.businesses, "business", "businesses")} \xB7 ${r.wroteBack} wrote back`,
    sentOnce: {
      footer: (n) => `Sent once \xB7 last 30 days \xB7 ${n}`,
      open: "Sent",
      state: "Sent",
      hint: (when) => when ? `Sent once \xB7 ${when}` : "Sent once"
    },
    /** One word per act (decision 19): "Approve · 7 people" and "Skip", everywhere a waiting run is decided. */
    approve: runApproveWords,
    skip: "Skip",
    resume: {
      label: "Resume",
      question: (name) => `Resume ${name}?`,
      /** When, and to about how many; when alone where the moment could not be counted (null), never "about 0". */
      detail: (when, n) => n === null ? `Next run ${when}` : `Next run ${when}, about ${plural(n, "person", "people")}`,
      chain: "Its next emails go out on its next run.",
      /** Said in full where its next batch goes without asking (`auto`, decision 7), where the page knows the mode. */
      auto: "It sends on its own: nothing will wait for your approval.",
      /** Said where its next batch's words are new to you (decision 0064): that batch waits for your OK, whatever the mode. */
      asksFirst: "Its first batch waits for your OK.",
      yes: "Yes, resume it"
    },
    /** What the drawer's head calls a campaign whose group the page does not hold. */
    kicker: "Campaign"
  },
  /** Ask's doors on the page (the moment spec, A1): the head's, the first day's sentence, and the drawer's More. */
  ask: {
    door: "Ask",
    /** The chip Ask offers on the first day says the same sentence (contracts SET_UP_CAMPAIGNS). */
    setUp: SET_UP_CAMPAIGNS.en,
    /** The first day's door to it, at the list's top: what pressing it does, said as an offer. */
    setUpDoor: "Let Ask set up your campaigns",
    about: "Ask about this campaign"
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
    phoneHear: (canHear, people) => canHear === people ? people === 1 ? "1 can hear you" : `All ${people} can hear you` : `${canHear} of ${people} can hear you`,
    /** The phone's door to how the yes to offers is got: the words that door carries on a run's sheet and in Setup. */
    phoneYes: "Get their yes",
    code: "Show the code",
    copy: "Copy the phrase",
    link: "People"
  },
  coming: {
    title: "Coming up",
    window: "next 7 days",
    rules: `Sends wait for ${SENDING_HOURS_WORDS.range} \xB7 one a week per person, across every moment`,
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
      approving: "Approving\u2026",
      skip: "Skip",
      /** The two acts named whole for a screen reader: where two runs wait, "Approve" twice says nothing of which. */
      approveOf: (name) => `Approve this run of ${name}`,
      skipOf: (name) => `Skip this run of ${name}`,
      question: (name) => `Skip this run of ${name}?`,
      detail: "Nothing sends, and the run closes.",
      yes: "Yes, skip it"
    },
    // A running moment's row while the WORKSPACE is paused (billing): no time is promised, since the send door refuses every
    // message of a run until billing resumes. It says so where "Tomorrow 10:00" stood.
    paused: {
      when: { day: "Paused", at: "for billing" },
      // The fact in its one spelling (workspace/billing.ts), which a waiting run on the line below says too, with its door.
      why: WORKSPACE_PAUSED_FACT,
      pill: "Workspace paused"
    }
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
    readOf: (whatsappSent) => `Read is of WhatsApp's ${whatsappSent}: a text or an email keeps no read receipt.`,
    noRead: "These went by text or email, which keep no read receipt."
  }
};
export const LIFECYCLE_TOAST = {
  resumed: (name) => [{ b: name }, " resumed"],
  paused: (name) => [{ b: name }, " paused"],
  changed: (name) => [{ b: name }, " changed"],
  // A new campaign is running: its sequence opens as this is said (campaigns/home/sheets.tsx), its next batch on it.
  running: (name) => [{ b: name }, " is running"],
  /** The name of a line the page has no row for, where a toast must name it. */
  nameless: "It",
  /**
   * A waiting run approved: the server's own count, and when it really goes in the page's clock words ("sending now",
   * "scheduled for tomorrow 9:00 AM"), since the server may move a late approval to the next sending hour.
   */
  approved: (name, people, when) => [
    { b: name },
    ` ${runApprovedTail(people, when)}`
  ],
  /**
   * A run stopped from its line or its card: what the server stopped, by what the run was when it did (campaign-rooms.ts
   * runStoppedWords, Sent's own receipt). A run that waited closes unsent; one a teammate approved a moment before, and
   * that is already going, stops after the batch in hand, and the page does not say "nothing will send" of it.
   */
  skipped: (name, was) => [
    { b: name },
    ` ${runStoppedWords(was)}`
  ],
  /**
   * A playbook's channels changed, from its drawer or from Ask's card: "Visit reminder goes by WhatsApp and Email now".
   * `runWaits`: a run of it already waits for approval, and keeps the channels it was made with (core run-playbook
   * stores them as it enrols), so the sentence says the change is the next run's.
   */
  channels: (name, channels, runWaits) => [
    { b: name },
    ` goes by ${channelsGoesByWords(channels)} now${runWaits ? ` \xB7 ${LIFECYCLE_WORDS.channels.runKeeps}` : ""}`
  ],
  phraseCopied: "Phrase copied",
  /** The browser would not copy it: the toast shows the phrase, to be typed or copied by hand. */
  copyFailed: (phrase) => `Couldn't copy, the phrase is: ${phrase}`
};
function lifecycleClock(p) {
  return p.trigger === "everyone_monthly" ? `every ${p.cadence_days} days` : `daily ${clockHour(p.run_hour)}`;
}
const stated = (words, tone, paused = false, short = words) => ({
  words,
  short,
  tone,
  paused
});
export function lifecycleStateOf(p) {
  if (p.ended) return stated(LIFECYCLE_WORDS.ended(p.ended), "plain");
  if (p.off) return stated("Not running here", "plain");
  const paused = p.state !== "running";
  if (p.totals.waiting) return stated(RUN_WAITING_WORDS, "warn", paused);
  if (paused) return stated("Paused", "plain", true);
  return stated(`On \xB7 ${lifecycleClock(p)}`, "ok", false, lifecycleClock(p));
}
export function lifecycleChainStateOf(c) {
  const paused = c.state !== "running";
  if (c.next.waiting_run_id) return stated(RUN_WAITING_WORDS, "warn", paused);
  return paused ? stated("Paused", "plain", true) : stated("On", "ok");
}
export function tallyWords(n, t) {
  return [
    plural(n, "campaign"),
    t.on > 0 ? `${t.on} on` : "",
    t.waiting > 0 ? `${t.waiting} waiting` : "",
    t.paused > 0 ? `${t.paused} paused` : "",
    t.off > 0 ? `${t.off} not running here` : ""
  ].filter(Boolean).join(" \xB7 ");
}
