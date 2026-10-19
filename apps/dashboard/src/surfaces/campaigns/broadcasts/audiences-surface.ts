/**
 * Who each audience a broadcast offers reaches: counted over everyone in People, by the same contracts predicate the route
 * enrols with, so the number on the chip is the number the route will find. Part of the SurfaceData seam (../surface-data.ts);
 * the composers read it through `useSurface("audiences")`, beside Sent's own surface (./surface.ts).
 *
 * It was Sent's surface, and everything that says a run waits read that: the badge, Today's queue, the Inbox's rows, Ask's
 * Right now and a run's sheet. So none of them drew until every page of People had been read, and on a workspace with many
 * people the Inbox's run row landed well after its conversations and pushed them down (the Inbox's run review, 18 Oct 2026).
 * Sent's runs are read on their own now (./surface.ts), and this is drawn where a composer is: the composer Campaigns opens
 * over Sequences, and Send it again on a run's own sheet. It is read as Sent's surface was, in the boot's second pass, after
 * what the page on screen draws, and heard on those two pages alone. Not `onDemand`: a surface read only where it is drawn is
 * read again for anything it let pass, and a message let pass on the composer would read every page of People again as it
 * came back (W-review-facts-rules-2).
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
  type AudiencePreview,
  type ChannelsReady,
  type ConsentChannel,
  type ReachCounts,
} from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/legacy-bridge/surface-realtime";
import { workspaceZone } from "@/legacy-bridge/zone";
import { otherChannelSets } from "@/lib/campaign-channels";
import { everyPerson, viewerId } from "@/surfaces/people/surface";
import { setSurfaceValue } from "../../surface-values";
import { cmReadyOf } from "../parts/channels";

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

export interface AudiencesSurface {
  audiences: AudienceOption[];
  /**
   * Who can hear the workspace, counted once over everyone read from the one rule every page asks (contracts
   * reachCountsOf over each row's personReachOf).
   */
  reach: ReachCounts;
  /** Whether the saved lists were read; false leaves the audiences without them, and the page says so. */
  listsRead: boolean;
  /**
   * Whether who heard from a campaign or a broadcast this week was read (GET broadcasts' `touched_at`); false counts the
   * audiences with nobody left out, and the composer says the send still leaves them out (contracts HEARD_UNREAD_WORDS).
   */
  heardRead: boolean;
  fetchedAt: number;
}

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

export const audiencesOverride: SurfaceOverride = {
  key: "audiences",
  value: "audiences",
  events: ["surface:audiences"],
  // Counted over everyone in People: a stream of changes is waited out longer, as People's is (S10-2).
  maxWaitMs: DEAR_READ_LONGEST_WAIT_MS,
  // Who may be sent to (the person: an answer, a stop, people imported), and who heard from a campaign this week (a run made,
  // sending or finished: GET broadcasts' touches). A message, a hold and a visit, which the audiences' pools read (a visit
  // marked missed or cancelled leaves a reminder's: #1551), and a number, a line or the workspace's pause, which who is reached
  // is judged against. The rules and the business's facts the pools are read with. And the lists To offers and counts: a list
  // made, renamed or emptied by a teammate or another tab (the wiring's second audit, W-person-list-lead-7); a deal (an audience
  // of proposals out, or a yes since), and the team the people read names. All of it heard where a composer is drawn, and once
  // as one comes back.
  ...declareReads("audiences", {
    reads: [
      "conversation",
      "hold",
      "visit",
      "channel",
      "billing",
      "person",
      "rules",
      "facts",
      "send",
      "list",
      "deal",
      "team",
    ],
    fresh: "its-page",
    omit: [
      {
        tables: ["invitations"],
        why: "the people it counts name the members who wrote or took something; an invitation not yet taken names no one",
      },
      {
        tables: ["appointment_notices"],
        why: "a booking email held for a look is the Calendar's and Settings'; the audiences' pools read the appointments themselves",
      },
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "who is reached is judged against the number, the line, the mailbox's pause and the workspace's pause (channels-ready.ts); a connected mailbox, an activation and the carriers' record are not among them",
      },
    ],
  }),
  apply: async () => {
    // GET broadcasts for who heard from a run this week and what the workspace can send on, which each audience is judged
    // against; asked beside Sent's own read of it, the two share one request (client/api.ts).
    const [bc, people, saved, tz] = await Promise.all([
      read("GET broadcasts"),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      // Whose visit is today and what is due, by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    const now = new Date();
    // Every page of people, not the first: the send enrols everyone, so an
    // audience counted over one page promised fewer people than the send reaches.
    const { people: everyone } = await everyPerson(people);
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
    setSurfaceValue("audiences", {
      audiences,
      reach: reachCountsOf(rows),
      listsRead: !(saved instanceof Error),
      // Null is a read that failed; a server from before it was carried says nothing, and is read as read.
      heardRead: bc.touched_at !== null,
      fetchedAt: now.getTime(),
    });
  },
};
