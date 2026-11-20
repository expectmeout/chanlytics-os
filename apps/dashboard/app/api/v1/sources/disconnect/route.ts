import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { disconnectSource } from "@/server/files/sources";

/**
 * POST /api/v1/sources/disconnect — Google Drive is disconnected: Chanlytics drops its key at once, nothing new comes
 * in, and what came in stays. `{ revoked }` says whether Google took the grant back, which it does not while a mailbox
 * or a Business Profile of the same Google account is connected here. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({}),
  handle: ({ ctx, member }) => disconnectSource(ctx, member),
});
