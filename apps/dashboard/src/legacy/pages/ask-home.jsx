/* global React, Icon */
// The rows under the three (ask-real.jsx; the Stage, spec 4.3, 5.2): at rest, Right now with Brief me and three
// questions about the page as chips; while typing, the words as a question, the jumps and the questions that match;
// Earlier (the head's, or ⌘J), every conversation. Pure of state: buildLineRows turns what the bridge
// holds into rows, AskRows draws them as one listbox. No key symbol is drawn (the Line, D17). Published as window.AskHome.

const ahAgo = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

// Every row carries what activating it does: a route, words to ask, words to finish on the line, or a thread to open.
const buildLineRows = ({ A, t, lang, query, surface, scope, threads, view }) => {
  const q = query.trim();
  // A conversation is one 36px line: its question, and its time at the right (spec 4.3).
  const thread = (th) => ({ type: "thread", label: th.title, meta: ahAgo(th.lastAtMs), th });
  // Earlier: every conversation, or the ones whose question has the words typed.
  if (view === "earlier") {
    const list = q ? threads.filter((th) => th.title.toLowerCase().includes(q.toLowerCase())) : threads;
    return [{ key: "earlier", label: t.earlier, items: list.map(thread) }];
  }
  if (q) {
    const sections = [{ key: "ask", items: [{ type: "ask", label: q, q }] }];
    const jumps = A.jump(q);
    if (jumps.length)
      sections.push({ key: "jump", label: t.jump, items: jumps.map((j) => ({ type: "jump", label: j.label, sub: j.sub, meta: t.kind[j.kind] || "", to: j.to })) });
    const hits = A.suggestions(surface, scope, lang).filter((s) => (s.label || s.q).toLowerCase().includes(q.toLowerCase()) && s.q !== q);
    if (hits.length)
      sections.push({
        key: "match",
        items: hits.map((s) => ({ type: s.kind === "act" ? "act" : "sug", label: s.label || s.q, q: s.q, compose: s.compose, meta: s.kind === "act" ? t.tagCard : undefined })),
      });
    // The words as a question are a row only beside somewhere to jump or a question that matches, where Enter has to say
    // which it means; alone they only said the field again, under it.
    return sections.length > 1 ? sections : [];
  }
  // At rest: Right now is the first row, and ↵ on the empty line asks who needs you (the quick answer). The counts its
  // sentence was built from are the hero's pills, under the three (ask-real.jsx); Earlier is the head's (spec 5.2).
  const parts = A.rightNowParts ? A.rightNowParts(lang) : { sentence: A.rightNow(lang), people: 0, runs: 0, searches: 0 };
  const sections = [
    {
      key: "now",
      items: [{ type: "now", label: parts.sentence, q: t.needsQ, people: parts.people, runs: parts.runs, searches: parts.searches }],
    },
  ];
  const asks = A.suggestions(surface, scope, lang).filter((s) => s.kind !== "act" && s.q !== t.needsQ).slice(0, 3);
  // On Leads the consent rule stands under the section's chips (spec F3), one dim line; nowhere else has a note.
  if (asks.length)
    sections.push({
      key: "about",
      label: t.askAbout(surface),
      items: asks.map((s) => ({ type: "sug", label: s.label || s.q, q: s.q })),
      note: surface === "leads" ? t.leadsConsent : null,
    });
  return sections;
};

// The flat list the keys walk, in the order the rows are drawn.
const flatRows = (sections) => sections.flatMap((sec) => sec.items);

// A question, an act and the door to every conversation are chips; the rest are rows.
const ahChip = (it) => it.type === "sug" || it.type === "act";

// The standing pills: who needs you, the runs and the searches waiting. They are the hero's, under the three, so they
// stay while a phone's field is in use (the Stage's 5.9).
const AskNowPills = ({ people, runs, searches, t }) => (
  <span className="ask-now-pills">
    {people ? <span className="pill pill-warn" data-testid="ask-pill">{t.needYou(people)}</span> : null}
    {runs ? <span className="pill pill-warn" data-testid="ask-pill">{t.runsWaiting(runs)}</span> : null}
    {searches ? <span className="pill pill-warn" data-testid="ask-pill">{t.searchWaiting(searches)}</span> : null}
  </span>
);

// Right now is one option: its pills, its sentence and Brief me (a span dressed as the kit's button: one row, one door,
// Enter or a press anywhere on it asks; a second option would be the same question twice). A section's chips sit in a
// wrap under its rows, so Earlier is its rows, then the chip for the rest.
const AskRows = ({ sections, sel, setSel, onActivate, onDelete, t, empty }) => {
  const selIdx = sel;
  const flat = flatRows(sections);
  if (!flat.length) return <div className="ask-rows-empty">{empty || t.nothing}</div>;
  let at = 0;
  const draw = (it) => {
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
          {waiting ? <span className="btn btn-sm ask-now-brief" data-testid="ask-row-brief">{t.briefMe}</span> : null}
        </div>
      );
    }
    // One tab stop: the keys walk the list from the line (aria-activedescendant), so a chip is never reached by Tab.
    if (ahChip(it))
      return (
        <button key={i} type="button" tabIndex={-1} {...shared} className={`ask-chip${sel ? " sel" : ""}`}>
          <span>{it.label}</span>
          {it.meta ? <span className="ask-chip-meta">{it.meta}</span> : null}
        </button>
      );
    return (
      <div key={i} {...shared} className={`ask-row ${it.type}${sel ? " sel" : ""}`}>
        {it.type === "thread" ? <Icon name="chat" size={13} className="ask-row-glyph" /> : null}
        <span className="ask-row-main">
          <span className="ask-row-label">{it.label}</span>
          {it.sub ? <span className="ask-row-sub">{it.sub}</span> : null}
        </span>
        {it.meta ? <span className="ask-row-meta">{it.meta}</span> : null}
        {it.type === "thread" ? (
          <button type="button" className="ask-row-del" tabIndex={-1} aria-label={t.deleteThread} title={t.deleteThread} onClick={(e) => { e.stopPropagation(); onDelete(it.th); }} data-testid="ask-row-del">
            <Icon name="x" size={10} />
          </button>
        ) : null}
      </div>
    );
  };
  // A section's items in runs, in the order the keys walk them: rows as they are, each run of chips in one wrap. A
  // section that holds rows (Earlier, the jumps) is a `list`: its label keeps their left edge, not the home's centre.
  const runs = (items) =>
    items.reduce((out, it) => {
      const chip = ahChip(it);
      const last = out[out.length - 1];
      if (last && last.chip === chip) last.items.push(it);
      else out.push({ chip, items: [it] });
      return out;
    }, []);
  return (
    <div className="ask-rows" role="listbox" id="ask-rows" aria-label={t.rowsLabel}>
      {sections.map((sec) => (
        <div key={sec.key} className={`ask-rows-sec${sec.items.some((it) => it.type !== "now" && !ahChip(it)) ? " list" : ""}`} role="presentation">
          {sec.label ? <div className="ask-rows-label" role="presentation">{sec.label}</div> : null}
          {runs(sec.items).map((run, k) =>
            run.chip ? (
              <div key={`c${k}`} className="ask-chips" role="presentation">
                {run.items.map(draw)}
              </div>
            ) : (
              <React.Fragment key={`r${k}`}>{run.items.map(draw)}</React.Fragment>
            ),
          )}
          {sec.note ? <p className="ask-rows-note" data-testid="ask-rows-note">{sec.note}</p> : null}
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------- what stands around an answer */

const useHomeState = React.useState;
const useHomeEffect = React.useEffect;

// What Ask has read, under the three while it reads (D12): the turn's last reads (the Line keeps three, live.traces),
// a read again said once where it was last, the earlier dim after a small square, the newest live after the reading
// dot; "Thinking…" before the first. From the fourth second the newest line says how long the turn has run (`since`,
// when it was asked), so a long think reads as work going on, not as a stall (Ruben's recording, 16 Oct 2026: 12 and 16
// seconds of "Thinking…" alone).
const ASK_ELAPSED_FROM_S = 4;
const ASK_ELAPSED_TICK_MS = 1000;
const useAskElapsed = (since) => {
  const [now, setNow] = useHomeState(() => Date.now());
  useHomeEffect(() => {
    if (!since) return undefined;
    const tick = setInterval(() => setNow(Date.now()), ASK_ELAPSED_TICK_MS);
    return () => clearInterval(tick);
  }, [since, setNow]);
  const s = since ? Math.floor((now - since) / 1000) : 0;
  return s >= ASK_ELAPSED_FROM_S ? `${s}s` : "";
};
const AskReads = ({ traces, since = null, t }) => {
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
            {now && elapsed ? <span className="ask-read-time" aria-hidden="true" data-testid="ask-read-time">{elapsed}</span> : null}
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
// Read aloud speaks in Ask's one voice (the one-way speech, legacy-bridge/ask/speech.ts through AskHooks.useAskSpeech;
// docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026); the figures and rows are
// drawn, never read. Nobody speaks back: a follow-up is typed, or said with the mic held. Between the press and the first word
// the button says it is getting the voice, and a press then stops the wait; where the clip could not be made the
// button says why, in the server's words.
const AskActs = ({ words, spoken, speech, flash, t }) => {
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
    speech.toggle(spoken || words, "answer").then((why) => {
      if (why !== null) flash({ tone: "danger", msg: <>{why || t.readFailed}</> });
    });
  };
  const word = reading ? t.stop : loading ? t.reading : t.read;
  // Each says its word beside its glyph on a desk, where two bare glyphs were missed (ask.css `.ask-act-word`).
  return (
    <span className="ask-acts" data-testid="ask-acts">
      <button type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="copy" size={14} />
        <span className="ask-act-word" aria-hidden="true">{t.copyWord}</span>
      </button>
      {speech.canSpeak ? (
        <button
          type="button"
          className={`ask-line-btn quiet${reading || loading ? " on" : ""}`}
          onClick={read}
          aria-label={word}
          aria-pressed={reading}
          aria-busy={loading || undefined}
          title={word}
          data-testid="ask-read"
        >
          <Icon name={reading ? "pause" : "headphones"} size={14} />
          <span className="ask-act-word" aria-hidden="true">{word}</span>
        </button>
      ) : null}
    </span>
  );
};

window.AskHome = { buildLineRows, AskRows, flatRows, AskNowPills, ahAgo, AskReads, AskActs };
