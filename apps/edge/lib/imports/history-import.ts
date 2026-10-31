/**
 * A connection's history brought in, a part at a time (decision 0073, R19 to R21; 00478's history_import). A connect
 * starts a source (startHistory): its row in the imports ledger queued, and its first part on the job ledger. Each part
 * reads on from the ledger's cursor until its time is up (PART_MS, never past the tick's deadline), notes what it brought
 * and where it stands, and schedules the next while there is more. A part claimed again keeps nothing twice: every
 * write is once by the provider's id. A provider that cannot be asked throws, and the job ledger tries the part again;
 * a grant that is gone stops the source, said on its row with Try again (imports/again).
 *
 * What a mailbox brings is that mailbox's (decision 0086): its own row, cursor and run (contracts PER_MAILBOX_SOURCES),
 * so two mailboxes read side by side, each from its own place. A run holds its row: Stop on Connections, or a later run
 * of the same mailbox (Resume, a reconnect), ends the parts of the one before as they wake (runHolds). Its owner chose
 * as it connected whether its six months come at all (mailbox_connections.history); from now on, they come only when
 * asked for on its row (bringMailboxHistory).
 *
 *   mailbox    six months of mail from people, each into their thread as before Chanlytics (mail-history.ts)
 *   contacts   the owner's contacts and the people they wrote to, into People (mail-people.ts)
 *   calendar   a calendar read through the mailbox's grant, read now rather than on the hour (calendar-part.ts)
 *   whatsapp_contacts, whatsapp_history
 *              what a kept WhatsApp Business app shares as its number connects: asked of Meta, then brought from
 *              the deliveries the webhook keeps (whatsapp-history.ts)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMPORT_SOURCES,
  IMPORT_STOPPED_WORDS,
  PER_MAILBOX_SOURCES,
  SECOND_MS,
  type ImportSource,
  type MailboxHistory,
  type MailboxProvider,
} from "../packages/contracts.js";
import { grantHolds } from "../packages/channels.js";
import {
  importRowOf,
  importsOf,
  noteCalendarGrant,
  noteImport,
  patchMailboxConnection,
  type Database,
  type Json,
  type MailboxConnectionRow,
} from "../packages/db.js";
import { retryWait, scheduleJobOnce, type ClaimedJob, type JobContext } from "../packages/jobs.js";
import { errField, logger, type Logger } from "../log.js";
import { mailHistoryPart } from "./mail-history.js";
import { contactsPart } from "./mail-people.js";
import { calendarPart } from "./calendar-part.js";
import { HISTORY_PARTS, SETTLE_AFTER_MS, whatsappContactsPart, whatsappHistoryPart } from "./whatsapp-history.js";

type Db = SupabaseClient<Database>;

/** How long one part reads before it notes where it stands and hands on to the next: well inside a tick's minute. */
const PART_MS = 40 * SECOND_MS;

/** One part as a source's runner is handed it. */
export interface Part {
  tenantId: string;
  /** The connection the history is read through (a mailbox's id); null for a source that has none. */
  connectionId: string | null;
  /** The run it is a part of: its writes change nothing once another run, or Stop, holds the row (0086). */
  run: string;
  /** This part's number in its run, from 1. */
  n: number;
  /** No provider call starts after this. */
  until: number;
  log: Logger;
}

/** What a part came to: more to read (its next is scheduled), or the source is done or stopped (noted already). */
export interface PartOutcome {
  more: boolean;
  /** How long the next part waits: the provider paced the reads (mail-history.ts restAfterPace). Absent, it runs now. */
  restMs?: number;
}

type Runner = (db: Db, part: Part) => Promise<PartOutcome>;

/** The sources a part runs here. The clients' file is the browser's; Google's reviews are the profile sync's. */
const RUNNERS: Readonly<Partial<Record<ImportSource, Runner>>> = {
  mailbox: mailHistoryPart,
  contacts: contactsPart,
  calendar: calendarPart,
  whatsapp_contacts: whatsappContactsPart,
  whatsapp_history: whatsappHistoryPart,
};

const runnerOf = (source: ImportSource): Runner | null => RUNNERS[source] ?? null;

const isSource = (v: unknown): v is ImportSource =>
  typeof v === "string" && (IMPORT_SOURCES as readonly string[]).includes(v);

/** A part's place, as its payload carries it: the run (a connect's "1", or Try again's moment) and its number. */
function seqOf(raw: unknown): { run: string; n: number } {
  const [run = "1", n = "1"] = typeof raw === "string" ? raw.split(":") : [];
  const num = Number(n);
  return { run: run || "1", n: Number.isInteger(num) && num > 0 ? num : 1 };
}

/** The next part of a run on the job ledger, once (its key holds the workspace, the source, the run and the number). */
async function schedulePart(
  db: Db,
  p: { tenantId: string; source: ImportSource; run: string; n: number; connectionId: string | null; dueAt?: Date },
): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: p.tenantId,
    kind: "history_import",
    dueAt: p.dueAt ?? new Date(),
    payload: {
      source: p.source,
      seq: `${p.run}:${p.n}`,
      ...(p.connectionId ? { connection_id: p.connectionId } : {}),
    },
  });
}

/** The mailbox whose row a source's run writes: its own for what a mailbox brings, none for the workspace's sources. */
const ledgerMailboxOf = (source: ImportSource, connectionId: string | null): string | null =>
  PER_MAILBOX_SOURCES.includes(source) ? connectionId : null;

/**
 * Whether a part's run still holds its mailbox's row (0086): a row Stop (or a failure) ended, or one a later run of the
 * mailbox took, ends the parts of the run before as they wake, so two parts never read one mailbox at once. A row an
 * earlier ledger wrote names no run, and holds every part. The workspace's own sources are read as before.
 */
async function runHolds(
  db: Db,
  p: { tenantId: string; source: ImportSource; connectionId: string | null; run: string },
): Promise<boolean> {
  const mailbox = ledgerMailboxOf(p.source, p.connectionId);
  if (!mailbox) return true;
  const row = await importRowOf(db, p.tenantId, p.source, mailbox);
  if (!row) return true;
  return row.state !== "failed" && (row.run === null || row.run === p.run);
}

/**
 * A source started (a connect, or Bring in on a mailbox that chose from now on) or started again where it stopped (Try
 * again, Resume, a reconnect): its row queued and held by the new run, its counts and cursor emptied for a first run and
 * kept for a second (it reads on from where it stopped, adding to what came), and its first part scheduled. What a
 * mailbox brings is its own row, so a first run starts afresh whatever another mailbox brought.
 */
export async function startHistory(
  db: Db,
  p: { tenantId: string; source: ImportSource; connectionId: string | null; via: string | null; again: boolean },
): Promise<void> {
  if (!runnerOf(p.source)) throw new Error(`history_import: nothing here brings ${p.source} in`);
  const run = p.again ? String(Date.now()) : "1";
  const mailbox = ledgerMailboxOf(p.source, p.connectionId);
  await noteImport(db, {
    tenantId: p.tenantId,
    source: p.source,
    state: "queued",
    via: p.via,
    ...(mailbox ? { connectionId: mailbox, run, take: true } : {}),
    ...(p.again ? { add: true } : { counts: {}, partsDone: 0, cursor: {} }),
  });
  await schedulePart(db, { tenantId: p.tenantId, source: p.source, run, n: 1, connectionId: p.connectionId });
}

/**
 * What a mailbox brings beside its mail (decision 0073, R19, R20), started as it connects: its six months unless its
 * owner chose from now on (0086), its people where the owner left the contacts ticked, and its calendar where they left
 * that ticked, which becomes the calendar the workspace reads (calendar_grant_note). A reconnect starts again only what
 * of its own stopped, from where it stopped. Nothing here undoes a connect that stands: a start that fails is logged,
 * and Connections offers Try again.
 */
export async function startMailboxHistory(
  db: Db,
  p: {
    tenantId: string;
    mailboxId: string;
    provider: MailboxProvider;
    scopes: readonly string[];
    first: boolean;
    /** What its owner chose as it connected: from now on brings no six months now. */
    history: MailboxHistory;
    /** Who connected it, for the settings' record of the calendar it brings. */
    by: string | null;
    log: Logger;
  },
): Promise<void> {
  const wanted: ImportSource[] = p.first && p.history === "from_now" ? [] : ["mailbox"];
  if (grantHolds(p.provider, p.scopes, "contacts")) wanted.push("contacts");
  const calendar = grantHolds(p.provider, p.scopes, "calendar");
  if (calendar) wanted.push("calendar");
  try {
    if (calendar)
      await noteCalendarGrant(db, {
        tenantId: p.tenantId,
        mailboxId: p.mailboxId,
        provider: p.provider,
        on: true,
        by: p.by,
      });
    // A reconnect: what stopped (signed out, most often) starts again from where it stopped; what is done stays done.
    // What a mailbox brings is its own row's; the calendar is the workspace's.
    const stoppedNow = p.first
      ? null
      : new Set(
          (await importsOf(db, p.tenantId))
            .filter(
              (r) =>
                isSource(r.source) &&
                r.state === "failed" &&
                r.connection_id === ledgerMailboxOf(r.source, p.mailboxId),
            )
            .map((r) => r.source),
        );
    for (const source of wanted) {
      if (stoppedNow && !stoppedNow.has(source)) continue;
      await startHistory(db, {
        tenantId: p.tenantId,
        source,
        connectionId: p.mailboxId,
        via: p.provider,
        again: !p.first,
      });
    }
  } catch (e) {
    p.log.error("history_start_failed", { mailbox: p.mailboxId, error: e instanceof Error ? e.message : String(e) });
  }
}

/** A mailbox on Connections, as its history's acts read it. */
type MailboxOf = Pick<MailboxConnectionRow, "tenant_id" | "id" | "provider" | "history">;

/**
 * Stop, on a mailbox's row in Connections (0086): what it is still bringing in stops where it stands, said on its row
 * (IMPORT_STOPPED_WORDS.byYou), and Stop takes the row from every run, so a part mid-read writes nothing over it and
 * the next ends as it wakes. What came in is kept. Answers whether anything was coming in.
 */
export async function stopMailboxHistory(db: Db, m: MailboxOf, nowMs: number): Promise<boolean> {
  const going = (await importsOf(db, m.tenant_id)).filter(
    (r) => r.connection_id === m.id && (r.state === "queued" || r.state === "running"),
  );
  for (const r of going)
    await noteImport(db, {
      tenantId: m.tenant_id,
      source: r.source,
      connectionId: m.id,
      state: "failed",
      error: IMPORT_STOPPED_WORDS.byYou,
      add: true,
      run: `stopped:${nowMs}`,
      take: true,
    });
  return going.length > 0;
}

/**
 * Resume after Stop, or Try again after a failure, on a mailbox's row (0086): what of its own stopped starts again from
 * where it stopped, a run of its own. Answers whether anything had stopped.
 */
export async function resumeMailboxHistory(db: Db, m: MailboxOf): Promise<boolean> {
  const stopped = (await importsOf(db, m.tenant_id)).filter((r) => r.connection_id === m.id && r.state === "failed");
  for (const r of stopped)
    if (isSource(r.source))
      await startHistory(db, {
        tenantId: m.tenant_id,
        source: r.source,
        connectionId: m.id,
        via: m.provider,
        again: true,
      });
  return stopped.length > 0;
}

/**
 * Bring in the last 6 months, on a mailbox its owner connected from now on (0086): its first run starts, its window the
 * six months before it connected (mail-history.ts firstWindow), which ends where the live read began, and its choice
 * becomes the six months. Once: a mailbox with a run of its own resumes that instead. Answers whether it started.
 */
export async function bringMailboxHistory(db: Db, m: MailboxOf): Promise<boolean> {
  if (m.history !== "from_now") return false;
  if ((await importsOf(db, m.tenant_id)).some((r) => r.source === "mailbox" && r.connection_id === m.id)) return false;
  await startHistory(db, {
    tenantId: m.tenant_id,
    source: "mailbox",
    connectionId: m.id,
    via: m.provider,
    again: false,
  });
  await patchMailboxConnection(db, { tenantId: m.tenant_id, id: m.id, patch: { history: "six_months" } });
  return true;
}

/**
 * What a kept WhatsApp Business app shares (decision 0073, R12, R21), started as its number connects
 * (connect-number.ts): both rows queued with the number and the moment on their cursor, the ask of each on the job
 * ledger now, and its settling a day and a little later. A run of its own each connect: a number connected again is
 * offered its history again by Meta. Nothing here undoes a connect that stands: a start that fails is logged, and the
 * rows say nothing came.
 */
export async function startWhatsappHistory(
  db: Db,
  p: { tenantId: string; channelId: string; nowMs: number; log: Logger },
): Promise<void> {
  const run = String(p.nowMs);
  const cursor = { channel: p.channelId, connected_at: new Date(p.nowMs).toISOString() } as Json;
  try {
    for (const source of ["whatsapp_contacts", "whatsapp_history"] as const) {
      await noteImport(db, {
        tenantId: p.tenantId,
        source,
        state: "queued",
        via: "whatsapp",
        counts: {},
        partsDone: 0,
        partsTotal: source === "whatsapp_history" ? HISTORY_PARTS : null,
        cursor,
      });
      await schedulePart(db, {
        tenantId: p.tenantId,
        source,
        run,
        n: 1,
        connectionId: p.channelId,
        dueAt: new Date(p.nowMs),
      });
      const settleAt = new Date(p.nowMs + SETTLE_AFTER_MS);
      await schedulePart(db, { tenantId: p.tenantId, source, run, n: 2, connectionId: p.channelId, dueAt: settleAt });
    }
  } catch (e) {
    p.log.error("history_start_failed", { channel: p.channelId, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * A delivery the webhook kept, handed on (decision 0073, R21): the kept app's contacts or a chunk of its chats, brought
 * a part at a time from the intake ledger's copy under the delivery's key. One run per delivery and source, so Meta's
 * redelivery of the same bytes is the same run, scheduled once.
 */
export async function handDeliveryOn(
  db: Db,
  p: { tenantId: string; source: "whatsapp_contacts" | "whatsapp_history"; deliveryKey: string },
): Promise<void> {
  const run = p.deliveryKey.replace(/^sha256:/, "").slice(0, 16);
  await schedulePart(db, { tenantId: p.tenantId, source: p.source, run, n: 1, connectionId: p.deliveryKey });
}

/** The job runner's port (packages/jobs context `imports`): one part of the job's source, and the next scheduled. */
export function historyImports(db: Db): NonNullable<JobContext["imports"]> {
  return {
    part: async (job: ClaimedJob, deadline: number) => {
      const source = job.payload.source;
      if (!isSource(source)) throw new Error("history_import: payload.source is not a source");
      const run = runnerOf(source);
      if (!run) throw new Error(`history_import: nothing here brings ${source} in`);
      const { run: runId, n } = seqOf(job.payload.seq);
      const connectionId = typeof job.payload.connection_id === "string" ? job.payload.connection_id : null;
      const log = logger({ tenant_id: job.tenant_id });
      if (!(await runHolds(db, { tenantId: job.tenant_id, source, connectionId, run: runId }))) {
        log.info("history_part", { source, run: runId, n, more: false, ended: "not_its_run" });
        return;
      }
      const out = await run(db, {
        tenantId: job.tenant_id,
        connectionId,
        run: runId,
        n,
        until: Math.min(deadline, Date.now() + PART_MS),
        log,
      }).catch(async (err: unknown) => {
        // The job ledger tries the part again (RETRY_WAITS_MS); a throw it will not try again says so on the source's
        // row, with Try again (imports/again), so a stop is never only a failed job.
        const last = retryWait({ kind: job.kind, attempts: job.attempts ?? 1 }) === null;
        log.error("history_part_failed", {
          source,
          run: runId,
          n,
          attempts: job.attempts ?? 1,
          last,
          error: errField(err),
        });
        if (last)
          await noteImport(db, {
            tenantId: job.tenant_id,
            source,
            connectionId: ledgerMailboxOf(source, connectionId),
            run: runId,
            state: "failed",
            error: IMPORT_STOPPED_WORDS.failed,
            add: true,
          }).catch((e: unknown) => log.error("history_part_failed", { source, stage: "note", error: errField(e) }));
        throw err;
      });
      log.info("history_part", { source, run: runId, n, more: out.more });
      // A part the provider paced ends as one that ran out of time does: no failed try, and the next waits its rest.
      const dueAt = out.restMs ? new Date(Date.now() + out.restMs) : undefined;
      if (out.more)
        await schedulePart(db, { tenantId: job.tenant_id, source, run: runId, n: n + 1, connectionId, dueAt });
    },
  };
}
