import "server-only";
import { audiencePool as audiencePoolFrom, type AudiencePool } from "../people/audience";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";
import { everyone } from "./everyone";

/**
 * Everyone in People with their appointments, for the member asking (server/people/audience.ts): the pool a broadcast's
 * audience, a People list and a playbook's moment are counted over, as the send counts them. Read once a turn by its
 * arguments, so a turn that lists the audiences and then proposes a send reads it once -- the memo it replaces kept
 * one pool whatever the zone and the clock. Everyone is the turn's own read (readers/everyone.ts), which the Playbooks
 * page's pools share; the zone, the settings and how the customers buy are the turn's too (readers/facts.ts): the
 * zone up front, as the tool's context had it, and the settings only where the pool's calendar lookup would read them,
 * so a settings read that fails costs the visits, never the pool. A workspace-wide read, so no row of its own: a tool
 * that names someone from it records them itself.
 */
export const audiencePool: Reader<undefined, AudiencePool> = {
  name: "audiencePool",
  async read(rc) {
    const [zone, sellsBy] = await Promise.all([load(rc, facts.facts, undefined), load(rc, facts.sellsBy, undefined)]);
    const data = await audiencePoolFrom(rc.ctx, rc.tenantId, zone.data.timezone, rc.now, {
      sellsBy: sellsBy.data,
      people: () => load(rc, everyone, undefined).then((r) => r.data),
      known: facts.zoneAndSettings(rc),
    });
    return { data, rows: [], stamp: stamp() };
  },
};
