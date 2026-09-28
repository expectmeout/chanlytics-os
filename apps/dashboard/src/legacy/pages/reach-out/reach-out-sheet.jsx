/* global React, Icon */
// Chanlytics -- the reach-out sheet (Reach out, Part 4 PR 6; canvas boards 01-04): a chain of emails to a search's
// leads, written and started in one sheet beside the page, or changed from its Playbooks row or its Templates row. On the
// house RecordSheet, keeping what was typed in the tab (useUnsavedWork). Its parts, in the canvas's order: who gets it
// (the search's reach as the database counts it, the unconfirmed addresses a door), what you'd say (the first email's
// subject and words, the six slots as chips, each problem under its field), then (up to five steps, each after its
// days), the pace, the domains it sends from, and before it goes (one business's email at a time, by a press: the
// preview spends the model, R12). Start saves and runs the first step, and the sheet stays open to say what happened
// (R14), with the one door on: the run that waits, or the chain's row. The domains and the booking link are Setup's and
// Settings' reads: until they are in, the sheet says it is reading them and Start waits, never "none". Every sentence is
// contracts' (window.__reachOuts.words); every act goes through window.__reachOuts. Never a fetch here.

const roSetup = () => (window.__SETUP && window.__SETUP.dto) || null;
const roDomains = () => {
  const e = roSetup() && roSetup().email;
  return (e && e.sending && e.sending.domains) || [];
};
const roBookingLink = () => {
  const b = window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain;
  return !!(b && b.booking_link);
};
/** Whether a read the sheet draws from is in, still out, or failed (the domains are Setup's; the link, Settings'). */
const roReads = () => {
  const failed = (page, param) => !!(window.__surfaceFailed && window.__surfaceFailed(page, param));
  const settings = window.__SETTINGS;
  return {
    domains: roSetup() ? "in" : window.__SETUP === null || failed("start") ? "failed" : "reading",
    settings: settings && settings.config ? "in" : (settings && settings.broken) || failed("admin", "workspace") ? "failed" : "reading",
  };
};
const roMailbox = () => {
  const e = roSetup() && roSetup().email;
  return (e && e.mailbox && e.mailbox.address) || null;
};

/** One field's problems, under it, in contracts' words. */
const RoIssues = ({ lines, testid }) => (lines && lines.length
  ? <ul className="ro-issues" data-testid={testid}>{lines.map((t) => <li key={t} className="ro-issue">{t}</li>)}</ul>
  : null);

/** The six slots as chips: each puts its slot in at the caret of the field last focused. */
const RoSlots = ({ W, onSlot, testid = "ro-slots" }) => (
  <div className="em-slots" data-testid={testid}>
    {W.REACH_OUT_SLOTS.map((s) => (
      <button key={s} type="button" className="chip em-slot" title={W.REACH_OUT_SLOT_WORDS[s]} onMouseDown={(e) => e.preventDefault()} onClick={() => onSlot(s)} data-testid={`ro-slot-${s.replace(/ /g, "-")}`}>{s}</button>
    ))}
    <span className="em-slots-hint">{W.REACH_OUT_SHEET_WORDS.slotsHint}</span>
  </div>
);

/** Who gets it: the search, and its reach as the database counts it, with the unconfirmed addresses' door. */
const RoWho = ({ W, search, reach, include, onInclude }) => {
  const line = reach ? W.reachLineOf(reach, include) : null;
  return (
    <section className="pb-sec" data-testid="ro-who">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.who}</span>
      <div className="pb-pick is-fixed"><span className="pb-pick-text"><span className="pb-pick-title">{search.name}</span><span className="pb-pick-sub" data-testid="ro-who-line">{W.reachOutWhoWords(include)}</span></span></div>
      {line && (
        <div className="cm-reach ro-reach" data-testid="ro-reach">
          <span className="cm-reach-n"><span className="cm-reach-will" data-testid="ro-reach-count">{line.count}</span><span className="cm-reach-of">{line.of}</span></span>
          <span className="cm-reach-bar" aria-hidden="true"><span className="cm-reach-bar-will" style={{ width: `${line.bar.will}%` }} /><span className="cm-reach-bar-held" style={{ width: `${line.bar.held}%` }} /><span className="cm-reach-bar-rest" /></span>
          <ul className="cm-reach-why">
            {line.why.map((w) => (
              <li key={w.text}><span className="cm-reach-dot" data-tone={w.tone} />{w.text}{w.door && <button type="button" className="cm-reach-door" onClick={() => onInclude(!include)} data-testid="ro-include">{w.door}</button>}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/** One step's words: the subject for the first only, the words, and each field's problems under it. */
const RoStepWords = ({ W, step, n, issues, onEdit, onFocus }) => {
  const P = W.REACH_OUT_SHEET_PARTS;
  const at = (field) => (e) => onFocus(n, field, e.target.selectionStart);
  return (
    <div className="ro-words" data-testid={`ro-words-${n}`}>
      {n === 0 && (
        <label className="ro-field">
          <span className="ro-field-k">{P.subject}</span>
          <input className="bc-subject" value={step.subject || ""} onChange={(e) => onEdit(n, { subject: e.target.value })} onFocus={at("subject")} onSelect={at("subject")} data-testid="ro-subject" />
          <RoIssues lines={issues.subject} testid="ro-subject-issues" />
        </label>
      )}
      <label className="ro-field">
        <span className="ro-field-k">{P.body}</span>
        <textarea className="ro-body" rows={n === 0 ? 7 : 4} value={step.body} onChange={(e) => onEdit(n, { body: e.target.value })} onFocus={at("body")} onSelect={at("body")} data-testid={n === 0 ? "ro-body" : `ro-step-body-${n}`} />
        <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
      </label>
    </div>
  );
};

/** What you'd say: the first email, the slots, the opening's note, the fills, and the name it signs with. */
const RoWhat = ({ W, draft, issues, onEdit, onFocus, onSlot, onSigned, from }) => {
  const S = W.REACH_OUT_SHEET_WORDS;
  const mailbox = roMailbox();
  return (
    <section className="pb-sec" data-testid="ro-what">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.words}</span>
      <RoStepWords W={W} step={draft.steps[0]} n={0} issues={issues.steps[0]} onEdit={onEdit} onFocus={onFocus} />
      <RoSlots W={W} onSlot={onSlot} />
      <p className="pb-note">{S.opening}</p>
      <div className="pb-fills">
        {from && <div className="pb-fill"><span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.fromLine}</span><span className="pb-fill-val"><span className="pb-fill-words">{from}</span></span></div>}
        <div className="pb-fill"><span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.footLine}</span><span className="pb-fill-val"><span className="pb-fill-words">{S.foot}</span><span className="pb-fill-hint">{S.footHint}</span></span></div>
        {mailbox && <div className="pb-fill"><span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.repliesLine}</span><span className="pb-fill-val"><span className="pb-fill-words">{mailbox}</span><span className="pb-fill-hint">{S.repliesHint}</span></span></div>}
      </div>
      <label className="ro-field">
        <span className="ro-field-k">{W.REACH_OUT_SHEET_PARTS.signAs}</span>
        <input className="bc-subject" value={draft.signed_by} maxLength={60} onChange={(e) => onSigned(e.target.value)} data-testid="ro-signed" />
        <RoIssues lines={issues.signed_by} testid="ro-signed-issues" />
      </label>
      <RoIssues lines={issues.chain} testid="ro-chain-issues" />
      <p className="pb-note" data-testid="ro-stop-one">{S.stopOne}</p>
    </section>
  );
};

/** A call's or a note's words: what to do when each business comes up on your Today (Part 5, G20). */
const RoHandWords = ({ W, step, n, issues, onHand }) => {
  const S = W.REACH_OUT_SHEET_WORDS;
  return (
    <label className="ro-field" data-testid={`ro-hand-${n}`}>
      <span className="ro-field-k">{S.handWords}</span>
      <textarea className="ro-body" rows={2} maxLength={W.HAND_WORDS_MAX} value={step.hand.words} placeholder={S.handPlaceholder} onChange={(e) => onHand(n, e.target.value)} data-testid={`ro-hand-words-${n}`} />
      <span className="dim">{S.handHint}</span>
      <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
    </label>
  );
};

/** Then: the chain as steps, each later one after its days with nothing back, up to five; the last may be taken off. */
const RoThen = ({ W, draft, issues, onEdit, onFocus, onSlot, onAfter, onAdd, onAddHand, onHand, onDrop }) => {
  const P = W.REACH_OUT_SHEET_PARTS;
  const S = W.REACH_OUT_SHEET_WORDS;
  const days = W.reachOutAfterDayChoices().map((n) => ({ v: n, t: `${n} days` }));
  return (
    <section className="pb-sec" data-testid="ro-then">
      <span className="pb-sec-k">{P.then}</span>
      <div className="pb-chain">
        <div className="pb-chain-row"><span className="pb-chain-k">{W.stepLabel(0)}</span><span className="dim">{P.dayOne}</span></div>
        {draft.steps.slice(1).map((s, i) => {
          const n = i + 1;
          return (
            <div key={n} className="pb-chain-row" data-testid={`ro-step-${n}`}>
              <span className="pb-chain-k">{W.stepLabelOf({ n, hand: s.hand })}</span>
              <span>{P.after} <window.PbTok value={s.after_days} options={days} onChange={(v) => onAfter(n, Number(v))} label={`${P.after} how many days`} testid={`ro-after-${n}`} /> {P.afterTail}</span>
              {s.hand ? <RoHandWords W={W} step={s} n={n} issues={issues.steps[n]} onHand={onHand} /> : <>
                <RoStepWords W={W} step={s} n={n} issues={issues.steps[n]} onEdit={onEdit} onFocus={onFocus} />
                <RoSlots W={W} onSlot={onSlot} testid={`ro-slots-${n}`} />
              </>}
              {n === draft.steps.length - 1 && <button type="button" className="cl-bucket-link" onClick={onDrop} data-testid="ro-remove">{P.remove}</button>}
            </div>
          );
        })}
        {W.reachOutMayAddStep(draft) && <>
          <button type="button" className="pb-chain-add" onClick={onAdd} data-testid="ro-add"><Icon name="plus" size={12} /> {S.anotherStep} <span className="dim">{S.anotherStepHint}</span></button>
          <button type="button" className="pb-chain-add" onClick={() => onAddHand("call")} data-testid="ro-add-call"><Icon name="plus" size={12} /> {S.anotherCall}</button>
          <button type="button" className="pb-chain-add" onClick={() => onAddHand("note")} data-testid="ro-add-note"><Icon name="plus" size={12} /> {S.anotherNote}</button>
        </>}
      </div>
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.stops}</p>
    </section>
  );
};

/** The pace: the domain's day and the gap, why it is recommended, and when the first run goes. */
const RoPace = ({ W, pace, gap, onGap }) => {
  const words = W.paceWords({ share: pace.share, sentDays: pace.sentDays, gapMinutes: gap });
  const gaps = W.REACH_OUT_GAP_MINUTES.map((m) => ({ v: m, t: `${m} min` }));
  return (
    <section className="pb-sec" data-testid="ro-pace">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.pace}</span>
      <p className="pb-when">{words.parts[1]}{words.parts[2]}<window.PbTok value={gap} options={gaps} onChange={(v) => onGap(Number(v))} label="How long between emails" testid="ro-gap" />{words.parts[4]}</p>
      <p className="pb-rules-line"><b>{W.REACH_OUT_SHEET_PARTS.recommended}</b> · {words.why}</p>
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.first}</p>
    </section>
  );
};

/** From: every verified domain, or up to five picked; unread is said as reading, none verified as none, and Start waits. */
const RoFrom = ({ W, domains, unread, draft, onPick }) => {
  const P = W.REACH_OUT_SHEET_PARTS;
  const verified = domains.filter((d) => d.state === "verified");
  const say = unread || (verified.length === 0 ? W.REACH_OUT_SHEET_WORDS.noDomain : null);
  if (say)
    return <section className="pb-sec" data-testid="ro-from"><span className="pb-sec-k">{P.from}</span><p className={unread ? "pb-note" : "pb-warn"} data-testid={unread ? "ro-unread" : "ro-no-domain"}>{say}</p></section>;
  const picked = draft.domain_ids;
  const more = W.reachOutMayPickDomain(draft);
  const toggle = (id) => onPick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <section className="pb-sec" data-testid="ro-from">
      <span className="pb-sec-k">{P.from}</span>
      <label className="ro-domain"><input type="checkbox" checked={picked.length === 0} onChange={() => onPick([])} data-testid="ro-domain-every" /> {P.everyDomain}</label>
      {verified.map((d) => <label key={d.id} className="ro-domain"><input type="checkbox" checked={picked.includes(d.id)} disabled={!more && !picked.includes(d.id)} onChange={() => toggle(d.id)} data-testid={`ro-domain-${d.id}`} /> {d.from_name} · {d.address}</label>)}
      {!more && <p className="pb-note" data-testid="ro-domains-max">{P.domainsMax}</p>}
    </section>
  );
};

/** The preview's frame: one business's email as it reads, with its hold or refusal said. */
const RoFrame = ({ W, shown, of, busy, onMove, onRewrite }) => {
  const PW = W.REACH_OUT_PREVIEW_WORDS;
  const v = shown.preview;
  const lines = W.previewLinesOf({ preview: v, index: shown.index, of });
  return (
    <div className="em-preview" data-testid="ro-preview-body">
      {lines.nobody && <p className="pb-note">{lines.nobody}</p>}
      {lines.reader && (
        <p className="em-reader" data-testid="ro-reader">{lines.reader}{v.angle && <span className="chip">{v.angle}</span>}
          <button type="button" className="cl-bucket-link" disabled={busy || lines.first} onClick={() => onMove(-1)} data-testid="ro-prev">{PW.prev}</button>
          <button type="button" className="cl-bucket-link" disabled={busy || lines.last} onClick={() => onMove(1)} data-testid="ro-next">{PW.next}</button>
        </p>
      )}
      {v.lead && v.body && (
        <div className="em-frame" data-testid="ro-frame">
          <p className="em-frame-head"><span>{W.REACH_OUT_SHEET_PARTS.toLine}</span> {v.lead.email}</p>
          {v.subject && <p className="em-frame-head"><span>{W.REACH_OUT_SHEET_PARTS.subjectLine}</span> {v.subject}</p>}
          <p className="em-frame-body">{v.body}</p>
        </div>
      )}
      {[lines.hold, lines.refused, lines.unavailable].filter(Boolean).map((t) => <p key={t} className="pb-warn" data-testid="ro-preview-said">{t}</p>)}
      {v.lead && <button type="button" className="btn btn-sm" disabled={busy} onClick={onRewrite} data-testid="ro-rewrite">{PW.rewrite}</button>}
    </div>
  );
};

/** Before it goes: one business's email at a time, asked for by a press (it spends the model), never on its own. */
const RoBefore = ({ W, ask, of, stale }) => {
  const PW = W.REACH_OUT_PREVIEW_WORDS;
  const [shown, setShown] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState(null);
  const go = async (index) => {
    if (!window.__reachOuts || busy) return;
    setBusy(true);
    setSaid(null);
    const r = await window.__reachOuts.preview(ask(index));
    setBusy(false);
    if (r && r.ok) setShown({ index, preview: r.data.preview, words: stale.key });
    else setSaid((r && r.message) || "");
  };
  const changed = shown && shown.words !== stale.key;
  return (
    <section className="pb-sec" data-testid="ro-before">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.before}</span>
      {(!shown || changed) && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => go(shown ? shown.index : 0)} data-testid="ro-preview">{changed ? PW.changed : PW.read}</button>}
      {busy && <p className="cm-standing" data-testid="ro-preview-busy">{PW.reading}</p>}
      {said !== null && <p className="pb-warn" role="alert" data-testid="ro-preview-refused">{said}</p>}
      {shown && !changed && <RoFrame W={W} shown={shown} of={of} busy={busy} onMove={(d) => go(shown.index + d)} onRewrite={() => go(shown.index)} />}
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.checkLater}</p>
    </section>
  );
};

/** The sheet's state: the draft (kept in the tab while changed), the caret of the field last focused, the reach. */
const useReachOutDraft = (W, { search, chain, includeUnconfirmed, onClose }) => {
  const me = window.__ME || {};
  const opened = React.useMemo(() => W.reachOutDraftOf({ chain, searchName: search.name, signedBy: W.firstNameOf(me.display_name, null), includeUnconfirmed }), [chain, search.name]); // eslint-disable-line react-hooks/exhaustive-deps -- what it opened as, read once
  const key = chain ? chain.root_id : `new:${search.id}`;
  // A draft kept in the tab comes back as it was typed, but who it writes to is the door's: the door said which.
  const [draft, setDraft] = React.useState(() => {
    const kept = window.tabDraft && window.tabDraft("reach-out", key);
    return kept ? (chain ? kept : { ...kept, include_unconfirmed: opened.include_unconfirmed }) : opened;
  });
  const work = window.useUnsavedWork("reach-out", key, { value: draft, dirty: JSON.stringify(draft) !== JSON.stringify(opened), onLeave: onClose });
  const caret = React.useRef({ n: 0, field: "body", at: null });
  const [reach, setReach] = React.useState(null);
  const [, setLanded] = React.useState(0);
  React.useEffect(() => {
    const landed = () => setLanded((n) => n + 1);
    for (const ev of ["surface:setup", "surface:settings"]) window.addEventListener(ev, landed);
    return () => { for (const ev of ["surface:setup", "surface:settings"]) window.removeEventListener(ev, landed); };
  }, []);
  React.useEffect(() => {
    let live = true;
    if (window.__reachOuts) window.__reachOuts.reach(search.id).then((r) => { if (live) setReach(r); });
    return () => { live = false; };
  }, [search.id]);
  const editStep = (n, patch) => setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === n ? { ...s, ...patch } : s)) }));
  const slot = (s) => {
    const c = caret.current;
    const step = draft.steps[c.n] || draft.steps[0];
    const put = W.insertSlotAt(String(step[c.field] || ""), c.at, s);
    caret.current = { ...c, at: put.caret };
    editStep(c.n, { [c.field]: put.text });
  };
  return { draft, setDraft, work, reach, editStep, slot, focus: (n, field, at) => { caret.current = { n, field, at }; } };
};

/** Saved: what its first run did (R14), said where the words were, until the owner closes the sheet or goes on. */
const RoSaved = ({ saved }) => (
  <section className="pb-sec" data-testid="ro-saved-sec">
    <p className="pb-when" data-tone={saved.tone} role="status" data-testid="ro-saved">{saved.text}</p>
  </section>
);

/** The foot: what the chain will do, Cancel, and Start it (or Save, changing one); the one question first when asked. */
const RoFoot = ({ W, work, say, ready, busy, editing, onStart, saved, onClose }) => {
  const P = W.REACH_OUT_SHEET_PARTS;
  if (saved) return (
    <div className="pb-foot">
      <span className="pb-foot-say" />
      <button type="button" className="btn" onClick={onClose} data-testid="ro-close">{P.close}</button>
      <button type="button" className="btn btn-primary" onClick={() => { if (window.CHANLY) window.CHANLY.nav(saved.to); onClose(); }} data-testid="ro-saved-go">{saved.label}</button>
    </div>
  );
  if (work.asking) return <div className="pb-foot"><window.UnsavedAsk onYes={work.discard} onNo={work.stay} what="saved" testid="ro-leave" /></div>;
  return (
    <div className="pb-foot">
      <span className="pb-foot-say" data-tone={say.tone} role={say.tone === "danger" ? "alert" : undefined} data-testid="ro-foot-say">{say.text}</span>
      <button type="button" className="btn" onClick={work.leave} data-testid="ro-cancel">{P.cancel}</button>
      <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={onStart} data-testid="ro-start" {...window.gate("approve", editing ? "change a reach-out" : "start a reach-out")}>{busy ? (editing ? P.saving : P.starting) : editing ? P.save : P.start}</button>
    </div>
  );
};

/**
 * The sheet. `search` is { id, name }; `chain` the chain being changed, or null for a new one; `onDone(saved)` hears
 * a save the server took (the opener reads the search again behind it). Saved, the sheet stays and says what its first
 * run did (R14), with Close and the one door on; `onClose` closes it.
 */
const ReachOutSheet = ({ search, chain = null, includeUnconfirmed = false, onClose, onDone }) => {
  const W = window.__reachOuts && window.__reachOuts.words;
  const st = useReachOutDraft(W, { search, chain, includeUnconfirmed, onClose });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [saved, setSaved] = React.useState(null);
  const { draft, setDraft } = st;
  const domains = roDomains();
  const reads = roReads();
  const unread = W.reachOutSheetUnreadOf(reads);
  const pace = W.reachOutSheetPaceOf(domains.map((d) => ({ id: d.id, state: d.state, sent_days: Number(d.sent_days) || 0 })), draft.domain_ids);
  // An unread link is not a missing one: its problem is not said until Settings is in, and Start waits for it.
  const issues = W.reachOutDraftIssues(draft, { bookingLink: reads.settings !== "in" || roBookingLink() });
  const ready = !unread && issues.ready && pace.domains > 0;
  const first = domains.find((d) => d.state === "verified" && (draft.domain_ids.length === 0 || draft.domain_ids.includes(d.id)));
  const reachN = st.reach ? (draft.include_unconfirmed ? st.reach.with_unconfirmed : st.reach.ready) : 0;
  const say = error ? { tone: "danger", text: error } : { tone: "plain", text: unread || W.sheetFootWords({ share: pace.share, gapMinutes: draft.gap_minutes, ready: reachN, editing: !!chain }) };
  const body = W.reachOutChainBodyOf(draft, search.id);
  const ask = (index) => ({ search_id: search.id, index, include_unconfirmed: draft.include_unconfirmed, words: { subject: body.steps[0].subject, body: body.steps[0].body }, signed_by: body.signed_by });
  const start = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const r = chain ? await window.__reachOuts.update(chain.root_id, body) : await window.__reachOuts.save(body);
    setBusy(false);
    if (!r || !r.ok) return setError((r && r.message) || "");
    st.work.done();
    setSaved(W.reachOutSavedWords(r.data));
    if (onDone) onDone(r.data);
  };
  return (
    <window.RecordSheet
      id="reach-out"
      testid="ro-sheet"
      className="pb-sheet ro-sheet"
      title={<span className="pb-title-wrap"><input className="pb-title" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={80} readOnly={!!saved} spellCheck={false} aria-label={W.REACH_OUT_SHEET_PARTS.name} data-testid="ro-name" /><Icon name="pencil" size={13} /></span>}
      sub={W.REACH_OUT_SHEET_WORDS.sub}
      onClose={saved ? onClose : st.work.leave}
      closeLabel={saved ? W.REACH_OUT_SHEET_PARTS.close : W.REACH_OUT_SHEET_PARTS.cancel}
      foot={<RoFoot W={W} work={st.work} say={say} ready={ready} busy={busy} editing={!!chain} onStart={start} saved={saved} onClose={onClose} />}
    >
      {saved ? <RoSaved saved={saved} /> : (
      <div className="pb-compose ro-compose">
        <RoWho W={W} search={search} reach={st.reach} include={draft.include_unconfirmed} onInclude={(v) => setDraft((d) => ({ ...d, include_unconfirmed: v }))} />
        <RoWhat W={W} draft={draft} issues={issues} onEdit={st.editStep} onFocus={st.focus} onSlot={st.slot} onSigned={(v) => setDraft((d) => ({ ...d, signed_by: v }))} from={first ? `${first.from_name} · ${first.address}` : null} />
        <RoThen W={W} draft={draft} issues={issues} onEdit={st.editStep} onFocus={st.focus} onSlot={st.slot} onAfter={(n, v) => st.editStep(n, { after_days: v })} onAdd={() => setDraft(W.reachOutAddStep)} onAddHand={(kind) => setDraft((d) => W.reachOutAddHandStep(d, kind))} onHand={(n, v) => setDraft((d) => W.reachOutSetHandWords(d, n, v))} onDrop={() => setDraft(W.reachOutDropStep)} />
        <RoPace W={W} pace={pace} gap={draft.gap_minutes} onGap={(v) => setDraft((d) => ({ ...d, gap_minutes: v }))} />
        <RoFrom W={W} domains={domains} unread={reads.domains === "in" ? null : unread} draft={draft} onPick={(ids) => setDraft((d) => ({ ...d, domain_ids: ids }))} />
        <RoBefore W={W} ask={ask} of={W.reachOutPreviewOf(reachN)} stale={{ key: JSON.stringify([body.steps[0], body.signed_by, draft.include_unconfirmed]) }} />
      </div>
      )}
    </window.RecordSheet>
  );
};

Object.assign(window, { ReachOutSheet });
