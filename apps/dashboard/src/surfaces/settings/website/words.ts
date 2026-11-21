/**
 * What Settings › Connections says of a website's forms (00674; the Forms plan, F0), in the owner's words
 * (docs/words.md): a key for each site, shown once; when each was last used; when an entry last arrived. Only this
 * surface says them, so they live beside it.
 */
import { websiteKeyWorks, type WebsiteFormsDto } from "@chanlytics/contracts";

/** One of the workspace's website keys, as the read says it. */
export type WebsiteKey = WebsiteFormsDto["keys"][number];

/** A moment as the page says it: "3:12 PM", "Nov 19 · 3:12 PM", or "tomorrow 4:00 PM" ahead. */
export interface SaysWhen {
  stamp: (atMs: number) => string;
  when: (atMs: number) => string;
}

export const WEBSITE_FORM_WORDS = {
  title: "Website forms",
  sub: (keys: number, received: boolean) =>
    keys === 0 ? (received ? "no keys" : "nothing yet") : keys === 1 ? "1 key" : `${keys} keys`,
  keys: "Keys",
  empty: "A website sends its forms here with a key of its own.",
  lastReceived: "Last received",
  nothingReceived: "Nothing yet",
  firstKey: "First key",
  firstKeyHint: "Made by Chanlytics before keys of your own. It keeps working until it is ended.",
  newKey: "New key",
  newKeyValue: "One for each site",
  make: "Make a key",
  change: "Change",
  close: "Close",
  makeSheet: {
    title: "Make a key",
    label: "Which site is it for",
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
  readFailed: "Forms from the website keep arriving · this page just can't show its keys at the moment.",
} as const;

/** What a key is called on screen: its site's name, or the first key's. */
export const keyName = (key: WebsiteKey): string => key.name ?? WEBSITE_FORM_WORDS.firstKey;

/** A key's line: when it was last used. */
export const keyUsed = (key: WebsiteKey, says: SaysWhen): string =>
  key.last_used_at
    ? `${WEBSITE_FORM_WORDS.keySheet.lastUsed} ${says.stamp(Date.parse(key.last_used_at))}`
    : WEBSITE_FORM_WORDS.keySheet.never;

/** The keys the card lists: those that still work now, a changed one through its day (the reader's rule, asked again
 *  so a card left open past a key's last day stops listing it). */
export const keysShown = (dto: WebsiteFormsDto, nowMs: number): WebsiteKey[] =>
  dto.keys.filter((key) => websiteKeyWorks(key, nowMs));

/** What a key that will end says under it, or the first key's word, or nothing. */
export function keyHint(key: WebsiteKey, says: SaysWhen): string | null {
  if (key.ends_at) return `Works until ${says.when(Date.parse(key.ends_at))}, then stops.`;
  return key.first ? WEBSITE_FORM_WORDS.firstKeyHint : null;
}
