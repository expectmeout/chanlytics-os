/**
 * Write to leads, New message's third choice (canvas B's Campaigns, the lead workbench, 00426; the lead-to-sequence
 * canvas's one road, 18 Oct 2026): where leads go to a sequence is Leads, by Add. Leads you add first, which opens Leads;
 * then each search or list with no sequence yet that has someone to write to, newest first, read when the choice is made
 * (reach_out_sources), each opening on Leads, where its leads are added to a sequence or a new one made by name. Writing
 * is an operator's: a role that may not is told why once, and its rows open nothing.
 */
import { useEffect, useReducer, useState } from "react";
import { REACH_OUT_SOURCE_WORDS, leadsRoute, reachOutSourceOf } from "@chanlytics/contracts";
import type { ReachOutSourceDto } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { canDo, gateTitle, keyPress, navigate } from "../../legacy-verbs";
import { reachOuts } from "./surface";

/** Leads you add: Leads, where each is added to a sequence (or a new one) from its sheet or many at once. */
function addYourOwn() {
  navigate(leadsRoute({ list: "all" }));
}

/** A search or list: open on Leads, where its leads are added to a sequence. */
const openOnLeads = (id: string) => navigate(leadsRoute({ searchId: id, list: "all" }));

/** A row that opens something on a press or a key, as a door does; one a role may not press opens nothing. */
function pressOf(may: boolean, fn: () => void) {
  if (!may) return {};
  return { role: "button", tabIndex: 0, onClick: fn, onKeyDown: keyPress(fn) };
}

export function WriteToLeads() {
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
              {...pressOf(may, () => openOnLeads(s.id))}
            />
          );
        })
      )}
    </div>
  );
}
