import { write, workspace } from "@/server/route";
import { receptionistFromWhatIsKnown } from "@/server/first-receptionist";

/**
 * POST /api/v1/settings/receptionist — the receptionist from what is known (server/first-receptionist.ts): set up
 * where there is none, from Google's listing when one is linked and the name typed at sign-up otherwise; filled from
 * Google where one states none of what the listing says. Answers `{ wrote }`, false when there was nothing to add.
 * The first run asks for it; owners only, counted with the settings.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: ({ ctx, member }) => receptionistFromWhatIsKnown(ctx, member.tenantId),
});
