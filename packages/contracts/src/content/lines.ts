/**
 * The Meta link's five lines (decision 0117): what one Meta connection lets Chanlytics do for a business's
 * Instagram account, each On only when the token Meta gave carries the permission it needs. The token's permissions are
 * read once a day (the edge's check, `debug_token`) and kept on the account's row as `scopes`; the lines are made from
 * them here and nowhere else, so a reconnect that drops a permission turns its line Off and says why.
 */

/** The permissions the Meta link asks for (Instagram API with Unified Login): no Facebook Page's, no ads' until the Ads lane. */
type MetaPermission =
  | "instagram_basic"
  | "instagram_manage_messages"
  | "instagram_content_publish"
  | "instagram_manage_comments"
  | "instagram_manage_insights";

/** The five lines, in the order the row says them. */
export const META_LINES = ["messages", "publish", "sounds", "comments", "insights"] as const;
type MetaLine = (typeof META_LINES)[number];
export type MetaLines = Readonly<Record<MetaLine, boolean>>;

/** What each line needs of the token: every permission named. Trending sounds are the Audio API's, on publishing. */
const NEEDS: Readonly<Record<MetaLine, readonly MetaPermission[]>> = {
  messages: ["instagram_manage_messages"],
  publish: ["instagram_content_publish"],
  sounds: ["instagram_content_publish"],
  // A private reply to a comment is a message: both.
  comments: ["instagram_manage_comments", "instagram_manage_messages"],
  insights: ["instagram_manage_insights"],
};

/** The lines a token carries, from its permissions as Meta named them. The one reader of the lines. */
export function metaLinesOf(scopes: unknown): MetaLines {
  const held = new Set(Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === "string") : []);
  const on = (line: MetaLine) => NEEDS[line].every((p) => held.has(p));
  return {
    messages: on("messages"),
    publish: on("publish"),
    sounds: on("sounds"),
    comments: on("comments"),
    insights: on("insights"),
  };
}

/** What each line is called on the row, and what an Off line says. */
export const META_LINE_WORDS: Readonly<Record<MetaLine, string>> = {
  messages: "Messages",
  publish: "Post reels, stories and pictures",
  sounds: "Trending sounds",
  comments: "Answer comments",
  insights: "Read plays and reach",
};
export const META_LINE_OFF_WHY = "Instagram did not allow it. Connect again and allow it.";
