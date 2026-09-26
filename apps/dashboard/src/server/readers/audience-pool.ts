import "server-only";
import { audiencePool as audiencePoolFrom, type AudiencePool } from "../audience";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";

/**
 * Everyone in People with their appointments, for the member asking (server/audience.ts): the pool a broadcast's
 * audience, a People list and a playbook's moment are counted over, as the send counts them. Read once a turn by its
 * arguments, so a turn that lists the audiences and then proposes a send reads everyone once -- the memo it replaces
 * kept one pool whatever the zone and the clock. The workspace's zone, its settings and how its customers buy are the
 * turn's (readers/facts.ts): the pool's own calendar lookup reads neither the zone nor the settings, and sells_by is
 * not read again. A workspace-wide read, so no row of its own: the people a tool names come from `people`.
 */
export const audiencePool: Reader<undefined, AudiencePool> = {
  name: "audiencePool",
  async read(rc) {
    const [zone, settings, sellsBy] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.config, undefined),
      load(rc, facts.sellsBy, undefined),
    ]);
    const { timezone } = zone.data;
    const data = await audiencePoolFrom(rc.ctx, rc.tenantId, timezone, rc.now, {
      sellsBy: sellsBy.data,
      known: { timezone, config: settings.data?.config ?? null },
    });
    return { data, rows: [], stamp: stamp() };
  },
};
