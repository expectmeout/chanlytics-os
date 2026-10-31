import { z } from "zod";
import { PreviewTokenSchema } from "@chanlytics/contracts";
import { write, account } from "@/server/route";
import { claimPreviewFor } from "@/server/previews/claim";

/**
 * POST /api/v1/preview-claims — Make it mine (decision 0079, L4): a lead's own receptionist made a workspace of the
 * person signed in, who becomes its owner.
 *
 * Declared on the account with no role to name, as POST workspaces/create is, and for its reason: there is no
 * workspace the caller belongs to yet; this is the write that makes them a member of one. The authority is the link's
 * token and the session together, and the function reads the claimer from auth.uid() rather than anything sent
 * (preview_claim, 00497). It is no door of the sign-up posture's: a preview's link stands for an invite code. The
 * bucket is a new workspace's, for what it is.
 *
 * The handle is claimPreviewFor in src/server/previews/claim.ts.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "create_workspace",
  input: z.object({ token: PreviewTokenSchema }).strict(),
  handle: ({ ctx, input }) => claimPreviewFor(ctx, input.token),
});
