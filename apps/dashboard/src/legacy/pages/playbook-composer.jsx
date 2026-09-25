/* global React, Icon, PolicyChip, FailedRead */
// Chanlytics -- People › Playbooks: the composer a playbook is made and edited in. Moved whole from outbound-real.jsx
// (Reach out Part 2.5), which reads it from window.
// playbook-bits.jsx, which loads before this file.
const { PB_NONE, pbOrder, pbFirstFree, PB_TEXT, pbTitle, pbExample, pbIcon, pbLabel, pbLangWords, pbListSub, PB_LIST_GROUPS, PB_LIST_CLASSES, pbSpell, pbShort, pbFooter, PbTok, pbHours, pbHour, pbWith, PB_CAPS, PB_CADENCES, PB_GAPS, pbGuardWords } = window;

/**
 * The composer: a new playbook, or one being changed, in a sheet beside the
 * page (RecordSheet). The moments stay where they were behind it: it was a
 * panel over the grid that pushed the cards down and took the unset moments
 * away while it was open, so opening it moved the whole page.
 *
 * It reads the way a playbook is: who it is for (the moment, and who that
 * reaches today), what it says (the message as a customer reads it, and what
 * fills each of its slots), and when it runs (one sentence, its numbers chosen
 * in place). Everything else is a press away -- every moment and every message
 * behind their own control, the rules every run keeps behind the shield.
 *
 * A slot takes only what keeps its message true (contracts slotChoices): a
 * first name is each person's own and a visit's time each visit's, so neither
 * is a choice; the business name and the booking link may be typed over; a
 * slot on a message written elsewhere may be anything, its guess first. Each
 * slot had a free choice of all six, so a first name could be set to the
 * booking link and a run greeted everyone "Hi your booking link". A message
 * one of whose slots nothing can fill here -- a visit's reminder, on a list --
 * is not offered at all.
 *
 * Checked here the way the route checks it -- a message chosen, every slot
 * filled -- so an enabled Start is a Start that succeeds unless the server
 * knows something newer (a template no longer approved, a booking link gone).
 */
const PlaybookComposer = ({ data, editing, initialTrigger = null, onDone, onCancel }) => {
  const S = window.__starters || null;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  // As on Broadcasts: a template this product cannot put on the wire is not
  // offered, rather than offered and refused by Meta for every recipient.
  const offered = React.useMemo(() => (window.__starters && window.__starters.sendable
    ? window.__starters.sendable((data.templates || PB_NONE).slice().sort(pbOrder))
    : { sendable: (data.templates || PB_NONE).slice().sort(pbOrder), blocked: PB_NONE, why: null }), [data.templates]);
  const triggers = data.triggers || PB_NONE;
  // What it opens as: the playbook being changed, or a new one on the moment pressed. Words typed here before and
  // not saved come back over that (the tab's draft, useUnsavedWork), except the moment a slot was pressed for.
  const opened = React.useMemo(() => ({
    trigger: editing ? editing.trigger : initialTrigger || pbFirstFree(triggers, data.rows),
    tplId: editing ? editing.template_id : "",
    picked: !!editing,
    name: editing ? editing.name : null,
    hour: editing ? editing.run_hour : 10,
    cap: editing ? editing.cap_per_run : 25,
    gap: editing ? editing.gap_days : 90,
    cadence: editing ? editing.cadence_days : 30,
    // The list a playbook on a list runs on, by its token (decision 0009): its own, or the first of the workspace's
    // lists, else the first of People's.
    listId: editing
      ? (editing.list_key ? `seg:${editing.list_key}` : editing.list_id ? `list:${editing.list_id}` : null)
      : ((data.lists || PB_NONE).find((l) => !l.builtin) || (data.lists || PB_NONE)[0] || {}).id || null,
    // What a playbook on a list sends, under which row of Autonomy: an offer, or a win-back.
    cls: editing && editing.trigger === "saved_list" && editing.policy_class === "reengage" ? "reengage" : "campaign",
    fills: editing && Array.isArray(editing.params) ? { [editing.template_id]: editing.params.map((p) => (p && p.kind ? p.kind : "text")) } : {},
    typed: editing && Array.isArray(editing.params) ? { [editing.template_id]: editing.params.map((p) => (p && p.kind === "text" ? p.value : "")) } : {},
  }), [editing, initialTrigger]); // eslint-disable-line react-hooks/exhaustive-deps -- what it opened as, read once
  const draftKey = editing ? editing.id : "new";
  const [kept] = React.useState(() => (window.tabDraft ? window.tabDraft("playbook", draftKey) : null));
  const start = kept ? { ...kept, trigger: initialTrigger || kept.trigger } : opened;
  const [trigger, setTrigger] = React.useState(start.trigger);
  // The message the owner chose. Until they choose one it is the moment's own,
  // and it follows the moment -- nothing is picked for them that the moment
  // was not written for: it opened on whichever template sorted first.
  const [tplId, setTplId] = React.useState(start.tplId);
  const [picked, setPicked] = React.useState(start.picked);
  // Null follows the name the route gives a playbook given none; words are the owner's.
  const [name, setName] = React.useState(start.name);
  const [hour, setHour] = React.useState(start.hour);
  const [cap, setCap] = React.useState(start.cap);
  const [gap, setGap] = React.useState(start.gap);
  const [cadence, setCadence] = React.useState(start.cadence);
  // Per message: what fills each slot, and the words typed into it.
  const [fills, setFills] = React.useState(start.fills);
  const [typed, setTyped] = React.useState(start.typed);
  const [listId, setListId] = React.useState(start.listId === undefined ? null : start.listId);
  const [cls, setCls] = React.useState(start.cls || "campaign");
  // What the sheet holds, against what it opened as: changed, it is kept in the tab, and Cancel asks first.
  const held = { trigger, tplId, picked, name, hour, cap, gap, cadence, listId, cls, fills, typed };
  const work = window.useUnsavedWork("playbook", draftKey, { value: held, dirty: JSON.stringify(held) !== JSON.stringify(opened), onLeave: onCancel });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const canEdit = !!(window.canDo && window.canDo("approve"));

  const trig = triggers.find((t) => t.id === trigger) || null;
  const visits = !!(trig && trig.kind === "visit");
  // A playbook on one of the workspace's lists: which one, with the list's own count (the route's "list:<id>" pool).
  const onList = !!(trig && trig.kind === "saved");
  const lists = data.lists || PB_NONE;
  const list = onList ? lists.find((l) => l.id === listId) || null : null;
  const link = !!data.bookingLink;
  // What each slot of a message may take on a moment -- a visit's time and service on a visit, a proposal's link on
  // the follow-up (0006) -- or null when one of them can take nothing there.
  const slotsOf = (t, m = trig) => (S && S.slots ? S.slots(t, { visits: !!(m && m.kind === "visit"), bookingLink: link, proposal: !!(m && m.kind === "deal") }) : (Array.isArray(t.variables) ? t.variables : PB_NONE).map(() => PB_TEXT));
  const usable = offered.sendable.filter((t) => slotsOf(t) !== null);
  // One entry per message, whatever languages it has: the language is its own control.
  const groups = S && S.group ? S.group(usable) : usable.map((t) => ({ name: t.name, title: pbTitle(t.name), rows: [t], labels: {} }));
  const rowIn = (g, lang) => (g ? g.rows.find((r) => r.language === lang) || g.rows.find((r) => r.language === "en_US") || g.rows[0] : null);
  // The moment's own message: approved and picked for you, in review at
  // WhatsApp, or not added yet -- one press adds it.
  const starter = S ? window.__starters.forTrigger(trigger) : null;
  const starterGroup = starter ? groups.find((g) => g.name === starter.name) || null : null;
  const starterAny = starter ? (window.__TEMPLATES_ALL || PB_NONE).find((t) => t.name === starter.name) || null : null;
  const tpl = picked ? usable.find((t) => t.id === tplId) || null : rowIn(starterGroup, null);
  // A playbook being changed whose message is no longer one it can send: said, never swapped for another behind its back.
  const lost = !!(editing && picked && tplId === editing.template_id && !tpl);
  const group = tpl ? groups.find((g) => g.name === tpl.name) || null : null;
  const addStarter = async () => {
    if (!window.__templates || !window.__templates.addStarters || !starter || adding) return;
    setAdding(true);
    setError(null);
    const r = await window.__templates.addStarters({ keys: [starter.key], languages: ["en_US"] });
    setAdding(false);
    if (!r.ok) setError(r.message || "It could not be added.");
  };

  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : PB_NONE;
  const choices = tpl ? slotsOf(tpl) || PB_NONE : PB_NONE;
  const labels = tpl && S ? S.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const SRC = (S && S.sources) || { text: "Type it" };
  const HINTS = (S && S.sourceHints) || {};
  // A slot's source: the one chosen when this slot may take it, else its first (a stored one a slot may not take is not kept).
  const srcOf = (i) => { const c = choices[i] || PB_TEXT; const s = ((tpl && fills[tpl.id]) || PB_NONE)[i]; return c.includes(s) ? s : c[0]; };
  const textOf = (i) => (((tpl && typed[tpl.id]) || PB_NONE)[i] || "");
  const setText = (i, v) => setTyped((p) => { const next = [...(p[tpl.id] || [])]; next[i] = v; return { ...p, [tpl.id]: next }; });
  const chooseFill = (i, kind) => {
    const was = srcOf(i);
    setFills((f) => { const next = vars.map((_, j) => ((f[tpl.id] || PB_NONE)[j] || srcOf(j))); next[i] = kind; return { ...f, [tpl.id]: next }; });
    // Typing over the business name starts from it.
    if (kind === "text" && was === "business_name" && !textOf(i).trim() && data.businessName) setText(i, data.businessName);
  };
  const shown = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() || `[${labels[i]}]` : pbExample(srcOf(i), data.businessName)));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() : { kind: srcOf(i) }));
  const missing = vars.findIndex((v, i) => srcOf(i) === "text" && !textOf(i).trim());
  const ready = !!trig && !!tpl && missing < 0 && !busy && (!onList || !!list);

  // The name the route gives it when it is given none, said before it is saved.
  const auto = trig && tpl && window.__playbookName ? window.__playbookName(trig, tpl) : trig ? trig.label : "New playbook";
  const title = name === null ? auto : name;

  // Who it reaches today: the moment's own count, or this playbook's while it
  // keeps its moment, with the cap as it is set here -- the cards' bar and the
  // approval sheet's reasons (contracts reachLines), before anything is saved.
  const monthly = trigger === "everyone_monthly";
  const base = onList
    ? { candidates: list ? list.candidates || 0 : 0, held: list ? list.held || 0 : 0 }
    : editing && editing.trigger === trigger ? { candidates: editing.candidates || 0, held: editing.held || 0 } : { candidates: trig ? trig.candidates || 0 : 0, held: trig ? trig.held || 0 : 0 };
  const named = onList ? (list && list.named) || null : (editing && editing.trigger === trigger && editing.named) || (trig && trig.named) || null;
  // Who the moment reaches could not be counted (the server's read failed): no count is drawn, as on the cards.
  const counted = named !== null && (onList ? !!list && list.candidates !== null : editing && editing.trigger === trigger ? editing.candidates !== null : !!trig && trig.candidates !== null);
  const capN = Math.max(1, Number(cap) || 1);
  const overCap = visits ? 0 : Math.max(0, base.candidates - capN);
  const will = base.candidates - overCap;
  const pool = Math.max(will + base.held, named ? named.pool : base.candidates + base.held);
  const reasons = named && window.__reachLines
    ? window.__reachLines({ pool: named.pool, will, noNumber: named.noNumber, stopped: named.stopped, noYes: named.noYes, heardThis: 0, heardAny: base.held, overCap, overLimit: 0 }, { trigger, cap_per_run: capN, gap_days: Number(gap), cadence_days: Number(cadence) }).lines.slice(0, 3).map((l) => ({ t: l.words, tone: l.tone, door: l.door }))
    : [base.held > 0 && { t: `${base.held} heard from a playbook this week`, tone: "warn" }, overCap > 0 && { t: `${overCap} wait for the next run — ${capN} a run`, tone: "plain" }].filter(Boolean);
  const of = window.__poolWords ? window.__poolWords(trigger) : null;

  // A moment moved to keeps the message the owner chose when it can send it; one it cannot gives way to that moment's own.
  const chooseMoment = (id) => {
    if (id === trigger) return;
    const t = triggers.find((x) => x.id === id) || null;
    if (picked && tpl && slotsOf(tpl, t) === null) setPicked(false);
    setTrigger(id);
  };
  const chooseMessage = (id) => {
    const r = rowIn(groups.find((g) => g.name === id) || null, tpl ? tpl.language : null);
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };
  const chooseLanguage = (lang) => {
    const r = group ? group.rows.find((x) => x.language === lang) : null;
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };

  const save = async () => {
    if (!window.__playbooks || !ready) return;
    setBusy(true);
    setError(null);
    // A list by its token: one of People's is its id (list_key), one of the workspace's own its list (list_id).
    const onWhich = onList && listId ? (listId.startsWith("seg:") ? { list_key: listId.slice(4) } : { list_id: listId.slice(5) }) : {};
    const body = { name: name === null || !name.trim() ? null : name.trim(), trigger, ...onWhich, ...(onList ? { policy_class: cls } : {}), template_id: tpl.id, params: specs, run_hour: Number(hour), cap_per_run: capN, gap_days: Number(gap), cadence_days: Number(cadence) };
    const r = editing ? await window.__playbooks.update(editing.id, body) : await window.__playbooks.create(body);
    setBusy(false);
    if (!r.ok) { setError(r.message || "It could not be saved."); return; }
    work.done();
    onDone(r.data, !!editing);
  };

  const momentChoices = triggers.map((t) => ({ id: t.id, label: t.label, sub: t.hint, icon: pbIcon(t.id), hint: t.candidates === null ? null : t.candidates > 0 ? `${t.candidates} today` : "nobody today" }));
  const messageChoices = groups.slice().sort((a, b) => (starter ? (b.name === starter.name) - (a.name === starter.name) : 0)).map((g) => {
    const r = rowIn(g, tpl ? tpl.language : null);
    return {
      id: g.name,
      label: g.title,
      // Its first words as a customer reads them, so a message is chosen by what it says.
      sub: S && S.rowPreview ? S.rowPreview(r, { business_name: data.businessName, booking_link: link ? "your booking link" : null }) : String(r.body_preview || ""),
      group: starter && g.name === starter.name ? "own" : "all",
      hint: g.rows.length > 1 ? `${g.rows.length} languages` : null,
    };
  });
  const langChoices = group ? group.rows.map((r) => ({ id: r.language, label: pbLabel(r.language), name: pbLangWords(r.language), status: r.meta_status || "approved" })) : PB_NONE;
  const city = window.__clock && window.__clock.city ? window.__clock.city() : data.timezone;
  // The Autonomy row its runs keep to, said by the one chip (PolicyChip) -- and not said at all where there is no row to name.
  const policyRow = trig && window.POLICY && window.POLICY.row ? window.POLICY.row(trig.cls) : null;
  const repeat = monthly ? cadence : gap;
  const say = error ? { tone: "danger", t: error }
    : !trig ? { tone: "plain", t: "Pick the moment it runs on." }
    : !tpl ? { tone: "plain", t: "Pick the message it sends." }
    : missing >= 0 ? { tone: "plain", t: `Fill in “${labels[missing]}” to ${editing ? "save it" : "start it"}.` }
    : null;

  return (
    <window.RecordSheet
      id="playbook"
      testid="pb-composer"
      className="pb-sheet"
      title={(
        <span className="pb-title-wrap">
          <input className="pb-title" value={title} placeholder={auto} onChange={(e) => setName(e.target.value)} maxLength={80} spellCheck={false} aria-label="The playbook's name" data-testid="pb-name" />
          <Icon name="pencil" size={13} />
        </span>
      )}
      sub={editing ? "A change counts from its next run." : "One approved message, to the people a moment names who said yes — each on its own clock. Replies land in the Inbox."}
      onClose={work.leave}
      closeLabel="Cancel"
      foot={(
        <div className="pb-foot">
          {/* Cancel, and Escape, with something changed: the one question first (UnsavedAsk), where the buttons were. */}
          {work.asking ? <window.UnsavedAsk onYes={work.discard} onNo={work.stay} what="saved" testid="pb-leave" /> : (
            <>
              <span className="pb-foot-say" data-tone={say ? say.tone : undefined} role={error ? "alert" : undefined} data-testid={error ? "pb-error" : "pb-foot-say"}>{say ? say.t : null}</span>
              <button type="button" className="btn" onClick={work.leave} data-testid="pb-cancel">Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!ready} onClick={save} data-testid="pb-save">{busy ? "Saving…" : editing ? "Save changes" : "Start it"}</button>
            </>
          )}
        </div>
      )}
    >
      <div className="pb-compose">
        <section className="pb-sec" data-testid="pb-who">
          <span className="pb-sec-k">Who it's for</span>
          <window.CmPicker
            value={trigger}
            choices={momentChoices}
            onPick={chooseMoment}
            label="The moment it runs on"
            search={false}
            fit="trigger"
            triggerClass="pb-pick"
            face={trig ? (
              <>
                <span className="pb-pick-mark" aria-hidden="true"><Icon name={pbIcon(trig.id)} size={15} /></span>
                <span className="pb-pick-text"><span className="pb-pick-title">{trig.label}</span><span className="pb-pick-sub">{trig.hint}</span></span>
              </>
            ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a moment</span></span>}
            testid="pb-moment"
          />
          {/* Which list it runs on (decision 0009): one of People's, or one of the workspace's own, kept by hand or by a
              rule. A list about whoever is looking is never offered: a run has no one looking. */}
          {onList && (lists.length ? (
            <window.CmPicker
              value={listId}
              choices={lists.map((l) => ({ id: l.id, label: l.name, group: l.builtin ? "people" : "own", sub: pbListSub(l), icon: l.builtin || l.smart ? "sparkle" : "filter", hint: l.candidates === null || l.candidates === undefined ? null : l.candidates > 0 ? `${l.candidates} today` : "nobody today" }))}
              groups={PB_LIST_GROUPS}
              onPick={setListId}
              label="The list it runs on"
              search={lists.length > 8}
              fit="trigger"
              triggerClass="pb-pick"
              face={list ? (
                <>
                  <span className="pb-pick-mark" aria-hidden="true"><Icon name={list.builtin || list.smart ? "sparkle" : "filter"} size={15} /></span>
                  <span className="pb-pick-text"><span className="pb-pick-title">{list.name}</span><span className="pb-pick-sub">{pbListSub(list)}</span></span>
                </>
              ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a list</span></span>}
              testid="pb-list"
            />
          ) : <p className="pb-warn" data-testid="pb-no-lists">Keep a list on People first — by hand, or describe who and it keeps itself current.</p>)}
          {/* What a playbook on a list sends, and so which row of Autonomy governs it: an offer, or a win-back. */}
          {onList && (
            <window.CmPicker
              value={cls}
              choices={PB_LIST_CLASSES}
              onPick={setCls}
              label="What it sends"
              fit="trigger"
              triggerClass="pb-pick"
              face={
                <span className="pb-pick-text"><span className="pb-pick-title">{(PB_LIST_CLASSES.find((c) => c.id === cls) || PB_LIST_CLASSES[0]).label}</span><span className="pb-pick-sub">{(PB_LIST_CLASSES.find((c) => c.id === cls) || PB_LIST_CLASSES[0]).sub}</span></span>
              }
              testid="pb-list-class"
            />
          )}
          {trig && counted && <window.CmReach will={will} pool={pool} of={of} held={base.held} reasons={reasons} size="sm" testid="pb-reach" />}
          {visits && data.calendar !== "ok" && <p className="pb-warn" data-testid="pb-calendar">A visit moment reads the calendar: connect it in Settings › Business before a run can send.</p>}
        </section>

        <section className="pb-sec" data-testid="pb-message">
          <span className="pb-sec-k">What it says</span>
          {usable.length > 0 && (
            <div className="pb-msg-head">
              <window.CmPicker
                value={group ? group.name : null}
                choices={messageChoices}
                groups={{ own: "Written for this moment", all: starterGroup ? "Your other messages" : "Your messages" }}
                onPick={chooseMessage}
                label="The message it sends"
                search={messageChoices.length > 7}
                searchWords={{ placeholder: "Search messages", empty: (q) => <>No message called “{q}”</> }}
                note={offered.why}
                fit="trigger"
                triggerClass="pb-pick pb-pick-msg"
                face={tpl ? (
                  <span className="pb-pick-text">
                    <span className="pb-pick-title">{group ? group.title : pbTitle(tpl.name)}</span>
                    <span className="pb-pick-sub">{starter && tpl.name === starter.name ? "Written for this moment" : "Your message"}</span>
                  </span>
                ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a message</span><span className="pb-pick-sub">{groups.length === 1 ? "One approved message fits this moment" : `${pbSpell(Math.min(groups.length, 12), true)} approved messages fit this moment`}</span></span>}
                testid="pb-template"
              />
              {tpl && (
                <window.LanguagePicker
                  value={tpl.language}
                  choices={langChoices}
                  onPick={chooseLanguage}
                  status={tpl.meta_status || "approved"}
                  tag={pbShort(tpl.language)}
                  label="The language it goes out in"
                  search={false}
                  note={langChoices.length < 2 ? "A run sends one language to everyone on it. Another is written in Campaigns › Templates." : "A run sends one language to everyone on it."}
                  testid="pb-lang"
                />
              )}
            </div>
          )}
          {!tpl && (
            <div className="pb-empty" data-testid="pb-message-empty">
              {!templatesRead && <FailedRead kind="line" what="your templates" surface="playbooks" testid="pb-templates-failed" />}
              {lost && <p className="pb-empty-line is-warn" data-testid="pb-template-lost">Its message, {pbTitle(editing.template_name)}, is not one it can send any more — WhatsApp no longer approves it. Pick another to save a change.</p>}
              {templatesRead && starter && !starterGroup && (
                <p className="pb-empty-line" data-testid="pb-starter">
                  <Icon name="sparkle" size={12} />
                  <span>
                    {starterAny
                      ? <><b>{starter.title}</b>, written for this moment, {starterAny.meta_status === "pending" ? "is in review at WhatsApp — it appears here once approved, usually within minutes." : `is ${starterAny.meta_status} at WhatsApp — see Campaigns › Templates.`}</>
                      : <>
                          <b>{starter.title}</b> is written for this moment.{" "}
                          {canEdit && window.__templates && window.__templates.addStarters
                            ? <button type="button" className="cl-bucket-link" disabled={adding} onClick={addStarter} data-testid="pb-add-starter">{adding ? "Adding…" : "Add it — WhatsApp reviews it, usually within minutes"}</button>
                            : null}
                        </>}
                  </span>
                </p>
              )}
              {templatesRead && usable.length === 0 && (
                <p className="pb-empty-line" data-testid="pb-no-template">No approved message {starter ? "for this moment " : ""}yet — write one, or sync yours from WhatsApp Manager, in <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("messages")} data-testid="pb-no-template-open">Templates</button>.</p>
              )}
            </div>
          )}
          {/* No stamp: a playbook knows the hour it runs at, not the instant its
              next run lands, and the sentence below says the hour in words. */}
          {tpl && <div className="pb-preview" data-testid="pb-preview"><window.MessagePreview from={data.businessName} body={tpl.body_preview} values={shown} header={tpl.header} footer={pbFooter(tpl)} buttons={tpl.buttons} /></div>}
          {tpl && vars.length > 0 && (
            <div className="pb-fills" data-testid="pb-vars">
              {vars.map((v, i) => {
                const src = srcOf(i);
                const c = choices[i] || PB_TEXT;
                const hint = src !== "text" ? HINTS[src] : null;
                return (
                  <div key={v.position || i} className={`pb-fill${src === "text" ? " is-typed" : ""}`} data-kind={src} data-testid="pb-fill">
                    <span className="pb-fill-key" id={`pb-fill-${i}`}>{labels[i]}</span>
                    {src === "text"
                      ? <input className="pb-fill-input" value={textOf(i)} placeholder={c[0] === "business_name" ? data.businessName || "" : v.example ? String(v.example) : ""} maxLength={1024} onChange={(e) => setText(i, e.target.value)} aria-labelledby={`pb-fill-${i}`} data-testid="pb-fill-input" />
                      : (
                        <span className="pb-fill-val" data-tip={hint || undefined}>
                          <span className="pb-fill-words">{src === "business_name" && data.businessName ? data.businessName : SRC[src] || src}</span>
                          {hint && <span className="pb-fill-hint">{hint}</span>}
                        </span>
                      )}
                    {c.length > 1 && (
                      <span className="pb-fill-src" data-tip="What fills it">
                        <Icon name={src === "text" ? "pencil" : "chevrons"} size={12} />
                        <select value={src} onChange={(e) => chooseFill(i, e.target.value)} aria-label={`What fills ${labels[i]}`} data-testid="pb-fill-source">
                          {c.map((k) => <option key={k} value={k}>{SRC[k] || k}</option>)}
                        </select>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="pb-sec" data-testid="pb-clock">
          <span className="pb-sec-k">When it runs</span>
          <p className="pb-when">
            Every day at <PbTok value={hour} options={pbHours().map((h) => ({ v: h, t: pbHour(h) }))} onChange={setHour} label="The hour it runs at" testid="pb-hour" />{city ? ` ${city} time` : ""}
            {visits
              ? <>, to {trigger === "visit_tomorrow" ? "everyone with a visit the next day" : "everyone who came in the day before"} — one message per visit.</>
              : <>
                  , up to <PbTok value={cap} options={pbWith(PB_CAPS, Number(cap)).map((n) => ({ v: n, t: String(n) }))} onChange={setCap} label="The most one run sends" testid="pb-cap" /> {Number(cap) === 1 ? "person" : "people"} a run.{" "}
                  {/* A follow-up is owed once per proposal (0006): there is no gap to choose. */}
                  {trig && trig.kind === "deal"
                    ? <>One message per proposal.</>
                    : <>No one hears it more than once every <PbTok value={repeat} options={pbWith(monthly ? PB_CADENCES : PB_GAPS, Number(repeat)).map((n) => ({ v: n, t: `${n} days` }))} onChange={monthly ? setCadence : setGap} label={monthly ? "How often the same person hears it" : "The days before the same person hears it again"} testid="pb-gap" />.</>}
                </>}
          </p>
          <div className="pb-rules-line">
            {policyRow && <span className="pb-runs-under" data-testid="pb-runs-under"><span>Runs under</span><PolicyChip cls={trig.cls} /></span>}
            <span className="pb-guard" tabIndex={0} data-tip={pbGuardWords(trig && trig.kind)} aria-description={pbGuardWords(trig && trig.kind)} data-testid="pb-guard"><Icon name="shield" size={12} /> Guardrails</span>
          </div>
        </section>

        {data.number && data.number.present && !data.number.health.canSend && <p className="pb-warn" data-testid="pb-number">{data.number.health.refusal}</p>}
        {data.number && !data.number.present && <p className="pb-warn" data-testid="pb-number">No WhatsApp number connected — connect one in Settings › Connections before a run can send.</p>}
      </div>
    </window.RecordSheet>
  );
};

// Drawn on its own by campaigns-drafts.test.mjs (a slot pressed over a draft: the stub cannot remount on a key).
Object.assign(window, { PlaybookComposer });
