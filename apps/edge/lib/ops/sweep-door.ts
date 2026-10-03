/**
 * What every scheduled route does before its sweep, in one place: name the request, name the sweep in the log, find the
 * database, and check the knock. Each route under apps/edge/api/cron is then this with the sweep it stands for, and the
 * sweep (a function in its domain's folder of apps/edge/lib) is handed what it needs and answers.
 *
 * The order is the one every route wrote for itself: the logger first, then the database (none is a 503, and the
 * line some sweeps have always said for it), then the sweep key held in Vault (authorizeCron, cron-auth.ts), and
 * only then the sweep. A sweep that is not let in does nothing, not even a read.
 *
 * `started` is the moment the door was reached, for the sweeps that keep a budget inside the function's limit
 * (vercel.json): the door's own reads and a cold start are inside that limit too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { authorizeCron } from "../cron-auth.js";
import { refuse } from "../http.js";
import { door, logger, type Logger, type LogEvent } from "../log.js";
import { pg } from "../pg.js";

/** What a sweep is handed: the service-role database, its logger, and when its door was reached (Date.now()). */
export interface SweepTick {
  db: SupabaseClient<Database>;
  L: Logger;
  started: number;
}

/** Which sweep this is (the `sweep` field on every line it logs) and the line it says when there is no database. */
interface SweepDoorSpec {
  sweep: string;
  noDbEvent?: LogEvent;
}

/**
 * The route for one sweep, named as a door (log.ts `door`: the platform's id for the invocation): the knock checked,
 * then `run(tick)`, whose answer is the route's.
 */
export function sweepDoor(
  { sweep, noDbEvent }: SweepDoorSpec,
  run: (tick: SweepTick) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return door(async (request: Request): Promise<Response> => {
    const started = Date.now();
    const L = logger({ sweep });
    const db = pg();
    if (!db) {
      if (noDbEvent) L.error(noDbEvent);
      return refuse(503, "no_database");
    }
    const denied = await authorizeCron(request, db, L);
    if (denied) return denied;
    return run({ db, L, started });
  });
}
