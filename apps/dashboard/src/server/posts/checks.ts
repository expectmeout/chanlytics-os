/**
 * The checks a placement is held to before it is approved (the content loop PRD's 6.1 and 6.2), read once for both moments
 * that come before a send: AI's card as it proposes one, and the owner's press. The facts are read here (who in the file
 * has not said yes, whether AI is paused, what the business says of itself now) and judged by the one evaluator
 * (packages/core content/policy); the send's own check reads them again at the edge. Every refusal comes at once, in the
 * owner's words with the one thing to do.
 */
import "server-only";
import {
  goodUntilOf,
  notesInForce,
  parseTenantConfig,
  type InstagramPostable,
  type OwnersFact,
  type PieceIntent,
  type PostKind,
  type PostPlace,
  type TenantId,
} from "@chanlytics/contracts";
import { evaluate, verdictWords } from "@chanlytics/core";
import { readRightsGap } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** One placement as it is asked for: where, as what, with which words, when (null: as it is pressed). */
export interface PlacementAsked {
  place: PostPlace;
  kind: PostKind;
  caption: string | null;
  when: string | null;
}

/** What the checks read of the made file: what it is, and where its yes for posts stands on the file itself. */
export interface CheckedFile {
  id: string;
  kind: string;
  mime?: string | null | undefined;
  bytes: number | null;
  seconds: number | null;
  yes_for?: readonly string[] | undefined;
  yes_back?: readonly string[] | undefined;
}

/** What is being asked, and what its caller already read. */
interface PlacementsAsked {
  tenantId: TenantId;
  zone: string;
  file: CheckedFile;
  placements: readonly PlacementAsked[];
  intent: PieceIntent | null;
  facts: readonly OwnersFact[];
  /** Whether each place's connection takes a post now. */
  connections: Readonly<Partial<Record<PostPlace, InstagramPostable>>>;
  /** Whether everything is stopped for the workspace. */
  stopped: boolean;
  /** The workspace's configuration as stored: read only where the intent names an offer or a service. */
  config: () => Promise<unknown>;
}

/** What the business says of itself now, a line each: its notes in force, and its services with what they cost. */
function businessSays(config: unknown, zone: string): { says: string[]; services: string[] } {
  const profile = parseTenantConfig(config)?.brain?.profile;
  const services = profile?.services ?? [];
  return {
    says: [
      ...notesInForce(profile?.notes, zone, new Date()).map((note) => `${note.title} ${note.text}`),
      ...services.map((service) => `${service.name} ${service.price_note ?? ""}`),
    ],
    services: services.map((service) => service.name),
  };
}

/** The latest time a placement is asked for, as the moment its reason is judged at; now where every one goes now. */
const latestOf = (placements: readonly PlacementAsked[], nowMs: number): number =>
  Math.max(nowMs, ...placements.map((p) => (p.when ? Date.parse(p.when) : nowMs)));

/** Every refusal that stands in the way of these placements, as one line of the owner's words; empty where none does. */
export async function readPlacementRefusals(
  db: SupabaseClient<Database>,
  placements: PlacementsAsked,
): Promise<string> {
  const { file, intent, zone } = placements;
  const nowMs = Date.now();
  const leans = !!intent?.offer || !!intent?.service;
  const [gap, business] = await Promise.all([
    readRightsGap(db, placements.tenantId, file.id),
    leans ? placements.config().then((config) => businessSays(config, zone)) : { says: [], services: [] },
  ]);
  const whole = evaluate({
    rights: { takenBack: !file.yes_for?.includes("post") && !!file.yes_back?.includes("post"), gap },
    automation: { stopped: placements.stopped, pressedBy: "owner" },
    reason: {
      intent,
      goodUntil: goodUntilOf(intent, zone),
      atMs: latestOf(placements.placements, nowMs),
      nowMs,
      zone,
      ...business,
      facts: placements.facts,
      moment: "before",
    },
  });
  const each = placements.placements.map((p) =>
    evaluate({
      publishing: {
        place: p.place,
        kind: p.kind,
        fileKind: file.kind,
        connection: placements.connections[p.place] ?? "not_connected",
        caption: p.caption,
        video:
          file.kind === "video"
            ? { mime: file.mime ?? null, bytes: file.bytes, ms: file.seconds === null ? null : file.seconds * 1000 }
            : null,
      },
    }),
  );
  return [...new Set([whole, ...each].map(verdictWords).filter(Boolean))].join(" ");
}
