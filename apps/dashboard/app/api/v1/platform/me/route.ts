import { read, platform } from "@/server/route";
import { consoleMe } from "@/server/platform/console";

/**
 * GET /api/v1/platform/me — who is asking, to the Console (decision 0066): their name, address and role, which the
 * frame draws and every screen asks before it draws an act. On the platform scope, so a session that is not staff is
 * told "No such page" and one that has not shown its second factor is sent to the second step.
 */
export const GET = read({
  scope: platform,
  handle: ({ office }) => Promise.resolve(consoleMe(office)),
});
