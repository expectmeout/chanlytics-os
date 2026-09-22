import "server-only";
import {
  describeNow,
  describeOpenings,
  freeWindows,
  parseIcs,
  resolveSystemPrompt,
  seasonHorizon,
  type BrainConfig,
  type KnownFacts,
} from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { loadFeed } from "@/server/ask/openings";

/**
 * What the receptionist is told, composed HERE for the Business pane.
 *
 * The pane's card is worth having only because it is not a rendering of the
 * prompt: it is the prompt, from the same function the edge calls. The
 * browser used to call that function itself, and could not see four of its
 * inputs -- the Autonomy rows (Booking and FAQ under "ask" become rules), the
 * platform's own facts (the channel rows it provisioned, the listing Google
 * verified), the closures the clock states, and the openings from the
 * calendar feed, whose address never leaves the server. So the card said
 * "every WhatsApp message, word for word" over a prompt missing its rules.
 *
 * Now the settings read composes it, argument for argument as
 * whatsapp/inbound.ts and lib/call-start.ts do, and the browser only shows
 * it. `now` is kept apart from the channel texts because the edge sends it
 * apart: an uncached block rebuilt every message, so the cached profile
 * above it survives.
 */
export interface PromptPreviewDto {
  /** The cached block, per channel: what resolveSystemPrompt hands the model. */
  whatsapp: string;
  voice: string;
  /** The uncached block, rebuilt for every message: the clock in the business's zone with its closures, then the openings from the calendar. */
  now: string;
  tz: string | null;
  /**
   * What the two texts were resolved with besides the brain and the zone: the
   * Autonomy rows and what the platform knows. The Business tab resolves a
   * fold's unsaved draft with them (legacy-bridge/business-tab.ts), so what a
   * fold says the receptionist will be told has the rules and the provisioned
   * number the edge would give it.
   */
  inputs: { policy: Record<string, { mode: string }>; known: KnownFacts };
}

export interface PromptFacts {
  tz: string | null;
  /** The workspace's Autonomy rows, class to mode. */
  policy: Record<string, { mode: string }>;
  known: KnownFacts;
  /** The openings block, or null when the receptionist has none to state. */
  openings: string | null;
}

/** Pure: the edge's two calls, with the edge's arguments, and the block it appends. */
export function composePromptPreview(brain: BrainConfig, facts: PromptFacts, now = new Date()): PromptPreviewDto {
  const clock = describeNow(facts.tz, now, brain.profile?.closures);
  return {
    whatsapp: resolveSystemPrompt(brain, "whatsapp", facts.tz, now, facts.policy, facts.known),
    voice: resolveSystemPrompt(brain, "voice", facts.tz, now, facts.policy, facts.known),
    now: `${clock}${facts.openings ? `\n\n${facts.openings}` : ""}`,
    tz: facts.tz,
    inputs: { policy: facts.policy, known: facts.known },
  };
}

/**
 * The openings block as the edge composes it (apps/edge/lib/calendar/availability.ts,
 * openingsFor): the feed's busy blocks against the hours, closures and
 * booking rules, in the business's zone. Null when there is no feed, no
 * profile or no zone, and when the feed cannot be read -- the receptionist
 * then says nothing about open times, and so does the preview.
 */
export async function openingsBlock(
  tenantId: string,
  cfg: { url: string | null; brain: BrainConfig | null; tz: string | null },
  now = new Date(),
): Promise<string | null> {
  const profile = cfg.brain?.profile;
  if (!cfg.url || !profile || !cfg.tz) return null;
  try {
    const feed = await loadFeed(tenantId, cfg.url);
    if (!feed.text) return null;
    const rules = profile.booking_rules ?? null;
    const daysAhead = rules?.max_days_ahead ?? 14;
    // The rule the edge reads the same feed with, by name rather than by a
    // copy of its arithmetic: this expression and the edge's were identical
    // byte for byte, and nothing said they were meant to be.
    const parsed = parseIcs(feed.text, cfg.tz, { horizon: seasonHorizon(now, daysAhead) });
    const openings = freeWindows({
      hours: profile.hours,
      closures: profile.closures,
      tz: cfg.tz,
      busy: parsed.busy,
      rules,
      now,
    });
    return describeOpenings(openings, cfg.tz, { daysAhead });
  } catch (e) {
    console.error(
      "prompt_preview_openings_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  }
}

/**
 * The preview for one workspace, or null when there is nothing true to show:
 * no receptionist configured, a config the composer refuses, or an Autonomy
 * matrix that could not be read. That last one is null on purpose -- a prompt
 * composed without its rules is a wrong prompt, not a partial one, and the
 * card would state it as what the receptionist is told.
 */
export async function promptPreview(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  cfg: { brain: BrainConfig | null | undefined; calendarUrl: string | null },
  known: KnownFacts,
  now = new Date(),
): Promise<PromptPreviewDto | null> {
  const brain = cfg.brain ?? null;
  if (!brain) return null;
  const tz = known.workspace?.timezone ?? null;
  let policy: Record<string, { mode: string }>;
  try {
    policy = Object.fromEntries((await listPolicies(ctx.supabase, tenantId)).map((p) => [p.class, { mode: p.mode }]));
  } catch (e) {
    console.error(
      "prompt_preview_policy_unreadable",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  }
  const openings = await openingsBlock(tenantId, { url: cfg.calendarUrl, brain, tz }, now);
  try {
    return composePromptPreview(brain, { tz, policy, known, openings }, now);
  } catch (e) {
    // A config the composer refuses is a real answer, and the card says nothing rather than something else.
    console.error(
      "prompt_preview_refused",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  }
}
