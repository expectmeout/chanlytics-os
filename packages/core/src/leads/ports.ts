/**
 * The lead finder's view of the world (PRD §12.5): what the runner needs,
 * named for what each means. The database half is one method per service
 * RPC of migration 00140 plus a few reads (apps/edge/lib/leads/lead-db.ts, service
 * role); the provider and the judge are the channels package's clients, bound
 * by the edge where the keys are (apps/edge/lib/leads/lead-wires.ts). Every verb
 * here runs over fakes in a test: no network, no database.
 */
import type { ApifyClient, LeadJudge } from "@chanlytics/channels";
import type { MarkImage } from "./mark-image";
import type {
  JudgePlaceAnswer,
  LeadArea,
  LeadEmailState,
  LeadFit,
  LeadMemberClass,
  LeadRoundEnding,
  LeadRoundPurpose,
  LeadRoundState,
  LeadRunState,
  LeadSearchPlan,
} from "@chanlytics/contracts";

/** The question after the probe, as lead_rounds.question keeps it (PRD §7.2, P4): contracts' LeadQuestion with when it was asked. */
export interface RoundQuestion {
  sentence: string;
  criterionKey: string;
  dropTerm: string | null;
  asked_at: string;
}

export interface LeadRoundRow {
  id: string;
  tenant_id: string;
  search_id: string;
  seq: number;
  purpose: LeadRoundPurpose;
  plan: LeadSearchPlan;
  plan_version: number;
  target: number;
  state: LeadRoundState;
  ending: LeadRoundEnding | null;
  /** The ending the collect left for lead_check_commit to apply on the last batch. */
  ending_pending: LeadRoundEnding | null;
  question: RoundQuestion | null;
  answered: "keep" | "include" | "stop" | null;
  waiting_since: string | null;
  allowance_reserved: number;
  allowance_used: number;
  cost_reserved_usd: number;
  cost_usd: number;
  judge_tokens: number;
  /** The counter rows this round reserved in: the workspace's month and day, and the platform's day in UTC. */
  month: string;
  day: string;
  platform_day: string;
}

export interface LeadRunRow {
  id: string;
  tenant_id: string;
  round_id: string;
  purpose: "discover" | "check";
  term: string | null;
  actor: string;
  build: string;
  apify_run_id: string | null;
  dataset_id: string | null;
  state: LeadRunState;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_owner: string | null;
  lease_gen: number;
  lease_until: string | null;
  read_offset: number;
  items_seen: number;
  cap_usd: number | null;
  usage_usd: number;
  created_at: string;
  finished_at: string | null;
}

/** A member of the round with the facts of its lead the runner reads back (the probe's yield, the center, the emails to check). */
export interface LeadMemberRow {
  lead_id: string;
  class: LeadMemberClass;
  excluded_by: string | null;
  fit: LeadFit | null;
  reason: string | null;
  distance_m: number | null;
  counted: boolean;
  judgment: unknown;
  lat: number | null;
  lng: number | null;
  /** What the contact standard reads: the phone kept, and the address picked for the mailbox check. */
  phone: string | null;
  email: string | null;
  email_state: LeadEmailState;
  /** The term of the run that found it, from the judgment. */
  term: string | null;
}

/** The columns of `leads` the runner writes (PRD §12.4, Appendix B). */
export interface LeadColumns {
  place_id: string;
  business_name: string;
  category: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  website_host: string | null;
  instagram_url: string | null;
  /** The neighbourhood the listing names (D5, 00146): "Hawthorne", for the row's one line about where. */
  neighborhood: string | null;
  /** The business's own mark (D6, 00147): the logo its home page declares. Null without a site, or when it declared none. */
  logo_url: string | null;
  /**
   * The copy of that mark we keep (00161): `<sha256>.<ext>` in the public lead-marks bucket, stored once its bytes
   * passed mark-image.ts. What every tile draws; the site's own address is only where it came from.
   */
  mark_path: string | null;
  /** What the listing shows about the business (D2, 00144): written for a lead, null or empty for a left-out place. */
  about: string | null;
  hours: { day: string; hours: string }[];
  image_url: string | null;
  price: string | null;
  reviews_dist: { one: number; two: number; three: number; four: number; five: number } | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
  claimed: boolean | null;
  maps_url: string | null;
  rank: number | null;
  phone_e164: string | null;
  phone_sources: number;
  email: string | null;
  email_alternates: { email: string; why: string }[];
  email_state: LeadEmailState;
  rating: number | null;
  reviews: number | null;
}

/** A shared detail, looked up and marked, never merged on (decision 25): with a lead, a person, or a place found in the same batch. */
export interface LeadShare {
  kind: "phone" | "email" | "host";
  lead_id?: string;
  contact_id?: string;
  place_id?: string;
}

/**
 * What a member's judgment jsonb holds: the judge's answer for this place, the
 * operation that paid for it, the term that found it, and the reason tokens
 * code decided the class from (contracts' LeadClassification.reasons, which
 * lead_check_commit reads to find "the email was the only reason").
 */
export interface MemberJudgment {
  op_id: string | null;
  term: string;
  answer: JudgePlaceAnswer | null;
  model: string | null;
  reasons: string[];
}

export interface CollectPlace {
  place: LeadColumns;
  member: {
    judgment: MemberJudgment;
    class: LeadMemberClass;
    excluded_by: string | null;
    fit: LeadFit | null;
    reason: string;
    distance_m: number | null;
  };
  duplicate_of_place_id: string | null;
  shares: LeadShare[];
}

export interface CollectJudgment {
  op_id: string;
  batch: number;
  request_hash: string;
  answer: unknown;
  model: string;
  tokens: number;
}

/**
 * One page, as lead_collect_commit takes it: everything a commit writes, in
 * one call (E4). `round.ending` ends the round inline; `round.ending_pending`
 * leaves the ending for lead_check_commit's last batch; `round.target` raises
 * the round's target once the probe passed.
 */
export interface CollectPage {
  judgment: CollectJudgment | null;
  places: CollectPlace[];
  /** The run's usage as the provider reports it now; the commit settles the difference from the row. */
  usage_usd: number;
  items_seen: number;
  run_state: LeadRunState | null;
  next: { kind: "lead_collect"; seq: string; run_after_seconds: number } | null;
  /** `nearby` (D3): where to look next when the round ran dry, written with the ending it belongs to. */
  round: {
    state: LeadRoundState | null;
    question: RoundQuestion | null;
    ending: LeadRoundEnding | null;
    ending_pending?: LeadRoundEnding;
    target?: number;
    nearby?: LeadArea[];
  } | null;
}

export type CollectCommitResult =
  | { ok: true; counted: number; qualified: number; review: number; excluded: number; round_state: LeadRoundState }
  | { ok: false; why: "lease" | "offset" | "run" | "ended" };

export interface LeadDb {
  runClaim(runId: string, owner: string): Promise<boolean>;
  runRecordStart(runId: string, owner: string, apifyRunId: string, datasetId: string, capUsd: number): Promise<boolean>;
  runMarkUnknown(runId: string, owner: string): Promise<boolean>;
  runReconcile(
    runId: string,
    apifyRunId: string | null,
    datasetId: string | null,
    state: LeadRunState,
  ): Promise<boolean>;
  /** Takes or renews the lease; the generation, or null when another holds it. */
  runLease(runId: string, owner: string, seconds: number): Promise<number | null>;
  runRelease(runId: string, owner: string, gen: number): Promise<boolean>;
  collectCommit(
    runId: string,
    owner: string,
    gen: number,
    fromOffset: number,
    toOffset: number,
    page: CollectPage,
  ): Promise<CollectCommitResult>;
  /** usageUsd is the CHECK RUN's total so far, never this batch's delta: only what is new settles, so a job tried again charges once. */
  checkCommit(
    roundId: string,
    runId: string | null,
    results: { lead_id: string; email_state: LeadEmailState; checked_at: string }[],
    usageUsd: number,
    last: boolean,
  ): Promise<{ ok: boolean }>;
  roundEnd(roundId: string, ending: LeadRoundEnding): Promise<boolean>;
  /** Insert the run rows that are not there yet, by their deterministic ids, and answer every row of the round. */
  runsEnsure(
    rows: {
      id: string;
      tenant_id: string;
      round_id: string;
      purpose: "discover" | "check";
      term: string | null;
      actor: string;
      build: string;
      webhook_token_hash: string;
      cap_usd: number;
    }[],
  ): Promise<LeadRunRow[]>;
  round(id: string): Promise<LeadRoundRow | null>;
  run(id: string): Promise<LeadRunRow | null>;
  runsOfRound(roundId: string): Promise<LeadRunRow[]>;
  membersOfRound(roundId: string): Promise<LeadMemberRow[]>;
  /** place id -> lead id, for the place ids this workspace already holds (leads and folded listings). */
  placeIdsHeld(tenantId: string, placeIds: string[]): Promise<Map<string, string>>;
  sharesOf(
    tenantId: string,
    keys: { phones: string[]; emails: string[]; hosts: string[] },
  ): Promise<{ key: string; share: LeadShare }[]>;
  suppressed(
    tenantId: string,
    keys: { emails: string[]; placeIds: string[] },
  ): Promise<{ emails: Set<string>; placeIds: Set<string> }>;
  zoneOf(tenantId: string): Promise<string>;
  leadSearchesOn(tenantId: string): Promise<boolean>;
}

export interface LeadPorts {
  db: LeadDb;
  apify: ApifyClient;
  judge: LeadJudge;
  now(): Date;
  /** The edge's own origin, where the provider's webhook lands. */
  webhookBase: string;
  /** A run row's webhook token, derived from its id by the edge: made once (its sha256 on the row), never rewritten, rebuilt by any later job of ours. */
  webhookToken(runRowId: string): Promise<string>;
  /** scheduleJobOnce for this workspace: a second row for the same key is an answer, not an error. */
  schedule(
    kind: "lead_round_start" | "lead_collect" | "lead_check",
    payload: Record<string, unknown>,
    runAfterSeconds: number,
  ): Promise<void>;
  /**
   * One GET of a page as text, for the engine's own reading -- today the business's home page, for its mark (D6).
   * Answers null rather than throwing on anything that is not a page we can read. Absent in a runtime that has no
   * business fetching (a test world that models none): the collect then simply marks nothing.
   */
  fetchText?(url: string, timeoutMs: number): Promise<string | null>;
  /**
   * One GET of an image's bytes (00161): at most `maxBytes`, null on anything else -- a refusal, a timeout, a body
   * that runs longer. What the bytes are is the engine's to judge (mark-image.ts), never the server's word for them.
   */
  fetchBytes?(url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array | null>;
  /**
   * Keep a copy of a mark that passed (00161): the bytes under their own hash, served as the type they were read as.
   * Answers the stored path (`<sha256>.<ext>`), or null when it could not be kept; the same bytes twice are one copy.
   */
  storeMark?(bytes: Uint8Array, image: MarkImage): Promise<string | null>;
  /** Epoch ms: no provider or model call is started after this. */
  deadline: number;
}

/** The token that identifies a claim or a lease: the job's own id, so a retried job finds its own claim. */
export type Owner = string;
