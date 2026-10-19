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
import type { AudienceKind, AudiencePreview, AskedPurpose, ConsentChannel, ReachCounts } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/legacy-bridge/surface-realtime";
import { workspaceZone } from "@/legacy-bridge/zone";
import { codeOnce } from "@/lib/code-once";
import { everyPerson } from "@/surfaces/people/surface";
import { setSurfaceValue } from "../../surface-values";

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
   * Whether who heard from a campaign or a broadcast this week was read (GET broadcasts/touches' `touched_at`); false counts the
   * audiences with nobody left out, and the composer says the send still leaves them out (contracts HEARD_UNREAD_WORDS).
   */
  heardRead: boolean;
  fetchedAt: number;
}

/**
 * How the audiences are counted (audiences-shape.ts: the pool, the lists and who each reaches, contracts'), fetched beside
 * the reads the first time this surface is read: a composer's own, which every page's first load carried (the
 * loadability review, 19 Oct 2026). A fetch that failed is asked for again by the next read.
 */
const audiencesShape = codeOnce(() => import("./audiences-shape"));

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
  // of proposals out, or a yes since), and the team the people read names. And the proposal follow-up's sequence, its step and
  // its mode (decision 0064: whether its next batch asks), which its facts name. All of it heard where a composer is drawn, and
  // once as one comes back.
  ...declareReads("audiences", {
    reads: [
      "campaign",
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
    // GET broadcasts for what the workspace can send on, which each audience is judged against (asked beside Sent's own read
    // of it, the two share one request: client/api.ts), and who heard from a run this week, its own read: every touch of the
    // week, which nothing but an audience's count reads, so Sent's runs (which the Inbox waits for) carry none of it. A
    // refusal of it is touches not read, as the server says one it could not read: the composer says nothing of who heard.
    const [bc, heard, people, saved, tz, shape] = await Promise.all([
      read("GET broadcasts"),
      read("GET broadcasts/touches").catch(() => ({ touched_at: null })),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      // Whose visit is today and what is due, by the business's clock (zone.ts).
      workspaceZone(),
      // And how they are counted (audiences-shape.ts), fetched beside them the first time.
      audiencesShape(),
    ]);
    // Every page of people, not the first: the send enrols everyone, so an
    // audience counted over one page promised fewer people than the send reaches.
    const { people: everyone } = await everyPerson(people);
    setSurfaceValue("audiences", shape.audiencesOf({ bc, heard, people, saved, tz, everyone }));
  },
};
