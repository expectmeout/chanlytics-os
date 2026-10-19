/**
 * The Sequences list (decision 0060; the phone review of 16 Oct 2026): every sequence, grouped as the page groups them
 * (what needs you first, a twin on a visit moment among it; then your customers, leads, dates, what is paused or off, and
 * the drafts: contracts SEQUENCE_GROUPS), each a row with its kind's glyph, its name and its line, a word at its end only
 * where its state is not the ordinary one (contracts sequenceRowState: a green On on every row said nothing). A search
 * narrows it; the groups are its filter. A row opens its record beside the list. New is the head's act, beside the strip
 * of views (sequences-page.tsx), as Messages' New is. Every word is contracts' (sequence-words.ts); the list composes
 * them. First contact is no sequence (D7: the receptionist leaves the list): one line at the foot of Your customers says
 * so and opens its settings, with nothing searched, since it neither needs you nor pauses.
 */
import { useMemo, useState } from "react";
import {
  SEQUENCE_GROUPS,
  SEQUENCE_WORDS,
  sequenceGroupOf,
  sequenceRoute,
  sequenceRowLine,
  sequenceRowState,
  sequenceTwinOf,
  type SequenceGroup,
  type SequenceRowDto,
  type SequenceTwin,
  type SequencesPageDto,
} from "@chanlytics/contracts";
import { ListRow } from "../../kit/list-row/list-row";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Search } from "../../kit/search/search";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import { useRecordsAhead } from "./use-record";

/** The glyph a row's kind wears: a moment's, a list's, a date's, a lead's. */
const GLYPH: Record<SequenceRowDto["starts"], string> = {
  moment: "bell",
  list: "users",
  date: "send",
  leads: "globe",
};

interface SequencesListProps {
  page: SequencesPageDto;
  /** The sequence open beside the list, whose row is marked. */
  openId: string | null;
}

/** One row: its glyph, its name, its line (amber where it needs you), and its state's word where it is not On. */
function SequenceRow(p: {
  row: SequenceRowDto;
  twin: SequenceTwin | null;
  group: SequenceGroup;
  tz: string;
  open: boolean;
}) {
  const { row, twin, group, tz, open } = p;
  const state = sequenceRowState(row);
  return (
    <ListRow
      mark={<Icon name={GLYPH[row.starts]} size={13} />}
      name={row.name}
      end={(place) =>
        state ? <StatePill kind="tone" value={state.tone} label={state.label} className={place} /> : null
      }
      said={(place) => (
        <div className={group === "needs" ? `${place} sq-needs` : place}>
          {sequenceRowLine(row, tz, Date.now(), twin)}
        </div>
      )}
      aria-current={open ? "true" : undefined}
      data-testid={`sq-row-${row.id}`}
      {...routeDoor(sequenceRoute(row.id))}
    />
  );
}

export function SequencesList({ page, openId }: SequencesListProps) {
  const [search, setSearch] = useState("");
  // Ended sequences are history: folded at the list's foot, opened when asked for (a search shows them).
  const [endedOpen, setEndedOpen] = useState(false);
  const words = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<SequenceGroup, { row: SequenceRowDto; twin: SequenceTwin | null }[]>();
    for (const row of page.sequences) {
      if (words !== "" && !row.name.toLowerCase().includes(words)) continue;
      const twin = sequenceTwinOf(page.sequences, row);
      const g = sequenceGroupOf(row, twin);
      by.set(g, [...(by.get(g) ?? []), { row, twin }]);
    }
    return SEQUENCE_GROUPS.flatMap((g) => (by.get(g)?.length ? [{ group: g, rows: by.get(g) ?? [] }] : []));
  }, [page.sequences, words]);
  // The rows shown, in their order, read ahead once the frame is idle so a press opens a record the tab holds (use-record.ts).
  // Ended ones, folded at the foot, are history: none is read ahead.
  useRecordsAhead(groups.flatMap(({ group, rows }) => (group === "ended" ? [] : rows.map(({ row }) => row.id))));
  return (
    <>
      <div className="sq-list-head">
        <Search label={SEQUENCE_WORDS.search} value={search} onChange={setSearch} testid="sq-search" />
      </div>
      <div className="sq-list-rows" data-testid="sq-rows">
        {groups.map(({ group, rows }) => (
          <section key={group} className="sq-group" aria-label={SEQUENCE_WORDS.groups[group]}>
            <h3 className="sq-group-name">
              {SEQUENCE_WORDS.groups[group]}
              <span className={group === "needs" ? "tally tally-warn" : "tally"}>{rows.length}</span>
              {group === "ended" && words === "" ? (
                <LinkButton
                  className="sq-group-act"
                  onClick={() => setEndedOpen((v) => !v)}
                  aria-expanded={endedOpen}
                  data-testid="sq-ended-toggle"
                >
                  {endedOpen ? SEQUENCE_WORDS.hideEnded : SEQUENCE_WORDS.showEnded(rows.length)}
                </LinkButton>
              ) : null}
            </h3>
            {(group === "ended" && words === "" && !endedOpen ? [] : rows).map(({ row, twin }) => (
              <SequenceRow
                key={row.id}
                row={row}
                twin={twin}
                group={group}
                tz={page.timezone}
                open={row.id === openId}
              />
            ))}
            {group === "customers" && words === "" ? (
              <LinkButton
                className="sq-foot-link"
                {...routeDoor(SEQUENCE_WORDS.receptionistRoute)}
                data-testid="sq-receptionist"
              >
                {SEQUENCE_WORDS.receptionist} <Icon name="chevron" size={11} />
              </LinkButton>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
