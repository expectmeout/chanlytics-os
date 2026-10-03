import { write, account } from "@/server/route";
import { createWorkspace } from "@/server/workspace/workspace-create";

/**
 * POST /api/v1/workspaces/create — bring a new workspace into existence.
 *
 * NOTE THE ABSENT ROLE CHECK, which is deliberate. Every other mutating route
 * names a role against a workspace the caller already belongs to. There is
 * no such workspace here: this is the one write that creates the thing roles
 * are scoped to, so it is declared on the account, with no role to name. The
 * authorisation that matters is the session itself, and the function reads
 * the caller from auth.uid() rather than trusting anything sent.
 *
 * Neither `tenants` nor `memberships` has an INSERT policy — on purpose, since
 * one on tenants would let any signed-in user mint rows, and one on memberships
 * would let them join a workspace nobody invited them to. So the write goes
 * through create_workspace (00021), a security-definer function that is the
 * single audited place this privilege exists. Service-role never enters the
 * request path.
 *
 * Every workspace starts here, the first one included: sign-up keeps what its
 * form said on the auth user and makes nothing, and the person who enters the
 * code lands on the create screen with those answers filled in. A workspace
 * exists only for a person who has proved the inbox that owns it.
 *
 * AND IT IS THE DOOR, for an account that arrived through a provider. The
 * email form asks the sign-up posture at /api/v1/signup before any user
 * exists; Sign in with Google makes the user first, so the posture is asked
 * here, where every first workspace is made -- and only of an account with no
 * membership yet. Somebody already inside was let in by an invitation or by
 * their first workspace, and makes the next one without a code.
 *
 * The body stays the route's own to read: the first issue's message is what
 * the create screen shows, without a field name in front of it.
 *
 * AND IT READS THE PARTNER'S COOKIE (decision 0012). A partner's link (/p/<code>) leaves one cookie; a workspace
 * made while it is there is credited to that partner by the function, in the same transaction as the tenant, and
 * only then. The route passes the code and nothing more: who is credited, and whether anyone is, is the function's
 * to decide (an unknown, paused or self code is recorded as ignored). On a database 00202 has not reached the
 * three-argument function does not exist; the call is made again without the code, and the drop is logged, so
 * either deploy order makes the workspace.
 *
 * The handle is createWorkspace in src/server/workspace/workspace-create.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "create_workspace",
  handle: ({ ctx, req }) => createWorkspace(ctx, req),
});
