/**
 * The campaigns' view of the world: what a run's assembly, a playbook's run
 * and a person's broadcast need, named for what each means. The adapters
 * that know the tables are apps/edge/lib/playbooks.ts (the run, hourly or at
 * a person's request) and apps/dashboard/src/server/campaign-ports.ts (a
 * person's broadcast, approve, cancel, the playbook's check).
 */
import type { Audience, DecisionSubject, DecisionVerb, NumberHealth, ParamSpec, PersonRowVM, PersonVisitsDto } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

/* ---- The assembly: the rows, then the job ---- */

/** A broadcast row as it is made: the assembly writes exactly these columns. */
export interface NewBroadcast {
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  audience: Audience;
  state: "scheduled" | "pending_approval";
  scheduled_for: string;
  recipient_count: number;
  created_by: string | null;
  playbook_id?: string;
  run_for?: string;
}
/** One person on the run, with the words their row keeps for the slots (a visit run's), or none. */
export interface NewRecipient { contact_id: string; facts: Record<string, string> | null }

export interface AssemblePorts {
  /** The broadcast row, its id back; throws when it cannot be written. */
  create(row: NewBroadcast): Promise<string>;
  /** The people on it, all of them in one call (the adapter chunks); throws when they cannot be written. */
  enrol(broadcastId: string, rows: NewRecipient[]): Promise<void>;
  /** The row says why it failed. */
  fail(broadcastId: string, failure: string): Promise<void>;
  /** The send job, as this tenant, through the ledger; throws when the ledger refuses. */
  schedule(broadcastId: string, at: Date): Promise<void>;
}
export interface AssembleCommand { broadcast: NewBroadcast; recipients: NewRecipient[]; sendAt: Date | null }
export type Assembled =
  | { ok: true; id: string }
  | { ok: false; id: string | null; failure: "run_not_created" | "recipients_write_failed" | "schedule_failed"; error: string };

/* ---- The playbook's run ---- */

/** The playbook as its row reads. A run names only what it uses. */
export interface PlaybookRow {
  id: string;
  tenant_id: string;
  name: string;
  trigger: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: unknown;
  policy_class: string;
  state: string;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  created_by: string | null;
  last_run_for: string | null;
}

/** The workspace as the run reads it once per tenant: the people, the modes, the number, the touches, the calendar. */
export interface RunContext {
  tz: string;
  now: Date;
  people: PersonRowVM[];
  modes: Map<string, string>;
  health: NumberHealth;
  /** When each person last heard from each playbook, and from any; contact id → ms. */
  touches: { byThis: Map<string, Map<string, number>>; byAny: Map<string, number> };
  /** The workspace's calendar: a visit playbook runs only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
  visits: Map<string, PersonVisitsDto>;
}

/** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
export type RunBy = { kind: "system" } | { kind: "user"; userId: string };

export type RunOutcome =
  | { outcome: "sent" | "held"; broadcast_id: string; eligible: number; mode: string; state: string }
  | { outcome: "empty"; eligible: 0; mode: string }
  | { outcome: "off"; mode: string; skipped: "never" | "template_not_approved" | "number_flagged" | "already_ran_today" | "no_calendar" }
  | { outcome: "failed"; error: string };

export interface RunPlaybookPorts extends AssemblePorts {
  /** The template as Meta has it now, by name and language; null when gone. */
  template(name: string, language: string): Promise<{ meta_status: string | null } | null>;
  /** Whether a run for this local day was already made (the unique index's fact, read first). */
  alreadyRan(playbookId: string, runFor: string): Promise<boolean>;
  /** The run recorded: the event, and the playbook's last run. Never throws. */
  record(playbookId: string, runFor: string, at: Date, data: Record<string, unknown>): Promise<void>;
  /** The ledger: whose decision the send was. */
  decide(d: { broadcastId: string; by: RunBy; payload: Record<string, unknown> }): Promise<void>;
  /** The owner told that a run waits for them. */
  notify(subject: string, body: string): Promise<void>;
}
export interface RunPlaybookCommand {
  playbook: PlaybookRow;
  ctx: RunContext;
  /** The local day the run is for; one run per playbook per day. Read from the clock when absent. */
  runFor?: string;
  by: RunBy;
}

/* ---- The dashboard's verbs ---- */

/** The template as Meta holds it, read by id in this workspace. */
export interface TemplateRow { id: string; name: string; language: string; meta_status: string | null; category: string | null; variables: unknown; title: string | null }

export interface TemplateValuesPorts {
  /** Null when there is no such template here; throws when it cannot be read. */
  template(id: string): Promise<TemplateRow | null>;
  /** The booking link on file, or null. */
  bookingLink(): Promise<string | null>;
}

/** A run or broadcast as the route's scope loaded it. */
export interface BroadcastRef { id: string; tenant_id: string; state: string; name: string; recipient_count: number | null; playbook_id: string | null }

export interface CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts {
  /** Everyone, with their visits as of now, the way the People page counts them. */
  people(now: Date): Promise<PersonRowVM[]>;
  /** A list kept by hand: its name and who is on it; null when there is no such list here. */
  savedList(id: string): Promise<{ name: string; memberIds: string[] } | null>;
  /** The active WhatsApp number's health as Meta rated it; null when none is connected. */
  number(): Promise<NumberHealth | null>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
export interface CreateBroadcastCommand { userId: string; body: unknown; now: Date }

export interface ApproveRunPorts {
  /** pending_approval → scheduled, only while pending. True iff a row changed. */
  release(broadcastId: string): Promise<boolean>;
  /** Back to waiting, when the job could not be made. */
  hold(broadcastId: string): Promise<void>;
  schedule(broadcastId: string, at: Date): Promise<void>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}

export interface CancelBroadcastPorts {
  /** The scheduled send withdrawn from the ledger; how many jobs. */
  withdraw(broadcastId: string): Promise<number>;
  /** → canceled, only from the state the row was read in. True iff a row changed. */
  cancel(broadcastId: string, fromState: string): Promise<boolean>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
