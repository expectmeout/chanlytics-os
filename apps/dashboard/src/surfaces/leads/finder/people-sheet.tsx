/**
 * Find people at companies (the people card, 00430; decision 0057's call 8): Leads' rail door beside Import leads, and
 * the record sheet it opens. The owner says who (what they are called, how senior), at which companies (industries,
 * sizes) and where (US states), and how many companies; the plan is contracts' (peoplePlanFrom), said back in one
 * sentence, and posted to POST lead-searches/people, whose door reserves the month's leads and starts the search. What
 * the route would refuse is said at its box before anything is asked (peopleSheetProblems): a state that reads as none is
 * never dropped into a search of the whole US. A search's own plan opens it filled in (Find more like these). The card's
 * source-rights note is said under the fields, before anything is spent. The door is drawn only while the card finds
 * leads (00430 lead_card_live). Every word is contracts'; every part the kit's.
 */
import { useRef, useState } from "react";
import {
  LEAD_CARDS,
  PEOPLE_COMPANY_SIZES,
  PEOPLE_COUNT_MAX,
  PEOPLE_FIND_WORDS,
  PEOPLE_INDUSTRIES_MAX,
  PEOPLE_SENIORITIES,
  PEOPLE_SENIORITY_WORDS,
  PEOPLE_TITLES_MAX,
  leadsRoute,
  listTyped,
  peoplePlanFrom,
  peoplePlanOf,
  peoplePlanSentence,
  peopleSheetProblems,
  usStatesTyped,
  type LeadPeoplePlan,
  type PeopleCompanySize,
  type PeopleSeniority,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field, fieldProblem } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { UnsavedAsk, useUnsavedWork } from "../../kit/record/work";
import type { UnsavedWork } from "../../kit/record/work";
import { Sheet } from "../../kit/sheet/sheet";
import { focusAsDrawn, gate, navigate } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import { startPeopleSearch } from "../surface";

const PW = PEOPLE_FIND_WORDS;

/** One set of switches in a menu, under its label: what is on, and the words each says. */
function Toggles<V extends string>(p: {
  label: string;
  any: string;
  all: readonly V[];
  words: (v: V) => string;
  on: readonly V[];
  onChange: (next: V[]) => void;
  testid: string;
}) {
  const said = p.on.length ? p.on.map(p.words).join(", ") : p.any;
  return (
    <Field
      label={p.label}
      control={
        <Menu
          label={p.label}
          groups={[
            {
              header: p.label,
              toggles: {
                items: p.all.map((v) => ({ value: v, label: p.words(v), on: p.on.includes(v) })),
                onToggle: (v) =>
                  p.onChange(
                    p.on.includes(v as V)
                      ? p.on.filter((x) => x !== v)
                      : p.all.filter((x) => x === v || p.on.includes(x)),
                  ),
                tick: <Icon name="check" size={13} />,
              },
            },
          ]}
          trigger={
            <Button variant="secondary" size="sm" aria-label={`${p.label}: ${said}`} data-testid={p.testid}>
              {said} <Icon name="chevron-down" size={11} />
            </Button>
          }
        />
      }
    />
  );
}

/**
 * The sheet's foot: the one question while Cancel asks about what was typed, else the house's pair, which a phone draws
 * with the filled act first and the two an equal pair across the foot (kit.css, data-foot-pair).
 */
const findFoot = (work: UnsavedWork, startWords: string, busy: boolean, onStart: () => void) =>
  work.asking ? (
    <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="find-people-leave" />
  ) : (
    <div data-foot-pair="">
      <Button variant="quiet" onClick={work.leave} data-testid="find-people-cancel">
        {PW.cancel}
      </Button>
      <Button variant="primary" disabled={busy} onClick={onStart} data-testid="find-people-start">
        {startWords}
      </Button>
    </div>
  );

/** The sheet: the plan's fields, its sentence, the source's note, and Find. `from` fills it in with a plan made before. */
function FindPeopleSheet({
  onClose,
  flash,
  from,
}: {
  onClose: () => void;
  flash: Flash | null;
  from: LeadPeoplePlan | null;
}) {
  const [titles, setTitles] = useState(from ? from.titles.join(", ") : "");
  const [seniority, setSeniority] = useState<PeopleSeniority[]>(from ? [...from.seniority] : []);
  const [industries, setIndustries] = useState(from ? from.industries.join(", ") : "");
  const [sizes, setSizes] = useState<PeopleCompanySize[]>(from ? [...from.sizes] : []);
  const [states, setStates] = useState(from ? from.states.join(", ") : "");
  const [count, setCount] = useState(String(from ? from.count : 100));
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  // An industry the directory does not list, as the route said it (its list stays on the server): under the box, until
  // the box changes.
  const [industryRefused, setIndustryRefused] = useState<string | null>(null);
  // Problems are said once Find was pressed, so a box is never red while its first words are still being typed.
  const [tried, setTried] = useState(false);
  // The first box takes the focus as the sheet opens, where a keyboard is not raised over it (focusAsDrawn).
  const first = useRef<HTMLInputElement | null>(null);

  // What was typed, against what the sheet opened on: changed and not yet found, Cancel, the wash, a pull or Escape ask
  // before throwing it away (Ruben, 19 Oct 2026).
  const typed = JSON.stringify([titles, seniority, industries, sizes, states, count]);
  const [opened] = useState(typed);
  const work = useUnsavedWork("find-people", null, {
    value: { titles, seniority, industries, sizes, states, count },
    dirty: typed !== opened && !busy,
    onLeave: onClose,
  });

  const problems = peopleSheetProblems({ titles, industries, states, count });
  const shown = tried ? { ...problems, ...(industryRefused ? { industries: industryRefused } : {}) } : {};
  const n = Number(count.trim());
  const plan = peoplePlanFrom({
    asked: titles.trim(),
    count: Number.isInteger(n) ? Math.min(Math.max(n, 1), PEOPLE_COUNT_MAX) : 1,
    titles: listTyped(titles, PEOPLE_TITLES_MAX),
    seniority,
    industries: listTyped(industries, PEOPLE_INDUSTRIES_MAX),
    sizes,
    states: usStatesTyped(states).codes,
  });
  const rights = LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? "";

  const start = async () => {
    if (busy) return;
    setTried(true);
    if (Object.keys(problems).length) return;
    setWrong(null);
    setBusy(true);
    const r = await startPeopleSearch(plan);
    setBusy(false);
    if (!r.ok) {
      const industry = r.fields?.["plan.industries"];
      if (industry) setIndustryRefused(industry);
      else setWrong(r.message || PW.failed);
      return;
    }
    if (flash) flash({ msg: <>{PW.done}</> });
    work.done();
    onClose();
    if (r.data.search_id) navigate(leadsRoute({ searchId: r.data.search_id, list: "all" }));
  };

  return (
    <Sheet
      open
      onClose={work.leave}
      title={PW.title}
      sub={PW.sub}
      close={{ label: PW.cancel, glyph: <Icon name="x" size={13} /> }}
      testid="find-people"
      {...(focusAsDrawn() ? { initialFocus: first } : {})}
      foot={findFoot(work, busy ? PW.starting : PW.start(plan.count), busy, () => void start())}
    >
      <Field
        label={PW.titles}
        hint={PW.titlesHint}
        value={titles}
        onValueChange={setTitles}
        ref={first}
        data-testid="find-people-titles"
        {...fieldProblem(shown.titles)}
      />
      <Toggles
        label={PW.seniority}
        any={PW.seniorityAny}
        all={PEOPLE_SENIORITIES}
        words={(v) => PEOPLE_SENIORITY_WORDS[v]}
        on={seniority}
        onChange={setSeniority}
        testid="find-people-seniority"
      />
      <Field
        label={PW.industries}
        hint={PW.industriesHint}
        value={industries}
        onValueChange={(v) => {
          setIndustries(v);
          setIndustryRefused(null);
        }}
        data-testid="find-people-industries"
        {...fieldProblem(shown.industries)}
      />
      <Toggles
        label={PW.sizes}
        any={PW.sizesAny}
        all={PEOPLE_COMPANY_SIZES}
        words={(v) => v}
        on={sizes}
        onChange={setSizes}
        testid="find-people-sizes"
      />
      <Field
        label={PW.states}
        hint={PW.statesHint}
        value={states}
        onValueChange={setStates}
        data-testid="find-people-states"
        {...fieldProblem(shown.states)}
      />
      <Field
        label={PW.count}
        hint={PW.countHint}
        value={count}
        onValueChange={setCount}
        inputMode="numeric"
        maxLength={3}
        data-testid="find-people-count"
        {...fieldProblem(shown.count)}
      />
      <p className="pk-alt-why" data-testid="find-people-plan">
        {plan.titles.length ? peoplePlanSentence(plan) : PW.needTitle}
      </p>
      {rights ? <p className="pk-alt-why">{rights}</p> : null}
      {wrong ? (
        <p className="pk-alt-why" role="alert" data-testid="find-people-wrong">
          {wrong}
        </p>
      ) : null}
    </Sheet>
  );
}

/**
 * Leads' Find people: the rail's door, and the sheet it opens, filled in when it is opened with a plan. Only who may find
 * leads may open it, and only while the people card finds leads (`live`, 00430 lead_card_live): no door otherwise.
 */
export function useFindPeople({ flash = null, live }: { flash?: Flash | null; live: boolean }) {
  const [open, setOpen] = useState<{ from: LeadPeoplePlan | null } | null>(null);
  const door = live ? (
    <Button
      variant="quiet"
      size="sm"
      onClick={() => setOpen({ from: null })}
      data-testid="leads-find-people"
      {...gate("find", "find people at companies")}
    >
      <Icon name="search" size={11} /> {PW.door}
    </Button>
  ) : null;
  const node = open ? <FindPeopleSheet onClose={() => setOpen(null)} flash={flash} from={open.from} /> : null;
  // Opened with a plan made before, or with nothing (whatever else a press hands it); while the card finds no leads it
  // says so, for a search's Find more like these that was drawn before the card was shut.
  const opens = (from: unknown = null) => {
    if (live) setOpen({ from: peoplePlanOf(from) });
    else if (flash) flash({ msg: <>{PW.closed}</> });
  };
  return { door, node, open: opens };
}
