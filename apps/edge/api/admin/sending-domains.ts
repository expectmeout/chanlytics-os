/**
 * POST /api/admin/sending-domains: a workspace's own domains for cold email (Reach out, Part 2). The dashboard's
 * /api/v1/sending-domains verbs call it for an owner; the cold mail account's key lives on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes; a body that is not an object
 * is an empty one), decides whether this knock is the platform's lift of a second hold (the one op the key opens on an
 * edge that holds the secret too, D16) and asks authorizeAdmin; sendingDomainsOp in lib/email/sending-domains-ops.ts is
 * the op table and what each answer means.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { sendingDomainsOp, type Body } from "../../lib/email/sending-domains-ops.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  // Read once, as text: the token's body hash is checked over these bytes, and a body that is not an object (null
  // included) is an empty one, validated below.
  const raw = await request.text();
  const body = await readBody<Body>(raw);
  // The platform lifts a second hold with its key and never with a token (D16, the runbook): that one op is the
  // key's on an edge that holds the secret too. Every other op is a dashboard's and carries a token; the key alone
  // is refused before a row is read.
  const platformLift = str(body.op) === "resume" && str(body.by) === "platform";
  const auth = await authorizeAdmin(request, "/api/admin/sending-domains", { platformKey: platformLift, body: raw });
  if (!auth.ok) return auth.response;
  return sendingDomainsOp(auth, request, body);
});
