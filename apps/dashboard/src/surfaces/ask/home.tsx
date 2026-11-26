/**
 * The rows under the three (line/line.tsx; the Stage, spec 4.3, 5.2): at rest, Right now with Brief me, the follow-ups Ask
 * kept that came due, and three questions about the page as chips; while typing, the words as a question, the jumps and the
 * questions that match; Earlier (the head's, or ⌘J), every conversation. Pure of state: buildLineRows turns what the bridge
 * holds into rows, AskRows draws them as one listbox. No key symbol is drawn (the Line, D17).
 */
import { Fragment, useEffect, useState } from "react";
import {
  NOTICE_SAID_BY_RIGHT_NOW,
  type AskLanguage,
  type AskNotice,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type AskThreadVM,
} from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import type { FrameFlash } from "../frame-verbs";
import { Icon } from "../kit/icon/icon";
import { LinePress } from "../kit/line/line";
import type { useAskSpeech } from "./hooks";
import { byKeyLines, deleteKeyOf, secondAct } from "./second-act";
import type { LineWords } from "./words";

/** A row of the Line: what it says, and what taking it does (a route, words to ask or to finish, a thread to open). */
export interface LineRow {
  type: string;
  label: string;
  sub?: string;
  meta?: string;
  q?: string;
  to?: string;
  th?: AskThreadVM;
  compose?: boolean;
  following?: string;
  /** What Ask noticed, by its key: the row Not now rests a week. */
  rest?: string;
  people?: number;
  runs?: number;
  searches?: number;
}

/** The rows under one label. */
export interface LineSection {
  key: string;
  label?: string;
  items: LineRow[];
  note?: string | null;
}

/** What the rows are built from. */
interface LineRowsAsk {
  A: AskApi;
  t: LineWords;
  lang: AskLanguage;
  query: string;
  surface: AskSurface;
  scope: AskScope | null;
  threads: AskThreadVM[];
  view: string;
  /** The page's own questions (ownAsksOf), read once by the Line for the rows and for the home's title. */
  own: readonly AskSuggestion[];
  /** The home is the page's own questions as rows, under a title: a phone's opened from Today (Today, calm, D10). */
  titled: boolean;
}

const ahAgo = (ms: number) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

// Every row carries what activating it does: a route, words to ask, words to finish on the line, or a thread to open.
/**
 * The page's own questions, three at most: only where they were written for this workspace (Leads' ideas, the
 * person's own searches, what Today wrote from its lines). A question from a table is a preset, and AI needs none
 * (Ruben, 12 and 17 Nov 2026); those still match what is typed, and an answer's own next questions are AI's.
 */
export const ownAsksOf = ({
  A,
  t,
  lang,
  surface,
  scope,
}: Pick<LineRowsAsk, "A" | "t" | "lang" | "surface" | "scope">) =>
  A.suggestions(surface, scope, lang)
    .filter((s) => s.kind !== "act" && s.q !== t.needsQ && s.own)
    .slice(0, 3);

/**
 * While typing: the words as a question, the places to jump to and the questions that match. The words are a row only
 * beside somewhere to jump or a question that matches, where Enter has to say which it means; alone they only said the
 * field again, under it.
 */
function typedSections(
  typed: string,
  { A, t, lang, surface, scope }: Pick<LineRowsAsk, "A" | "t" | "lang" | "surface" | "scope">,
) {
  const sections: LineSection[] = [{ key: "ask", items: [{ type: "ask", label: typed, q: typed }] }];
  const jumps = A.jump(typed);
  if (jumps.length)
    sections.push({
      key: "jump",
      label: t.jump,
      items: jumps.map((j) => ({ type: "jump", label: j.label, sub: j.sub, meta: t.kind[j.kind] || "", to: j.to })),
    });
  const hits = A.suggestions(surface, scope, lang).filter(
    (s) => (s.label || s.q).toLowerCase().includes(typed.toLowerCase()) && s.q !== typed,
  );
  if (hits.length)
    sections.push({
      key: "match",
      items: hits.map((s) => ({
        type: s.kind === "act" ? "act" : "sug",
        label: s.label || s.q,
        q: s.q,
        compose: s.compose,
        meta: s.kind === "act" ? t.tagCard : undefined,
      })),
    });
  return sections.length > 1 ? sections : [];
}

/**
 * What AI said it would come back to, come due (bridge/ask/follow-ups.ts): its own line, and pressed, what it said it
 * would ask itself then, which clears it (the route's `following`).
 */
function followUpSections(ask: LineRowsAsk["A"], words: LineWords): LineSection[] {
  const due = ask.followUpsDue ? ask.followUpsDue() : [];
  if (!due.length) return [];
  return [
    {
      key: "follow",
      label: words.followUpsDue,
      items: due.map((f) => ({ type: "follow", label: f.said, q: f.prompt, following: f.id })),
    },
  ];
}

export const buildLineRows = ({
  A,
  t,
  lang,
  query,
  surface,
  scope,
  threads,
  view,
  own,
  titled,
}: LineRowsAsk): LineSection[] => {
  const q = query.trim();
  // A conversation is one 36px line: its question, and its time at the right (spec 4.3).
  const thread = (th: AskThreadVM): LineRow => ({ type: "thread", label: th.title, meta: ahAgo(th.lastAtMs), th });
  // Earlier: every conversation, or the ones whose question has the words typed.
  if (view === "earlier") {
    const list = q ? threads.filter((th) => th.title.toLowerCase().includes(q.toLowerCase())) : threads;
    return [{ key: "earlier", label: t.earlier, items: list.map(thread) }];
  }
  if (q) return typedSections(q, { A, t, lang, surface, scope });
  const followUps = followUpSections(A, t);
  // A phone's home opened from Today (Today, calm, D10): the questions Today wrote from its own lines, a row each, by
  // the field. The page under it has just said who needs you and what AI found, so neither is said again here.
  if (titled)
    return [
      ...followUps,
      {
        key: "about",
        label: t.aboutToday,
        items: own.map((s) => ({ type: "page", label: s.label || s.q, q: s.q })),
      },
    ];
  // At rest: Right now is the first row, and ↵ on the empty line asks who needs you (the quick answer). The counts its
  // sentence was built from are the hero's pills while a phone's field is in use (line/under.ts); Earlier is the head's (spec 5.2).
  const parts = A.rightNowParts
    ? A.rightNowParts(lang)
    : { sentence: A.rightNow(lang), people: 0, runs: 0, searches: 0 };
  const sections: LineSection[] = [
    {
      key: "now",
      items: [
        {
          type: "now",
          label: parts.sentence,
          q: t.needsQ,
          people: parts.people,
          runs: parts.runs,
          searches: parts.searches,
        },
      ],
    },
  ];
  // What Ask noticed (D7 of the answers canvas): one thing, with its plan a press away. Ask speaks first here, never a list,
  // and never what Right now's sentence just said (a search or a send waiting): the next thing worth saying instead.
  const said = (n: AskNotice) => {
    const by = NOTICE_SAID_BY_RIGHT_NOW[n.key];
    return !!by && parts[by] > 0;
  };
  const notice = A.noticed ? A.noticed(said) : null;
  if (notice)
    sections.push({
      key: "noticed",
      items: [
        {
          type: "follow",
          label: notice.says,
          q: notice.ask ?? notice.fill ?? "",
          ...(notice.fill && !notice.ask ? { compose: true } : {}),
          ...(notice.to ? { to: notice.to } : {}),
          rest: notice.key,
        },
      ],
    });
  sections.push(...followUps);
  // The page's own questions as chips. On Leads the consent rule stands under them (spec F3), one dim line; nowhere
  // else has a note.
  if (own.length)
    sections.push({
      key: "about",
      label: surface === "today" ? t.aboutToday : t.askAbout(surface),
      items: own.map((s) => ({ type: "sug", label: s.label || s.q, q: s.q })),
      note: surface === "leads" ? t.leadsConsent : null,
    });
  return sections;
};

// The flat list the keys walk, in the order the rows are drawn.
export const flatRows = (sections: LineSection[]) => sections.flatMap((sec) => sec.items);

// A question, an act and the door to every conversation are chips; the rest are rows.
const ahChip = (it: LineRow) => it.type === "sug" || it.type === "act";

// The standing pills: who needs you, the runs and the searches waiting. They are the hero's, under the three, so they
// stay while a phone's field is in use (the Stage's 5.9).
export const AskNowPills = ({
  people,
  runs,
  searches,
  t,
}: {
  people: number;
  runs: number;
  searches: number;
  t: LineWords;
}) => (
  <span className="ask-now-pills">
    {people ? (
      <span className="pill pill-warn" data-testid="ask-pill">
        {t.needYou(people)}
      </span>
    ) : null}
    {runs ? (
      <span className="pill pill-warn" data-testid="ask-pill">
        {t.runsWaiting(runs)}
      </span>
    ) : null}
    {searches ? (
      <span className="pill pill-warn" data-testid="ask-pill">
        {t.searchWaiting(searches)}
      </span>
    ) : null}
  </span>
);

// Right now is one option: its pills, its sentence and Brief me (a span dressed as the kit's button: one row, one door,
// Enter or a press anywhere on it asks; a second option would be the same question twice). A section's chips sit in a
// wrap under its rows, so Earlier is its rows, then the chip for the rest.
/**
 * What stands at a row's end: its meta, the arrow on a question of the page's (Today, calm, D10: a press asks it), and a
 * pointer's x, Not now on what AI noticed (a notice is its fact, its act and its x, docs/words.md) or a conversation's
 * delete. Called, not drawn.
 */
function rowEnd(
  it: LineRow,
  { t, onRest, onDelete }: { t: LineWords; onRest?: (key: string) => void; onDelete: (th: AskThreadVM) => void },
) {
  const rest = it.rest;
  const th = it.th;
  return (
    <>
      {it.meta ? <span className="ask-row-meta">{it.meta}</span> : null}
      {it.type === "page" ? <Icon name="arrow-up" size={14} className="ask-row-go" /> : null}
      {rest ? (
        <span
          {...secondAct(() => onRest?.(rest))}
          className="line-remove ask-row-rest"
          data-tip={t.notNow}
          data-testid="ask-row-rest"
        >
          <Icon name="x" size={10} />
        </span>
      ) : null}
      {it.type === "thread" ? (
        <span
          {...secondAct(() => th && onDelete(th))}
          className="line-remove ask-row-del"
          data-tip={t.deleteThread}
          data-testid="ask-row-del"
        >
          <Icon name="x" size={10} />
        </span>
      ) : null}
    </>
  );
}

export const AskRows = ({
  sections,
  sel,
  setSel,
  onActivate,
  onDelete,
  onRest,
  t,
  empty,
}: {
  sections: LineSection[];
  sel: number;
  setSel: (i: number) => void;
  onActivate: (it: LineRow) => void;
  onDelete: (th: AskThreadVM) => void;
  /** Not now, on what Ask noticed: it rests a week. */
  onRest?: (key: string) => void;
  t: LineWords;
  empty?: string | null;
}) => {
  const selIdx = sel;
  const flat = flatRows(sections);
  if (!flat.length) return <div className="ask-rows-empty">{empty || t.nothing}</div>;
  let at = 0;
  const draw = (it: LineRow) => {
    const i = at++;
    const sel = i === selIdx;
    const shared = {
      id: `ask-row-${i}`,
      role: "option",
      "aria-selected": sel,
      onMouseMove: () => setSel(i),
      onClick: () => onActivate(it),
      "data-testid": `ask-row-${it.type}`,
    };
    // With nothing needing anyone, the sentence alone (spec 4.3): no pill and no Brief me; the row still asks.
    if (it.type === "now") {
      const waiting = !!(it.people || it.runs || it.searches);
      return (
        <div key={i} {...shared} className={`ask-row now${waiting ? " waiting" : ""}${sel ? " sel" : ""}`}>
          <span className="ask-row-label">{it.label}</span>
          {/* The one look of a press in AI's middle: the chip's capsule, as an answer's next questions wear it (Ruben, 17
              Nov 2026: a button, a link and chips on one screen read as messy). */}
          {waiting ? (
            <span className="line-chip ask-now-brief" data-testid="ask-row-brief">
              {t.briefMe}
            </span>
          ) : null}
        </div>
      );
    }
    // One tab stop: the keys walk the list from the line (aria-activedescendant), so a chip is never reached by Tab.
    if (ahChip(it))
      return (
        <LinePress key={i} kind="chip" selected={sel} tabIndex={-1} {...shared}>
          <span>{it.label}</span>
          {it.meta ? <span className="line-chip-meta">{it.meta}</span> : null}
        </LinePress>
      );
    // A row is ONE option and holds no control of its own (second-act.tsx): Not now and a conversation's x are a
    // pointer's alone, and the keys say either with Delete on the row, which the option names and says in words.
    return (
      <div
        key={i}
        {...shared}
        className={`ask-row ${it.type}${it.rest ? " noticed" : ""}${sel ? " sel" : ""}`}
        {...deleteKeyOf(it)}
      >
        {it.type === "thread" ? <Icon name="chat" size={13} className="ask-row-glyph" /> : null}
        {it.type === "follow" && !it.rest ? <span className="subtab-dot" aria-hidden="true" /> : null}
        <span className="ask-row-main">
          <span className="ask-row-label">{it.label}</span>
          {it.sub ? <span className="ask-row-sub">{it.sub}</span> : null}
        </span>
        {rowEnd(it, { t, onRest, onDelete })}
      </div>
    );
  };
  // A section's items in runs, in the order the keys walk them: rows as they are, each run of chips in one wrap. A
  // section that holds rows (Earlier, the jumps) is a `list`: its label keeps their left edge, not the home's centre.
  const runs = (items: LineRow[]) =>
    items.reduce<Array<{ chip: boolean; items: LineRow[] }>>((out, it) => {
      const chip = ahChip(it);
      const last = out[out.length - 1];
      if (last && last.chip === chip) last.items.push(it);
      else out.push({ chip, items: [it] });
      return out;
    }, []);
  return (
    <div className="ask-rows" role="listbox" id="ask-rows" aria-label={t.rowsLabel}>
      {byKeyLines(flat, t)}
      {sections.map((sec) => (
        <div
          key={sec.key}
          className={`ask-rows-sec${sec.items.some((it) => it.type !== "now" && !ahChip(it)) ? " list" : ""}`}
          role="presentation"
        >
          {sec.label ? (
            <div className="ask-rows-label" role="presentation">
              {sec.label}
            </div>
          ) : null}
          {runs(sec.items).map((run, k) =>
            run.chip ? (
              <div key={`c${k}`} className="ask-chips" role="presentation">
                {run.items.map(draw)}
              </div>
            ) : (
              <Fragment key={`r${k}`}>{run.items.map(draw)}</Fragment>
            ),
          )}
          {sec.note ? (
            <p className="ask-rows-note" data-testid="ask-rows-note">
              {sec.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------- what stands around an answer */
// What Ask has read, under the three while it reads (D12): the turn's last reads (the Line keeps three, live.traces),
// a read again said once where it was last, the earlier dim after a small square, the newest live after the reading
// dot; "Thinking…" before the first. From the fourth second the newest line says how long the turn has run (`since`,
// when it was asked), so a long think reads as work going on, not as a stall (Ruben's recording, 16 Oct 2026: 12 and 16
// seconds of "Thinking…" alone).
const ASK_ELAPSED_FROM_S = 4;
const ASK_ELAPSED_TICK_MS = 1000;
const useAskElapsed = (since: number | null) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const tick = setInterval(() => setNow(Date.now()), ASK_ELAPSED_TICK_MS);
    return () => clearInterval(tick);
  }, [since, setNow]);
  const s = since ? Math.floor((now - since) / 1000) : 0;
  return s >= ASK_ELAPSED_FROM_S ? `${s}s` : "";
};
export const AskReads = ({ traces, since = null, t }: { traces: string[]; since?: number | null; t: LineWords }) => {
  const reads = traces.filter((r, k) => traces.lastIndexOf(r) === k);
  const shown = reads.length ? reads : [t.thinking];
  const elapsed = useAskElapsed(since);
  return (
    <div className="ask-reading" aria-live="polite" data-testid="ask-reading">
      {shown.map((r, k) => {
        const now = k === shown.length - 1;
        return (
          <p key={r} className={`ask-read ${now ? "now" : "done"}`}>
            <span className={now ? "ask-reading-dot" : "ask-read-tile"} aria-hidden="true" />
            {r}
            {now && elapsed ? (
              <span className="ask-read-time" aria-hidden="true" data-testid="ask-read-time">
                {elapsed}
              </span>
            ) : null}
          </p>
        );
      })}
    </div>
  );
};

// An answer's two acts (D14): Copy its words and Read them aloud. A desktop draws them at the field's end beside Clear;
// a phone under the newest answer, never under an earlier one and never while one is written. `words` are the
// answer's say, its headline then its detail, then its list a line an entry with its marks (contracts answerText): what
// Copy takes. `spoken` are the same written for the ear, the list an entry a sentence (contracts answerSpoken): what
// Read aloud speaks in Ask's one voice (the one-way speech, bridge/ask/speech.ts through hooks.ts useAskSpeech); the
// figures and rows are
// drawn, never read. Nobody speaks back: a follow-up is typed, or said with the mic held. Between the press and the first word
// the button says it is getting the voice, and a press then stops the wait; where the clip could not be made the
// button says why, in the server's words.
export const AskActs = ({
  words,
  spoken,
  speech,
  flash,
  t,
  copy: offerCopy = true,
}: {
  words: string;
  spoken: string;
  speech: ReturnType<typeof useAskSpeech>;
  flash: (flash: FrameFlash) => void;
  t: LineWords;
  /** Copy, which goes under an answer with cards: what there is to copy is on the card (D14 of the answers canvas). */
  copy?: boolean;
}) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      flash({ msg: <>{t.copied}</> });
    } catch {
      flash({ tone: "danger", msg: <>{t.copyFailed}</> });
    }
  };
  const reading = speech.speakingId === "line";
  const loading = speech.loading === "line";
  const read = () => {
    void speech.toggle(spoken || words, "answer").then((why) => {
      if (why !== null) flash({ tone: "danger", msg: <>{why || t.readFailed}</> });
    });
  };
  const word = reading ? t.stop : loading ? t.reading : t.read;
  // Each says its word beside its glyph on a desk, where two bare glyphs were missed (ask.css `.ask-act-word`).
  return (
    <span className="ask-acts" data-testid="ask-acts">
      {offerCopy ? (
        <LinePress
          kind="act"
          className="ask-act"
          onClick={copy}
          aria-label={t.copy}
          data-tip={t.copy}
          data-testid="ask-copy"
        >
          <Icon name="copy" size={14} />
          <span className="ask-act-word" aria-hidden="true">
            {t.copyWord}
          </span>
        </LinePress>
      ) : null}
      {speech.canSpeak ? (
        <LinePress
          kind="act"
          on={reading || loading}
          className="ask-act"
          onClick={read}
          aria-label={word}
          aria-pressed={reading}
          aria-busy={loading || undefined}
          data-tip={word}
          data-testid="ask-read"
        >
          <Icon name={reading ? "pause" : "headphones"} size={14} />
          <span className="ask-act-word" aria-hidden="true">
            {word}
          </span>
        </LinePress>
      ) : null}
    </span>
  );
};
