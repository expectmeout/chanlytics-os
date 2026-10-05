/**
 * The ad or post a customer clicked to write: Meta names it in a WhatsApp message's `referral`, and the person that
 * message made keeps its id as `contacts.acquired_ref` (00306; the Reports lenses spec, K3), beside `acquired_via = 'ad'`,
 * when the referral's kind (`source_type`) is `ad`. A post is kept in the message's meta and the person is stamped by the
 * wire, as one whose message had no referral is.
 *
 * The longest id that is kept. It is contacts_acquired_ref_check's own 200 (1 to 200 characters), said here once for the
 * webhook, which turns an id longer than this into no referral rather than cut it (a cut id would name another ad), and
 * held against the column by a-person-keeps-how-they-first-reached-us.db.test.mjs, which writes one of this length and
 * one more and reads what the database does with each.
 */
export const REFERRAL_ID_MAX = 200;
