/**
 * How the audiences are counted, from what their surface read (audiences-surface.ts): the pool's one reading (contracts
 * audience-pool.ts), each audience's preview per purpose and per set of channels, and who the workspace reaches. A chunk of
 * its own, fetched beside the surface's reads, since only a composer draws it.
 */
import {
  PEOPLE_LISTS,
  CONSENT_LIST_IDS,
  DEFAULT_CAMPAIGN_CHANNELS,
  EVERYONE_HINT,
  EVERYONE_LABEL,
  audiencePreview,
  poolListContext,
  poolRowsOf,
  reachCountsOf,
  savedListIds,
  savedListLookup,
  type AskedPurpose,
  type AudienceKind,
  type ChannelsReady,
  type ConsentChannel,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { otherChannelSets } from "@/lib/campaign-channels";
import { viewerId } from "@/surfaces/people/surface";
import { cmReadyOf } from "../parts/channels";
import type { AudienceOption, AudiencesSurface } from "./audiences-surface";

/**
 * Whether a People list is an audience a broadcast offers: not the three consent lists, each a restatement of the
 * eligibility filter the list is already crossed with, and not one whose data the workspace does not have yet (a
 * calendar, a consult-first service, a deal on file).
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

/** What the surface read, as its override hands it over. */
interface Read {
  bc: Output<"GET broadcasts">;
  heard: Output<"GET broadcasts/touches"> | { touched_at: null };
  people: Output<"GET contacts">;
  saved: Output<"GET segments"> | Error;
  tz: string;
  everyone: Parameters<typeof poolRowsOf>[0];
}

/** The audiences surface, counted from what it read. */
export function audiencesOf({ bc, heard, people, saved, tz, everyone }: Read): AudiencesSurface {
  const now = new Date();
  // The pool's one reading (contracts audience-pool.ts), as the send reads it.
  const rows = poolRowsOf(everyone, {
    tz,
    now,
    viewer: viewerId(),
    ready: bc.ready,
  });
  // Whether each channel can send now (the read's own; where it could not be read, WhatsApp as before, which the number's
  // banner judges): who an audience reaches is judged against it.
  const ready = cmReadyOf(bc.ready);
  // Both purposes, for every audience, so picking a template re-reads a number
  // rather than recomputing a list. Two passes over the people already in hand, for WhatsApp alone, as every broadcast
  // went; and one more for each other set of channels the owner could tick for the purpose, since who is reached on
  // which channel depends on the set (reachFor). Who a run reached from a week ago on, or is due to, and when, for the
  // note on how many of an audience hear from one within a week of the send, either side (contracts heardFor, at the
  // picked time).
  const touches = heard.touched_at ?? {};
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
        deals: !!people.has_deals,
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
                  hasDeals: !!people.has_deals,
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
  return {
    audiences,
    reach: reachCountsOf(rows),
    listsRead: !(saved instanceof Error),
    // Null is a read that failed; a server from before it was carried says nothing, and is read as read.
    heardRead: heard.touched_at !== null,
    fetchedAt: now.getTime(),
  };
}
