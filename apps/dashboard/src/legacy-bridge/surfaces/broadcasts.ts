/**
 * The Broadcasts override: the sends, their audiences and templates, and the
 * number they go out on. Part of the SurfaceData seam (../surface-data.ts); the
 * audiences read People through ./people.
 */

import { api, read } from "../api";
import { workspaceZone } from "../zone";
import {
  PEOPLE_LISTS,
  savedListIds,
  savedListLookup,
  poolListContext,
  poolRowsOf,
  BROADCAST_CHUNK,
  BROADCAST_SCHEDULE_MAX_DAYS,
  EVERYONE_LABEL,
  GET_YES_ROUTE,
  HELD_REASONS,
  OFFERS_BY_WHATSAPP_NOTE,
  REPLY_WINDOW_WORDS,
  OFFERS_OPT_IN_PHRASES,
  audiencePreview,
  formatPhoneDisplay,
  numberHealth,
  optInLink,
  toBroadcastVM,
  purposeOfTemplate,
  type AudienceKind,
  type AudiencePreview,
  type BroadcastVM,
  type NumberHealth,
  type AskedPurpose,
} from "@chanlytics/contracts";
import { type SurfaceOverride, workspaceOverride } from "../surface-data";
import type { TemplateDto } from "./inbox";
import { everyPerson, viewerId } from "./people";

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
export type BroadcastTemplate = TemplateDto & { purpose: AskedPurpose };

export interface BroadcastsSurface {
  rows: BroadcastVM[];
  /** The approved WhatsApp templates, with their variables and their purpose. */
  /** Null: the templates read failed -- its own state, never "no template yet". */
  templates: BroadcastTemplate[] | null;
  /** Whether the saved lists were read; false leaves the audiences without them, and the page says so. */
  listsRead: boolean;
  audiences: AudienceOption[];
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
  bookingLink: boolean;
  /** Why offers go by WhatsApp only, said once on the page (contracts OFFERS_BY_WHATSAPP_NOTE). */
  offersNote: string;
  /** Older broadcasts exist beyond the rows: the history's numbers are the latest fifty, and the page says so. */
  more: boolean;
  /** How far ahead a send may be scheduled, in days: the schedule box stops where the route does. */
  scheduleMaxDays: number;
  fetchedAt: number;
}

/**
 * Broadcasts: the rows with the numbers their messages earned, the approved
 * templates, and every audience with the count of people who may receive an
 * offer — computed here by the same contracts predicate the route enrols
 * with, so the number on the chip is the number the route will find.
 */
export const broadcastsOverride: SurfaceOverride = {
  key: "broadcasts",
  globals: ["__BROADCASTS"],
  events: ["surface:broadcasts"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [bc, people, saved, tpl, ch, cfg, tz] = await Promise.all([
      read("GET broadcasts"),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      read("GET templates").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      // The business's name and whether a booking link is on file, for the slots that name them.
      read("GET settings").catch((e: unknown) => e as Error),
      // When a broadcast went or goes, by the business's clock (zone.ts).
      workspaceZone(),
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
    const rows = poolRowsOf(everyone, { tz, now, viewer: viewerId(), dealsOn: !!people.deals_on });
    // Both purposes, for every audience, so picking a template re-reads a number
    // rather than recomputing a list. Two passes over the people already in hand.
    // Who a run reached within the week, for the note on how many of an audience heard from one.
    const touched = new Set(bc.touched ?? []);
    const previewFor = (
      kind: AudienceKind,
      id: string | null,
      ids: Set<string> | null,
    ): Record<AskedPurpose, AudiencePreview> => ({
      conversational: audiencePreview(rows, kind, id, ids, "conversational", 5, touched),
      marketing: audiencePreview(rows, kind, id, ids, "marketing", 5, touched),
    });
    const optionFor = (kind: AudienceKind, id: string | null, ids: Set<string> | null) => {
      const preview = previewFor(kind, id, ids);
      return {
        counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending },
        preview,
      };
    };
    const audiences: AudienceOption[] = [
      {
        kind: "everyone",
        id: null,
        label: EVERYONE_LABEL,
        ...optionFor("everyone", null, null),
        hint: "Everyone with a number whose yes covers the message you pick",
      },
      // The calendar lists are audiences only when there is a calendar to read them
      // from. The three consent lists are never audiences: each is a restatement of
      // the eligibility filter this list is already crossed with, so picking one
      // would read as narrowing while changing nothing.
      ...PEOPLE_LISTS.filter(
        (l) =>
          l.id !== "opted_in" &&
          l.id !== "offers_ok" &&
          l.id !== "opted_out" &&
          (!l.needsCalendar || people.calendar?.state === "ok") &&
          (!l.needsConsultFirst || !!people.consult_first) &&
          (!l.needsDeals || !!people.deals_on),
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
              hint:
                s.rule == null
                  ? "A list kept by hand — of those whose yes covers this message"
                  : "A list that keeps itself current — of those whose yes covers this message",
            }))),
    ];
    if (saved instanceof Error) console.error("broadcasts_lists_fetch_failed", saved.message);
    if (tpl instanceof Error) console.error("broadcasts_templates_fetch_failed", tpl.message);
    // The workspace being VIEWED, for the public page's address.
    const slug = workspaceOverride.current()?.slug ?? null;
    (window as unknown as { __BROADCASTS?: BroadcastsSurface }).__BROADCASTS = {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, tz, now)),
      scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
      more: bc.more === true,
      listsRead: !(saved instanceof Error),
      templates:
        tpl instanceof Error
          ? null
          : (tpl.templates ?? [])
              .filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")
              .map((t) => ({ ...t, purpose: purposeOfTemplate(t.category) })),
      audiences,
      number: {
        present: !!wa,
        display: wa?.number_e164 ? formatPhoneDisplay(wa.number_e164) : null,
        health: numberHealth({
          quality: wa?.quality ?? null,
          event: wa?.quality_event ?? null,
          limit: wa?.messaging_limit ?? null,
        }),
      },
      heldReasons: HELD_REASONS,
      chunk: BROADCAST_CHUNK,
      replyWindow: REPLY_WINDOW_WORDS,
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      offersNote: OFFERS_BY_WHATSAPP_NOTE,
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
    };
  },
};
