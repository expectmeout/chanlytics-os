import "server-only";
import {
  AppError,
  factConflicts,
  knownForwarding,
  parseTenantConfigResult,
  resolveFacts,
  type FactConflict,
  type KnownFacts,
  type ResolvedFacts,
  type TenantConfig,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { promptPreview, type PromptPreviewDto } from "../receptionist/prompt-preview";
import { linesFor } from "../connections/lines";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as readers from "./facts";

function maskFeedUrl(u: string): string {
  return u.length <= 30 ? "…" : `${u.slice(0, 24)}…${u.slice(-6)}`;
}

/**
 * The config as this member may see it: the calendar feed address grants read access to the owner's calendar, so
 * only an owner sees it whole; anyone else learns that one is set. The read and the write's answer both say it this
 * way: a partner's save (0012) answered with the whole address before.
 */
export function feedVisibleTo<T extends { calendar?: { ical_url: string } | null }>(role: string, cfg: T): T {
  return role === "owner" || !cfg.calendar
    ? cfg
    : { ...cfg, calendar: { ical_url: maskFeedUrl(cfg.calendar.ical_url) } };
}

/**
 * A save by someone shown the masked feed address (anyone but the owner) sends the mask back with the rest of the
 * config: that is the stored address, unchanged, and is put back before the write is judged. A partner saving hours
 * was refused on "calendar.ical_url" because the mask is not an address. A different address is a new feed, and is
 * theirs to set.
 */
export function withHiddenFeed(role: string, incoming: unknown, stored: unknown): unknown {
  if (role === "owner" || !incoming || typeof incoming !== "object") return incoming;
  const storedUrl = (stored as { calendar?: { ical_url?: unknown } } | null)?.calendar?.ical_url;
  const sent = (incoming as { calendar?: { ical_url?: unknown } }).calendar?.ical_url;
  if (typeof storedUrl !== "string" || typeof sent !== "string" || sent !== maskFeedUrl(storedUrl)) return incoming;
  return { ...(incoming as Record<string, unknown>), calendar: (stored as { calendar: unknown }).calendar };
}

/**
 * What the platform knows about this workspace, independent of what was typed.
 *
 * Resolved HERE rather than on the client: the server can read the channel rows
 * and the Google listing under RLS in one round trip, while the browser only
 * ever had a listing DTO with no address on it. One place that knows, so there
 * is one answer — which is the whole point of facts.ts.
 */
export async function knownFacts(ctx: RouteContext, tenantId: string): Promise<KnownFacts> {
  const [ws, ch, gl, lines] = await Promise.all([
    ctx.supabase.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    ctx.supabase.from("tenant_channels").select("kind, number_e164, status").eq("tenant_id", tenantId),
    ctx.supabase.from("google_listings").select("name, address").eq("tenant_id", tenantId).maybeSingle(),
    // The number the business keeps and forwards: the same rows, read the same way, as Setup's line rows. A failed
    // read is no forwarding, on purpose: the settings read and a save still go through, and a transfer number is
    // then judged against the line alone, as it was before forwarding was known.
    linesFor(ctx.supabase, tenantId).catch(() => []),
  ]);
  // None of these is worth failing the settings read for. A workspace whose
  // channels could not be listed sees its typed values unresolved, which is
  // exactly where it was before any of this existed.
  return {
    workspace: ws.error ? null : ws.data,
    channels: ch.error ? [] : (ch.data ?? []),
    listing: gl.error ? null : gl.data,
    forwarding: knownForwarding(lines),
  };
}

/** GET settings' answer: the two shapes, told apart by `configBroken`, which the client narrows on. */
type SettingsRead =
  | {
      config: TenantConfig;
      version: number;
      role: ReaderContext["role"];
      configBroken: false;
      facts: ResolvedFacts;
      conflicts: FactConflict[];
      prompt: PromptPreviewDto | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }
  | { config: null; version: number; role: ReaderContext["role"]; configBroken: true; issues: string[] };

/**
 * GET settings, as the route answers it: the tenant's config, with the version the client must echo back on write, the
 * member's role, and -- where the parser takes the config -- what the platform knows beside what was typed, anything
 * the two disagree on, and the prompt the receptionist is told, composed on the turn's clock. The route's body, moved
 * here whole. The configuration row is the turn's one read of it (readers/facts.ts config); a workspace with none is
 * the route's 404. The prompt preview reads the calendar feed and the Autonomy rows itself, and nothing keeps it: a
 * question about the hours reads the facts (Ask's get_settings), never this. Not a row a citation names.
 */
export const settings: Reader<undefined, SettingsRead> = {
  name: "settings",
  async read(rc) {
    const row = (await load(rc, readers.config, undefined)).data;
    if (!row) throw new AppError("not_found", "Workspace has no configuration row.", 404);
    // A config the parser refuses is a different fact from "nothing configured".
    // Collapsing both to {} showed a broken workspace the "no receptionist yet"
    // invitation — and the form behind it would have saved over the broken row,
    // deleting whatever it still held. The edge already tells the two apart
    // (tenant-runtime's configBroken); this is the same answer for the pane.
    const parsed = parseTenantConfigResult(row.config);
    if (parsed.ok) {
      // The calendar feed address grants read access to the owner's calendar;
      // only an owner sees it whole. Anyone else learns that one is set.
      const cfg = parsed.config;
      const visible = feedVisibleTo(rc.role, cfg);
      const known = await knownFacts(rc.ctx, rc.tenantId);
      const facts = resolveFacts(cfg.brain ?? null, known);
      // What the receptionist is told, composed here with the inputs the browser
      // cannot see (the Autonomy rows, these facts, the closures, the calendar's
      // openings), so the pane's card is the prompt and not a rendering of it.
      // The feed address is read here and stays here.
      const prompt = await promptPreview(
        rc.ctx,
        rc.tenantId,
        { brain: cfg.brain ?? null, calendarUrl: cfg.calendar?.ical_url ?? null },
        known,
        rc.now,
      );
      return {
        data: {
          config: visible,
          version: row.version,
          role: rc.role,
          configBroken: false as const,
          // What each fact resolves to and where it came from, plus anything that
          // disagrees. The pane shows a source beside every value instead of a
          // column of identical-looking text boxes, and a serious disagreement --
          // a published number that is not the line being answered -- is said out
          // loud rather than sitting in a document nobody compares.
          facts,
          conflicts: factConflicts(facts),
          prompt,
          // Who last changed it and when (00085): the Business card says so.
          updatedBy: row.updated_by ?? null,
          updatedAt: row.updated_at ?? null,
        },
        rows: [],
        stamp: stamp(),
      };
    }
    // `as const` on both: the two answers are told apart by this one flag, and the client narrows on it.
    return {
      data: {
        config: null,
        version: row.version,
        role: rc.role,
        configBroken: true as const,
        issues: parsed.issues,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};
