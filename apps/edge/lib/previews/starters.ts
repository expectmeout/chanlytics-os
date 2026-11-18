/**
 * The questions a lead's own preview offers first, written for its business as the preview is built (decision 0079,
 * amended 18 November 2026): one short read by the smallest model (the registry's preview_starters route), told the
 * listing's kind and what the receptionist was just given to know (contracts previewStartersAskOf), its answer read in
 * code (previewStartersWrittenOf: a customer's short line, never a price, never a time to come in). The build keeps them
 * beside the receptionist, in the preview's own workspace.
 *
 * A call of the preview's own, and not a part of the website's read: that read is every customer's first run too, a
 * lead with no site (or one that could not be read) has a kind and a listing to write from, and the questions are held
 * to what the receptionist knows, which is settled only once the site's facts are worn.
 *
 * Platform-spent, as the website's read is, on the preview's own workspace. Never the build's failure: no model, too
 * little time left, a refusal or an answer that cannot be read all write none, and the page then offers the questions it
 * makes from the record, as every preview did before.
 */
import {
  ANSWER_JSON_ONLY,
  PREVIEW_STARTERS_SCHEMA,
  PREVIEW_STARTERS_SYSTEM,
  SECOND_MS,
  modelRoute,
  previewStartersAskOf,
  previewStartersWrittenOf,
  valueAt,
  type PreviewStartersKnown,
  type TenantId,
} from "@chanlytics/contracts";
import { askJson, promptHashOf } from "../ai/model.js";
import { errField, logger } from "../shared/log.js";

/** The most the writing may take of the build's time, its fallback's try included. */
const STARTERS_CALL_MS = 12 * SECOND_MS;
/** The least worth starting it with: under this, the build is nearly out of time and the receptionist's write comes first. */
const STARTERS_LEAST_MS = 3 * SECOND_MS;

/** The questions' writer, as the build is handed it: the real one, or a test's. */
export type StartersWriter = (
  known: PreviewStartersKnown,
  o: { tenantId: TenantId; previewId: string; deadline: number },
) => Promise<string[]>;

/** The questions written for one business: at most three, or none where they could not be written. Never throws. */
export const writePreviewStarters: StartersWriter = async (known, { tenantId, previewId, deadline }) => {
  const ms = Math.min(STARTERS_CALL_MS, deadline - Date.now());
  if (ms < STARTERS_LEAST_MS) return [];
  try {
    const answered = await askJson({
      purpose: "preview_starters",
      system: PREVIEW_STARTERS_SYSTEM,
      user: previewStartersAskOf(known),
      schema: PREVIEW_STARTERS_SCHEMA,
      maxTokens: modelRoute("preview_starters").maxTokens,
      plainJsonHint: ANSWER_JSON_ONLY,
      deadlineMs: ms,
      signal: AbortSignal.timeout(ms),
      for: { tenantId, subjectId: previewId, promptHash: promptHashOf(PREVIEW_STARTERS_SYSTEM) },
    });
    return previewStartersWrittenOf(valueAt(answered?.answer, "questions"));
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("preview_build_failed", {
      preview_id: previewId,
      step: "starters",
      error: errField(e),
    });
    return [];
  }
};
