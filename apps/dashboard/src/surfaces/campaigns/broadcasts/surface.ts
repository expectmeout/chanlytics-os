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
  toBroadcastVM,
  toCampaignReportVM,
  purposeOfTemplate,
  type AudienceKind,
  type AudiencePreview,
  type BroadcastVM,
  type ChannelsReady,
  type ConsentChannel,
  type LifecycleReport,
  type MonthSent,
  type NumberHealth,
  type AskedPurpose,
  type PreviewVersions,
  type ReachCounts,
} from "@chanlytics/contracts";
import { otherChannelSets } from "@/lib/campaign-channels";
import { type SurfaceOverride, workspaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { everyPerson, viewerId } from "@/surfaces/people/surface";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";
import { cmAddressOf, cmChannelsOf, cmReadyOf, cmVersionsOf } from "../parts/channels";

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
 * An approved template with the one thing the composer cannot work out for
 * itself: WHICH consent sending it needs.
 *
 * Stamped here rather than derived in the page, so the composer, the enrolment
 * route and the send job all read `purposeOfTemplate` of the same column and no
 * third rule can appear in a `.jsx` file where the compiler cannot see it.
 */
export type BroadcastTemplate = TemplateDto & {
  purpose: AskedPurpose;
  /**
   * The channels the message has a version on, in this row's language (contracts versionsOf): WhatsApp, which it is a row
   * of, and an email or a text beside it where one was written. A broadcast may go only by these.
   */
  channels: ConsentChannel[];
  /**
   * The words of that email and text version, in this row's language, for the preview to draw a person on those channels
   * as they read it (parts/preview-by.ts). Absent on a template stamped before they were kept: the preview then says
   * so rather than draw WhatsApp's words for an email.
   */
  versions?: PreviewVersions;
};

export interface BroadcastsSurface {
  rows: BroadcastVM[];
  /** The approved WhatsApp templates, with their variables and their purpose. */
  /** Null: the templates read failed -- its own state, never "no template yet". */
  templates: BroadcastTemplate[] | null;
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
  audiences: AudienceOption[];
  /**
   * Who can hear the workspace, counted once over everyone read from the one rule every page asks (contracts
   * reachCountsOf over each row's personReachOf): Campaigns' home draws it as its ladder.
   */
  reach: ReachCounts;
  /**
   * What the campaigns sent over the last thirty days and what came back (the campaign report, as Reports reads it); null where
   * that read failed, which the home says, and never a number it did not count.
   */
  report: LifecycleReport | null;
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
  optIn: { phrase: string; phraseEs: string; link: string | null; qrPath: string | null; pageUrl: string | null };
  /** Where that yes is got in this product (contracts GET_YES_ROUTE): the ledger's card, which the send screen's
   *  "nobody has said yes" is a door to. */
  getYes: string;
  /** The business's own words for the slots that name it, and whether a booking link is on file. */
  businessName: string;
  /** Its postal address where the Business record holds one: the foot of an email names it (contracts emailFoot). */
  businessAddress?: string | null;
  bookingLink: boolean;
  /** Older broadcasts exist beyond the rows: the history's numbers are the latest fifty, and the page says so. */
  more: boolean;
  /** How far ahead a send may be scheduled, in days: the schedule box stops where the route does. */
  scheduleMaxDays: number;
  fetchedAt: number;
}

/** The period Campaigns' home reports over (the route's `period`): thirty days, which the document head starts too (contracts PREFETCH_READS). */
const HOME_REPORT_PERIOD = "30d";

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
 * The approved WhatsApp templates with the consent each needs and the channels each has a version on; null where the
 * templates read failed. The read holds every channel's rows, so an email or a text of the same name and language is a
 * version of the message.
 */
function approvedTemplates(tpl: { templates?: TemplateDto[] } | Error): BroadcastTemplate[] | null {
  if (tpl instanceof Error) return null;
  const all = tpl.templates ?? [];
  return all
    .filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")
    .map((t) => ({
      ...t,
      purpose: purposeOfTemplate(t.category),
      channels: cmChannelsOf(all, t.name, t.language),
      versions: cmVersionsOf(all, t.name, t.language),
    }));
}

/** What a saved list's chip says under its name: kept by hand, or keeping itself current. */
function savedHint(byHand: boolean): string {
  return byHand
    ? "A list kept by hand — of those whose yes covers this message"
    : "A list that keeps itself current — of those whose yes covers this message";
}

/** The campaign report's totals for the home's funnel; null where the report could not be read. */
function reportOf(read: { report: Parameters<typeof toCampaignReportVM>[0] } | Error): LifecycleReport | null {
  if (read instanceof Error) {
    console.error("broadcasts_report_fetch_failed", read.message);
    return null;
  }
  const vm = toCampaignReportVM(read.report);
  return { days: vm.days, totals: vm.totals };
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
  how: { ready: ChannelsReady; touched: ReadonlySet<string> },
): Pick<AudienceOption, "counts" | "preview" | "by"> {
  const { kind, id, ids } = of;
  const { ready, touched } = how;
  // A broadcast is the business's news: by email it asks for a yes covering email or a relationship (decision D1).
  const reading = (purpose: AskedPurpose, channels: readonly ConsentChannel[]) =>
    audiencePreview(rows, kind, id, ids, purpose, { channels, ready, about: "ours" }, 5, touched);
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
export const broadcastsOverride: SurfaceOverride = {
  key: "broadcasts",
  value: "broadcasts",
  events: ["surface:broadcasts"],
  // A run made by the sweep, approved in another tab, sending or finished (00321) is this surface's own row: heard
  // wherever the tab is, since Today draws its Approve and Stop rows from here. A message moves a run's replies: read
  // again only while its page is on screen, and once when it comes back (surface-registry.ts).
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "broadcasts"],
  refreshWhen: onlyOnItsPage("broadcasts", DEFAULT_REFRESH_TABLES),
  apply: async () => {
    const [bc, people, saved, tpl, ch, cfg, tz, campaigns] = await Promise.all([
      read("GET broadcasts"),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      read("GET templates").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      // The business's name and whether a booking link is on file, for the slots that name them.
      read("GET settings").catch((e: unknown) => e as Error),
      // When a broadcast went or goes, by the business's clock (zone.ts).
      workspaceZone(),
      // What the last thirty days sent and what came back: Campaigns' home draws it. Its own read, as Reports' is, so a
      // failure there leaves the runs and the audiences standing and the home says it could not read the numbers.
      read("GET reports/campaigns", { query: { period: HOME_REPORT_PERIOD } }).catch((e: unknown) => e as Error),
    ]);
    const wa =
      ch instanceof Error
        ? null
        : ((ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null);
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
    // which channel depends on the set (reachFor). Who a run reached within the week, for the note on how many of an
    // audience heard from one.
    const touched = new Set(bc.touched ?? []);
    const optionFor = (kind: AudienceKind, id: string | null, ids: Set<string> | null) =>
      optionReadings(rows, { kind, id, ids }, { ready, touched });
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
    if (tpl instanceof Error) console.error("broadcasts_templates_fetch_failed", tpl.message);
    // The workspace being VIEWED, for the public page's address.
    const slug = workspaceOverride.current()?.slug ?? null;
    setSurfaceValue("broadcasts", {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, tz, now)),
      scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
      more: bc.more === true,
      listsRead: !(saved instanceof Error),
      templates: approvedTemplates(tpl),
      audiences,
      reach: reachCountsOf(rows),
      report: reportOf(campaigns),
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
      optIn: {
        phrase: OFFERS_OPT_IN_PHRASES.en,
        phraseEs: OFFERS_OPT_IN_PHRASES.es,
        link: optInLink(wa?.number_e164),
        qrPath: optInLink(wa?.number_e164) ? api().url("GET consent/qr") : null,
        // The public page the same yes lives on: what a carrier is shown when
        // they ask how this business gets permission to text.
        pageUrl: slug ? `${window.location.origin}/yes/${slug}` : null,
      },
      getYes: GET_YES_ROUTE,
      fetchedAt: now.getTime(),
    });
  },
};
