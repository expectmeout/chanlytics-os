/**
 * Campaigns' rooms, said once (3 Oct 2026; decision 0060's S6). Campaigns is Sequences, with Messages beside it (D4: the
 * Library is Messages, the wording the receptionist and the campaigns send); Sent's list became each sequence's History
 * (D3), its sheets (a run's, To send, Get their yes, the send screen) kept at their addresses. Broadcasts, Templates and
 * Playbooks are what the routes, the code and the database call them, and what people typed before; a sentence a person
 * reads, on a page, in a toast, a notice or an email, names a room from here, so a word changes in one place. New message
 * is the verb, whichever room it starts from.
 */
export const CAMPAIGN_ROOMS = {
  home: "Campaigns",
  library: "Messages",
  newMessage: "New message",
} as const;

const { library } = CAMPAIGN_ROOMS;

/** A message picker with nothing to pick: what to do, and the Library, which opens as a link after the lead. */
export interface NoMessageWords {
  lead: string;
  link: string;
}

/** The send screen's picker: no message it can send, whichever channel a message is written for. */
export const NO_TEMPLATE_WORDS: NoMessageWords = {
  lead: "No message to send yet — add the starter set, or write one in",
  link: library,
};

/** A playbook composer's picker: no message, for this moment where the moment has a starter. */
export function noMessageWords(forThisMoment: boolean): NoMessageWords {
  return {
    lead: `No message ${forThisMoment ? "for this moment " : ""}yet — write one in`,
    link: library,
  };
}

/**
 * The Library page's own lines: the waiting line, the read that failed, what a workspace with no WhatsApp number is told
 * (a message needs none: only its WhatsApp version waits for one) and what writing a WhatsApp version asks of a number.
 */
export const LIBRARY_WORDS = {
  title: library,
  demo: `${library} reads a real workspace — the messages it holds, by email, text and WhatsApp.`,
  reading: "Reading your messages…",
  failed: "Your messages couldn’t be loaded right now",
  failedWhat: "your messages",
  failedBody: "The receptionist keeps sending; this page just can't show what it holds at the moment.",
  /** The count's hover: what the Library holds is every message, on each channel it goes by, whoever writes its versions. */
  headTip:
    "What the receptionist and your campaigns send, as the customer sees it. A WhatsApp version is approved by WhatsApp, usually within minutes, whether it is written here or in WhatsApp Manager; an email or a text is ready the moment it is saved. A marketing message can only go to people who said yes to offers.",
  noNumber:
    "No WhatsApp number yet. Email and text versions are written here; WhatsApp versions wait until one is connected.",
  /** A template is written to a number's account, which is the edge's own answer (no_channel) when it has none. */
  writeNeedsNumber: "Connect a WhatsApp number first — templates belong to a number's account.",
  /** Why a WhatsApp version, or a language of one, cannot be added with no number; an email or a text needs none. */
  addNeedsNumber: "Connect a WhatsApp number to add a WhatsApp version.",
} as const;

/**
 * What the Library's composer says when a new message begins as an email (a message needs no WhatsApp row). It asks where
 * the message is sent first; an email or a text is written here and reviewed by no one, so the message is an offer or
 * news (the starters alone are about a visit or a proposal), and a text carries no offers: the first sentence of what a
 * text says is the carriers' (contracts channelNeverCarries), this is the second. What keeps a message from being written
 * is said in the person's words before anything is sent.
 */
export const NEW_MESSAGE_WORDS = {
  /** The first choice's name: Email, Text or WhatsApp. */
  where: "Where is it sent",
  /** Under the pane's name while the message is an email's or a text's: what is not WhatsApp's. */
  sub: "Email is written here and ready the moment it is saved; no one reviews it first.",
  /** The one quiet line over the form: what a message written here is, and where the other kind comes from. */
  own: "A message you write here is an offer or news. Reminders and follow-ups come from the starter set.",
  /** What a text says after the carriers' sentence: the way out. */
  textGoesByEmail: "This one can go by email.",
  writeAsEmail: "Write it as an email",
  /** The act that takes the last of a message's values away: only the last, so no value is renumbered under words that use it. */
  removeValue: "Remove the last value",
  /** Under the title: the name the message is filed under, which WhatsApp would know it by. */
  knownAs: "WhatsApp would know it as",
  titleMissing: "Give it a title.",
  titleTooLong: (max: number): string => `A title is at most ${max} characters.`,
  titleNeedsWords: "A title needs letters or digits in it.",
  nameTaken: "There is a message by that name already. Give this one another title.",
  valuesNeedWords: "Give each value a name and an example.",
  valueTooLong: (what: "name" | "example", max: number): string => `A value's ${what} is at most ${max} characters.`,
} as const;

/**
 * What the starter set says it does, on the Library's banner and after it is added. Its email and text versions are
 * written at once, whatever the workspace has connected; its WhatsApp versions go to a number's account, so they wait
 * for one, and WhatsApp reviews each.
 */
export const LIBRARY_STARTER_WORDS = {
  /** The banner's second line: the languages it comes in, and what is written now. */
  banner: (languages: string, hasNumber: boolean): string =>
    hasNumber
      ? `In ${languages} — email and text versions are written at once, and WhatsApp reviews each of its versions, usually within minutes.`
      : `In ${languages} — email and text versions are written at once; WhatsApp versions are added when a number is connected.`,
  /** The toast's clauses: what was written, what could not be, and what waits. */
  versionsWritten: (n: number): string => `${n} email and text version${n === 1 ? "" : "s"} written`,
  versionsFailed: (n: number, why: string | null): string =>
    `${n} email and text version${n === 1 ? "" : "s"} could not be written${why ? `: ${why}` : ""}`,
  waitsForNumber: "WhatsApp versions wait for a number",
  /** The route's refusal when the channels it is asked for are none it knows. */
  pickAChannel: "Pick at least one channel: WhatsApp, email or text.",
  /** A new campaign named by a starter that is not its moment's own, or by no starter the set has (A0). */
  notThisMoment: (moment: string): string =>
    `That starter is not one “${moment}” goes by: name the moment's own starter, or one of your messages.`,
  /** A starter whose words are the owner's to write (the month's offer): it is started from the composer. */
  takesOwnWords: (title: string): string =>
    `The “${title}” starter takes words of its own: write them in the composer and start it there.`,
  /**
   * A starter the workspace hid in its messages: it has a version, and no card adds it back, so the way out is to show it
   * again or to go by another message, never the starter set, which leaves a hidden one hidden.
   */
  hiddenInLibrary: (title: string): string =>
    `The “${title}” starter is hidden in this workspace: show it again under ${CAMPAIGN_ROOMS.home} › ${library}, or name another message.`,
  /** What a new campaign's card does first where the workspace does not hold its moment's starter (A0). */
  addsFirst: (title: string): string => `adds the “${title}” starter first`,
  /**
   * The card's WhatsApp clause where no WhatsApp version of the starter is on file: the filing sends one for review at
   * Approve, which cannot be taken back, and the campaign's people there wait for WhatsApp's answer. No time is promised:
   * nothing on record says how long a review takes. A version already on file is said as it stands (messageWhyNot).
   */
  whatsappForReview:
    "WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back. Its runs hold those people until WhatsApp approves it.",
  /**
   * The same review, said beside the workspace's own reason WhatsApp waits (a number WhatsApp flagged): there, WhatsApp's
   * approval of the version releases nobody, so the reason stands and the review is a clause of its own.
   */
  whatsappSentForReview:
    "Its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back.",
  /**
   * A new campaign named by a starter, on channels none of which its message holds at once: a WhatsApp version in
   * review carries nothing until WhatsApp approves it, and once sent it cannot be taken back, so nothing is filed.
   * `on` is where it was asked to go, `could` where the starter would carry it at once (null: nowhere).
   */
  waitsForWhatsApp: (title: string, on: string, could: string | null): string =>
    could
      ? `The “${title}” starter can send nothing ${on} until WhatsApp approves its WhatsApp version: let the campaign go ${could} too, or start it once WhatsApp has.`
      : `The “${title}” starter can send nothing ${on} until WhatsApp approves its WhatsApp version: start the campaign once WhatsApp has.`,
  /** The starter was judged and filing it failed, so no campaign was started (a version refused, or none to send). */
  notAdded:
    "The starter message could not be added just now, so nothing was started. Try again, or add it from Messages.",
  /**
   * The same, where its WhatsApp version did reach WhatsApp (sent for review, or found in the number's account): that
   * version is in the Library and stays there, and a second press sends nothing to WhatsApp again.
   */
  notAddedSentForReview:
    "The starter's WhatsApp version went to WhatsApp for review and is in Messages, but the campaign could not be started just now. Try again: nothing is sent to WhatsApp twice.",
} as const;

/** What a broadcast is, said where a page defines it (the Sent room's standing line, on hover): one message, and where it goes. */
export const BROADCAST_WORDS = {
  tip: "One message, on the channels it holds, to the people who said yes. Replies land in the Inbox, where the receptionist answers them.",
} as const;

/**
 * What stopping a run says after its name, by what the run was when the server stopped it (the cancel door answers
 * `was`): a run that waited is skipped, one being sent stops after the batch in hand, any other is canceled. One
 * sentence for Sent's row, a playbook's card and Coming up's line: the last two said "nothing will send" whatever the
 * server had stopped, and a run a teammate had approved a moment before was already sending.
 */
export function runStoppedWords(was: string | null | undefined): string {
  if (was === "sending") return "stops after this batch";
  return was === "pending_approval" ? "skipped — nothing will send" : "canceled — nothing will send";
}

/**
 * What approving a waiting run says after its name: how many it reaches, by the server's count, and when it really goes
 * (playbook-triggers.ts whenItGoes). One sentence for Sent's toast, Today's, a campaign's drawer and Ask's card (the
 * wiring's second audit, S9-9): Today's said "approved: 7 people" where every other said "approved — 7 people".
 */
export function runApprovedTail(people: number, when: string): string {
  return `approved — ${people} ${people === 1 ? "person" : "people"}, ${when}`;
}

/**
 * A run waiting for its owner's approval, said once (D1-run-words). It was "Waiting on you" (Sent's pill and tab, Campaigns'
 * row), "waiting on you" (Sent's band), "Needs you" (a tab that counts them), "Waiting for your approval" (Today's row), "is
 * waiting for your word" (Today's brief), "Waiting for you" (the drawer's history) and "This run waits on you" (the drawer).
 * The run's state label (broadcasts.ts BROADCAST_STATE_LABELS) is this, and every page that says a run waits reads that.
 * Here, a leaf, so the modules that cannot import the broadcasts' (the Library's used-by line) read it too.
 */
export const RUN_WAITING_WORDS = "Waiting for your approval";

/**
 * How many campaign runs wait for your say, as a sentence: what Today's calm head leads with and the Inbox's Needs-you
 * band says, and what Ask's Right now says in its run clause, so a run waiting is said in one set of words. A run waits
 * for your approval, or for your say on the emails its check holds (waits.ts runWaitsOnYou): one word covers both.
 */
export function runsWaitingSentence(n: number): string {
  return n === 1 ? "A campaign run is waiting for your say." : `${n} campaign runs are waiting for your say.`;
}

/** A reach-out's going run whose emails the check holds for the owner's say: "2 emails wait for your say". */
export function heldEmailsWords(n: number): string {
  return `${n} ${n === 1 ? "email waits" : "emails wait"} for your say`;
}

/**
 * What each stop of a run asks and promises, by the run's state: stopping a send, skipping a run nobody approved and
 * canceling one still to come are three acts and none of them is one click (the audit's D13). Sent's run and its sheet draw
 * them, and Today's queue draws the one for a run still to come, which was a "Stop" at one tap while Sent asked
 * "Cancel X? Nothing will send." before the same cancel (D1-run-words): one verb, with the same question before it.
 */
export interface RunStopWords {
  verb: string;
  question: (row: { name: string }) => string;
  detail: string;
  yes: string;
}

const RUN_STOP_WORDS: Record<"sending" | "pending_approval" | "scheduled", RunStopWords> = {
  sending: {
    verb: "Stop",
    question: (row) => `Stop ${row.name}?`,
    detail: "Messages already out stay out; the rest do not go.",
    yes: "Yes, stop it",
  },
  pending_approval: {
    verb: "Skip",
    question: (row) => `Skip ${row.name}?`,
    detail: "Nothing sends, and the run closes.",
    yes: "Yes, skip it",
  },
  scheduled: {
    verb: "Cancel",
    question: (row) => `Cancel ${row.name}?`,
    detail: "Nothing will send.",
    yes: "Yes, cancel it",
  },
};

/** The stop words for a run's state; a state with none of its own (a run that is not live) is canceled. */
export function runStopWords(state: string): RunStopWords {
  return state === "sending" || state === "pending_approval" ? RUN_STOP_WORDS[state] : RUN_STOP_WORDS.scheduled;
}

/**
 * Why a yes to offers must be in writing, on a person's page: the carriers' rule, and the paper form that answers it, which is
 * under Get their yes. The link opens it (GET_YES_ROUTE).
 */
export const OFFERS_IN_WRITING_WORDS = {
  lead: "The carriers require it: their own message, or a sign-up form they signed — ",
  link: "print one from Get their yes",
} as const;
