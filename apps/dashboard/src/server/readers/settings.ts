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
  type RehearsalDto,
  ASK_MEMORY_LIMITS,
  REACH_OUT_DRAFTS_PER_DAY,
  REACH_OUT_MONTH_EMAILS,
  mailboxSendsNow,
  mailboxWords,
  parseTenantConfig,
  type MailboxConnectionDto,
  type ReachOutChainDto,
  type ReachOutSettingsDto,
  type ReachOutSettingsMailbox,
  type ReachOutSettingsSequence,
} from "@chanlytics/contracts";
import { findRehearsalById } from "@chanlytics/db/facts";
import { countSentByStep, readMonthSent, reviewLinkOf } from "@chanlytics/db/campaigns";
import { askMemoryLines } from "@chanlytics/db/ask";
import { listPolicies } from "@chanlytics/db/workspace";
import type { RouteContext } from "../shared/with-route";
import { findPromptPreview, type PromptPreviewDto } from "../receptionist/prompt-preview";
import { listLines } from "../connections/lines";
import { listMailboxConnectionsWithDays } from "../connections/mailbox-connections";
import { listChains } from "../campaigns/reach-outs/reach-outs";
import { log } from "../shared/log";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";
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
 * is one answer — which is the whole point of facts.ts. With it, from the same row, whether the workspace is ours
 * (00469): only ours makes previews for its leads (decision 0079).
 */
export async function getKnownFacts(ctx: RouteContext, tenantId: string): Promise<KnownFacts & { ours: boolean }> {
  const [ws, ch, gl, lines] = await Promise.all([
    ctx.supabase.from("tenants").select("name, timezone, ours").eq("id", tenantId).maybeSingle(),
    ctx.supabase.from("tenant_channels").select("kind, number_e164, status").eq("tenant_id", tenantId),
    ctx.supabase.from("google_listings").select("name, address").eq("tenant_id", tenantId).maybeSingle(),
    // The number the business keeps and forwards: the same rows, read the same way, as Setup's line rows. A failed
    // read is no forwarding, on purpose: the settings read and a save still go through, and a transfer number is
    // then judged against the line alone, as it was before forwarding was known.
    listLines(ctx.supabase, tenantId).catch(() => []),
  ]);
  // None of these is worth failing the settings read for. A workspace whose
  // channels could not be listed sees its typed values unresolved, which is
  // exactly where it was before any of this existed.
  return {
    workspace: ws.error || !ws.data ? null : { name: ws.data.name, timezone: ws.data.timezone },
    ours: !ws.error && ws.data?.ours === true,
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
      /** Whether the Google listing keeps a review link (db reviewLinkOf, 00415): never the link itself. */
      review_link: boolean;
      /** Whether this workspace makes previews for its leads (decision 0079): ours alone. */
      previews: boolean;
    }
  | { config: null; version: number; role: ReaderContext["role"]; configBroken: true; issues: string[] };

/**
 * GET settings, as the route answers it: the tenant's config, with the version the client must echo back on write, the
 * member's role, and -- where the parser takes the config -- what the platform knows beside what was typed, anything
 * the two disagree on, the prompt the receptionist is told, composed on the turn's clock, and whether the Google listing
 * keeps a review link, which the composers read as they read the booking link from the config. The route's body, moved
 * here whole. The configuration row is the turn's one read of it (readers/facts.ts config); a workspace with none is
 * the route's 404. The prompt preview reads the calendar feed and the Autonomy rows itself, and nothing keeps it: a
 * question about the hours reads the facts (Ask's workspace.settings), never this. Not a row a citation names.
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
      const [known, reviewLink] = await Promise.all([
        getKnownFacts(rc.ctx, rc.tenantId),
        // Whether the listing keeps a review link: the composers offer it to a review-link slot, and the review ask
        // with it, only where it does, as they offer the booking link only where one is on file. A read that fails is
        // none here, as a fact above is: the settings read never fails for it.
        reviewLinkOf(rc.ctx.supabase, rc.tenantId).catch(() => null),
      ]);
      const facts = resolveFacts(cfg.brain ?? null, known);
      // What the receptionist is told, composed here with the inputs the browser
      // cannot see (the Autonomy rows, these facts, the closures, the calendar's
      // openings), so the pane's card is the prompt and not a rendering of it.
      // The feed address is read here and stays here.
      const prompt = await findPromptPreview(
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
          review_link: reviewLink !== null,
          // Whether it makes previews (decision 0079): the step editor offers {{their preview}} where it does.
          previews: known.ours,
        },
        rows: [],
        stamp: readerStamp(),
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
      stamp: readerStamp(),
    };
  },
};

/**
 * One rehearsal of the workspace (decision 0069): its words so far or whole, its end, its review and the fixes kept from
 * it, under the member's own session. The page reads it every two seconds while its call runs, and once at its end. No
 * row a citation names: a rehearsal is the owner's own practice, never something Ask cites.
 */
export const rehearsal: Reader<{ id: string }, RehearsalDto> = {
  name: "rehearsal",
  async read(rc, { id }) {
    const result = await findRehearsalById(rc.ctx.supabase, rc.tenantId, id);
    if (!result) throw new AppError("not_found", "Rehearsal not found.");
    const data: RehearsalDto = {
      id: result.id,
      kind: result.kind,
      started_at: result.started_at,
      ended_at: result.ended_at,
      seconds: result.seconds,
      end_reason: result.end_reason,
      transcript: result.transcript,
      config_version: result.config_version,
      review: result.review,
      fixes: result.fixes,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/* ------------------------------------------------------------ How it reaches out (decision 0113) */

/** A chain's first step where it is an email with words: what Try it writes, and what the drafter reads. */
const firstEmailOf = (chain: ReachOutChainDto) => {
  const first = chain.steps[0];
  return first && !first.hand && first.body.trim() ? first : null;
};

/** The newest running sequence to leads whose first step is an email: Try it's words, and Signs as' first guess. */
export function newestLeadSequence(chains: readonly ReachOutChainDto[]): ReachOutSettingsSequence | null {
  const chain = chains
    .filter((c) => c.state === "running" && firstEmailOf(c))
    .reduce<ReachOutChainDto | null>((best, c) => (!best || c.created_at > best.created_at ? c : best), null);
  const first = chain ? firstEmailOf(chain) : null;
  if (!chain || !first) return null;
  const second = chain.steps[1];
  return {
    root_id: chain.root_id,
    name: chain.name,
    search_id: chain.search?.id ?? null,
    include_unconfirmed: chain.include_unconfirmed,
    signed_by: chain.signed_by,
    signs_with: chain.signs_with ?? "name",
    mailbox_id: chain.mailbox_ids[0] ?? null,
    first: { subject: first.subject, body: first.body },
    next:
      second && !second.hand && second.after_days !== null
        ? { after_days: second.after_days, body: second.body }
        : null,
  };
}

/** A step's words, subject and body, as a claim is looked for in them. */
const wordsOfStep = (step: ReachOutChainDto["steps"][number]): string => `${step.subject ?? ""}\n${step.body}`;

/** The email steps whose words carry one of the claims, word for word: the only steps worth counting. */
export function stepsCarrying(claims: readonly string[], chains: readonly ReachOutChainDto[]): string[] {
  const texts = claims.map((c) => c.trim()).filter(Boolean);
  return chains.flatMap((c) =>
    c.steps.filter((s) => !s.hand && texts.some((t) => wordsOfStep(s).includes(t))).map((s) => s.id),
  );
}

/** Each claim with the emails sent from steps whose words carry it. */
export function claimCounts(
  claims: readonly string[],
  chains: readonly ReachOutChainDto[],
  sent: ReadonlyMap<string, number>,
): ReachOutSettingsDto["claims"] {
  return claims.map((text) => {
    const t = text.trim();
    const sends = chains
      .flatMap((c) => c.steps)
      .filter((s) => !s.hand && t && wordsOfStep(s).includes(t))
      .reduce((n, s) => n + (sent.get(s.id) ?? 0), 0);
    return { text, sends };
  });
}

/** The mailbox Where it sends from shows: the first that sends now, else the first; as Connections says it. */
export function mailboxShown(
  mailboxes: readonly MailboxConnectionDto[],
  nowMs: number,
  tz: string,
): ReachOutSettingsMailbox | null {
  const live = mailboxes.filter((m) => m.state !== "removed");
  const shown = live.find((m) => mailboxSendsNow(m, nowMs)) ?? live[0];
  if (!shown) return null;
  const words = mailboxWords(shown, nowMs, tz);
  return {
    address: shown.address,
    provider: shown.provider,
    pill: words.pill,
    tone: words.tone,
    day: words.day,
    ramp: words.ramp,
  };
}

/** One part of the read, which may fail alone: the page draws the rest, and the failure is logged. */
async function partOf<T>(read: Promise<T>, part: string, tenantId: string, otherwise: T): Promise<T> {
  try {
    return await read;
  } catch (e) {
    log.error("reach_out_settings_read_failed", { tenant_id: tenantId, read: part, error: e });
    return otherwise;
  }
}

/**
 * GET settings/reach-out: what How it reaches out shows beyond the config. The mailbox as Connections says it, the month's
 * first emails against their share, the claims' counts, the lines Ask learned from how the owner writes, the newest
 * running sequence to leads, and Autonomy's reply mode, which a lead's drafted answer follows.
 */
export const reachOutSettings: Reader<undefined, ReachOutSettingsDto> = {
  name: "reach_out_settings",
  async read(rc) {
    const db = rc.ctx.supabase;
    const t = rc.tenantId;
    const [row, facts, mailboxes, sent, memory, chains, policies] = await Promise.all([
      partOf(load(rc, readers.config, undefined), "config", t, null),
      partOf(load(rc, readers.facts, undefined), "facts", t, null),
      partOf(listMailboxConnectionsWithDays(db, t, rc.now), "mailboxes", t, []),
      partOf(readMonthSent(db, t, rc.now), "month", t, 0),
      partOf(askMemoryLines(db, t, ASK_MEMORY_LIMITS.liveMax), "memory", t, []),
      partOf(listChains(rc.ctx, t), "chains", t, []),
      partOf(listPolicies(db, t), "policies", t, []),
    ]);
    const claims = parseTenantConfig(row?.data?.config)?.reach_out?.proof ?? [];
    const counted = await partOf(countSentByStep(db, t, stepsCarrying(claims, chains)), "counts", t, new Map());
    return {
      data: {
        mailbox: mailboxShown(mailboxes, rc.now.getTime(), facts?.data.timezone ?? "UTC"),
        month: { sent, of: REACH_OUT_MONTH_EMAILS },
        by_hand_per_day: REACH_OUT_DRAFTS_PER_DAY,
        claims: claimCounts(claims, chains, counted),
        voice: memory.filter((m) => m.source === "learned").map((m) => ({ id: m.id, text: m.text })),
        sequence: newestLeadSequence(chains),
        reply_mode: policies.find((p) => p.class === "reply")?.mode ?? "ask",
      },
      rows: [],
      stamp: readerStamp(),
    };
  },
};
