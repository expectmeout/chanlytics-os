/**
 * A sequence's People (Leads for a sequence to leads; the canvas's People board): who is in it, by where they stand, one
 * row per person or lead read from their enrollment (00441), so every screen says the same. What needs you is open at the
 * top: a batch waiting for your OK with the people it holds, and for a sequence to leads the emails the check held and
 * those for you to send, decided in place from the same read (needs.tsx, 00445). Everything else folds to one line that already says its numbers:
 * up next, in it, done and left (contracts SEQUENCE_PEOPLE_GROUPS), each opening onto its rows, each row a door to the
 * person or the lead. Someone still in it may be taken out, alone or with the rest of their group: a send of theirs not
 * yet gone is skipped with them (00442 sequence_leave).
 */
import { useState } from "react";
import {
  PEOPLE_GROUP_WORDS,
  SEQUENCE_PEOPLE_WORDS as P,
  addressOf,
  clockStamp,
  clockWhen,
  sequenceLeftWords,
  type SequencePeopleGroup,
  type SequencePersonDto,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { ListRow } from "../../kit/list-row/list-row";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { gate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { SequenceNeeds } from "./needs";
import { useSequenceRead } from "./use-record";
import { pressed, sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** The groups folded under Needs you, in their order. */
const FOLDED: readonly SequencePeopleGroup[] = ["next", "in", "done", "left"];

/** Whether someone may be taken out: still in it, with a place in it. */
const mayLeave = (p: SequencePersonDto) => p.enrollment_id !== null && (p.group === "in" || p.group === "next");

/** Where a row opens: the person's page, or the lead's. */
function rowDoor(p: SequencePersonDto) {
  if (p.contact_id) return routeDoor(addressOf({ kind: "person", id: p.contact_id }));
  if (p.lead_id) return routeDoor(addressOf({ kind: "lead", id: p.lead_id }));
  return {};
}

/** What a row says under the name: its step, when, and why for someone held or gone. */
function personLineOf(p: SequencePersonDto, tz: string, nowMs: number): string {
  const at = p.at ? clockStamp(Date.parse(p.at), tz, nowMs) : null;
  const place = p.place ? P.step(p.place) : null;
  const why = p.group === "left" || p.group === "done" ? sequenceLeftWords(p.why) : (p.hold_detail ?? p.why ?? null);
  return [place, at, why].filter(Boolean).join(" · ");
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
  if (g === "next" || g === "in") {
    const soonest = rows.find((r) => r.at)?.at;
    return soonest ? P.next(clockWhen(Date.parse(soonest), tz, nowMs)) : null;
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
}

/** A group's rows, each a door, with Take out on those still in it, and the group's own Take out over all of them. */
function GroupRows({ g, rows, whole, rec, busy, takeOut }: GroupProps) {
  const nowMs = Date.now();
  const leaving = rows.filter(mayLeave).flatMap((r) => (r.enrollment_id ? [r.enrollment_id] : []));
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
          end={(place) =>
            mayLeave(r) && r.enrollment_id ? (
              <Button
                size="sm"
                variant="quiet"
                className={place}
                disabled={busy !== null}
                onClick={() => void takeOut(r.enrollment_id ?? "", [r.enrollment_id ?? ""])}
                data-testid={`sq-take-out-${r.enrollment_id}`}
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

export function SequencePeople(p: { rec: SequenceRecordDto; flash: Flash; again: number; moved: () => void }) {
  const { rec, flash, again, moved } = p;
  const read = useSequenceRead(rec.sequence.id, verbs.people, verbs.peekPeople, again);
  const [busy, setBusy] = useState<string | null>(null);
  if (read.state === "failed")
    return <FailedRead what={P.failed} why={read.why} onRetry={moved} testid="sq-people-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  const { counts, rows } = read.data;
  const nowMs = Date.now();
  const takeOut = async (key: string, ids: string[]) => {
    setBusy(key);
    await pressed("sequence_leave", { sequence_id: rec.sequence.id, enrollment_ids: ids }, flash, moved);
    setBusy(null);
  };
  const of = (g: SequencePeopleGroup) => rows.filter((r) => r.group === g);
  const needs = (counts.held ?? 0) + (counts.to_send ?? 0);
  const waiting = of("waiting");
  const folded = FOLDED.filter((g) => (counts[g] ?? 0) > 0);
  if (needs === 0 && waiting.length === 0 && folded.length === 0) return <p className="sq-none">{P.nobody}</p>;
  return (
    <div className="sq-people" data-testid="sq-people">
      <SequenceNeeds rows={rows} count={needs} timezone={rec.timezone} flash={flash} onDecided={moved} />
      {waiting.length > 0 ? (
        <section className="sq-group" aria-label={PEOPLE_GROUP_WORDS.waiting} data-testid="sq-people-waiting">
          <h3 className="sq-group-name">
            {PEOPLE_GROUP_WORDS.waiting}
            <span className="tally tally-warn">{counts.waiting}</span>
          </h3>
          <GroupRows g="waiting" rows={waiting} whole={counts.waiting ?? 0} rec={rec} busy={busy} takeOut={takeOut} />
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
            mark={foldMarkOf(g, of(g), counts[g] ?? 0, { tz: rec.timezone, nowMs })}
            remember
            testid={`sq-people-${g}`}
          >
            <GroupRows g={g} rows={of(g)} whole={counts[g] ?? 0} rec={rec} busy={busy} takeOut={takeOut} />
          </RecordDisclosure>
        ))}
      </div>
    </div>
  );
}
