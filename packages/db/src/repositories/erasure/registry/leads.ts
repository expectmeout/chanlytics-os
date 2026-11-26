/**
 * The finder's leads and their searches, the sequences that write to them and the people a run reaches, the messages
 * they send, and the mailboxes they go from. What each strategy means is said in repositories/erasure/registry.ts.
 */
import {
  all,
  byAge,
  DIGEST,
  type ErasureStrategy,
  NOT_PERSONAL,
  scrubbedBy,
  WITH_WORKSPACE,
  withPerson,
} from "../strategy";

/** Table, then column, then its strategy. */
export const LEADS_TABLES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  lead_counters: { period: NOT_PERSONAL },
  // A batch's judge: its answer, with a reason for each place, goes with the batch (purge_leads, 00140); its model and
  // the hashes of its work are nobody's.
  lead_judgments: {
    answer: byAge("lead_judgments"),
    ...all(NOT_PERSONAL, "model", "op_id", "request_hash"),
  },
  // A lead's stage before and after a move, its counts, ids and a keyed hash of its place.
  lead_operations: all(NOT_PERSONAL, "before", "after"),
  lead_preferences: {
    example: scrubbedBy("leads_trigger"),
    category_key: NOT_PERSONAL,
  },
  // A search's rounds and runs: the owner's plan and question, the days, the provider's and the judge's ids.
  lead_rounds: all(NOT_PERSONAL, "day", "judge_model", "month", "nearby", "plan", "platform_day", "question"),
  lead_runs: all(
    NOT_PERSONAL,
    "actor",
    "apify_run_id",
    "build",
    "claimed_by",
    "dataset_id",
    "lease_owner",
    "term",
    "webhook_token_hash",
  ),
  lead_places: all(withPerson("leads_trigger"), "place_id", "title", "street"),
  // A lead's own receptionist before they sign up (00497, decision 0079): what someone at the business wrote to it and
  // said was not right, ended with its lead; its link's token and our words for a build that failed name no one.
  lead_previews: {
    ...all(scrubbedBy("leads_trigger", "preview_trigger"), "turns", "not_right"),
    ...all(NOT_PERSONAL, "token", "failed_why"),
  },
  lead_search_members: {
    ...all(scrubbedBy("leads_trigger"), "judgment", "reason"),
    ...all(NOT_PERSONAL, "counted_month", "excluded_by"),
  },
  // What the owner asked the finder for, and the kinds of business it suggested.
  lead_searches: all(NOT_PERSONAL, "asked", "card", "name", "plan"),
  // The ideas for a search (00398, 00399): the business line, the plans, what they were written over and what was passed on.
  lead_suggestions: all(NOT_PERSONAL, "business_line", "items", "basis", "passed"),
  lead_suppressions: { hash: DIGEST },
  leads: {
    ...all(
      scrubbedBy("leads_trigger"),
      "place_id",
      "business_name",
      "category",
      "street",
      "city",
      "region",
      "postal_code",
      "website_host",
      "instagram_url",
      "phone_e164",
      "email",
      "email_alternates",
      "last_outcome",
      "last_note",
      "about",
      "hours",
      "image_url",
      "price",
      "reviews_dist",
      "facebook_url",
      "linkedin_url",
      "tiktok_url",
      "maps_url",
      "neighborhood",
      "logo_url",
      "mark_path",
      // A company's people (their names, titles, work addresses, profiles) and its key (00430).
      "facts",
      "source_key",
    ),
    // What lead_blank keeps: the country and the stage it came from.
    ...all(NOT_PERSONAL, "country", "stage_from"),
  },
  // A mailbox a member connected to write from (00423): its address and name are the business's, kept with the
  // workspace; its token's name, its records and its clocks are not personal (its provider, state and hold are closed
  // sets, no words).
  mailbox_connections: {
    ...all(WITH_WORKSPACE, "address", "host", "from_name", "signature", "gmail_signature", "provider_account"),
    ...all(NOT_PERSONAL, "scopes", "credentials_ref", "dns", "sync_cursor", "watch_id", "last_error"),
  },
  // What a connected mailbox left where it was, one row a sender (00483): a robot's, or a person's that Gmail filed with
  // the receipts, whose erasure takes it.
  mailbox_left: all(scrubbedBy("mailbox_trigger"), "address", "name"),
  // What the workspace said of a sender (00483): an address or a domain. A person's address goes with them; what was
  // said of a robot is nobody's, and stays.
  mailbox_senders: { sender: scrubbedBy("mailbox_trigger") },
  // What Chanlytics read a sender to be (00495, decision 0080): their address, and in a few words what they wanted,
  // which never holds a name; their erasure takes it.
  mailbox_sender_reads: all(scrubbedBy("mailbox_trigger"), "address", "about"),
  // Gmail's pending confirmation of a forward to the workspace's address (00345): the owner's own account, and
  // Google's code and link for it; the name its mail is sent from. The workspace's address on the platform's domain,
  // its reply tokens and its intake's error code are nobody's.
  mailboxes: {
    ...all(WITH_WORKSPACE, "forward_confirm_account", "from_name"),
    ...all(
      NOT_PERSONAL,
      "forward_confirm_code",
      "forward_confirm_link",
      "last_error",
      "local_part",
      "reply_token",
      "reply_token_prev",
    ),
  },
  // A list's name and its rule, in the closed vocabulary; its members go by segment_members_on_erase.
  segments: all(NOT_PERSONAL, "name", "rule"),
  // A sequence (decision 0060): its name, and a one-off kept as a draft (00465: who it goes to by list or everyone, when,
  // its channels and its message as the owner wrote it), the business's.
  sequences: all(NOT_PERSONAL, "name", "once"),
  // A batch's name, its audience (a list's or a step's name, a rule in the closed vocabulary), its channels, its template
  // and what fills its slots: the business's.
  sequence_batches: all(
    NOT_PERSONAL,
    "audience",
    "channels",
    "failure",
    "name",
    "params",
    "template_language",
    "template_name",
  ),
  // Someone in a sequence: why they left is a send's code or a door's word, never theirs.
  sequence_enrollments: { why: NOT_PERSONAL },
  // What a sequence owes someone for an occasion (0119): a key of ids and a closed code for why it left, never their
  // words; the rows are deleted with the person (sequence_occasions_on_erase).
  sequence_occasions: { occasion: NOT_PERSONAL, why: NOT_PERSONAL },
  // A reply to a sequence's send hangs on the replier's message and thread, and goes with them.
  sequence_replies: {
    ...all(withPerson("erase_contact"), "draft", "draft_why", "plan", "refer_to", "summary"),
    // Who signed it (0052): cleared when the person it names is erased, wherever the reply's thread is.
    ...all(scrubbedBy("signer_trigger"), "signer_name", "signer_title"),
    // What became of the signer's name, and the source it replaced: closed words, never the name.
    ...all(NOT_PERSONAL, "signer_state", "signer_was"),
  },
  // The words a member typed for a lead at a step (00545): lead_blank deletes them with the lead's details.
  sequence_lead_words: all(scrubbedBy("leads_trigger"), "subject", "body"),
  sequence_sends: {
    // A customer's send: the words its batch kept for them.
    facts: scrubbedBy("recipients_trigger"),
    // A lead's: written from the lead's record (00391).
    ...all(scrubbedBy("leads_trigger"), "opening", "angle", "hold_detail"),
    // A draft handed to its owner (00429): the business's address, name and the words written to it; lead_blank clears it.
    ...all(scrubbedBy("leads_trigger"), "draft"),
    // What its owner asked of the opening and the one it replaced, and what the business's site said (00505): lead_blank
    // clears them with the opening.
    ...all(scrubbedBy("leads_trigger"), "rewrite_asked", "website_says"),
    // A digest of the words checked, the facts' keys, and the hold's, the skip's and a failure's codes.
    ...all(NOT_PERSONAL, "checked_words", "facts_used", "included_for", "reason"),
  },
  // A step: its name, channels, list, template and slots, the words waiting for WhatsApp, the conditions it goes on, and
  // the team's instruction; the name it is signed with, the sender's.
  sequence_steps: {
    signed_by: WITH_WORKSPACE,
    ...all(
      NOT_PERSONAL,
      "channels",
      "hand",
      "list_key",
      "name",
      "next_params",
      "next_template_language",
      "next_template_name",
      "only_if",
      "params",
      "template_language",
      "template_name",
    ),
  },
  templates: all(
    NOT_PERSONAL,
    "body_preview",
    "components",
    "language",
    "meta_id",
    "name",
    "quality",
    "rejected_reason",
    "title",
    "variables",
  ),
};
