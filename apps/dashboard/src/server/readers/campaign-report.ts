import "server-only";
import {
  AppError,
  CAMPAIGNS_RESULTS_PERIOD,
  MIN_MS,
  campaignLedgerDtoOf,
  chainTotalsFromReport,
  chainTotalsOf,
  isCampaignLedgerSeriesDto,
  isCampaignStuckRawDto,
  numberHealthOfConfig,
  type CampaignLedgerDto,
  type CampaignNumberDto,
  type CampaignReportDto,
  type CampaignSourceDto,
  type CampaignStuckRawDto,
  type ReachOutChainTotalsDto,
  type ReachOutReportDto,
} from "@chanlytics/contracts";
import {
  campaignLedger,
  campaignSeries,
  campaignStuck,
  reachOutChainTotals,
  whatsappChannelFacts,
  type ReportWindow,
} from "@chanlytics/db";
import { log } from "@/server/log";
import { reachOutReportOf } from "../campaigns/reach-out-report";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import { askedHead, reportWindowFor, windowRead } from "./report";

/**
 * GET reports/campaigns, as the route answers it: what the offers earned over one of the three presets (the route
 * refuses any other) -- the route's body, moved here whole. The twin of `report`: one SECURITY INVOKER function
 * computes the series in the tenant's own zone under the caller's RLS, over two periods so the page can show a change,
 * plus the current period by playbook or broadcast; a function that answers nothing is the route's 404, in its words.
 * No row of its own: it is drawn on the Reports page, which `report` names.
 *
 * Kept a minute across an Ask turn's next questions (only a turn keeps: a route reads it fresh), since every Campaigns
 * turn reads it for its rows. It depends on nothing but its window and the workspace: a window that ends today is the
 * database's today, never the turn's clock.
 */
export const campaignReport: Reader<ReportWindow, { report: CampaignReportDto }> = {
  name: "campaignReport",
  ttlMs: MIN_MS,
  async read(rc, window) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await windowRead(campaignSeries(ctx.supabase, tenantId, window))) as unknown as CampaignReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    return { data: { report }, rows: [], stamp: stamp() };
  },
};

/**
 * Each campaign's numbers over Campaigns' own period (contracts CAMPAIGNS_RESULTS_PERIOD, 30 days ending today), read as
 * GET reports/campaigns?period=30d reads them (its window from the route's own reportWindowFor): campaign_series'
 * sources, the numbers a campaign's row on Campaigns says (D35). Null where they could not be read, logged, never
 * all-time totals in their place. Ask's campaigns read and the Campaigns page's context say them.
 */
export async function lastDaysBySource(rc: ReaderContext): Promise<CampaignSourceDto[] | null> {
  try {
    const window = await reportWindowFor(rc, { period: CAMPAIGNS_RESULTS_PERIOD });
    return (await load(rc, campaignReport, window)).data.report.sources ?? [];
  } catch (e) {
    log.error("campaign_last_days_read_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** A campaign's sends and replies in those days (lastDaysBySource's): none where it sent nothing, null where unread. */
export function lastDaysOf(
  sources: readonly CampaignSourceDto[] | null,
  id: string,
): { sent: number; replied: number } | null {
  if (!sources) return null;
  const s = sources.find((x) => x.kind === "playbook" && x.id === id);
  return { sent: s?.sent ?? 0, replied: s?.replied ?? 0 };
}

/**
 * GET reports/reach-outs, as the route answers it: what the reach-outs wrote over the window and what came of it (00241
 * reach_out_report, campaigns/reach-out-report.ts reachOutReportOf), and beside it each chain's own totals by its root
 * (reach_out_chain_totals, 00375), so a chain past the report's twenty still says its numbers or "Nothing sent" (spec
 * 2026-10-09 §4.5). Both are read over the one window the route worked out (readers/report.ts reportWindowFor), its
 * last day named to each only where it is not today, so the report and the chains count the same days. The report's own
 * chains, said as not every chain (`complete: false`), stand in wherever the totals cannot be read: for one release a
 * database without the function (so either deploy order works), and always a read that fails (a timeout, a refusal),
 * logged, so the chains' totals never take the report down with them: the report is what the section says, and the
 * totals only what lies past its twenty. Only the report's own read throws. The campaigns' report's twin; Ask's report
 * reads it too.
 */
export const reachOutReport: Reader<
  ReportWindow,
  { report: ReachOutReportDto; chains: ReachOutChainTotalsDto | null }
> = {
  name: "reachOutReport",
  async read(rc, window) {
    const [{ report }, totals] = await Promise.all([
      reachOutReportOf(rc.ctx, rc.tenantId, window),
      reachOutChainTotals(rc.ctx.supabase, rc.tenantId, window).catch((e: unknown) => {
        log.error("reach_out_chain_totals_read_failed", {
          tenant_id: rc.tenantId,
          error: e instanceof Error ? e.message : String(e),
        });
        return "failed" as const;
      }),
    ]);
    const chains = typeof totals === "string" ? chainTotalsFromReport(report) : chainTotalsOf(totals);
    return { data: { report, chains }, rows: [], stamp: stamp() };
  },
};

/**
 * Each reach-out's numbers over Campaigns' own period, read as GET reports/reach-outs?period=30d reads them (reachOutReport,
 * over the route's own window): each chain's own totals by its root, or the report's twenty where those cannot be read,
 * which its row on Campaigns says (contracts chainResultsOf). Null where the report could not be read, logged. The
 * reach-outs' twin of lastDaysBySource: Ask's context of the page says them.
 */
export async function chainLastDays(rc: ReaderContext): Promise<ReachOutChainTotalsDto | null> {
  try {
    const window = await reportWindowFor(rc, { period: CAMPAIGNS_RESULTS_PERIOD });
    return (await load(rc, reachOutReport, window)).data.chains;
  } catch (e) {
    log.error("reach_out_last_days_read_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * What is stuck, as the database lists it (campaign_stuck): the facts contracts' campaignLedgerDtoOf judges. A database
 * without the function (00406 goes to production on the owner's word, either deploy order works) is `stuck: null`, said
 * in the log once, and no failure; a read that fails, or an answer that is not the four lists (its own `{ error }` for an
 * unknown workspace), is `stuckFailed`, said in the log with the workspace, so the lens can tell a read that failed from
 * a function not applied yet. Never fatal: the window is answered without it.
 */
async function stuckOf(rc: ReaderContext): Promise<{ stuck: CampaignStuckRawDto | null; stuckFailed: boolean }> {
  try {
    const answer = await campaignStuck(rc.ctx.supabase, rc.tenantId);
    if (answer === null) {
      log.warn("campaign_stuck_missing", { tenant_id: rc.tenantId });
      return { stuck: null, stuckFailed: false };
    }
    if (!isCampaignStuckRawDto(answer)) throw new Error("campaign_stuck: the answer is not its four lists");
    return { stuck: answer, stuckFailed: false };
  } catch (e) {
    log.error("campaign_stuck_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { stuck: null, stuckFailed: true };
  }
}

/** The dates a WhatsApp channel's config keeps of when Meta last spoke of the number: its rating, its standing, its newest quality webhook. */
const NUMBER_READ_KEYS = ["quality_read_at", "standing_read_at", "quality_at"] as const;

/**
 * When the number was last checked: the newest of the dates its config keeps (NUMBER_READ_KEYS) that parse, as the config
 * wrote it; null where it keeps none.
 */
function checkedAtOf(config: Record<string, unknown>): string | null {
  const dates = NUMBER_READ_KEYS.map((key) => config[key]).filter(
    (at): at is string => typeof at === "string" && !Number.isNaN(Date.parse(at)),
  );
  return dates.reduce<string | null>(
    (newest, at) => (newest === null || Date.parse(at) > Date.parse(newest) ? at : newest),
    null,
  );
}

/**
 * The connected WhatsApp number as the lens says it: its health as the composers' gate derives it from the channel's stored
 * config (contracts numberHealthOfConfig: one derivation), and when that was last checked. None with no active number; a
 * channel that cannot be read is `unread`, said in the log with the workspace, never none. Never fatal: what is stuck is
 * answered without it.
 */
async function numberOf(rc: ReaderContext): Promise<CampaignNumberDto> {
  try {
    const channel = await whatsappChannelFacts(rc.ctx.supabase, rc.tenantId);
    if (channel === null) return { state: "none" };
    const health = numberHealthOfConfig(channel.config);
    return {
      state: "read",
      tone: health.tone,
      can_send: health.canSend,
      label: health.label,
      standing: health.word && health.refusal ? { word: health.word, sentence: health.refusal } : null,
      checked_at: checkedAtOf(channel.config),
    };
  } catch (e) {
    log.error("campaign_number_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { state: "unread" };
  }
}

/**
 * GET reports/campaigns/ledger, as the route answers it: what the Campaigns lens reads beyond the sends' own report
 * (campaignReport). Three reads, made together, each failing alone: the window over `days` and the same number before
 * them, which one SECURITY INVOKER function counts in the workspace's own zone (campaignLedger: the people sent to and who
 * wrote back, the runs, what was held back and why they stopped, why sends failed, each message, how soon the first reply
 * came and how long approvals waited); what is stuck now (stuckOf), as of now whatever the days; and the connected
 * number's health (numberOf). Contracts' campaignLedgerDtoOf makes the route's answer of them, and judges what is stuck by
 * the product's own rules (a run is late when the verb that approves it would refuse it, a reply waits on you by the one
 * standing) at the turn's clock in the window's zone. Nothing of the member asking reaches it (`rc.userId` is not passed on):
 * the answer is the workspace's. A function that answers nothing is the page's 404, in its words; any other failure of the
 * ledger is the route's. A database that does not have the function yet (00405 is applied on the owner's word, after the
 * dashboard deploys) answers null for a period and for picked days alike: the answer is then the window the route was asked
 * with `series: null`, the lens draws what is stuck and none of its own window's parts, and the log says
 * `campaign_ledger_missing` once a read. No row of its own, and no ttl: a route reads it fresh and a turn keeps its own,
 * since what is stuck is judged at the turn's clock. It is drawn on the Reports page, which `report` names.
 */
export const campaignLedgerReport: Reader<ReportWindow, CampaignLedgerDto> = {
  name: "campaignLedgerReport",
  async read(rc, window) {
    const [answer, stuck, number] = await Promise.all([
      campaignLedger(rc.ctx.supabase, rc.tenantId, window),
      stuckOf(rc),
      numberOf(rc),
    ]);
    const series = isCampaignLedgerSeriesDto(answer) ? answer : null;
    if (answer === null) log.warn("campaign_ledger_missing", { tenant_id: rc.tenantId });
    else if (series === null) throw new AppError("not_found", "No workspace found for this report.", 404);
    const head = series ?? (await askedHead(rc, window));
    const data = campaignLedgerDtoOf(series, { ...stuck, number, head, nowMs: rc.now.getTime() });
    return { data, rows: [], stamp: stamp() };
  },
};
