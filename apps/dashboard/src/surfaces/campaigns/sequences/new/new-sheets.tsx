/**
 * New's pickers (decision 0065; the New canvas's rows C and F): a sheet for each choice the draft says as a word to press.
 * What kind it is, who it is for (people's moments and lists, or the searches whose leads are ready, the toggle between
 * them at the top), when a one-off goes, the hour, the channels, a step's message, its wait and what must still hold, Your
 * OK, and where a sequence to leads sends from (a step added is add-step.tsx's, which a record draws too). Each changes the draft in
 * place through new-model.ts, but the kind and the audience, which Ask drafts again from the same line. The kit's Sheet:
 * a side pane on a desk, from the bottom on a phone. Every word is contracts'.
 */
import { useState, type ReactNode } from "react";
import {
  CHANNELS_DOOR,
  DAY_MS,
  FOLLOW_UP_CONDITIONS,
  SEQUENCE_EDIT_WORDS,
  NEW_ONCE_AHEAD_DAYS,
  NEW_WAIT_DAYS,
  NEW_WORDS as W,
  PLAYBOOK_HOURS,
  SEQUENCE_MODE_WORDS,
  clockHour,
  leadsRoute,
  newConditionsOf,
  newListOf,
  peopleRoute,
  sequenceModesFor,
  sequenceRoute,
  zonedInputValue,
  type ConsentChannel,
  type DraftWho,
  type NewAudience,
  type NewDraftDto,
  type NewKind,
  type ReachOutSourceDto,
  type SequenceMode,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { Select } from "../../../kit/select/select";
import { Sheet } from "../../../kit/sheet/sheet";
import { Switch } from "../../../kit/switch/switch";
import { keyPress, routeDoor } from "../../../legacy-verbs";
import { pageClock } from "@/legacy-bridge/zone";
import { WhenDayTime } from "../../broadcasts/when";
import * as M from "./new-model";
import { AudienceToggle, CaseNote } from "./new-parts";

/** Which picker is open, and for which step. */
export type NewSheet =
  | { kind: "kind" }
  | { kind: "who" }
  | { kind: "when" }
  | { kind: "hour" }
  | { kind: "channels" }
  | { kind: "message"; i: number }
  | { kind: "timing"; i: number }
  | { kind: "words"; i: number }
  | { kind: "add" }
  | { kind: "ok" }
  | { kind: "from" };

/** A sheet of choices: its title, the line under it, its rows, and a foot where it has one. */
export function PickSheet(p: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  testid: string;
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title={p.title}
      sub={p.sub}
      close={{ label: W.sheets.close, glyph: <Icon name="x" size={13} /> }}
      foot={p.foot}
      testid={p.testid}
    >
      <div className="sq-nw-pick">{p.children}</div>
    </Sheet>
  );
}

/** A row to press, as a door does: a press or a key, or nothing where it is only said. */
function pressOf(fn: (() => void) | null | undefined) {
  if (!fn) return {};
  return { role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: keyPress(fn) };
}

/** One choice of a sheet: its glyph, name and line, its kind or its count, and the tick where it is the one chosen. */
export function Choice(p: {
  glyph: string;
  name: string;
  said?: string | null;
  /** What kind it makes, at the row's end ("Sequence", "Once"). */
  tag?: string | null;
  count?: number | null;
  on?: boolean;
  off?: boolean;
  door?: { label: string; to: string } | null;
  onPick?: (() => void) | null;
  testid: string;
}) {
  const press = p.off ? {} : pressOf(p.onPick);
  return (
    <ListRow
      mark={<Icon name={p.glyph} size={15} />}
      name={p.name}
      said={p.said ?? undefined}
      className={p.off ? "sq-nw-choice is-off" : p.on ? "sq-nw-choice is-on" : "sq-nw-choice"}
      aria-pressed={p.onPick ? !!p.on : undefined}
      data-testid={p.testid}
      end={(c) => (
        <span className={c}>
          {p.door ? (
            <a className="sq-nw-door" {...routeDoor(p.door.to)}>
              {p.door.label}
              <Icon name="chevron" size={13} />
            </a>
          ) : (
            <>
              {p.tag ? <span className="sq-nw-kind">{p.tag}</span> : null}
              {p.count !== null && p.count !== undefined ? <b className="sq-nw-count">{p.count}</b> : null}
              {p.on ? <Icon name="check" size={15} /> : null}
            </>
          )}
        </span>
      )}
      {...press}
    />
  );
}

/** What kind: a sequence, or a message sent once. Ask drafts it again as the other from the same line. */
export function KindSheet(p: { open: boolean; kind: NewKind; onKind: (k: NewKind) => void; onClose: () => void }) {
  return (
    <PickSheet open={p.open} title={W.sheets.kind} sub={W.sheets.kindSub} onClose={p.onClose} testid="sq-nw-kind">
      <div className="sq-nw-rows">
        <Choice
          glyph="list"
          name={W.draft.kind.sequence}
          said={W.sheets.sequenceSaid}
          on={p.kind === "sequence"}
          onPick={() => p.onKind("sequence")}
          testid="sq-nw-kind-sequence"
        />
        <Choice
          glyph="send"
          name={W.draft.kind.once}
          said={W.sheets.onceSaid}
          on={p.kind === "once"}
          onPick={() => p.onKind("once")}
          testid="sq-nw-kind-once"
        />
      </div>
      <p className="sq-nw-note">{W.sheets.kindNote}</p>
    </PickSheet>
  );
}

/**
 * What the who sheet reads, as Campaigns' read counts it (campaigns/playbooks/surface.ts): the moments a new sequence may
 * start on and the lists it may run on, each with who can hear it now (null where it was not counted) and how it is kept,
 * everyone who said yes to offers and how many the week's breath holds back, the searches whose leads are ready, and what
 * already runs.
 */
export interface WhoReads {
  moments: readonly {
    id: string;
    label: string;
    hint: string;
    kind: string;
    offered: boolean;
    candidates: number | null;
  }[];
  lists: readonly { id: string; name: string; candidates: number | null; said: string | null }[];
  everyone: number | null;
  everyoneHeld: number | null;
  sources: readonly ReachOutSourceDto[] | null;
  running: readonly SequenceRowDto[];
}

/** The sequence already on a moment, a list or a search, which a second would double. */
export function runningOn(
  running: readonly SequenceRowDto[],
  f: (r: SequenceRowDto) => boolean,
): SequenceRowDto | null {
  return running.find((r) => r.state !== "ended" && f(r)) ?? null;
}

/** People's moments, each with who can hear it now; one a sequence already starts on said so, with its door. */
function MomentChoices({ draft, reads, onWho }: { draft: NewDraftDto; reads: WhoReads; onWho: (w: DraftWho) => void }) {
  const moments = reads.moments.filter((t) => t.offered && t.kind !== "saved");
  return (
    <>
      <p className="sq-nw-cap">{W.sheets.atAMoment}</p>
      <div className="sq-nw-rows">
        {moments.map((t) => {
          const twin = runningOn(reads.running, (r) => r.starts === "moment" && r.first?.trigger === t.id);
          const on = draft.who?.kind === "moment" && draft.who.trigger === t.id;
          return (
            <Choice
              key={t.id}
              glyph="clock"
              name={t.label}
              said={twin ? W.sheets.runsAlready(twin.name) : t.hint}
              count={twin ? null : t.candidates}
              on={on}
              off={!!twin && !on}
              door={twin && !on ? { label: W.sheets.open, to: sequenceRoute(twin.id) } : null}
              onPick={() => onWho({ kind: "moment", trigger: t.id, label: t.label })}
              testid={`sq-nw-who-${t.id}`}
            />
          );
        })}
      </div>
    </>
  );
}

/** The lists a sequence starts on, or a one-off goes to: People's, then the workspace's own, each with its count. */
function ListChoices(p: { draft: NewDraftDto; reads: WhoReads; onWho: (w: DraftWho) => void; cap: string }) {
  // Never who said stop (contracts newListOf).
  const lists = p.reads.lists.filter((l) => newListOf(l.id, "sequence") === "list");
  if (lists.length === 0) return null;
  return (
    <>
      <p className="sq-nw-cap">{p.cap}</p>
      <div className="sq-nw-rows">
        {lists.map((l) => (
          <Choice
            key={l.id}
            glyph="users"
            name={l.name}
            said={l.said}
            count={l.candidates}
            on={p.draft.who?.kind === "list" && p.draft.who.token === l.id}
            onPick={() => p.onWho({ kind: "list", token: l.id, label: l.name })}
            testid={`sq-nw-who-${l.id}`}
          />
        ))}
      </div>
    </>
  );
}

/** The searches whose leads it could write to: ready counts, one a sequence already adds from said so. */
function SearchChoices({ draft, reads, onWho }: { draft: NewDraftDto; reads: WhoReads; onWho: (w: DraftWho) => void }) {
  // No search has found any yet (F6): Leads finds them first.
  if ((reads.sources ?? []).length === 0)
    return (
      <CaseNote
        tone="plain"
        glyph="search"
        title={W.leadsNone.head}
        words={W.leadsNone.words}
        acts={
          <Button size="sm" variant="primary" {...routeDoor(leadsRoute({ list: "all" }))} data-testid="sq-nw-find">
            {W.leadsNone.find}
          </Button>
        }
        testid="sq-nw-leads-none"
      />
    );
  return (
    <>
      <p className="sq-nw-cap">{W.sheets.aSearch}</p>
      <div className="sq-nw-rows">
        {(reads.sources ?? []).map((s) => {
          const twin = runningOn(reads.running, (r) => r.starts === "leads" && r.first?.source_search_id === s.id);
          const on = draft.who?.kind === "search" && draft.who.id === s.id;
          return (
            <Choice
              key={s.id}
              glyph="search"
              name={s.name}
              said={
                twin
                  ? W.sheets.hasItsSequence
                  : s.ready === 0
                    ? s.with_unconfirmed > 0
                      ? W.sheets.foundNone(s.with_unconfirmed)
                      : W.sheets.noneChecked
                    : s.with_unconfirmed > s.ready
                      ? W.sheets.checkingSaid(s.with_unconfirmed - s.ready)
                      : null
              }
              count={twin ? null : s.ready}
              on={on}
              off={!!twin && !on}
              door={twin && !on ? { label: W.sheets.open, to: sequenceRoute(twin.id) } : null}
              onPick={() => onWho({ kind: "search", id: s.id, label: s.name })}
              testid={`sq-nw-who-search-${s.id}`}
            />
          );
        })}
      </div>
      <p className="sq-nw-cap">{W.sheets.or}</p>
      <div className="sq-nw-rows">
        <Choice
          glyph="check"
          name={W.sheets.leadsYouPick}
          said={W.sheets.leadsYouPickSaid}
          door={{ label: W.sheets.open, to: leadsRoute({ list: "all" }) }}
          testid="sq-nw-who-picked"
        />
        <Choice
          glyph="plus"
          name={W.sheets.findMore}
          said={W.sheets.findMoreSaid}
          door={{ label: W.sheets.find, to: leadsRoute({ list: "all" }) }}
          testid="sq-nw-who-find"
        />
      </div>
    </>
  );
}

/** A word that opens a row's name ("now", "everyone who said yes to offers"), capitalised there. */
const upFirst = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** Who a one-off goes to: everyone whose yes it needs, a list, or people picked in People. */
function OnceChoices(p: { draft: NewDraftDto; reads: WhoReads; onWho: (w: DraftWho) => void; offer: boolean }) {
  const everyone = M.everyoneOf(p.offer);
  const held = p.offer ? (p.reads.everyoneHeld ?? 0) : 0;
  return (
    <div className="sq-nw-rows">
      <Choice
        glyph="users"
        name={upFirst(everyone.label)}
        said={held > 0 ? W.reach.heldBack(held) : null}
        count={p.offer ? p.reads.everyone : null}
        on={p.draft.who?.kind === "everyone"}
        onPick={() => p.onWho(everyone)}
        testid="sq-nw-who-everyone"
      />
      {/* A list of who said yes is the row above; who said stop is no one's (contracts newListOf). */}
      {p.reads.lists
        .filter((l) => newListOf(l.id, "once") === "list")
        .map((l) => (
          <Choice
            key={l.id}
            glyph="users"
            name={l.name}
            said={l.said}
            count={l.candidates}
            on={p.draft.who?.kind === "list" && p.draft.who.token === l.id}
            onPick={() => p.onWho({ kind: "list", token: l.id, label: l.name })}
            testid={`sq-nw-who-${l.id}`}
          />
        ))}
      <Choice
        glyph="check"
        name={W.sheets.peoplePick}
        said={W.sheets.peoplePickSaid}
        door={{ label: W.sheets.open, to: peopleRoute() }}
        testid="sq-nw-who-pick-people"
      />
    </div>
  );
}

/** Who it starts for: the toggle, then what each audience offers for the kind. */
export function WhoSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  reads: WhoReads;
  onWho: (w: DraftWho) => void;
  onAudience: (a: NewAudience) => void;
  onClose: () => void;
}) {
  const { draft, reads } = p;
  const once = draft.kind === "once";
  const leads = draft.audience === "leads";
  const none = (reads.sources ?? []).length === 0;
  const offer = draft.steps[0]?.message?.offer ?? true;
  const sub = leads
    ? none
      ? W.leadsNone.title
      : W.sheets.readyMeans
    : once && offer
      ? W.sheets.countsOffer
      : W.sheets.countsAre;
  return (
    <PickSheet
      open={p.open}
      title={once ? W.sheets.goesTo : W.sheets.startsFor}
      sub={sub}
      onClose={p.onClose}
      testid="sq-nw-who"
    >
      <AudienceToggle audience={draft.audience} onAudience={p.onAudience} wide />
      {leads ? (
        <SearchChoices draft={draft} reads={reads} onWho={p.onWho} />
      ) : once ? (
        <OnceChoices draft={draft} reads={reads} onWho={p.onWho} offer={offer} />
      ) : (
        <>
          <MomentChoices draft={draft} reads={reads} onWho={p.onWho} />
          <ListChoices draft={draft} reads={reads} onWho={p.onWho} cap={W.sheets.joinsAList} />
        </>
      )}
      {leads ? (
        none ? null : (
          <p className="sq-nw-note">{W.sheets.leadsNote}</p>
        )
      ) : once ? (
        <p className="sq-nw-note">{W.sheets.onceWhoNote}</p>
      ) : (
        <p className="sq-nw-note">
          {W.sheets.peopleNote}{" "}
          <a className="sq-nw-door" {...routeDoor(peopleRoute())} data-testid="sq-nw-make-list">
            {W.sheets.makeList}
          </a>
        </p>
      )}
    </PickSheet>
  );
}

/** Later today, by the business's clock: five in the afternoon, or two hours on after four; none once that is past its hours. */
function laterTodayOf(now: string): string | null {
  const hour = Number(now.slice(11, 13));
  const at = hour < 16 ? 17 : hour + 2;
  return at <= PLAYBOOK_HOURS.max ? `${now.slice(0, 10)}T${String(at).padStart(2, "0")}:00` : null;
}

/** When a one-off goes: now (ten minutes on, with a Stop), later today, or a day and time ahead; by the business's clock. */
export function WhenSheet(p: {
  open: boolean;
  at: string | null;
  tz: string;
  onAt: (at: string | null) => void;
  onClose: () => void;
}) {
  const now = zonedInputValue(Date.now(), p.tz);
  const later = laterTodayOf(now);
  // Late at night "now" waits for the sending hours, as every send does (nextOpenMoment): said so here.
  const goes = M.sendsAt(p.tz, Date.now());
  // A day picked opens on tomorrow's first hour, and moves by the kit's pickers within the days a send may wait. Tomorrow
  // is the business's day after today, counted on the calendar at noon UTC, so a clock change overnight moves no day.
  const day = new Date(Date.parse(`${now.slice(0, 10)}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  const tomorrow = `${day}T${String(PLAYBOOK_HOURS.min).padStart(2, "0")}:00`;
  // Picking a day is the owner's choice, held here, so a day and time picked that happens to be Later today's stays on
  // its own row, its pickers in place.
  const [byDay, setByDay] = useState(p.at !== null && p.at !== later);
  const picked = p.at !== null && (byDay || p.at !== later);
  // The pickers read and write the business's clock (pageClock), as the day and time words say it.
  const pickedMs = picked && p.at ? pageClock().fromInput(p.at) : null;
  const pick = (at: string | null, day: boolean) => {
    setByDay(day);
    p.onAt(at);
  };
  return (
    <PickSheet
      open={p.open}
      title={W.sheets.when}
      sub={W.sheets.whenNow(M.atWords(now, "long"))}
      onClose={p.onClose}
      testid="sq-nw-when"
    >
      <div className="sq-nw-rows">
        <Choice
          glyph="send"
          name={upFirst(W.draft.now)}
          said={goes.moved ? W.sheets.nowOpens(goes.time) : W.sheets.nowSaid}
          on={p.at === null}
          onPick={() => pick(null, false)}
          testid="sq-nw-when-now"
        />
        {later ? (
          <Choice
            glyph="clock"
            name={W.sheets.laterToday}
            said={W.sheets.laterTodayAt(clockHour(Number(later.slice(11, 13))))}
            on={p.at === later && !picked}
            onPick={() => pick(later, false)}
            testid="sq-nw-when-later"
          />
        ) : null}
        <Choice
          glyph="calendar"
          name={W.sheets.pickADay}
          said={W.sheets.pickADaySaid}
          on={picked}
          onPick={() => pick(picked ? p.at : tomorrow, true)}
          testid="sq-nw-when-day"
        />
      </div>
      {pickedMs !== null ? (
        <p className="sq-nw-when-daytime" data-testid="sq-nw-when-daytime">
          <WhenDayTime
            at={pickedMs}
            maxDays={NEW_ONCE_AHEAD_DAYS}
            onChange={(ms) => pick(pageClock().inputValue(ms), true)}
          />
        </p>
      ) : null}
      <p className="sq-nw-note">{W.sheets.whenNote}</p>
    </PickSheet>
  );
}

/** The hour every step sends, by the business's clock. */
export function HourSelect({ hour, onHour }: { hour: number; onHour: (h: number) => void }) {
  const hours = Array.from({ length: PLAYBOOK_HOURS.max - PLAYBOOK_HOURS.min + 1 }, (_, i) => PLAYBOOK_HOURS.min + i);
  return (
    <Field
      label={W.sheets.hour}
      control={
        <Select
          value={String(hour)}
          onValueChange={(v) => onHour(Number(v))}
          chevron={<Icon name="chevron-down" size={12} />}
          options={hours.map((h) => ({ value: String(h), label: clockHour(h) }))}
          data-testid="sq-nw-hour"
        />
      }
    />
  );
}

/** The channels a one-off goes by: each person once, the first they can hear it on; a text never carries an offer. */
export function ChannelsSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  ready: readonly ConsentChannel[];
  onChannels: (c: ConsentChannel[]) => void;
  onClose: () => void;
}) {
  const offer = p.draft.steps[0]?.message?.offer ?? false;
  const holds = p.draft.steps[0]?.message?.channels ?? [];
  const rows: { c: ConsentChannel; name: string }[] = [
    { c: "whatsapp", name: W.channels.whatsapp },
    { c: "email", name: W.channels.email },
    { c: "sms", name: W.channels.sms },
  ];
  // Who each channel picked reaches, as the draft was counted: the first its count, each after it who has no way before.
  const by = p.draft.reach?.by ?? null;
  const first = rows.find(({ c }) => p.draft.channels.includes(c) && (by?.[c] ?? 0) > 0);
  const countOf = (c: ConsentChannel): string | null => {
    const n = by?.[c] ?? 0;
    if (!first || !p.draft.channels.includes(c) || n === 0) return null;
    return c === first.c ? W.channels.canHear(n) : W.channels.more(n, first.name);
  };
  return (
    <PickSheet
      open={p.open}
      title={W.sheets.channels}
      sub={W.sheets.channelsSub}
      onClose={p.onClose}
      testid="sq-nw-channels"
    >
      <div className="sq-nw-rows">
        {rows.map(({ c, name }) => {
          const never = c === "sms" && offer;
          const can = !never && holds.includes(c) && p.ready.includes(c);
          const on = can && p.draft.channels.includes(c);
          return (
            <div key={c} className="sq-nw-switchrow" data-off={can ? undefined : "true"}>
              <span>
                {name}
                <small>
                  {never ? (
                    W.channels.noOffer
                  ) : !holds.includes(c) ? (
                    W.channels.noVersion
                  ) : !p.ready.includes(c) ? (
                    // Not connected: the door that connects it, where every "can't send on" door lands.
                    <>
                      {W.channels.notReady} ·{" "}
                      <LinkButton size="inherit" {...routeDoor(CHANNELS_DOOR)} data-testid={`sq-nw-connect-${c}`}>
                        {W.reach.connect(c)}
                      </LinkButton>
                    </>
                  ) : (
                    (countOf(c) ?? W.channels.can)
                  )}
                </small>
              </span>
              <Switch
                checked={on}
                readOnly={!can}
                onCheckedChange={(next) =>
                  p.onChannels(next ? [...p.draft.channels, c] : p.draft.channels.filter((x) => x !== c))
                }
                label={name}
              />
            </div>
          );
        })}
      </div>
      <p className="sq-nw-note">{W.channels.leads}</p>
    </PickSheet>
  );
}

/** When a step goes: its wait after the one before, what must still hold, and the hour every step sends. */
export function TimingSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  i: number;
  onWait: (days: number) => void;
  onOnly: (only: readonly string[]) => void;
  onHour: (h: number) => void;
  onClose: () => void;
}) {
  const step = p.draft.steps[p.i];
  const days = step?.after_days ?? 1;
  const bounds = NEW_WAIT_DAYS[p.draft.audience];
  const offered = newConditionsOf(p.draft.audience);
  return (
    <PickSheet
      open={p.open}
      title={W.sheets.whenStep(p.i + 1)}
      sub={W.sheets.whenStepSub}
      onClose={p.onClose}
      testid="sq-nw-timing"
      foot={
        <Button variant="primary" onClick={p.onClose} data-testid="sq-nw-timing-done">
          {W.sheets.done}
        </Button>
      }
    >
      <div className="sq-nw-stepper">
        <Button
          iconOnly
          aria-label={W.sheets.sooner}
          disabled={days <= bounds.min}
          onClick={() => p.onWait(days - 1)}
          data-testid="sq-nw-sooner"
        >
          <Icon name="minus" size={14} />
        </Button>
        <span className="sq-nw-days">
          <b>{days}</b>
          <small>{W.sheets.daysAfter(p.i)}</small>
        </span>
        <Button
          iconOnly
          aria-label={W.sheets.later}
          disabled={days >= bounds.max}
          onClick={() => p.onWait(days + 1)}
          data-testid="sq-nw-later"
        >
          <Icon name="plus" size={14} />
        </Button>
      </div>
      {offered.length ? (
        <>
          <p className="sq-nw-cap">{W.sheets.onlyIf}</p>
          <div className="sq-nw-rows">
            {FOLLOW_UP_CONDITIONS.filter((c) => offered.includes(c)).map((c) => (
              <div key={c} className="sq-nw-switchrow">
                <span>{SEQUENCE_EDIT_WORDS.holds[c]}</span>
                <Switch
                  checked={!!step?.only_if.includes(c)}
                  onCheckedChange={(on) =>
                    p.onOnly(on ? [...(step?.only_if ?? []), c] : (step?.only_if ?? []).filter((x) => x !== c))
                  }
                  label={SEQUENCE_EDIT_WORDS.holds[c]}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {p.draft.audience === "people" ? <HourSelect hour={p.draft.run_hour} onHour={p.onHour} /> : null}
      <p className="sq-nw-note">{p.draft.audience === "leads" ? W.sheets.leadsTiming : W.sheets.peopleTiming}</p>
    </PickSheet>
  );
}

/** Your OK: how each batch after the first is decided; a sequence to leads never sends on its own. */
export function OkSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  onMode: (m: SequenceMode) => void;
  onClose: () => void;
}) {
  const modes = sequenceModesFor(p.draft.audience === "leads" ? "leads" : null);
  return (
    <PickSheet open={p.open} title={W.draft.yourOk} sub={W.sheets.okSub} onClose={p.onClose} testid="sq-nw-ok">
      <div className="sq-nw-rows">
        {(["ask", "veto", "auto"] as const)
          .filter((m) => modes.includes(m))
          .map((m) => (
            <Choice
              key={m}
              glyph={m === "ask" ? "check" : m === "veto" ? "clock" : "send"}
              name={W.ok[m]}
              said={SEQUENCE_MODE_WORDS[m].does}
              on={p.draft.mode === m}
              onPick={() => p.onMode(m)}
              testid={`sq-nw-ok-${m}`}
            />
          ))}
      </div>
      <p className="sq-nw-note">{W.sheets.okNote}</p>
    </PickSheet>
  );
}

/** Where a sequence to leads sends from: the workspace's mailbox, or the owner, each by hand. */
export function FromSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  onOwnerSends: (on: boolean) => void;
  onClose: () => void;
}) {
  const box = p.draft.mailbox;
  return (
    <PickSheet open={p.open} title={W.sheets.from} sub={W.sheets.fromSub} onClose={p.onClose} testid="sq-nw-from">
      <div className="sq-nw-rows">
        {box?.label ? (
          <Choice
            glyph="mail"
            name={W.sheets.yourMailbox}
            said={box.label}
            on={!box.owner_sends}
            onPick={() => p.onOwnerSends(false)}
            testid="sq-nw-from-box"
          />
        ) : (
          <Choice
            glyph="mail"
            name={W.sheets.noMailbox}
            said={W.sheets.connectSaid}
            door={{ label: W.sheets.connect, to: "settings" }}
            testid="sq-nw-from-connect"
          />
        )}
        <Choice
          glyph="check"
          name={W.sheets.youSend}
          said={W.sheets.youSendSaid}
          on={!box?.label || !!box.owner_sends}
          onPick={() => p.onOwnerSends(true)}
          testid="sq-nw-from-you"
        />
      </div>
      <p className="sq-nw-note">{W.checks.pace(12)}</p>
    </PickSheet>
  );
}
