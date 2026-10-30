/**
 * What the dashboard's reach-out routes answer (Reach out, Part 4): the chains, each without its report (R23: the
 * report is read when a row is opened); a chain's report; a search's reach; one business's preview; what Start did;
 * a run's sends for its approval. Storage says tenant; these say workspace.
 */
import type { ReachOutHold } from "./reach-out-words";
import type { StepHand } from "./reach-out-hand";
import type { ReachOutFedBy } from "./reach-out-leads";
import type { ReachOutSignsWith } from "./reach-out-rules";

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
  /** Its sequence's mode (decision 0064): a sequence to leads holds each run for a stop, or asks for each. */
  mode: "ask" | "veto";
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

/**
 * One of the workspace's mailboxes as How it runs offers it to a sequence (0077): whether the sequence writes from it,
 * whether it sends now, what DNS said of its domain, its day's facts, and what it signs with.
 */
export interface ReachOutMailboxChoice {
  id: string;
  address: string;
  /** Its connection's state: connected, paused, held or reconnect (removed ones are not offered). */
  state: string;
  /** Connected and not resting for its provider's own day (contracts mailboxSendsNow). */
  sends_now: boolean;
  /** The sequence writes from it (contracts reachOutWritesFrom over its mailbox_ids: none named is every one). */
  picked: boolean;
  /** What DNS said of its domain's records when last read; a record it could not read is left out (00423). */
  dns: Partial<Record<"spf" | "dkim" | "dmarc", "found" | "missing">>;
  /** What its day is made of (contracts mailboxDailyCap). */
  facts: ReachOutMailboxFacts;
  /** What it signs with as words, and whether they carry a link (contracts linkCount); null where it signs with none. */
  signature: { words: string; has_link: boolean } | null;
  connected_at: string;
}

export interface ReachOutChainDto {
  root_id: string;
  name: string;
  search: { id: string; name: string } | null;
  state: "running" | "paused";
  include_unconfirmed: boolean;
  gap_minutes: number;
  mailbox_ids: string[];
  /** Its owner sends its emails, each handed to them as a draft (00429); absent from a server before it. */
  owner_sends?: boolean;
  signed_by: string | null;
  /** How its emails end (0077); absent from a server before it, which ended them with the mailbox's signature. */
  signs_with?: ReachOutSignsWith;
  steps: ReachOutStepDto[];
  /**
   * The mailboxes its run writes from (contracts reachOutWritesFrom: its own, or every one when it names none, that
   * sends now), each with what its day is made of (contracts mailboxDailyCap).
   */
  mailboxes: ReachOutMailboxFacts[];
  /** Every mailbox of the workspace, oldest first, as How it runs offers them (0077); absent from a server before it. */
  mailbox_choices?: ReachOutMailboxChoice[];
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
  planned: Array<{
    send_id: string;
    lead_id?: string;
    business_name: string;
    send_at: string;
    checked: boolean;
    /** The opening it goes with, read before the batch is approved (30 Oct 2026); absent from a server before it. */
    opening?: string | null;
  }>;
  /** Skipped at planning or by the check, by reason (closed_every_day, missing_value, owner_skipped, …). */
  skipped: Record<string, number>;
  /**
   * The first checked business's email as it reads: its values in, its opening written, and the name under its words
   * where the sequence signs with its name (0077: in `body`, as the send writes it).
   */
  first: {
    business_name: string;
    subject: string | null;
    body: string;
    opening: string | null;
    angle: string | null;
    /** The mailbox's signature it ends with, where the sequence chose it (0077); absent from a server before it. */
    signature?: string | null;
    /** The foot the send writes under it (why they hear from you, who and where, how to say no); absent before it. */
    foot?: string | null;
  } | null;
  /** The mailboxes its sends go from, each with what its day is made of (R22). */
  mailboxes: ReachOutMailboxFacts[];
  /** Its chain's owner sends its emails (00429); absent from a server before it. */
  owner_sends?: boolean;
  /**
   * The emails handed to its owner and not yet said to have gone (00429), oldest first, each with the words as the
   * owner sends them; absent from a server before it.
   */
  drafted?: ReachOutDraftedSend[];
}

/** One email handed to its owner (00429 reach_out_sends.draft): to whom, its subject, and its words with their foot. */
export interface ReachOutDraftedSend {
  send_id: string;
  lead_id: string;
  business_name: string;
  angle: string | null;
  to: string;
  subject: string;
  /** The whole email as it reads, its foot included: what the owner sends. */
  text: string;
  drafted_at: string;
  /** A step after the first: it answers an email the business may have answered in the owner's own inbox. */
  follow_up?: boolean;
}

/** The owner's word on a drafted email (00429): it went, or it did not. */
export const REACH_OUT_SAID_OUTCOMES = ["sent", "not_sent"] as const;
export type ReachOutSaidOutcome = (typeof REACH_OUT_SAID_OUTCOMES)[number];

/** What the door answered: whether it was the first word on it, and how the email stands now. */
export interface ReachOutSaidDto {
  send_id: string;
  said: boolean;
  state: string;
  reason: string | null;
  /**
   * Sent, what about its lead would refuse it now (00429 reach_out_send_said: lead_gone, erased, lead_closed,
   * outreach_suppressed, outreach_stopped, already_yours, no_address): the email went from the owner's inbox all the
   * same, and is recorded; this is said beside it. Null when nothing would.
   */
  since?: string | null;
  /** Sent: whether the email went on a person's thread (a customer's thread, or the person made for it). */
  on_thread?: boolean;
}
