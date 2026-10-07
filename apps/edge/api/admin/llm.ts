/**
 * POST /api/admin/llm: the model gateway for the workspace assistant. The dashboard builds the whole request and runs
 * the tools itself; the edge spends the key, keeps the count and forwards the API's event stream as it arrives.
 *
 * The door is the knock (authorizeAdmin: a signed admin token only, the dashboard is the sole caller) and the moment it
 * was reached, which the gateway's own hop is timed from; askTurn in lib/ops/ask-turn.ts reads the request, checks the
 * budget and makes the call.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { askTurn } from "../../lib/ops/ask-turn.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const tIn = Date.now();
  const auth = await authorizeAdmin(request, "/api/admin/llm");
  if (!auth.ok) return auth.response;
  return askTurn(auth, tIn, request);
});
