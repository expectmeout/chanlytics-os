/**
 * Content's address (`campaigns/content`), a view of Campaigns beside Sequences, Messages and Ads: everything Ask made for the
 * business and where each piece stands, in every workspace (decision 0125). And the switch that offers Connect Meta.
 *
 * A module of its own and small: the frame's route chunk reads the address, so nothing of the page (its words, its marks) may
 * ride in here. Those are page.ts's.
 */
import { recordOrNull } from "../shared/unknown";

/** The route the Content view is spelled as. */
export const CONTENT_ROUTE = "campaigns/content";

/** Whether a param of `campaigns` is the Content view's: `content`, or `content:` and more. A word it does not know is the page. */
export const isContentParam = (param: string | null | undefined): boolean => !!param && /^content(:|$)/.test(param);

/**
 * Whether a workspace's config offers Connect Meta (`features.content_preview`, the flag registry's `content_preview`;
 * decision 0117), and so posting to Instagram. Read off the config as stored, so anything but `true` is off. The one reader of
 * the switch: the edge and the dashboard both ask it. The Content view is every workspace's and reads no switch (decision 0125).
 */
export function contentPreviewOf(config: unknown): boolean {
  const features = recordOrNull(recordOrNull(config)?.features);
  return features?.content_preview === true;
}
