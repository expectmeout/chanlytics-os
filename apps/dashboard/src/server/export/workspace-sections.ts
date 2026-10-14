import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exportSectionPages, type Database } from "@chanlytics/db";
import { signedMediaUrls } from "@/server/conversations/media";
import { teamRoster } from "@/server/workspace/team";
import { FILE_LINK_SECONDS, type BundleReaders, type BundleTeamMember } from "./export-bundle";

/**
 * The readers of the owner's copy beyond the customer record (the wiring's second audit, R14 X1 and X6): the team as the
 * roster names it, a link to each file a customer sent, and every other section, page by page, from packages/db. Each is
 * read on the owner's own session but the links, which the store signs with the platform's key for the workspace's own
 * files alone (signedMediaUrls).
 */
export function workspaceSections(
  db: SupabaseClient<Database>,
  tenantId: string,
): Pick<BundleReaders, "signFiles" | "team" | "sections"> {
  return {
    signFiles: (paths) => signedMediaUrls(tenantId, paths, FILE_LINK_SECONDS),
    team: async () => {
      const { members, invites } = await teamRoster(db, tenantId);
      return [
        ...members.map((m): BundleTeamMember => ({
          email: m.email,
          name: m.displayName || null,
          role: m.role,
          state: "member",
          since: m.joined_at,
        })),
        ...invites.map((i): BundleTeamMember => ({
          email: i.email,
          name: null,
          role: i.role,
          state: "invited",
          since: i.created_at,
          expires_at: i.expires_at,
        })),
      ];
    },
    sections: exportSectionPages(db, tenantId),
  };
}
