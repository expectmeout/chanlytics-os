import { read, write, platform } from "@/server/route";
import { RequestFileSchema } from "@chanlytics/contracts";
import { consoleFileRequest, consoleRequests } from "@/server/platform/requests";

/**
 * GET /api/v1/platform/requests — the requests the data-deletion page promises an answer to (decision 0066), with
 * their clocks: the open ones, and those closed in the last thirty days.
 */
export const GET = read({
  scope: platform,
  sees: "requests",
  handle: async ({ office }) => ({ requests: await consoleRequests(office) }),
});

/**
 * POST /api/v1/platform/requests — {kind, workspace, asked_by, asked_at, why}: a request filed as it came in to the
 * inbox, its thirty days counted from when they asked. An act, with its reason, in the Admin log.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_request",
  act: "request_file",
  input: RequestFileSchema,
  handle: async ({ office, input }) => ({ request: await consoleFileRequest(office, input) }),
});
