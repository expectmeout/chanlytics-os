/**
 * The Broadcasts override: the sends, their audiences and templates, and the
 * number they go out on. Part of the SurfaceData seam (../surface-data.ts); the
 * audiences read People through ./people.
 */

import { api, read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import {
  CONSENT_LIST_IDS,
  PEOPLE_LISTS,
  savedListIds,
  savedListLookup,
  poolListContext,
  poolRowsOf,
  BROADCAST_CHUNK,
  BROADCAST_SCHEDULE_MAX_DAYS,
  EVERYONE_HINT,
  EVERYONE_LABEL,
  GET_YES_ROUTE,
  HELD_REASONS,
  REPLY_WINDOW_WORDS,
  OFFERS_OPT_IN_PHRASES,
  DEFAULT_CAMPAIGN_CHANNELS,
  audiencePreview,
  formatPhoneDisplay,
  numberHealth,
  optInLink,
  reachCountsOf,
  takesSignUps,
  toBroadcastVM,
  whatsappLineOf,
  type AudienceKind,
  type AudiencePreview,
  type BroadcastVM,
  type ChannelsReady,
  type ConsentChannel,
  type MonthSent,
  type NumberHealth,
  type OpenToCustomers,
  type AskedPurpose,
  type ReachCounts,
} from "@chanlytics/contracts";
import { otherChannelSets } from "@/lib/campaign-channels";
import { type SurfaceOverride, workspaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { everyPerson, viewerId } from "@/surfaces/people/surface";
import { followSettings } from "../../offered-templates";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../../surface-values";
import { cmAddressOf, cmOfferedFrom, cmReadyOf, type CmOffered } from "../parts/channels";

// The frame (its tab counts and the route table's crumbs) reads this under its old name until it moves.
declareSurfaceValue("broadcasts", "__BROADCASTS");

/* ------------------------------ Broadcasts ------------------------------- */

export interface AudienceOption {
  kind: AudienceKind;
  id: string | null;
  label: string;
  /**
   * How many of them this audience reaches, PER PURPOSE, because there is no one
   * number any more: a `utility` template needs their yes to messages, a
   * marketing one needs their separate yes to offers, and the same list has two
   * different sizes depending on which is picked.
   *
   * This used to be a single `count` computed once per surface load, with a
   * comment promising it was "the number the route will find". The route reads
   * the chosen template's category; the chip could not, so the promise held only
   * while both were wrong in the same direction. The page now indexes by the
   * purpose of the template actually selected.
   */
  counts: Record<AskedPurpose, number>;
  /**
   * A handful of the people the count is a length of, per purpose, so the
   * composer can show one of them at a time beside the message.
   *
   * The chip said `23` and nothing else, so the last thing an owner saw before
   * an irreversible send was a number -- not that three of the twenty-three have
   * no first name on file and open with "Hi there", and not which two are in the
   * list but held back. The rows are already in hand here; this is the same
   * pass, keeping a few of them instead of only counting.
   *
   * It says how many on the list said yes, too (`saidYes`), a number or not: a
   * count of 0 is "nobody said yes" only when that is 0 as well.
   */
  preview: Record<AskedPurpose, AudiencePreview>;
  /**
   * Both of the above are for WhatsApp alone, as every broadcast went before. A broadcast may tick more channels, and who
   * it reaches then depends on the set ticked (each person is reached once, on one of them: contracts reachFor), so the
   * same preview is kept for each other set the workspace could tick for each purpose, which the composer reads as the
   * owner ticks and unticks. Absent where there is no other set to tick.
   */
  by?: Record<AskedPurpose, Array<{ channels: ConsentChannel[]; preview: AudiencePreview }>>;
  hint: string;
}

/**
 * A message a broadcast may be sent on, with the one thing the composer cannot work out for itself: WHICH consent sending it
 * needs (`purpose`, contracts campaignMessageOf's), the channels it holds now (`channels`, contracts messageHolds: a
 * broadcast may go only by these) and the words of its email and text versions for the preview (`versions`). Stamped here
 * rather than derived in the page, so the composer, the enrolment route and the send job all read one rule and no third can
 * appear where the compiler cannot see it (parts/channels.ts cmOfferedMessages says the shape).
 */
export type BroadcastTemplate = CmOffered;

export interface BroadcastsSurface {
  rows: BroadcastVM[];
  /**
   * The messages a broadcast may be sent on, by the channels each holds, with their variables and their purpose: made of the
   * settings read, the one read of the templates (parts/channels.ts cmOfferedFrom), and made of it again each time it is
   * published. Null: that read failed -- its own state, never "no template yet". Absent while it is still being read.
   */
  templates?: BroadcastTemplate[] | null;
  /**
   * Whether the workspace can send on each channel now (server/campaigns/channels-ready.ts); null where that could not be
   * read. The Send by row is drawn from it (parts/channels.ts cmReadyOf), as are the audiences' previews.
   */
  ready: ChannelsReady | null;
  /**
   * What the workspace's campaigns have sent by email and by text this calendar month, in its zone (server/campaigns/
   * month-sent.ts); null where that could not be read, and the page then says nothing of the month. The head says it from half
   * used (contracts allowanceLine) and the composer before a send (contracts allowanceBeforeSend).
   */
  month_sent: MonthSent | null;
  /**
   * The month after it and the instant it begins (server/campaigns/month-sent.ts monthSentNext), which a send scheduled
   * past the month's end counts against: the composer reads the month at the time it is set to go (contracts monthSentAt).
   * Null where the workspace's clock could not be read, and on a server from before it was carried.
   */
  month_sent_next: { from: number; sent: MonthSent | null } | null;
  /** Whether the saved lists were read; false leaves the audiences without them, and the page says so. */
  listsRead: boolean;
  /**
   * Whether who heard from a campaign or a broadcast this week was read (GET broadcasts' `touched_at`); false counts the
   * audiences with nobody left out, and the composer says the send still leaves them out (contracts HEARD_UNREAD_WORDS).
   */
  heardRead: boolean;
  audiences: AudienceOption[];
  /**
   * Who can hear the workspace, counted once over everyone read from the one rule every page asks (contracts
   * reachCountsOf over each row's personReachOf): Campaigns' home draws it as its ladder.
   */
  reach: ReachCounts;
  /** The WhatsApp number a broadcast goes out on, and what WhatsApp has said about it. */
  number: { present: boolean; display: string | null; health: NumberHealth };
  /** The words for a held-back reason, for the detail view. */
  heldReasons: Record<string, string>;
  /** How many go out at a time (contracts BROADCAST_CHUNK), for the words that say so. */
  chunk: number;
  /** The reply window in words, for the tips that say what a reply is (contracts REPLY_WINDOW_WORDS). */
  replyWindow: string;
  /** How a customer says yes in their own words: the phrase, the link that
   *  opens WhatsApp with it ready, and the QR of that link. Null link without
   *  a number. */
  optIn: {
    phrase: string;
    phraseEs: string;
    link: string | null;
    qrPath: string | null;
    pageUrl: string | null;
    /** Whether the workspace is open to its customers; null where it was not read (no code is withheld then). */
    open: OpenToCustomers | null;
  };
  /** Where that yes is got in this product (contracts GET_YES_ROUTE): the ledger's card, which the send screen's
   *  "nobody has said yes" is a door to. */
  getYes: string;
  /** The business's own words for the slots that name it, and whether a booking link is on file. */
  businessName: string;
  /** Its postal address where the Business record holds one: the foot of an email names it (contracts emailFoot). */
  businessAddress?: string | null;
  bookingLink: boolean;
  /** Whether the Google listing keeps a review link (GET settings' `review_link`): what may fill a review-link slot. */
  reviewLink: boolean;
  /** Older broadcasts exist beyond the rows: the history's numbers are the latest fifty, and the page says so. */
  more: boolean;
  /** How far ahead a send may be scheduled, in days: the schedule box stops where the route does. */
  scheduleMaxDays: number;
  fetchedAt: number;
}

/** The month's emails and texts the read carries; null where it could not be counted, and on a server from before it was. */
const monthSentOf = (read: { month_sent?: MonthSent | null }): MonthSent | null => read.month_sent ?? null;

/** The next month's count and where it begins, as the read carries them; null on a server from before they were. */
const monthSentNextOf = (read: {
  month_sent_next?: { from: number; sent: MonthSent | null } | null;
}): { from: number; sent: MonthSent | null } | null => read.month_sent_next ?? null;

/**
 * Whether a People list is an audience a broadcast offers: not the three consent lists, each a restatement of the
 * eligibility filter the list is already crossed with, and not one whose data the workspace has not switched on.
 */
function listIsAnAudience(
  l: (typeof PEOPLE_LISTS)[number],
  has: { calendar: boolean; consultFirst: boolean; deals: boolean },
): boolean {
  return (
    !CONSENT_LIST_IDS.includes(l.id) &&
    (!l.needsCalendar || has.calendar) &&
    (!l.needsConsultFirst || has.consultFirst) &&
    (!l.needsDeals || has.deals)
  );
}

/**
 * The messages a broadcast may be sent on are the settings read's, the one read of the templates (parts/channels.ts
 * cmOfferedFrom, over offered-templates.ts): this surface asks for no GET templates of its own, so a template approved, blocked or
 * written is told to the composer by the read that tells Settings, and the composer is made of it again each time that is
 * published. A surface not read yet holds nothing to make again; its own read makes its messages of what Settings holds by then.
 */
followSettings("broadcasts", (held, settings) => {
  const templates = shareUnchanged(held.templates, cmOfferedFrom(settings));
  return templates === held.templates ? held : { ...held, templates };
});

/** What a saved list's chip says under its name: kept by hand, or keeping itself current. */
function savedHint(byHand: boolean): string {
  return byHand
    ? "A list kept by hand — of those whose yes covers this message"
    : "A list that keeps itself current — of those whose yes covers this message";
}

/**
 * What an audience carries of who it reaches: both purposes for WhatsApp alone, as every broadcast went (`counts`, with
 * the preview each is the length of), and the same preview for each other set of channels the workspace could tick for
 * each purpose (`by`), since who is reached on which channel depends on the set (contracts reachFor). One pass over the
 * people already in hand for each; `by` is absent where there is no other set to tick.
 */
function optionReadings(
  rows: Parameters<typeof audiencePreview>[0],
  of: { kind: AudienceKind; id: string | null; ids: Set<string> | null },
  how: { ready: ChannelsReady; touches: Readonly<Record<string, readonly string[]>> },
): Pick<AudienceOption, "counts" | "preview" | "by"> {
  const { kind, id, ids } = of;
  const { ready, touches } = how;
  // A broadcast is the business's news: by email it asks for a yes covering email or a relationship (decision D1).
  const reading = (purpose: AskedPurpose, channels: readonly ConsentChannel[]) =>
    audiencePreview(rows, kind, id, ids, purpose, { channels, ready, about: "ours" }, 5, touches);
  const preview = {
    conversational: reading("conversational", DEFAULT_CAMPAIGN_CHANNELS),
    marketing: reading("marketing", DEFAULT_CAMPAIGN_CHANNELS),
  };
  const sets = (purpose: AskedPurpose) =>
    otherChannelSets(ready, purpose, "ours").map((channels) => ({ channels, preview: reading(purpose, channels) }));
  const by = { conversational: sets("conversational"), marketing: sets("marketing") };
  return {
    counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending },
    preview,
    ...(by.conversational.length > 0 || by.marketing.length > 0 ? { by } : {}),
  };
}

/**
 * Broadcasts: the rows with the numbers their messages earned, the approved
 * templates, and every audience with the count of people who may receive an
 * offer — computed here by the same contracts predicate the route enrols
 * with, so the number on the chip is the number the route will find.
 */

/**
 * How a customer says yes, for the card that gets it: the phrase, the link that opens WhatsApp with it ready, the code of
 * that link, and the public page the same yes lives on (what a carrier is shown when they ask how this business gets
 * permission to text). No link and no code while the workspace is paused or ended (contracts takesSignUps: nobody answers
 * on its behalf), nor without a number.
 */
function optInOf(
  number: string | null | undefined,
  slug: string | null,
  open: OpenToCustomers | null,
): BroadcastsSurface["optIn"] {
  const link = takesSignUps(open) ? optInLink(number) : null;
  return {
    phrase: OFFERS_OPT_IN_PHRASES.en,
    phraseEs: OFFERS_OPT_IN_PHRASES.es,
    link,
    qrPath: link ? api().url("GET consent/qr") : null,
    pageUrl: slug ? `${window.location.origin}/yes/${slug}` : null,
    open,
  };
}
export const broadcastsOverride: SurfaceOverride = {
  key: "broadcasts",
  value: "broadcasts",
  events: ["surface:broadcasts"],
  // A run made by the sweep, approved in another tab, sending or finished (00321) is this surface's own row: heard
  // wherever the tab is, since Today draws its Approve and Stop rows from here. A message moves a run's replies: read
  // again only while Sent is on screen, and once when it comes back (Campaigns reads its numbers from campaign_results,
  // surface-registry.ts LEFT_TO_THEIR_PAGE). So does a visit, which the audiences' pools read (a visit marked missed or cancelled
  // leaves a reminder's: #1551), and a number, a line or the workspace's pause, which the Send by tick is worded from. And what the
  // composers read of the business (0047): who may be sent to (the person: an answer, a stop, people imported), the rules the
  // Send tick and the chips beside it say, the mailbox whose offers the gates paused and the business's facts, the postal address
  // an offer by email names and the booking link a slot fills. Not the templates: the messages it offers are the settings
  // read's, which hears them and which this surface follows (followSettings above).
  ...declareReads("broadcasts", {
    reads: ["conversation", "hold", "visit", "channel", "billing", "person", "rules", "facts", "send"],
    fresh: "its-page",
    always: ["send"],
    omit: [
      {
        tables: ["appointment_notices"],
        why: "a booking email held for a look is the Calendar's and Settings'; the audiences' pools read the appointments themselves",
      },
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "Send by is worded from the number, the line, the mailbox's pause and the workspace's pause (channels-ready.ts); a connected mailbox, an activation and the carriers' record are not among them",
      },
    ],
  }),
  apply: async () => {
    const [bc, people, saved, ch, cfg, tz] = await Promise.all([
      read("GET broadcasts"),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      // The business's name, whether a booking link is on file and whether the listing keeps a review link, for the
      // slots that name them.
      read("GET settings").catch((e: unknown) => e as Error),
      // When a broadcast went or goes, by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    // The number they go out on: the workspace's WhatsApp line (contracts whatsappLineOf), as the playbooks surface reads it.
    const wa = ch instanceof Error ? null : whatsappLineOf(ch.channels);
    const brain = cfg instanceof Error ? null : (cfg.config?.brain ?? null);
    if (ch instanceof Error) console.error("broadcasts_channels_fetch_failed", ch.message);
    const now = new Date();
    // Every page of people, not the first: the send enrols everyone, so an
    // audience counted over one page promised fewer people than the send reaches.
    const { people: everyone } = await everyPerson(people);
    // The pool's one reading (contracts audience-pool.ts), as the send reads it.
    const rows = poolRowsOf(everyone, {
      tz,
      now,
      viewer: viewerId(),
      dealsOn: !!people.deals_on,
      ready: bc.ready,
    });
    // The number's health as WhatsApp last said it, and whether each channel can send now (the read's own; where it could
    // not be read, WhatsApp as before, which the number's banner judges): who an audience reaches is judged against it.
    const number = {
      present: !!wa,
      display: wa?.number_e164 ? formatPhoneDisplay(wa.number_e164) : null,
      health: numberHealth({
        quality: wa?.quality ?? null,
        event: wa?.quality_event ?? null,
        limit: wa?.messaging_limit ?? null,
      }),
    };
    const ready = cmReadyOf(bc.ready);
    // Both purposes, for every audience, so picking a template re-reads a number
    // rather than recomputing a list. Two passes over the people already in hand, for WhatsApp alone, as every broadcast
    // went; and one more for each other set of channels the owner could tick for the purpose, since who is reached on
    // which channel depends on the set (reachFor). Who a run reached from a week ago on, or is due to, and when, for the
    // note on how many of an audience hear from one within a week of the send, either side (contracts heardFor, at the
    // picked time).
    const touches = bc.touched_at ?? {};
    const optionFor = (kind: AudienceKind, id: string | null, ids: Set<string> | null) =>
      optionReadings(rows, { kind, id, ids }, { ready, touches });
    const audiences: AudienceOption[] = [
      {
        kind: "everyone",
        id: null,
        label: EVERYONE_LABEL,
        ...optionFor("everyone", null, null),
        hint: EVERYONE_HINT,
      },
      // The calendar lists are audiences only when there is a calendar to read them
      // from. The three consent lists are never audiences: each is a restatement of
      // the eligibility filter this list is already crossed with, so picking one
      // would read as narrowing while changing nothing.
      ...PEOPLE_LISTS.filter((l) =>
        listIsAnAudience(l, {
          calendar: people.calendar?.state === "ok",
          consultFirst: !!people.consult_first,
          deals: !!people.deals_on,
        }),
      ).map((l) => ({
        kind: "list" as const,
        id: l.id,
        label: l.label,
        ...optionFor("list", l.id, null),
        hint: `${l.label} — of those whose yes covers this message`,
      })),
      ...(saved instanceof Error
        ? []
        : // An archived list is sent to no new broadcast (00169): it is off People's rail, and the send refuses it.
          saved.lists
            .filter((s) => !s.archived_at)
            .map((s) => ({
              kind: "saved" as const,
              id: s.id,
              label: s.name,
              // Counted as the send will count it (lists.ts): a rule that can't be counted here reaches nobody, and
              // the send refuses it in words.
              ...optionFor(
                "saved",
                null,
                savedListIds(
                  s,
                  rows,
                  poolListContext({
                    calendar: people.calendar?.state ?? "none",
                    dealsOn: !!people.deals_on,
                    consultFirst: !!people.consult_first,
                    viewer: viewerId(),
                  }),
                  savedListLookup(saved.lists),
                ),
              ),
              hint: savedHint(s.rule == null),
            }))),
    ];
    if (saved instanceof Error) console.error("broadcasts_lists_fetch_failed", saved.message);
    // The workspace being VIEWED, for the public page's address.
    const slug = workspaceOverride.current()?.slug ?? null;
    setSurfaceValue("broadcasts", {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, tz, now)),
      scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
      more: bc.more === true,
      listsRead: !(saved instanceof Error),
      // Null is a read that failed; a server from before it was carried says nothing, and is read as read.
      heardRead: bc.touched_at !== null,
      // The messages are the settings read's, as it stands now (absent while that is still being read; followSettings above).
      templates: shareUnchanged(surfaceValue("broadcasts")?.templates, cmOfferedFrom(surfaceValue("settings"))),
      audiences,
      reach: reachCountsOf(rows),
      number,
      ready: bc.ready ?? null,
      month_sent: monthSentOf(bc),
      month_sent_next: monthSentNextOf(bc),
      heldReasons: HELD_REASONS,
      chunk: BROADCAST_CHUNK,
      replyWindow: REPLY_WINDOW_WORDS,
      businessName: brain?.business_name || "the business",
      businessAddress: cmAddressOf(brain),
      bookingLink: !!brain?.booking_link,
      // A read that failed, a broken config and an older server's answer all say nothing of the listing: none.
      reviewLink: !(cfg instanceof Error) && !cfg.configBroken && cfg.review_link === true,
      optIn: optInOf(wa?.number_e164, slug, bc.open_to_customers ?? null),
      getYes: GET_YES_ROUTE,
      fetchedAt: now.getTime(),
    });
  },
};
