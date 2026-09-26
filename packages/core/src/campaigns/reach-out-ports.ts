/**
 * What assembling a reach-out step's run needs (Part 3), as ports: the edge's run context builds them over the database
 * (apps/edge lib/reach-out/run-context.ts); tests build them from arrays.
 */
import type { TimetableDomain } from "@chanlytics/contracts";

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
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number;
  domain_ids: string[];
  cap_per_run: number;
  template_id: string;
  template_name: string;
  template_language: string;
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
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean };
  /** Any email of the chain to them bounced or failed for good (C4). */
  bounced: boolean;
}

export interface NewReachOutRun {
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

export interface PlannedSend {
  id: string;
  tenant_id: string;
  broadcast_id: string;
  playbook_id: string;
  root_id: string;
  lead_id: string;
  contact_id: string | null;
  domain_id: string;
  send_at: string;
  state: "planned";
}

export interface ReachOutRunPorts {
  now(): number;
  /** The workspace's zone: a lead whose state has no zone keeps the business's hours. */
  workspaceZone: string;
  /** The workspace's policy for the class outreach: veto | ask | never (contracts POLICY_CLASS_MODES.outreach). */
  mode: "veto" | "ask" | "never";
  /** Whether the workspace may spend (contracts maySpend): cold email is a cost on the platform's account. */
  maySpend: boolean;
  alreadyRan(stepId: string, runFor: string): Promise<boolean>;
  /** none: no run of the chain was ever approved or sent; waiting: its first run waits; approved: one went ahead. */
  chainState(rootId: string): Promise<"none" | "waiting" | "approved">;
  audience(step: ReachOutStep): Promise<ReachOutLead[]>;
  followers(step: ReachOutStep): Promise<ReachOutFollower[]>;
  /** The step's verified domains, each with its day's share and the times it already spends (db capacity). */
  domains(step: ReachOutStep): Promise<TimetableDomain[]>;
  /** "exists" when this step already has a run for the day (broadcasts_playbook_run). */
  createRun(row: NewReachOutRun): Promise<{ id: string } | "exists">;
  planSends(rows: PlannedSend[]): Promise<void>;
  notifyWaiting(runId: string, planned: number, firstAt: number): Promise<void>;
}

export type ReachOutRunOutcome =
  | { outcome: "sent"; planned: number }
  | { outcome: "held"; reason: "waiting_for_you" | "no_domain" | "no_room" | "billing"; planned: number }
  | { outcome: "empty"; reason: "already_ran" | "nobody"; planned: 0 }
  | { outcome: "off"; reason: "paused" | "never"; planned: 0 };
