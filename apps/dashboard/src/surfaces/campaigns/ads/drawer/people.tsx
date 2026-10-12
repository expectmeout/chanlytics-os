/**
 * People it brought (MOCKUP; Ruben, 11 Oct 2026, "Option B"): the first people an ad brought, as the kit's list rows with
 * their initials, three on a phone and five on a desk, the ones waiting on the owner first (amber), then those who booked,
 * then the ones talking, then the quiet. Each row says two facts from two records at its end and under it: where the
 * conversation stands, and what the calendar says. Two quiet filters cut the list by the counts the figures above hold,
 * and a door goes to all of them. Never "Came in", never "Handed to you": the move is hers, so it is "Waiting for you". A row
 * is a link: to the conversation when it waits on the owner and there is one, else to the person's page.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { AdPersonRowVM, AdTone, PeopleVM } from "@chanlytics/contracts/ads-page";
import { PEOPLE_TAB } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import type { SubTab } from "../../../kit/sub-tabs/sub-tabs";
import { Tooltip } from "../../../kit/tooltip/tooltip";
import { routeDoor } from "../../../legacy-verbs";
import { useCmPhone } from "../../parts/split";

type Cut = "all" | "booked" | "not-yet";

const SHOWN_ON_PHONE = 3;
const SHOWN_ON_DESK = 5;

/** A fact, in its tone: amber only for what waits on the owner. */
function Fact({ text, tone }: { text: string; tone: AdTone }) {
  return (
    <span className="ads-tone" data-tone={tone}>
      {text}
    </span>
  );
}

/** One person: their name, where it stands at the end, what they wrote and when, and the other record's fact. */
function Person({ p }: { p: AdPersonRowVM }) {
  // A booked person's end is the calendar's fact; anyone else's is the conversation's, and the calendar's follows it.
  const end = p.talk ?? { text: p.cal.text, tone: p.cal.tone };
  const facts: ReactNode[] = [p.when];
  if (p.talk) facts.push(p.cal.text);
  else if (p.cal.note) facts.push(p.cal.note);
  // The row is a link to where it goes (the conversation that waits on the owner, else the person), and its tip says which.
  return (
    <Tooltip tip={p.door.tip}>
      <ListRow
        {...routeDoor(p.door.to)}
        face={{ initials: p.initials, size: "sm" }}
        name={p.name}
        end={(place) => (
          <span className={place}>
            <Fact text={end.text} tone={end.tone} />
          </span>
        )}
        said={p.said ? `“${p.said}”` : undefined}
        facts={facts}
        data-testid={`ads-person-${p.personId}`}
      />
    </Tooltip>
  );
}

/** Who the cut keeps: everyone, those with an appointment, or those without. */
const keeps = (cut: Cut, p: AdPersonRowVM): boolean => cut === "all" || (cut === "booked" ? p.booked : !p.booked);

export function AdPeople({ people }: { people: PeopleVM }) {
  const phone = useCmPhone();
  const [cut, setCut] = useState<Cut>("all");
  const rows = people.rows.filter((p) => keeps(cut, p)).slice(0, phone ? SHOWN_ON_PHONE : SHOWN_ON_DESK);
  const tabs: SubTab[] = [
    { id: "all", label: PEOPLE_TAB.everyone, count: people.total },
    ...people.filters.map((f): SubTab => ({ id: f.id, label: f.label, count: f.n })),
  ];
  return (
    <section className="ads-people" aria-label={people.title} data-testid="ads-people">
      <div className="ads-results-head">
        <h3 className="ads-h">{people.title}</h3>
        {people.total > 0 ? <span className="ads-count">{people.total}</span> : null}
      </div>
      {people.total > 0 ? (
        <SubTabs
          label={people.title}
          value={cut}
          tabs={tabs}
          onSelect={(id) => setCut(id === "booked" || id === "not-yet" ? id : "all")}
          className="ads-cuts"
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="ads-people-rows">
          {rows.map((p) => (
            <Person key={p.personId} p={p} />
          ))}
        </div>
      ) : (
        <p className="ads-line">{people.empty ?? PEOPLE_TAB.none}</p>
      )}
      {people.all ? (
        <LinkButton className="ads-all" {...routeDoor(people.all.to)} data-testid="ads-people-all">
          {people.all.words}
          <Icon name="chevron" size={11} />
        </LinkButton>
      ) : null}
    </section>
  );
}
