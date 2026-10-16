/**
 * Write to leads, New message's third choice (canvas B's Campaigns, the lead workbench, 00426): where a reach-out starts.
 * Leads you add first, which opens Leads, where a search is gone through one lead at a time and the ones added become a
 * list of the owner's own ("Write to the N" makes it and opens this same sheet); then each search or list with no
 * reach-out yet that has someone to write to, newest first, read when the choice is made (reach_out_sources), each
 * handing its search to the page (`onWrite`), which opens the reach-out sheet over it, as Leads' own door does: in New
 * message's place, since the record sheet stands on the page and could not stand under that sheet's modal (it opened
 * hidden behind it, its Start out of reach). Writing is an operator's: a role that may not is told why once, and its
 * rows open nothing.
 */
import { useEffect, useReducer, useState } from "react";
import { REACH_OUT_SOURCE_WORDS, leadsRoute, reachOutSourceOf } from "@chanlytics/contracts";
import type { ReachOutSourceDto } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { canDo, gateTitle, keyPress, navigate } from "../../legacy-verbs";
import { PILE_NEW_LIST, pileAsk, reachOuts } from "./surface";

/** A search a reach-out is to start on, as a row of Write to leads hands it over: with its unconfirmed, where the row says so. */
export interface ReachOutStart {
  search: { id: string; name: string };
  includeUnconfirmed: boolean;
}

/** Leads you add: Leads, where the next pile holds what is added for a list of its own. */
function addYourOwn() {
  pileAsk.set(PILE_NEW_LIST);
  navigate(leadsRoute({ list: "all" }));
}

/** A row that opens something on a press or a key, as a door does; one a role may not press opens nothing. */
function pressOf(may: boolean, fn: () => void) {
  if (!may) return {};
  return { role: "button", tabIndex: 0, onClick: fn, onKeyDown: keyPress(fn) };
}

export function WriteToLeads({ onWrite }: { onWrite: (start: ReachOutStart) => void }) {
  const [sources, setSources] = useState<ReachOutSourceDto[] | null | undefined>(undefined);
  const [tick, again] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let live = true;
    void reachOuts.sources().then((s) => {
      if (live) setSources(s);
    });
    return () => {
      live = false;
    };
  }, [tick]);
  const W = REACH_OUT_SOURCE_WORDS;
  const may = canDo("approve");
  return (
    <div className="ro-sources" data-testid="ro-sources">
      {!may ? (
        <p className="cm-standing" data-testid="ro-sources-role">
          {gateTitle("approve", "write to leads")}
        </p>
      ) : null}
      <ListRow
        mark={<Icon name="plus" size={14} />}
        name={W.addTitle}
        said={W.addSub}
        data-testid="ro-source-add"
        {...pressOf(may, addYourOwn)}
      />
      {sources === undefined ? null : sources === null ? (
        <FailedRead kind="line" what={W.failed} onRetry={again} testid="ro-sources-failed" />
      ) : sources.length === 0 ? (
        <p className="cm-standing" data-testid="ro-sources-none">
          {W.none}
        </p>
      ) : (
        sources.map((s) => {
          const v = reachOutSourceOf(s);
          return (
            <ListRow
              key={s.id}
              mark={<Icon name="mail" size={14} />}
              name={v.title}
              said={v.sub}
              data-testid="ro-source"
              {...pressOf(may, () => onWrite({ search: { id: s.id, name: s.name }, includeUnconfirmed: v.include }))}
            />
          );
        })
      )}
    </div>
  );
}
