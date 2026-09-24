/* global React */
// Chanlytics — the deal sheet (docs/decisions/0008-a-proposal-is-part-of-the-deal.md).
//
// The one place a deal is created or moved: a new proposal, the proposal edited, a passed one proposed again, a yes, a
// pass, an end. Anything that moves a deal -- the person page's deal card, the thread's Deal group -- asks for it with
// window.openDealSheet({ personId, mode, service?, dealId? }), which says so as a `deal:sheet` event. DealSheetHost,
// drawn once by the shell beside its other overlays, hears it, reads the person through the profile's own courier (the
// tab's copy first, __peekPerson, else __personDetail, the read the person page makes) and draws the record kit's
// sheet: a dialog beside the page on a desk, rising from the bottom on a phone (record-sheet.jsx).
//
// It says nothing of its own. Each mode's title, fields, words and what it opens with are contracts' dealSheetFor; the
// body the deal route takes, and what is wrong before a round trip, dealSheetBody; where a refusal goes,
// dealSheetRefusal (deal-sheet.ts, through window.__deal). Its fields are the kit's: RecordField, RecordBox,
// RecordToggleGroup for how often and for why they passed, RecordSwitch for sending, and a select in the kit's input
// style for a service or a message.
//
// It holds the fold registry under its own id (`deal-sheet`, record-fold.jsx) as the Business tab's sheets do: one
// editor open at a time anywhere in the app, the tab asks before closing over what was typed, and Cancel asks once when
// something was (the registry's dirty test is contracts' dealSheetDirty). Save records through window.__recordDeal;
// when "Send it now" is on, the proposal then goes through the Inbox's own reply courier (thread-pane.jsx threadVerbs:
// its receipt, its Undo, its email retry), on the person's conversation. Then the sheet closes, says so, and
// dispatches `deal:recorded` with the person's id, which the person page reloads on. A refusal keeps the sheet open,
// said under the field it names; a send refused after a good record says both, and the sheet closes. Whenever the
// person is read again with the sheet open, what was typed stays and every field left alone takes the fresh value
// (contracts dealSheetMerge), so a Save never puts back what a teammate changed.

const { useState: useDsState, useEffect: useDsEffect, useRef: useDsRef } = React;

const DEAL_SHEET_ID = "deal-sheet";
// Where the record kit is not loaded (a harness that draws the host alone): a fold that never opens.
const DS_NO_FOLD = { open: false, asking: null, request: () => false, close: () => {}, discard: () => {}, stay: () => {} };
const DS_CLOSED = { ask: null, person: null, failed: null, draft: null, opened: null, busy: false, problem: null, armed: false };

// Ask for the sheet from anywhere: a person, what to do (contracts DEAL_SHEET_MODES), the deal a move is about, and a
// new proposal's service. True when it was asked for.
const openDealSheet = ({ personId = null, mode = null, service = null, dealId = null } = {}) => {
  if (!personId || !mode || typeof window.dispatchEvent !== "function") return false;
  window.dispatchEvent(new CustomEvent("deal:sheet", { detail: { personId, mode, service: service || null, dealId: dealId || null } }));
  return true;
};

// The business's zone, for the days the sheet says and asks (legacy-bridge/zone.ts, window.__clock).
const dsZone = () => (window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC");
// Something the sheet works out as it draws, tried: the answer, or null with the fault reported. The host is drawn by the
// shell outside any page's error boundary, so a person it cannot work out is said in the sheet (as a read that
// failed), never a throw that takes the shell with it (business-tab-gestures.jsx btWorkedOut, the same rule).
const dsWorked = (fn) => {
  try {
    return fn();
  } catch (err) {
    if (window.console) window.console.error("The deal sheet could not work this out.", err);
    return null;
  }
};
// What a toast calls them: their first name, or the whole of a name that is a number or an address.
const dsWho = (p) => {
  const n = String((p && p.name) || "").trim();
  return /^[+\d(]/.test(n) || n.includes("@") ? n : n.split(" ")[0] || n;
};

// A select in the kit's input style, with its label above it, as RecordField draws a box: the service a proposal is
// for, how a yes was given, which of their messages. Hookless. While a save is out it takes no change (never
// `disabled`, which lets go of focus: record-field.jsx).
const DsSelect = ({ id, label, value, options, onChange, busy = false, problem = null, testid = null }) => (
  <div className="rec-field" data-testid={testid || undefined}>
    <label>
      <span className="rec-field-label">{label}</span>
      <select
        className="rec-input deal-sheet-select"
        value={value}
        aria-disabled={busy || undefined}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `rec-${id}-problem` : undefined}
        onChange={(e) => { if (!busy) onChange(e.target.value); }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
    {problem ? <window.FieldError id={`rec-${id}-problem`} message={problem} /> : null}
  </div>
);

// The fields a mode draws, in the one order every mode keeps: for a yes, a pass or an end the day it happened first;
// then which service, the link, the value and how often, the day it stands until; why, a note, how they said yes; and
// last the send, with its words. Each is present only where contracts' sheet names it. Hookless.
const DealSheetFields = ({ sheet, draft, set, problem, busy }) => {
  const kit = window.__deal;
  const at = (field) => (problem && problem.field === field ? problem.words : null);
  const hasLink = !!draft.link.trim();
  const sending = !!(sheet.send && sheet.send.can && draft.send);
  return (
    <div className="deal-sheet-fields">
      {sheet.when ? (
        <window.RecordField
          id="deal-sheet-when"
          label={sheet.when.label}
          problem={at("when")}
          type="date"
          className="deal-sheet-day"
          max={sheet.when.max}
          value={draft.when}
          onChange={(v) => set({ when: v })}
          readOnly={busy}
          data-testid="deal-sheet-when-input"
          testid="deal-sheet-when"
        />
      ) : null}
      {sheet.service ? (
        <DsSelect id="deal-sheet-service" label={sheet.service.label} value={draft.service} options={sheet.service.options} onChange={(v) => set({ service: v })} busy={busy} problem={at("service")} testid="deal-sheet-service" />
      ) : null}
      {sheet.link ? (
        <window.RecordField
          id="deal-sheet-link"
          label={sheet.link.label}
          hint={sheet.link.hint}
          problem={at("link")}
          value={draft.link}
          onChange={(v) => set({ link: v })}
          readOnly={busy}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={sheet.link.placeholder}
          maxLength={500}
          data-testid="deal-sheet-link-input"
          testid="deal-sheet-link"
        />
      ) : null}
      {sheet.value ? (
        <div className="rec-field deal-sheet-amount" data-testid="deal-sheet-value">
          <span className="rec-field-label" aria-hidden="true">{sheet.value.label}</span>
          <div className="deal-sheet-amount-row">
            <window.RecordBox
              id="deal-sheet-value"
              label={sheet.value.label}
              value={draft.value}
              onChange={(v) => set({ value: v })}
              readOnly={busy}
              inputMode="decimal"
              autoComplete="off"
              placeholder={sheet.value.placeholder}
              invalid={at("value") ? "rec-deal-sheet-value-problem" : null}
              aria-describedby={at("value") ? undefined : "deal-sheet-value-hint"}
              data-testid="deal-sheet-value-input"
            />
            <window.RecordToggleGroup label={sheet.value.perLabel} value={draft.per} options={sheet.value.pers} onChange={(v) => set({ per: v })} readOnly={busy} testid="deal-sheet-per" />
          </div>
          {at("value")
            ? <window.FieldError id="rec-deal-sheet-value-problem" message={at("value")} testid="deal-sheet-value-problem" />
            : <span className="rec-hint" id="deal-sheet-value-hint">{sheet.value.hint}</span>}
        </div>
      ) : null}
      {sheet.validUntil ? (
        <window.RecordField
          id="deal-sheet-valid"
          label={sheet.validUntil.label}
          hint={sheet.validUntil.hint}
          problem={at("validUntil")}
          type="date"
          className="deal-sheet-day"
          value={draft.validUntil}
          onChange={(v) => set({ validUntil: v })}
          readOnly={busy}
          data-testid="deal-sheet-valid-input"
          testid="deal-sheet-valid"
        />
      ) : null}
      {sheet.reason ? (
        <div className="rec-field deal-sheet-reasons" data-testid="deal-sheet-reason">
          <span className="rec-field-label" aria-hidden="true">{sheet.reason.label}</span>
          <window.RecordToggleGroup label={sheet.reason.label} value={draft.reason} options={sheet.reason.options} onChange={(v) => set({ reason: v })} readOnly={busy} />
          <window.FieldError message={at("reason")} />
        </div>
      ) : null}
      {sheet.note ? (
        <window.RecordField
          id="deal-sheet-note"
          label={sheet.note.label}
          hint={sheet.note.hint}
          problem={at("note")}
          rows={2}
          maxLength={sheet.note.max}
          placeholder={sheet.note.placeholder}
          value={draft.note}
          onChange={(v) => set({ note: v })}
          readOnly={busy}
          data-testid="deal-sheet-note-input"
          testid="deal-sheet-note"
        />
      ) : null}
      {sheet.how ? (
        <div className="deal-sheet-how" data-testid="deal-sheet-how">
          <DsSelect id="deal-sheet-how" label={sheet.how.label} value={draft.how} options={sheet.how.options} onChange={(v) => set({ how: v })} busy={busy} testid="deal-sheet-how-way" />
          {draft.how === "customer_message" && sheet.how.messages.length > 0 ? (
            <DsSelect id="deal-sheet-message-id" label={sheet.how.which} value={draft.messageId} options={sheet.how.messages} onChange={(v) => set({ messageId: v })} busy={busy} testid="deal-sheet-how-message" />
          ) : null}
          {draft.how === "form" ? (
            <window.RecordField
              id="deal-sheet-where"
              label={sheet.how.where}
              problem={at("how")}
              maxLength={sheet.how.max}
              placeholder={sheet.how.wherePlaceholder}
              value={draft.formNote}
              onChange={(v) => set({ formNote: v })}
              readOnly={busy}
              data-testid="deal-sheet-where-input"
              testid="deal-sheet-where"
            />
          ) : null}
        </div>
      ) : null}
      {sheet.send ? (
        <div className="deal-sheet-send" data-testid="deal-sheet-send">
          <div className="deal-sheet-send-row">
            <span className="deal-sheet-send-label" id="deal-sheet-send-label">{sheet.send.label}</span>
            <window.RecordSwitch
              on={sending}
              onChange={(v) => set({ send: v })}
              labelledBy="deal-sheet-send-label"
              describedBy={sheet.send.why ? "deal-sheet-send-why" : null}
              readOnly={busy || !sheet.send.can}
              testid="deal-sheet-send-switch"
            />
          </div>
          {sheet.send.why ? <span className="rec-hint" id="deal-sheet-send-why" data-testid="deal-sheet-send-why">{sheet.send.why}</span> : null}
          {/* The words follow the link until they are changed, and appear once there is a link to carry. */}
          {sending && (hasLink || draft.message !== null) ? (
            <window.RecordField
              id="deal-sheet-message"
              label={sheet.send.message.label}
              hint={sheet.send.message.hint}
              problem={at("message")}
              rows={3}
              value={kit.message(draft)}
              onChange={(v) => set({ message: v })}
              readOnly={busy}
              data-testid="deal-sheet-message-input"
              testid="deal-sheet-message"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// The fields each problem can be drawn under, where the mode draws them; anything else is said by the Save.
const dsDrawn = (sheet, draft) => ({
  service: !!sheet.service,
  link: !!sheet.link,
  value: !!sheet.value,
  validUntil: !!sheet.validUntil,
  when: !!sheet.when,
  reason: !!sheet.reason,
  note: !!sheet.note,
  how: !!(sheet.how && draft.how === "form"),
  send: !!sheet.send,
  message: !!(sheet.send && sheet.send.can && draft.send && (draft.link.trim() || draft.message !== null)),
});

const DealSheetHost = () => {
  const [toastNode, flash] = window.usePPToast();
  const [st, setSt] = useDsState(DS_CLOSED);
  const kit = window.__deal && window.__deal.sheet ? window.__deal : null;
  // The sheet as it stands: the mode's words and fields over the person as read, worked out on every draw (pure).
  const sheet = kit && st.ask && st.person
    ? dsWorked(() => kit.sheet(st.ask.mode, st.person, Date.now(), dsZone(), { dealId: st.ask.dealId, service: st.ask.service }))
    : null;
  const dirty = !!(kit && st.draft && st.opened && dsWorked(() => kit.dirty(st.draft, st.opened)));
  const fold = window.useRecordFold ? window.useRecordFold(DEAL_SHEET_ID, { dirty, saving: st.busy }) : DS_NO_FOLD;
  // Counted on the page as a fold is (record-fold.jsx drawn), for the shell's life.
  useDsEffect(() => (window.__recordFolds && window.__recordFolds.drawn ? window.__recordFolds.drawn(DEAL_SHEET_ID) : undefined), []);
  const foldNow = useDsRef(fold);
  foldNow.current = fold;

  // What the sheet opens with, for a person as read: contracts' draft for the mode, kept as what "changed" is judged by.
  const begin = (ask, person) => {
    const made = dsWorked(() => window.__deal.sheet(ask.mode, person, Date.now(), dsZone(), { dealId: ask.dealId, service: ask.service }));
    const opened = made ? made.draft : null;
    return { ...DS_CLOSED, ask, person, draft: opened, opened };
  };
  // The person read, through the profile's own courier, every time the sheet opens and after a refusal: a sheet opened
  // before they were read fills in as they land; one drawn from the tab's copy, or refused because someone moved the
  // deal since, takes them as they now stand. What was typed stays, with what was said about it; every field left as it
  // opened takes the fresh value, and the fresh draft becomes what "changed" is judged by (contracts dealSheetMerge),
  // so a second Save moves the row as it stands and changes only what was typed here. A save still out keeps its draft:
  // its refusal reads them again.
  const read = (ask) => {
    const words = window.__deal ? window.__deal.sheetWords : null;
    if (!window.__personDetail) {
      setSt((s) => (s.ask === ask && !s.person ? { ...s, failed: "" } : s));
      return;
    }
    window.__personDetail(ask.personId).then(
      (vm) => setSt((s) => {
        if (s.ask !== ask) return s;
        if (!vm) return s.person ? s : { ...s, failed: words ? words.gone : "" };
        if (!s.person) return begin(ask, vm);
        if (s.busy) return { ...s, person: vm };
        const fresh = begin(ask, vm);
        if (!s.draft || !s.opened || !fresh.draft) return { ...fresh, problem: s.problem };
        const draft = dsWorked(() => window.__deal.merge(s.draft, s.opened, fresh.draft)) || fresh.draft;
        return { ...s, person: vm, draft, opened: fresh.draft };
      }),
      (e) => setSt((s) => (s.ask !== ask || s.person ? s : { ...s, failed: (e && e.message) || "" })),
    );
  };
  useDsEffect(() => {
    const onOpen = (e) => {
      const d = (e && e.detail) || {};
      const k = window.__deal;
      if (!k || !k.sheet || !d.personId || !k.isMode(d.mode)) return;
      const ask = { personId: d.personId, mode: d.mode, service: d.service || null, dealId: d.dealId || null };
      const held = window.__peekPerson ? window.__peekPerson(ask.personId) : null;
      setSt(held ? begin(ask, held) : { ...DS_CLOSED, ask });
      foldNow.current.request();
      read(ask);
    };
    window.addEventListener("deal:sheet", onOpen);
    return () => window.removeEventListener("deal:sheet", onOpen);
  }, []);

  const close = () => { setSt(DS_CLOSED); fold.close(); };
  const set = (patch) => setSt((s) => (s.busy || !s.draft ? s : { ...s, draft: { ...s.draft, ...patch }, problem: null, armed: false }));
  // Cancel, the head's Close, Escape, a press on the wash and a pull down on a phone: nothing while the save is out, and
  // once, asked, when something was typed.
  const cancel = () => {
    if (st.busy) return;
    if (dirty) { setSt((s) => ({ ...s, armed: true })); return; }
    close();
  };

  const save = async () => {
    if (!kit || !sheet || sheet.blocked || st.busy || !st.draft) return;
    const W = kit.sheetWords;
    const ask = st.ask;
    const person = st.person;
    const canSend = !!(sheet.send && sheet.send.can);
    const out = kit.body(ask.mode, st.draft, sheet.deal, { tz: dsZone(), nowMs: Date.now(), canSend });
    if (out.problem) { setSt((s) => ({ ...s, problem: out.problem, armed: false })); return; }
    if (!window.__recordDeal) { setSt((s) => ({ ...s, problem: { field: null, words: W.failed } })); return; }
    setSt((s) => ({ ...s, busy: true, problem: null, armed: false }));
    let r;
    try { r = await window.__recordDeal(ask.personId, out.body); } catch (err) { r = { ok: false, message: err && err.message }; }
    if (!r || !r.ok) {
      setSt((s) => (s.ask !== ask ? s : { ...s, busy: false, problem: kit.refusal(r && r.message) }));
      // What the sheet was opened over may be behind (someone moved the deal since): read them again, so a second Save
      // moves the row as it now stands, or the sheet says it has moved on.
      read(ask);
      return;
    }
    const who = dsWho(person);
    // The send, once the record has landed: the Inbox's own courier, so its receipt, its Undo and its email retry are
    // the Inbox's. It says itself; a refusal says the record stood.
    let said = false;
    if (out.send && canSend) {
      const say = (toast) => {
        said = true;
        flash(toast && toast.tone === "danger" ? { ...toast, msg: <>{W.notSent} {toast.msg}</> } : toast);
      };
      let went = false;
      if (person.threadId && window.threadVerbs) {
        const t = { id: person.threadId, conversationId: person.threadId.replace(/^th-/, ""), escalationId: null, who };
        try { went = await window.threadVerbs(say).verb(t, "reply", { text: out.send.text }, W.sent, true); } catch { went = false; }
      }
      // Refused before anything could say why (no conversation to send in, no courier here, or it threw): the record
      // stood, and nothing went.
      if (!went && !said) { said = true; flash({ tone: "danger", msg: <>{W.unsent}</> }); }
    }
    setSt(DS_CLOSED);
    foldNow.current.close();
    if (!said) flash({ msg: <><b>{who}</b> · {sheet.done}</> });
    window.dispatchEvent(new CustomEvent("deal:recorded", { detail: { personId: ask.personId } }));
  };

  if (!kit || !fold.open || !st.ask) return toastNode;
  const W = kit.sheetWords;
  const mode = st.ask.mode;
  const sending = !!(sheet && sheet.send && sheet.send.can && st.draft && st.draft.send);
  const ready = !!(sheet && !sheet.blocked && st.draft);
  // A problem is said under the field it names where that field is drawn, and by the Save where it is not.
  const drawn = sheet && st.draft ? dsDrawn(sheet, st.draft) : null;
  const atField = st.problem && st.problem.field && drawn && drawn[st.problem.field] ? st.problem : null;
  const general = st.problem && !atField ? st.problem.words : null;
  const ask = (props) => <window.Confirm question={W.discard.question} detail={W.discard.detail} yes={W.discard.yes} no={W.discard.no} danger {...props} />;
  const confirm = fold.asking
    ? ask({ onYes: () => { setSt(DS_CLOSED); fold.discard(); }, onNo: () => { setSt((s) => ({ ...s, armed: false })); fold.stay(); }, testid: "deal-sheet-ask" })
    : st.armed
      ? ask({ onYes: close, onNo: () => setSt((s) => ({ ...s, armed: false })), testid: "deal-sheet-cancel" })
      : null;
  const retry = () => { setSt((s) => ({ ...s, failed: null })); read(st.ask); };
  const body = st.failed !== null && !st.person
    ? <window.FailedRead kind="card" what="this person" why={st.failed || null} onRetry={retry} testid="deal-sheet-failed" />
    : !st.person
      ? <div className="route-reading deal-sheet-reading" role="status">{W.reading}</div>
      : !sheet || !st.draft
        ? <window.FailedRead kind="card" what="this person" testid="deal-sheet-failed" />
        : sheet.blocked
          ? <p className="deal-sheet-said" data-testid="deal-sheet-blocked">{sheet.blocked}</p>
          : <DealSheetFields sheet={sheet} draft={st.draft} set={set} problem={atField} busy={st.busy} />;
  return (
    <>
      <window.RecordSheet
        id={DEAL_SHEET_ID}
        className="deal-sheet"
        title={sheet ? sheet.title : W.titles[mode]}
        sub={sheet ? sheet.sub : null}
        onClose={cancel}
        onSave={ready ? save : null}
        saving={st.busy}
        saveLabel={sheet ? (sending && sheet.save.withSend ? sheet.save.withSend : sheet.save.label) : W.save[mode]}
        savingLabel={sending ? W.sending : W.saving}
        gate={window.gate ? window.gate("approve", "record a deal") : null}
        confirm={confirm}
        foot={general ? <window.FieldError id="deal-sheet-problem" message={general} testid="deal-sheet-problem" /> : null}
      >
        {body}
      </window.RecordSheet>
      {toastNode}
    </>
  );
};

// The select goes out too: the step sheet asks who a step is for in the same field (step-sheet.jsx).
Object.assign(window, { openDealSheet, DealSheetHost, DealSheetFields, DsSelect });
