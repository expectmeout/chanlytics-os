import "server-only";
/**
 * What the freedom check is asked against (contracts freedomOf), read once for a turn's cards, and the cards it lets run alone
 * (D10 of the answers canvas). The switch is off until an owner turns it on (Settings › Autonomy), so a workspace that has not
 * chosen sees nothing move: every card waits for its press as it always has. Decision 33 is why this is safe to have at all:
 * only the member's own words may run alone, and a turn that read a stranger's runs only a record.
 */
import {
  DbFailure,
  PROPOSAL_SPECS,
  freedomOf,
  localDate,
  localHour,
  openAt,
  parseTenantConfigResult,
  planPressOf,
  roleAtLeast,
  type AskProposal,
  type AskStopped,
  type FreedomWorld,
  type TenantId,
} from "@chanlytics/contracts";
import { askAloneCounts } from "@chanlytics/db/ask";
import { findConfigRow } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { load, readerContext } from "@/server/shared/reader";
import { config as configReader, facts as factsReader, policies as policiesReader } from "@/server/readers/facts";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { CALL_TIMEOUT_MS, runAct } from "./run";

/** What holds for every card of a turn. */
type TurnWorld = Omit<FreedomWorld, "may" | "takesBack" | "newWords" | "count" | "moved">;

/** The part of the world a turn reads once: its rows, its switch, its hours and today's count. */
export async function turnWorld(ctx: RouteContext, member: Member, now: Date): Promise<TurnWorld> {
  const rc = readerContext(ctx, member);
  const [row, policies, facts, counts] = await Promise.all([
    load(rc, configReader, undefined).then((r) => r.data, logAndGoOn("alone config", null)),
    load(rc, policiesReader, undefined).then((r) => r.data, logAndGoOn("alone policies", null)),
    load(rc, factsReader, undefined).then((r) => r.data, logAndGoOn("alone facts", null)),
    askAloneCounts(ctx.supabase, member.tenantId as TenantId, now).catch(
      logAndGoOn("alone counts", { today: 0, undos: 0 }),
    ),
  ]);
  const parsed = parseTenantConfigResult(row?.config ?? null);
  const cfg = parsed.ok ? parsed.config : null;
  const ask = cfg?.ask as { alone?: boolean; stopped?: AskStopped | null } | undefined;
  const tz = facts?.timezone ?? "UTC";
  const profile = cfg?.brain?.profile as { hours?: Record<string, never>; closures?: never[] } | undefined;
  const open = openHere(profile, tz, now);
  return {
    rows: Object.fromEntries((policies ?? []).map((p) => [p.class, p.mode])),
    alone: ask?.alone === true,
    stopped: !!ask?.stopped,
    open,
    aloneToday: counts.today,
    undosThisWeek: counts.undos,
  };
}

/**
 * The switch (Settings › Autonomy) and Stop everything, as the settings row says them now: read straight from the row, never
 * from a turn's cache, since a turn asks again before each act alone. A read that fails is off: nothing runs on a guess.
 */
async function readFreedom(ctx: RouteContext, tenantId: TenantId): Promise<{ alone: boolean; stopped: boolean }> {
  const read = await findConfigRow(ctx.supabase, tenantId)
    .then(({ data, error }) => {
      if (error) throw new DbFailure(error, "tenant_config");
      return { config: data?.config ?? null };
    })
    .catch(logAndGoOn("alone config", null));
  if (!read) return { alone: false, stopped: false };
  const parsed = parseTenantConfigResult(read.config);
  const ask = parsed.ok
    ? (parsed.config.ask as { alone?: boolean; stopped?: AskStopped | null } | undefined)
    : undefined;
  return { alone: ask?.alone === true, stopped: !!ask?.stopped };
}

/** Whether the business is open now, by its own hours; with no hours set, whether it is the sending day (8 to 20). */
function openHere(
  profile: { hours?: Record<string, never>; closures?: never[] } | undefined,
  tz: string,
  now: Date,
): boolean {
  const hour = localHour(tz, now);
  if (!profile?.hours || Object.keys(profile.hours).length === 0) return hour >= 8 && hour < 20;
  return openAt(profile.hours, profile.closures, localDate(tz, now), hour * 60);
}

/** Whether a card's words are new to the people here: a step that writes them, or a send on them, in a plan with no press. */
const newWordsOf = (p: AskProposal): boolean =>
  p.kind === "playbook" || p.kind === "broadcast" || p.kind === "sequence_start"
    ? p.payload?.words_shown !== true
    : false;

/** How many people a card touches, where it says. */
const countOf = (p: AskProposal): number | null => {
  const ids = p.payload?.ids ?? p.payload?.contact_ids ?? p.payload?.lead_ids;
  return Array.isArray(ids) ? ids.length : typeof p.payload?.count === "number" ? p.payload.count : null;
};

/**
 * The cards of a saved turn that the rows let run alone, run, in order, by the door a press goes through. Each that ran comes
 * back with its outcome and why it was allowed. A plan never runs alone: its press names a send, and a send waits for a person
 * until the owner has seen how the rows behave (D13, later). A failure is said on its own card, and the rest still go.
 * The day's count is read once, and each card sent to its door counts before the next is judged, as its record will: a
 * turn of several cards stops at the day's limit like a day of turns. Before each act the switch and Stop everything are
 * read again, and an act is started only with the time one call may take left before the request ends (`endsBy`, epoch ms):
 * past either, nothing more runs alone, and the cards left, already saved, wait for a press.
 */
export async function runAlone(
  ctx: RouteContext,
  req: Request,
  member: Member,
  messageId: string,
  cards: readonly AskProposal[],
  now: Date,
  endsBy: number,
): Promise<AskProposal[]> {
  const out = [...cards];
  const candidates = cards.filter((p) => !p.plan && !p.outcome && p.kind !== "memory");
  if (candidates.length === 0) return out;
  const { tenantId } = member;
  // Off for almost everyone: one read says so, and a turn pays for nothing more.
  if (!(await readFreedom(ctx, tenantId)).alone) return out;
  const world = await turnWorld(ctx, member, now);
  let ran = 0;
  for (const p of candidates) {
    const spec = PROPOSAL_SPECS[p.kind];
    const verdict = freedomOf(p, {
      ...world,
      aloneToday: world.aloneToday + ran,
      may: roleAtLeast(member.role, spec.needs),
      takesBack: !!spec.undo,
      newWords: newWordsOf(p),
      count: countOf(p),
      moved: false,
    });
    if (verdict.answer !== "run" && verdict.answer !== "hold") continue;
    // Too little of the request left for its call to end: started now, the platform could cut it off half done.
    if (endsBy - Date.now() < CALL_TIMEOUT_MS) break;
    // A stop pressed, or the switch turned off, since the turn read them: what was judged on that reading waits.
    const freedom = await readFreedom(ctx, tenantId);
    if (freedom.alone !== world.alone || freedom.stopped !== world.stopped) break;
    ran += 1;
    const answer = await runAct(ctx, req, member, {
      messageId,
      proposalId: p.id,
      by: "row",
      why: verdict.why,
    }).catch(logAndGoOn("run alone", null));
    if (!answer?.outcome) continue;
    const at = out.findIndex((c) => c.id === p.id);
    out[at] = { ...p, outcome: { ...answer.outcome, why: { reason: verdict.why, row: verdict.row } } };
  }
  return out;
}

/**
 * A card a member's yes pressed, or a plan's press, from the server (D18): its one press, every step it takes, in order. What
 * each became, for the answer to say and the card to show. Stops at the first that stops.
 */
export async function pressOnTurn(
  ctx: RouteContext,
  req: Request,
  member: Member,
  on: { messageId: string; card: AskProposal; cards: readonly AskProposal[] },
  by: "yes" | "lock_screen" | "mail",
) {
  const { messageId, card, cards } = on;
  const results: Array<{ proposalId: string; outcome: NonNullable<Awaited<ReturnType<typeof runAct>>["outcome"]> }> =
    [];
  if (!card.plan) {
    const a = await runAct(ctx, req, member, { messageId, proposalId: card.id, by });
    if (a.outcome) results.push({ proposalId: card.id, outcome: a.outcome });
    return { ok: a.ok, message: a.message, results, landed: a.landed ?? 0 };
  }
  let now = cards.filter((p) => p.plan?.id === card.plan?.id);
  const steps = planPressOf(now).steps;
  for (const step of steps) {
    const p = now.find((c) => c.plan?.step === step);
    if (!p) continue;
    const a = await runAct(ctx, req, member, { messageId, proposalId: p.id, by });
    if (a.outcome) {
      const outcome = a.outcome;
      results.push({ proposalId: p.id, outcome });
      now = now.map((c) => (c.id === p.id ? { ...c, outcome } : c));
    }
    if (!a.ok) return { ok: false, message: a.message, results, landed: a.landed ?? 0 };
  }
  return { ok: true, message: "", results, landed: 0 };
}
