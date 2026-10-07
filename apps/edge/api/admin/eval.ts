/**
 * POST /api/admin/eval: runs the receptionist on a set of messages for one workspace and hands back what it would have
 * said; nothing is sent, nothing is written.
 *
 * The door is the knock (authorizeAdmin: a token for this door and that workspace, or the key on an edge without the
 * secret), the body (readBody) and the model as a port, which a test hands in; evaluateCases in
 * lib/receptionist/eval.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { evaluateCases, type BrainPort } from "../../lib/receptionist/eval.js";
export { type BrainPort } from "../../lib/receptionist/eval.js";

export const POST = adminDoor(async function POST(request: Request, brain?: BrainPort | null): Promise<Response> {
  // A door for one workspace: the harness (tooling/scripts/eval-brain.mjs) mints a token for it and that workspace,
  // as the dashboard mints one; the key opens it only on an edge without the secret.
  const auth = await authorizeAdmin(request, "/api/admin/eval");
  if (!auth.ok) return auth.response;
  return evaluateCases(auth, await readBody(request), brain);
});
