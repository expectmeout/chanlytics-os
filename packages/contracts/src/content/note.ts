/**
 * Content's one line on Today (the content redesign's stage 3), and only where there is something to say: what needs the
 * owner first (a post that did not go, a video that could not be made), then what is being made, then the next post set for
 * its time today or tomorrow. A business with nothing waiting is not told about Content each morning. The server says which
 * (readers/content.ts contentNote), the page says it in words by its own clock, and the line's press opens that view.
 */
import { contentRouteOf, type ContentView } from "./address";
import { POST_PLACE_SAID, type PostPlace } from "./posts";
import { DAY_MS } from "../shared/time";

/** What the line is about. */
export type ContentNote =
  { is: "needs"; count: number } | { is: "making"; count: number } | { is: "next"; at: string; place: PostPlace };

/** How far ahead the next post is worth a line on Today: today's and tomorrow's. */
const NEXT_WITHIN_MS = 2 * DAY_MS;

/** The line, from what Content holds now: the first of what needs the owner, what is being made, what goes up soon. */
export function contentNoteOf(
  held: { needs: number; making: number; next: { at: string; place: PostPlace } | null },
  nowMs: number,
): ContentNote | null {
  if (held.needs > 0) return { is: "needs", count: held.needs };
  if (held.making > 0) return { is: "making", count: held.making };
  if (held.next && Date.parse(held.next.at) - nowMs <= NEXT_WITHIN_MS) return { is: "next", ...held.next };
  return null;
}

const VIEW_OF: Record<ContentNote["is"], ContentView> = { needs: "needs", making: "making", next: "scheduled" };

export const CONTENT_NOTE_WORDS = {
  /** `when` is the next post's time as the page's clock says it. */
  headline: (note: ContentNote, when: string): string => {
    if (note.is === "needs") return note.count === 1 ? "A post needs you" : `${note.count} posts need you`;
    if (note.is === "making") return note.count === 1 ? "A video is being made" : `${note.count} videos are being made`;
    return `A post goes up on ${POST_PLACE_SAID[note.place]} ${when}`;
  },
  open: "Open Content",
} as const;

/** Where the line's press goes: the view of Made it is about. */
export const contentNoteRouteOf = (note: ContentNote): string =>
  contentRouteOf({ list: "made", view: VIEW_OF[note.is], open: null });
