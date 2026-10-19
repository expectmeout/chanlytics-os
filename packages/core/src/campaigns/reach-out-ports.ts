/**
 * What assembling a reach-out step's run needs (Part 3), as ports: the edge's run context builds them over the database
 * (apps/edge lib/reach-out/run-context.ts); tests build them from arrays.
 */
import { outreachRefusalOf, type StepHand, type TimetableSender } from "@chanlytics/contracts";

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
  /**
   * What the chain's first step writes to (00426): a search the finder keeps current, or a list its owner adds leads to
   * by hand (a search of via chosen or import). Every first-email run of a list-fed chain waits for its owner's say.
   */
  fed_by: "search" | "list";
  /** The chain's (its root's): its catch-all addresses are written to too, as its owner chose (Part 4, F9). */
  include_unconfirmed: boolean;
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number;
  /** The mailboxes it writes from (00424); none named is every connected one. */
  mailbox_ids: string[];
  /**
   * The chain's (its root's, 00429): its owner sends its emails from their own inbox, each handed to them written and
   * checked, so a run plans no mailbox and no timetable: its day's share, due as the run goes ahead.
   */
  owner_sends: boolean;
  cap_per_run: number;
  /** When a person last let a run of its words go (00462): null while they are new, and its run then waits for them. */
  words_ok_at: string | null;
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
  /**
   * The leads a later step refuses, passed over (00455 sequence_leads_leave): each one's place in the chain ends with
   * why, so the record says where they went, never "in it" for good. How many left.
   */
  passOver(rootId: string, leads: { lead_id: string; why: string }[]): Promise<number>;
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
  /** The mailbox the step before wrote to them from (00424): this step writes from it too, in its thread. */
  mailbox_id: string | null;
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
 * One lead in a run: planned, with its time and mailbox (none for a reach-out its owner sends, 00429); or skipped, with
 * why, so a lead the step may never write to (the door refuses it, or it keeps no open hour all week) leaves the step's
 * page rather than heading it every day.
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
  | { state: "planned"; mailbox_id: string | null; send_at: string; reason?: null }
  | { state: "skipped"; mailbox_id: null; send_at: null; reason: string }
);

export interface ReachOutRunPorts {
  now(): number;
  /** The workspace's zone: a lead whose state has no zone keeps the business's hours. */
  workspaceZone: string;
  /** Its sequence's mode (decision 0064): a sequence to leads holds each run for a stop (veto) or asks for each (ask). */
  mode: "veto" | "ask";
  /** Whether the workspace may spend (contracts maySpend): cold email is a cost on the platform's account. */
  maySpend: boolean;
  alreadyRan(stepId: string, runFor: string): Promise<boolean>;
  /** Whether a run of the chain waits for its owner: nothing more is made until they answer it. */
  chainWaits(rootId: string): Promise<boolean>;
  audience(step: ReachOutStep): Promise<ReachOutLead[]>;
  followers(step: FollowedStep): Promise<ReachOutFollower[]>;
  /**
   * The leads a later step refuses, passed over (00455 sequence_leads_leave): each one's place in the chain ends with
   * why, so the record says where they went, never "in it" for good. How many left.
   */
  passOver(rootId: string, leads: { lead_id: string; why: string }[]): Promise<number>;
  /**
   * The mailboxes the step writes from (contracts reachOutWritesFrom), and those named in `also` (a later step's
   * leads' own, whichever the step names), each with its day's share now (0 for one that does not send today) and the
   * times it already spends (db mailbox_capacity); `gone` is those of `also` that are removed, or not the workspace's.
   */
  mailboxes(step: ReachOutStep, also: readonly string[]): Promise<{ senders: TimetableSender[]; gone: Set<string> }>;
  /**
   * What a reach-out its owner sends holds (db chainDraftLoad, 00429): the emails its runs for this day already hold,
   * skipped aside (its day's share is counted against them, contracts REACH_OUT_DRAFTS_PER_DAY), and those waiting for
   * its owner across every run, not yet said (their pile, REACH_OUT_DRAFTS_OPEN_MAX).
   */
  draftLoad(rootId: string, runFor: string): Promise<{ today: number; open: number }>;
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
  | { outcome: "held"; reason: "waiting_for_you" | "no_mailbox" | "no_room" | "billing"; planned: number }
  | { outcome: "empty"; reason: "already_ran" | "nobody"; planned: 0 }
  | { outcome: "off"; reason: "paused"; planned: 0 };

/**
 * Why a later step refuses one of its leads (the door's own mapping, contracts outreachRefusalOf), and for an email step
 * a bounced address too (a call is no worse for one); null for a lead it may reach. One reading for both kinds of later
 * step: what it refuses for good is passed over (00455), someone away only waits.
 */
export function followerRefusalOf(f: ReachOutFollower, o: { bounced: boolean }): string | null {
  if (o.bounced && f.bounced) return "outreach_bounced";
  return outreachRefusalOf({
    leadStage: f.facts.lead_stage,
    suppressed: f.facts.suppressed,
    wroteBack: f.facts.wrote_back,
    away: f.facts.away === true,
    stopped: f.facts.stopped === true,
  });
}
