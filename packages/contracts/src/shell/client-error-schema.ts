/**
 * A page's report of an error, as the route reads it (ClientErrorInput), apart from client-error.ts's boundaries and
 * limits. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these
 * words loads none of it.
 */
import { z } from "zod";
import { CLIENT_ERROR_BOUNDARIES, PAGE, CLIENT_ERROR_LIMITS, WORKSPACE } from "./client-error";

export const ClientErrorInput = z.object({
  boundary: z.enum(CLIENT_ERROR_BOUNDARIES, { error: "Say which boundary caught it." }),
  page: z.string().regex(PAGE).max(CLIENT_ERROR_LIMITS.page).nullable(),
  name: z.string().max(CLIENT_ERROR_LIMITS.name),
  message: z.string().max(CLIENT_ERROR_LIMITS.message),
  stack: z.string().max(CLIENT_ERROR_LIMITS.stack).nullable(),
  /** Next's digest for a server component's error: the key to its server-side line. */
  digest: z.string().max(CLIENT_ERROR_LIMITS.digest).nullable(),
  /** The workspace the tab held, when it held one: the auth pages and the root boundary may hold none. */
  workspace: z.string().regex(WORKSPACE).max(CLIENT_ERROR_LIMITS.workspace).nullable(),
});

export type ClientErrorInputDto = z.infer<typeof ClientErrorInput>;
