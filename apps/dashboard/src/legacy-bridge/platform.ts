/**
 * The back office, on the classic pages.
 *
 * Read ON DEMAND rather than published as a surface, for the same reason the
 * business-record form is: this is opened by one person, rarely, and a surface
 * would make every customer's browser fetch a page it will never be allowed to
 * see. `window.__ME.platform_admin` is the one bit the nav needs at boot, and it
 * rides on the workspace payload the seam already fetches.
 *
 * Nothing here decides who may look. Both reads answer 404 to everybody else --
 * the same answer a URL that does not exist gives, so a customer who guesses it
 * learns nothing.
 */
import {
  platformRows,
  platformSummary,
  platformNumber,
  setupSteps,
  platformLineActions,
  platformActionWarning,
  PLATFORM_VERDICTS,
  PLATFORM_QUIET_DAYS,
  platformHealthWords,
  activityWords,
  platformQueue,
  platformPartnerRows,
  platformPartnerSummary,
  platformPartnerStanding,
  partnerPayoutOutcomeWords,
  partnerStandingOutcomeWords,
  partnerStatusOutcomeWords,
  SECOND_FACTOR_WORDS,
  secondFactorResetWords,
  clockTime,
  clockDateYear,
  clockDayLabel,
  zoneDayKey,
  type PlatformTenantDto,
  type SetupDto,
  type PlatformLineAction,
  type PlatformHealth,
  type PlatformQueue,
  type PlatformPartnerBalanceDto,
  type PlatformPartnerWorkspaceDto,
} from "@chanlytics/contracts";
import { api } from "./api";
import { readCache } from "./read-cache";

export interface PlatformEventVM {
  kind: string;
  category: string;
  subject_type: string | null;
  created_at: string;
  // No `data`. The payload is unbounded -- emitEvent writes numbers, addresses
  // and provider ids from every corner of the product -- and the page renders
  // none of it. Shipping another business's payloads to a browser to be thrown
  // away is not a thing a cross-tenant surface gets to do by accident.
}

export interface PlatformTenantDetail {
  tenant: { id: string; slug: string; name: string; status: string; timezone: string; created_at: string };
  setup: SetupDto;
  events: PlatformEventVM[];
}

type OverviewAnswer = {
  ok: boolean;
  tenants: PlatformTenantDto[];
  health: PlatformHealth | null;
  queue: PlatformQueue | null;
  /** Every partner and who brought each workspace (0012, P5); null when it could not be read. */
  partners: { balances: PlatformPartnerBalanceDto[]; workspaces: PlatformPartnerWorkspaceDto[] } | null;
  message: string;
};
type DetailAnswer = { ok: boolean; detail: PlatformTenantDetail | null; message: string };
/** Both reads, kept for the tab: the list is re-read on every visit, and a workspace on every Open. */
const overviews = readCache<OverviewAnswer>("platform-overview", (r) => r.ok);
const details = readCache<DetailAnswer>("platform-detail", (r) => r.ok);

export interface PlatformApi {
  /** Every workspace, as facts, whether the machinery under them is running, and who is waiting to get in. `ok: false` is the ordinary answer for anybody who is not an admin. */
  list(): Promise<OverviewAnswer>;
  /** One sentence for the health card. Pure, from contracts. */
  healthWords: typeof platformHealthWords;
  /** The waiting list as rows and a sentence. Pure, from contracts. */
  queue: typeof platformQueue;
  /**
   * Record that somebody on the list was invited. IT SENDS NOTHING: there is
   * one shared sign-up code, so the invitation is a mail a person writes, and
   * this is the stamp that takes them out of the queue.
   */
  markInvited(id: string): Promise<{ ok: boolean; message: string }>;
  /** One workspace: its identity, the Setup its owner sees, and what has happened lately. */
  one(tenantId: string): Promise<DetailAnswer>;
  /** What this tab already holds, if anything: what the first paint draws. */
  peekList(): OverviewAnswer | null;
  peekOne(tenantId: string): DetailAnswer | null;
  /** Read ahead of the click -- the rail's tab, and a row's Open under the pointer. */
  warmList(): void;
  warmOne(tenantId: string): void;
  /**
   * An event kind in an owner's words (the same function the activity log
   * runs). The trail selects no payload, so this is called with none: the
   * sentence for the kind alone, and the raw kind stays beside it for support.
   */
  words: typeof activityWords;
  /**
   * The clock, for a zone this page is GIVEN rather than the one it is in.
   * window.__clock speaks for the signed-in workspace, and this is the one
   * surface that looks at somebody else's: the same contracts functions it
   * wraps, called with the zone the header names.
   */
  clock: {
    time: typeof clockTime;
    dateYear: typeof clockDateYear;
    dayLabel: typeof clockDayLabel;
    dayKey: typeof zoneDayKey;
  };
  /** The judgement and the words. Pure, from contracts. */
  rows: typeof platformRows;
  summary: typeof platformSummary;
  verdicts: typeof PLATFORM_VERDICTS;
  quietDays: typeof PLATFORM_QUIET_DAYS;
  number: typeof platformNumber;
  /** The customer's own Setup rows, run for their workspace. The same function their page runs. */
  steps: typeof setupSteps;
  /** What may be done to a line right now, and what each one spends. */
  actions: typeof platformLineActions;
  warning: typeof platformActionWarning;
  /**
   * Do one of them. Named actions only -- the routes each carry one operation,
   * and this passes the name rather than anything the edge would execute.
   */
  act(action: PlatformLineAction, tenantId: string, lineId: string): Promise<{ ok: boolean; message: string }>;
  /** The partners, as rows and a sentence, and a workspace's partner as its row says it. Pure, from contracts. */
  partnerRows: typeof platformPartnerRows;
  partnerSummary: typeof platformPartnerSummary;
  partnerStanding: typeof platformPartnerStanding;
  /** A person's decision on a workspace a partner brought, with why. Recorded against the caller. */
  setStanding(tenantId: string, standing: string, why: string): Promise<{ ok: boolean; message: string }>;
  /**
   * Record a payout sent by hand. IT SENDS NOTHING: the money leaves from the bank, and this records that it did,
   * with the reference to find it by.
   */
  markPaid(
    partnerId: string,
    code: string,
    currency: string,
    reference: string,
    /** The total the card showed: nothing is recorded when what is payable has moved since. */
    expectedCents: number,
  ): Promise<{ ok: boolean; message: string }>;
  /** Pause, close or restore a partner, with why. A pause takes their seat on every workspace they brought. */
  setStatus(partnerId: string, code: string, status: string, why: string): Promise<{ ok: boolean; message: string }>;
  /** Remove a partner's authenticator after checking it is them (0013), with why; they set up a new one at sign-in. */
  resetSecondFactor(partnerId: string, code: string, why: string): Promise<{ ok: boolean; message: string }>;
  secondFactorWords: typeof SECOND_FACTOR_WORDS;
}

declare global {
  interface Window {
    __platform?: PlatformApi;
  }
}

export function installPlatform(win: Window = window): void {
  win.__platform = {
    list: () =>
      overviews.through("all", async () => {
        const r = await api()("GET platform/overview");
        if (!r.ok) return { ok: false, tenants: [], health: null, queue: null, partners: null, message: r.message };
        // `health` rides on this read rather than a route of its own: the same
        // question, the same door, and the page that lists the workspaces is the
        // one that should say whether the machinery under them is running.
        return {
          ok: true,
          tenants: r.data.tenants,
          health: r.data.health ?? null,
          queue: r.data.queue ?? null,
          partners: r.data.partners ?? null,
          message: "",
        };
      }),
    one: (tenantId) =>
      details.through(tenantId, async () => {
        const r = await api()("GET platform/tenants/[id]", { params: { id: tenantId } });
        if (!r.ok) return { ok: false, detail: null, message: r.message };
        return { ok: true, detail: r.data, message: "" };
      }),
    peekList: () => overviews.peek("all"),
    peekOne: (tenantId) => details.peek(tenantId),
    warmList: () => overviews.warm("all", () => win.__platform!.list()),
    // A pointer resting on a row's Open is the whole warning you get that it is
    // about to be pressed, and this read is the one that makes that click wait.
    warmOne: (tenantId) => details.warm(tenantId, () => win.__platform!.one(tenantId)),
    async act(action, tenantId, lineId) {
      const r = await api()(`POST platform/lines/${action}`, { body: { tenant_id: tenantId, line_id: lineId } });
      // Both caches are already dropped by the write itself: every write
      // clears every on-demand answer, in one place (legacy-bridge/api.ts).
      if (!r.ok) return { ok: false, message: r.message };
      // The edge's own words when it refused. `already_registered`,
      // `the line is answering, not failed` -- these are facts about the line,
      // and support needs the actual one rather than "that did not work".
      const res = r.data.result ?? null;
      if (r.data.ok !== true) {
        // THE PRE-FLIGHT'S SENTENCES FIRST, when the refusal has them. A refile
        // stopped because the workspace's name does not match its record is not an
        // `record_incomplete` -- it is one sentence naming the mismatch and one
        // naming the rename that fixes it, and support pressing this button is
        // exactly who needs to read them. Showing the token here would have
        // repeated, on the ops surface, the defect this change fixed for owners.
        const problems = Array.isArray(res?.problems)
          ? (res.problems as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
          : [];
        if (problems.length) return { ok: false, message: problems.join(" ") };
        // `detail` before `error`: a refusal that carries a sentence is meant to
        // be read. The billing hold the edge applies to a refile sends
        // whyCannotSpend's words there ("Your last payment did not go through.
        // Update the card in Billing, then try again.") while `error` is the
        // token `payment_required` — which is what support saw in a red toast.
        const detail = res && typeof res.detail === "string" && res.detail.trim() ? res.detail.trim() : null;
        const why = detail ?? (res && typeof res.error === "string" ? res.error : `HTTP ${r.data.status ?? "?"}`);
        const hint = res && typeof res.hint === "string" ? ` — ${res.hint}` : "";
        return { ok: false, message: `${why}${hint}` };
      }
      return { ok: true, message: "Done. This page will show it on the next read." };
    },
    async markInvited(id) {
      const r = await api()("POST platform/waitlist/invited", { body: { id } });
      // Whether it was this press or somebody else's, the queue on screen is
      // now one row out of date.
      overviews.clear();
      if (!r.ok) return { ok: false, message: r.message };
      // "already" is not a failure: two people working down the same list is
      // how this is used, and the second one is owed the truth.
      return r.data.outcome === "already"
        ? { ok: true, message: "Somebody had already marked them." }
        : { ok: true, message: "Marked. They are off the list." };
    },
    async setStanding(tenantId, standing, why) {
      const r = await api()("POST platform/partners/standing", { body: { tenant_id: tenantId, standing, why } });
      overviews.clear();
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, message: partnerStandingOutcomeWords(r.data.result) };
    },
    async markPaid(partnerId, code, currency, reference, expectedCents) {
      const r = await api()("POST platform/partners/payout", {
        body: { partner_id: partnerId, currency, reference, expected_cents: expectedCents },
      });
      overviews.clear();
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: r.data.result.paid, message: partnerPayoutOutcomeWords(code, r.data.result) };
    },
    async setStatus(partnerId, code, status, why) {
      const r = await api()("POST platform/partners/status", { body: { partner_id: partnerId, status, why } });
      overviews.clear();
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, message: partnerStatusOutcomeWords(code, r.data.result) };
    },
    async resetSecondFactor(partnerId, code, why) {
      const r = await api()("POST platform/partners/second-factor", { body: { partner_id: partnerId, why } });
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, message: secondFactorResetWords(code, r.data.result.removed) };
    },
    secondFactorWords: SECOND_FACTOR_WORDS,
    partnerRows: platformPartnerRows,
    partnerSummary: platformPartnerSummary,
    partnerStanding: platformPartnerStanding,
    rows: platformRows,
    healthWords: platformHealthWords,
    queue: platformQueue,
    words: activityWords,
    clock: { time: clockTime, dateYear: clockDateYear, dayLabel: clockDayLabel, dayKey: zoneDayKey },
    summary: platformSummary,
    verdicts: PLATFORM_VERDICTS,
    quietDays: PLATFORM_QUIET_DAYS,
    number: platformNumber,
    steps: setupSteps,
    actions: platformLineActions,
    warning: platformActionWarning,
  };
}
