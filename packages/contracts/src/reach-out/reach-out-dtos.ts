/**
 * What the dashboard's reach-out routes answer (Reach out, Part 4): the chains, each without its report (R23: the
 * report is read when a row is opened); a chain's report; a search's reach; one business's preview; what Start did;
 * a run's sends for its approval. Storage says tenant; these say workspace.
 */
import { z } from "zod";
import { REACH_OUT_BODY_MAX, REACH_OUT_SUBJECT_MAX, SIGNED_BY_MAX, type ReachOutHold } from "./reach-out-words";

/** A step's words and place, as the sheet edits them. */
export interface ReachOutStepDto {
  id: string;
  /** 0 for the first email. */
  n: number;
  after_days: number | null;
  subject: string | null;
  body: string;
  template_id: string | null;
  state: "running" | "paused";
}

/** What decides the chain's next run, as the database holds it (R23): the words are nextRunWords'. */
export interface ReachOutNextFacts {
  run_hour: number;
  /** The workspace's day the chain's first step last ran for. */
  last_run_for: string | null;
  /** Settings › Autonomy's outreach row (none reads as ask). */
  mode: "ask" | "veto" | "never";
  /** Whether billing lets the workspace spend on reach-out (contracts maySpend). */
  may_spend: boolean;
  /** A run of the chain waiting for its owner's approval, when there is one. */
  waiting_run_id: string | null;
}

export interface ReachOutChainDto {
  root_id: string;
  name: string;
  search: { id: string; name: string } | null;
  state: "running" | "paused";
  include_unconfirmed: boolean;
  gap_minutes: number;
  domain_ids: string[];
  signed_by: string | null;
  steps: ReachOutStepDto[];
  /**
   * The domains its run sends from (contracts reachOutSendsFrom: its own, or every one when it names none, verified and
   * clean), with the days each has sent.
   */
  domains: Array<{ host: string; sent_days: number }>;
  next: ReachOutNextFacts;
  created_at: string;
}

export interface ReachOutStepCounts {
  written: number;
  delivered: number;
  wrote_back: number;
  said_no: number;
  bounced: number;
  waiting: number;
  held: number;
}

export interface ReachOutRunLine {
  id: string;
  step_id: string | null;
  run_for: string | null;
  state: string;
  planned: number;
  written: number;
  held: number;
}

/** A chain's report (00211 reach_out_chain_report): each step counted once, its last runs, whether it may go. */
export interface ReachOutChainReportDto {
  steps: Array<{ id: string; n: number } & ReachOutStepCounts>;
  runs: ReachOutRunLine[];
  /** Nothing of it has been written: it may be removed. Otherwise it is paused (R16). */
  can_remove: boolean;
}

export interface ReachOutReachDto {
  ready: number;
  with_unconfirmed: number;
  phone_only: number;
  /** The search's qualified leads. */
  of: number;
  /** The search's chain, when it has one (F10). */
  chain: string | null;
}

export interface ReachOutPreviewDto {
  lead: { id: string; business_name: string; email: string } | null;
  subject: string | null;
  body: string | null;
  opening: string | null;
  angle: string | null;
  hold: ReachOutHold | null;
  detail: string | null;
  /** Why this email could not be written for this business, as the sender would hold or skip it. */
  refused: string | null;
  /** The model could not answer: the owner may ask again. */
  unavailable: boolean;
}

/**
 * What Start did (R13, R14): the edge's step runner's outcome with its reason, or that it could not be asked.
 * `unreached` is the edge not answering (the hourly sweep plans it); `preview` a deployment that runs nothing.
 */
export interface ReachOutStartDto {
  outcome: "sent" | "held" | "empty" | "off" | "failed" | "unreached" | "preview";
  reason: string | null;
  planned: number;
  run_id: string | null;
}

export interface ReachOutSavedDto {
  root_id: string;
  step_ids: string[];
  /** Planned and held emails sent back to the check by changed words (R5). */
  rechecked: number;
  /** A new chain's first run, asked for now; null for an edit. */
  start: ReachOutStartDto | null;
}

/** The furthest business a preview pages to: a run's cap is 200 (F11). */
export const REACH_OUT_PREVIEW_INDEX_MAX = 199;

/** What the sheet's preview asks: the n-th business of a search, with the first step's words as they stand. */
export const ReachOutPreviewSchema = z.object({
  search_id: z.string().uuid(),
  index: z.number().int().min(0).max(REACH_OUT_PREVIEW_INDEX_MAX),
  include_unconfirmed: z.boolean(),
  words: z.object({
    subject: z
      .string()
      .max(REACH_OUT_SUBJECT_MAX * 2)
      .nullable(),
    body: z
      .string()
      .trim()
      .min(1)
      .max(REACH_OUT_BODY_MAX * 2),
  }),
  signed_by: z.string().trim().max(SIGNED_BY_MAX).nullable(),
  language: z
    .string()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/)
    .optional(),
});
export type ReachOutPreviewInput = z.infer<typeof ReachOutPreviewSchema>;

export const REACH_OUT_DECISIONS = ["include", "rewrite", "skip", "not_a_fit"] as const;
export type ReachOutDecision = (typeof REACH_OUT_DECISIONS)[number];
export const ReachOutDecideSchema = z.object({ decision: z.enum(REACH_OUT_DECISIONS) });

export interface ReachOutHeldSend {
  send_id: string;
  lead_id: string;
  business_name: string;
  email: string | null;
  reason: ReachOutHold;
  detail: string | null;
  opening: string | null;
  angle: string | null;
  /** When it was planned: past fourteen days it is given up, and Include is refused (R10). */
  planned_at: string;
}

/** A reach-out run, as its approval sheet reads it (F13, R20–R22). */
export interface ReachOutRunDto {
  root_id: string;
  chain_name: string;
  step_id: string | null;
  /** 0 for the first email; null when the run's step has since been dropped from its chain (R17). */
  step_n: number | null;
  gap_minutes: number;
  run_for: string | null;
  include_unconfirmed: boolean;
  /** Planned, checked, and due by the end of the workspace's day; and planned for the days after. */
  today: number;
  later: number;
  /** The first checked send's time. */
  first_at: string | null;
  /** Planned and not yet checked: the check reads them within minutes. */
  checking: number;
  held: ReachOutHeldSend[];
  /** Who gets it: each planned business, when its email goes, and whether it is checked yet. */
  planned: Array<{ send_id: string; business_name: string; send_at: string; checked: boolean }>;
  /** Skipped at planning or by the check, by reason (closed_every_day, missing_value, owner_skipped, …). */
  skipped: Record<string, number>;
  /** The first checked business's email as it reads: its values in, its opening written. */
  first: {
    business_name: string;
    subject: string | null;
    body: string;
    opening: string | null;
    angle: string | null;
  } | null;
  /** The domains its sends go from, with the days each has sent (R22). */
  domains: Array<{ host: string; sent_days: number }>;
}
