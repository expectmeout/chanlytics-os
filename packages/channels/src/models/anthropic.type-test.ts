/**
 * Whom a request is for is the compiler's to hold (decision 0097): the port takes no request that has not said, and a route
 * cannot be written without the decision. tooling/scripts/tests/anthropic-profiles holds the same at run time for what no
 * compiler reads. No runtime: if this file stops compiling (this package's `tsc --noEmit`), the promise moved.
 */
import type { ModelRoute } from "@chanlytics/contracts";
import { MODELS } from "@chanlytics/contracts";
import { askModel, streamModel, type ModelAsk } from "./anthropic";

const key = "";
const body = {};

export const attributed: ModelAsk = { purpose: "ask", attribution: { profileId: null }, body };

// @ts-expect-error a request has to say whom it is for
export const unsaid: ModelAsk = { purpose: "ask", body };

export const bothDoorsRefuse = () => [
  // @ts-expect-error neither door takes one that has not
  askModel(key, { purpose: "ask", body }),
  // @ts-expect-error neither door takes one that has not
  streamModel(key, { purpose: "ask", body }),
];

// @ts-expect-error a purpose cannot arrive without the decision
export const undecided: ModelRoute = {
  model: MODELS.HAIKU_5_5,
  fallback: null,
  timeoutMs: 1,
  retries: 0,
  maxTokens: 1,
};
