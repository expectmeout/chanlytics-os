/**
 * A sequence's People (Leads for a sequence to leads; the canvas's People board): who is in it, by where they stand, one
 * row per person or lead read from their enrollment (00441), so every screen says the same. What needs you is open at the
 * top: a batch waiting for your OK with the people it holds, for a sequence to leads the emails the check held and
 * those for you to send, decided in place from the same read (needs.tsx, 00447), and who wrote back and waits for an
 * answer, each with the door to their thread (00455's replied group). Everything else folds to one line that already says its numbers:
 * up next, in it, done and left (contracts SEQUENCE_PEOPLE_GROUPS), each opening onto its rows, each row a door to the
 * person or the lead. Someone still in it may be taken out, alone or with the rest of their group: a send of theirs not
 * yet gone is skipped with them (00442 sequence_leave).
 */
import { useState } from "react";
import {
  PEOPLE_GROUP_WORDS,
  SEQUENCE_NEEDS_WORDS as N,
  SEQUENCE_PEOPLE_WORDS as P,
  addressOf,
  heldWhyOf,
  isReachOutHold,
  peopleNeedsOf,
  personWhenWords,
  leadsPlannedWords,
  sequenceLeftWords,
  sequenceRepliesRoute,
  waitingEmailsOf,
  type HeldChoice,
  type SequencePeopleGroup,
  type SequencePersonDto,
  type SequenceRecordDto,
  type SequenceWaitingEmailVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { canDo, gate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { leadOverDoor, useLeadOver } from "../../leads/sheet/lead-over";
import { tripNow } from "./trip";
import { SequenceNeeds } from "./needs";
import { usePeopleRead } from "./use-record";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** The groups folded under Needs you, in their order: added and not planned yet among those still to come. */
const FOLDED: readonly SequencePeopleGroup[] = ["next", "queued", "in", "done", "left"];

/** Whether someone may be taken out: still in it, with a place in it, or a lead on its list nothing was planned for. */
const mayLeave = (p: SequencePersonDto) =>
  (p.enrollment_id !== null && (p.group === "in" || p.group === "next")) || (p.group === "queued" && !!p.lead_id);

/** What a Take out presses for a row: its place in it, or a lead on its list nothing was planned for (00455). */
const leaveOf = (p: SequencePersonDto) =>
  p.enrollment_id ? `e:${p.enrollment_id}` : p.lead_id ? `l:${p.lead_id}` : "";

/**
 * Where a row opens: the person's page, or the lead's sheet over this record (`?lead=`, the canvas's RecLeadOver), so
 * Close is the same row.
 */
function rowDoor(p: SequencePersonDto) {
  if (p.contact_id) return routeDoor(addressOf({ kind: "person", id: p.contact_id }));
  if (p.lead_id) return leadOverDoor(p.lead_id);
  return {};
}

/** The lead lit on the record: the one its sheet is open over, else the one a trip from its sheet came in with. */
function useLitLead(): string | null {
  const over = useLeadOver();
  return over ?? tripNow()?.leadId ?? null;
}

/** A lit row comes into view once, as it is drawn. */
const litInView = (el: HTMLElement | null) => {
  if (!el || el.dataset.lit) return;
  el.dataset.lit = "1";
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
};

/** What a row says under the name: its step, when, and why for someone held or gone. */
function personLineOf(p: SequencePersonDto, tz: string, nowMs: number): string {
  // Never a time already gone: going out, once you approve, or nothing for one held (personWhenWords).
  const at = p.at ? personWhenWords(p.group, Date.parse(p.at), tz, nowMs) : null;
  // Added and not planned yet: when they joined its list.
  if (p.group === "queued") return at ? P.addedAt(at) : P.added;
  const place = p.place ? P.step(p.place) : null;
  // A held email says why in words, as its row in Needs you does: its stored detail is the check's, kind and all.
  const why =
    p.group === "left" || p.group === "done"
      ? sequenceLeftWords(p.why)
      : p.group === "held" && isReachOutHold(p.why)
        ? heldWhyOf(p.why, p.hold_detail)
        : (p.hold_detail ?? p.why ?? null);
  return [place, at, why].filter(Boolean).join(" · ");
}

/** What the Added fold says beside its count, by the sequence's state: on, when its next batch is planned where known. */
function queuedMarkOf(rec: SequenceRecordDto, nowMs: number): string {
  const s = rec.sequence.state;
  if (s === "draft" || s === "paused") return P.queued[s];
  const when = leadsPlannedWords(rec.sequence, rec.last_run_for, rec.timezone, nowMs);
  return when ? P.queuedAt(when) : P.queued.on;
}

/**
 * What a folded group says beside its count, from its rows: when the soonest of them goes for those still to come, and
 * why they left for those gone ("3 wrote back · 1 booked"). Said only where every row of the group is in hand, so a tally
 * never counts part of a group as all of it.
 */
function foldMarkOf(
  g: SequencePeopleGroup,
  rows: SequencePersonDto[],
  whole: number,
  clock: { tz: string; nowMs: number },
): string | null {
  const { tz, nowMs } = clock;
  if (rows.length === 0) return null;
  if (g === "queued") return null;
  if (g === "next" || g === "in") {
    const times = rows.flatMap((r) => (r.at ? [Date.parse(r.at)] : []));
    return times.length ? P.next(Math.min(...times), tz, nowMs) : null;
  }
  if (rows.length < whole) return null;
  const by = new Map<string, number>();
  for (const r of rows) {
    const why = sequenceLeftWords(r.why) || P.lastStep;
    by.set(why, (by.get(why) ?? 0) + 1);
  }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${n} ${why}`)
    .join(" · ");
}

interface GroupProps {
  g: SequencePeopleGroup;
  rows: SequencePersonDto[];
  whole: number;
  rec: SequenceRecordDto;
  busy: string | null;
  takeOut: (key: string, ids: string[]) => Promise<void>;
  lit: string | null;
}

/** A group's rows, each a door, with Take out on those still in it, and the group's own Take out over all of them. */
function GroupRows({ g, rows, whole, rec, busy, takeOut, lit }: GroupProps) {
  const nowMs = Date.now();
  const leaving = rows.filter(mayLeave).map(leaveOf);
  return (
    <div className="sq-group-rows">
      {leaving.length > 1 ? (
        <Button
          size="sm"
          variant="quiet"
          className="sq-group-act"
          disabled={busy !== null}
          onClick={() => void takeOut(g, leaving)}
          data-testid={`sq-take-out-${g}`}
          {...gate("approve")}
        >
          {P.takeOutAll(leaving.length)}
        </Button>
      ) : null}
      {rows.map((r) => (
        <ListRow
          key={`${r.enrollment_id ?? r.send_id ?? r.contact_id ?? r.lead_id}`}
          face={{ person: { name: r.name ?? "" }, size: "sm" }}
          name={r.name ?? P.someone}
          said={personLineOf(r, rec.timezone, nowMs)}
          className={lit && r.lead_id === lit ? "sq-row-lit" : undefined}
          ref={lit && r.lead_id === lit ? litInView : undefined}
          end={(place) =>
            mayLeave(r) ? (
              <Button
                size="sm"
                variant="quiet"
                className={place}
                disabled={busy !== null}
                onClick={(e) => {
                  // The row is a door to the person (rowDoor): the press takes them out, and opens nothing.
                  e.preventDefault();
                  e.stopPropagation();
                  void takeOut(leaveOf(r), [leaveOf(r)]);
                }}
                data-testid={`sq-take-out-${r.enrollment_id ?? r.lead_id}`}
                {...gate("approve")}
              >
                {P.takeOut}
              </Button>
            ) : null
          }
          {...rowDoor(r)}
        />
      ))}
      {whole > rows.length ? <p className="sq-more">{P.more(whole - rows.length)}</p> : null}
    </div>
  );
}

interface WaitingProps {
  rows: SequencePersonDto[];
  emails: readonly SequenceWaitingEmailVM[];
  rec: SequenceRecordDto;
  flash: Flash;
  moved: () => void;
  lit: string | null;
}

/**
 * The emails waiting for your OK, each read before the batch goes (30 Oct 2026): its step and when, the opening it goes
 * with in its quotes, and its answers, quiet, each pressed alone without opening the lead the row is a door to. Take out,
 * at step 1, is the leave verb on its lead; every other answer the decide verb a held email's takes.
 */
function WaitingEmails({ rows, emails, rec, flash, moved, lit }: WaitingProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const nowMs = Date.now();
  const may = canDo("approve");
  const answer = async (e: SequenceWaitingEmailVM, door: HeldChoice) => {
    setBusy(e.id);
    if (door === "take_out")
      await pressed(
        "sequence_leave",
        { sequence_id: rec.sequence.id, enrollment_ids: [], lead_ids: e.leadId ? [e.leadId] : [], name: e.name },
        flash,
        moved,
      );
    else
      await pressed(
        "sequence_send_decide",
        { send_id: e.id, decision: door, name: e.name, run_id: e.batchId },
        flash,
        moved,
      );
    setBusy(null);
  };
  return (
    <div className="sq-group-rows">
      {emails.map((e) => {
        const r = rows.find((x) => x.send_id === e.id);
        return (
          <ListRow
            key={e.id}
            face={{ person: { name: e.name }, size: "sm" }}
            name={e.name}
            said={(place) => (
              <div className={`${place} sq-waiting-said`}>
                {r ? personLineOf(r, rec.timezone, nowMs) : null}
                {e.opening ? (
                  <q
                    className={e.checking ? "sq-waiting-opening sq-waiting-writing" : "sq-waiting-opening"}
                    data-testid="sq-waiting-opening"
                  >
                    {e.checking ? e.opening : e.opening.slice(1, -1)}
                  </q>
                ) : null}
              </div>
            )}
            facts={
              may && e.answers.length > 0
                ? [
                    <div key="answers" className="sq-held-answers">
                      {e.answers.map((a) => (
                        <Button
                          key={a.door}
                          size="sm"
                          variant="quiet"
                          disabled={busy !== null}
                          aria-busy={busy === e.id || undefined}
                          onClick={(ev) => {
                            // The row is a door to the lead (leadOverDoor): the press answers the email, and opens nothing.
                            ev.preventDefault();
                            ev.stopPropagation();
                            void answer(e, a.door);
                          }}
                          data-testid={`sq-waiting-${a.door}`}
                        >
                          {a.words}
                        </Button>
                      ))}
                    </div>,
                  ]
                : []
            }
            className={lit && e.leadId === lit ? "sq-row-lit" : undefined}
            ref={lit && e.leadId === lit ? litInView : undefined}
            data-testid="sq-waiting-email"
            {...(e.leadId ? leadOverDoor(e.leadId) : {})}
          />
        );
      })}
    </div>
  );
}

export function SequencePeople(p: { rec: SequenceRecordDto; flash: Flash; again: number; moved: () => void }) {
  const { rec, flash, again, moved } = p;
  const { read } = usePeopleRead(rec.sequence.id, again);
  const [busy, setBusy] = useState<string | null>(null);
  const lit = useLitLead();
  if (read.state === "failed")
    return <FailedRead what={P.failed} why={read.why} onRetry={moved} testid="sq-people-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  const { counts, rows } = read.data;
  const nowMs = Date.now();
  const takeOut = async (key: string, ids: string[]) => {
    setBusy(key);
    // A place in it leaves by its enrollment; a lead on its list nothing was planned for comes off the list (00455).
    const enrollment_ids = ids.filter((i) => i.startsWith("e:")).map((i) => i.slice(2));
    const lead_ids = ids.filter((i) => i.startsWith("l:")).map((i) => i.slice(2));
    await pressed("sequence_leave", { sequence_id: rec.sequence.id, enrollment_ids, lead_ids }, flash, moved);
    setBusy(null);
  };
  const of = (g: SequencePeopleGroup) => rows.filter((r) => r.group === g);
  const needs = (counts.held ?? 0) + (counts.to_send ?? 0);
  const waiting = of("waiting");
  const emails = waitingEmailsOf(waiting);
  // A row with no email read with it (a server before the openings) is drawn as it was.
  const plainWaiting = waiting.filter((r) => !emails.some((e) => e.id === r.send_id));
  const folded = FOLDED.filter((g) => (counts[g] ?? 0) > 0);
  const { wroteBack } = peopleNeedsOf(rows, { timezone: rec.timezone, now: nowMs });
  // From a server before 00455 there is no replied group: the sequence's needs say how many, and the Inbox has them.
  const replied = wroteBack ? (counts.replied ?? 0) : rec.sequence.needs.replies;
  if (needs === 0 && waiting.length === 0 && folded.length === 0 && replied === 0)
    return <p className="sq-none">{P.nobody}</p>;
  return (
    <div className="sq-people" data-testid="sq-people">
      <SequenceNeeds
        sequenceId={rec.sequence.id}
        rows={rows}
        count={needs}
        timezone={rec.timezone}
        flash={flash}
        onDecided={moved}
      />
      {/* Who wrote back, answered where their threads are: each one's thread, and the Inbox's threads of this sequence. */}
      {replied > 0 ? (
        <section className="sq-group" aria-label={N.wroteBack} data-testid="sq-people-replied">
          <h3 className="sq-group-name">
            {N.wroteBack}
            <span className="tally tally-warn">{replied}</span>
            <LinkButton
              className="sq-group-act"
              {...routeDoor(sequenceRepliesRoute(rec.sequence.id, "all"))}
              data-testid="sq-people-inbox"
            >
              {N.inbox} <Icon name="chevron" size={11} />
            </LinkButton>
          </h3>
          {wroteBack && wroteBack.length > 0 ? (
            <div className="sq-group-rows">
              {wroteBack.map((w) => (
                <ListRow
                  key={w.key}
                  face={{ person: { name: w.name }, size: "sm" }}
                  name={w.name}
                  said={w.summary ? `${w.said} · ${w.summary}` : w.said}
                  end={(place) =>
                    w.answer ? (
                      <LinkButton className={place} {...routeDoor(w.answer)} data-testid={`sq-answer-${w.key}`}>
                        {N.answer}
                      </LinkButton>
                    ) : null
                  }
                  {...(w.to ? routeDoor(w.to) : {})}
                />
              ))}
              {replied > wroteBack.length ? <p className="sq-more">{P.more(replied - wroteBack.length)}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {waiting.length > 0 ? (
        <section className="sq-group" aria-label={PEOPLE_GROUP_WORDS.waiting} data-testid="sq-people-waiting">
          <h3 className="sq-group-name">
            {PEOPLE_GROUP_WORDS.waiting}
            <span className="tally tally-warn">{counts.waiting}</span>
          </h3>
          {emails.length > 0 ? (
            <WaitingEmails rows={waiting} emails={emails} rec={rec} flash={flash} moved={moved} lit={lit} />
          ) : null}
          {plainWaiting.length > 0 || (counts.waiting ?? 0) > waiting.length ? (
            <GroupRows
              g="waiting"
              rows={plainWaiting}
              whole={(counts.waiting ?? 0) - emails.length}
              rec={rec}
              busy={busy}
              takeOut={takeOut}
              lit={lit}
            />
          ) : null}
        </section>
      ) : null}
      <div className="sq-folds">
        {folded.map((g) => (
          <RecordDisclosure
            key={g}
            id={`sq-people-${rec.sequence.id}-${g}`}
            label={
              <>
                <b>{PEOPLE_GROUP_WORDS[g]}</b> · {counts[g]}
              </>
            }
            mark={
              g === "queued"
                ? queuedMarkOf(rec, nowMs)
                : foldMarkOf(g, of(g), counts[g] ?? 0, { tz: rec.timezone, nowMs })
            }
            remember
            testid={`sq-people-${g}`}
          >
            <GroupRows g={g} rows={of(g)} whole={counts[g] ?? 0} rec={rec} busy={busy} takeOut={takeOut} lit={lit} />
          </RecordDisclosure>
        ))}
      </div>
    </div>
  );
}
