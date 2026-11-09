/**
 * A lead search that stopped to ask (his call D8, 9 Nov 2026), answered in the sheet on a phone too, where it opened the Leads page
 * to answer one question: the question whole, that nothing is spent while it waits, Stop here or Keep going, and what to change said
 * in words, which Ask makes into the change this search's own panel would.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { Button } from "../../kit";
import { askAbout, gate } from "../shell";
import { AskLine } from "./ask-line";
import { Acts, Done, Note, State, startKind, type WorkProps } from "./parts";
import { useRowState } from "./row-state";

/** A search's own id on its row. */
const searchIdOf = (rowId: string): string => rowId.replace(/^q-s-/, "");

export function SearchWork(p: WorkProps) {
  const { row, main, may, flash, keep, unkeep } = p;
  const [said, setSaid] = useRowState<"keep" | "stop" | null>(row.id, "said", null);
  const [busy, setBusy] = useState(false);
  const answer = async (to: "keep" | "stop") => {
    setBusy(true);
    keep(row);
    const r = await api()("POST lead-searches/[id]/answer", {
      params: { id: searchIdOf(row.id) },
      body: { answer: to },
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      unkeep(row);
      flash({ tone: "danger", msg: <>{r && !r.ok ? r.message : W.couldNot}</> });
      return;
    }
    setSaid(to);
  };
  if (said) return <Done words={said === "keep" ? W.search.kept : W.search.stopped} foot={p.foot} />;
  const acts = (
    <Acts
      foot={p.foot}
      start={
        <Button variant={startKind(p.foot)} disabled={busy || !may} onClick={() => void answer("stop")}>
          {W.search.stop}
        </Button>
      }
      end={
        <Button
          variant={main}
          disabled={busy || !may}
          aria-busy={busy || undefined}
          onClick={() => void answer("keep")}
          {...gate("approve", "answer a search")}
        >
          {W.search.keep}
        </Button>
      }
    />
  );
  // Up next on a phone says the question above it and its two answers: the sheet holds the rest.
  if (!p.whole) return acts;
  return (
    <>
      <State>{row.sentence}</State>
      {may ? (
        <AskLine
          placeholder={W.search.change}
          onSay={(words) => {
            // A change to a search is Ask's to make into a card, which amends this search and is approved there.
            askAbout({ prompt: W.search.changeAsk(row.who, words) });
            return true;
          }}
        />
      ) : null}
      <Note>{W.search.nothingSpent}</Note>
      {acts}
    </>
  );
}
