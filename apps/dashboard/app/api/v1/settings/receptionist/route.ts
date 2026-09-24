import { write, workspace } from "@/server/route";
import { makeFirstReceptionist } from "@/server/first-receptionist";

/**
 * POST /api/v1/settings/receptionist — set the receptionist up from what is known: Google's listing when one is
 * linked, the name typed at sign-up otherwise (server/first-receptionist.ts). Only where none is set up: answers
 * `{ made }`, false when one already was. The first run asks for it; owners only, counted with the settings.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: ({ ctx, member }) => makeFirstReceptionist(ctx, member.tenantId),
});
