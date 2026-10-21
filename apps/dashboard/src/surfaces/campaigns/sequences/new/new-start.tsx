/**
 * New, before a draft (decision 0065; the New canvas's row A, D3, D5 and E5): one line to say what it should do, and Draft
 * it; or a start from what is happening in the workspace, each a line Ask drafts from with its choices already made (who
 * it is for, the kind). A workspace with nothing set up is offered the one thing each start needs. While Ask drafts, the
 * line is kept with its Stop; when Ask could not draft it, or nothing here fits, the line stays and Build it yourself is
 * offered. A viewer sees what is happening and what runs, and is told who can make one. Hookless.
 */
import {
  NEW_WORDS as W,
  NEW_WORDS_MAX,
  leadsRoute,
  newSequenceLine,
  type AppointmentWord,
  type NewDraftAsk,
  type NewKind,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { gate } from "../../../legacy-verbs";
import { CmPane } from "../../parts/split";
import { CaseNote, SaidLine } from "./new-parts";
import { Choice, runningOn, type WhoReads } from "./new-sheets";

/** What the opening view reads: who it could be for (the who sheet's), the calendar, and the Library's count. */
export interface StartReads extends WhoReads {
  calendarOn: boolean;
  word: AppointmentWord;
  /** How many messages the Library holds; null where it was not read. */
  messages: number | null;
}

/** A start from what is happening: its line and the choices it makes, drafted as it is pressed. */
interface Start {
  id: string;
  glyph: string;
  title: string;
  said: string;
  kind: NewKind;
  line: string;
  fixed: Omit<NewDraftAsk, "words">;
}

/** A moment a new sequence may start on with someone to hear it now, and nothing on it already. */
function freeMoment(reads: StartReads, ids: readonly string[]) {
  const m = reads.moments.find((t) => ids.includes(t.id) && t.offered);
  if (!m || !m.candidates) return null;
  const twin = runningOn(reads.running, (r) => r.starts === "moment" && r.first?.trigger === m.id);
  return twin ? null : m;
}

/** The starts the workspace offers now, in the canvas's order: each with someone to reach, none doubling one that runs. */
function startsOf(reads: StartReads): Start[] {
  const out: Start[] = [];
  const moment = (ids: readonly string[], title: (n: number) => string, said: (n: number, hint: string) => string) => {
    const m = freeMoment(reads, ids);
    if (!m || !m.candidates) return;
    out.push({
      id: m.id,
      glyph: "clock",
      title: title(m.candidates),
      said: said(m.candidates, m.hint),
      kind: "sequence",
      line: newSequenceLine(m.id, reads.word) ?? m.label,
      fixed: { kind: "sequence", audience: "people", who: { kind: "moment", trigger: m.id, label: m.label } },
    });
  };
  moment(
    ["visited"],
    () => W.starts.thank,
    (n) => W.starts.thankSaid(n),
  );
  moment(["lapsed", "quiet_30"], W.starts.winBack, (_n, hint) => hint);
  if (reads.everyone)
    out.push({
      id: "everyone",
      glyph: "send",
      title: W.starts.offer,
      said: W.starts.offerSaid(reads.everyone),
      kind: "once",
      line: newSequenceLine("everyone_monthly", reads.word) ?? W.starts.offer,
      fixed: { kind: "once", audience: "people", who: { kind: "everyone", label: W.draft.everyoneOffers } },
    });
  const source = (reads.sources ?? []).find(
    (s) => s.ready > 0 && !runningOn(reads.running, (r) => r.starts === "leads" && r.first?.source_search_id === s.id),
  );
  if (source)
    out.push({
      id: `search-${source.id}`,
      glyph: "search",
      title: W.starts.leads(source.ready),
      said: source.name,
      kind: "sequence",
      line: W.starts.leadsLine(source.name),
      fixed: { kind: "sequence", audience: "leads", who: { kind: "search", id: source.id, label: source.name } },
    });
  moment(["new_week"], W.starts.welcome, (_n, hint) => hint);
  return out;
}

/** What a bare workspace needs before each start: the calendar, someone who said yes, a search with leads. */
function setupOf(
  reads: StartReads,
): { id: string; title: string; said: string; door: { label: string; to: string } }[] {
  const out = [];
  if (!reads.calendarOn)
    out.push(
      {
        id: "calendar",
        title: W.starts.remind,
        said: W.starts.needsCalendar,
        door: { label: W.starts.connect, to: "settings" },
      },
      {
        id: "thank",
        title: W.starts.thankToo,
        said: W.starts.needsCalendarToo,
        door: { label: W.starts.connect, to: "settings" },
      },
    );
  if (reads.everyone === 0)
    out.push({
      id: "everyone",
      title: W.starts.toEveryone,
      said: W.starts.noOneYet,
      door: { label: W.starts.import, to: "people" },
    });
  if (reads.sources && reads.sources.length === 0)
    out.push({
      id: "leads",
      title: W.starts.nearYou,
      said: W.starts.findFirst,
      door: { label: W.starts.find, to: leadsRoute({ list: "all" }) },
    });
  return out;
}

/** The starts, or the one thing each needs, then what runs already. */
function Starts(p: { reads: StartReads; may: boolean; onStart: (s: Start) => void; onSeeRunning: () => void }) {
  const starts = startsOf(p.reads);
  const setup = starts.length ? [] : setupOf(p.reads);
  const running = p.reads.running.filter((r) => r.state === "on");
  return (
    <>
      {starts.length ? (
        <>
          <p className="sq-nw-cap">{p.may ? W.starts.cap : W.starts.happening}</p>
          <div className="sq-nw-rows" data-testid="sq-nw-starts">
            {starts.map((s) => (
              <Choice
                key={s.id}
                glyph={s.glyph}
                name={s.title}
                said={s.said}
                tag={p.may ? W.starts.kind[s.kind] : null}
                onPick={p.may ? () => p.onStart(s) : null}
                testid={`sq-nw-start-${s.id}`}
              />
            ))}
          </div>
        </>
      ) : null}
      {setup.length ? (
        <>
          <p className="sq-nw-cap">{W.starts.setup}</p>
          <div className="sq-nw-rows" data-testid="sq-nw-setup">
            {setup.map((s) => (
              <Choice
                key={s.id}
                glyph="plus"
                name={s.title}
                said={s.said}
                door={s.door}
                testid={`sq-nw-setup-${s.id}`}
              />
            ))}
          </div>
        </>
      ) : null}
      {running.length ? (
        <p className="sq-nw-note" data-testid="sq-nw-running">
          {W.starts.running}{" "}
          {running
            .slice(0, 2)
            .map((r) => r.name)
            .join(", ")}
          {running.length > 2 ? ` ${W.starts.andMore(running.length - 2)}` : ""}.{" "}
          <LinkButton size="inherit" onClick={p.onSeeRunning} data-testid="sq-nw-see-running">
            {W.starts.see}
          </LinkButton>
        </p>
      ) : null}
      {p.reads.messages === 0 ? <p className="sq-nw-note">{W.starts.noMessages}</p> : null}
    </>
  );
}

/** Ask at work: the line kept with its Stop, and the draft's shape held while it writes. */
function Drafting({ line, onStop }: { line: string; onStop: () => void }) {
  return (
    <div className="sq-nw" aria-busy="true" data-testid="sq-nw-drafting">
      <SaidLine said={line} doing={W.say.drafting} onAgain={onStop} again={W.say.stop} />
      <p className="sq-nw-cap">{W.draft.who}</p>
      <div className="sq-nw-skel is-big" />
      <p className="sq-nw-cap">{W.draft.theMessage}</p>
      <div className="sq-nw-skel" />
      <p className="sq-nw-note">{W.say.reading}</p>
    </div>
  );
}

interface StartProps {
  line: string;
  onLine: (words: string) => void;
  onDraft: (words: string, fixed?: Omit<NewDraftAsk, "words">) => void;
  drafting: boolean;
  onStop: () => void;
  /** Ask could not draft it just now. */
  failed: boolean;
  /** What Ask said nothing here can do, in a sentence (its refusal), where it said one. */
  refused: string | null;
  onByHand: () => void;
  reads: StartReads | null;
  may: boolean;
  onClose: () => void;
}

/** New before a draft, in New's pane. */
export function StartView(p: StartProps) {
  const enough = p.line.trim().length >= 8;
  const draftIt = () => {
    if (enough) p.onDraft(p.line.trim());
  };
  return (
    <CmPane title={W.title} onClose={p.onClose} testid="sq-new">
      {p.drafting ? (
        <Drafting line={p.line} onStop={p.onStop} />
      ) : (
        <div className="sq-nw">
          {p.may ? (
            <div className="sq-nw-say">
              <Field
                aria-label={W.say.label}
                rows={3}
                value={p.line}
                onValueChange={p.onLine}
                placeholder={W.say.placeholder}
                maxLength={NEW_WORDS_MAX}
                data-testid="sq-nw-line"
              />
              <span className="sq-nw-say-acts">
                <small>
                  <Icon name="sparkle" size={12} /> {p.reads?.messages === 0 ? W.say.writes : W.say.hint}
                </small>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={draftIt}
                  disabled={!enough}
                  data-testid="sq-nw-draft"
                  {...gate("approve")}
                >
                  {W.say.draft}
                </Button>
              </span>
            </div>
          ) : (
            <CaseNote tone="plain" title={W.viewer.title} words={W.viewer.words} testid="sq-nw-viewer" />
          )}
          {p.failed ? (
            <CaseNote
              tone="bad"
              title={W.failed.title}
              words={W.failed.words}
              acts={
                <>
                  <Button size="sm" onClick={draftIt} data-testid="sq-nw-retry">
                    {W.failed.again}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={p.onByHand} data-testid="sq-nw-by-hand">
                    {W.failed.byHand}
                  </Button>
                </>
              }
              testid="sq-nw-failed"
            />
          ) : p.refused ? (
            <CaseNote
              tone="warn"
              title={p.refused}
              acts={
                <Button size="sm" variant="quiet" onClick={p.onByHand} data-testid="sq-nw-by-hand">
                  {W.failed.byHand}
                </Button>
              }
              testid="sq-nw-refused"
            />
          ) : null}
          {p.reads ? (
            <Starts
              reads={p.reads}
              may={p.may}
              onStart={(s) => {
                p.onLine(s.line);
                p.onDraft(s.line, s.fixed);
              }}
              onSeeRunning={p.onClose}
            />
          ) : null}
        </div>
      )}
    </CmPane>
  );
}
