/**
 * What Campaigns › Forms says (00680; the Forms canvas, boards Forms and Sheet): the line to AI, each form's row, a
 * form's sheet in its three parts, and what stands in the way of a draft going live. The page's own: no other tree
 * says these. Pure, so the page and its checks read the same sentences.
 */
import {
  agoWords,
  DAY_MS,
  type EntryHeldWhyDto,
  type FormEntryRowDto,
  type FormListRowDto,
  type FormPart,
  type FormSheetDto,
  type FormStateDto,
} from "@chanlytics/contracts";

/** Two weeks with no request is said, quietly, on a live form's row. */
const SILENT_AFTER_MS = 14 * DAY_MS;

export const FORMS_WORDS = {
  tab: "Forms",
  viewsLabel: "Campaigns' views",
  ask: {
    first: "What would you like to collect?",
    firstBody:
      "AI drafts the form from a sentence, and you change it and publish it. People fill it in from a link or a printed code.",
    more: "What else to collect?",
    hint: "A consultation form",
    label: "What the form should collect",
    send: "Draft the form",
    drafting: "Drafting the form",
    draftingBody: "From the business's services and the way it writes.",
    failed: "AI couldn't draft this one",
    failedBody: "It tried twice. The sentence is kept, and nothing was made.",
    again: "Try again",
  },
  unread: {
    title: "The forms couldn't be read just now",
    body: "Nothing is lost. They are read again when you come back.",
    act: "Read them again",
  },
  viewer: "Only an owner or operator can make or change a form.",
  state: { draft: "Draft", live: "Live", off: "Off" } satisfies Record<FormStateDto, string>,
  parts: { form: "Form", next: "Next", share: "Share" } satisfies Record<FormPart, string>,
  partsLabel: "The form's parts",
  pill: {
    turnOff: "Turn off",
    turnOn: "Turn on",
    duplicate: "Duplicate",
    deleteDraft: "Delete draft",
    label: (heading: string) => `What can be done with ${heading}`,
  },
  form: {
    optional: "Optional",
    needed: "Needed",
    remove: "Remove this question",
    up: "Move up",
    down: "Move down",
    addChoice: "Choice",
    choiceLabel: "A choice",
    removeChoice: (label: string) => `Remove ${label}`,
    labelOf: "The question",
    helpOf: "A line of help under it",
    heading: "The form's heading",
    intro: "What it says under the heading",
    askMore: "Ask something else",
    askHint: "What should it ask?",
    askLabel: "What the new question should ask",
    suggests: "AI suggests",
    add: "Add it",
    notThis: "Not this",
    tell: "Tell AI what to change",
    tellLabel: "What AI should change in the form",
    changed: "AI changed the draft.",
    undo: "Undo",
    working: "AI is writing",
    aiAway: "AI couldn't do that just now. Nothing changed.",
    notLive: (n: number) => `${n} change${n === 1 ? "" : "s"} not live yet`,
    notLiveOne: "Changes not live yet",
  },
  blocked: {
    by: "Before this can go live",
    title: "Nobody could be answered",
    body: "The form asks for no email address and no phone number, so there would be no way to reply to a request.",
    fix: "Add an email question",
    email: "Email",
  },
  publish: {
    act: "Publish",
    changes: "Publish changes",
    undoAll: "Undo all",
    busy: "Publishing…",
    title: (heading: string) => `Publish ${heading}?`,
    sub: "People can fill it in from the link the moment it is live.",
    body: "Requests come to Inbox with a reply AI drafts for you to send. A form never takes a yes to offers.",
    cancel: "Not yet",
  },
  // Said where no reply by email can go from the business yet: under what happens Next, and before a first publish.
  noEmail: {
    fact: "Replies can't go by email yet.",
    thanks: "The thank-you won't promise one.",
    connect: "Connect email",
    label: "Replies can't go by email yet",
  },
  next: {
    told: ["You're told", "On the bell, in Inbox and on Today.", "Always"],
    chat: ["Carry on in WhatsApp", "The thank-you offers it. Their own message starts the chat."],
    chatNone: "No WhatsApp number is connected, so the thank-you offers none.",
    draft: ["AI drafts the reply", "By email, in Inbox. You send it."],
    // The same line where no email can go: the reply is drafted for whichever way can still reach them.
    draftNoEmail: "In Inbox. You send it.",
    back: ["When they write back", "AI carries on with them, as with anyone who writes in.", "AI"],
    come: ["When they'd like to come", "Asked as a question. Times to pick come with the booking step.", "A question"],
    thanks: "Thank-you words",
    thanksLabel: "What the page says once a request is sent",
  },
  share: {
    where: "Where you share it",
    copy: "Copy",
    copied: "Copied",
    printed: "Printed code",
    printedNote: "its own link, so the counter shows as itself",
    print: "Print",
    save: "Save",
    whereElse: "Add another place",
    whereLabel: "Another place this form is shared",
    add: "Make a link for it",
    rename: "Rename",
    stop: "Stop this link",
    start: "Start this link again",
    stopped: "Stopped · it lands on the business's page",
    placeMenu: (place: string) => `What can be done with ${place}`,
    renameLabel: "The place's name",
    saveName: "Save",
    days: (n: number) => `Last ${n} days`,
    nothing: "Nothing yet",
    nothingBody: "Requests show here and in Inbox. Send a test to see one arrive.",
    opensNote: "Opens are counted, not people.",
    /** A business that sends people to its own booking page (F3): what the form can say of it, and what it cannot. */
    bookingOpens: (n: number) =>
      `Your booking page was opened ${n === 1 ? "once" : `${n} times`} from it. Bookings made there can't be traced to the form.`,
    liveReady: "The link is ready.",
    offNote: "Its links land on the business's page and say it's closed.",
    draftNote: "Publish the form to get its link.",
    requests: "Requests",
    held: (n: number) => `Held · ${n}`,
    letThrough: "Let it through",
    test: "Send a test",
    testBody: "Opens the form. It tells nobody.",
    testAct: "Test",
    noName: "No name",
  },
  /** The form on their own website (F4): under Share, beside the places it is shared. */
  website: {
    heading: "On your website",
    add: "Add to your website",
    addBody: "A few lines to paste. Your site holds no key.",
    onSites: (n: number) => `On ${n === 1 ? "one site" : `${n} sites`} · a few lines to paste, no key`,
    open: "Add",
    show: "Show",
    hide: "Hide",
    first: "First, the site it will show on.",
    firstNote: "Only the sites you list may show it, so a copy of the lines on anyone else's page shows nothing.",
    paste: "Paste these lines where the form should show on your site.",
    copy: "Copy the lines",
    copied: "Copied",
    sites: "Sites it may show on",
    siteAdd: "Add a site, like yoursalon.com",
    siteLabel: "A site the form may show on",
    siteSend: "Add the site",
    last: (ago: string) => `Last request from it ${ago}`,
    nothingYet: "Nothing from it yet. Its first request shows here once the lines are on the site.",
    noSites: "No site may show it now, so the lines show nothing anywhere.",
    remove: "Remove",
    removeLabel: (site: string) => `Remove ${site}`,
    fine: "Browsers won't show the form on any other site. Requests sent from it count as from your website.",
    linkWords: "Open the form",
  },
  held: {
    hidden_field: "A part people cannot see was filled in",
    too_fast: "Filled in faster than a person can",
    too_many: "The same sender several times in a short while",
    member: "Someone said it wasn't a real request",
    elsewhere: "Sent straight to the form, not from its page",
  } satisfies Record<EntryHeldWhyDto, string>,
  entry: {
    open: "Nobody has answered",
    phoneOnly: "Waiting for their message · phone only",
    answered: "Answered",
    test: "A test · told nobody · goes in 7 days",
  },
  failed: "That didn't go through. Nothing changed.",
  deleted: "Draft deleted",
  duplicated: "A copy was made, as a draft",
} as const;

const FORMS = FORMS_WORDS;

/** A row's second line and whether it waits on the owner: live and when it last took a request, changes waiting, or off. */
export function formRowWords(row: FormListRowDto, nowMs: number): { words: string; waits: boolean } {
  if (row.state === "draft") return { words: "Not live yet", waits: true };
  if (row.state === "off") return { words: "Off · its link says it's closed", waits: false };
  if (row.changed) return { words: "Changes not published", waits: true };
  const last = row.last_entry_at ? Date.parse(row.last_entry_at) : null;
  const when =
    last === null
      ? "no requests yet"
      : nowMs - last > SILENT_AFTER_MS
        ? `nothing in ${Math.floor((nowMs - last) / (7 * DAY_MS))} weeks`
        : `last request ${agoWords(last, nowMs)}`;
  return { words: ["Live", when, row.held ? `${row.held} held` : ""].filter(Boolean).join(" · "), waits: false };
}

/** The line under a sheet's name: where the form stands and since when. */
export function formSheetSub(sheet: Pick<FormSheetDto, "state" | "published_at" | "last_entry_at">, nowMs: number) {
  if (sheet.state === "draft") return "Draft · not live yet";
  if (sheet.state === "off") return "Off";
  const since = sheet.published_at ? `Live · published ${agoWords(Date.parse(sheet.published_at), nowMs)}` : "Live";
  const last = sheet.last_entry_at ? `last request ${agoWords(Date.parse(sheet.last_entry_at), nowMs)}` : "";
  return [since, last].filter(Boolean).join(" · ");
}

const pluralWords = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What one place brought: its requests and the visits that followed, or nothing yet. */
export const placeBrought = (place: { requests: number; visits: number }): string =>
  place.requests === 0
    ? "No requests yet"
    : [pluralWords(place.requests, "request"), place.visits ? pluralWords(place.visits, "visit") : ""]
        .filter(Boolean)
        .join(" · ");

/** The sentence of numbers under where a form is shared: opens, requests, conversations, visits; then who they were. */
export function resultsWords(results: FormSheetDto["results"]): { line: string; who: string } | null {
  const bookingOpens = results.booking_opens ?? 0;
  if (results.opens === 0 && results.requests === 0 && bookingOpens === 0) return null;
  const line = [
    `Opened ${pluralWords(results.opens, "time")}`,
    pluralWords(results.requests, "request"),
    // The requests that asked for a time (F3), where any did.
    results.asked ? `${results.asked} asked for a time` : "",
    pluralWords(results.talked, "conversation"),
    pluralWords(results.visits, "visit"),
  ]
    .filter(Boolean)
    .join(" · ");
  const named = [
    results.new_people ? `${results.new_people} new ${results.new_people === 1 ? "person" : "people"}` : "",
    results.known_people ? `${results.known_people} already known` : "",
    FORMS.share.opensNote,
  ]
    .filter(Boolean)
    .join(". ")
    .replace(/\.\.$/, ".");
  return { line, who: bookingOpens ? `${named} ${FORMS.share.bookingOpens(bookingOpens)}` : named };
}

/** An entry's own line in the sheet: where it stands, and the place it came through. */
export function entryWords(entry: FormEntryRowDto): { words: string; waits: boolean; done: boolean } {
  if (entry.standing === "test") return { words: FORMS.entry.test, waits: false, done: false };
  if (entry.standing === "held")
    return { words: entry.held_why ? FORMS.held[entry.held_why] : "", waits: false, done: false };
  if (entry.standing === "answered")
    return { words: [FORMS.entry.answered, entry.place].filter(Boolean).join(" · "), waits: false, done: true };
  const open = entry.phone_only ? FORMS.entry.phoneOnly : FORMS.entry.open;
  return { words: [open, entry.place].filter(Boolean).join(" · "), waits: true, done: false };
}

/** The link a place's row says, without its scheme: what a person would read aloud or type. */
export const linkWords = (origin: string, code: string): string => `${origin.replace(/^https?:\/\//, "")}/l/${code}`;
