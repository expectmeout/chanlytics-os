/* global React, Icon */
// The rows under the Line (ask-real.jsx; the Stage, spec 4.3): at rest, Right now with its pills and Brief me, three
// questions about the page as chips and three earlier conversations; while typing, the words as a question, the jumps
// and the questions that match; Earlier (⌘J), every conversation. Pure of state: buildLineRows turns what the bridge
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
const buildLineRows = ({ A, t, lang, query, surface, scope, threads, view, phone = false }) => {
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
    return sections;
  }
  // At rest: Right now is the first row, with the counts its sentence was built from as pills, and ↵ on the empty line
  // asks who needs you (the quick answer). On a phone Earlier is the head's, not a section here (spec 5.2).
  const parts = A.rightNowParts ? A.rightNowParts(lang) : { sentence: A.rightNow(lang), people: 0, runs: 0 };
  const sections = [{ key: "now", items: [{ type: "now", label: parts.sentence, q: t.needsQ, people: parts.people, runs: parts.runs }] }];
  const asks = A.suggestions(surface, scope, lang).filter((s) => s.kind !== "act" && s.q !== t.needsQ).slice(0, 3);
  // On Leads the consent rule stands under the section's chips (spec F3), one dim line; nowhere else has a note.
  if (asks.length)
    sections.push({
      key: "about",
      label: t.askAbout(surface),
      items: asks.map((s) => ({ type: "sug", label: s.q, q: s.q })),
      note: surface === "leads" ? t.leadsConsent : null,
    });
  if (threads.length && !phone) {
    const items = threads.slice(0, 3).map(thread);
    if (threads.length > 3) items.push({ type: "all", label: t.allEarlier });
    sections.push({ key: "earlier", label: t.earlier, items });
  }
  return sections;
};

// The flat list the keys walk, in the order the rows are drawn.
const flatRows = (sections) => sections.flatMap((sec) => sec.items);

// A question, an act and the door to every conversation are chips; the rest are rows.
const ahChip = (it) => it.type === "sug" || it.type === "act" || it.type === "all";

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
      const waiting = !!(it.people || it.runs);
      return (
        <div key={i} {...shared} className={`ask-row now${sel ? " sel" : ""}`}>
          {waiting ? (
            <span className="ask-now-pills">
              {it.people ? <span className="pill pill-warn" data-testid="ask-pill">{t.needYou(it.people)}</span> : null}
              {it.runs ? <span className="pill pill-warn" data-testid="ask-pill">{t.runsWaiting(it.runs)}</span> : null}
            </span>
          ) : null}
          <span className="ask-row-label">{it.label}</span>
          {waiting ? <span className="btn btn-sm ask-now-brief" data-testid="ask-row-brief">{t.briefMe}</span> : null}
        </div>
      );
    }
    // One tab stop: the keys walk the list from the line (aria-activedescendant), so a chip is never reached by Tab.
    if (ahChip(it))
      return (
        <button key={i} type="button" tabIndex={-1} {...shared} className={`ask-chip${it.type === "all" ? " door" : ""}${sel ? " sel" : ""}`}>
          <span>{it.label}</span>
          {it.meta ? <span className="ask-chip-meta">{it.meta}</span> : null}
          {it.type === "all" ? <Icon name="arrow-right" size={12} /> : null}
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
  // A section's items in runs, in the order the keys walk them: rows as they are, each run of chips in one wrap.
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
        <div key={sec.key} className="ask-rows-sec" role="presentation">
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

window.AskHome = { buildLineRows, AskRows, flatRows, ahAgo };
