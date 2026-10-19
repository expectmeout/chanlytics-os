import "server-only";
import {
  DAY_MS,
  HELD_DRAFTS_DAYS,
  OWN_MODE_NAMED,
  ownModesOf,
  personName,
  type FactSuggestionDto,
  type HeldDraftsByIntent,
  type OwnModesDto,
  type SequenceEvidenceDto,
} from "@chanlytics/contracts";
import {
  factSuggestionsWaiting,
  heldDraftsByIntent,
  namesOfPeople,
  peopleOnTheirOwnMode,
  replyTokensSince,
  sequenceEvidence,
  type PolicyRecord,
} from "@chanlytics/db";
import { log } from "@/server/log";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as facts from "./facts";

/** GET policies' answer: the matrix, the member's role, and what the owner's corrections show. */
interface AutonomyMatrix {
  policies: PolicyRecord[];
  role: ReaderContext["role"];
  /** The drafts held for the owner over the last HELD_DRAFTS_DAYS, by intent (decision 0063); null where the read failed. */
  held: HeldDraftsByIntent[] | null;
  /** The notes suggested from the owner's corrections, waiting, newest first (decision 0063); null where the read failed. */
  suggestions: FactSuggestionDto[] | null;
  /** The people whose receptionist has a mode of their own, counted and the newest named; null where the read failed. */
  own_modes: OwnModesDto | null;
  /**
   * The replies of the last REPLY_TOKENS_DAYS and their model tokens, which the day's budget counts: the dial says each
   * step in the replies it buys (contracts budgetDial). Null where the read failed.
   */
  reply_tokens: { replies: number; tokens: number } | null;
  /**
   * What each sequence's batches did over the last EVIDENCE_DAYS (decision 0064, step 5): what the rows for the
   * sequences' classes say under them, so a new sequence's start is set on what happened. Null where the read failed.
   */
  evidence: SequenceEvidenceDto[] | null;
}

/** How far back a reply's size is measured: a week, so a quiet day or a busy one does not move it much. */
const REPLY_TOKENS_DAYS = 7;

/**
 * The people set differently from the reply row (the Settings wiring review, item 10, 18 Oct 2026): every one counted,
 * the newest changes named as People names them (contracts personName). Replies said what the receptionist does for
 * everyone, and nothing said that some people were set apart from it.
 */
async function ownModes(db: ReaderContext["ctx"]["supabase"], tenantId: string): Promise<OwnModesDto> {
  const rows = await peopleOnTheirOwnMode(db, tenantId);
  const newest = rows.slice(0, OWN_MODE_NAMED).map((r) => r.id);
  const people = newest.length ? await namesOfPeople(db, tenantId, newest) : [];
  return ownModesOf(rows, new Map(people.map((p) => [p.id, personName(p)])));
}

/**
 * GET policies, as the route answers it: the workspace autonomy matrix (E3) and the member's role. Every workspace has
 * deals (0008, amended 18 Oct 2026), so the pane draws the follow-ups' row for each. The route's body, moved here
 * whole: its read of the policies is through its reader (readers/facts.ts), so a turn that holds it
 * (workspace.settings, sequences.moments) reads it no more, and a request reads it fresh. Named for the pane, Autonomy.
 * Not a row a citation names.
 *
 * Beside them, what the learning loop shows (decision 0063): how often the owner changed what the receptionist wrote, and
 * the notes their corrections suggest. Each is additive: a read that fails is null and logged, and the matrix stands.
 */
export const autonomy: Reader<undefined, AutonomyMatrix> = {
  name: "autonomy",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [p, held, suggestions, own, replyTokens, evidence] = await Promise.all([
      load(rc, facts.policies, undefined),
      heldDraftsByIntent(db, rc.tenantId, HELD_DRAFTS_DAYS).catch((error: unknown) => {
        log.error("autonomy_held_drafts_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
      factSuggestionsWaiting(db, rc.tenantId).catch((error: unknown) => {
        log.error("autonomy_suggestions_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
      ownModes(db, rc.tenantId).catch((error: unknown) => {
        log.error("autonomy_own_modes_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
      replyTokensSince(
        db,
        rc.tenantId,
        new Date(rc.now.getTime() - REPLY_TOKENS_DAYS * DAY_MS).toISOString(),
        rc.now.toISOString(),
      ).catch((error: unknown) => {
        log.error("autonomy_reply_tokens_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
      sequenceEvidence(db, rc.tenantId).catch((error: unknown) => {
        log.error("autonomy_evidence_failed", { tenant_id: rc.tenantId, error });
        return null;
      }),
    ]);
    return {
      data: {
        policies: p.data,
        role: rc.role,
        held,
        suggestions,
        own_modes: own,
        reply_tokens: replyTokens,
        evidence,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};
