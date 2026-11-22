/** Notifications: feed. */

import { MIN_MS } from "../../shared/time";
import { callAttemptWords } from "../../conversations/call-dto";
import { replyWaitsOnYou } from "../../conversations/standing";
import { missedCallIsNews } from "../../voice/live";
import { FINISH_SETTING_UP } from "../../setup/first-run-route";
import { lensRoute } from "../../reports/lenses";
import { firstLine } from "../push";
import type { JobKind } from "../../shared/enums";
import { RUN_OPEN_WORDS } from "../../shell/campaign-rooms";
import { invitationExpired } from "../../shell/identity";
import { noticeTone, type NoticeTone } from "../../waits/notice-tones";
import { SEQUENCES_ROUTE } from "../../campaigns/sequences/address";
import { ADS_ROUTE, newAdRoute } from "../../ads/address";
import { CONTENT_LIBRARY_ROUTE, CONTENT_ROUTE, contentRouteOf } from "../../content/address";

/** Made's Needs you, where a post that stopped stands with why (Campaigns › Content). */
const CONTENT_NEEDS_ROUTE = contentRouteOf({ list: "made", view: "needs", open: null });
import {
  bellReadThroughMs,
  SERVER_NOTIFICATION_KINDS,
  settledRow,
  type FeedCall,
  type FeedInput,
  type FeedThread,
  type NotificationDto,
  type NotificationItem,
  type NotificationRow,
  type NotificationsDto,
} from "./feed-input";
import { entryOf, isOneOf } from "../../shared/unknown";

/** Everything that needs the owner right now, newest first. */
export function buildNotificationFeed(input: FeedInput): NotificationItem[] {
  const { now } = input;
  const items: NotificationItem[] = [];

  for (const item of input.threads ?? []) {
    if (!item.real) continue;
    if (item.needsYou) {
      // An absolute moment, never "minutes ago" from the clock: a time derived
      // from `now` drifts forward on every read and undoes Mark all read.
      const at =
        item.escalatedAtMs ??
        (typeof item.waitingMin === "number" ? now - item.waitingMin * MIN_MS : (item.lastAtMs ?? now));
      items.push({
        key: `needs:${item.id}`,
        kind: "needs_you",
        at,
        title: `${item.who} needs you`,
        // The customer's own words (the thread's `ask`), never the thread's last message: that was the
        // receptionist's holding reply on every handoff, quoted as if the customer had written it.
        message: item.ask
          ? `${item.ask.label}: ${item.ask.quoted ? `“${item.ask.text}”` : item.ask.text}`
          : "Flagged for a person.",
        to: `inbox/${item.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox",
      });
    }
    // A reply counting down to send waits on you while it can still be stopped: the Inbox's own rule (replyWaitsOnYou).
    if (item.veto && replyWaitsOnYou({ endsAtMs: item.veto.endsAtMs }, now)) {
      const held =
        item.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${item.veto.messageId}`,
        kind: "held_draft",
        at: item.veto.endsAtMs - item.veto.window * 1000,
        title: `A reply to ${item.who} is waiting for you`,
        message: `${held} · “${item.veto.draft.slice(0, 90)}${item.veto.draft.length > 90 ? "…" : ""}”`,
        to: `inbox/${item.id}`,
        icon: "clock",
        tone: "",
        action: "Review",
      });
    }
  }

  for (const item of input.calls ?? []) {
    if (!missedCallIsNews(item, now)) continue;
    items.push({
      key: `${MISSED_KEY_PREFIX}${item.callId}`,
      kind: "missed_call",
      at: item.startedAtMs,
      title: `${callAttemptWords(item.direction)} · ${item.who}`,
      message: item.number ? `${item.number} · the call never connected.` : "The call never connected.",
      to: `conversations/${item.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call",
    });
  }

  for (const row of input.invites ?? []) {
    const at = Date.parse(row.created_at);
    // Team marks an invitation that has run out its days Expired (invitationExpired); the bell says the same, not "pending".
    const expired = invitationExpired({ expiresAt: row.expires_at }, now);
    items.push({
      key: `invite:${row.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `${expired ? "Invitation expired" : "Invitation pending"} · ${row.email}`,
      message: expired ? "They didn't accept in time. Send it again from Team." : "They haven't accepted yet.",
      // Invitations live on the Team pane since Team split from Workspace;
      // the row's own button says "Team", so its door must open Team.
      to: "admin/team",
      icon: "users",
      tone: "",
      action: "Team",
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------- a job's news, in an owner's words */

/** How a background job ended, when it ended badly: it threw, it never came back, or nothing knew how to run it. */
export type JobEnd = "failed" | "unfinished" | "unknown_kind";

/**
 * What each kind of job was doing, said as the owner's work, and the page that work lives on. The runner used to title
 * every one `A lead_collect job failed`, open its body with the job's id, and send it to the Inbox. On the salon's
 * phone the bell's first screen was eight of those: an internal name, a uuid, and a door to a page that had nothing to
 * do with a search.
 */
const JOB_WORK: Record<JobKind, { stopped: string; to: string }> = {
  outbound_send: { stopped: "A message may not have been sent", to: "inbox" },
  broadcast_send: { stopped: "A campaign send stopped partway", to: "campaigns/sequences" },
  line_provision: { stopped: "Setting up a phone line stopped", to: "admin/integrations" },
  email_ingest: { stopped: "Couldn't take in an email", to: "inbox" },
  lead_round_start: { stopped: "Couldn't start a search", to: "clients/leads" },
  lead_collect: { stopped: "A search stopped partway", to: "clients/leads" }, // not sent: jobs TOLD_ELSEWHERE (00491)
  lead_check: { stopped: "Checking a search's emails stopped", to: "clients/leads" },
  push_send: { stopped: "An alert to your phone didn't go", to: "admin/notifications" },
  push_receipts: { stopped: "Couldn't check that your phone got an alert", to: "admin/notifications" },
  // Read, applied or told: the job's last try did not finish one of them, and the thread is where the reply is.
  reply_read: { stopped: "Couldn't read a lead's reply", to: "inbox" },
  // A thread's draft. Not sent (packages/jobs TOLD_ELSEWHERE): its row says it could not be written, on the thread itself.
  reply_draft: { stopped: "Couldn't draft a reply", to: "inbox" },
  // A booking tool's email about a visit (docs/plans/2026-10-07-bookings-arrive-by-email.md): the board is where the
  // visit would be, and Settings › Business where the notices are counted.
  booking_read: { stopped: "Couldn't read a booking your booking tool emailed", to: "calendar" },
  // A fact's delivery to a subscriber (00334). Not sent (packages/jobs TOLD_ELSEWHERE): a subscriber that fails is the
  // platform's fault, nothing an owner can act on, and the operator is paged instead (PAGES_THE_PLATFORM); these are
  // the words should it ever be, and its door opens Activity, where the fact is.
  event_deliver: { stopped: "Couldn't pass a change on", to: "admin/activity" },
  // A text the door kept and the receptionist could not answer. Not sent (packages/jobs TOLD_ELSEWHERE): the deadman
  // sweep flags the thread and tells the owner with the customer's words, so these are the words should it ever be.
  inbound_answer: { stopped: "Couldn't answer a text", to: "inbox" },
  history_import: { stopped: "Bringing your history in stopped partway", to: "admin/integrations" },
  website_read: { stopped: "Couldn't read your website", to: "admin/receptionist" },
  preview_build: { stopped: "Couldn't make a lead's preview", to: "clients/leads" },
  erasure_finish: { stopped: "Deleting a person stopped partway. Delete them again", to: "clients" },
  // A file's look. Not sent (packages/jobs TOLD_ELSEWHERE): its row says it could not be read, on the page that holds it.
  file_look: { stopped: "Couldn't look at a photo", to: CONTENT_LIBRARY_ROUTE },
  // Not sent: Inbox simply holds what came, and nothing an owner did is waiting on it.
  file_fetch: { stopped: "Couldn't bring in every photo from your website", to: CONTENT_LIBRARY_ROUTE },
  // Not sent: the Library's card says the read stopped, from the ledger's line, where the owner pasted the link.
  instagram_read: { stopped: "Couldn't read your Instagram", to: CONTENT_LIBRARY_ROUTE },
  // Not sent: a removed file already looks gone, and nothing is the owner's to do. Health counts it.
  file_purge: { stopped: "Couldn't finish removing a photo", to: CONTENT_LIBRARY_ROUTE },
  // A video's digest. Not sent (packages/jobs TOLD_ELSEWHERE): its tile says what it has, and the sweep tries the step again.
  video_digest: { stopped: "Couldn't get a video ready", to: CONTENT_LIBRARY_ROUTE },
  // A watched folder's file taken in (00643). Not sent (packages/jobs TOLD_ELSEWHERE): its item waits to be tried again or
  // says it failed on its own row, and the folder's line says so.
  source_take: { stopped: "Couldn't bring in a file from your folder", to: CONTENT_LIBRARY_ROUTE },
  // A watched clip's copy brought back (00654). Not sent (packages/jobs TOLD_ELSEWHERE): its file says it is away and
  // why on its own row, and whoever asked for it is answered there.
  copy_return: { stopped: "Couldn't bring a video back from your folder", to: CONTENT_LIBRARY_ROUTE },
  // A post on its way to Instagram (00611): Content's Needs you holds it, and its piece says why, under the post.
  post_prepare: { stopped: "Couldn't post to Instagram", to: CONTENT_NEEDS_ROUTE },
  post_publish: { stopped: "Couldn't post to Instagram", to: CONTENT_NEEDS_ROUTE },
  post_reconcile: { stopped: "Instagram didn't say whether a post went up", to: CONTENT_NEEDS_ROUTE },
  // A video being made (00613). Its own failures say why on the bell (contracts PIECE_WORDS.failed); this is the ledger's
  // word for one that ended with nothing known.
  piece_make: { stopped: "Couldn't make a video", to: CONTENT_ROUTE },
  // A post on its way to Google at its time (00616): Content's Needs you holds it, and its piece says why.
  post_google: { stopped: "Couldn't post to Google", to: CONTENT_NEEDS_ROUTE },
  // A post asked down at its place (00682). Not sent (kinds.ts: the platform's to chase): its piece says the place has
  // not confirmed it, and that Chanlytics is on it.
  post_take_down: { stopped: "Couldn't confirm a post came down", to: CONTENT_NEEDS_ROUTE },
  // A workspace's hourly work (00569). Not sent (kinds.ts: the platform's to mend), and the next hour tries again.
  campaign_moments: { stopped: "Couldn't run a campaign this hour", to: "today" },
  reach_out_steps: { stopped: "Couldn't run cold email this hour", to: "today" },
  calendar_read: { stopped: "Couldn't read your calendar this hour", to: "today" },
  google_read: { stopped: "Couldn't read your Google listing this hour", to: "today" },
  texts_read: { stopped: "Couldn't check the texts that came in while Chanlytics was away", to: "inbox" },
  // A workspace's occasions (00598). Not sent (kinds.ts: the platform's to mend), and the next minute tries again.
  sequence_occasions: { stopped: "Couldn't prepare a message for one person", to: "today" },
  // A watched folder's walk and its read (00641). Not sent (kinds.ts: the platform's to mend), and the clock hands the
  // folder another; a folder that cannot be read says so on its own row.
  source_walk: { stopped: "Couldn't list your folder", to: CONTENT_LIBRARY_ROUTE },
  source_read: { stopped: "Couldn't check your folder for new photos and videos", to: CONTENT_LIBRARY_ROUTE },
  // A connected ad account's read (00650). Not sent (kinds.ts: the platform's to mend), and the clock hands the account
  // another; an account that cannot be read says so on its own card.
  ad_read: { stopped: "Couldn't update your ads", to: ADS_ROUTE },
  // A time asked for that ran out (decision 0061). Not sent (kinds.ts: its conversation's card says reply to them).
  booking_lapse: { stopped: "Couldn't tell a customer their time wasn't confirmed", to: "inbox" },
  canary: { stopped: "The background work's own check didn't finish", to: "today" },
};

/** A job this runner has no words for: said as what it is, on the page that says what happened today. */
const JOB_WORK_OTHER = { stopped: "Something in the background didn't finish", to: "today" };

/**
 * A job's news: its title, the one line under it, and its door. The job's id and kind are for whoever reads the
 * email to the end, so the runner keeps them as the body's last line, never its first (the bell shows the first).
 *
 * The line is worded from how the job was SETTLED, not from the fact that it ended (`how.resumed`: the ledger handed what
 * it left to a fresh run, or one is already coming, jobs settle.ts and tick.ts conclude). A broadcast that stopped partway
 * is carried on that way up to MAX_RESUMES times, and its alert said "will not start again on its own" each of them, the
 * opposite of what happened, in the only line the bell and the phone show: an owner who believed it and sent again reached
 * the whole audience twice. Only a job nothing carries on says it will not start again. `resumed` is null where settling
 * threw, so nobody knows whether anything carries on: the line then says neither (its body says what could not be checked).
 */
export function jobNewsWords(
  jobKind: string,
  end: JobEnd,
  how: { attempts: number; resumed: boolean | null },
): { title: string; lead: string; to: string } {
  const item = entryOf(JOB_WORK, jobKind) ?? JOB_WORK_OTHER;
  const { attempts, resumed } = how;
  const tries = attempts > 1 ? ` after ${attempts} tries` : "";
  const lead =
    end === "unfinished"
      ? jobKind === "outbound_send"
        ? "Couldn't confirm it reached them. Check the conversation before sending it again."
        : `It started and never reported back, so how it ended is unknown${resumed ? ", and the rest carries on in a fresh run" : ""}.`
      : end === "unknown_kind"
        ? "Nothing ran. The app doesn't know how to do this work."
        : resumed === null
          ? `It stopped${tries}. Whether it carries on in a fresh run couldn't be checked.`
          : `It stopped${tries} and ${resumed ? "carries on in a fresh run" : "won't start again on its own"}.`;
  return { title: item.stopped, lead, to: item.to };
}

/**
 * A row the runner wrote before it had these words: `A lead_collect job failed`, over `Job 3f2e… (lead_collect)
 * failed and will not retry on its own.` Kept rows are a month deep, so the bell says them in the new words rather
 * than waiting for them to age out. Only a job_failed row whose title is exactly that sentence is touched.
 */
const OLD_JOB_TITLE = /^A ([a-z_]+) job (failed|did not finish|could not run)$/;

const OLD_JOB_END: Record<string, JobEnd> = {
  failed: "failed",
  "did not finish": "unfinished",
  "could not run": "unknown_kind",
};

function jobRowWords(n: NotificationDto): { title: string; message: string; route: string } | null {
  if (n.kind !== "job_failed") return null;
  const m = OLD_JOB_TITLE.exec(n.title.trim());
  if (!m) return null;
  const tries = /after (\d+) tries/.exec(n.body);
  // A row from before these words was never worded from how it was settled: it said it would not start again.
  const w = jobNewsWords(m[1] ?? "", OLD_JOB_END[m[2] ?? ""] ?? "failed", {
    attempts: tries ? Number(tries[1]) : 1,
    resumed: false,
  });
  // The old rows all said "inbox", whatever the job was; a row that named another page keeps it.
  return { title: w.title, message: w.lead, route: n.route && n.route !== "inbox" ? n.route : w.to };
}

/**
 * Where the day's reach-out numbers open (spec 2026-10-09 §4.6): Sequences, where the sequences to leads the numbers are
 * about are listed (decision 0060; Campaigns' Reach-outs group, `campaigns/in:reach_out`, retired with its home). The edge
 * writes it on the row; a row kept before then says `outbound` or the group, and opens here too (retiredRouteOf).
 */
export const REACH_OUT_DAY_ROUTE = SEQUENCES_ROUTE;

/**
 * How a kept kind reads. `own` keeps the kind's verb over the route's: a question asks for an answer, and "Open
 * Leads" would say where it is without saying what it wants. A kind with none reads as a plain alert, as the edge keeps it.
 */
type ServerLook = { icon: string; tone: "" | "ok" | "warn"; action: string; to: string; own?: true };

const ALERT_LOOK: ServerLook = { icon: "bell", tone: "", action: "Open Today", to: "today" };

const SERVER_LOOK: Record<string, ServerLook> = {
  handoff: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  deadman: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  call: { icon: "phone", tone: "", action: "Open the calls", to: "conversations/phone" },
  /** The NUMBER's own health: a rating flagged, a limit lowered, the account restricted. */
  number: { icon: "shield", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  /**
   * A template's news is not the number's news. Both arrive on the same
   * webhook, and for a while both were kind "number" — so "Template … approved"
   * was drawn with a shield, in warn amber, over a door to Connections: good
   * news wearing a warning's colour and pointing at the wrong page. Since Today
   * sorts warnings above everything else, it also outranked real news.
   *
   * Two kinds rather than one kind and a tone column, because which of the two
   * a change is belongs to the change (waba-events.ts describeWabaChange), and
   * how it should read belongs here. Never inferred from the title.
   */
  // A row names the message it is about, which opens over the page (verbForRoute: "Open the message"); one that names
  // none opens Campaigns, where every message is now (Campaigns, one tab, 17 Nov 2026).
  template_ready: { icon: "check", tone: "ok", action: "Open Campaigns", to: SEQUENCES_ROUTE },
  template_blocked: { icon: "alert", tone: "warn", action: "Open Campaigns", to: SEQUENCES_ROUTE },
  sweep: { icon: "alert", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  /** A JOB that did not finish, and nothing else. See JobNewsKind. */
  job_failed: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  /** A broadcast that ran to completion: good news, on the page it happened on. */
  broadcast_sent: { icon: "check", tone: "ok", action: "Open Campaigns", to: "campaigns/sequences" },
  /** A broadcast that did not go out, or stopped partway. */
  broadcast_stopped: { icon: "alert", tone: "warn", action: "Open Campaigns", to: "campaigns/sequences" },
  /**
   * A run waits for the owner's word, or a reach-out holds an email for their call: a decision, so a warning, as the topic
   * says it ("needs you", ALERT_TOPICS playbook), never good news sorted below the warnings. Once the run is settled the
   * row reads as read and loses the warning (notice-closes.ts).
   */
  playbook: { icon: "bolt", tone: "warn", action: "Open Campaigns", to: SEQUENCES_ROUTE },
  /** A reply counting down to go in the owner's name (decision 0064): a decision with a deadline, so a warning. */
  reply_held: { icon: "clock", tone: "warn", action: "Open the Inbox", to: "inbox" },
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
  /** A booking tool's email that could not be read as a booking (00345): a person looks, under Settings › Hours & booking. */
  booking_notice: { icon: "calendar", tone: "warn", action: "Open Settings", to: "admin/workspace" },
  /** A search that finished: good news, on the page the leads are on. */
  leads_ready: { icon: "users", tone: "ok", action: "Open Leads", to: "clients/leads" },
  /** A round that stopped to ask. It waits a day and then ends, so it is a warning. */
  leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads", own: true },
  /** A review on Google: good news, on the Reviews lens, where it is read. A row kept before then says `reports`, and keeps it. */
  review: { icon: "star", tone: "ok", action: "Open Reports", to: lensRoute("reviews") },
  /** The subscription: a trial starting or ending, a card declined, the receptionist paused or back. */
  billing: { icon: "money", tone: "warn", action: "Open Billing", to: "admin/billing" },
  /** A note a teammate left for you on a person (0007): its row names them and opens their page, where the note is. */
  note_for_you: { icon: "edit", tone: "", action: "Open their page", to: "clients" },
  /** A business wrote back to a reach-out: its row names the thread, where the reply and what was read are. */
  reach_out_replied: { icon: "mail", tone: "", action: "Open the conversation", to: "inbox", own: true },
  /** The day's reach-out numbers (H12): what they wrote and what came back, with the chains on Campaigns, at its Reach-outs. */
  reach_out_day: { icon: "mail", tone: "", action: "Open Campaigns", to: REACH_OUT_DAY_ROUTE },
  /** A customer asked to stop: news, not a warning (STOP_WORDS.tone is plain), on their page, where the answer is kept. */
  opted_out: { icon: "shield", tone: "", action: "Open their page", to: "clients" },
  /** A booking arrived: good news, on the Calendar at the visit (its row names the address; the day alone is the list door). */
  booking: { icon: "calendar", tone: "ok", action: "Open Calendar", to: "calendar" },
  /** A teammate joined: good news, on the Team pane, where the seat's role is looked after. */
  member_joined: { icon: "users", tone: "ok", action: "Open Team", to: "admin/team" },
  /** A teammate left: news, neither good nor a warning, on the Team pane, where the seats are. */
  member_left: { icon: "users", tone: "", action: "Open Team", to: "admin/team" },
  /** A time asked for ran out and AI told the customer: news, on the conversation, where what AI said is. */
  booking_lapsed: { icon: "calendar", tone: "", action: "Open the conversation", to: "inbox", own: true },
  /** A note from a correction waits: news, on the Autonomy pane, where it is kept or dismissed. */
  note_to_keep: { icon: "edit", tone: "", action: "Open Autonomy", to: "admin/autonomy" },
  ask_cards: { icon: "sparkle", tone: "", action: "Open Today", to: "today" },
  files_waiting: { icon: "image", tone: "", action: "Open Library", to: CONTENT_LIBRARY_ROUTE },
  // A video made here that can be played (00613): its row opens the video itself, so its door says what she will do there.
  // Its mark is a video's, as the content canvas's bell draws it (PhDoors "bell").
  video_ready: { icon: "video", tone: "ok", action: "Watch it", to: CONTENT_ROUTE, own: true },
  // A post set for its time (00616): its row opens the piece itself, so its door says what she will do there. Its mark is
  // the canvas's tick: it went up.
  post_up: { icon: "check", tone: "ok", action: "See it", to: CONTENT_ROUTE, own: true },
  /** A lead tried the preview they were sent: good news, and its row names the lead to open, with their number. */
  preview_tried: { icon: "users", tone: "ok", action: "Open the lead", to: "clients/leads", own: true },
  post_stopped: { icon: "image", tone: "warn", action: "Post again", to: CONTENT_NEEDS_ROUTE, own: true },
  // A take-down (00682): gone from every place it was asked down from is good news; one a place leaves to the owner is
  // a warning until it is gone. Each row opens the piece, where its lines say what each place answered.
  post_down: { icon: "check", tone: "ok", action: "See it", to: CONTENT_ROUTE, own: true },
  post_by_hand: { icon: "alert", tone: "warn", action: "Open the post", to: CONTENT_ROUTE, own: true },
  // An ad account that needs its owner (00653): signed out by Meta, or a payment Meta cannot take. Its row opens Ads.
  ad_account: { icon: "shield", tone: "warn", action: "Open Ads", to: ADS_ROUTE, own: true },
  // An owner's ads (00658): each row names one ad and opens its drawer, so its door says so. Meta not running one until
  // the owner acts is a warning; an ad that ended, spent its total or brought no one in a week is news.
  ad_refused: { icon: "alert", tone: "warn", action: "Open the ad", to: ADS_ROUTE, own: true },
  ad_unpaid: { icon: "money", tone: "warn", action: "Open the ad", to: ADS_ROUTE, own: true },
  ad_ended: { icon: "flag", tone: "", action: "Open the ad", to: ADS_ROUTE, own: true },
  ad_spent: { icon: "money", tone: "", action: "Open the ad", to: ADS_ROUTE, own: true },
  ad_quiet: { icon: "chat", tone: "", action: "Open the ad", to: ADS_ROUTE, own: true },
  // A watched folder or its account that needs someone (00657): its row opens Settings › Connections, where the folder's
  // row says the one thing to do. Its mark is the folder's, as the screens canvas's bell draws it.
  footage: { icon: "folder", tone: "warn", action: "Open Connections", to: "admin/integrations", own: true },
  // The day's new photos and videos from the watched folder (00657): news, in the Library.
  footage_in: { icon: "folder", tone: "", action: "Open Library", to: CONTENT_LIBRARY_ROUTE },
  // A draft ad left for the owner (00659): its row opens New ad on it.
  ad_draft: { icon: "sparkle", tone: "", action: "Open the draft", to: newAdRoute(), own: true },
  // An ad made here whose launch couldn't finish, or whose switch Meta never answered (00676): each row opens its drawer.
  ad_unfinished: { icon: "alert", tone: "warn", action: "Open the ad", to: ADS_ROUTE, own: true },
  ad_unconfirmed: { icon: "alert", tone: "warn", action: "Open the ad", to: ADS_ROUTE, own: true },
  // An ad on that AI can't answer (00676): it spends for nothing, so it is a warning, and its drawer has Pause.
  ad_way_in: { icon: "chat", tone: "warn", action: "Open the ad", to: ADS_ROUTE, own: true },
  // Ads Chanlytics paused for the workspace (00676): news, opening the first of them.
  ads_paused: { icon: "money", tone: "", action: "Open the ad", to: ADS_ROUTE, own: true },
  website_form: { icon: "users", tone: "ok", action: "Open their page", to: "clients" },
  alert: ALERT_LOOK,
};

/** The look a kind is kept with, its own and never one an object inherits; null for a kind the bell keeps none for. */
function lookOf(kind: string | null | undefined): ServerLook | null {
  return kind && Object.hasOwn(SERVER_LOOK, kind) ? (SERVER_LOOK[kind] ?? null) : null;
}

/**
 * The page that holds all the rows of a kind, and the verb that says so: where a group of rows that point at different records
 * opens (Today's While you were away, todayAwayGrouped), since the newest row's own record is one of several. Null for a kind the
 * bell does not keep a look for.
 */
export function kindListDoor(kind: string): { to: string; action: string } | null {
  const look = lookOf(kind);
  if (!look) return null;
  return { to: look.to, action: look.own ? look.action : (verbForRoute(look.to) ?? look.action) };
}

/**
 * Where a kept notice opens, on whichever channel reaches you: the route its row was kept with, else its kind's list door,
 * else Today for a kind the bell keeps no look for (the kind is then a plain alert, as the edge keeps it). The bell opens
 * it, the phone carries it (`pushFor`'s data.route) and the mail links it (the edge's notify), all from here, so the three
 * cannot send one alert to three places (task 1.7 of the wiring plan; findings A2a and NS-4).
 */
export function noticeRoute(kind: string | null | undefined, route: string | null | undefined): string {
  return route || (lookOf(kind) ?? ALERT_LOOK).to;
}

/** The verb for a row that names its own route; the kind's verb otherwise. */
const ROUTE_VERBS: Array<[RegExp, string]> = [
  // Setup is the first run now (#/start); a row written before then still says admin/setup, and lands there too.
  [/^admin\/setup/, FINISH_SETTING_UP],
  [/^start/, FINISH_SETTING_UP],
  [/^admin\/integrations/, "Open Connections"],
  [/^admin\/workspace/, "Open Business"],
  [/^admin\/notifications/, "Open Notifications"],
  [/^admin\/activity/, "Open Activity"],
  [/^admin\/team/, "Open Team"],
  [/^admin\/billing/, "Open Billing"],
  // A row of another kind that opens Files (a video that could not be made, 0122) says where it lands, never its kind's own
  // door: Settings › Files is Content's Library now (the content redesign's stage 2), and a row kept before says so too.
  [/^admin\/files/, "Open Library"],
  [/^inbox\/to-send$/, "Open To send"],
  [/^inbox/, "Open the Inbox"],
  [/^conversations\/phone/, "Open the calls"],
  [/^live/, "Open Live"],
  // The old Playbooks list (`outbound`) lands on Sequences, which is Campaigns now (decision 0060): the door says the name.
  [/^outbound/, "Open Campaigns"],
  // A message, by its address or its old drawer (a template's notice: refused, paused, approved): the door says what it
  // opens, the message over the page.
  [/^campaigns\/(message:|messages\/[^/]+)/, "Open the message"],
  // Messages, which was Campaigns' other view until it folded into Campaigns (17 Nov 2026): a row kept from before lands
  // on Campaigns, and its door says so.
  [/^campaigns\/messages(\/|$)/, "Open Campaigns"],
  // A run at its home under its sequence (the Campaigns wiring review's lane 2): the door says it opens the run.
  [/^campaigns\/sequences\/[^/]+\/runs\/[^/]+/, RUN_OPEN_WORDS],
  // Content, Campaigns' view of what Ask made, and its Library (the content redesign's stage 2): the door says the page's name.
  [/^campaigns\/content:library/, "Open Library"],
  [/^campaigns\/content(:|$)/, "Open Content"],
  [/^campaigns/, "Open Campaigns"],
  // A row about one run opens that run (a playbook's waiting or about to go, a reach-out's held sends), and says so.
  [/^broadcasts\/run:/, RUN_OPEN_WORDS],
  // Sent's To send and Get their yes, in a row kept from before: the Inbox's and People's now, under the same words.
  [/^broadcasts\/to-send$/, "Open To send"],
  [/^broadcasts\/get-yes/, "Open Get their yes"],
  // Sent's list went to each sequence's History (decision 0060, D3): its address, and a row kept before, land on Sequences.
  [/^broadcasts/, "Open Campaigns"],
  // The old route `messages`, Messages' before it was a view of Campaigns: it lands on Campaigns, and the door says so.
  [/^messages/, "Open Campaigns"],
  [/^calendar/, "Open Calendar"],
  // One person's page, by their id: the row is about them, so its door says so.
  [/^clients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "Open their page"],
  // Leads is a scope of People, and its rows name it: a finished search said "Open People" over a door to Leads.
  [/^clients\/leads/, "Open Leads"],
  [/^clients\/get-yes$/, "Open Get their yes"],
  [/^clients/, "Open People"],
  [/^reports/, "Open Reports"],
  [/^today/, "Open Today"],
];

export function verbForRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  const hit = ROUTE_VERBS.find(([re]) => re.test(route));
  return hit ? hit[1] : null;
}

/** A kept row's key on the bell, so the bridge can tell it from a derived one. */
export const SERVER_KEY_PREFIX = "n:";

/** A DERIVED missed-call row's key: this prefix plus the call's own row id (calls.id), as Live carries it. */
const MISSED_KEY_PREFIX = "call:";

/**
 * A DERIVED "needs you" row's key: this prefix plus the thread's own id, which
 * for a real workspace is "th-" plus the conversation's. So the conversation a
 * derived row is about is its key with this prefix taken off — the only handle
 * such a row has, because it carries no `about` (nothing wrote it down; it is
 * computed from the Inbox the browser is already holding).
 */
const NEEDS_KEY_PREFIX = "needs:th-";

/** The conversation a derived "needs you" row stands for, or null. */
export function conversationOfNeedsKey(key: string): string | null {
  return key.startsWith(NEEDS_KEY_PREFIX) ? key.slice(NEEDS_KEY_PREFIX.length) : null;
}

/** Who a bell row is about, where it is one person: their conversation, or the person themselves. */
interface NoteWhose {
  conversationId?: string;
  personId?: string;
}

const THREAD_DOOR = /^inbox\/th-([0-9a-f-]{36})$/;

const PERSON_DOOR = /^clients\/([0-9a-f-]{36})$/;

/**
 * Who a bell row is about, where it is one person: what the edge wrote down (a kept row's subject), else where its
 * door opens, a thread in the Inbox or a person's page. A derived row carries no subject (nothing wrote it down), and
 * its door is the thread it was made from. The lists read it so a person with a note still unread says so on their
 * row, as the bell does, and opening them reads the note (surfaces/seen.ts). Null for a row about anything else: a
 * broadcast, a search, the workspace.
 */
export function noteWhose(row: { about?: { type: string; id: string } | null; to: string }): NoteWhose | null {
  if (row.about?.type === "conversation") return { conversationId: row.about.id };
  if (row.about?.type === "contact") return { personId: row.about.id };
  const thread = THREAD_DOOR.exec(row.to);
  if (thread?.[1]) return { conversationId: thread[1] };
  const person = PERSON_DOOR.exec(row.to);
  return person?.[1] ? { personId: person[1] } : null;
}

/** A derived missed-call row's key: this prefix plus the call's id (buildNotificationFeed). */
const CALL_KEY_PREFIX = "call:";

/** The call a derived missed-call row stands for, or null. */
export function callOfKey(key: string): string | null {
  return key.startsWith(CALL_KEY_PREFIX) ? key.slice(CALL_KEY_PREFIX.length) : null;
}

/**
 * A kept row's icon: good news's tick; plain news under a kind whose look is good news wears the plain alert's bell, never
 * good news's tick (waits/notice-tones.ts); else its kind's own.
 */
const rowIconOf = (tone: NoticeTone | null, look: ServerLook): string =>
  tone === "ok" ? "check" : tone === "" ? ALERT_LOOK.icon : look.icon;

/**
 * The kept rows as the bell shows them: dismissed ones gone, unread decided by how far the person has read
 * (bellReadThroughMs) and their own read mark on the row, the same on every device because both live on the server. A
 * look at the bell reads no row: it moves the number alone (contracts unreadFor), decision 0124.
 */
export function serverNotificationRows(dto: NotificationsDto | null | undefined): NotificationRow[] {
  if (!dto) return [];
  const readMs = bellReadThroughMs(dto);
  return dto.notifications
    .filter((n) => !n.dismissed)
    .map((otherRow) => {
      const look = lookOf(otherRow.kind) ?? ALERT_LOOK;
      // Good news under a kind that carries warnings too, or a warning kept as a plain alert (waits/notice-tones.ts).
      const tone = noticeTone(otherRow.kind, otherRow.title);
      const at = Date.parse(otherRow.created_at);
      const job = jobRowWords(otherRow);
      // The day's reach-out numbers open the Reach-outs, whatever route their row was kept with.
      const route = job ? job.route : otherRow.kind === "reach_out_day" ? REACH_OUT_DAY_ROUTE : otherRow.route;
      const row: NotificationRow = {
        key: `${SERVER_KEY_PREFIX}${otherRow.id}`,
        kind: isOneOf(SERVER_NOTIFICATION_KINDS, otherRow.kind) ? otherRow.kind : "alert",
        at,
        title: job ? job.title : otherRow.title,
        message: job ? job.message : firstLine(otherRow.body),
        to: noticeRoute(otherRow.kind, route),
        icon: rowIconOf(tone, look),
        tone: tone ?? look.tone,
        action: look.own ? look.action : (verbForRoute(route) ?? look.action),
        unread: at > readMs && !otherRow.read,
        about:
          otherRow.subject_type && otherRow.subject_id
            ? { type: otherRow.subject_type, id: otherRow.subject_id }
            : null,
      };
      // What the row asked for ended for good, for everyone (00421): read, and no warning.
      return otherRow.closed_at ? settledRow(row) : row;
    });
}

/**
 * One row per thing. A derived "needs you" row and the kept handoff (or
 * call-back) row for the same conversation said the same thing twice, in two
 * voices. While the derived row stands, the kept one about that conversation
 * is not shown; once the thread is answered the derived row goes and the kept
 * row remains as the record.
 */
export function dedupeFeed(rows: NotificationRow[]): NotificationRow[] {
  const covered = new Set(
    rows
      .flatMap((r) => (r.kind === "needs_you" ? [conversationOfNeedsKey(r.key)] : []))
      .filter((id): id is string => !!id),
  );
  // A customer's call that never connected is kept on the server as well (the edge's missedCallNotice, the wiring's
  // second audit, R11 S6-8): the kept row is the record, read or not, so the row derived from the calls this browser
  // holds stands only where none was kept.
  const keptCalls = new Set(
    rows.flatMap((r) => (r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "call" ? [r.about.id] : [])),
  );
  return rows.filter(
    (r) =>
      !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)) &&
      !(r.kind === "missed_call" && keptCalls.has(r.key.slice(MISSED_KEY_PREFIX.length))),
  );
}

/**
 * A phone number inside a line of words: what the edge writes when it knew no name. Its three spellings and nothing
 * after them: `+19175550101`, `+1 (917) 555-0101`, `+1 917 555 0101`. A looser pattern ran on into the words after
 * the number, and "Voice call: +15550100101 (12s, Neutral)" read "Voice call: Dana Ortizs, Neutral)" (25 Sep).
 */
const NUMBER_IN_WORDS =
  /\+\d{8,15}\b|(?:\+\d{1,3}\s?)?\(\d{3}\)\s?\d{3}[-.\s]\d{4}\b|(?:\+\d{1,3}\s)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

/**
 * A kept row names its customer by number when the edge knew no name ("WhatsApp handoff needed: +1917…"), and the
 * Inbox or the calls this browser holds may know them by name since. A row that says what it is about takes that
 * name in place of the number; a name that is itself a number, or a row about nothing, is left as the edge wrote it.
 */
export function nameKnownCustomers<T extends NotificationRow>(
  rows: readonly T[],
  threads: readonly FeedThread[] | null | undefined,
  calls: readonly FeedCall[] | null | undefined,
): T[] {
  const named = (personName: string | undefined) =>
    personName && !/\d{4}/.test(personName) ? personName.trim() : null;
  const byConversation = new Map<string, string>();
  for (const t of threads ?? []) {
    const personName = named(t.who);
    if (personName && t.id.startsWith("th-")) byConversation.set(t.id.slice(3), personName);
  }
  const byCall = new Map<string, string>();
  for (const c of calls ?? []) {
    const personName = named(c.who);
    if (personName) byCall.set(c.callId, personName);
  }
  return rows.map((r) => {
    if (!r.about || !NUMBER_IN_WORDS.test(r.title)) return r;
    const person =
      r.about.type === "conversation"
        ? byConversation.get(r.about.id)
        : r.about.type === "call"
          ? byCall.get(r.about.id)
          : undefined;
    return person ? { ...r, title: r.title.replace(NUMBER_IN_WORDS, person) } : r;
  });
}
