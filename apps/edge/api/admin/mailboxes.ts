/**
 * POST /api/admin/mailboxes: the mailboxes a business connected to write its reach-outs from (decision 0056). The
 * dashboard's /api/v1/mailbox-connections verbs call it for an owner or a manager; the OAuth clients, the tokens and the
 * providers' wires live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes; a body that is not an object
 * is an empty one) and asks authorizeAdmin; runMailboxesOp in lib/connections/mailbox-ops.ts is the op table and what
 * each answer means.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { runMailboxesOp } from "../../lib/connections/mailbox-ops.js";
import { MAILBOXES_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, MAILBOXES_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/mailboxes", { body: raw });
  if (!auth.ok) return auth.response;
  return runMailboxesOp(auth, body);
});
