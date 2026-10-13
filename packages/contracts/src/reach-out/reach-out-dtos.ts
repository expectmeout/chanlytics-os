/**
 * What the dashboard's reach-out routes answer (Reach out, Part 4): the chains, each without its report (R23: the
 * report is read when a row is opened); a chain's report; a search's reach; one business's preview; what Start did;
 * a run's sends for its approval. Storage says tenant; these say workspace.
 */
import type { ReachOutHold } from "./reach-out-words";
import type { StepHand } from "./reach-out-hand";
import type { ReachOutFedBy } from "./reach-out-leads";

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
  /** A call or a note for the team (Part 5, G20): the chain's last step, with no words to send. Null for an email. */
  hand: StepHand | null;
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

/** A mailbox a chain or a run writes from, as the sheet and the approval say its day (contracts mailboxDailyCap). */
export interface ReachOutMailboxFacts {
  address: string;
  sent_days: number;
  daily_cap: number;
  customer_domain: boolean;
}

export interface ReachOutChainDto {
  root_id: string;
  name: string;
  search: { id: string; name: string } | null;
  state: "running" | "paused";
  include_unconfirmed: boolean;
  gap_minutes: number;
  mailbox_ids: string[];
  signed_by: string | null;
  steps: ReachOutStepDto[];
  /**
   * The mailboxes its run writes from (contracts reachOutWritesFrom: its own, or every one when it names none, that
   * sends now), each with what its day is made of (contracts mailboxDailyCap).
   */
  mailboxes: ReachOutMailboxFacts[];
  next: ReachOutNextFacts;
  created_at: string;
  /** What feeds it (00426): a list its owner adds to, or the search that keeps it current; absent before it. */
  fed_by?: ReachOutFedBy;
  /**
   * Who is in it now (00426 reach_out_people_counts): the ledger's People cell, apart from the last 30 days. Null where
   * they could not be counted; absent from a server before it.
   */
  people?: ReachOutPeopleCountsDto | null;
}

/** How many of a reach-out's leads are in each group now (00426 reach_out_people_of, the one rule). */
export interface ReachOutPeopleCountsDto {
  waiting: number;
  writing: number;
  done: number;
}

export interface ReachOutStepCounts {
  written: number;
  delivered: number;
  wrote_back: number;
  said_no: number;
  bounced: number;
  waiting: number;
  held: number;
  /** A hand step's leads, handed to the team (00228); absent from a report read before it. */
  handed?: number;
  /** Leads whose reply was read as interested or a question, not undone (00241, Part 6's H1); absent before it. */
  interested?: number;
  /** Leads with an appointment seen after an email of the reach-out left (00241, H2); absent before it. */
  booked?: number;
}

export interface ReachOutRunLine {
  id: string;
  step_id: string | null;
  run_for: string | null;
  state: string;
  planned: number;
  written: number;
  held: number;
  handed?: number;
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

export const REACH_OUT_DECISIONS = ["include", "rewrite", "skip", "not_a_fit"] as const;
export type ReachOutDecision = (typeof REACH_OUT_DECISIONS)[number];

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
  /**
   * Who gets it: each planned business, when its email goes, and whether it is checked yet. `lead_id` is the business's
   * lead, which the sheet's name opens in Leads; a read from before it was carried has none.
   */
  planned: Array<{ send_id: string; lead_id?: string; business_name: string; send_at: string; checked: boolean }>;
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
  /** The mailboxes its sends go from, each with what its day is made of (R22). */
  mailboxes: ReachOutMailboxFacts[];
}
