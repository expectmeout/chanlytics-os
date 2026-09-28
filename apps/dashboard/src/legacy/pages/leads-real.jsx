/* global React, LEAD_COLUMNS, LEAD_PHONE_COLUMNS, LeadsScope, leadPeekEscape, leadPeekFollows, leadPeekFocus, leadArmOnReturn, usePeople, usePlControls, usePlPlace, railToggle, plScopeRoute */
// Chanlytics -- People › Leads, the real surface: LeadsReal and what only it reads. Moved whole from clients-a.jsx
// (Reach out Part 2.5), whose ClientsA draws it. It reads People's hooks (usePeople, usePlControls, usePlPlace) from
// window when it draws, since clients-a.jsx loads after it.
const { useState } = React;

/** The viewer's Values ⁄ Signals choice, read in a try: a private window or blocked storage answers Signals. */
const ldValuesPref = () => { try { return !!window.localStorage && window.localStorage.getItem("leads.values") === "1"; } catch (e) { return false; } };

// A cell context for the Leads scope that changes only when a value a cell draws from changes. The doors go to the
// page's latest closures through `acts`, so the object itself is kept across draws (in `kept`) and a memoised row
// handed it is left alone. People's rows ride in it (a converted lead's Client pill reads the person's deal, 0004):
// publishPeople builds a fresh array each time People lands, so the context is new then and the rows redraw -- on a
// cold load of Leads the rows paint before the people, and a row that read the global would say Converted until a
// sort or a search drew it again. `stageShown` is whether the Stage column is drawn: then it says each lead's state,
// and the name's tag gives way (leads-cells.jsx ldBusinessCell), so a row says it once.
const leadCellCtxFor = (acts, kept, values, mixedFits, hasCenter, canFind, peopleRows, stageShown = false) => {
  const k = kept.current;
  if (k && k.values === values && k.mixedFits === mixedFits && k.hasCenter === hasCenter && k.canFind === canFind && k.peopleRows === peopleRows && k.stageShown === stageShown) return k.ctx;
  const door = (name) => (id) => acts.current[name](id);
  const ctx = {
    onOpen: door("onOpen"), onExpand: door("onExpand"),
    values, mixedFits, hasCenter, canFind, peopleRows, stageShown,
    onCall: door("onCall"), onCopy: door("onCopy"), onCopyPhone: door("onCopyPhone"), onLogCall: door("onLogCall"),
    // The row under a pointer or a finger, or reached by Tab (people-table.jsx): its photo is asked for before a press.
    onWarm: door("onWarm"),
    onKeep: door("onKeep"), onExclude: door("onExclude"), onPutBack: door("onPutBack"),
  };
  kept.current = { values, mixedFits, hasCenter, canFind, peopleRows, stageShown, ctx };
  return ctx;
};

// The owner's own clipboard and the owner's own phone: a lead is emailed from their inbox and called from their
// handset, and nothing is sent from here (PRD 0.4).
const plCopy = (text) => { try { if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text); } catch { /* a browser that will not */ } };

const plDial = (tel) => { window.location.href = `tel:${tel}`; };

const PL_NO_LEADS = {
  searches: [], counts: { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }, rows: [], next: null,
  offered: 0, view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads", suggestions: null, peeked: [], tz: "UTC", readFailed: false, fetchedAt: 0,
};

// The Leads surface (legacy-bridge/leads.ts): the searches, the counts, the rows of one view, how many a refresh
// found and is holding back, and the first day's suggestions. Its own event, so a People refresh does not
// re-render Leads and the other way round.
const useLeads = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:leads", bump);
    return () => window.removeEventListener("surface:leads", bump);
  }, []);
  return window.__LEADS || PL_NO_LEADS;
};

/* ------------------------------------------------------------------------------- Leads */
// The Leads scope's state lives here: every component of the scope is hookless, from its rail to its bulk bar
// (leads-scope.jsx), and everything it needs is a prop. LeadsReal holds it through the hooks below, one concern each,
// called in the order it always called its hooks; its acts are plain functions over the draw's state; and what it hands
// LeadsScope comes from the five builders at the foot of the file, in the order it always handed it over.

// Which search, which list and which class this address names (contracts parseLeadsRoute, through the courier).
// The address is the one place the Leads view's list lives, so the rail, the table and the saved view agree.
const leadsViewAt = (leadsRoute) => {
  const leadView = window.__leadsRouteParse ? (window.__leadsRouteParse(leadsRoute || "clients/leads") || { searchId: null, list: "all", cls: null, chips: {}, peek: null }) : null;
  // The view's own route, with no lead open over it, and the lead the address names. The page stays mounted across
  // its views (its route row's `mount`, app-routes.jsx), so what belongs to a view follows `viewRoute`, never
  // `leadsRoute`: a lead opened over a view is the same view, and must not read it again or drop what is selected.
  const viewRoute = leadView && window.__leadsRouteOf ? window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls }) : null;
  const addrPeek = (leadView && leadView.peek) || null;
  // The rail's row, as a name of its own: what a saved view carries and what a read is keyed by, and a name a
  // dependency array can be checked against (an expression in one cannot).
  const leadList = leadView ? leadView.list : null;
  return { leadView, viewRoute, addrPeek, leadList };
};

// The plan panel's state (Tasks 9, 10; spec F5): whether it is open and at which stage, the words, the card an answer
// brought back (`proposal`), what was refused, the plan the card shows and the owner is editing, the trace line while
// Claude reads, which of the sentence's words has its picker open (`pick`), and whose round a plan opened from a
// strip's next step belongs to (`more`): `answer: true` answers the question that is still waiting, else it is another
// round on the same search (Task 10 step 6). A plan opens one way, with everything the card shows at once and the last
// card's refusal and picker gone, and the panel closes one way; between, the panel and the amend turn set a field at a
// time. A move that changes nothing keeps the state, as a setter handed the value it holds did.
const LEAD_FINDER_SHUT = { open: false, stage: "compose", words: "", proposal: null, refusal: null, plan: null, trace: null, pick: null, more: null };
const leadFinderStep = (f, move) => {
  const next = move.open
    ? { ...f, ...move.open, open: true, refusal: null, pick: null }
    : move.close
      ? { ...f, open: false, more: null }
      : { ...f, ...move.set };
  return Object.keys(next).every((k) => Object.is(next[k], f[k])) ? f : next;
};
// The moves: open a plan (`{ stage, words, proposal, plan, more }`), close the panel, and set fields.
const leadFinderMoves = (moveFinder) => ({
  openFinder: (card) => moveFinder({ open: card }),
  closeFinder: () => moveFinder({ close: true }),
  setFinder: (fields) => moveFinder({ set: fields }),
});

// The page's own state.
const useLeadsState = () => {
  // The phone's list picker: the rail, as a sheet.
  const [listsOpen, setListsOpen] = useState(false);
  const [peekId, setPeekId] = useState(null);
  // The plan panel, one state and three moves on it (leadFinderStep, above).
  const [finder, moveFinder] = React.useReducer(leadFinderStep, LEAD_FINDER_SHUT);
  // The first day's "Not right? Change it" (Task 17): the line the owner is
  // rewriting, or null when the form is closed. Saving it keeps the line with
  // no items, so the read that follows asks Claude again -- which is the only
  // control that renews the suggestions, and why their age is never drawn.
  const [leadLine, setLeadLine] = useState(null);
  // The five whys, asked once for a whole selection (Task 15).
  const [bulkWhy, setBulkWhy] = useState(false);
  // The peek's own pane ("info" while it is just showing the lead; "why" and "draft" are Tasks 15 and 13) and
  // the draft it is holding.
  const [peekMode, setPeekMode] = useState("info");
  const [draft, setDraft] = useState(null);
  // "Did you send it?" after a draft, "How did the call go?" after a call:
  // { kind: "sent" | "call", leadId, asked, outcome, note }. `asked` turns true only once the tab is theirs
  // again (leadArmOnReturn, Task 13), so nothing is asked while they are away.
  const [armed, setArmed] = useState(null);
  // D5: the row's Values ⁄ Signals choice (kept per viewer, read in a try: a private window may refuse), the photo
  // expanded, and the band's fit filter.
  const [values, setValues] = useState(ldValuesPref());
  const [lightboxId, setLightboxId] = useState(null);
  const [fitChip, setFitChip] = useState(null);
  const [benchGroup, setBenchGroup] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPick, setMapPick] = useState(null);

  // One criterion of the Excluded view, from the chips at its head.
  const [chip, setChip] = useState(null);
  // The search being renamed, and the one being removed: each asked where the search is, on the rail.
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [leadBusy, setLeadBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  return {
    listsOpen, setListsOpen, peekId, setPeekId, finder, ...leadFinderMoves(moveFinder), leadLine, setLeadLine, bulkWhy, setBulkWhy,
    peekMode, setPeekMode, draft, setDraft,
    armed, setArmed, values, setValues, lightboxId, setLightboxId, fitChip, setFitChip, benchGroup, setBenchGroup, mapOpen, setMapOpen,
    mapPick, setMapPick, chip, setChip, renaming, setRenaming, removing, setRemoving, leadBusy, setLeadBusy, removeError, setRemoveError,
  };
};

// One read per view (PRD 0.5, the review's E8): the address says which search, list and class, and this
// member's own view says the sort. Every key goes at once, and the surface drops an answer a newer ask
// supersedes, so a slow page of the old view never lands on the new one.
const useLeadsRead = ({ leadView, viewRoute, sortBy, sortDir, plFlash }) => {
  React.useEffect(() => {
    if (!window.__leadsView) return;
    window.__leadsView({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, chips: leadView.chips, sort: sortBy, dir: sortDir });
  }, [viewRoute, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  // The next page, its own flag, so the button says Loading… while THIS is out and not while a Keep is (it read
  // leadBusy), and a second press while it loads asks for nothing.
  const [leadsMoreBusy, setLeadsMoreBusy] = useState(false);
  const leadsMore = async () => {
    if (!window.__leadsMore || leadsMoreBusy) return;
    setLeadsMoreBusy(true);
    try { await window.__leadsMore(); } catch (e) { plFlash(window.refusalToast({ message: e && e.message }, "No more leads loaded")); } finally { setLeadsMoreBusy(false); }
  };
  return { leadsMoreBusy, leadsMore };
};

// The leads loaded, filtered at once by the box (their name, their kind and their area) and by one criterion
// of the Excluded view. A sentence is not sent anywhere: words to chips is release C.
const useLeadRows = ({ leads, q, chip, fitChip, leadView, viewRoute, sortBy, sortDir }) => {
  const leadShown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = leads.rows;
    if (chip) list = list.filter((l) => l.excludedBy === chip);
    if (fitChip) list = list.filter((l) => l.fit === fitChip);
    if (!needle) return list;
    return list.filter((l) => l.name.toLowerCase().includes(needle) || (l.category || "").toLowerCase().includes(needle) || (l.area || "").toLowerCase().includes(needle));
  }, [leads.rows, q, chip, fitChip]);
  const filtered = !!q.trim() || !!chip || !!fitChip || !!leadView.cls || leadView.list !== "all";
  const shownIds = leadShown.map((r) => r.id);
  // The surface holds the view the address names, in the order this page asked for: a sort is a read too (never the
  // page's to re-order; leads_page's order is the one rule), and the rows on screen are the old order until it lands.
  const viewLanded = leads.route === viewRoute && leads.view.sort === sortBy && leads.view.dir === sortDir;
  return { leadShown, filtered, shownIds, viewLanded };
};

// The peek (D5, Task 12): its deck, the photos either side of it, the cursor it follows, the question it asks once the
// owner is back, and where focus goes as it opens and closes.
const useLeadPeek = ({ peekId, setPeekId, shownIds, leadShown, cursor, setCursor, peekMode, armed, setArmed }) => {
  // The peek's deck (D5): the lead before or after the one open, by the order on screen. It moves the cursor too,
  // so the rows behind it follow and the keyboard carries on from where the thumb left off.
  const deckMove = (step) => {
    const i = shownIds.indexOf(peekId);
    const to = shownIds[step > 0 ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1)];
    if (!to || to === peekId) return;
    setCursor(to);
    setPeekId(to);
  };
  // The photos either side of the lead open are asked for now, so the deck, a swipe, and J and K find them there.
  React.useEffect(() => {
    if (!peekId || !window.leadPhotoWarm) return;
    const i = shownIds.indexOf(peekId);
    if (i < 0) return;
    for (const j of [i + 1, i - 1]) {
      const r = leadShown[j];
      if (r && r.tile) window.leadPhotoWarm(r.tile.band);
    }
  }, [peekId, shownIds.length]);
  // The peek follows the row cursor while it is open, so J and K walk the leads behind it -- unless it is asking
  // a question or holding a draft, which keeps it on its own lead (leadPeekFollows, leads-peek.jsx, Task 12).
  React.useEffect(() => {
    if (!peekId || !cursor || cursor === peekId || !leadPeekFollows(peekMode, armed)) return;
    setPeekId(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  // The owner left for their own mail app or their own phone; the peek asks how it went only once they are back
  // (leadArmOnReturn, leads-peek.jsx). Nothing is asked while the tab is hidden, and the listeners go with the arming.
  React.useEffect(() => leadArmOnReturn(armed, setArmed), [armed && armed.kind, armed && armed.leadId, armed && armed.asked]);
  // The dialog's focus rule (leadPeekFocus): focus moves into the peek when it opens and back to the row when it
  // closes, and the row is the cursor, so Tab carries on from where the owner was.
  React.useEffect(() => { leadPeekFocus(peekId, cursor); }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  return deckMove;
};

// The lead that is open is part of the address (contracts leadsRoute, `p-`): a refresh keeps it, Back closes it, and
// it can be sent to someone. The page's own state still draws the peek; this keeps the two saying one thing.
// When the ADDRESS moved -- a link, Back or Forward, a rail pick, the first draw -- the page follows it, and a view
// that changed under an open lead closes it. When the PAGE moved, it says so: opening pushes an entry, the cursor
// walking the peek on replaces it, and closing goes back to the entry the opening made. A lead that came with the
// address has no entry of the page's behind it, so it closes by replacing: going back would leave Leads.
const useLeadPeekAddress = ({ leadView, viewRoute, addrPeek, peekId, setPeekId, setCursor, setPeekMode, setArmed, setDraft, nav }) => {
  const peekAddr = React.useRef({ view: undefined, peek: undefined, asked: null, pushed: false });
  React.useEffect(() => {
    if (!window.__leadsRouteOf) return;
    const a = peekAddr.current;
    if (a.view !== viewRoute || a.peek !== addrPeek) {
      a.view = viewRoute;
      a.peek = addrPeek;
      a.asked = null;
      if (!addrPeek) a.pushed = false;
      // The lead the address names takes the cursor too: the cursor this tab kept for the view (usePlPlace) would
      // otherwise walk the peek, and the address, off it on the next draw.
      if (peekId !== addrPeek) { setPeekId(addrPeek); if (addrPeek) setCursor(addrPeek); setPeekMode("info"); setArmed(null); setDraft(null); }
      return;
    }
    if (peekId === addrPeek) return;
    const want = window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, peek: peekId });
    // Said once: a push is answered a task later (hashchange), and every draw until then finds the address as it was.
    if (a.asked === want) return;
    a.asked = want;
    if (peekId && !addrPeek && !a.pushed) { a.pushed = true; nav(want); }
    else if (!peekId && a.pushed && window.history && window.history.back) { a.pushed = false; window.history.back(); }
    else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId]); // eslint-disable-line react-hooks/exhaustive-deps
};

/* ---------------------------------------------------- the Leads scope's acts */
// Every one goes through the courier the bridge installed (legacy-bridge/leads.ts): the route, then the
// surface patched in place. A toast says what happened and offers Undo through the operation the door
// answered, which is the only thing an undo names (the review's E9).
const leadActs = ({ leads, leadView, leadBusy, setLeadBusy, plFlash, setSel, setAllMatching, setArmed, setPeekMode, setPeekId, setBulkWhy }) => {
  const canFind = !window.canDo || window.canDo("find");
  // A lead the peek read on its own, on no page loaded (a link to it, or one far down a view), is looked up too, so
  // Keep, Call and Copy from its peek act on it rather than on nothing (legacy-bridge/leads.ts, PR 9).
  const leadById = (id) => leads.rows.find((l) => l.id === id) || (leads.peeked || []).find((l) => l.id === id) || null;
  const searchById = (id) => leads.searches.find((s) => s.id === id) || null;
  const leadUndo = (r) => (r.data && r.data.op_id
    ? { undo: async () => { const u = await window.__leadUndo(r.data.op_id, r.data.version); if (!u.ok) plFlash(window.refusalToast(u, "Nothing was put back")); } }
    : {});
  const leadAct = async (fn, said) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "That did not go through")); return; }
    plFlash({ msg: said, ...leadUndo(r) });
  };
  const searchOf = (l) => (leadView && leadView.searchId) || (l && l.searchId) || null;
  // Keep counts the place as Qualified the month it is kept; Exclude is free; Put back is the owner's override
  // of an exclusion, through the door that counts (PRD 8.7). Each names the search whose class it is in, which
  // is what release A's routes take ({ search_id }); the door answers the operation, and the toast offers it.
  // A selection's act (D3): the door's own sentence is the flash -- it says how many, and what stopped or skipped
  // part of it -- and the selection is spent.
  const leadSaid = async (fn) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "That did not go through")); return; }
    setSel(new Set());
    setAllMatching(false);
    plFlash({ msg: r.data.toast, ...leadUndo(r) });
  };
  const keepLead = (id) => leadAct(() => window.__leadKeep(searchOf(leadById(id)), id), <>Kept. It counts as a lead this month.</>);
  const excludeLead = (id) => leadAct(() => window.__leadExclude(searchOf(leadById(id)), id), <>Excluded. Nothing counted.</>);
  const putBackLead = (id) => leadAct(() => window.__leadPutBack(searchOf(leadById(id)), id), <>Put back. It counts as a lead now.</>);
  // The owner's own phone dials; coming back to the tab asks how it went (Task 14).
  // The owner's own phone dials, and the peek opens on that lead: "How did the call go?" and its six outcomes
  // are drawn there, so a call from a row and a call from the peek end in the same place (Task 14 step 4).
  const callLead = (id) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
    plDial(l.phone);
  };
  const copyLead = (id) => {
    const l = leadById(id);
    if (!l || !l.email) return;
    plCopy(l.email);
    plFlash({ msg: <>Copied <b>{l.email}</b></> });
  };
  // The peek's phone line copies the number as it dials (the stored number), and names it as the peek draws it
  // (contracts' formatPhoneDisplay, published as __phoneDisplay).
  // A call made from a desk phone, a softphone or a mobile that is not this one: the same six outcomes the button
  // arms, without ringing anybody. There was no way to record one, so those calls left no mark on the lead.
  const logLeadCall = (id) => {
    const l = leadById(id);
    if (!l) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
  };
  const copyPhone = (id) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    plCopy(l.phone);
    plFlash({ msg: <>Copied <b>{(window.__phoneDisplay && window.__phoneDisplay(l.phone)) || l.phone}</b></> });
  };
  // Copy emails says how many of the selection had none you can use, because a silent 12-of-15 is a lie.
  const copyEmails = (picked) => {
    const usable = picked.filter((l) => l.email && l.emailState !== "invalid");
    plCopy(usable.map((l) => l.email).join(", "));
    const none = picked.length - usable.length;
    plFlash({ msg: <>Copied {usable.length} email{usable.length === 1 ? "" : "s"}{none ? `; ${none} had none you can use` : ""}</> });
  };
  const bulkLeads = (body) => leadAct(() => window.__leadsBulk(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);
  // Not a fit, for everything selected: the same five whys the peek asks, asked once, one operation, one Undo
  // (Task 15 step 4). The why is the owner's pick; the route records not_a_fit for every row it touched.
  const bulkNotAFit = (why, body) => {
    setBulkWhy(false);
    // The pick closes the list; the body is the one LeadsBulkSchema takes, which carries no reason -- the route
    // records not_a_fit for every row it touched, and release C reads the why.
    return leadAct(() => window.__leadsBulk(body), <>Not a fit.</>);
  };
  return { canFind, searchById, leadUndo, leadAct, leadSaid, keepLead, excludeLead, putBackLead, callLead, copyLead, logLeadCall, copyPhone, copyEmails, bulkLeads, bulkNotAFit };
};

/* ---------------------------------------- the plan panel (Tasks 9, 10; spec F5) */
const leadFinderActs = ({ leadView, nav, plFlash, finder, openFinder, closeFinder, setFinder }) => {
  // What leadAnswerPlan and leadFinderApprove take (leads-finder.jsx): a setter for each field, the panel's one close
  // (closeFinder, which lets go of `more` as it shuts), and `more`, which says whose round an approval belongs to when
  // the plan was opened from a strip, and whether it answers its question.
  const field = (key) => (value) => setFinder({ [key]: value });
  const finderSet = {
    close: closeFinder, stage: field("stage"), words: field("words"), trace: field("trace"),
    refusal: field("refusal"), proposal: field("proposal"), plan: field("plan"), pick: field("pick"),
    more: finder.more,
  };
  const finderAnswer = (words) => window.leadAnswerPlan(words, finderSet);
  const finderApprove = async (plan) => {
    const answering = !!(finder.more && finder.more.answer);
    const r = await window.leadFinderApprove(finder.proposal, plan, finderSet);
    if (r && r.ok && answering) plFlash({ msg: <>Carrying on with your change.</> });
    // A new search lands the owner on it: the strip narrating the run, the
    // classes filling, the address the search's own. Without this they stayed
    // on All leads with a live dot in the rail and nothing saying what was
    // happening -- the receipt's "Leads shows it" was a promise the page had
    // not kept. A top-up or an answer is on a search already open, so it stays.
    const started = r && r.ok && r.undo && r.undo.search_id;
    if (started && !leadView.searchId && window.__leadsRouteOf) nav(window.__leadsRouteOf({ searchId: started, list: "all", cls: null }));
    return r;
  };
  // What answering a search's question carries (leadAnswerPlan, leadFinderApprove): the question, the search's
  // id and name, what was first asked and what it leaves out, and the Ask thread the search was planned in, so the
  // answer's one Ask turn lands there and amends the same search; the version and count are the route's.
  const answerOf = (s) => ({
    answer: true,
    threadId: s.thread_id || null,
    question: s.round && s.round.question ? s.round.question.sentence : "",
    name: s.name,
    asked: s.asked,
    leavingOut: (s.plan.exclusions || []).map((x) => x.text),
  });
  // Find leads is Ask on this page (spec F1, F2): the takeover on a phone, the Stage on a desktop. A suggestion's
  // words go into the field; the button and the F key open Ask as ⌘K does, keeping whatever the owner left in it
  // (a click event is not words).
  const openFind = (words) => {
    if (typeof words === "string" && words) window.askAbout({ mode: "compose", prompt: words });
    else if (window.appAsk) window.appAsk();
    else window.askAbout({});
  };
  // A next step opens the plan card with what would run; nothing starts until the owner approves it there.
  const openPlanFor = (s, plan, how) => {
    // Answering, the answer row behind the card (Change what I asked) is the owner's answer: what they first asked
    // sent back as the answer amended nothing. Otherwise the words are what was asked, for Ask's field (onFinderBack).
    openFinder({ stage: "plan", words: how === "answer" ? "" : s.asked, proposal: null, plan, more: { searchId: s.id, purpose: "topup", ...(how === "answer" ? answerOf(s) : { answer: false }) } });
  };
  return { finderAnswer, finderApprove, answerOf, openFind, openPlanFor };
};

// A kept search's own acts, and the first day's line: each through its door, the toast saying what happened.
const leadSearchActs = ({ leads, nav, plFlash, leadBusy, setLeadBusy, leadUndo, leadAct, searchById, setRenaming, setRemoving, setRemoveError, leadLine, setLeadLine, openFinder }) => {
  // Undo removes the leads nobody has touched and gives their month back; the toast says both numbers and offers
  // the operation the door answered, which is the only thing an undo names (E9).
  const undoRound = async (searchId) => {
    if (leadBusy || !searchId) return;
    setLeadBusy(true);
    const r = await window.__leadSearchUndo(searchId);
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "Nothing was removed")); return; }
    const d = r.data || {};
    if (!d.removed) { plFlash({ msg: <>Nothing to remove — you have worked every one of them.</> }); return; }
    plFlash({ msg: <>Removed {d.removed} · {d.credited} given back</>, ...leadUndo(r) });
  };
  /* ------------------------------------------------ a search, kept (PRD 8.10) */
  const renameSearch = async (s, name) => {
    const n = (name || "").trim();
    if (!n || leadBusy) return;
    setLeadBusy(true);
    const r = await window.__leadSearchRename(s.id, n);
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, `${s.name} was not renamed`)); return; }
    setRenaming(null);
    plFlash({ msg: <>Renamed to <b>{n}</b></> });
  };
  // Removing keeps the leads already worked, and the sentence says how many; the rail loses the row, so the view
  // goes back to all the leads rather than a search that is no longer there.
  const removeSearch = async (s) => {
    if (leadBusy) return;
    setLeadBusy(true);
    setRemoveError(null);
    const r = await window.__leadSearchRemove(s.id);
    setLeadBusy(false);
    if (!r.ok) { setRemoveError(r.message || "The search could not be removed."); return; }
    setRemoving(null);
    plFlash({ msg: <>Removed. The {r.data.kept} you contacted or are talking to are kept.</> });
    nav("clients/leads");
  };
  // The first day's business line. The courier's PUT keeps it with no items, so
  // the refresh that follows writes new suggestions from the owner's own words.
  const saveBusinessLine = async () => {
    const line = String((leadLine && leadLine.draft) || "").trim();
    if (!line) { setLeadLine((l) => ({ ...l, error: "Say what this business does." })); return; }
    setLeadLine((l) => ({ ...l, busy: true, error: null }));
    const r = await window.__leadBusinessLine(line);
    if (!r.ok) { setLeadLine((l) => ({ ...l, busy: false, error: r.message || "That could not be saved." })); return; }
    setLeadLine(null);
    plFlash({ msg: <>Saved. New suggestions from what you said.</> });
  };
  // Find new ones runs the same plan again, and only places not already in your leads count (P3).
  const findNewOnes = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    return leadAct(() => window.__leadSearchMore(dto.id, "renew", dto.plan), <>Looking for new ones. Only places not already in your leads count.</>);
  };
  // Search again, changed opens the plan card with what was asked, so the owner edits it before anything runs.
  const searchAgain = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    // The card draws the plan it is handed: without it the card drew the last strip-born plan, or nothing at all.
    openFinder({ stage: "plan", words: dto.asked, proposal: { searchId: dto.id, plan: dto.plan, purpose: "renew" }, plan: dto.plan, more: null });
  };
  const searchWordsFor = (id) => (window.__leadSearchWords ? window.__leadSearchWords(searchById(id), leads.tz) : { askedLine: "", keepsLine: "" });
  const exportHrefFor = (s) => (window.__href ? window.__href("GET leads/export", undefined, { search: s.id, list: "all", sort: "fit", dir: "asc" }) : null);
  return { undoRound, renameSearch, removeSearch, saveBusinessLine, findNewOnes, searchAgain, searchWordsFor, exportHrefFor };
};

// A lead's band photo, asked for as its row is rested on, touched or reached by Tab (leads-peek.jsx leadPhotoWarm).
// After a beat and only the last row: a pointer swept down the list passes over every row, and asking for each
// photo it crossed would be a burst Google's photo service answers with refusals.
const useLeadPhotoWarm = (leadShown) => {
  const warmRest = React.useRef(null);
  const warmLeadPhoto = (id) => {
    if (warmRest.current) clearTimeout(warmRest.current);
    warmRest.current = setTimeout(() => {
      warmRest.current = null;
      const r = window.leadPhotoWarm ? leadShown.find((x) => x.id === id) : null;
      if (r && r.tile) window.leadPhotoWarm(r.tile.band);
    }, 120);
  };
  React.useEffect(() => () => { if (warmRest.current) clearTimeout(warmRest.current); }, []);
  return warmLeadPhoto;
};

// Where the rail's rows and the view's own controls go: the address of the view with one thing changed.
const leadRailRoutes = ({ leadView, nav, searchById }) => {
  const goto = (patch) => nav(window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, ...patch }));
  // Where a rail row's press goes (railToggle: one row at a time; the picked row pressed again shows all leads). On a
  // phone the rail is a sheet, and a press opens the row and nothing else: the sheet closes on it (below), so a press
  // that went back to All leads would close the sheet on a page the owner did not ask for (Ruben, 25 Sep).
  const pickListRoute = (id, open = false) => window.__leadsRouteOf({ searchId: null, list: (open ? id : railToggle(leadView.searchId ? null : leadView.list, id)) || "all", cls: null });
  // A search waiting on its question opens on the places the question is about (a question is only ever asked about
  // places left out); its counted view is empty while it waits.
  const waitsOn = (id) => {
    const s = id ? searchById(id) : null;
    return !!(s && s.round && s.round.state === "waiting_on_owner");
  };
  const pickSearchRoute = (id, open = false) => {
    const to = open ? id : railToggle(leadView.searchId, id);
    return window.__leadsRouteOf({ searchId: to, list: "all", cls: to && waitsOn(to) ? "excluded" : null });
  };
  return { goto, pickListRoute, waitsOn, pickSearchRoute };
};

// What each strip control does (Task 10 step 6). Every act goes out through its route; the six that would
// make a new round open the plan card instead, because nothing that counts against the month may start
// without the owner approving what runs.
const leadStripActs = ({ openSearch, leadAct, answerOf, openPlanFor, goto, undoRound, setSortBy, setSortDir, openFinder }) => {
  // The strip's view model: contracts' where contracts has it (Task 10 step 7a puts `leadStrip` in the
  // derivations bag), and until then the page's own file, published beside the component that draws it.
  const ldStrip = (window.__LEAD_VM && window.__LEAD_VM.leadStrip) || window.leadStrip;
  // "12 new": the view read again in its order. The strip's door and the list head's are this one.
  const takeOffered = () => window.__leadsTakeOffered && window.__leadsTakeOffered();
  const onStripAction = (id, arg) => {
    const s = openSearch;
    if (!s) return;
    if (id === "stop") return leadAct(() => window.__leadSearchStop(s.id), <>Stopping. The emails of what was found are still being checked.</>);
    if (id === "keep") return leadAct(() => window.__leadSearchAnswer(s.id, "keep"), <>Carrying on.</>);
    if (id === "stop_here") return leadAct(() => window.__leadSearchAnswer(s.id, "stop"), <>Stopped. The ones already found are yours.</>);
    // The no that changes the search: the plan panel opens its answer row under the question, empty; what comes
    // back from Ask is a card that amends this search, and approving it commits through Ask's door, which answers
    // the round; it never starts a second search.
    if (id === "change") {
      openFinder({ stage: "compose", words: "", proposal: null, plan: null, more: { searchId: s.id, purpose: "topup", ...answerOf(s) } });
      return undefined;
    }
    // Include takes the thing it asked about back out of the plan, which planVersionOf makes a new version of:
    // the plan goes as the owner approved it; the route sets the version and the count the round reserved (G1).
    if (id === "include") {
      const V = window.__LEAD_VM || {};
      const plan = V.planVersionOf ? V.planVersionOf(s.plan, { exclusions: s.plan.exclusions.filter((x) => x.key !== arg) }) : s.plan;
      return openPlanFor(s, plan, "answer");
    }
    if (id === "excluded" || id === "review") return goto({ cls: arg });
    if ((window.LEAD_ROUND_MAKERS || []).indexOf(id) >= 0) return openPlanFor(s, arg && arg.version ? arg : s.plan, "more");
    if (id === "undo") return undoRound(arg && arg.searchId);
    // Sort by fit is a new read of the same view, not a re-order of the rows on the page: the sort is the
    // page's own state and the effect above asks the surface for it (E8).
    if (id === "sort_fit") { setSortBy("fit"); setSortDir("asc"); return undefined; }
    if (id === "take_offered") return takeOffered();
    return undefined;
  };
  return { ldStrip, takeOffered, onStripAction };
};

const LeadsReal = ({ onOpenProfile = () => {}, leadsRoute = null, onNavigate = null }) => {
  // The workspace's copy of every view rides with the People surface (usePlControls), and so do the first day's
  // facts about the calendar and the people.
  const people = usePeople();
  const leads = useLeads();
  const nav = onNavigate || ((to) => window.CHANLY.nav(to));
  const { leadView, viewRoute, addrPeek, leadList } = leadsViewAt(leadsRoute);
  const hasCenter = leads.searches.some((s) => s.plan && s.plan.area && !!s.plan.area.center);
  // The columns this scope draws with: the Leads scope's (LEAD_COLUMNS, leads-cells.jsx).
  const controls = usePlControls({ scope: "leads", cols: LEAD_COLUMNS, phoneCols: LEAD_PHONE_COLUMNS, colCtx: { hasCenter }, people, sortFirst: { by: "fit", dir: "asc" }, railRow: leadList });
  const { phone, bulkSheet, setBulkSheet, canExport, plFlash, setSel, setAllMatching, sortBy, setSortBy, sortDir, setSortDir, columns, q } = controls;
  const st = useLeadsState();
  const { listsOpen, peekId, setPeekId, finder, closeFinder, peekMode, setPeekMode, armed, setArmed, values, lightboxId, setLightboxId, chip, setChip, fitChip, setFitChip, setBenchGroup, mapOpen, setMapOpen, setMapPick, setBulkWhy } = st;
  const { leadsMoreBusy, leadsMore } = useLeadsRead({ leadView, viewRoute, sortBy, sortDir, plFlash });
  const { leadShown, filtered, shownIds, viewLanded } = useLeadRows({ leads, q, chip, fitChip, leadView, viewRoute, sortBy, sortDir });
  // Each view keeps its place by the address's view (viewRoute), its map with it. A view opened after the first starts
  // with none of the last one's filters.
  const { cursor, setCursor, rowBudget, keysWith, toggleAll } = usePlPlace({
    controls, page: "leads", view: viewRoute, ids: shownIds, noun: "lead", landed: viewLanded, selectionOf: `${viewRoute}|${chip}`,
    extra: { map: mapOpen },
    onPlace: (p, again) => {
      setMapOpen(!!p.map);
      if (again) { setChip(null); setFitChip(null); setBenchGroup(null); setMapPick(null); setLightboxId(null); setBulkWhy(false); }
    },
  });
  const deckMove = useLeadPeek({ peekId, setPeekId, shownIds, leadShown, cursor, setCursor, peekMode, armed, setArmed });
  useLeadPeekAddress({ leadView, viewRoute, addrPeek, peekId, setPeekId, setCursor, setPeekMode, setArmed, setDraft: st.setDraft, nav });
  const acts = leadActs({ leads, leadView, plFlash, setSel, setAllMatching, ...st });
  const { canFind, callLead } = acts;
  const finderActs = leadFinderActs({ leadView, nav, plFlash, ...st });
  const { openFind } = finderActs;
  const searches = leadSearchActs({ leads, nav, plFlash, ...acts, ...st });

  // One press backs out one step: the question the peek asked, then the pane it opened, then the peek itself
  // (leadPeekEscape, leads-peek.jsx, Task 12). Esc and the peek's own close.
  const closePeek = () => leadPeekEscape({ mode: peekMode, armed, setMode: setPeekMode, setArmed, setPeekId, lightbox: lightboxId, setLightbox: setLightboxId });
  // The Leads cells' doors (see cellCtxLeads below): the latest closures, behind one context that holds still.
  const leadCellActs = React.useRef({});
  const leadCellKept = React.useRef(null);
  // What the keyboard's one listener reads (usePlPlace): Enter peeks the lead, and the Leads scope's own overlays.
  keysWith({
    open: setPeekId,
    canSelect: canFind || canExport,
    // The selection's sheet is a phone's (drawn only there): a window widened past 900px with it open holds no keys.
    sheetOpen: listsOpen || (phone && !!bulkSheet),
    closeSheet: phone && bulkSheet ? () => setBulkSheet(null) : null,
    peekOpen: !!peekId || !!lightboxId,
    // The order OUT here is the page's: the peek, the plan panel, the Columns menu, the selection.
    closePeek,
    finderOpen: finder.open,
    // Esc lets an answer go as the close button does.
    closeFinder,
    canFind,
    find: openFind,
    call: callLead,
  });

  const rail = window.__leadRail ? window.__leadRail(leads.counts, leads.searches) : { lists: [], searches: [] };
  const standing = window.__leadsStanding ? window.__leadsStanding(leads.counts, leads.searches) : { total: "", parts: [], needsYou: null };
  const openSearch = acts.searchById(leadView.searchId);
  // The band (D5): the search's whole shape, and whether its fits differ (which is when a row wears its fit).
  const band = window.__LEAD_VM && window.__LEAD_VM.leadBand ? window.__LEAD_VM.leadBand(openSearch) : null;
  // What a cell needs. The acts are this draw's closures (over the view, the busy flag), so the ref holds the
  // latest and the context hands out doors to it: the context itself changes only when a value a cell draws from
  // changes, and a memoised row is left alone otherwise.
  const warmLeadPhoto = useLeadPhotoWarm(leadShown);
  leadCellActs.current = { onWarm: warmLeadPhoto, onOpen: setPeekId, onExpand: setLightboxId, onCall: callLead, onCopy: acts.copyLead, onCopyPhone: acts.copyPhone, onLogCall: acts.logLeadCall, onKeep: acts.keepLead, onExclude: acts.excludeLead, onPutBack: acts.putBackLead };
  // Whether the Stage column is drawn: then it says each lead's state, and the name's tag does not say it again.
  const stageShown = columns.some((c) => c.key === "stage");
  const cellCtxLeads = leadCellCtxFor(leadCellActs, leadCellKept, values, !!(band && band.mixed), hasCenter, canFind, people.rows, stageShown);
  const routes = leadRailRoutes({ leadView, nav, searchById: acts.searchById });
  const strip = leadStripActs({ openSearch, ...acts, ...finderActs, ...searches, ...routes, setSortBy, setSortDir, ...st });
  const p = { ...controls, ...st, ...acts, ...finderActs, ...searches, ...routes, ...strip, people, leads, nav, onOpenProfile, leadView, leadShown, filtered, shownIds, viewLanded, cursor, setCursor, rowBudget, toggleAll, deckMove, closePeek, leadsMore, leadsMoreBusy, rail, standing, openSearch, band, cellCtxLeads };
  return <LeadsScope {...leadsListProps(p)} {...leadsBandProps(p)} {...leadsBulkProps(p)} {...leadsPeekProps(p)} {...leadsFootProps(p)} />;
};

/* ---------------------------------------------------- what LeadsScope is handed, in its order */
// The rail, the list's head and the table.
const leadsListProps = (p) => {
  const { leads, rail, listsOpen, setListsOpen, standing, leadView, openSearch, ldStrip, leadShown, rowBudget, phone, viewLanded, columns, colOptions, colsOpen, colsButton, setColsOpen, pickColumn, cellCtxLeads, sortBy, sortDir, onSort, q, setQ, searchRef, searchOpen, setSearchOpen, scrollRef, scrolledX, setScrolledX, filtered, setChip, setFitChip, goto } = p;
  // What the phone's bar says it is showing: the search that is open, or the list, and its count apart, which the
  // bar never shortens (Task 18; PeoplePhoneBar's listCount).
  const openList = rail.lists.find((l) => l.id === leadView.list);
  const railLabel = openSearch ? openSearch.name : openList ? openList.label : "All leads";
  const railCount = openSearch ? openSearch.round.counted : openList ? openList.count : null;
  return {
    surface: leads, rail, railLabel, railCount, listTitle: openList ? openList.label : "All leads",
    listsOpen, onLists: () => setListsOpen(true), onCloseLists: () => setListsOpen(false),
    standing, view: leadView, search: openSearch, strip: ldStrip ? ldStrip(openSearch, new Date(), { offered: leads.offered }) : null,
    rows: leadShown, rowBudget, phone,
    // The rows drawn are the last view's, or its last order, until the surface holds the one the address names in
    // the order asked (a view read before paints at once; one not yet read is on its way): said, not left looking
    // right and being wrong.
    loading: !viewLanded,
    total: leads.counts[leadView.list] ?? leads.counts.all,
    columns, colOptions, colsOpen, colsButton, onColsOpen: setColsOpen, onPickColumn: pickColumn, cellCtx: cellCtxLeads,
    sortBy, sortDir, onSort, q, onQ: setQ, searchRef, searchOpen, onSearchOpen: setSearchOpen,
    scrollRef, scrolled: scrolledX, onScrolled: setScrolledX, filtered,
    onClearFilters: () => { setQ(""); setChip(null); setFitChip(null); goto({ list: "all", cls: null }); },
  };
};

// The band, the map, the bench and the list's empty state.
const leadsBandProps = (p) => {
  const { band, mapOpen, setMapOpen, leadShown, mapPick, setMapPick, openSearch, onStripAction, leadView, leads, benchGroup, setBenchGroup, fitChip, setFitChip, values, setValues, waitsOn, canFind, openFind } = p;
  return {
    band,
    // Needs review, as a workbench (D5): the groups are contracts', the pile is the rows this view loaded, and
    // the month is the surface's, so what a press costs is a number the owner can see.
    // The same leads, on the ground (D5): the plot is contracts', from the points the door returned and the
    // area the search asked for. A view whose leads the source placed nowhere has no map to draw.
    mapOpen, onMap: setMapOpen,
    // The phone's bar shows the map's pin only where the rows the source placed give it something to draw.
    canMap: leadShown.some((l) => !!l.point),
    mapPick, onMapPick: setMapPick,
    plot: mapOpen && window.__LEAD_VM && window.__LEAD_VM.leadMapPlot ? window.__LEAD_VM.leadMapPlot(leadShown, (openSearch && openSearch.plan && openSearch.plan.area) || null) : null,
    onWiden: () => { if (!openSearch) return; const a = openSearch.plan.area; onStripAction("nearby", { ...openSearch.plan, area: { ...a, radius_m: Math.min(60000, Math.round((a.radius_m || 8000) * 2)) } }); },
    benchGroups: leadView.cls === "review" && window.__LEAD_VM && window.__LEAD_VM.leadReviewGroups ? window.__LEAD_VM.leadReviewGroups(leads.rows, openSearch) : [],
    benchGroup, onBenchGroup: setBenchGroup, month: leads.month,
    onNearby: (area) => onStripAction("nearby", { ...openSearch.plan, area }),
    fit: fitChip, onPickFit: setFitChip, values,
    onValues: (v) => { setValues(v); try { if (window.localStorage) window.localStorage.setItem("leads.values", v ? "1" : "0"); } catch (e) { /* a private window: the choice lives for the page */ } },
    empty: leadView.cls === "review"
      ? { title: "Nothing needs a look.", body: "Every lead here has been checked or decided.", action: null }
      : !leadView.cls && waitsOn(leadView.searchId)
      ? { title: "Nothing is counted yet.", body: "It is waiting for your answer above.", action: null }
      : { title: "No leads in this view yet.", body: "Describe the businesses you want and Claude finds them.", action: canFind ? { label: "Find leads", onClick: openFind } : null },
  };
};

// The selection and its bulk bar, and the rail's doors.
const leadsBulkProps = (p) => {
  const { sel, toggleSel, toggleAll, clearSelection, setSel, setAllMatching, leads, openSearch, leadSaid, leadAct, leadView, allMatching, sortBy, sortDir, leadBusy, bulkLeads, bulkWhy, setBulkWhy, phone, bulkSheet, setBulkSheet, bulkNotAFit, copyEmails, cursor, setCursor, canFind, canExport, nav, people, setChip, pickListRoute, pickSearchRoute, setListsOpen, goto, chip, exportHrefFor, searchWordsFor } = p;
  return {
    sel, onToggle: toggleSel, onToggleAll: toggleAll, onClearSel: clearSelection,
    onSelectIds: (ids) => { setSel(new Set(ids)); setAllMatching(false); },
    // Needs review's resolvers (D3). Keep and Exclude go through the bulk door (00145), which takes the member's
    // own door once per lead; Check again through its own, and only where its courier exists, so the bar never
    // offers what no door can do.
    review: {
      actsFor: (ids) => {
        const V = window.__LEAD_VM || {};
        const groups = V.leadReviewGroups ? V.leadReviewGroups(leads.rows.filter((l) => ids.indexOf(l.id) >= 0), openSearch) : [];
        return [...new Set(groups.flatMap((g) => g.acts))];
      },
      canCheckAgain: typeof window.__leadCheckAgain === "function",
      onCheckAgain: (ids) => window.__leadCheckAgain && leadSaid(() => window.__leadCheckAgain(ids)),
      onKeep: (ids) => leadSaid(() => window.__leadsBulk({ by: "ids", action: "keep", ids, ...(leadView.searchId ? { search_id: leadView.searchId } : {}) })),
      onExclude: (ids) => leadSaid(() => window.__leadsBulk({ by: "ids", action: "exclude", ids, ...(leadView.searchId ? { search_id: leadView.searchId } : {}) })),
    },
    allMatching, onSelectAllMatching: () => setAllMatching(true),
    bulkView: { list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir },
    bulkBusy: leadBusy, onBulk: bulkLeads, bulkWhy, onBulkWhy: setBulkWhy, bulkSheet: phone ? bulkSheet : null, onBulkSheet: setBulkSheet,
    onBulkNotAFit: bulkNotAFit, onCopyEmails: copyEmails, cursor, onCursor: setCursor, canFind, canExport,
    exportHref: window.__href ? window.__href("GET leads/export", undefined, { list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir }) : null,
    onScope: (to) => nav(plScopeRoute(to)),
    // The Pipeline is in the switch where deals are on (0008): People's surface says so, and it lands after Leads' on a
    // cold load of Leads, when the switch gains its third tab.
    dealsOn: !!people.dealsOn,
    // The rail picks as People's does (railToggle): a list or a search, one at a time. A list pressed while a
    // search was open used to keep the search and narrow inside it, and the rail lit neither; a search picked
    // kept the list, and showed fewer of its leads than its count said. The class and the chip start over.
    // On a phone the press is in the Lists sheet: it opens the row and the sheet closes, so the page it opened is
    // what the owner sees next. It stood open over the page, and a second press on the row took them back out.
    onPickList: (id) => { setChip(null); nav(pickListRoute(id, phone)); if (phone) setListsOpen(false); },
    onPickSearch: (id) => { setChip(null); nav(pickSearchRoute(id, phone)); if (phone) setListsOpen(false); },
    // The row under the pointer reads its view ahead of the press (the surface holds it; leads.ts warmLeadsView).
    onWarmList: (id) => window.__leadsWarm && window.__leadsWarm(pickListRoute(id)),
    onWarmSearch: (id) => window.__leadsWarm && window.__leadsWarm(pickSearchRoute(id)),
    onPickClass: (cls) => { setChip(null); goto({ cls }); },
    chip, onPickChip: setChip,
    onNeedsYou: (id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: "excluded" })),
    exportHrefFor, searchWordsFor,
  };
};

// A kept search's acts, the plan panel, and the peek.
const leadsPeekProps = (p) => {
  const { renaming, setRenaming, renameSearch, removing, setRemoveError, setRemoving, undoRound, removeSearch, leadBusy, removeError, findNewOnes, searchAgain, openFind, finder, setFinder, closeFinder, finderAnswer, finderApprove, peekId, shownIds, deckMove, closePeek, peekMode, setPeekMode, armed, setArmed, draft, setDraft, phone, leadShown, sel, toggleSel, setPeekId, onOpenProfile, plFlash, lightboxId, setLightboxId, callLead, keepLead, excludeLead, putBackLead, copyLead, copyPhone, logLeadCall } = p;
  return {
    renaming, onRename: setRenaming, onRenameSave: renameSearch, onRenameCancel: () => setRenaming(null),
    removing, onRemoveAsk: (s) => { setRemoveError(null); setRemoving(s); }, onUndo: (s) => undoRound(s.id), onRemoveYes: removeSearch,
    onRemoveNo: () => { setRemoving(null); setRemoveError(null); }, removeBusy: leadBusy, removeError,
    onFindNewOnes: findNewOnes, onSearchAgain: searchAgain, onFind: openFind,
    finderOpen: finder.open, finderStage: finder.stage, finderWords: finder.words, finderProposal: finder.proposal, finderRefusal: finder.refusal,
    finderBusy: leadBusy, finderPlan: finder.plan, finderTrace: finder.trace, finderPick: finder.pick,
    onFinderWords: (words) => setFinder({ words }), onFinderAnswer: finderAnswer, onFinderApprove: finderApprove,
    onFinderChangePlan: (plan) => setFinder({ plan }), onFinderPick: (pick) => setFinder({ pick }),
    // Change what I asked: under a question it is the answer row; on a plan born from the strip it is Ask, with
    // what the search asked for in the field (the panel composes nothing, spec F5).
    onFinderBack: () => {
      if (finder.more && finder.more.answer) { setFinder({ stage: "compose" }); return; }
      closeFinder();
      openFind(finder.words);
    },
    onCloseFinder: closeFinder,
    finderAnswering: finder.more && finder.more.answer ? finder.more : null,
    peek: peekId && window.__leadPeekVM ? window.__leadPeekVM(peekId) : null,
    // Where this lead sits in the pile, and the two ways through it (D5). Moving the deck moves the page's own
    // cursor as J and K do, so the rows behind the peek move with it.
    deck: peekId && shownIds.indexOf(peekId) >= 0
      ? { at: shownIds.indexOf(peekId) + 1, of: shownIds.length, onPrev: () => deckMove(-1), onNext: () => deckMove(1) }
      : null,
    peekMode, onPeekMode: setPeekMode, armed, onArmed: setArmed, draft, onDraftState: setDraft,
    // On a phone, while anyone is selected a tap on a row selects it, as on People (the face is the checkbox).
    onPeek: phone && leadShown.some((l) => sel.has(l.id)) ? toggleSel : setPeekId,
    onPeekId: setPeekId, onOpenPerson: onOpenProfile, flash: plFlash,
    onClosePeek: closePeek,
    onExpandPhoto: setLightboxId,
    lightbox: lightboxId && window.__leadPeekVM ? window.__leadPeekVM(lightboxId) : null,
    onCloseLightbox: () => setLightboxId(null),
    onCall: callLead, onKeep: keepLead, onExclude: excludeLead, onPutBack: putBackLead, onCopy: copyLead, onCopyPhone: copyPhone, onLogCall: logLeadCall,
  };
};

// The strip, the next page, and the first day.
const leadsFootProps = (p) => {
  const { onStripAction, takeOffered, leadsMore, leadsMoreBusy, leads, people, leadLine, setLeadLine, saveBusinessLine, nav, toastNode } = p;
  return {
    onStripAction, onTakeOffered: takeOffered, onMore: leadsMore, loadingMore: leadsMoreBusy,
    firstDay: leads.searches.length === 0 && !leads.readFailed,
    // The three ways claim only what THIS tab has read: the line is the setup
    // surface's, which this route does not load on a cold open, so it is passed
    // only when the owner came from Setup in this tab (Task 17, decision 2).
    ways: window.__leadWays ? window.__leadWays({
      voice: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.voice : null,
      whatsapp: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.whatsapp : null,
      calendar: (people.calendar && people.calendar.state) || "none",
      people: (people.aggregates && people.aggregates.total) || 0,
    }) : [],
    lineOpen: !!leadLine, lineDraft: leadLine ? leadLine.draft : "", lineError: leadLine ? leadLine.error : null, lineBusy: !!(leadLine && leadLine.busy),
    onOpenLine: () => setLeadLine({ draft: leads.suggestions ? leads.suggestions.business_line : "", error: null, busy: false }),
    onLineDraft: (draft) => setLeadLine((l) => ({ ...l, draft, error: null })),
    onSaveLine: saveBusinessLine, onCancelLine: () => setLeadLine(null),
    onGo: (to) => nav(to),
    onBusinessLine: (line) => window.__leadBusinessLine && window.__leadBusinessLine(line),
    toastNode,
  };
};

Object.assign(window, { LeadsReal });
