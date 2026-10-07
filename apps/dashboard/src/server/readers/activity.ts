import "server-only";
import type { ActivityPageDto } from "@chanlytics/contracts";
import { activityLog, type ActivityFilter } from "../metrics/activity";
import { stamp, type Reader } from "./index";

/**
 * GET activity, as the route answers it: both ledgers of the workspace, newest first, in an owner's words, filtered by
 * person, kind and day and paged by cursor (server/activity.ts activityLog, which keeps its own reads). The route keeps
 * the owner's door, the aggregate rate and the query's checks; this trusts its caller and takes the filter as parsed.
 * An entry is not a row a citation names: none of the thirteen is a ledger's.
 */
export const activity: Reader<ActivityFilter, ActivityPageDto> = {
  name: "activity",
  async read(rc, args) {
    return { data: await activityLog(rc.ctx, rc.tenantId, args), rows: [], stamp: stamp() };
  },
};
