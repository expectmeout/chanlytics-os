/**
 * What assembling a reach-out step's run needs (Part 3), as ports: the edge's run context builds them over the database
 * (apps/edge lib/reach-out/run-context.ts); tests build them from arrays.
 */
import type { StepHand, TimetableDomain } from "@chanlytics/contracts";

export interface ReachOutStep {
  id: string;
  /** The chain's first step: the step's own id for a root, its parent's root for a later step. */
  root_id: string;
  tenant_id: string;
  name: string;
  trigger: "lead_first" | "after_step";
  /** The chain's: paused when the step or its root is (a paused root pauses every step of it). */
  state: "running" | "paused";
  lead_search_id: string | null;
  /** The chain's (its root's): its catch-all addresses are written to too, as its owner chose (Part 4, F9). */
  include_unconfirmed: boolean;
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number;
  domain_ids: string[];
  cap_per_run: number;
  template_id: string;
  template_name: string;
  template_language: string;
}

/** What a later step's leads are read by (reach_out_followers): an email step's, or a hand step's. */
export type FollowedStep = Pick<ReachOutStep, "id" | "after_playbook_id" | "after_days" | "cap_per_run">;

/**
 * A chain's last step that hands each lead it reaches to the team (Part 5, G20): an email step's shape without its
 * template, and with its hand.
 */
export interface HandStep extends Omit<ReachOutStep, "template_id" | "template_name" | "template_language"> {
  hand: StepHand;
}

/** One lead a hand step hands over, as the door takes it (00228 reach_out_hand_run). */
export type HandItem = {
  send_id: string;
  lead_id: string;
  contact_id: string;
  words: string;
  source_id: string;
};

/** What a hand step's run reads and writes, over the database on the edge and arrays in tests. */
export interface HandStepPorts {
  followers(step: FollowedStep): Promise<ReachOutFollower[]>;
  /** The businesses' names, by lead id: what the team's step calls each. */
  businessNames(leadIds: string[]): Promise<Map<string, string>>;
  /** The run, a handed send per lead and each lead's step, written whole: how many made, how many it had already. */
  handRun(p: {
    stepId: string;
    runId: string;
    day: string;
    items: HandItem[];
  }): Promise<{ made: number; already: number }>;
}

export interface ReachOutLead {
  lead_id: string;
  region: string | null;
  hours: unknown;
  /** Known for a later step's leads (their person was made at the first send); null for a first step's. */
  contact_id?: string | null;
}

export interface ReachOutFollower extends ReachOutLead {
  contact_id: string;
  /** The lead's own facts (outreach_lead_facts): the answer the send door will give about them. */
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean; away?: boolean; stopped?: boolean };
  /** Any email of the chain to them bounced or failed for good (C4). */
  bounced: boolean;
}

export interface NewReachOutRun {
  /** Its step and its day (reachOutRunIdFor): a replay meets its own run. */
  id: string;
  tenant_id: string;
  playbook_id: string;
  run_for: string;
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  state: "pending_approval" | "scheduled";
  scheduled_for: string;
  recipient_count: number;
  audience: { kind: "reach_out"; root_id: string; step_id: string; search_id: string | null };
}

/**
 * One lead in a run: planned, with its time and domain; or skipped, with why, so a lead the step may never write to
 * (the door refuses it, or it keeps no open hour all week) leaves the step's page rather than heading it every day.
 */
export type PlannedSend = {
  id: string;
  tenant_id: string;
  broadcast_id: string;
  playbook_id: string;
  root_id: string;
  lead_id: string;
  contact_id: string | null;
} & (
  | { state: "planned"; domain_id: string; send_at: string; reason?: null }
  | { state: "skipped"; domain_id: null; send_at: null; reason: string }
);

export interface ReachOutRunPorts {
  now(): number;
  /** The workspace's zone: a lead whose state has no zone keeps the business's hours. */
  workspaceZone: string;
  /** The workspace's policy for the class outreach: veto | ask | never (contracts POLICY_CLASS_MODES.outreach). */
  mode: "veto" | "ask" | "never";
  /** Whether the workspace may spend (contracts maySpend): cold email is a cost on the platform's account. */
  maySpend: boolean;
  alreadyRan(stepId: string, runFor: string): Promise<boolean>;
  /**
   * waiting: a run of the chain waits for its owner (its first, or any under ask), and nothing more is made until they
   * answer it; approved: one went ahead without its owner's yes being owed; none: neither, so the next run asks.
   */
  chainState(rootId: string): Promise<"none" | "waiting" | "approved">;
  audience(step: ReachOutStep): Promise<ReachOutLead[]>;
  followers(step: FollowedStep): Promise<ReachOutFollower[]>;
  /** The step's verified domains, each with its day's share and the times it already spends (db capacity). */
  domains(step: ReachOutStep): Promise<TimetableDomain[]>;
  /**
   * The run and its sends, written whole (db reach_out_plan_run): never a run with nothing planned in it. "exists" when
   * this step already has its run for the day.
   */
  planRun(run: NewReachOutRun, sends: PlannedSend[]): Promise<{ id: string } | "exists">;
  /**
   * The run, on the record: its event, and when it goes without its owner's yes, the system's decision under the mode
   * the owner chose (as a moment's run records one). An owner's yes records theirs when they approve it.
   */
  recordRun(run: NewReachOutRun, counts: { planned: number; skipped: number }): Promise<void>;
  notifyWaiting(runId: string, planned: number, firstAt: number): Promise<void>;
}

export type ReachOutRunOutcome =
  | { outcome: "sent"; planned: number }
  | { outcome: "held"; reason: "waiting_for_you" | "no_domain" | "no_room" | "billing"; planned: number }
  | { outcome: "empty"; reason: "already_ran" | "nobody"; planned: 0 }
  | { outcome: "off"; reason: "paused" | "never"; planned: 0 };
