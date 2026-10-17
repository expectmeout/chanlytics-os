export const CAMPAIGN_ROOMS = {
  home: "Campaigns",
  library: "Messages",
  newMessage: "New message"
};
const { library } = CAMPAIGN_ROOMS;
export const NO_TEMPLATE_WORDS = {
  lead: "No message to send yet \u2014 add the starter set, or write one in",
  link: library
};
export function noMessageWords(forThisMoment) {
  return {
    lead: `No message ${forThisMoment ? "for this moment " : ""}yet \u2014 write one in`,
    link: library
  };
}
export const LIBRARY_WORDS = {
  title: library,
  demo: `${library} reads a real workspace \u2014 the messages it holds, by email, text and WhatsApp.`,
  reading: "Reading your messages\u2026",
  failed: "Your messages couldn\u2019t be loaded right now",
  failedWhat: "your messages",
  failedBody: "The receptionist keeps sending; this page just can't show what it holds at the moment.",
  /** The count's hover: what the Library holds is every message, on each channel it goes by, whoever writes its versions. */
  headTip: "What the receptionist and your campaigns send, as the customer sees it. A WhatsApp version is approved by WhatsApp, usually within minutes, whether it is written here or in WhatsApp Manager; an email or a text is ready the moment it is saved. A marketing message can only go to people who said yes to offers.",
  noNumber: "No WhatsApp number yet. Email and text versions are written here; WhatsApp versions wait until one is connected.",
  /** A template is written to a number's account, which is the edge's own answer (no_channel) when it has none. */
  writeNeedsNumber: "Connect a WhatsApp number first \u2014 templates belong to a number's account.",
  /** Why a WhatsApp version, or a language of one, cannot be added with no number; an email or a text needs none. */
  addNeedsNumber: "Connect a WhatsApp number to add a WhatsApp version."
};
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
  titleTooLong: (max) => `A title is at most ${max} characters.`,
  titleNeedsWords: "A title needs letters or digits in it.",
  nameTaken: "There is a message by that name already. Give this one another title.",
  valuesNeedWords: "Give each value a name and an example.",
  valueTooLong: (what, max) => `A value's ${what} is at most ${max} characters.`
};
export const LIBRARY_STARTER_WORDS = {
  /** The banner's second line: the languages it comes in, and what is written now. */
  banner: (languages, hasNumber) => hasNumber ? `In ${languages} \u2014 email and text versions are written at once, and WhatsApp reviews each of its versions, usually within minutes.` : `In ${languages} \u2014 email and text versions are written at once; WhatsApp versions are added when a number is connected.`,
  /** The toast's clauses: what was written, what could not be, and what waits. */
  versionsWritten: (n) => `${n} email and text version${n === 1 ? "" : "s"} written`,
  versionsFailed: (n, why) => `${n} email and text version${n === 1 ? "" : "s"} could not be written${why ? `: ${why}` : ""}`,
  waitsForNumber: "WhatsApp versions wait for a number",
  /** The route's refusal when the channels it is asked for are none it knows. */
  pickAChannel: "Pick at least one channel: WhatsApp, email or text.",
  /** A new campaign named by a starter that is not its moment's own, or by no starter the set has (A0). */
  notThisMoment: (moment) => `That starter is not one \u201C${moment}\u201D goes by: name the moment's own starter, or one of your messages.`,
  /** A starter whose words are the owner's to write (the month's offer): it is started from the composer. */
  takesOwnWords: (title) => `The \u201C${title}\u201D starter takes words of its own: write them in the composer and start it there.`,
  /**
   * A starter the workspace hid in its messages: it has a version, and no card adds it back, so the way out is to show it
   * again or to go by another message, never the starter set, which leaves a hidden one hidden.
   */
  hiddenInLibrary: (title) => `The \u201C${title}\u201D starter is hidden in this workspace: show it again under ${CAMPAIGN_ROOMS.home} \u203A ${library}, or name another message.`,
  /** What a new campaign's card does first where the workspace does not hold its moment's starter (A0). */
  addsFirst: (title) => `adds the \u201C${title}\u201D starter first`,
  /**
   * The card's WhatsApp clause where no WhatsApp version of the starter is on file: the filing sends one for review at
   * Approve, which cannot be taken back, and the campaign's people there wait for WhatsApp's answer. No time is promised:
   * nothing on record says how long a review takes. A version already on file is said as it stands (messageWhyNot).
   */
  whatsappForReview: "WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back. Its runs hold those people until WhatsApp approves it.",
  /**
   * The same review, said beside the workspace's own reason WhatsApp waits (a number WhatsApp flagged): there, WhatsApp's
   * approval of the version releases nobody, so the reason stands and the review is a clause of its own.
   */
  whatsappSentForReview: "Its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back.",
  /**
   * A new campaign named by a starter, on channels none of which its message holds at once: a WhatsApp version in
   * review carries nothing until WhatsApp approves it, and once sent it cannot be taken back, so nothing is filed.
   * `on` is where it was asked to go, `could` where the starter would carry it at once (null: nowhere).
   */
  waitsForWhatsApp: (title, on, could) => could ? `The \u201C${title}\u201D starter can send nothing ${on} until WhatsApp approves its WhatsApp version: let the campaign go ${could} too, or start it once WhatsApp has.` : `The \u201C${title}\u201D starter can send nothing ${on} until WhatsApp approves its WhatsApp version: start the campaign once WhatsApp has.`,
  /** The starter was judged and filing it failed, so no campaign was started (a version refused, or none to send). */
  notAdded: "The starter message could not be added just now, so nothing was started. Try again, or add it from Messages.",
  /**
   * The same, where its WhatsApp version did reach WhatsApp (sent for review, or found in the number's account): that
   * version is in the Library and stays there, and a second press sends nothing to WhatsApp again.
   */
  notAddedSentForReview: "The starter's WhatsApp version went to WhatsApp for review and is in Messages, but the campaign could not be started just now. Try again: nothing is sent to WhatsApp twice."
};
export const BROADCAST_WORDS = {
  tip: "One message, on the channels it holds, to the people who said yes. Replies land in the Inbox, where the receptionist answers them."
};
export function runStoppedWords(was) {
  if (was === "sending") return "stops after this batch";
  return was === "pending_approval" ? "skipped \u2014 nothing will send" : "canceled \u2014 nothing will send";
}
export function runApprovedTail(people, when) {
  return `approved \u2014 ${people} ${people === 1 ? "person" : "people"}, ${when}`;
}
export const RUN_WAITING_WORDS = "Waiting for your approval";
export function runsWaitingSentence(n) {
  return n === 1 ? "A campaign run is waiting for your say." : `${n} campaign runs are waiting for your say.`;
}
export function heldEmailsWords(n) {
  return `${n} ${n === 1 ? "email waits" : "emails wait"} for your say`;
}
const RUN_STOP_WORDS = {
  sending: {
    verb: "Stop",
    question: (row) => `Stop ${row.name}?`,
    detail: "Messages already out stay out; the rest do not go.",
    yes: "Yes, stop it"
  },
  pending_approval: {
    verb: "Skip",
    question: (row) => `Skip ${row.name}?`,
    detail: "Nothing sends, and the run closes.",
    yes: "Yes, skip it"
  },
  scheduled: {
    verb: "Cancel",
    question: (row) => `Cancel ${row.name}?`,
    detail: "Nothing will send.",
    yes: "Yes, cancel it"
  }
};
export function runStopWords(state) {
  return state === "sending" || state === "pending_approval" ? RUN_STOP_WORDS[state] : RUN_STOP_WORDS.scheduled;
}
export const OFFERS_IN_WRITING_WORDS = {
  lead: "The carriers require it: their own message, or a sign-up form they signed \u2014 ",
  link: "print one from Get their yes"
};
