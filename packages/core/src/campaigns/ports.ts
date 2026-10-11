/**
 * The campaigns' view of the world: what a run's assembly, a playbook's run
 * and a person's broadcast need, named for what each means. The adapters
 * that know the tables are apps/edge/lib/playbooks.ts (the run, hourly or at
 * a person's request) and apps/dashboard/src/server/campaign-ports.ts (a
 * person's broadcast, approve, cancel, the playbook's check).
 */
import type {
  Audience,
  ChannelsReady,
  DecisionSubject,
  DecisionVerb,
  NumberHealth,
  ParamSpec,
  PersonRowVM,
  DealPaceVM,
  ListRef,
  Membership,
  PersonVisitsDto,
  TenantId,
} from "@chanlytics/contracts";
import type { Json, MessageVersionRow } from "@chanlytics/db";

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
  /** The channels the run may go by (contracts reach-for.ts): `broadcasts.channels`, each person on one of them. */
  channels: string[];
}
/** One person on the run, with the words their row keeps for the slots (a visit run's), or none. */
export interface NewRecipient {
  contact_id: string;
  facts: Record<string, string> | null;
  /** The channel the run reaches them on, picked once at enrolment (contracts reachFor): `broadcast_recipients.channel`. */
  channel: string;
}

/** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
export type RunBy = { kind: "system" } | { kind: "user"; userId: string };

/**
 * Whose decision a run's send is, and what the ledger keeps of it: a member's (a broadcast's composer, a Run now) or the
 * system's (the sweep's, under the mode the owner chose). Written with the run, in its transaction.
 */
export interface AssembleDecision {
  by: RunBy;
  payload: Json;
}
/** The run made: its id, and its decision's when one was asked for (null for a run that waits for a person). */
export interface AssembledRun {
  id: string;
  decisionId: string | null;
}

export interface AssemblePorts {
  /**
   * The run, its people, its send job when `sendAt` is set and the send_broadcast decision on it when `decision` is
   * given, written whole in one transaction (00381 assemble_broadcast): the run's id back with the decision's, or a
   * throw, and then nothing was written. A run that waits for a person is made with no decision: its approval is its
   * decision (ApproveRunPorts).
   */
  assemble(
    row: NewBroadcast,
    recipients: NewRecipient[],
    sendAt: Date | null,
    decision: AssembleDecision | null,
  ): Promise<AssembledRun>;
  /**
   * How many campaign emails or texts the workspace sent on this channel in the calendar month `at` falls in, in its zone,
   * that left, may have left or wait to go (packages/db campaignMonthSent): what that month's allowance has spent (contracts
   * CAMPAIGN_MONTH_ALLOWANCE). `at` is the moment the run opens, which is when its people are counted against the month: a
   * broadcast made on the 28th for the 1st counts against the new month, not the one it was made in, and a playbook's run
   * against the month of the moment it goes. Required, so no caller counts the month it was made in by leaving it out.
   * Throws when it cannot be counted.
   */
  monthSent(channel: "email" | "sms", at: Date): Promise<number>;
  /**
   * People of a run just assembled, held at once: each still queued is skipped, with `reason`, as the send would have
   * held them (allowance.ts; the week's breath). A person the send already claimed or settled is left as it is. Answers
   * who it skipped (the rows it changed, never one it did not) and, where a step of the write failed, its words: the
   * people not skipped stay queued, and the send's own check holds them all the same (overAllowance; LEFT_OUT_FACTS).
   * May throw, and then none is counted as skipped.
   */
  holdRecipients(
    broadcastId: string,
    contactIds: string[],
    reason: string,
  ): Promise<{ skipped: readonly string[]; error: string | null }>;
}
export interface AssembleCommand {
  broadcast: NewBroadcast;
  recipients: NewRecipient[];
  sendAt: Date | null;
  /**
   * The people of `recipients` the month's allowance already holds (allowance.ts pastTheMonth), by contact: they are
   * enrolled with everyone, and held the moment the run exists, so its report says so before anything is sent.
   */
  held: readonly string[];
  /**
   * The people of `recipients` a send by hand leaves out, having heard from a campaign or a broadcast within the week
   * (the week's breath, create-broadcast.ts), by contact: enrolled with everyone, their row marked in the run's own write
   * (contracts LEFT_OUT_FACTS, which the send's check at the wire skips them for), and skipped with RECIPIENT_REASON_HEARD
   * the moment the run exists, before anyone held for the month. A playbook's run names none: its moment draws by its own
   * reading of the breath (contracts eligibleForPlaybook).
   */
  leftOut: readonly string[];
  /** Whose decision the send is, kept with the run; none for a run that waits for a person. */
  decision: AssembleDecision | null;
}
/**
 * The run made (its id, and its decision's when one was asked for), or why not. `unheld` is how many of the people to
 * hold at enrolment were not written as held: they are queued, and the send holds them at the wire, so nothing is lost;
 * the run's record says so. `leftOutUnwritten` is the same of the people left out for the breath: queued, and held at
 * the wire by their row's mark, so the receipt claims no skip it did not write.
 */
export type Assembled =
  | { ok: true; id: string; decisionId: string | null; unheld: number; leftOutUnwritten: number }
  | { ok: false; error: string };

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
  /** The list of the workspace's own a saved_list playbook runs on (00155); null otherwise, and when it was deleted. */
  list_id?: string | null;
  /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. */
  list_key?: string | null;
  /** The channels it may go by (`playbooks.channels`); absent or empty on a row made before: WhatsApp alone. */
  channels?: string[] | null;
  /** Its last day (00395), YYYY-MM-DD by the business's clock: a run for a day past it is off as `ended`. Absent before it. */
  until?: string | null;
  /** Until when it runs on trial (00395): before it, a run its class would send by itself waits (contracts effectiveMode). */
  trial_until?: string | null;
}

/** The workspace as the run reads it once per tenant: the people, the modes, the number, the touches, the calendar. */
export interface RunContext {
  tz: string;
  now: Date;
  people: PersonRowVM[];
  modes: Map<string, string>;
  health: NumberHealth;
  /**
   * What the workspace can send on now, channel by channel (contracts channelsReady): its WhatsApp number's health, its
   * texting line, its mailbox. The message's own versions are not in it: the run puts them in (message-channels.ts).
   */
  ready: ChannelsReady;
  /** When each person last heard from each playbook, from any, and had a proposal follow-up; contact id → ms. */
  touches: {
    byThis: Map<string, Map<string, number>>;
    /**
     * The breath's: their latest message by any run within a week of the run's now, either side (packages/db touchIndex
     * by contracts heardWithin), which the run asks the same predicate of (contracts eligibleForPlaybook).
     */
    byAny: Map<string, number>;
    followUps: Map<string, number>;
    /** The latest follow-up by person and by what it was about (contracts followUpKey, 0029): which proposals had theirs. */
    followUpKeys: Map<string, Map<string, number>>;
  };
  /** The workspace's calendar: a visit playbook runs only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
  visits: Map<string, PersonVisitsDto>;
  /**
   * Who is on a list a saved_list playbook runs on, by its reference (contracts lists.ts membersOf, with no one
   * looking): its people, or why it can't be counted; null when it is gone.
   */
  listMembers(ref: ListRef): (Membership & { rule?: unknown }) | null;
  /** Deals are on here (dealsAreOn, 0008): the proposal follow-up runs only then (0006). */
  dealsOn: boolean;
  /** The workspace's pace (contracts dealPaceOf): when a proposal waits, for the follow-up; null without one. */
  pace: DealPaceVM | null;
}

export type RunOutcome =
  /** Sent: when it really goes, and the moment asked for when the hours moved it to nine (else null). */
  | {
      outcome: "sent";
      broadcast_id: string;
      eligible: number;
      mode: string;
      state: string;
      scheduled_for: string;
      moved_from: string | null;
    }
  | { outcome: "held"; broadcast_id: string; eligible: number; mode: string; state: string }
  | { outcome: "empty"; eligible: 0; mode: string }
  | {
      outcome: "off";
      mode: string;
      skipped:
        | "never"
        | "template_not_approved"
        | "number_flagged"
        | "already_ran_today"
        | "no_calendar"
        | "no_list"
        | "list_uncounted"
        | "deals_off"
        /** A run for a day past the campaign's last (00395 `until`): it has ended, and sends nothing more. */
        | "ended";
    }
  | { outcome: "failed"; error: string };

export interface RunPlaybookPorts extends AssemblePorts {
  /**
   * The message of this name and language, as the rows the workspace holds of it now, whatever their channel (db
   * messageVersionRowsOf): WhatsApp's as Meta has it, and the email's and the text's, written here and approved the
   * moment they were saved. contracts campaignMessageOf picks the versions out of them: which of the playbook's ticks the
   * message can be said on, and its category, its purpose, which the run enrols by with its moment's class (contracts
   * enrolPurpose). None when it has no row (gone). Throws when it cannot be read: unreadable is not withdrawn, and a
   * version that could not be looked for is not one the workspace lacks.
   */
  message(name: string, language: string): Promise<MessageVersionRow[]>;
  /** Whether a run for this local day was already made (the unique index's fact, read first). */
  alreadyRan(playbookId: string, runFor: string): Promise<boolean>;
  /** The run recorded: the event, and the playbook's last run. Never throws. */
  record(playbookId: string, runFor: string, at: Date, data: Record<string, unknown>): Promise<void>;
  /**
   * The owner told that a run waits for them, or goes by itself unless they stop it, with the run it is about: the bell's
   * row and the phone open THAT run, where its Approve, Skip and Stop are. It named none, and opened Campaigns' home.
   */
  notify(subject: string, body: string, runId: string): Promise<void>;
}
export interface RunPlaybookCommand {
  playbook: PlaybookRow;
  ctx: RunContext;
  /** The local day the run is for; one run per playbook per day. Read from the clock when absent. */
  runFor?: string;
  by: RunBy;
}

/* ---- The dashboard's verbs ---- */

export interface TemplateValuesPorts {
  /**
   * The rows of the message this id names, whatever their channel (db messageVersionRowsOf, by id): the version the id
   * belongs to and its siblings on the other channels, WhatsApp's as Meta has it, an email's and a text's as they were
   * written here. Any version's id names the message, and contracts campaignMessageOf picks its versions out of the rows.
   * `[]` when this workspace holds no such version. Throws when it cannot be read: unreadable is not absent.
   */
  message(id: string): Promise<MessageVersionRow[]>;
  /** The booking link on file, or null. */
  bookingLink(): Promise<string | null>;
  /**
   * The link a customer leaves the business a review at, as its Google listing keeps it (db reviewLinkOf, 00394), or
   * null: no listing, or none bound from a Business Profile. Throws when it cannot be read: unreadable is not absent.
   */
  reviewLink(): Promise<string | null>;
}

/** A run or broadcast as the route's scope loaded it. */
export interface BroadcastRef {
  id: string;
  tenant_id: TenantId;
  state: string;
  name: string;
  recipient_count: number | null;
  playbook_id: string | null;
  run_for?: string | null;
  /** Who the run is for; a reach-out's says so (contracts isReachOutRun). */
  audience?: unknown;
  /** When it is set to go: a reach-out's first send. */
  scheduled_for?: string | null;
}

/** A list as a send reads it: its people, or why it can't be counted. */
export type ListCount = { label: string; memberIds: string[]; rule?: unknown } | { label: string; unknown: string };

export interface CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts {
  /** The business's clock, for the hours a send may go out in. */
  timezone(): Promise<string>;
  /** Everyone, with their visits as of now, the way the People page counts them. */
  people(now: Date): Promise<PersonRowVM[]>;
  /**
   * One list, resolved and counted the one way (contracts lists.ts resolveList, membersOf): a built-in or a saved list,
   * its name and who is on it -- or, when it can't be counted here (a calendar that was not read, a rule this build
   * cannot read), its name and why, in the page's words. Null when there is no such list here.
   */
  list(ref: ListRef, now: Date): Promise<ListCount | null>;
  /**
   * What the workspace can send on now (contracts channelsReady), and the active WhatsApp number's health as Meta rated
   * it (null when none is connected): one read of the rows each is judged by.
   */
  channels(): Promise<{ ready: ChannelsReady; health: NumberHealth | null }>;
  /**
   * Who a run of any kind reached from the week's breath before `now` on (contracts PLAYBOOK_BREATH_MS), or is about to
   * reach, and when: contact id -> the time of every touch of theirs, the read the composer
   * counts who a send leaves out by (packages/db recentTouches), so the page, Ask's card and the people a send skips are
   * one number. A send leaves out those with one within a week of it, either side, for the time it goes (contracts
   * leftOutBy). Read once per send, at its press, and only when it breathes. Throws when it cannot be read: "nobody
   * heard" is the reading that messages people twice.
   */
  touches(now: Date): Promise<Readonly<Record<string, readonly string[]>>>;
}
export interface CreateBroadcastCommand {
  userId: string;
  /**
   * The body as the route was handed it, the verb's own to judge (create-broadcast.ts `asked`): { template_id, params,
   * audience, channels?, scheduled_for?, name?, breathe? }. `breathe` is whether the send leaves out the people who heard
   * from a campaign or a broadcast within the week: absent (or null) is true; false only from the composer's own switch.
   */
  body: unknown;
  now: Date;
}

export interface ApproveRunPorts {
  /** The business's clock, for the hours a send may go out in. */
  timezone(): Promise<string>;
  /** Whether the workspace is paused (`tenants.status = 'paused'`): nothing is approved while it is. Throws when it cannot be read. */
  paused(): Promise<boolean>;
  /**
   * The run released for `at` (pending_approval → scheduled, the row carrying the time its job carries: 00119), its
   * send job written when `job` says so, and the approval recorded as the approver's with `decision` as its payload,
   * in one transaction (00353 approve_broadcast): the decision's id. Null when the run was no longer waiting, and then
   * nothing was written. Throws when it failed, and then nothing was written either: the run waits, as it was.
   */
  approve(broadcastId: string, at: Date, o: { job: boolean; decision: Json }): Promise<string | null>;
}

export interface CancelBroadcastPorts {
  /** The scheduled send withdrawn from the ledger; how many jobs. */
  withdraw(broadcastId: string): Promise<number>;
  /** → canceled, only from the state the row was read in. True iff a row changed. */
  cancel(broadcastId: string, fromState: string): Promise<boolean>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
