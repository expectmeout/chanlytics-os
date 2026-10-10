/**
 * The log's filters: what kind of thing, who did it, when, and about whom. Each list is a box that says the one
 * chosen, over the house's menu (the kit's MoreMenu: the glass popover the sidebar's menus are, its rows lifting in the
 * accent's soft tint, the one chosen ticked), as Autonomy's dials already are on this page. On a phone the boxes wait
 * behind the one control the card draws at the end of its head.
 *
 * Why the house's menu and not the kit's Select: the Select, the Combobox and the date picker stand on Base UI, which
 * no Settings tab loads. Imported with the pane they put 76 KB gzipped on every Settings tab's load; asked for on
 * demand they made the bundler pack the chunks other pages share again, and Sent, Campaigns, Templates and People
 * each downloaded 40 KB a second time (CI's builds of #1516, 9 October 2026). The menu is already loaded by this page
 * and by the frame, so the lists cost what they are written in. One day is the browser's own date box in the kit's
 * box, for the same reason: its calendar is the device's, in the theme's colours.
 *
 * The lists were the browser's own selects until 8 Oct 2026, which drew their open list in the system's colours
 * whatever the look (Ruben's screenshot: a flat list with the system's blue on the row under the pointer, beside the
 * glass everything else stands on). The kind list was a text box over a browser's datalist of a hundred and fifty
 * kinds as the ledgers spell them (`open_recording`, `message.send_failed`), then one list of two hundred. It is two
 * short ones: the part of the product (contracts activityKindGroups: Conversations, Calls, People…), with everything
 * and "what went wrong" above them; and, once a part is picked, its kinds in the rows' own words. The log could be
 * narrowed to a customer and never to the member who did the thing, which is what "who did it" asks; and to one day,
 * never to a week.
 */
import { useEffect, useState } from "react";
import {
  ACTIVITY_KINDS,
  ACTIVITY_PAGE_WORDS as W,
  ACTIVITY_SPANS,
  activityFamily,
  activityKindGroups,
  type ActivityMemberDto,
  type ActivitySpan,
} from "@chanlytics/contracts";
import { activity } from "@/legacy-bridge/activity";
import { holdStill } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";

export type Person = { id: string; name: string };

/** What the log is narrowed to, as the boxes hold it. */
export interface Narrowing {
  /** The kind box: nothing, `only:problems`, `family:<family>` or `kind:<kind>`. */
  pick: string;
  /** Who did it: nobody picked, a member's id, `receptionist` or `system`. */
  who: string;
  /** When: any time, one of the spans, or `day` for the one day in `day`. */
  when: "" | ActivitySpan | "day";
  /** The day picked, "YYYY-MM-DD", read only while `when` is `day`. */
  day: string;
  person: Person | null;
}

export const NO_NARROWING: Narrowing = { pick: "", who: "", when: "", day: "", person: null };

/**
 * How many of the four are set, for the phone's one control and the way back to the whole log. One day with no day
 * picked yet counts: the box says it, its date box stands beside it, and a reader who went that far is offered the
 * way back (it counted only a day picked, so Clear stood hidden while the row showed two boxes more).
 */
export const narrowedCount = (n: Narrowing): number => [n.pick, n.who, n.when, n.person].filter(Boolean).length;

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

interface ListProps<V extends string> {
  /** What the list chooses, for a screen reader and the box's tip: the box itself says the one chosen. */
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onPick: (value: V) => void;
  testid: string;
}

/**
 * One of the log's lists: the kit's box saying the one chosen, and the house's menu under it with that one ticked. A
 * screen reader hears what the list chooses before the one chosen (the kit's sr-only words inside the box).
 */
function List<V extends string>({ label, value, options, onPick, testid }: ListProps<V>) {
  const said = options.find((o) => o.value === value)?.label ?? "";
  return (
    <MoreMenu
      items={options.map((o) => ({ label: o.label, checked: o.value === value, onClick: () => onPick(o.value) }))}
      label={
        <span className="set-filter-said">
          <span className="rec-sr">{label}: </span>
          {said}
        </span>
      }
      title={`${label}: ${said}`}
      btnClass="rec-input rec-select"
      align="left"
      // Against the window, so the menu is as wide as its words under a box that is not. Its ground is every pop's,
      // dense enough that the log's coloured lines do not show through it (kit.css).
      escape
      testid={testid}
    />
  );
}

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
      <List
        label={W.area.label}
        value={area}
        onPick={(pick) => set({ pick })}
        options={[
          { value: "", label: W.area.any },
          { value: "only:problems", label: W.area.problems },
          ...groups.map((g) => ({ value: `family:${g.family}`, label: g.label })),
        ]}
        testid="act-area"
      />
      {group && (
        <List
          label={W.kind.label}
          value={n.pick}
          onPick={(pick) => set({ pick })}
          options={[
            { value: `family:${group.family}`, label: W.kind.any },
            ...group.kinds.map((k) => ({ value: `kind:${k.kind}`, label: k.label })),
          ]}
          testid="act-kind"
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
    <List
      label={W.who.label}
      value={n.who}
      onPick={(who) => set({ who })}
      options={[
        { value: "", label: W.who.any },
        ...members.map((m) => ({ value: m.id, label: m.name })),
        { value: "receptionist", label: W.who.receptionist },
        { value: "system", label: W.who.system },
      ]}
      testid="act-who"
    />
  );
}

/** When: any time, a span of days, or one day, whose date box is drawn only once a day is what was asked for. */
function WhenBox({ n, set }: { n: Narrowing; set: (over: Partial<Narrowing>) => void }) {
  return (
    <>
      <List<Narrowing["when"]>
        label={W.when.label}
        value={n.when}
        onPick={(when) => set({ when })}
        options={[
          { value: "", label: W.when.any },
          ...ACTIVITY_SPANS.map((s) => ({ value: s, label: W.when[s] })),
          { value: "day", label: W.when.day },
        ]}
        testid="act-when"
      />
      {n.when === "day" && (
        <input
          className="rec-input"
          type="date"
          aria-label={W.when.pick}
          value={n.day}
          onChange={(e) => set({ day: e.target.value })}
          data-testid="act-day"
        />
      )}
    </>
  );
}

/**
 * About whom: the person picked, as the kit's chip with its ×; or the box that finds one, whoever matches listed
 * under it in the menu's own glass and rows. What it lists is the workspace's answer to the words typed, asked once
 * the typing pauses, so a number finds its person as a name does.
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
      <input
        className="rec-input"
        type="search"
        placeholder={W.person.find}
        aria-label={W.person.label}
        value={personQ}
        onChange={(e) => setPersonQ(e.target.value)}
        data-testid="act-person-q"
      />
      {matches.length > 0 && (
        <div className="more-menu align-left" data-testid="act-person-matches">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              className="more-item"
              onClick={() => {
                set({ person: m });
                setPersonQ("");
                setMatches([]);
              }}
            >
              <span className="more-item-label">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * The phone's one control: the boxes stand between a reader and the log there, so they wait behind it until asked
 * for, and it says how many are set. The card draws it at the end of its head, beside the way back to the whole log,
 * so the head is one height whatever is set (under the head, on a line of its own, it pushed the log a row down). A
 * desktop does not draw it.
 */
export function FiltersAsk({ narrowed, open, onToggle }: { narrowed: number; open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="quiet"
      size="sm"
      className="set-filters-ask"
      aria-expanded={open}
      onClick={(e) => holdStill(e.currentTarget, onToggle)}
      data-testid="act-filters-ask"
    >
      <Icon name="filter" size={12} />
      {W.narrow}
      {narrowed > 0 && <span className="set-filters-ask-n">{narrowed}</span>}
    </Button>
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
