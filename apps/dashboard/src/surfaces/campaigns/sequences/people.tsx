/**
 * A sequence's People (Leads for a sequence to leads; the canvas's People board): who is in it, by where they stand, in
 * the People tab's order (contracts SEQUENCE_PEOPLE_GROUPS): waiting for your OK, held by the check, for you to send, up
 * next, in it, done and left, each group's whole count and its first rows. Someone still in it may be taken out, alone or
 * with the rest of their group: a send of theirs not yet gone is skipped with them (00441 sequence_leave). A held email and
 * one the owner sends from their own mail are decided where every such email is (the run's sheet, and Sent's one To send),
 * each row a door there, until this tab decides them in place (the plan's S6).
 */
import { useState } from "react";
import {
  PEOPLE_GROUP_WORDS,
  TO_SEND_ROUTE,
  addressOf,
  SEQUENCE_PEOPLE_GROUPS,
  clockStamp,
  sequenceLeftWords,
  type SequencePersonDto,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { ListRow } from "../../kit/list-row/list-row";
import { gate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSequenceRead } from "./use-record";
import { pressed, sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** Whether someone may be taken out: still in it, with a place in it. */
const mayLeave = (p: SequencePersonDto) => p.enrollment_id !== null && (p.group === "in" || p.group === "next");

/** Where a row opens: a held email or one to send on the run that holds it, where it is decided; anyone else's page. */
function rowDoor(p: SequencePersonDto) {
  if ((p.group === "held" || p.group === "to_send") && p.batch_id)
    return routeDoor(addressOf({ kind: "send", id: p.batch_id }));
  if (p.contact_id) return routeDoor(addressOf({ kind: "person", id: p.contact_id }));
  if (p.lead_id) return routeDoor(addressOf({ kind: "lead", id: p.lead_id }));
  return {};
}

/** A group's own act: the emails held go to the run that holds the first, those to send to the one To send list. */
function GroupDoor({ group, rows }: { group: string; rows: SequencePersonDto[] }) {
  const batch = rows.find((r) => r.batch_id)?.batch_id ?? null;
  if (group === "to_send")
    return (
      <Button size="sm" variant="quiet" className="sq-group-act" {...routeDoor(TO_SEND_ROUTE)} data-testid="sq-to-send">
        Send them
      </Button>
    );
  if (group === "held" && batch)
    return (
      <Button
        size="sm"
        variant="quiet"
        className="sq-group-act"
        {...routeDoor(addressOf({ kind: "send", id: batch }))}
        data-testid="sq-decide-held"
      >
        Decide them
      </Button>
    );
  return null;
}

/** What a row says under the name: when, and why for someone held or gone. */
function personLineOf(p: SequencePersonDto, tz: string, nowMs: number): string {
  const at = p.at ? clockStamp(Date.parse(p.at), tz, nowMs) : null;
  const place = p.place ? `step ${p.place}` : null;
  const why = p.group === "left" || p.group === "done" ? sequenceLeftWords(p.why) : (p.hold_detail ?? p.why ?? null);
  return [place, at, why].filter(Boolean).join(" · ");
}

export function SequencePeople(p: { rec: SequenceRecordDto; flash: Flash; again: number; moved: () => void }) {
  const { rec, flash, again, moved } = p;
  const read = useSequenceRead(rec.sequence.id, verbs.people, verbs.peekPeople, again);
  const [busy, setBusy] = useState<string | null>(null);
  if (read.state === "failed")
    return <FailedRead what="who is in it" why={read.why} onRetry={moved} testid="sq-people-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  const { counts, rows } = read.data;
  const nowMs = Date.now();
  const takeOut = async (key: string, ids: string[]) => {
    setBusy(key);
    await pressed("sequence_leave", { sequence_id: rec.sequence.id, enrollment_ids: ids }, flash, moved);
    setBusy(null);
  };
  const groups = SEQUENCE_PEOPLE_GROUPS.filter((g) => (counts[g] ?? 0) > 0);
  if (groups.length === 0) return <p className="sq-none">Nobody is in it yet.</p>;
  return (
    <div className="sq-people" data-testid="sq-people">
      {groups.map((g) => {
        const shown = rows.filter((r) => r.group === g);
        const leaving = shown.filter(mayLeave).flatMap((r) => (r.enrollment_id ? [r.enrollment_id] : []));
        return (
          <section key={g} className="sq-group" aria-label={PEOPLE_GROUP_WORDS[g]} data-testid={`sq-people-${g}`}>
            <h3 className="sq-group-name">
              {PEOPLE_GROUP_WORDS[g]}
              <span className={g === "waiting" || g === "held" || g === "to_send" ? "tally tally-warn" : "tally"}>
                {counts[g]}
              </span>
              <GroupDoor group={g} rows={shown} />
              {leaving.length > 1 ? (
                <Button
                  size="sm"
                  variant="quiet"
                  className="sq-group-act"
                  disabled={busy !== null}
                  onClick={() => void takeOut(g, leaving)}
                  {...gate("approve")}
                >
                  Take these {leaving.length} out
                </Button>
              ) : null}
            </h3>
            {shown.map((r) => (
              <ListRow
                key={`${r.enrollment_id ?? r.send_id ?? r.contact_id ?? r.lead_id}`}
                face={{ person: { name: r.name ?? "" }, size: "sm" }}
                name={r.name ?? "Someone"}
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
                      Take out
                    </Button>
                  ) : null
                }
                {...rowDoor(r)}
              />
            ))}
            {(counts[g] ?? 0) > shown.length ? (
              <p className="sq-more">and {(counts[g] ?? 0) - shown.length} more</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
