/**
 * Content: what a business's Instagram account lets Chanlytics do once it is connected through Meta (decision 0117), and
 * a post on its way to a place (decision 0121). Every public name, named: a new export is a line here, never an export *.
 */
export { META_LINE_OFF_WHY, META_LINE_WORDS, META_LINES, metaLinesOf } from "./lines";
export type { MetaLines } from "./lines";
export {
  INSTAGRAM_POST_KINDS,
  ON_INSTAGRAM,
  POST_AHEAD_DAYS_MAX,
  POST_CAPTION_MAX,
  POST_KINDS,
  POST_ON_ITS_WAY,
  POST_PLACES,
  POST_PULLABLE,
  POST_STATUSES,
  POST_VIAS,
  postCaptionProblem,
} from "./posts";
export type { InstagramPostable, InstagramPostKind, PostDto, PostKind, PostPlace, PostStatus } from "./posts";
