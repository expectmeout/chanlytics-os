/**
 * What a website form's entry owes, once it is kept (00674; the Forms plan's 3.2, steps 7 and 8). Each is its own step,
 * run by its own subscriber from the entry's event (core SUBSCRIBERS form_entry_note, form_entry_notice,
 * form_entry_confirm; packages/jobs hands them here), each with its own outcome kept on the entry
 * (form_entry_settled), each safe to run twice:
 *
 *   note     what they asked, suggested on their page to wait for a member's Keep (person_note_suggest, 0007), once by
 *            the entry: a second run finds the first's note.
 *   notice   the owner told, by mail and phone as the business chooses, or on the bell alone for a form that arrived late
 *            or a workspace whose recipients could not be read, as before. Once by the entry: a second run finds the row
 *            and sends only a mail it still owes. A sign-up owing its ask waits for the ask's outcome, so the notice
 *            says what became of it: the ask's first outcome writes form_entry.asked, which runs this step again.
 *   confirm  a sign-up asked to confirm by email (signup-confirm.ts, 00489). Settled once: a second run finds it done
 *            and asks nothing, so a notice told again never emails the person again.
 *
 * A step that fails keeps why on the entry, says form_effect_failed, and throws, so its delivery tries again (and shows
 * in Health meanwhile). An entry gone (its person erased since) owes nothing. The moment an entry is judged by (late or
 * not, the day its note says) is when it arrived, never when a step runs.
 */
import {
  DEFAULT_TIMEZONE,
  signupAskLine,
  websiteFormLate,
  websiteFormNote,
  websiteFormNotice,
  websiteFormPerson,
  type FormEffect,
  type TenantId,
} from "@chanlytics/contracts";
import { suggestPersonNote } from "@chanlytics/db/facts";
import { findNotice } from "@chanlytics/db/notices";
import { findFormEntry, settleFormEffect, type FormEffectOutcome, type FormEntryRow } from "@chanlytics/db/people";
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { keepOnce, notifyOnceAs, onceKeyId } from "../shared/alerts/notify.js";
import { errField, logger } from "../shared/log.js";
import type { pg } from "../shared/pg.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import { entryAnswersFrom, type EntryAnswers } from "./form-entry.js";
import { askEntryToConfirm } from "./signup-confirm.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** An entry as a step reads it: its row, what was sent, who it is about, and when it arrived. */
interface EntryRead {
  tenantId: TenantId;
  row: FormEntryRow;
  answers: EntryAnswers;
  person: { name: string | null; email: string | null; phone: string | null };
  arrivedMs: number;
}

/** What a step came to: settled on the entry, or waiting for another step's outcome (the notice, for its ask). */
type StepDone = FormEffectOutcome | "waits";

/** The workspace's zone, which a late form's day is said in; the default zone where it cannot be read. */
const entryZone = (db: Db, tenantId: TenantId) =>
  findWorkspaceZone(db, tenantId)
    .catch(logAndGoOn("reading the zone a website form's day is said in", null))
    .then((tz) => tz || DEFAULT_TIMEZONE);

/** What they asked, waiting on their page for a member's Keep, once by the entry. */
async function keepEntryNote(db: Db, entry: EntryRead): Promise<StepDone> {
  const tz = await entryZone(db, entry.tenantId);
  const kept = await suggestPersonNote(db, {
    tenantId: entry.tenantId,
    contactId: entry.row.contact_id,
    body: websiteFormNote(entry.answers, { nowMs: entry.arrivedMs, tz }),
    source: "website",
    sourceId: onceKeyId(`form_entry_note:${entry.row.id}`),
  });
  // A note kept now, or before (`already`), or one the door will not keep (a person gone, their notes full) is done.
  return { state: "done", outcome: "refused" in kept ? kept.refused : "kept" };
}

/**
 * What a notice that could not be kept came to. The notice runs from two events (the entry's arrival, and its ask's
 * outcome), and two deliveries of it at the same moment both try to keep the bell's one row: the one that finds the row
 * taken has not failed. Its twin holds the notice and settles it, so this one waits; with no row at all, the keeping
 * failed, and the step is tried again.
 */
async function notKept(db: Db, entry: EntryRead, onceKey: string): Promise<StepDone> {
  const twin = await findNotice(db, {
    tenantId: entry.tenantId,
    kind: "website_form",
    sourceEvent: onceKeyId(onceKey),
  }).catch(logAndGoOn("looking for the notice a twin delivery may hold", null));
  return twin ? "waits" : { state: "failed", why: "not_kept", told: false };
}

/** The owner told of the entry, once by it; a sign-up owing its ask waits for the ask's outcome. */
async function tellOwner(db: Db, entry: EntryRead): Promise<StepDone> {
  const ask = entry.row.effects.confirm;
  if (entry.row.owed.includes("confirm") && !ask) return "waits";
  const tz = await entryZone(db, entry.tenantId);
  const askWord = ask?.state === "done" ? (ask.outcome ?? null) : null;
  const notice = websiteFormNotice(
    entry.answers,
    { contactId: entry.row.contact_id, ...entry.person },
    { nowMs: entry.arrivedMs, tz },
    signupAskLine(askWord),
  );
  const onceKey = `form_entry:${entry.row.id}`;
  const addressing = await loadTenantNotifications(db, entry.tenantId);
  if (websiteFormLate(entry.answers, entry.arrivedMs) || addressing.unread) {
    // Old news, or nobody known to mail: the bell alone, as before.
    const kept = await keepOnce(
      entry.tenantId,
      {
        kind: notice.kind,
        title: notice.subject,
        body: notice.body,
        route: notice.route,
        about: notice.about,
        onceKey,
      },
      { push: false },
      db,
    );
    return kept ? { state: "done", told: true } : notKept(db, entry, onceKey);
  }
  const reached = await notifyOnceAs({ tenantId: entry.tenantId, ...addressing }, { ...notice, onceKey }, { db });
  if (reached === "told") return { state: "done", told: true };
  // The bell's row and the phones went; the mail is owed, and the next try sends it alone.
  if (reached === "mail_owed") return { state: "failed", why: "mail_owed", told: true };
  return notKept(db, entry, onceKey);
}

/** A sign-up asked to confirm: an ask settled done is never asked again (runFormEffect). */
async function askEntryConfirm(db: Db, entry: EntryRead): Promise<StepDone> {
  if (!entry.person.email) return { state: "done", outcome: "no_email" };
  const outcome = await askEntryToConfirm(db, {
    tenantId: entry.tenantId,
    contactId: entry.row.contact_id,
    form: entry.answers,
    email: entry.person.email,
    nowMs: Date.now(),
  });
  return { state: "done", outcome };
}

const FORM_STEPS: Record<FormEffect, (db: Db, entry: EntryRead) => Promise<StepDone>> = {
  note: keepEntryNote,
  notice: tellOwner,
  confirm: askEntryConfirm,
};

/**
 * A step's outcome kept on its entry, and what failed said; a step that failed then throws, so its delivery tries again.
 * Where nothing was written there is nothing to say: the entry is gone, or a twin delivery settled the step done first
 * (the notice runs from two events, and the one that lost the bell's row to the other has not failed).
 */
async function settleStep(
  db: Db,
  step: { tenantId: TenantId; entryId: string; effect: FormEffect },
  outcome: FormEffectOutcome,
): Promise<void> {
  const kept = await settleFormEffect(db, { ...step, outcome });
  if (!kept.settled) return;
  const log = logger({ tenant_id: step.tenantId });
  if (outcome.state === "failed") {
    log.error("form_effect_failed", { entry_id: step.entryId, effect: step.effect, why: outcome.why ?? null });
    throw new Error(
      `the ${step.effect} of form entry ${step.entryId} failed (${outcome.why ?? "unknown"}); it tries again`,
    );
  }
  log.info("form_entry_processed", { entry_id: step.entryId, effect: step.effect, outcome: outcome.outcome ?? null });
}

/**
 * One step an entry owes, run and settled (packages/jobs, through the edge's run context). Nothing for an entry gone, a
 * step it does not owe, or one done already: a step done is never run again. Throws when the step failed, after keeping
 * why, so its delivery tries again.
 */
export async function runFormEffect(db: Db, tenantId: TenantId, entryId: string, effect: FormEffect): Promise<void> {
  const row = await findFormEntry(db, tenantId, entryId);
  if (!row || !row.owed.includes(effect) || row.effects[effect]?.state === "done") return;
  const step = { tenantId, entryId, effect };
  const answers = entryAnswersFrom(row.answers);
  const person = answers ? websiteFormPerson(answers) : null;
  if (!answers || !person) return settleStep(db, step, { state: "failed", why: "unreadable" });
  const entry: EntryRead = { tenantId, row, answers, person, arrivedMs: Date.parse(row.created_at) };
  let outcome: StepDone;
  try {
    outcome = await FORM_STEPS[effect](db, entry);
  } catch (e) {
    outcome = { state: "failed", why: errField(e).slice(0, 300) };
  }
  if (outcome === "waits") return;
  await settleStep(db, step, outcome);
}
