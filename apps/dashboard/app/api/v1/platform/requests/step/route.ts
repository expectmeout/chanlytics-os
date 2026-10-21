import { write, platform } from "@/server/route";
import { RequestStepSchema } from "@chanlytics/contracts";
import { consoleRequestStep } from "@/server/platform/requests";

/**
 * POST /api/v1/platform/requests/step — {id, step, done, why}: one step of a request marked done or not done, or the
 * request closed once every step is (decision 0066). Each is an act with its reason; the route names `request_step`,
 * whose roles closing asks too, and the log says which it was.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_request",
  act: "request_step",
  input: RequestStepSchema,
  handle: async ({ office, input }) => ({ request: await consoleRequestStep(office, input) }),
});
