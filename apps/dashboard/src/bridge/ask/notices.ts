/**
 * What Ask noticed, as the tab holds it (D7 of the answers canvas): one at a time on its home, and rested for a week by Not
 * now, in the same store Today's findings rest in. A read that fails keeps what was held.
 *
 * In hand before Ask opens. Read only as it opened, the line came 0.7 to 1.8 s after the home had drawn (the read works out
 * everything Ask knows of the business, 3.5 s on a first ask), and the three, the pills and Brief me jumped up as it took
 * its place (the phone review of 15 Nov 2026). So the last answer is kept in the tab, as a surface is, and a reload opens Ask
 * with it; and on a device that opens Ask, it is read once the page on screen has its own reads (afterBoot("page")), before
 * Ask is reached for. A device that never opens it never reads it ahead: the read is a page's worth of the server's.
 */
import {
  ASK_FOUND_VIEW,
  DAY_MS,
  MIN_MS,
  noticeRestId,
  restedWith,
  type AskNotice,
  type AskRested,
} from "@chanlytics/contracts";
import { apiFor } from "../api";
import { readCache } from "../read-cache";
import { afterBoot, warmsOnItsOwn } from "../workspace";
import { FOLLOW_UPS_EVENT } from "./follow-ups";

/** How long a read of what Ask noticed holds: what it counts moves over hours, not seconds. */
const READ_AGAIN_MS = 5 * MIN_MS;

/** Where this device keeps when it last opened Ask (a slot name): only a device that opens it reads ahead. */
const OPENS_ASK_SLOT = "chanlytics.ask.opened";
/** How long a device that opened Ask counts as one that opens it. */
const OPENS_ASK_DAYS = 14;

/** What Ask noticed, as read: the notices in order, this member's rests, the business's day, and when it was read. */
interface Noticed {
  notices: AskNotice[];
  rested: AskRested;
  day: string;
  at: number;
}

/** The last answer for each language, kept in the tab by workspace (read-cache.ts `tab`). */
const noticedInTab = readCache<Noticed>("ask_notices", () => true, { tab: true });

/** Whether this device opened Ask lately: what a read ahead waits on. Storage blocked is a device that never did. */
function opensAsk(win: Window): boolean {
  try {
    const at = Number(win.localStorage.getItem(OPENS_ASK_SLOT));
    return at > 0 && Date.now() - at < OPENS_ASK_DAYS * DAY_MS;
  } catch {
    return false;
  }
}

/** Say this device opened Ask now. */
function openedAsk(win: Window): void {
  try {
    win.localStorage.setItem(OPENS_ASK_SLOT, String(Date.now()));
  } catch {
    // Storage blocked: the device reads only as Ask opens, as every device did.
  }
}

export function askNotices(win: Window, language: () => string = () => "en") {
  const said = () => win.dispatchEvent(new CustomEvent(FOLLOW_UPS_EVENT));
  const asking = new Map<string, Promise<void>>();
  const keep = (lang: string, value: Noticed) => noticedInTab.through(lang, () => Promise.resolve(value));
  /** Read them for a language, unless what is held was read in the last few minutes; one read at a time. */
  const read = (lang: string): Promise<void> => {
    const was = noticedInTab.peek(lang);
    if (was && Date.now() - was.at < READ_AGAIN_MS) return Promise.resolve();
    const out = asking.get(lang);
    if (out) return out;
    const go = apiFor(win)("GET ask/notice", { query: { language: lang } })
      .then(async (r) => {
        if (!r.ok) return;
        const { notices, rested, day } = r.data;
        await keep(lang, { notices, rested, day, at: Date.now() });
        said();
      })
      .catch(() => undefined)
      .finally(() => asking.delete(lang));
    asking.set(lang, go);
    return go;
  };
  if (typeof win.addEventListener === "function" && warmsOnItsOwn() && opensAsk(win))
    void afterBoot("page").then(() => read(language()));
  /** The language Ask last opened in, whose answer it says; Ask's own until it has opened. */
  let openedIn: string | null = null;
  const shown = () => openedIn ?? language();
  return {
    /** The one thing worth saying first, or nothing; past any the home says already (`said`, contracts NOTICE_SAID_BY_RIGHT_NOW). */
    noticed: (said?: (n: AskNotice) => boolean): AskNotice | null =>
      noticedInTab.peek(shown())?.notices.find((n) => !said?.(n)) ?? null,
    /**
     * Whether what the AI noticed is held for a language: where it is not, the home waits for its read as it opens
     * (surfaces/ask/line/hooks.tsx arNoticeWait). Drawn before it, its line came in 0.8 s later and moved the three and
     * every row 17 px (the phone re-measure of 16 Nov 2026).
     */
    holdsNotice: (lang: string): boolean => !!noticedInTab.peek(lang),
    /** Read them again (Ask opening), and say this device opens Ask. */
    readNotices: (lang: string): Promise<void> => {
      openedIn = lang;
      openedAsk(win);
      return read(lang);
    },
    /**
     * A card was approved or taken back, which may have settled what a notice said (an offer sent, a search answered):
     * read them again now, however few minutes ago the last read was, and the home takes the new answer as it lands. Until
     * 17 Nov 2026 a notice outlived the act that settled it by up to five minutes (a review of that day).
     */
    readNoticesAgain: (): Promise<void> => {
      const lang = shown();
      const was = noticedInTab.peek(lang);
      if (!was) return Promise.resolve();
      return keep(lang, { ...was, at: 0 }).then(() => read(lang));
    },
    /** Not now: it rests a week, for this member, and the next one worth saying takes its place. */
    restNotice: async (key: string): Promise<void> => {
      const lang = shown();
      const was = noticedInTab.peek(lang);
      if (!was) return;
      const rested = restedWith(was.rested, noticeRestId(key), was.day);
      await keep(lang, { ...was, notices: was.notices.filter((n) => n.key !== key), rested });
      said();
      // A rest that fails to save comes back on the next read, which is the worst it can do. The page's view is sent whole,
      // as the route takes it and Today saves its rests (today/need-you/rests.tsx): sent bare, `{ rested }` was refused,
      // and every Not now came back on the next read (a review of 17 Nov 2026). No cast, so the route's own type holds it.
      await apiFor(win)("PUT views/[page]", { params: { page: ASK_FOUND_VIEW }, body: { view: { rested } } }).catch(
        () => null,
      );
    },
  };
}
