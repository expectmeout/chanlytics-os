/**
 * The log's filters: what kind of thing, who did it, when, and about whom. The kit's lists in a row (its Select, whose
 * list pops over the page on the panel's pop as the sidebar's menus and the Inbox's do; its date picker; its Combobox
 * for a person); on a phone they wait behind the one control the card draws at the end of its head (narrowing.tsx).
 * This module is its own chunk, asked for as the pane is first drawn (narrowing.tsx loadBoxes): the three kit parts
 * stand on Base UI, and imported with the pane they rode on every Settings tab's load, 76 KB gzipped more on the
 * page's own JS (CI's build, 9 October 2026).
 *
 * The lists were the browser's own selects in the kit's box until 8 Oct 2026, which drew their open list in the
 * system's colours whatever the look (Ruben's screenshot: a flat list with the system's blue on the row under the
 * pointer, beside the glass everything else stands on). The kind list was a text box over a browser's datalist of a
 * hundred and fifty kinds as the ledgers spell them (`open_recording`, `message.send_failed`), then one list of two
 * hundred. It is two short ones: the part of the product (contracts activityKindGroups: Conversations, Calls,
 * People…), with everything and "what went wrong" above them; and, once a part is picked, its kinds in the rows' own
 * words. The log could be narrowed to a customer and never to the member who did the thing, which is what "who did
 * it" asks; and to one day, never to a week.
 */
import { useEffect, useState } from "react";
import {
  ACTIVITY_KINDS,
  ACTIVITY_PAGE_WORDS as W,
  ACTIVITY_SPANS,
  activityFamily,
  activityKindGroups,
  zoneMidnight,
  type ActivityMemberDto,
} from "@chanlytics/contracts";
import { activity } from "@/legacy-bridge/activity";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Combobox } from "../../kit/combobox/combobox";
import { DatePicker } from "../../kit/datepicker/datepicker";
import { Icon } from "../../kit/icon/icon";
import { Select } from "../../kit/select/select";
import type { Narrowing, Person } from "./narrowing";

/** How long the person box waits after a key before it asks who matches. */
const PERSON_SEARCH_MS = 250;

/** Up to ten people matching what is typed, asked once the typing pauses; none for an empty box. */
function usePersonMatches(personQ: string): [Person[], (m: Person[]) => void] {
  const [matches, setMatches] = useState<Person[]>([]);
  useEffect(() => {
    if (!personQ.trim()) {
      setMatches([]);
      return undefined;
    }
    let on = true;
    const t = setTimeout(() => {
      void activity.people(personQ.trim()).then((m) => {
        if (on) setMatches(m);
      });
    }, PERSON_SEARCH_MS);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [personQ]);
  return [matches, setMatches];
}

/** Every list's chevron: the Icon's, as the kit's Select asks for it. */
const chevron = () => <Icon name="chevron-down" size={12} />;

/** The part of the product a pick is in, as the first list holds it: everything, what went wrong, or a family. */
function areaOf(pick: string): string {
  if (!pick.startsWith("kind:")) return pick;
  const family = activityFamily(pick.slice("kind:".length));
  return family ? `family:${family}` : "";
}

/**
 * What kind of thing: the part of the product first, and its kinds beside it once one is picked. Two lists a reader
 * can take in at a glance, where one of two hundred was a scroll; the second is drawn only when there is a part to
 * list. The kinds are the log's own once it has answered, and contracts' until then, so the lists are whole on the
 * first paint.
 */
function KindBoxes({
  kinds,
  n,
  set,
}: {
  kinds: readonly string[];
  n: Narrowing;
  set: (over: Partial<Narrowing>) => void;
}) {
  const groups = activityKindGroups(kinds.length ? kinds : ACTIVITY_KINDS);
  const area = areaOf(n.pick);
  const group = groups.find((g) => area === `family:${g.family}`) ?? null;
  return (
    <>
      <Select
        label={W.area.label}
        value={area}
        onValueChange={(pick) => set({ pick })}
        options={[
          { value: "", label: W.area.any },
          { value: "only:problems", label: W.area.problems },
          ...groups.map((g) => ({ value: `family:${g.family}`, label: g.label })),
        ]}
        chevron={chevron()}
        data-testid="act-area"
      />
      {group && (
        <Select
          label={W.kind.label}
          value={n.pick}
          onValueChange={(pick) => set({ pick })}
          options={[
            { value: `family:${group.family}`, label: W.kind.any },
            ...group.kinds.map((k) => ({ value: `kind:${k.kind}`, label: k.label })),
          ]}
          chevron={chevron()}
          data-testid="act-kind"
        />
      )}
    </>
  );
}

/** Who did it: anyone, a member, the receptionist, or the system by itself. */
function WhoBox({
  members,
  n,
  set,
}: {
  members: readonly ActivityMemberDto[];
  n: Narrowing;
  set: (over: Partial<Narrowing>) => void;
}) {
  return (
    <Select
      label={W.who.label}
      value={n.who}
      onValueChange={(who) => set({ who })}
      options={[
        { value: "", label: W.who.any },
        ...members.map((m) => ({ value: m.id, label: m.name })),
        { value: "receptionist", label: W.who.receptionist },
        { value: "system", label: W.who.system },
      ]}
      chevron={chevron()}
      data-testid="act-who"
    />
  );
}

/**
 * When: any time, a span of days, or one day, whose picker is drawn only once a day is what was asked for: the kit's
 * date picker, a month over the page from the button that says the day (the browser's own date box drew its picker
 * in the system's colours and type). Until a day is picked the button asks for one, and the month opens on today.
 */
function WhenBox({ n, set }: { n: Narrowing; set: (over: Partial<Narrowing>) => void }) {
  const clock = pageClock();
  const today = clock.dayKey(Date.now());
  return (
    <>
      <Select<Narrowing["when"]>
        label={W.when.label}
        value={n.when}
        onValueChange={(when) => set({ when })}
        options={[
          { value: "", label: W.when.any },
          ...ACTIVITY_SPANS.map((s) => ({ value: s, label: W.when[s] })),
          { value: "day", label: W.when.day },
        ]}
        chevron={chevron()}
        data-testid="act-when"
      />
      {n.when === "day" && (
        <DatePicker
          value={n.day || today}
          onValueChange={(day) => set({ day })}
          today={today}
          label={W.when.pick}
          glyphs={{ previous: <Icon name="chevron" size={14} />, next: <Icon name="chevron" size={14} /> }}
          trigger={
            <Button size="sm" data-testid="act-day">
              <Icon name="calendar" size={12} />
              {n.day ? clock.dayLabel(zoneMidnight(clock.zone(), n.day)) : W.when.pick}
            </Button>
          }
        />
      )}
    </>
  );
}

/**
 * About whom: the person picked, as the kit's chip with its ×; or the kit's Combobox that finds one. What it lists is
 * the workspace's answer to the words typed (its onQuery, asked once the typing pauses), so a number finds its person
 * as a name does; the kit narrows none of it.
 */
function PersonBox({ n, set }: { n: Narrowing; set: (over: Partial<Narrowing>) => void }) {
  const [personQ, setPersonQ] = useState("");
  const [matches, setMatches] = usePersonMatches(personQ);
  if (n.person) {
    return (
      <span className="chip" data-testid="act-person">
        <Icon name="user" size={10} />
        {n.person.name}
        <button
          type="button"
          className="chip-x"
          aria-label={W.person.everyone(n.person.name)}
          onClick={() => set({ person: null })}
        >
          <Icon name="x" size={9} />
        </button>
      </span>
    );
  }
  return (
    <span className="set-filter-person">
      <Combobox
        label={W.person.label}
        value={null}
        onValueChange={(id) => {
          const one = matches.find((m) => m.id === id);
          if (!one) return;
          set({ person: one });
          setPersonQ("");
          setMatches([]);
        }}
        onQuery={setPersonQ}
        options={matches.map((m) => ({ value: m.id, label: m.name }))}
        placeholder={W.person.find}
        glass={<Icon name="search" size={12} />}
        className="set-filter-find"
        data-testid="act-person-q"
      />
    </span>
  );
}

interface FilterProps {
  n: Narrowing;
  set: (over: Partial<Narrowing>) => void;
  kinds: readonly string[];
  members: readonly ActivityMemberDto[];
  /** On a phone: whether the boxes were asked for. A desktop draws them whatever this says. */
  open: boolean;
}

/** The four filters, in a row; on a phone a column, drawn once asked for. */
export function ActivityFilters({ n, set, kinds, members, open }: FilterProps) {
  return (
    <div className={`set-filters${open ? " open" : ""}`}>
      <KindBoxes kinds={kinds} n={n} set={set} />
      <WhoBox members={members} n={n} set={set} />
      <WhenBox n={n} set={set} />
      <PersonBox n={n} set={set} />
    </div>
  );
}
