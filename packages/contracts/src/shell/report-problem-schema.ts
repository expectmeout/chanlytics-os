/**
 * A member's ask for help, as the route reads it (ReportProblemInput), apart from report-problem.ts's words and limits.
 * zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these words loads
 * none of it.
 */
import { z } from "zod";
import { PAGE, WORKSPACE, CLIENT_ERROR_LIMITS } from "./client-error";
import { REPORT_KINDS } from "./report-problem";

export const ReportProblemInput = z
  .object({
    /** What they need (decision 0067); a sheet from before the pick sends none, and the route infers it. */
    kind: z.enum(REPORT_KINDS).optional(),
    words: z.string().trim().min(1, "Say what you need first.").max(2000, "At most 2,000 characters."),
    /** The route's first segment, as field data names a page; null on a page with none. */
    page: z.string().regex(PAGE).max(CLIENT_ERROR_LIMITS.page).nullable(),
    /** The last error the page hit, when it hit one. */
    error: z
      .object({
        id: z.string().regex(/^[0-9a-f]{1,8}$/),
        name: z.string().max(CLIENT_ERROR_LIMITS.name),
        message: z.string().max(CLIENT_ERROR_LIMITS.message),
      })
      .strict()
      .nullable(),
    /** The workspace the tab held: the route takes it only if the member belongs to it. */
    workspace: z.string().regex(WORKSPACE).max(CLIENT_ERROR_LIMITS.workspace).nullable(),
  })
  .strict();

export type ReportProblemInputDto = z.infer<typeof ReportProblemInput>;
