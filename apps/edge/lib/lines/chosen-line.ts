/**
 * The number the workspace chose, started by the server once its trial or plan has (decision 0091, the onboarding PRD
 * of 3 Nov 2026: money taken is service started, whether or not the tab that paid is still open). The first run's Where
 * it answers keeps the choice on the workspace (setup_choices, 00513); Stripe's webhook turning billing to trialing or
 * active asks this, and the lines sweep asks it again every quarter hour for any paid workspace with a choice and no
 * line, so a webhook that could not start it is never the end of it.
 *
 * A new number picked is bought as picked; a number kept is forwarded to one the receptionist owns, bought in its area
 * code (the first the provider offers: customers never see it). A number moved, and a choice not to take calls, start
 * nothing here: a person files a move, and a workspace without calls needs no number. One line a workspace: a line that
 * stands or failed is left to its own row. The decision is planChosenLine's, over facts, so the tests run it in memory.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  areaCodeOf,
  callsNotByPhone,
  maySpend,
  setupPhoneWantOf,
  type BillingMode,
  type BillingStatus,
  type SetupPhoneWant,
} from "@chanlytics/contracts";
import { findSetupAsked, setupChoicesOf } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import { scheduleJob } from "@chanlytics/jobs";
import { lineProviderFromEnv, type LineProviderChoice } from "./lines.js";
import { liveLineOf, planBuy, provisionJob } from "./ops/search-buy.js";
import { insertLineRow, listLinesOf } from "@chanlytics/db/lines";
import { findPlanStanding } from "@chanlytics/db/billing";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What starting the chosen number came to: started, already there, or why nothing was started. */
type ChosenLineOutcome =
  | { kind: "started"; lineId: string; number: string }
  | { kind: "stands" }
  | {
      kind: "none";
      why: "no_choice" | "no_calls" | "moving" | "may_not_spend" | "no_provider" | "no_number" | "failed";
      detail?: string;
    };

/** What to do, from the facts: buy this number, search this area code for one, or nothing and why. */
type ChosenLinePlan =
  | { kind: "buy"; number: string; areaCode: number | null }
  | { kind: "search"; areaCode: number }
  | { kind: "stands" }
  | { kind: "none"; why: "no_choice" | "no_calls" | "moving" | "may_not_spend" | "no_number" };

export function planChosenLine(fields: {
  want: SetupPhoneWant | null;
  /** The business chose Not by phone (callsNotByPhone). */
  noCalls: boolean;
  billing: { mode: BillingMode; status: BillingStatus } | null;
  lines: readonly { voice_state: string }[];
  /** A person was asked for a line or a move: theirs, not this. */
  asked: boolean;
}): ChosenLinePlan {
  if (liveLineOf([...fields.lines]) || fields.lines.some((l) => l.voice_state === "failed")) return { kind: "stands" };
  if (fields.noCalls) return { kind: "none", why: "no_calls" };
  if (!fields.want) return { kind: "none", why: "no_choice" };
  if (fields.want.way === "move" || fields.asked) return { kind: "none", why: "moving" };
  if (!fields.billing || !maySpend(fields.billing.mode, fields.billing.status, "number"))
    return { kind: "none", why: "may_not_spend" };
  const area = areaCodeOf(fields.want.number);
  if (fields.want.way === "new")
    return { kind: "buy", number: fields.want.number, areaCode: area ? Number(area) : null };
  return area ? { kind: "search", areaCode: Number(area) } : { kind: "none", why: "no_number" };
}

/** The ports the start needs beyond the database: the provider (search and its name), and the clock. */
interface ChosenLinePorts {
  choice: LineProviderChoice | null;
  now: () => Date;
}

/**
 * Start the chosen number for one workspace: read the choice, the billing row, its lines and whether a person was asked,
 * plan, and for a buy insert the line at the saga's first step and queue its saga (line_provision), as the owner's own
 * Go live would. Never throws: what went wrong is the outcome's `detail`, for the caller's log.
 */
export async function startChosenLine(
  db: Db,
  tenantId: TenantId,
  ports: ChosenLinePorts = { choice: lineProviderFromEnv(), now: () => new Date() },
): Promise<ChosenLineOutcome> {
  try {
    const [choices, billing, lines, asked] = await Promise.all([
      setupChoicesOf(db, tenantId),
      findPlanStanding(db, tenantId),
      listLinesOf(db, tenantId),
      findSetupAsked(db, tenantId, ["line", "port"]),
    ]);
    if (billing.error) throw new Error(billing.error.message);
    if (lines.error) throw new Error(lines.error.message);
    if (asked.error) throw new Error(asked.error.message);
    const plan = planChosenLine({
      want: choices ? setupPhoneWantOf({ phone: choices.phone }) : null,
      noCalls: !!choices && callsNotByPhone({ phone: choices.phone }),
      billing: billing.data ? { mode: billing.data.mode, status: billing.data.status } : null,
      lines: lines.data ?? [],
      asked: (asked.data ?? []).length > 0,
    });
    if (plan.kind === "stands") return { kind: "stands" };
    if (plan.kind === "none") return { kind: "none", why: plan.why };
    if (!ports.choice) return { kind: "none", why: "no_provider" };
    let number: string;
    let areaCode: number | null;
    if (plan.kind === "search") {
      const offered = await ports.choice.provider.searchLocal(ports.choice.master, {
        areaCode: plan.areaCode,
        limit: 1,
      });
      if (!offered[0]) return { kind: "none", why: "no_number", detail: `nothing offered in ${plan.areaCode}` };
      number = offered[0].e164;
      areaCode = plan.areaCode;
    } else {
      number = plan.number;
      areaCode = plan.areaCode;
    }
    const now = ports.now();
    const buy = planBuy({
      tenantId,
      provider: ports.choice.name,
      number,
      areaCode,
      others: lines.data ?? [],
      now,
    });
    if (buy.kind === "refuse") return { kind: "stands" };
    const ins = await insertLineRow(db, tenantId, buy.row);
    // Two starts crossed (the webhook and the sweep, or the owner's own tab): the database holds one line a workspace
    // (lines_one_live_per_tenant_idx, 00195), and the other's line stands.
    if (ins.error) return ins.error.code === "23505" ? { kind: "stands" } : startFailed(ins.error.message);
    await scheduleJob(db, provisionJob(tenantId, ins.data.id, "owner", now));
    return { kind: "started", lineId: ins.data.id, number };
  } catch (e) {
    return startFailed(e instanceof Error ? e.message : String(e));
  }
}

const startFailed = (detail: string): ChosenLineOutcome => ({ kind: "none", why: "failed", detail });

/** How many workspaces one tick asks: a quarter hour's work, the rest the next tick's. */
const CHOSEN_LINES_PER_TICK = 50;

export interface OwedLinesResult {
  looked: number;
  started: number;
  failed: number;
}

/**
 * The lines sweep's half for the chosen numbers: each workspace with a number chosen is asked startChosenLine, which
 * starts the line of one that pays and has none, and leaves every other as it is. A start that failed is told to the
 * platform (`alert`), since money was taken and the service did not start.
 */
export async function startOwedLines(
  db: Db,
  ids: readonly string[],
  ports: ChosenLinePorts & { alert: (subject: string, body: string) => Promise<unknown> },
  max = CHOSEN_LINES_PER_TICK,
): Promise<OwedLinesResult> {
  const out: OwedLinesResult = { looked: 0, started: 0, failed: 0 };
  for (const tenantId of ids.slice(0, max)) {
    out.looked += 1;
    const result = await startChosenLine(db, tenantId, ports);
    if (result.kind === "started") out.started += 1;
    if (result.kind === "none" && (result.why === "failed" || result.why === "no_number")) {
      out.failed += 1;
      await ports.alert(
        "A paid workspace's number did not start",
        `Workspace ${tenantId} pays and chose a number, and starting it failed: ${result.detail ?? result.why}. The lines sweep asks again within the quarter hour.`,
      );
    }
  }
  return out;
}
