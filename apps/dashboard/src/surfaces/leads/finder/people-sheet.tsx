/**
 * Find people at companies (the people card, 00429; decision 0057's call 8): Leads' rail door beside Import leads, and
 * the record sheet it opens. The owner says who (what they are called, how senior), at which companies (industries,
 * sizes) and where (US states), and how many; the plan is contracts' (peoplePlanFrom), said back in one sentence, and
 * posted to POST lead-searches/people, whose door reserves the month's leads and starts the search. The card's
 * source-rights note is said under the fields, before anything is spent. Every word is contracts'; every part the kit's.
 */
import { useState } from "react";
import {
  LEAD_CARDS,
  PEOPLE_COMPANY_SIZES,
  PEOPLE_COUNT_MAX,
  PEOPLE_FIND_WORDS,
  PEOPLE_INDUSTRIES_MAX,
  PEOPLE_SENIORITIES,
  PEOPLE_SENIORITY_WORDS,
  PEOPLE_STATES_MAX,
  PEOPLE_TITLES_MAX,
  leadsRoute,
  listTyped,
  peoplePlanFrom,
  peoplePlanSentence,
  usStateCode,
  type PeopleCompanySize,
  type PeopleSeniority,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { Sheet } from "../../kit/sheet/sheet";
import { gate, navigate } from "../../legacy-verbs";
import type { Flash } from "../../people/types";

const W = PEOPLE_FIND_WORDS;

/** Starts a people search: the plan as the owner made it, from the page. */
const findPeople = (plan: ReturnType<typeof peoplePlanFrom>) =>
  api()("POST lead-searches/people", { body: { plan, via: "people", thread_id: null }, once: true });

/** One set of switches in a menu: what is on, and the words each says. */
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
    <Menu
      label={p.label}
      groups={[
        {
          header: p.label,
          toggles: {
            items: p.all.map((v) => ({ value: v, label: p.words(v), on: p.on.includes(v) })),
            onToggle: (v) =>
              p.onChange(
                p.on.includes(v as V) ? p.on.filter((x) => x !== v) : p.all.filter((x) => x === v || p.on.includes(x)),
              ),
            tick: <Icon name="check" size={13} />,
          },
        },
      ]}
      trigger={
        <Button variant="secondary" size="sm" data-testid={p.testid}>
          {said} <Icon name="chevron-down" size={11} />
        </Button>
      }
    />
  );
}

/** The sheet: the plan's fields, its sentence, the source's note, and Find. */
function FindPeopleSheet({ onClose, flash }: { onClose: () => void; flash: Flash | null }) {
  const [titles, setTitles] = useState("");
  const [seniority, setSeniority] = useState<PeopleSeniority[]>([]);
  const [industries, setIndustries] = useState("");
  const [sizes, setSizes] = useState<PeopleCompanySize[]>([]);
  const [states, setStates] = useState("");
  const [count, setCount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);

  const n = Number.parseInt(count, 10);
  const plan = peoplePlanFrom({
    asked: titles.trim(),
    count: Number.isInteger(n) ? Math.min(Math.max(n, 1), PEOPLE_COUNT_MAX) : 1,
    titles: listTyped(titles, PEOPLE_TITLES_MAX),
    seniority,
    industries: listTyped(industries, PEOPLE_INDUSTRIES_MAX),
    sizes,
    states: listTyped(states, PEOPLE_STATES_MAX)
      .map(usStateCode)
      .filter((s): s is string => !!s),
  });
  const rights = LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? "";

  const start = async () => {
    if (busy) return;
    if (!plan.titles.length) return setWrong(W.needTitle);
    if (!Number.isInteger(n) || n < 1 || n > PEOPLE_COUNT_MAX) return setWrong(W.needCount);
    setWrong(null);
    setBusy(true);
    const r = await findPeople(plan);
    setBusy(false);
    if (!r.ok) {
      setWrong(r.message || W.failed);
      return;
    }
    if (flash) flash({ msg: <>{W.done}</> });
    onClose();
    if (r.data.search_id) navigate(leadsRoute({ searchId: r.data.search_id, list: "all" }));
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title}
      sub={W.sub}
      close={{ label: W.cancel, glyph: <Icon name="x" size={13} /> }}
      testid="find-people"
      foot={
        <>
          <Button variant="quiet" onClick={onClose} data-testid="find-people-cancel">
            {W.cancel}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void start()} data-testid="find-people-start">
            {busy ? W.starting : W.start(plan.count)}
          </Button>
        </>
      }
    >
      <Field
        label={W.titles}
        hint={W.titlesHint}
        value={titles}
        onValueChange={setTitles}
        autoFocus
        data-testid="find-people-titles"
      />
      <Toggles
        label={W.seniority}
        any={W.seniorityAny}
        all={PEOPLE_SENIORITIES}
        words={(v) => PEOPLE_SENIORITY_WORDS[v]}
        on={seniority}
        onChange={setSeniority}
        testid="find-people-seniority"
      />
      <Field
        label={W.industries}
        hint={W.industriesHint}
        value={industries}
        onValueChange={setIndustries}
        data-testid="find-people-industries"
      />
      <Toggles
        label={W.sizes}
        any={W.sizesAny}
        all={PEOPLE_COMPANY_SIZES}
        words={(v) => v}
        on={sizes}
        onChange={setSizes}
        testid="find-people-sizes"
      />
      <Field
        label={W.states}
        hint={W.statesHint}
        value={states}
        onValueChange={setStates}
        data-testid="find-people-states"
      />
      <Field
        label={W.count}
        hint={W.countHint}
        value={count}
        onValueChange={setCount}
        inputMode="numeric"
        maxLength={3}
        data-testid="find-people-count"
      />
      <p className="pk-alt-why" data-testid="find-people-plan">
        {plan.titles.length ? peoplePlanSentence(plan) : W.needTitle}
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

/** Leads' Find people: the rail's door, and the sheet it opens. Only who may find leads may open it. */
export function useFindPeople({ flash = null }: { flash?: Flash | null } = {}) {
  const [open, setOpen] = useState(false);
  const door = (
    <Button
      variant="quiet"
      size="sm"
      onClick={() => setOpen(true)}
      data-testid="leads-find-people"
      {...gate("find", "find people at companies")}
    >
      <Icon name="search" size={11} /> {W.door}
    </Button>
  );
  const node = open ? <FindPeopleSheet onClose={() => setOpen(false)} flash={flash} /> : null;
  return { door, node, open: () => setOpen(true) };
}
