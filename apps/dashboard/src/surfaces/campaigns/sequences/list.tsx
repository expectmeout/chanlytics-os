/**
 * The Sequences list (decision 0060, the canvas's list pane): every sequence, grouped as the page groups them (what needs
 * you first, then your customers, leads and dates, contracts SEQUENCE_GROUPS), each a row with its kind's glyph, its name,
 * its state's pill and its line, narrowed by a search and a filter (all, what needs you, what is off). A row opens its
 * record beside the list. Every word is contracts' (sequence-words.ts); the list composes them.
 */
import { useMemo, useState } from "react";
import {
  SEQUENCES_ROUTE,
  SEQUENCE_GROUPS,
  SEQUENCE_WORDS,
  isOff,
  needsCount,
  sequenceGroupOf,
  sequenceRoute,
  sequenceRowLine,
  sequenceStateTone,
  sequenceStateWords,
  type SequenceGroup,
  type SequenceRowDto,
  type SequencesPageDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { ListRow } from "../../kit/list-row/list-row";
import { Icon } from "../../kit/icon/icon";
import { Search } from "../../kit/search/search";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { StatePill } from "../../kit/pill/state-pill";
import { gate, routeDoor } from "../../legacy-verbs";

type Filter = keyof typeof SEQUENCE_WORDS.filters;

/** The glyph a row's kind wears: a moment's, a list's, a date's, a lead's. */
const GLYPH: Record<SequenceRowDto["starts"], string> = {
  moment: "bell",
  list: "users",
  date: "send",
  leads: "globe",
};

const keptBy = (row: SequenceRowDto, filter: Filter, words: string): boolean => {
  if (filter === "needs" && needsCount(row.needs) === 0) return false;
  if (filter === "off" && !isOff(row)) return false;
  return words === "" || row.name.toLowerCase().includes(words);
};

interface SequencesListProps {
  page: SequencesPageDto;
  /** The sequence open beside the list, whose row is marked. */
  openId: string | null;
}

export function SequencesList({ page, openId }: SequencesListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const nowMs = Date.now();
  const words = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<SequenceGroup, SequenceRowDto[]>();
    for (const row of page.sequences) {
      if (!keptBy(row, filter, words)) continue;
      const g = sequenceGroupOf(row);
      by.set(g, [...(by.get(g) ?? []), row]);
    }
    return SEQUENCE_GROUPS.flatMap((g) => (by.get(g)?.length ? [{ group: g, rows: by.get(g) ?? [] }] : []));
  }, [page.sequences, filter, words]);
  const needs = page.sequences.filter((r) => needsCount(r.needs) > 0).length;
  const off = page.sequences.filter(isOff).length;
  return (
    <>
      <div className="sq-list-head">
        <div className="sq-list-top">
          <Search label={SEQUENCE_WORDS.search} value={search} onChange={setSearch} testid="sq-search" />
          <Button
            size="sm"
            variant="primary"
            {...routeDoor(`${SEQUENCES_ROUTE}/new`)}
            data-testid="sq-new-open"
            {...gate("approve")}
          >
            <Icon name="plus" size={12} /> {SEQUENCE_WORDS.newSequence}
          </Button>
        </div>
        <SubTabs
          label={SEQUENCE_WORDS.title}
          value={filter}
          dense
          onSelect={(id) => setFilter(id === "needs" || id === "off" ? id : "all")}
          tabs={[
            { id: "all", label: SEQUENCE_WORDS.filters.all, count: page.sequences.length },
            { id: "needs", label: SEQUENCE_WORDS.filters.needs, count: needs, tone: needs > 0 ? "warn" : undefined },
            { id: "off", label: SEQUENCE_WORDS.filters.off, count: off },
          ]}
        />
      </div>
      <div className="sq-list-rows" data-testid="sq-rows">
        {groups.map(({ group, rows }) => (
          <section key={group} className="sq-group" aria-label={SEQUENCE_WORDS.groups[group]}>
            <h3 className="sq-group-name">
              {SEQUENCE_WORDS.groups[group]}
              <span className="tally">{rows.length}</span>
            </h3>
            {rows.map((row) => (
              <ListRow
                key={row.id}
                mark={<Icon name={GLYPH[row.starts]} size={13} />}
                name={row.name}
                end={(place) => (
                  <StatePill
                    kind="tone"
                    value={sequenceStateTone(row)}
                    label={sequenceStateWords(row)}
                    className={place}
                  />
                )}
                said={(place) => (
                  <div className={needsCount(row.needs) > 0 ? `${place} sq-needs` : place}>
                    {sequenceRowLine(row, page.timezone, nowMs)}
                  </div>
                )}
                aria-current={row.id === openId ? "true" : undefined}
                data-testid={`sq-row-${row.id}`}
                {...routeDoor(sequenceRoute(row.id))}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
