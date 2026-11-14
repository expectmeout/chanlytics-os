/**
 * What Today draws from People, carried by Today's first read (GET today/people; Today knows its shape at its first draw,
 * 13 Nov 2026). Ask found's checks (the dashboard's today/leaks.ts) count People's lists and name the people a
 * consultation, a proposal or a yes to offers is about, and To do draws the steps due (todaySteps): each waited for
 * People's whole book, the page's heaviest read and the last of its second wave, and landed 0.3 to 1.3 s after the rest
 * of the page: Ask found 319 to 393 px under the day, To do's steps in the places of the visits drawn before them (the load
 * reviews of 10 and 13 Nov 2026). So the read that opens Today carries what they read of People: each list counted as
 * People's rail counts it (peopleListsOf), how many are in People, and the rows of the people those checks and the steps
 * can name, as People's own read answers each (GET contacts), with what the page makes their rows from (the pace, the
 * proposal follow-up, the channels). The page makes those rows the way People's page does (peopleRowOf) and runs the same
 * checks over them, so the first draw says what People's book says once it is in: no rule has a second copy here, only
 * which rows each one reads.
 *
 * Worked out over People's first page, the read People's page opens on (the server shares it with that read in one
 * turn). Where People holds more than one page (`whole: false`), the page waits for People's book as it did: the counts of a
 * thousand are not the counts of everyone.
 */
import type { ChannelsReady } from "../campaigns/broadcasts/reach-for";
import type { FollowUpFactsDto, FollowUpStand } from "../campaigns/playbooks/follow-ups";
import { consultationsWithoutProposal } from "../deals/consultations";
import { dealPaceOf, eachOpenProposal, type DealPaceDto } from "../deals/waits";
import { todayStepsDue } from "../notes/steps";
import { peopleListsOf, type PeopleListCount } from "../people/lists/actions";
import { peopleRowOf } from "../people/person-row/with-follow-up";
import type { PersonRowDto } from "../people/person-dto";
import type { PersonRowVM } from "../people/person-row/row-facts";

/** A People list as Today's checks read it: what it is, how many are on it, and its step. */
type TodayPeopleListDto = Pick<PeopleListCount, "id" | "label" | "group" | "count" | "action">;

/**
 * GET today/people: what Today draws from People, or that People holds more than one page (`whole: false`), where the page
 * waits for People's book. `total` is how many are in People either way.
 */
export type TodayPeopleDto =
  | {
      whole: true;
      total: number;
      /** People's built-in lists this workspace counts (peopleListsOf), without who is on them. */
      lists: TodayPeopleListDto[];
      /** The people Today's checks and steps due can name (todayPeopleNamed), each as GET contacts answers them. */
      people: PersonRowDto[];
      /**
       * Where the proposal follow-up stands for each of them it reaches, by person (followUpStandOf, judged here at the
       * read's moment): the page lays it on their row as People's page does (peopleRowOf), and loads no follow-up rule.
       */
      follow_ups: Record<string, FollowUpStand>;
      deal_pace: DealPaceDto | null;
      channels_ready: ChannelsReady | null;
    }
  | { whole: false; total: number };

/** People's first page as GET contacts answers it, as far as Today's read takes from it (server readers/people.ts). */
interface PeopleFirstPage {
  people: PersonRowDto[];
  calendar: { state: string };
  consult_first: boolean;
  has_deals: boolean;
  deal_pace: DealPaceDto | null;
  follow_up: FollowUpFactsDto | null;
  channels_ready: ChannelsReady | null;
}

/**
 * Who Today's checks and steps due can name, of People's rows, by id: whoever has a step due by the business's today
 * (todayStepsDue, every one of them), a consultation with nothing after it (consultationsWithoutProposal), a proposal out
 * (eachOpenProposal: the check then weighs how long each has waited), and of the people who said yes to offers, the first
 * whose reason none can be sent one is that the workspace has no channel for it and the first whose reason is another:
 * the reach check asks only whether anyone said that yes and whether that is the reason (today/leaks.ts unreachableLeak).
 * tests/today/people-facts.test.mjs holds every check and the steps to one answer over these rows and over everyone.
 */
function todayPeopleNamed(rows: readonly PersonRowVM[], at: { nowMs: number; tz: string }): Set<string> {
  const named = new Set<string>();
  for (const { row } of todayStepsDue(rows, at.nowMs, at.tz, Number.POSITIVE_INFINITY).rows) named.add(row.id);
  for (const r of consultationsWithoutProposal(rows, at.nowMs)) named.add(r.id);
  for (const r of eachOpenProposal(rows)) named.add(r.id);
  const offers = rows.filter((r) => r.saidYes.offers);
  const noChannel = offers.find((r) => r.whyNot.offers === "no_channel");
  const other = offers.find((r) => r.whyNot.offers !== "no_channel");
  if (noChannel) named.add(noChannel.id);
  if (other) named.add(other.id);
  return named;
}

/**
 * Today's read of People from People's first page, for the member `viewer` at `now` in the workspace's zone: the lists as
 * the rail counts them, how many are in People, and the people the checks and the steps can name. `reach` is how many are
 * in People and whether the page is all of them; where it is not, only how many there are.
 */
export function todayPeopleOf(
  first: PeopleFirstPage,
  reach: { whole: boolean; total: number },
  as: { tz: string; now: Date; viewer: string | null },
): TodayPeopleDto {
  const total = reach.total;
  if (!reach.whole) return { whole: false, total };
  const pace = dealPaceOf(first.deal_pace);
  const rows = first.people.map((p) =>
    peopleRowOf(p, { ...as, ready: first.channels_ready, followUp: first.follow_up, pace }),
  );
  const named = todayPeopleNamed(rows, { nowMs: as.now.getTime(), tz: as.tz });
  return {
    whole: true,
    total,
    lists: peopleListsOf(rows, {
      calendar: first.calendar.state,
      consultFirst: first.consult_first,
      hasDeals: first.has_deals,
    }).map(({ id, label, group, count, action }) => ({ id, label, group, count, action })),
    people: first.people.filter((p) => named.has(p.id)),
    follow_ups: Object.fromEntries(
      rows.flatMap((row) => (named.has(row.id) && row.followUp ? [[row.id, row.followUp] as const] : [])),
    ),
    deal_pace: first.deal_pace,
    channels_ready: first.channels_ready,
  };
}
