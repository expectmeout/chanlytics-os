/**
 * What Campaigns › Forms says of the business's own website (00675, 00709; Campaigns in three tabs, Lane B), in the
 * owner's words (docs/words.md): the website connection, each site with where it stands, its keys (each shown once) and
 * the forms found on it; the lines a developer pastes, with a test; and a site's form opened on its sheet. Only these
 * screens say them, so they live beside them. Pure.
 */
import {
  websiteKeyWorks,
  type EntryHeldWhyDto,
  type FormSiteDto,
  type FormSiteKeyDto,
  type FormSiteStanding,
  type OutsideFormKind,
} from "@chanlytics/contracts";

/** One of a site's keys, as the read says it. */
export type WebsiteKey = FormSiteKeyDto;

/** A moment as the page says it: "3:12 PM", "Nov 19 · 3:12 PM", or "tomorrow 4:00 PM" ahead. */
export interface SaysWhen {
  stamp: (atMs: number) => string;
  when: (atMs: number) => string;
}

export const WEBSITE_FORM_WORDS = {
  title: "Website",
  /** Its one line in Settings › Connections (00709): its keys and its forms are in Campaigns › Forms now. */
  settingsLine: { label: "Website forms", value: "In Campaigns › Forms", open: "Open" },
  sites: (n: number) => (n === 1 ? "1 site" : `${n} sites`),
  open: "Website",
  intro: "Your site sends what people fill in on its own forms here, with a key. Your site keeps its own questions.",
  /** Where a site stands: its pill's word, and what it says under its name. */
  standing: {
    waiting: "Waiting for its first entry",
    test: "Test received",
    receiving: "Receiving",
    quiet: "Nothing lately",
  } satisfies Record<FormSiteStanding, string>,
  testSays: (when: string) => `A test arrived ${when}. It told nobody and counts nowhere.`,
  firstReal: "Its first real entry shows here once the form is live on the site.",
  quietSays: "No entry for a month. That is no fault: a quiet site is a quiet site.",
  keys: "Its keys",
  formsFound: "Forms found on it",
  noForms: "None yet. A form shows here once its first entry arrives.",
  formKind: { request: "Requests", signup: "Sign-ups" } satisfies Record<OutsideFormKind, string>,
  lastOne: (when: string) => `last one ${when}`,
  keyRule: "Changing a key keeps the site and its forms. Only an owner or a partner can make, change or end a key.",
  firstKey: "First key",
  firstKeyHint: "Made by Chanlytics before keys of your own. It keeps working until it is ended.",
  make: "Make a key",
  newKey: "Another key",
  addSite: "Add a site",
  change: "Change",
  close: "Close",
  empty: {
    title: "No site sends its forms here yet",
    body: "Make a key for your site, and its developer pastes the lines it gives with a test.",
  },
  makeSheet: {
    title: "Make a key",
    titleFor: (site: string) => `A key for ${site}`,
    label: "What to call it",
    labelNew: "Which site is it for",
    placeholder: "Main site",
    press: "Make key",
    cancel: "Cancel",
  },
  madeSheet: {
    title: (name: string) => `Key for ${name}`,
    once: "Copy it now. It is shown only this once.",
    key: "Key",
    address: "Send forms to",
    workspace: "Workspace",
    copyKey: "Copy key",
    copyAddress: "Copy address",
    copyWorkspace: "Copy id",
    graceUntil: (when: string) => `The old key keeps working until ${when}.`,
    lines: "The lines to paste, with a test",
    linesSays:
      "Your developer sends each entry to the address above with this key. The test line tells nobody and goes in 7 days.",
    copyLines: "Copy the lines",
    done: "Done",
  },
  keySheet: {
    made: "Made",
    lastUsed: "Last used",
    never: "Not used yet",
    changeKey: "Change key",
    changeSays: "A new key in its place. The old one keeps working a day, so the site can move to the new one.",
    end: "End",
    endKey: "End key",
    endSays: "Ended now, forms the site sends with this key are refused at once.",
    endNow: "End now",
    keep: "Keep it",
  },
  pressUnknown: "Couldn't confirm it went through · the keys below show where they stand.",
  ended: (name: string) => `${name} ended. Its forms are refused from now on.`,
  readFailed: "Forms from the website keep arriving · this page just can't show its sites at the moment.",
} as const;

/** What a key is called on screen: its name, or the first key's. */
export const keyName = (key: WebsiteKey): string => key.name ?? WEBSITE_FORM_WORDS.firstKey;

/** A key's line: when it was last used. */
export const keyUsed = (key: WebsiteKey, says: SaysWhen): string =>
  key.last_used_at
    ? `${WEBSITE_FORM_WORDS.keySheet.lastUsed} ${says.stamp(Date.parse(key.last_used_at))}`
    : WEBSITE_FORM_WORDS.keySheet.never;

/**
 * The keys a site lists: those that still work now, a changed one through its day (the reader's rule, asked again so a
 * sheet left open past a key's last day stops listing it).
 */
export const keysShown = (site: Pick<FormSiteDto, "keys">, nowMs: number): WebsiteKey[] =>
  site.keys.filter((key) => websiteKeyWorks(key, nowMs));

/** What a key that will end says under it, or the first key's word, or nothing. */
export function keyHint(key: WebsiteKey, says: SaysWhen): string | null {
  if (key.ends_at) return `Works until ${says.when(Date.parse(key.ends_at))}, then stops.`;
  return key.first ? WEBSITE_FORM_WORDS.firstKeyHint : null;
}

/** What a site says under its name, by where it stands: its test, that a real entry will show, or that it is quiet. */
export function siteSays(site: Pick<FormSiteDto, "standing" | "test_at">, says: SaysWhen): string | null {
  if (site.standing === "test" && site.test_at)
    return WEBSITE_FORM_WORDS.testSays(says.stamp(Date.parse(site.test_at)));
  if (site.standing === "waiting") return WEBSITE_FORM_WORDS.firstReal;
  return site.standing === "quiet" ? WEBSITE_FORM_WORDS.quietSays : null;
}

/**
 * The lines a site's developer pastes (the website door's body, contracts WebsiteFormBody): one entry as the site sends
 * it, and the same with `test`, which tells nobody. The key goes where it says, never in a page a browser loads.
 */
export function siteDoorLinesOf(door: { address: string; workspace: string }, key: string): string {
  const body = (test: boolean) =>
    JSON.stringify({
      workspace: door.workspace,
      key,
      form: "request",
      form_ref: "contact",
      form_name: "Contact",
      name: "A. Visitor",
      email: "visitor@example.com",
      note: "A test from the website",
      ...(test ? { test: true } : {}),
    });
  const post = (test: boolean) => `curl -X POST ${door.address} -H 'content-type: application/json' -d '${body(test)}'`;
  return [
    `# a test: it tells nobody and counts nowhere`,
    post(true),
    `# each entry, sent by your site itself, never from a page a visitor loads`,
    post(false),
  ].join("\n");
}

/** A site's form opened: its parts' words, and what each part says. */
export const SITE_FORM_WORDS = {
  label: "On your site",
  hidden: "Hidden",
  listed: "Listed",
  pill: {
    label: (name: string) => `What to do with ${name}`,
    hide: "Hide it from the list",
    show: "Show it on the list",
    rename: "Rename",
  },
  hiddenSays: "Hidden from the list. Its requests still arrive, still reach the Inbox and still count.",
  sub: (site: string, last: string | null, form: OutsideFormKind) =>
    [site, last ? `last ${form === "signup" ? "sign-up" : "request"} ${last}` : "nothing yet"].join(" · "),
  form: {
    owns: "Your site owns this form. Change its questions there.",
    receives: "What Chanlytics receives from it",
    oneWay:
      "Every entry carries an email or a phone. One with neither is refused at your site's door, so it never arrives here.",
  },
  next: {
    told: { title: "You're told", body: "On the bell, in Inbox and on Today.", tag: "Always" },
    drafts: (email: boolean) => ({
      title: "AI drafts the reply",
      body: email
        ? "By email where email can go, else for the chat they start. You send it."
        : "For the chat they start: no reply can go by email here yet. You send it.",
      tag: "AI",
    }),
    after: { title: "When they write back", body: "AI carries on with them, as with anyone who writes in.", tag: "AI" },
    waits: { title: "Until it's answered", body: "It counts in Needs you, like someone waiting.", tag: "Always" },
    marks: "Mark answered and Not a real request are on every request, as on a form made here.",
    before: "Entries that came before its requests began stay in this form's history and never wait in Needs you.",
    confirm: { title: "They're asked to confirm", body: "By email, as soon as they sign up.", tag: "Always" },
    offers: { title: "Offers reach them", body: "Only once they confirm.", tag: "" },
    signupTold: { title: "You're told", body: "On the bell. Never in Needs you.", tag: "Always" },
  },
  site: {
    lastEntry: (when: string) => `Last entry ${when}`,
    none: "No entry yet",
    open: "Open the website connection",
    owns: "Your site owns this form's questions. Chanlytics only receives what it sends.",
  },
  results: {
    title: "The last 30 days",
    line: (r: { entries: number; talked: number; visits: number; confirmed: number }, form: OutsideFormKind) =>
      form === "signup"
        ? `${r.entries} signed up · ${r.confirmed} confirmed.`
        : [
            `${r.entries} ${r.entries === 1 ? "request" : "requests"}`,
            `${r.talked} ${r.talked === 1 ? "conversation" : "conversations"}`,
            `${r.visits} ${r.visits === 1 ? "visit" : "visits"}`,
          ].join(" · ") + ".",
    who: (r: { people: number; new_people: number }) =>
      `${r.new_people} new ${r.new_people === 1 ? "person" : "people"}. ${Math.max(0, r.people - r.new_people)} already known.`,
  },
  entries: "Its newest entries",
  standing: { open: "Waiting", sending: "Sending…", answered: "Answered", aged: "Never answered", kept: "Kept" },
  /** Its entries held for a look (00726): past what the site may send at once, or set aside by a member. */
  held: {
    title: (n: number) => `Held · ${n}`,
    letThrough: "Let it through",
    left: "A held entry told nobody. It goes by itself after 30 days.",
    why: {
      hidden_field: "A part people cannot see was filled in",
      too_fast: "Filled in faster than a person can",
      too_many: "More came from the site at once than people send",
      member: "Someone said it wasn't a real request",
      elsewhere: "Sent straight to the form, not from its page",
    } satisfies Record<EntryHeldWhyDto, string>,
  },
  heldCount: (n: number) => `${n} held`,
  rename: {
    title: "Rename the form",
    label: "Its name here",
    hint: (sent: string | null) =>
      sent ? `Leave it empty to use the name your site sends: ${sent}.` : "Leave it empty to use its usual name.",
    save: "Save",
    cancel: "Cancel",
  },
} as const;
