import { write, platform } from "@/server/route";
import { SupportResendSchema } from "@chanlytics/contracts";
import { supportResend } from "@/server/platform/support";

/**
 * POST /api/v1/platform/support/resend — {id}: a report the inbox did not get, sent to it again through the edge's
 * support door on behalf of the member who wrote it (decision 0067). Our mail about our row: an act whose reason is
 * the report's code. Refused on a deployment that sends no mail.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_support_resend",
  act: "report_resent",
  input: SupportResendSchema,
  handle: async ({ office, input }) => supportResend(office, input.id),
});
