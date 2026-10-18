/**
 * The Broadcasts override: Sent's runs, the templates a broadcast may go on, and the number it goes out on. Part of the
 * SurfaceData seam (../surface-data.ts). Who each audience reaches is counted over everyone in People, and is a surface of its
 * own (./audiences-surface.ts), read only where a composer is drawn: everything that says a run waits reads this one (the
 * badge, Today's queue, the Inbox's rows, Ask's Right now, a run's sheet), and it asks for nothing of People, so none of them
 * waits on People's whole book (the Inbox's run review, 18 Oct 2026).
 */

import { api, read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import {
  BROADCAST_CHUNK,
  BROADCAST_SCHEDULE_MAX_DAYS,
  GET_YES_ROUTE,
  HELD_REASONS,
  REPLY_WINDOW_WORDS,
  OFFERS_OPT_IN_PHRASES,
  optInLink,
  takesSignUps,
  toBroadcastVM,
  type BroadcastVM,
  type ChannelsReady,
  type MonthSent,
  type NumberHealth,
  type OpenToCustomers,
} from "@chanlytics/contracts";
import { type SurfaceOverride, workspaceOverride } from "@/legacy-bridge/surface-data";
import { COUNTED_RECEIPTS, RECEIPTS_QUIET_MS } from "@/legacy-bridge/surface-realtime";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { followSettings } from "../../offered-templates";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../../surface-values";
import { channelsHeld, followChannels } from "../../channels/surface";
import {
  cmBusinessOf,
  cmNumberOf,
  cmOfferedFrom,
  cmSameBusiness,
  cmSameNumber,
  type CmOffered,
} from "../parts/channels";

// The frame (its tab counts and the route table's crumbs) reads this under its old name until it moves.
declareSurfaceValue("broadcasts", "__BROADCASTS");

/* ------------------------------ Broadcasts ------------------------------- */

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
   * read. The Send by row is drawn from it (parts/channels.ts cmReadyOf), as are the audiences' previews (audiences-surface.ts,
   * from the same read).
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
  /** Whether the Google listing keeps a review link (the settings read's, parts/channels.ts cmBusinessOf): what may fill a review-link slot. */
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
 * The messages a broadcast may be sent on are the settings read's, the one read of the templates (parts/channels.ts
 * cmOfferedFrom, over offered-templates.ts): this surface asks for no GET templates of its own, so a template approved, blocked or
 * written is told to the composer by the read that tells Settings, and the composer is made of it again each time that is
 * published. A surface not read yet holds nothing to make again; its own read makes its messages of what Settings holds by then.
 */
followSettings("broadcasts", (held, settings) => {
  const templates = shareUnchanged(held.templates, cmOfferedFrom(settings));
  // And what the slots that name the business may fill: its name, address, booking link and the listing's review link.
  const business = cmBusinessOf(settings);
  const same = cmSameBusiness(held, business);
  return templates === held.templates && same ? held : { ...held, templates, ...(same ? {} : business) };
});

/** What Sent's opt-in is made of beside the number: the workspace's address and whether it takes sign-ups, as last read. */
let optInFrom: { slug: string | null; open: OpenToCustomers | null } | null = null;

/**
 * Sent's runs as the last read answered them, and the zone their times are said in: the clock says each run's time again from
 * them each minute where Sent's runs are drawn (`rederive`), so "goes out in 5 min" does not stand an hour after it went.
 */
let lastRuns: { runs: Parameters<typeof toBroadcastVM>[0][]; tz: string } | null = null;

/** The runs' words at `now`, published where any moved; whether one did. */
function rederiveBroadcasts(now: Date): boolean {
  const was = surfaceValue("broadcasts");
  const held = lastRuns;
  if (!was || !held) return false;
  const next = shareUnchanged(was, { ...was, rows: held.runs.map((b) => toBroadcastVM(b, held.tz, now)) });
  if (next === was) return false;
  setSurfaceValue("broadcasts", next);
  return true;
}

// The number a broadcast goes out on, its health and the opt-in's link are the channels read's (channels/surface.ts), which hears
// the channel rows wherever the tab is: a number connected, switched off or flagged repaints the composer as it lands, with no read
// of Sent's own (the wiring's second audit, S10-9).
followChannels("broadcasts", (held, rows) => {
  const wa = cmNumberOf(rows);
  const number = { present: wa.present, display: wa.display, health: wa.health };
  if (cmSameNumber(held.number, number)) return held;
  return { ...held, number, ...(optInFrom ? { optIn: optInOf(wa.e164, optInFrom.slug, optInFrom.open) } : {}) };
});

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
  // Each run's time is the clock's (hearing/clock.ts).
  rederive: rederiveBroadcasts,
  // A run's "N delivered" moves with its receipts: heard while Sent is on screen, and read once they quieten (S3-5).
  refreshOnMessageStatuses: COUNTED_RECEIPTS,
  receiptsQuietMs: RECEIPTS_QUIET_MS,
  // A run made by the sweep, approved in another tab, sending or finished (00321) is this surface's own row: heard wherever the
  // tab is, since the badge, Today's Approve and Stop rows and the Inbox's rows are drawn from here. A message moves a run's
  // replies and the month's count: read again only while Sent is on screen, and once when it comes back (surface-registry.ts
  // PAGE_HEARS). So does a number, a line, the mailbox or the workspace's pause, which the Send by tick is worded from, and the
  // business's config the read is made with. Not the templates and not the business's name and links: those are the settings
  // read's, which hears them and which this surface follows (followSettings above). Not People: who an audience reaches is
  // audiences-surface.ts's, and nothing here is counted over anyone.
  ...declareReads("broadcasts", {
    reads: ["conversation", "channel", "billing", "facts", "send"],
    fresh: "its-page",
    always: ["send"],
    omit: [
      {
        tables: ["conversations"],
        why: "a run's replies and receipts are its messages; a thread's own row (its state, who holds it) moves no run and no count Sent says",
      },
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "Send by is worded from the number, the line, the mailbox's pause and the workspace's pause (channels-ready.ts); a connected mailbox, an activation and the carriers' record are not among them",
      },
    ],
  }),
  apply: async () => {
    // The number and the business's name and links are not read here: they are the channels read's and the settings read's,
    // which this surface follows (above), so a re-read of the runs for a message asks for neither again (S10-9). Nor is
    // anyone in People: the runs and what the read says beside them are drawn from GET broadcasts alone.
    const [bc, tz] = await Promise.all([
      read("GET broadcasts"),
      // When a broadcast went or goes, by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    // The number they go out on: the workspace's WhatsApp line (contracts whatsappLineOf), as the playbooks surface reads it.
    const wa = cmNumberOf(channelsHeld());
    const now = new Date();
    // The number's health as WhatsApp last said it.
    const number = { present: wa.present, display: wa.display, health: wa.health };
    // The workspace being VIEWED, for the public page's address.
    const slug = workspaceOverride.current()?.slug ?? null;
    optInFrom = { slug, open: bc.open_to_customers ?? null };
    lastRuns = { runs: bc.broadcasts, tz };
    setSurfaceValue("broadcasts", {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, tz, now)),
      scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
      more: bc.more === true,
      // The messages are the settings read's, as it stands now (absent while that is still being read; followSettings above).
      templates: shareUnchanged(surfaceValue("broadcasts")?.templates, cmOfferedFrom(surfaceValue("settings"))),
      number,
      ready: bc.ready ?? null,
      month_sent: monthSentOf(bc),
      month_sent_next: monthSentNextOf(bc),
      heldReasons: HELD_REASONS,
      chunk: BROADCAST_CHUNK,
      replyWindow: REPLY_WINDOW_WORDS,
      // The settings read's, as it stands now (followSettings above): a read not in yet says nothing of the listing.
      ...cmBusinessOf(surfaceValue("settings")),
      optIn: optInOf(wa.e164, slug, bc.open_to_customers ?? null),
      getYes: GET_YES_ROUTE,
      fetchedAt: now.getTime(),
    });
  },
};
