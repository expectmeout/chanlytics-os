/**
 * A touch (the content loop PRD's Appendix A.2): something of the business's own that a person reached it through, one
 * shape whatever home it is read from. One home so far, a message that came from an ad (ad_entries, read by packages/db
 * ads/touches.ts for a thread); a post's reply, a link's code and a form's entry join with their own first readers,
 * each with the parts it needs.
 */
export interface Touch {
  /** What was touched: an ad, as Chanlytics holds it (null where it holds none) and named as every page names it. */
  subject: { type: "ad"; id: string | null; name: string | null };
  /** Where it happened: the message that came from it. */
  message_id: string;
}
