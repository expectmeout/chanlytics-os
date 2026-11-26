/**
 * What the workspace makes and shows: its files and the copies it keeps, the sources they came from, the pieces and
 * posts made of them, the ads, the comments, the Google profile, the links and the forms. What each strategy means is
 * said in repositories/erasure/registry.ts.
 */
import { all, byAge, type ErasureStrategy, NOT_PERSONAL, WITH_WORKSPACE, withPerson } from "../strategy";

/** Table, then column, then its strategy. */
export const CONTENT_TABLES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  // What an ad said to a person who tapped it and wrote (00644, decision 0049): the ad's own headline, words and link,
  // and the platform's id for the ad. None of it is the person's, and the row is theirs through its message: an entry
  // names the message that carried it and goes when that message does, which an erasure deletes. An entry with no
  // message (a form lead's, which nothing writes yet) will need a leg of its own, and its lead's id at the platform.
  ad_entries: all(withPerson("erase_contact"), "platform_ad_id", "external_ref", "said"),
  // An owner's own ad account (00648, decision 0049). The account's name at its platform can be a person's, and its
  // ids there (its own, and the business, Page and number beside it in config) are the owner's: they leave with the
  // workspace. Its currency, its zone, the typed words it stands on and our own words for a failed read name nobody
  // (its platform and status are closed sets). Its token is in Vault, on no row.
  ad_accounts: {
    ...all(WITH_WORKSPACE, "external_id", "name", "config"),
    ...all(NOT_PERSONAL, "currency", "timezone", "standing", "read_error"),
  },
  // A draft of a new ad (00659): what New ad chose and the ad writer's words, the business's own advertising for the
  // public, never a person it serves (an ad says nothing of a person: the writer's checks hold it to the service), and
  // the words a writer out for it writes (00672: the service, the picture, the price or none). It leaves with the
  // workspace.
  ad_drafts: all(WITH_WORKSPACE, "draft", "writing_for"),
  // An ad (00648): its name and what it says are the business's own advertising, written by the owner for the public,
  // and leave with the workspace, and so does what the owner approved at Turn on (00666: the words, the area's address
  // and the number a tap opens, all the business's own). The platform's ids for it, the platform's own words about it,
  // where it shows and how its launch went name nobody, nor does a change of the owner's on its way (00673: an amount, a
  // day, miles, and the member who pressed). No person the workspace serves is on the row: who an ad brought is read
  // from contacts, never kept here. A day of an ad (ad_days) holds numbers alone.
  ads: {
    ...all(WITH_WORKSPACE, "name", "said", "approved"),
    ...all(
      NOT_PERSONAL,
      "platform_ad_id",
      "platform_set_id",
      "platform_campaign_id",
      "platform_state",
      "platform_issue",
      "launch",
      "shown_on",
      "change",
    ),
  },
  // What Chanlytics made at Meta for an ad (00666): each part's tagged name, the ad's own, and Meta's id for it. The
  // business's advertising, leaving with the workspace; never a person.
  ad_objects: {
    ...all(WITH_WORKSPACE, "name"),
    ...all(NOT_PERSONAL, "platform_id"),
  },
  // What a day of an ad did, as the platform counts it (00719): plays, engagement, comments, reactions, saves and shares,
  // each a whole number for the day. Counts of everyone the ad reached, never a person.
  ad_days: { engaged: NOT_PERSONAL },
  // What a cause started (00676; the content loop PRD's 5.3), kept as the proof a yes taken back was honoured: what it is
  // about is a file's id, and an action's words are the platform's. Never what the person wrote.
  remediations: { ...all(NOT_PERSONAL, "subject_id") },
  remediation_actions: { ...all(NOT_PERSONAL, "said") },
  // A provider account a member connected so the workspace's footage is read where it lives (00639): the account's id
  // and email are that member's, and leave with the workspace. Its scopes and its token's name are nobody's (its
  // provider and health are closed sets).
  source_connections: {
    ...all(WITH_WORKSPACE, "provider_account", "email"),
    ...all(NOT_PERSONAL, "scopes", "credentials_ref"),
  },
  // A folder the workspace has watched (00639). The business named the folder, and a name can be a person's ("Ana's
  // wedding"): it leaves with the workspace. The provider's ids, the cursor, the push channel's id, its provider's id
  // for what it watches (00641) and its token's hash, and our words for what went wrong name nobody (its state and its
  // walk's kind are closed sets).
  media_sources: {
    folder_name: WITH_WORKSPACE,
    ...all(
      NOT_PERSONAL,
      "folder_id",
      "drive_id",
      "change_cursor",
      "channel_id",
      "channel_resource_id",
      "channel_token_hash",
      "last_error",
    ),
  },
  // What a watched folder holds (00639). A file's name and who added it can hold a person's name; an erasure of a person
  // the workspace serves does not reach a file in the business's own folder (its owner removing it there is the remedy,
  // as for a picture in the Library), and both leave with the workspace. The provider's ids, the checksum and the
  // provider's token for a folder's next page (00641) name nobody (its kind, its state and why it stands there are
  // closed sets: 00643 made the reason one).
  source_items: {
    ...all(WITH_WORKSPACE, "name", "added_by"),
    ...all(NOT_PERSONAL, "provider_id", "parent_id", "checksum", "walk_page"),
  },
  // Where a file's copies are (00686). The Google account whose Drive holds a copy is the member's who connected it,
  // and leaves with the workspace, as a connection's does. Drive's ids for the folder and for a file in it, a piece's
  // key on the shelf and its checksums name nobody (the states, origins, pieces and reasons are closed sets). A copy
  // the owner saved to their own Drive is theirs to delete there: an erasure removes the file here, and its rows with it.
  archive_folders: {
    google_account: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "folder_id", "made_folder_id", "added_folder_id"),
  },
  file_archives: { google_account: WITH_WORKSPACE },
  file_archive_parts: all(NOT_PERSONAL, "drive_file_id", "shelf_key", "md5", "sha256"),
  // A member's own Google account, connected for the workspace's profile: the row goes at disconnect, and with the
  // workspace. The profile's and Google's names and ids, and the sync's error, are nobody's.
  google_connections: {
    ...all(WITH_WORKSPACE, "google_email", "google_sub", "account_title"),
    ...all(
      NOT_PERSONAL,
      "account_name",
      "credentials_ref",
      "facts",
      "location_name",
      "location_title",
      "scopes",
      "sync_error",
    ),
  },
  // The workspace's own listing, as Google's public read gives it.
  google_listings: all(
    NOT_PERSONAL,
    "address",
    "business_status",
    "check_error",
    "facts",
    "maps_uri",
    "name",
    "new_review_uri",
    "place_id",
  ),
  // A review as Google shows it: a complete read drops one Google no longer lists, and one not seen for its days goes
  // (purge_google_reviews, 00392). Its ids and language are nobody's.
  google_reviews: {
    // The reply the receptionist holds (00462) names the reviewer as a posted one does, and goes with the review.
    ...all(byAge("google_reviews"), "author", "author_uri", "author_photo_uri", "body", "reply_text", "draft_text"),
    ...all(NOT_PERSONAL, "language_code", "maps_uri", "review_id"),
  },
  // A business's own pictures (00551). A picture can show anyone, and a look or a name can hold what it read off one: an
  // erasure of a person reaches neither, and the owner deleting that file is the remedy, which blanks all three.
  // A video's (00556): what was heard of it can carry what a customer said in a clip, so it goes with the workspace; the video
  // platform's id for it and its error code are nobody's.
  files: {
    ...all(WITH_WORKSPACE, "look", "made", "name", "source_ref", "sound", "sound_said"),
    ...all(NOT_PERSONAL, "fingerprint", "claude_copy", "media_ref", "media_error", "picture_print"),
  },
  // What a person removed, by a hash of its bytes alone (00551).
  files_let_go: { fingerprint: NOT_PERSONAL },
  form_keys: { name: WITH_WORKSPACE, hash: NOT_PERSONAL },
  // A website the business sends entries from, and each form it sends (00709): the business's own, as its keys are. A
  // site's name is the one its first key was given and its host the business's domain; a form's names are the site's and
  // the owner's for it, and its ref the site's own id for it. No person the workspace serves is on either.
  form_sites: { name: WITH_WORKSPACE, host: WITH_WORKSPACE },
  outside_forms: { kind: NOT_PERSONAL, ref: WITH_WORKSPACE, sent_name: WITH_WORKSPACE, name: WITH_WORKSPACE },
  // A form (00680) is the business's own page: the word in its address, its draft and each version published, written
  // by the owner for the public. No person the workspace serves is on a row, and they leave with the workspace. What
  // happened to an entry (form_entry_links) is ids and a closed set alone.
  form_versions: { description: WITH_WORKSPACE },
  forms: all(WITH_WORKSPACE, "slug", "draft"),
  // A link (00680): a code made at random, and where it is shared in the owner's own words for a place ("Google
  // listing"), which leave with the workspace. What it opens and where a post's lands are closed sets (00699). A day of a
  // link (link_days) is numbers alone, and so is a day of a form (form_days, 00691: its business's booking page opened
  // from it).
  links: { code: NOT_PERSONAL, place: WITH_WORKSPACE, sites: WITH_WORKSPACE },
  // A video asked for (00613, decision 0122): its plan holds the words the business chose to open and end it, and its look
  // the business's name, booking line and address. The machine it is drawn on and its card's key are nobody's.
  // A made picture is a piece too (00681); why a piece exists (its intent: a day, an offer, a service) is the business's.
  pieces: {
    ...all(WITH_WORKSPACE, "plan", "look", "intent"),
    ...all(NOT_PERSONAL, "machine", "card_key"),
  },
  // A piece's versions (00681): its plan and its words per place are the business's own, as pieces.plan and posts.caption
  // are; what moved between two versions is a closed list.
  piece_revisions: { ...all(WITH_WORKSPACE, "plan", "captions"), changed: NOT_PERSONAL },
  // A shape as it is sent (00681): a path in the file's folder and its checksum, nobody's.
  piece_renditions: all(NOT_PERSONAL, "path", "checksum"),
  comment_answers: {
    ...all(WITH_WORKSPACE, "draft", "words", "cannot_why", "said"),
    external_id: NOT_PERSONAL,
  },
  post_observations: { raw: NOT_PERSONAL },
  // What an owner approved (00681): the version, each shape by path and checksum, where, when, the business's own words and
  // any fact the owner stated, the business's record; its hash is nobody's.
  approvals: { snapshot: WITH_WORKSPACE, snapshot_hash: NOT_PERSONAL },
  // A week planned (00706; the content loop PRD's 14.4): what an owner claims and what their posts are for are the
  // business's own words; a plan's slots say what each post shows and why, from the business's own footage and reasons
  // (a review's reviewer only as a first name and initial, never a contact Chanlytics holds). A clip's moments carry
  // what was heard in it, as the file's own heard words do, so they go with the workspace; their closed sets are nobody's.
  owner_claims: { text: WITH_WORKSPACE },
  content_goals: { detail: WITH_WORKSPACE },
  content_plans: { fewer: WITH_WORKSPACE },
  // A slot prepared ahead (00714) keeps the approval its placement will take: the business's own words and its file's path.
  // The words AI wrote for a slot while drafting (00706: its line, over and under, as the Week shows them) are the
  // business's own post, as its title and reason are.
  plan_slots: {
    ...all(WITH_WORKSPACE, "title", "reason", "intent", "ask", "blocked_reason", "prepared", "words"),
    score: NOT_PERSONAL,
  },
  file_moments: { ...all(WITH_WORKSPACE, "words", "shows") },
  // Where a post went (00611, decision 0121): its caption is the business's own public words, and the rest is the platform's
  // ids and our sentences.
  posts: {
    caption: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "held_reason", "error", "container_id", "external_id", "permalink", "account_id"),
  },
  // Each send of a post (00611): what was sent is the post's caption and the picture's host; what came back is the platform's.
  publish_attempts: {
    request: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "answer", "error", "container_id", "external_id"),
  },
};
