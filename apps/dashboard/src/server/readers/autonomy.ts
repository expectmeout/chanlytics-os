import "server-only";
import { dealsAreOn, HELD_DRAFTS_DAYS, type FactSuggestionDto, type HeldDraftsByIntent } from "@chanlytics/contracts";
import { factSuggestionsWaiting, heldDraftsByIntent, type PolicyRecord } from "@chanlytics/db";
import { log } from "@/server/log";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as facts from "./facts";

/** GET policies' answer: the matrix, the member's role, whether deals are on, and what the owner's corrections show. */
interface AutonomyMatrix {
  policies: PolicyRecord[];
  role: ReaderContext["role"];
  deals_on: boolean;
  /** The drafts held for the owner over the last HELD_DRAFTS_DAYS, by intent (decision 0063); null where the read failed. */
  held: HeldDraftsByIntent[] | null;
  /** The notes suggested from the owner's corrections, waiting, newest first (decision 0063); null where the read failed. */
  suggestions: FactSuggestionDto[] | null;
}

/**
 * GET policies, as the route answers it: the workspace autonomy matrix (E3), the member's role, and whether deals are
 * on here (0008) -- the pane draws the follow-ups' row only where they are (0006, contracts policyClassOffered). The
 * route's body, moved here whole: its two reads are the policies and how the customers buy, each through its reader
 * (readers/facts.ts) and at once, as the route read them, so a turn that holds them (workspace.settings,
 * sequences.moments) reads neither again, and a request reads both fresh. Named for the pane, Autonomy. Not a row a
 * citation names.
 *
 * Beside them, what the learning loop shows (decision 0063): how often the owner changed what the receptionist wrote, and
 * the notes their corrections suggest. Each is additive: a read that fails is null and logged, and the matrix stands.
 */
export const autonomy: Reader<undefined, AutonomyMatrix> = {
  name: "autonomy",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [p, s, held, suggestions] = await Promise.all([
      load(rc, facts.policies, undefined),
      load(rc, facts.sellsBy, undefined),
      heldDraftsByIntent(db, rc.tenantId, HELD_DRAFTS_DAYS).catch((error: unknown) => {
        log.error("autonomy_held_drafts_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
      factSuggestionsWaiting(db, rc.tenantId).catch((error: unknown) => {
        log.error("autonomy_suggestions_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
    ]);
    return {
      data: { policies: p.data, role: rc.role, deals_on: dealsAreOn(s.data), held, suggestions },
      rows: [],
      stamp: stamp(),
    };
  },
};
