/**
 * What Ask noticed, as the tab holds it (D7 of the answers canvas): read as Ask opens, one at a time on its home, and rested for
 * a week by Not now, in the same store Today's findings rest in. A read that fails keeps what was held.
 */
import {
  ASK_FOUND_VIEW,
  MIN_MS,
  noticeRestId,
  restedWith,
  type AskNotice,
  type AskRested,
} from "@chanlytics/contracts";
import { apiFor } from "../api";
import { FOLLOW_UPS_EVENT } from "./follow-ups";

/** How long a read of what Ask noticed holds: what it counts moves over hours, not seconds. */
const READ_AGAIN_MS = 5 * MIN_MS;

export function askNotices(win: Window) {
  let list: AskNotice[] = [];
  let rested: AskRested = {};
  let day = "";
  let readAt = 0;
  let readIn = "";
  const said = () => win.dispatchEvent(new CustomEvent(FOLLOW_UPS_EVENT));
  return {
    /** The one thing worth saying first, or nothing. */
    noticed: (): AskNotice | null => list[0] ?? null,
    /** Read them again (Ask opening). */
    readNotices: async (language: string): Promise<void> => {
      // Its reads are a page's: opening and closing Ask never asks for them again within a few minutes.
      if (language === readIn && Date.now() - readAt < READ_AGAIN_MS) return;
      readAt = Date.now();
      readIn = language;
      const r = await apiFor(win)("GET ask/notice", { query: { language } as never });
      if (!r.ok) return;
      const data = r.data as unknown as { notices: AskNotice[]; rested: AskRested; day: string };
      list = data.notices ?? [];
      rested = data.rested ?? {};
      day = data.day ?? "";
      said();
    },
    /** Not now: it rests a week, for this member, and the next one worth saying takes its place. */
    restNotice: async (key: string): Promise<void> => {
      list = list.filter((n) => n.key !== key);
      said();
      rested = restedWith(rested, noticeRestId(key), day);
      // A rest that fails to save comes back on the next read, which is the worst it can do.
      await apiFor(win)("PUT views/[page]", { params: { page: ASK_FOUND_VIEW }, body: { rested } as never }).catch(
        () => null,
      );
    },
  };
}
