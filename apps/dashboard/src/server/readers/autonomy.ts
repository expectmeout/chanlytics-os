import "server-only";
import { dealsAreOn } from "@chanlytics/contracts";
import type { PolicyRecord } from "@chanlytics/db";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as facts from "./facts";

/** GET policies' answer: the matrix, the member's role, and whether deals are on. */
interface AutonomyMatrix {
  policies: PolicyRecord[];
  role: ReaderContext["role"];
  deals_on: boolean;
}

/**
 * GET policies, as the route answers it: the workspace autonomy matrix (E3), the member's role, and whether deals are
 * on here (0008) -- the pane draws the follow-ups' row only where they are (0006, contracts policyClassOffered). The
 * route's body, moved here whole: its two reads are the policies and how the customers buy, each through its reader
 * (readers/facts.ts) and at once, as the route read them, so a turn that holds them (get_settings, list_playbooks)
 * reads neither again, and a request reads both fresh. Named for the pane, Autonomy. Not a row a citation names.
 */
export const autonomy: Reader<undefined, AutonomyMatrix> = {
  name: "autonomy",
  async read(rc) {
    const [p, s] = await Promise.all([load(rc, facts.policies, undefined), load(rc, facts.sellsBy, undefined)]);
    return { data: { policies: p.data, role: rc.role, deals_on: dealsAreOn(s.data) }, rows: [], stamp: stamp() };
  },
};
