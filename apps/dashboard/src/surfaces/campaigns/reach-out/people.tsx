/**
 * Who is in a reach-out (the lead workbench, 00423): its drawer's People, read when the drawer opens and again when a
 * door on Leads moves a lead (`reach_out:leads`). Three groups -- waiting (on its list, or in its search's audience, with
 * nothing left for them yet), writing (written to, not done) and done (booked, stopped, bounced, said no, closed, or a
 * person answered) -- each lead a door to its peek on Leads, with the line Leads says under its stage (reachOutLineOf).
 * A reach-out fed by a list takes more: Add leads opens Leads, where a search is gone through one lead at a time with
 * this reach-out as where its adds go (the pile, 00423).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import {
  leadsRoute,
  reachOutCameWords,
  type ReachOutChainDto,
  type ReachOutChainPeopleDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { canDo, gate, navigate, routeDoor } from "../../legacy-verbs";
import { PersonDoor, type PeopleFlash } from "./person-door";
import { PILE_TARGET_KEY, reachOuts } from "./surface";

/** How many of each group the drawer shows. */
const PEOPLE_SHOWN = 25;

/** The groups, in the order a reach-out moves its leads through them. */
const GROUPS = [
  { key: "waiting", word: "Waiting" },
  { key: "writing", word: "Writing" },
  { key: "done", word: "Done" },
] as const;

/**
 * Add leads: Leads, with this reach-out remembered as where the next pile's adds go. The drawer's Add leads and Leads'
 * door on a list that feeds a reach-out (door.tsx) both press it.
 */
export function addLeadsTo(rootId: string) {
  try {
    window.sessionStorage.setItem(PILE_TARGET_KEY, rootId);
  } catch {
    /* a browser that will not keep it: the pile offers every reach-out fed by a list anyway */
  }
  navigate(leadsRoute({ list: "all" }));
}

/**
 * Who is in it. `focus`: the address opened the drawer at its People (`moment:<id>:people`), so the block is brought into
 * view once, when it is first drawn with its people.
 */
export function ReachOutPeople({
  chain,
  focus = false,
  flash,
}: {
  chain: ReachOutChainDto;
  focus?: boolean;
  /** The drawer's toast: what a row's door did, with its undo. */
  flash?: PeopleFlash;
}) {
  const [people, setPeople] = useState<ReachOutChainPeopleDto | null | undefined>(undefined);
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const at = useRef<HTMLElement | null>(null);
  const read = people !== undefined;
  useEffect(() => {
    if (focus && read) at.current?.scrollIntoView({ block: "start" });
  }, [focus, read]);
  useEffect(() => {
    window.addEventListener("reach_out:leads", bump);
    return () => window.removeEventListener("reach_out:leads", bump);
  }, []);
  useEffect(() => {
    let live = true;
    void reachOuts.people(chain.root_id, PEOPLE_SHOWN).then((p) => {
      if (live) setPeople(p);
    });
    return () => {
      live = false;
    };
  }, [chain.root_id, tick]);
  if (people === undefined) return null;
  if (people === null) return <FailedRead kind="line" what="who is in it" onRetry={bump} testid="ro-people-failed" />;
  const c = people.counts;
  // A row's door moved a lead: this block, Leads and every page that hears it read again.
  const moved = () => window.dispatchEvent(new CustomEvent("reach_out:leads"));
  return (
    <section ref={at} className="ro-people" aria-label="Who is in it" data-testid="ro-people">
      <header className="ro-people-head">
        <h3>Who is in it</h3>
        <span data-testid="ro-people-counts">
          {c.waiting} waiting · {c.writing} writing · {c.done} done
        </span>
        {people.fed_by === "list" ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => addLeadsTo(chain.root_id)}
            data-testid="ro-people-add"
            {...(canDo("approve") ? {} : gate("approve", "add leads to a reach-out"))}
          >
            Add leads
          </Button>
        ) : null}
      </header>
      {/* What came of it (canvas B's loop): of everyone it has, written to, wrote back, booked and won. */}
      {reachOutCameWords(people) ? (
        <p className="ro-people-came" data-testid="ro-people-came">
          {reachOutCameWords(people)}
        </p>
      ) : null}
      {GROUPS.map((g) =>
        people[g.key].length ? (
          <div key={g.key} className="ro-people-group" data-testid={`ro-people-${g.key}`}>
            <h4>
              {g.word} <span>{c[g.key]}</span>
            </h4>
            <ul>
              {people[g.key].map((l) => (
                <li key={l.lead_id}>
                  <a {...routeDoor(leadsRoute({ list: "all", peek: l.lead_id }))}>{l.business_name ?? "A business"}</a>
                  <span>{reachOuts.lineOf(l) ?? ""}</span>
                  <PersonDoor
                    chain={chain}
                    group={g.key}
                    line={l}
                    listFed={people.fed_by === "list"}
                    flash={flash}
                    moved={moved}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {c.waiting + c.writing + c.done === 0 ? (
        <p className="cm-standing" data-testid="ro-people-none">
          {people.fed_by === "list" ? "Nobody on its list yet." : "Nobody its search found can be written to yet."}
        </p>
      ) : null}
    </section>
  );
}
