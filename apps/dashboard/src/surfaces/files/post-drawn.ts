/**
 * The pictures of posts this tab has drawn (decision 0099, step 3), so a thread drawn again does not draw them again on the server, and
 * going back to the words before costs nothing. Each is an address the tab made for its bytes, so a tab's memory is held to a few
 * dozen: the oldest is let go as another comes. An <img> already showing one keeps its picture.
 */
import { postPlanTidied, type PostPlan, type PostShapeName } from "@chanlytics/contracts";

/** How many pictures a tab keeps: a thread's worth, and a few changes back on each. */
const PICTURES_KEPT = 24;

export interface PostDrawn {
  url: string;
  /** Whether the business has a number to print. */
  hasPhone: boolean;
}

const drawnHere = new Map<string, PostDrawn>();

/** What a picture is the picture of: what can be seen of the plan, and the shape. */
export const drawnKeyOf = (plan: PostPlan, shape: PostShapeName): string =>
  JSON.stringify([postPlanTidied(plan), shape]);

/** The same plan with no shape, to tell a change of words from a change of shape. */
export const wordsKeyOf = (plan: PostPlan): string => JSON.stringify(postPlanTidied(plan));

export const pictureDrawn = (key: string): PostDrawn | undefined => drawnHere.get(key);

/** Kept, and the oldest let go past what a tab keeps. */
export function keepDrawn(key: string, drawn: PostDrawn): void {
  drawnHere.delete(key);
  drawnHere.set(key, drawn);
  for (const [old, it] of drawnHere) {
    if (drawnHere.size <= PICTURES_KEPT) break;
    drawnHere.delete(old);
    URL.revokeObjectURL(it.url);
  }
}
