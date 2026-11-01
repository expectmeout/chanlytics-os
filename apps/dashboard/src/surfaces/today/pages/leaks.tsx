/**
 * Worth a look: the few things no row above says on its own (moved from pages/dashboard-a-week.jsx, decision 0015, step 4).
 * Each reads a surface the page already holds (Reports, People) and the words are contracts/today.ts todayLeaks through
 * TODAY_HELPERS. Nothing is computed on the page; every number here is the same number on the page it links to. On a desk
 * it is the pane under the work beside the pinned lists, the week in one line at its foot (WeekLine), which the day's card
 * held until the redesign of 1 Nov 2026; on a phone it is lines under the day's figures (LeakLines, Today so far).
 */
import { TODAY_PHONE_WORDS, type PeopleListsLike, type TodayLeakVM } from "@chanlytics/contracts";
import { useState } from "react";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { surfaceValue } from "../../surface-values";
import { usePartShown, useSurface, useSurfaceFailed } from "../../use-surface";
import { routeDoor } from "../../legacy-verbs";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, doorGlyph, askAbout, borrowed, surfaceFailed, useMoved } from "../shell";

/** The row's own second door, where it has one: called, not drawn, so the tree has no part of its own for it. */
function leakAlso(also: TodayLeakVM["also"]) {
  return (
    also && (
      <button type="button" className="tl-act" onClick={() => appNavigate(also.to)}>
        {also.label}
      </button>
    )
  );
}

// Worth a look: two pages read together.
//
// "18 wrote or called" lives on Reports and "17 asked, never booked" lives on People, and neither page can say they
// are the same eighteen people. This band is the only place on Today that puts two numbers beside each other, and
// it prints the arithmetic under every sentence so nobody has to take it on faith. Each row wears its tone once, as the
// one pill with a word in it (never colour alone), names who is waiting where the page holds them, and offers Ask its own facts:
// "Ask why" asks the row's sentence, so Ask grounds the answer in what it can read. It is gone entirely on a
// workspace with nothing wrong: there is no congratulation state. A third problem is a line, never silence.
//
// On a phone the arithmetic is a receipt, not a decision, so it waits behind the sentence: the sentence is a button
// that shows it, the way the day's figures show theirs, and "Ask why" carries it anyway. The words stay in the DOM
// (hidden), so Ask, the tests and a phone run read the same line. Width is read as the Calendar reads it (crPhone).
const PHONE_QUERY = "(max-width: 720px)";
const twPhone = () => !!(window.matchMedia && window.matchMedia(PHONE_QUERY).matches);

/**
 * Worth a look's read: its rows and the line for the rest, or the read that failed by its page and its surface; null while
 * the two are unread. The desk's pane draws it (TodayLeaks), and a phone's day numbers draw it as lines (LeakLines).
 */
function useLeaks(): { rows: TodayLeakVM[]; moreLine: string | null; broke: [string, string] | null } | null {
  // The replies to a reach-out too: a thread whose reply was read is no unanswered person (contracts withoutWrongPerson).
  useMoved(["people", "today", "reach_out_replies"]);
  // Reports' period in one small read (the headline), through the seam, and whether its read failed, by the seam's own hook (the
  // shell's `surfaceFailed` knows only the routes' surfaces: it is false for ever for the headline).
  const R = useSurface("reports_headline");
  const headlineFailed = useSurfaceFailed("reports_headline");
  const P = borrowed<PeopleListsLike>("__PEOPLE");
  const T = surfaceValue("today");
  const broke: [string, string] | null =
    !R && headlineFailed
      ? ["Reports", "reports_headline"]
      : !P && surfaceFailed("people")
        ? ["People", "people"]
        : null;
  // Drawn once the period and People are in, or one of them failed: Today's last part, People being its heaviest read.
  usePartShown("today", "look", !!broke || (!!R && !!P));
  if (broke) return { rows: [], moreLine: null, broke };
  if (!R || !P) return null;
  return { ...TODAY_HELPERS.leaks(R, P, TODAY_HELPERS.withoutWrongPerson(T ? T.noReply : [])), broke: null };
}

/** What the failed read says where Worth a look would be. Called, not drawn. */
const leaksFailed = (broke: [string, string]) => (
  <FailedRead
    kind="line"
    className="tl-failed"
    what={broke[0]}
    body="The queue and the day's card are current."
    surface={broke[1]}
    testid="today-leaks-failed"
  />
);

/**
 * Worth a look on a phone (decision 0076): under the day's numbers, as what they mean, a line each: its tone's one pill,
 * its sentence, Ask why and its own door. Ask why carries the arithmetic the desk prints under it.
 */
export function LeakLines() {
  const leaks = useLeaks();
  if (!leaks || (!leaks.broke && !leaks.rows.length)) return null;
  return (
    <div className="tc-worth" data-testid="today-worth">
      <span className="tc-worth-head">{TODAY_PHONE_WORDS.worth}</span>
      {leaks.broke
        ? leaksFailed(leaks.broke)
        : leaks.rows.map((l) => (
            <div key={l.id} className="tc-worth-row" data-testid={`today-leak-${l.id}`}>
              <StatePill kind="tone" value={l.tone} label={l.tag} className="tl-tag" />
              <span className="tc-worth-text">{l.text}</span>
              <span className="tc-worth-acts">
                <Button variant="quiet" size="sm" onClick={() => askAbout({ prompt: l.ask })}>
                  {TODAY_PHONE_WORDS.askWhy}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => appNavigate(l.cta.to)}>
                  {l.cta.label} <Icon name={doorGlyph()} size={11} />
                </Button>
              </span>
            </div>
          ))}
    </div>
  );
}

/**
 * The week in one line, with the one door to Reports (contracts todayPeriodLine over Reports' headline): Worth a look's foot
 * on a desk, and Today so far's on a phone (card.tsx), since the day's card that held it on a desk went (the redesign of 1
 * Nov 2026). Not read yet is not failed: it is silent while Reports loads, and says so where its read failed.
 */
export function WeekLine() {
  const R = useSurface("reports_headline");
  const failed = useSurfaceFailed("reports_headline");
  const period = R ? TODAY_HELPERS.periodLine(R) : null;
  if (period)
    return (
      <a className="tl-week" {...routeDoor(period.to)} data-testid="today-period">
        <span className="tl-week-words">{period.text}</span>
        <Icon name="chevron" size={12} />
      </a>
    );
  return failed ? (
    <FailedRead
      kind="line"
      what="Reports"
      body="The day's own numbers are current."
      surface="reports_headline"
      testid="today-period-failed"
    />
  ) : null;
}

export const TodayLeaks = () => {
  const [open, setOpen] = useState<string | null>(null);
  const leaks = useLeaks();
  if (!leaks) return null;
  const { broke } = leaks;
  if (broke) {
    return (
      <section className="tsec tl" data-testid="today-leaks">
        <div className="tsec-head">
          <span className="tsec-title">Worth a look</span>
        </div>
        {leaksFailed(broke)}
      </section>
    );
  }
  const { rows, moreLine } = leaks;
  // Nothing worth a look: the pane is the week alone, with no name of its own and no congratulation (E3).
  if (!rows.length)
    return (
      <section className="tsec tl tl-week-only" data-testid="today-leaks">
        <WeekLine />
      </section>
    );
  const phone = twPhone();
  return (
    <section className="tsec tl" data-testid="today-leaks">
      <div className="tsec-head">
        <span className="tsec-title">Worth a look</span>
      </div>
      <div className="tl-list">
        {rows.map((l) => (
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            {/* The row's tone, once: the one pill, in the row's corner (dashboard-a-v2.css), so every sentence starts at
                one edge and the pills stand in one column. First in the markup, so a reader hears it before the sentence. */}
            <StatePill kind="tone" value={l.tone} label={l.tag} className="tl-tag" />
            {phone ? (
              <button
                type="button"
                className="tl-text tl-text-door"
                aria-expanded={open === l.id}
                aria-controls={`today-leak-math-${l.id}`}
                onClick={() => setOpen(open === l.id ? null : l.id)}
                data-testid={`today-leak-text-${l.id}`}
              >
                {l.text}
              </button>
            ) : (
              <span className="tl-text">{l.text}</span>
            )}
            {/* The foot: the arithmetic, who the row names, and its doors at the right, on one line where there is room. */}
            <div className="tl-foot">
              <span className="tl-math tabular" id={`today-leak-math-${l.id}`} hidden={phone && open !== l.id}>
                {l.math}
              </span>
              {/* Who the row names, and the lead that says who they are: on the unanswered row, who is waiting right now, from
                  the threads Today holds (not the count's own subjects: the count is Reports' over its period); on the
                  consultations row, the count's own people (0008). The words are contracts'. A person is a name, so each
                  is the one chip. */}
              {l.people.length > 0 && (
                <span className="tl-people">
                  {l.peopleLead && <span className="tl-people-lead">{l.peopleLead}</span>}
                  {l.people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="chip tl-person"
                      onClick={() => appNavigate(p.to)}
                      title={p.title}
                    >
                      {p.name}
                    </button>
                  ))}
                </span>
              )}
              {/* The doors are words: Ask why quiet, the row's own door in ink with its arrow. */}
              <span className="tl-acts">
                <button
                  type="button"
                  className="tl-act"
                  onClick={() => askAbout({ prompt: l.ask })}
                  data-testid={`today-leak-ask-${l.id}`}
                >
                  Ask why
                </button>
                {leakAlso(l.also)}
                <button type="button" className="tl-act tl-act-go" onClick={() => appNavigate(l.cta.to)}>
                  {l.cta.label} <Icon name={doorGlyph()} size={11} />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {moreLine && (
        <div className="tsec-note" data-testid="today-leaks-more">
          {moreLine}
        </div>
      )}
      <WeekLine />
    </section>
  );
};
