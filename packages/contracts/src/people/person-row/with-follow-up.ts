import { followUpStandOf, type FollowUpFactsDto } from "../../campaigns/playbooks/follow-ups";
import type { DealPaceVM } from "../../deals/waits";
import { poolRowOf, type PoolOptions } from "../audience-pool";
import type { PersonRowDto } from "../person-dto";
import type { PersonRowVM } from "./row-facts";

/**
 * A row as People's page holds it (0006): the row poolRowOf reads, with where the proposal follow-up stands for them where one
 * runs (followUpStandOf), judged by the pace and at the moment the row is. People's page makes its rows so, and Today's first
 * read the people it names (today/people.ts), so the two say one follow-up of one person. A module of its own, apart from
 * the pool and from the follow-up's rules: a page that reads a row without the follow-up loads neither this nor the rules
 * (Today's first draw, 13 Nov 2026), and the follow-up's rules load nothing of the pool.
 */
export function peopleRowOf(
  person: PersonRowDto,
  poolOptions: PoolOptions & { followUp: FollowUpFactsDto | null; pace: DealPaceVM | null },
): PersonRowVM {
  const vm = poolRowOf(person, poolOptions);
  const fu = poolOptions.followUp;
  return fu
    ? {
        ...vm,
        followUp: followUpStandOf(
          vm,
          fu,
          poolOptions.tz,
          poolOptions.now.getTime(),
          poolOptions.pace,
          poolOptions.ready,
        ),
      }
    : vm;
}
