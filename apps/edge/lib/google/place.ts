/**
 * Google behind the place adapter (the content loop PRD's section 7, pass 1b): a post on the business's own profile, and
 * its take-down, through the connection's own token (google/local-posts.ts), read into the outcomes every place shares.
 * Google has no draft of its own and keeps nothing a send with no answer could be asked after, so the adapter has no
 * `prepare`, `preparedState` or `status`; its column in PLACE_CAPABILITIES stays as the code holds it until a customer's
 * listing proves it (Chanlytics meets nobody in person and has no listing of its own).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILE_WORDS, PLACE_CAPABILITIES, type PlaceAdapter, type TenantId } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db/types";
import { postOnProfile, unpostOnProfile } from "./local-posts.js";

type Db = SupabaseClient<Database>;

const GOOGLE_PLACE_SAYS = FILE_WORDS.google;
const NO_ANSWER_KEPT = { status: null, json: null };

/** Google's adapter, for one made file of one workspace, as the member who approved it. */
export function googlePlace(db: Db, at: { tenantId: TenantId; fileId: string; by: string | null }): PlaceAdapter {
  return {
    place: "google",
    capabilities: PLACE_CAPABILITIES.google,

    async publish(post) {
      const answer = await postOnProfile(db, at.tenantId, {
        fileId: at.fileId,
        by: at.by,
        post: {
          summary: post.caption ?? "",
          photoUrl: post.mediaUrl,
          languageCode: post.language ?? "en",
          call: post.book,
        },
      });
      if (answer.ok)
        return {
          is: "sent",
          media: { externalId: answer.name, permalink: answer.search_url, publishedAt: null },
          kept: { status: 200, json: null },
          seen: false,
        };
      const lost = answer.error === "not_connected" || answer.error === "no_token";
      const words = lost
        ? GOOGLE_PLACE_SAYS.heldNoConnection
        : `${GOOGLE_PLACE_SAYS.refused}${answer.detail ? ` ${answer.detail.slice(0, 200)}` : ""}`;
      return {
        is: "refused",
        refusal: { words, code: null, subcode: null, busy: "busy" in answer && !!answer.busy, connectionLost: lost },
        kept: NO_ANSWER_KEPT,
      };
    },

    async takeDown(post) {
      if (!post.externalId) return { outcome: "not_possible", said: GOOGLE_PLACE_SAYS.refused, kept: NO_ANSWER_KEPT };
      const answer = await unpostOnProfile(db, at.tenantId, { fileId: at.fileId, by: at.by, name: post.externalId });
      if (answer.ok) return { outcome: "done", said: null, kept: NO_ANSWER_KEPT };
      if (answer.error === "not_connected" || answer.error === "no_token")
        return { outcome: "needs_person", said: GOOGLE_PLACE_SAYS.heldNoConnection, kept: NO_ANSWER_KEPT };
      if (answer.error === "not_found")
        return { outcome: "not_possible", said: GOOGLE_PLACE_SAYS.refused, kept: NO_ANSWER_KEPT };
      return {
        outcome: "blocked",
        said: answer.detail?.slice(0, 300) ?? GOOGLE_PLACE_SAYS.refused,
        kept: NO_ANSWER_KEPT,
      };
    },
  };
}
